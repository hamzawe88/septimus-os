package handlers

import (
	"encoding/json"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"gorm.io/datatypes"
)

// Workspace branding — the single server-side source of truth for the company
// identity (logo, legal name, tax/CR numbers, address, contact details).
//
// This used to live only in the browser (localStorage + IndexedDB), which meant
// the logo was per-device: a second user saw nothing, and no server-rendered
// artifact — correspondence letterheads, invoices, payslips — could ever use it.
// Storing it as a workspace setting makes it tenant-wide and readable by every
// feature that must stamp the company identity onto a document.
//
// Read is open to any authenticated member of the workspace (branding is not a
// secret and every document renderer needs it); writes stay admin/owner-only.

const brandingSettingKey = "company_profile"

// brandingLogoMaxBytes caps an inlined data-URL logo. Larger images belong in
// Drive; this guard keeps a runaway upload out of the settings row.
const brandingLogoMaxBytes = 3 * 1024 * 1024

type brandingPayload struct {
	CompanyName   string `json:"company_name"`
	CompanyNameEn string `json:"company_name_en"`
	LogoURL       string `json:"logo_url"`
	TaxNumber     string `json:"tax_number"`
	CRNumber      string `json:"cr_number"`
	Address       string `json:"address"`
	AddressEn     string `json:"address_en"`
	Phone         string `json:"phone"`
	Email         string `json:"email"`
	Website       string `json:"website"`
	IBAN          string `json:"iban"`
	BankName      string `json:"bank_name"`
}

func defaultBranding() fiber.Map {
	return fiber.Map{
		"company_name": "", "company_name_en": "", "logo_url": "",
		"tax_number": "", "cr_number": "", "address": "", "address_en": "",
		"phone": "", "email": "", "website": "", "iban": "", "bank_name": "",
	}
}

// loadBranding reads the workspace branding, returning an empty-but-complete
// shape when nothing was saved yet so callers never have to nil-check fields.
func loadBranding(c *fiber.Ctx, workspaceID uuid.UUID) fiber.Map {
	out := defaultBranding()
	var setting models.WorkspaceSetting
	if err := database.GetDB(c).
		Where("workspace_id = ? AND key = ?", workspaceID, brandingSettingKey).
		First(&setting).Error; err != nil {
		return out
	}
	var stored map[string]interface{}
	if json.Unmarshal(setting.Value, &stored) == nil {
		for k, v := range stored {
			if _, known := out[k]; known {
				out[k] = v
			}
		}
	}
	return out
}

// GetWorkspaceBranding — readable by any authenticated member; document
// renderers (correspondence, invoices, payslips) depend on it.
func GetWorkspaceBranding(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	return c.JSON(fiber.Map{"data": loadBranding(c, workspaceID)})
}

// SaveWorkspaceBranding — admin/owner only (gated at the route).
func SaveWorkspaceBranding(c *fiber.Ctx) error {
	workspaceID := CurrentWorkspaceID(c)
	if workspaceID == uuid.Nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "workspace context is required"})
	}
	var p brandingPayload
	if err := c.BodyParser(&p); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	logo := strings.TrimSpace(p.LogoURL)
	if len(logo) > brandingLogoMaxBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error": "logo is too large; upload it to Drive and store the URL instead",
		})
	}
	// Only http(s) URLs or inline images — never a javascript:/data:text payload
	// that a renderer might execute when it stamps the letterhead.
	if logo != "" &&
		!strings.HasPrefix(logo, "http://") &&
		!strings.HasPrefix(logo, "https://") &&
		!strings.HasPrefix(logo, "/") &&
		!strings.HasPrefix(logo, "data:image/") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "logo_url must be an http(s) URL, an app path, or a data:image payload"})
	}

	value := fiber.Map{
		"company_name": strings.TrimSpace(p.CompanyName), "company_name_en": strings.TrimSpace(p.CompanyNameEn),
		"logo_url": logo, "tax_number": strings.TrimSpace(p.TaxNumber), "cr_number": strings.TrimSpace(p.CRNumber),
		"address": strings.TrimSpace(p.Address), "address_en": strings.TrimSpace(p.AddressEn),
		"phone": strings.TrimSpace(p.Phone), "email": strings.TrimSpace(p.Email),
		"website": strings.TrimSpace(p.Website), "iban": strings.TrimSpace(p.IBAN),
		"bank_name": strings.TrimSpace(p.BankName),
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to encode branding"})
	}

	var setting models.WorkspaceSetting
	db := database.GetDB(c)
	if err := db.Where("workspace_id = ? AND key = ?", workspaceID, brandingSettingKey).First(&setting).Error; err != nil {
		setting = models.WorkspaceSetting{WorkspaceID: workspaceID, Key: brandingSettingKey, Value: datatypes.JSON(raw)}
		if err := db.Create(&setting).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save branding"})
		}
	} else {
		setting.Value = datatypes.JSON(raw)
		if err := db.Save(&setting).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save branding"})
		}
	}
	return c.JSON(fiber.Map{"message": "Branding saved", "data": value})
}
