# HANDOFF PROMPT — Sovereign Liquid Dashboard V2 Bilingual Localization

> Paste everything below (from "MISSION" onward) to the agent that will finish this task.
> It is self-contained. Do NOT touch the backend, Docker configs, or any AI/security code — **frontend text only**.

---

## MISSION

Make the Liquid Dashboard V2 **100% bilingual** with zero hardcoded strings. Every visible text must come from `t("key")`. English mode → 100% English. Arabic mode → 100% Arabic (RTL). No mixed languages, no leaks.

Scope = these files only:

```
frontend/src/locales/en.json           (add ~90 keys under "dashboard")
frontend/src/locales/ar.json           (add the SAME keys, Arabic values — 1:1 parity)
frontend/src/components/dashboard/LiquidDashboard.tsx
frontend/src/components/dashboard/WidgetMarketplaceModal.tsx
frontend/src/components/dashboard/widgets/AIOrchestratorWidget.tsx
frontend/src/components/dashboard/widgets/HRPulseWidget.tsx
frontend/src/components/dashboard/widgets/SecurityAuditWidget.tsx
frontend/src/components/dashboard/widgets/WorkflowsWidget.tsx
frontend/src/components/dashboard/widgets/QuickConnectWidget.tsx
frontend/src/components/dashboard/widgets/GlobalBranchesWidget.tsx
frontend/src/components/dashboard/widgets/KnowledgeVaultWidget.tsx
frontend/src/components/dashboard/widgets/TasksWidget.tsx
frontend/src/components/dashboard/widgets/CRMDealsWidget.tsx
frontend/src/components/dashboard/widgets/FinanceKPIsWidget.tsx
```

## HOW i18n WORKS IN THIS REPO (do not invent a new system)

- Hook: `import { useLocalization } from "@/contexts/LocalizationContext";` then `const { t, isRtl } = useLocalization();`
- Usage: `t("dashboard.widgets.ai.title")`. A 2nd arg is a fallback: `t("dashboard.widgets.ai.title", "AI Sovereign Sidecar")`.
- Keys live in `src/locales/en.json` and `src/locales/ar.json` under a nested object. **A key MUST exist in BOTH files** or the other language breaks (this is the #1 mistake — enforce 1:1 parity).
- RTL: use logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`, `insetInlineStart`). Never `ml-/mr-/left/right` for directional layout. Icons that imply direction (arrows/chevrons) mirror with `rtl:rotate-180` or `isRtl` conditionals.

## STEP 1 — Add these keys to BOTH json files (under the top-level `"dashboard"` object)

### `en.json` → merge into `"dashboard"`:
```json
{
  "customizeGrid": "Customize Grid",
  "addWidget": "Add Widget",
  "doneEditing": "Exit Edit Mode",
  "flipConfigure": "Flip / Configure Card",
  "configureWidget": "Widget Configuration",
  "gridSize": "Card Width & Grid Span",
  "saveFlipBack": "Save & Flip Back",
  "dragToMove": "Drag to move",
  "marketplace": {
    "title": "Widget Marketplace", "subtitle": "Add sovereign widgets to your dashboard",
    "searchPlaceholder": "Search widgets…", "all": "All", "aiAutomation": "AI & Automation",
    "financeHr": "Finance & HR", "salesCrm": "Sales & CRM", "itSecurity": "IT & Security",
    "added": "Added", "add": "Add", "remove": "Remove"
  },
  "catalog": {
    "ai": { "name": "AI Sovereign Sidecar", "description": "Command the AI orchestrator and monitor token usage" },
    "finance": { "name": "Finance Treasury", "description": "Track net cashflow and pending invoices" },
    "tasks": { "name": "Tasks Overview", "description": "Your tasks by status and priority" },
    "hr": { "name": "HR & Attendance Pulse", "description": "On-site, remote, and on-leave headcount" },
    "crm": { "name": "CRM Deals", "description": "Pipeline stages and top deals" },
    "security": { "name": "Security Audit", "description": "System status and failed logins" },
    "workflows": { "name": "Workflows", "description": "Active automations and last run" },
    "huddles": { "name": "Huddles", "description": "Active rooms and participants" },
    "branches": { "name": "Global Branches", "description": "Office nodes and their status" },
    "knowledge": { "name": "Knowledge Vault", "description": "Search SOPs and documents" }
  },
  "widgets": {
    "ai": { "title": "AI Sovereign Sidecar", "systemStatus": "System Status", "promptPlaceholder": "Ask the orchestrator…", "execute": "Execute", "tokenUsage": "Token Usage" },
    "hr": { "title": "HR & Attendance", "onSite": "On-site", "remote": "Remote", "onLeave": "On leave", "pendingRequest": "Pending request", "approveBtn": "Approve" },
    "security": { "title": "Security Audit", "systemNormal": "All systems normal", "saifShield": "SAIF Shield", "auditLog": "Audit Log", "failedLogins": "Failed logins" },
    "workflows": { "title": "Workflows", "activeCount": "Active", "runNow": "Run now", "triggering": "Triggering…", "lastRun": "Last run" },
    "huddles": { "title": "Huddles", "activeRooms": "Active rooms", "join": "Join", "leave": "Leave", "participants": "Participants" },
    "branches": { "title": "Global Branches", "nodes": "Nodes", "open": "Open", "standby": "Standby", "libyaHq": "Libya HQ", "dubaiHub": "Dubai Hub", "londonOffice": "London Office", "newYorkNode": "New York Node" },
    "knowledge": { "title": "Knowledge Vault", "sops": "SOPs", "search": "Search", "previewing": "Previewing", "close": "Close" },
    "tasks": { "all": "All", "pending": "Pending", "completed": "Completed", "empty": "No tasks", "critical": "Critical", "high": "High", "normal": "Normal" },
    "crm": { "stages": "Stages", "topDeals": "Top Deals", "addLead": "Add Lead", "leads": "Leads", "qualified": "Qualified", "negotiation": "Negotiation", "closing": "Closing" },
    "finance": { "treasury": "Treasury", "netCashflow": "Net Cashflow", "pendingInvoice": "Pending Invoice", "approveNow": "Approve now", "invoiceApproved": "Invoice approved" }
  }
}
```

### `ar.json` → merge into `"dashboard"` (SAME KEYS, Arabic values):
```json
{
  "customizeGrid": "تخصيص الشبكة",
  "addWidget": "إضافة بطاقة",
  "doneEditing": "إنهاء التعديل",
  "flipConfigure": "قلب وضبط البطاقة",
  "configureWidget": "إعدادات البطاقة",
  "gridSize": "عرض البطاقة ومقاس الشبكة",
  "saveFlipBack": "حفظ والعودة",
  "dragToMove": "اسحب لتحريك البطاقة",
  "marketplace": {
    "title": "متجر البطاقات", "subtitle": "أضف بطاقات سيادية إلى لوحتك",
    "searchPlaceholder": "ابحث عن بطاقة…", "all": "الكل", "aiAutomation": "الذكاء والأتمتة",
    "financeHr": "المالية والموارد البشرية", "salesCrm": "المبيعات وعلاقات العملاء", "itSecurity": "تقنية المعلومات والأمن",
    "added": "مُضافة", "add": "إضافة", "remove": "إزالة"
  },
  "catalog": {
    "ai": { "name": "المساعد السيادي الذكي", "description": "تحكّم بمنسّق الذكاء الاصطناعي وراقب استهلاك التوكنز" },
    "finance": { "name": "خزينة المالية", "description": "تابع صافي التدفق النقدي والفواتير المعلّقة" },
    "tasks": { "name": "نظرة عامة على المهام", "description": "مهامك حسب الحالة والأولوية" },
    "hr": { "name": "نبض الموارد البشرية والحضور", "description": "الحاضرون في الموقع وعن بُعد والإجازات" },
    "crm": { "name": "صفقات العملاء", "description": "مراحل المبيعات وأبرز الصفقات" },
    "security": { "name": "التدقيق الأمني", "description": "حالة النظام ومحاولات الدخول الفاشلة" },
    "workflows": { "name": "مسارات العمل", "description": "الأتمتة النشطة وآخر تشغيل" },
    "huddles": { "name": "الغرف الصوتية", "description": "الغرف النشطة والمشاركون" },
    "branches": { "name": "الفروع العالمية", "description": "عقد المكاتب وحالتها" },
    "knowledge": { "name": "خزنة المعرفة", "description": "ابحث في السياسات والمستندات" }
  },
  "widgets": {
    "ai": { "title": "المساعد السيادي الذكي", "systemStatus": "حالة النظام", "promptPlaceholder": "اسأل المنسّق…", "execute": "تنفيذ", "tokenUsage": "استهلاك التوكنز" },
    "hr": { "title": "الموارد البشرية والحضور", "onSite": "في الموقع", "remote": "عن بُعد", "onLeave": "في إجازة", "pendingRequest": "طلب معلّق", "approveBtn": "موافقة" },
    "security": { "title": "التدقيق الأمني", "systemNormal": "جميع الأنظمة طبيعية", "saifShield": "درع سيف", "auditLog": "سجل التدقيق", "failedLogins": "محاولات دخول فاشلة" },
    "workflows": { "title": "مسارات العمل", "activeCount": "نشطة", "runNow": "تشغيل الآن", "triggering": "جارٍ التشغيل…", "lastRun": "آخر تشغيل" },
    "huddles": { "title": "الغرف الصوتية", "activeRooms": "غرف نشطة", "join": "انضمام", "leave": "مغادرة", "participants": "المشاركون" },
    "branches": { "title": "الفروع العالمية", "nodes": "العُقد", "open": "مفتوح", "standby": "احتياطي", "libyaHq": "المقر الرئيسي - ليبيا", "dubaiHub": "مركز دبي", "londonOffice": "مكتب لندن", "newYorkNode": "عقدة نيويورك" },
    "knowledge": { "title": "خزنة المعرفة", "sops": "إجراءات التشغيل", "search": "بحث", "previewing": "معاينة", "close": "إغلاق" },
    "tasks": { "all": "الكل", "pending": "قيد الانتظار", "completed": "مكتملة", "empty": "لا توجد مهام", "critical": "حرجة", "high": "عالية", "normal": "عادية" },
    "crm": { "stages": "المراحل", "topDeals": "أبرز الصفقات", "addLead": "إضافة عميل محتمل", "leads": "عملاء محتملون", "qualified": "مؤهّل", "negotiation": "تفاوض", "closing": "إغلاق" },
    "finance": { "treasury": "الخزينة", "netCashflow": "صافي التدفق النقدي", "pendingInvoice": "فاتورة معلّقة", "approveNow": "وافق الآن", "invoiceApproved": "تمت الموافقة على الفاتورة" }
  }
}
```

> If a `"dashboard"` object already exists in the json, **merge** these keys into it — do not overwrite existing keys. Keep valid JSON (commas!).

## STEP 2 — Wire every component to `t()`

For EACH file listed: add `const { t } = useLocalization();` (and `isRtl` if you need RTL logic), then replace **every** hardcoded visible string / label / placeholder / tooltip / status badge / category tab / mock sample label / toast with the matching `t("dashboard.…")` key above.

- **LiquidDashboard.tsx**:
  - In `availableWidgets`, set each widget's `name = t("dashboard.catalog.<id>.name")` and `description = t("dashboard.catalog.<id>.description")`.
  - Grid control buttons → `t("dashboard.customizeGrid")`, `t("dashboard.addWidget")`, `t("dashboard.doneEditing")`, `t("dashboard.flipConfigure")`, `t("dashboard.configureWidget")`, `t("dashboard.gridSize")`, `t("dashboard.saveFlipBack")`, `t("dashboard.dragToMove")`.
  - **Set the default layout** to exactly: `const DEFAULT_LAYOUT = ["ai", "tasks", "finance", "hr", "crm"];`
  - Grid spans (recommended default): `ai` and `finance` = `col-span-1 md:col-span-2` (2×1); `tasks`, `hr`, `crm` = `col-span-1` (1×1). Apply these as the default span for those ids when no saved layout exists.
- **WidgetMarketplaceModal.tsx**: title/subtitle/search placeholder/category tabs (All, AI & Automation, Finance & HR, Sales & CRM, IT & Security)/Add·Added·Remove button states → `t("dashboard.marketplace.*")`.
- **Each widget** (`AIOrchestratorWidget`, `HRPulseWidget`, `SecurityAuditWidget`, `WorkflowsWidget`, `QuickConnectWidget`→huddles, `GlobalBranchesWidget`→branches, `KnowledgeVaultWidget`→knowledge, `TasksWidget`, `CRMDealsWidget`, `FinanceKPIsWidget`): replace its title and all inner labels/badges/buttons with the matching `t("dashboard.widgets.<id>.*")` keys.

**Rules:** keep the fallback (2nd arg) equal to the English value. Do NOT change any logic, data fetching, props, or styling beyond swapping text and fixing directional CSS to logical properties. Do NOT edit backend or Docker.

## STEP 3 — Verify (mandatory)

```bash
# 1) Type + key integrity
cd "/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend" && npx tsc --noEmit
# expect: 0 errors

# 2) JSON parity check (both files must have identical key sets)
cd "/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/locales" && \
python3 -c "import json;a=json.load(open('en.json'))['dashboard'];b=json.load(open('ar.json'))['dashboard'];\
import itertools;\
def keys(d,p=''):\
 out=[];\
 [out.extend(keys(v,p+k+'.') if isinstance(v,dict) else [p+k]) for k,v in d.items()];\
 return out;\
ea,ab=set(keys(a)),set(keys(b));\
print('EN-only:',ea-ab);print('AR-only:',ab-ea);print('PARITY OK' if ea==ab else 'PARITY FAIL')"

# 3) Rebuild frontend container (project rule)
cd "/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os" && docker compose up -d --build frontend
```

## DEFINITION OF DONE (acceptance)

- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] JSON parity check prints `PARITY OK` (no EN-only / AR-only keys).
- [ ] Grep finds NO remaining hardcoded English/Arabic literals in the 13 files (search each file for quoted text in JSX; every one is now `t(...)`).
- [ ] Frontend container rebuilds and serves.
- [ ] Manual: toggle to English → all 13 surfaces are pure English LTR. Toggle to Arabic → pure Arabic RTL, correctly aligned, direction-icons mirrored.
- [ ] First-visit / cleared `localStorage` → dashboard shows the layout `ai(2×1), tasks(1×1), finance(2×1), hr(1×1), crm(1×1)`.

## GUARDRAILS (for the executing agent)

- Frontend text ONLY. Do not modify: any `.go` file, `ai-sidecar/*`, `docker-compose.yml`, auth, or AI logic.
- Never overwrite an existing locale key; merge.
- Keep JSON valid (trailing-comma errors are the most common break — run the parity script, it also validates JSON).
- If a string already uses `t(...)`, leave it.
- Small, verifiable steps: after editing the two json files, run the parity script before touching components.
