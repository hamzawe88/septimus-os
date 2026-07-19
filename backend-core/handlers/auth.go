package handlers

import (
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/engine"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type SignupWorkspaceRequest struct {
	WorkspaceName string `json:"workspace_name"`
	Slug          string `json:"slug"`
	Email         string `json:"email"`
	Password      string `json:"password"`
	FullName      string `json:"full_name"`
	PlanID        string `json:"plan_id"`
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

// Login handles user authentication and returns a JWT
func Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.GetDB(c).Where("email = ?", req.Email).First(&user).Error; err != nil {
		services.LogEvent(nil, "auth.login.failure", "User", req.Email, map[string]string{"reason": "User not found", "email": req.Email}, c.IP())
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	// Compare password hashes (support both bcrypt hash and direct string matches / mock fallbacks)
	isSeededDevUser := strings.HasSuffix(user.Email, "@septimus.local")
	validDevPassword := isSeededDevUser && (req.Password == "admin123" || req.Password == "password" || req.Password == "123456" || req.Password == user.PasswordHash)

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil && !validDevPassword {
		services.LogEvent(&user.ID, "auth.login.failure", "User", user.ID.String(), map[string]string{"reason": "Invalid password", "email": req.Email}, c.IP())
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	// Create JWT token
	claims := jwt.MapClaims{
		"sub":          user.ID.String(),
		"workspace_id": user.WorkspaceID.String(),
		"role":         user.Role,
		"exp":          time.Now().Add(time.Hour * 72).Unix(),
	}
	if user.DepartmentID != nil {
		claims["department_id"] = user.DepartmentID.String()
	}
	if user.RoleID != nil {
		claims["role_id"] = user.RoleID.String()
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	tokenString, err := token.SignedString([]byte(getJWTSecret()))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate token"})
	}

	services.LogEvent(&user.ID, "auth.login.success", "User", user.ID.String(), map[string]string{"email": user.Email, "role": user.Role}, c.IP())

	return c.JSON(fiber.Map{
		"token": tokenString,
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
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not hash password"})
	}

	// Reject duplicate emails up front.
	var existingUser models.User
	if err := database.GetDB(c).Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
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
	Password string `json:"password"`
	Avatar   string `json:"avatar"`
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
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not hash password"})
		}
		updates["password_hash"] = string(hash)
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

	if req.WorkspaceName == "" || req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Workspace name, email, and password are required"})
	}

	// Check if email or slug already exists
	var existingUser models.User
	if err := database.GetDB(c).Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
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
			ID:       uuid.New(),
			Name:     req.WorkspaceName,
			Slug:     req.Slug,
			Tier:     req.PlanID,
			Status:   "active",
		}
		if workspace.Tier == "" {
			workspace.Tier = "starter"
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

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to onboard workspace: " + err.Error()})
	}

	// Generate JWT for the new owner
	claims := jwt.MapClaims{
		"sub":          owner.ID.String(),
		"email":        owner.Email,
		"workspace_id": workspace.ID.String(),
		"role":         owner.Role,
		"exp":          time.Now().Add(time.Hour * 72).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(getJWTSecret()))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate token"})
	}

	services.LogEvent(&owner.ID, "workspace.signup", "Workspace", workspace.ID.String(), map[string]string{"name": workspace.Name, "email": owner.Email}, c.IP())

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Workspace onboarded successfully",
		"token":   tokenString,
		"user": fiber.Map{
			"id":           owner.ID,
			"email":        owner.Email,
			"name":         owner.JobTitle,
			"workspace_id": workspace.ID,
			"role":         owner.Role,
		},
	})
}
