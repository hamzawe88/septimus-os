package services

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
)

// ── Feature catalog (gate-able capabilities) ─────────────────────────────────
const (
	FeatChat            = "chat"
	FeatPMKanban        = "pm.kanban"
	FeatHRAttendance    = "hr.attendance"
	FeatCRMDeals        = "crm.deals"
	FeatFinanceInvoices = "finance.invoices"
	FeatCorrespondence  = "correspondence"
	FeatAIChat          = "ai.chat"
	FeatAIAgents        = "ai.agents"
	FeatRAG             = "rag"
	FeatWorkflows       = "workflows"
	FeatIntegrations    = "integrations"
	FeatReportsAI       = "reports.ai"
	FeatFinanceForecast = "reports.finance_forecast"
	FeatRealtimeVoice   = "realtime.voice"
	FeatPublicAPI       = "api.public"
	FeatMCP             = "mcp"
)

// AllFeatureKeys is the ordered catalog surfaced to the admin plan editor.
var AllFeatureKeys = []string{
	FeatChat, FeatPMKanban, FeatHRAttendance,
	FeatCRMDeals, FeatFinanceInvoices, FeatCorrespondence,
	FeatAIChat, FeatAIAgents, FeatRAG, FeatWorkflows, FeatIntegrations,
	FeatReportsAI, FeatFinanceForecast, FeatRealtimeVoice, FeatPublicAPI, FeatMCP,
}

// ── Limit catalog (per-resource caps; -1 = unlimited) ────────────────────────
const (
	LimUsers         = "users"
	LimProjects      = "projects"
	LimStorageGB     = "storage_gb"
	LimAITokensMonth = "ai_tokens_month"
	LimIntegrations  = "integrations"
	LimWorkflows     = "workflows"
)

var AllLimitKeys = []string{
	LimUsers, LimProjects, LimStorageGB, LimAITokensMonth, LimIntegrations, LimWorkflows,
}

// Unlimited sentinel for limit values.
const Unlimited int64 = -1

// ── Default entitlement matrix (source of truth until a plan overrides) ──────
// Each tier inherits nothing implicitly — list the full set so the matrix is
// auditable in one place.
var defaultTierFeatures = map[string]map[string]bool{
	"free": {
		FeatChat: true, FeatPMKanban: true, FeatHRAttendance: true,
	},
	"starter": {
		FeatChat: true, FeatPMKanban: true, FeatHRAttendance: true,
		FeatCRMDeals: true, FeatFinanceInvoices: true, FeatCorrespondence: true,
	},
	"business": {
		FeatChat: true, FeatPMKanban: true, FeatHRAttendance: true,
		FeatCRMDeals: true, FeatFinanceInvoices: true, FeatCorrespondence: true,
		FeatAIChat: true, FeatAIAgents: true, FeatRAG: true,
		FeatWorkflows: true, FeatIntegrations: true,
	},
	"enterprise": {
		FeatChat: true, FeatPMKanban: true, FeatHRAttendance: true,
		FeatCRMDeals: true, FeatFinanceInvoices: true, FeatCorrespondence: true,
		FeatAIChat: true, FeatAIAgents: true, FeatRAG: true,
		FeatWorkflows: true, FeatIntegrations: true,
		FeatReportsAI: true, FeatFinanceForecast: true, FeatRealtimeVoice: true,
		FeatPublicAPI: true, FeatMCP: true,
	},
}

var defaultTierLimits = map[string]map[string]int64{
	"free":       {LimUsers: 5, LimProjects: 3, LimStorageGB: 1, LimAITokensMonth: 0, LimIntegrations: 0, LimWorkflows: 0},
	"starter":    {LimUsers: 25, LimProjects: 15, LimStorageGB: 10, LimAITokensMonth: 0, LimIntegrations: 2, LimWorkflows: 3},
	"business":   {LimUsers: 100, LimProjects: 100, LimStorageGB: 100, LimAITokensMonth: 500000, LimIntegrations: 10, LimWorkflows: 50},
	"enterprise": {LimUsers: Unlimited, LimProjects: Unlimited, LimStorageGB: 1000, LimAITokensMonth: 5000000, LimIntegrations: Unlimited, LimWorkflows: Unlimited},
}

// NormalizeTier maps blanks/unknowns to "free" and tolerates the "plan_" prefix
// that the signup/checkout flow stores (e.g. "plan_business" → "business").
func NormalizeTier(t string) string {
	s := strings.ToLower(strings.TrimSpace(t))
	s = strings.TrimPrefix(s, "plan_")
	switch s {
	case "starter":
		return "starter"
	case "business":
		return "business"
	case "enterprise":
		return "enterprise"
	default:
		return "free"
	}
}

// MinTierForFeature returns the lowest tier whose default matrix includes the
// feature — tells the user what to upgrade to. Falls back to "business".
func MinTierForFeature(featureKey string) string {
	for _, tier := range []string{"free", "starter", "business", "enterprise"} {
		if defaultTierFeatures[tier][featureKey] {
			return tier
		}
	}
	return "business"
}

// DefaultFeaturesFor / DefaultLimitsFor expose the baseline matrix (used by the
// plan seeder and the admin editor as the starting point).
func DefaultFeaturesFor(tier string) map[string]bool {
	return cloneBoolMap(defaultTierFeatures[NormalizeTier(tier)])
}

func DefaultLimitsFor(tier string) map[string]int64 {
	return cloneInt64Map(defaultTierLimits[NormalizeTier(tier)])
}

// ── Per-tier entitlement cache ───────────────────────────────────────────────
// Gates run on every request, so the plan lookup is cached per tier with a short
// TTL and invalidated explicitly whenever a plan is written (see plans_handlers).

type cachedEntitlements struct {
	features map[string]bool
	limits   map[string]int64
	expires  time.Time
}

const entitlementsCacheTTL = 60 * time.Second

var (
	entCacheMu sync.RWMutex
	entCache   = map[string]cachedEntitlements{}
)

// InvalidateEntitlementsCache clears cached plan overrides so the very next
// request sees an admin's plan edit. Called after any plan create/update/delete.
func InvalidateEntitlementsCache() {
	entCacheMu.Lock()
	entCache = map[string]cachedEntitlements{}
	entCacheMu.Unlock()
}

// resolveTier builds (and caches) the effective entitlements for a tier:
// the default matrix overlaid with the active plan's JSONB overrides.
func resolveTier(tier string) (map[string]bool, map[string]int64) {
	entCacheMu.RLock()
	if c, ok := entCache[tier]; ok && time.Now().Before(c.expires) {
		entCacheMu.RUnlock()
		return c.features, c.limits
	}
	entCacheMu.RUnlock()

	features := cloneBoolMap(defaultTierFeatures[tier])
	limits := cloneInt64Map(defaultTierLimits[tier])

	var plan models.SaaSPlan
	if err := database.DB.Where("tier_id = ? AND is_active = ?", tier, true).First(&plan).Error; err == nil {
		if len(plan.Features) > 2 { // longer than "{}"
			var f map[string]bool
			if json.Unmarshal(plan.Features, &f) == nil {
				for k, v := range f {
					features[k] = v
				}
			}
		}
		if len(plan.Limits) > 2 {
			var l map[string]int64
			if json.Unmarshal(plan.Limits, &l) == nil {
				for k, v := range l {
					limits[k] = v
				}
			}
		}
	}

	entCacheMu.Lock()
	entCache[tier] = cachedEntitlements{features: features, limits: limits, expires: time.Now().Add(entitlementsCacheTTL)}
	entCacheMu.Unlock()
	return features, limits
}

// ResolveEntitlements returns the effective features + limits for a workspace.
// Callers get copies so they can never mutate the shared cache.
func ResolveEntitlements(ws *models.Workspace) (map[string]bool, map[string]int64) {
	f, l := resolveTier(NormalizeTier(ws.Tier))
	return cloneBoolMap(f), cloneInt64Map(l)
}

// HasFeature reports whether a workspace's plan includes a feature.
func HasFeature(ws *models.Workspace, key string) bool {
	if ws == nil {
		return false
	}
	f, _ := ResolveEntitlements(ws)
	return f[key]
}

// GetLimit returns a workspace's cap for a resource (Unlimited (-1) or 0 if unset).
func GetLimit(ws *models.Workspace, resource string) int64 {
	if ws == nil {
		return 0
	}
	_, l := ResolveEntitlements(ws)
	if v, ok := l[resource]; ok {
		return v
	}
	return 0
}

// WithinLimit reports whether current usage is still under the cap.
func WithinLimit(ws *models.Workspace, resource string, current int64) bool {
	max := GetLimit(ws, resource)
	if max == Unlimited {
		return true
	}
	return current < max
}

// ── Quota warnings ───────────────────────────────────────────────────────────

// QuotaWarning flags a resource that is near or over its plan cap, so the UI can
// nudge before a create actually gets blocked by QuotaEnforcerMiddleware.
type QuotaWarning struct {
	Resource string  `json:"resource"`
	Current  int64   `json:"current"`
	Limit    int64   `json:"limit"`
	Percent  float64 `json:"percent"`
	Level    string  `json:"level"` // "approaching" (>=80%) | "exceeded" (>=100%)
}

// WarnThresholdPercent is when a resource starts warning.
const WarnThresholdPercent = 80.0

// BuildQuotaWarnings compares live usage against limits. Unlimited (-1) and
// zero-cap resources (a feature simply not sold on the plan) never warn.
func BuildQuotaWarnings(limits map[string]int64, usage map[string]int64) []QuotaWarning {
	warnings := []QuotaWarning{}
	for _, res := range AllLimitKeys {
		max, ok := limits[res]
		if !ok || max == Unlimited || max <= 0 {
			continue
		}
		cur := usage[res]
		pct := (float64(cur) / float64(max)) * 100
		level := ""
		switch {
		case cur >= max:
			level = "exceeded"
		case pct >= WarnThresholdPercent:
			level = "approaching"
		default:
			continue
		}
		warnings = append(warnings, QuotaWarning{
			Resource: res,
			Current:  cur,
			Limit:    max,
			Percent:  float64(int(pct*10)) / 10, // 1 decimal
			Level:    level,
		})
	}
	return warnings
}

func cloneBoolMap(m map[string]bool) map[string]bool {
	out := make(map[string]bool, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func cloneInt64Map(m map[string]int64) map[string]int64 {
	out := make(map[string]int64, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
