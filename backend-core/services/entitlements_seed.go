package services

import (
	"encoding/json"
	"log"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// SeedSaaSPlans creates the four baseline plans (free/starter/business/enterprise)
// with their default feature+limit entitlements — but only if a plan for that
// tier doesn't already exist, so it never clobbers an admin's edits. Called from
// main.go AFTER ConnectDB (kept in `services` to reuse the default matrix without
// a database→services import cycle).
func SeedSaaSPlans(db *gorm.DB) {
	seeds := []struct {
		tier, nameEn, nameAr, color string
		price                       float64
		recommended                 bool
	}{
		{"free", "Free", "مجاني", "slate", 0, false},
		{"starter", "Starter", "المبتدئ", "blue", 29, false},
		{"business", "Business", "الأعمال", "purple", 99, true},
		{"enterprise", "Enterprise", "المؤسسات", "amber", 299, false},
	}

	created := 0
	for _, s := range seeds {
		var count int64
		db.Model(&models.SaaSPlan{}).Where("tier_id = ?", s.tier).Count(&count)
		if count > 0 {
			continue // preserve admin-configured plans
		}
		featJSON, _ := json.Marshal(DefaultFeaturesFor(s.tier))
		limJSON, _ := json.Marshal(DefaultLimitsFor(s.tier))
		db.Create(&models.SaaSPlan{
			ID:          uuid.New(),
			TierID:      s.tier,
			NameEn:      s.nameEn,
			NameAr:      s.nameAr,
			Price:       s.price,
			Currency:    "USD",
			Color:       s.color,
			Recommended: s.recommended,
			Features:    datatypes.JSON(featJSON),
			Limits:      datatypes.JSON(limJSON),
			IsActive:    true,
		})
		created++
	}
	if created > 0 {
		log.Printf("Seeded %d default SaaS plans with entitlements", created)
	}
}
