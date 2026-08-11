package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/engine"
	"github.com/septimus-os/backend-core/middleware"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type SignupWorkspaceRequest struct {
	WorkspaceName string `json:"workspace_name"`
	Slug          string `json:"slug"`
	Email         string `json:"email"`
	Password      string `json:"password"`
	FullName      string `json:"full_name"`
	// Kept for backward-compatible request parsing only. The onboarding tier is
	// selected by the server and can only change after a verified billing event.
	PlanID string `json:"plan_id"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Email         string `json:"email"`
	Password      string `json:"password"`
	Role          string `json:"role"`
	WorkspaceName string `json:"workspace_name"`
}

func getJWTSecret() string {
	// main() refuses to start when JWT_SECRET is unset; no fallback here.
	return os.Getenv("JWT_SECRET")
}

const sessionCookieName = "septimus_session"
const defaultOnboardingTier = "starter"
const standardSessionTTL = 12 * time.Hour

func signupTier(_ string) string {
	// Never trust a browser-supplied plan identifier. Billing webhooks are the
	// only authority allowed to promote a workspace after signup.
	return defaultOnboardingTier
}

func devRegistrationEnabled() bool {
	return os.Getenv("APP_ENV") != "production" ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("ENABLE_DEV_REGISTRATION")), "true")
}

func validatePassword(password string) error {
	// bcrypt only accepts the first 72 bytes. Rejecting longer secrets avoids
	// silently authenticating a different password from the one the user typed.
	if len(password) < 12 || len(password) > 72 {
		return fiber.NewError(fiber.StatusBadRequest, "Password must be between 12 and 72 characters")
	}
	return nil
}

func setSessionCookie(c *fiber.Ctx, token string, ttl time.Duration) {
	secure := os.Getenv("APP_ENV") == "production"
	c.Cookie(&fiber.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Strict",
	})
}

func issueUserSession(tx *gorm.DB, user models.User, ttl time.Duration, extraClaims map[string]interface{}) (string, error) {
	now := time.Now().UTC()
	sessionID := uuid.New()
	expiresAt := now.Add(ttl)
	claims := jwt.MapClaims{
		"sub":          user.ID.String(),
		"email":        user.Email,
		"workspace_id": user.WorkspaceID.String(),
		"role":         user.Role,
		"iss":          middleware.SessionIssuer,
		"aud":          middleware.SessionAudience,
		"jti":          sessionID.String(),
		"iat":          now.Unix(),
		"nbf":          now.Add(-5 * time.Second).Unix(),
		"exp":          expiresAt.Unix(),
	}
	if user.DepartmentID != nil {
		claims["department_id"] = user.DepartmentID.String()
	}
	if user.RoleID != nil {
		claims["role_id"] = user.RoleID.String()
	}
	for key, value := range extraClaims {
		claims[key] = value
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(getJWTSecret()))
	if err != nil {
		return "", err
	}
	if err := tx.Create(&models.AuthSession{
		ID:          sessionID,
		UserID:      user.ID,
		WorkspaceID: user.WorkspaceID,
		ExpiresAt:   expiresAt,
	}).Error; err != nil {
		return "", err
	}
	return tokenString, nil
}

// GetSession returns non-sensitive identity data from the HttpOnly session.
func GetSession(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"user": fiber.Map{
			"id":                c.Locals("user_id"),
			"workspace_id":      c.Locals("workspace_id"),
			"role":              c.Locals("role"),
			"is_impersonated":   c.Locals("is_impersonated"),
			"original_admin_id": c.Locals("original_admin_id"),
		},
	})
}

// GetInternalSession returns the identity already validated by JWTMiddleware.
// It is mounted below both the internal service-token guard and the revocable
// session middleware so storage sidecars never accept a signed-but-revoked JWT.
func GetInternalSession(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"user_id":      c.Locals("user_id"),
		"workspace_id": c.Locals("workspace_id"),
	})
}

// GetRealtimeToken mints a short-lived JWT for Yjs/Hocuspocus. It is returned
// only after the browser proved possession of the HttpOnly session cookie, and
// is deliberately never persisted in localStorage or a JavaScript cookie.
func GetRealtimeToken(c *fiber.Ctx) error {
	claims := jwt.MapClaims{
		"sub":          c.Locals("user_id"),
		"workspace_id": c.Locals("workspace_id"),
		"role":         c.Locals("role"),
		"exp":          time.Now().Add(5 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(getJWTSecret()))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate realtime token"})
	}
	return c.JSON(fiber.Map{"token": tokenString})
}

// Logout clears the HttpOnly session cookie. It is intentionally idempotent.
func Logout(c *fiber.Ctx) error {
	if sessionID := database.ParseUUID(fmt.Sprintf("%v", c.Locals("session_id"))); sessionID != uuid.Nil && database.DB != nil {
		now := time.Now().UTC()
		_ = database.DB.Model(&models.AuthSession{}).
			Where("id = ? AND revoked_at IS NULL", sessionID).
			Update("revoked_at", &now).Error
	}
	c.Cookie(&fiber.Cookie{Name: sessionCookieName, Value: "", Path: "/", MaxAge: -1, HTTPOnly: true, Secure: os.Getenv("APP_ENV") == "production", SameSite: "Strict"})
	return c.SendStatus(fiber.StatusNoContent)
}

// Login handles user authentication and creates an HttpOnly session cookie.
func Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if err := database.GetDB(c).Where("LOWER(email) = ?", req.Email).First(&user).Error; err != nil {
		services.LogEvent(nil, "auth.login.failure", "User", req.Email, map[string]string{"reason": "User not found", "email": req.Email}, c.IP())
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		services.LogEvent(&user.ID, "auth.login.failure", "User", user.ID.String(), map[string]string{"reason": "Invalid password", "email": req.Email}, c.IP())
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	tokenString, err := issueUserSession(database.GetDB(c), user, standardSessionTTL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create session"})
	}
	setSessionCookie(c, tokenString, standardSessionTTL)

	services.LogEvent(&user.ID, "auth.login.success", "User", user.ID.String(), map[string]string{"email": user.Email, "role": user.Role}, c.IP())

	return c.JSON(fiber.Map{
		"user": fiber.Map{
			"id":           user.ID,
			"email":        user.Email,
			"workspace_id": user.WorkspaceID,
			"role":         user.Role,
		},
	})
}

// Register is for dev purposes to easily create test users
func Register(c *fiber.Ctx) error {
	if !devRegistrationEnabled() {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	}

	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if err := validatePassword(req.Password); err != nil {
		return err
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Email is required"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not hash password"})
	}

	// Reject duplicate emails up front.
	var existingUser models.User
	if err := database.GetDB(c).Where("LOWER(email) = ?", req.Email).First(&existingUser).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email is already registered"})
	}

	// Each self-registration gets its OWN isolated workspace. The old code did
	// `First(&workspace)` — grabbing the first workspace in the whole DB — which
	// dropped every new registrant into an existing tenant and exposed its
	// users/data. Team members are instead added via the admin panel
	// (CreateUserAdmin) or invited into an existing workspace.
	workspace := models.Workspace{
		ID:     uuid.New(),
		Name:   req.WorkspaceName,
		Status: "active",
	}
	if workspace.Name == "" {
		workspace.Name = "Workspace"
	}
	workspace.Slug = "ws-" + workspace.ID.String()[:8]
	if err := database.GetDB(c).Create(&workspace).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create workspace"})
	}

	// The registrant owns the workspace they just created → Admin of it (scoped
	// to that workspace only, never a global admin over other tenants).
	user := models.User{
		WorkspaceID:  workspace.ID,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         "Admin",
	}

	if err := database.GetDB(c).Create(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create user"})
	}

	services.LogEvent(&user.ID, "auth.register", "User", user.ID.String(), map[string]string{"email": user.Email, "role": user.Role}, c.IP())

	// Trigger workflow
	go engine.ExecuteEvent(database.GetDB(c), user.WorkspaceID, "user.created", map[string]interface{}{
		"user_id": user.ID.String(),
		"email":   user.Email,
	})

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": "User created successfully"})
}

type UpdateProfileRequest struct {
	Password       string                 `json:"password"`
	Avatar         string                 `json:"avatar"`
	LLMPreferences map[string]interface{} `json:"llm_preferences"`
}

// UpdateProfile allows a user to update their own profile (avatar and/or password)
func UpdateProfile(c *fiber.Ctx) error {
	userIdStr, _ := c.Locals("user_id").(string)
	if userIdStr == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}

	var req UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.GetDB(c).Where("id = ?", userIdStr).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	updates := make(map[string]interface{})

	if req.Avatar != "" {
		updates["avatar"] = req.Avatar
	}

	if req.Password != "" {
		if err := validatePassword(req.Password); err != nil {
			return err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not hash password"})
		}
		updates["password_hash"] = string(hash)
		now := time.Now().UTC()
		if err := database.GetDB(c).Model(&models.AuthSession{}).
			Where("user_id = ? AND revoked_at IS NULL", user.ID).
			Update("revoked_at", &now).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not revoke existing sessions"})
		}
		c.Cookie(&fiber.Cookie{Name: sessionCookieName, Value: "", Path: "/", MaxAge: -1, HTTPOnly: true, Secure: os.Getenv("APP_ENV") == "production", SameSite: "Strict"})
	}

	if req.LLMPreferences != nil {
		var existingData map[string]interface{}
		if len(user.Data) > 0 {
			if err := json.Unmarshal(user.Data, &existingData); err != nil {
				existingData = make(map[string]interface{})
			}
		} else {
			existingData = make(map[string]interface{})
		}
		existingData["llm_preferences"] = req.LLMPreferences

		newDataBytes, err := json.Marshal(existingData)
		if err == nil {
			updates["data"] = datatypes.JSON(newDataBytes)
		}
	}

	if len(updates) > 0 {
		if err := database.GetDB(c).Model(&user).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not update profile"})
		}
	}

	return c.JSON(fiber.Map{"message": "Profile updated successfully"})
}

// SignupWorkspace handles automated B2B SaaS onboarding (creates Workspace, Owner user, Subscription, and initial departments)
func SignupWorkspace(c *fiber.Ctx) error {
	var req SignupWorkspaceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.WorkspaceName = strings.TrimSpace(req.WorkspaceName)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.WorkspaceName == "" || req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Workspace name, email, and password are required"})
	}
	if err := validatePassword(req.Password); err != nil {
		return err
	}

	// Check if email or slug already exists
	var existingUser models.User
	if err := database.GetDB(c).Where("LOWER(email) = ?", req.Email).First(&existingUser).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email is already registered"})
	}

	if req.Slug == "" {
		req.Slug = strings.ToLower(strings.ReplaceAll(req.WorkspaceName, " ", "-"))
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not hash password"})
	}

	var owner models.User
	var workspace models.Workspace

	err = database.GetDB(c).Transaction(func(tx *gorm.DB) error {
		// 1. Create Workspace
		workspace = models.Workspace{
			ID:     uuid.New(),
			Name:   req.WorkspaceName,
			Slug:   req.Slug,
			Tier:   signupTier(req.PlanID),
			Status: "active",
		}
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}

		// 2. Create Owner User
		empID := "OWNER-" + workspace.ID.String()[:6]
		owner = models.User{
			ID:           uuid.New(),
			WorkspaceID:  workspace.ID,
			Email:        req.Email,
			PasswordHash: string(hash),
			Role:         "Admin",
			JobTitle:     req.FullName,
			EmployeeID:   &empID,
		}
		if err := tx.Create(&owner).Error; err != nil {
			return err
		}

		// 3. Create Subscription
		cusID := "cus_" + workspace.ID.String()[:8]
		sub := models.Subscription{
			ID:                 uuid.New(),
			WorkspaceID:        workspace.ID,
			StripeCustomerID:   &cusID,
			Tier:               workspace.Tier,
			Status:             "trialing",
			CurrentPeriodStart: time.Now(),
			CurrentPeriodEnd:   time.Now().AddDate(0, 0, 14),
		}
		if err := tx.Create(&sub).Error; err != nil {
			return err
		}

		// 4. Create initial Departments
		defaultDepts := []models.Department{
			{ID: uuid.New(), WorkspaceID: workspace.ID, Name: "General / الإدارة العامة"},
			{ID: uuid.New(), WorkspaceID: workspace.ID, Name: "HR / الموارد البشرية"},
			{ID: uuid.New(), WorkspaceID: workspace.ID, Name: "Engineering / التقنية"},
		}
		if err := tx.Create(&defaultDepts).Error; err != nil {
			return err
		}

		// Every workspace starts with the same immutable CRM contracts. Custom
		// fields remain possible through separate user-managed definitions, while
		// the workflow/AI/finance integration keys stay stable.
		if err := services.EnsureSystemCRMDefinitions(tx, workspace.ID, &owner.ID); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to onboard workspace: " + err.Error()})
	}

	tokenString, err := issueUserSession(database.GetDB(c), owner, standardSessionTTL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create session"})
	}
	setSessionCookie(c, tokenString, standardSessionTTL)

	services.LogEvent(&owner.ID, "workspace.signup", "Workspace", workspace.ID.String(), map[string]string{"name": workspace.Name, "email": owner.Email}, c.IP())

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Workspace onboarded successfully",
		"user": fiber.Map{
			"id":           owner.ID,
			"email":        owner.Email,
			"name":         owner.JobTitle,
			"workspace_id": workspace.ID,
			"role":         owner.Role,
		},
	})
}
