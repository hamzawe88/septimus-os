package handlers

import (
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/engine"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "super_secret_septimus_key"
	}
	return secret
}

// Login handles user authentication and returns a JWT
func Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		services.LogEvent(nil, "auth.login.failure", "User", req.Email, map[string]string{"reason": "User not found", "email": req.Email}, c.IP())
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	// Compare password hashes
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
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

	// For dev, if no workspace exists, create a default one
	var workspace models.Workspace
	if err := database.DB.First(&workspace).Error; err != nil {
		workspace = models.Workspace{
			Name: "Default Workspace",
		}
		database.DB.Create(&workspace)
	}

	// Never trust the client-supplied role: it would grant the RBAC admin
	// bypass to anyone. The first registered user becomes Admin (bootstrap);
	// everyone else starts as Member and must be promoted via the admin panel.
	assignedRole := "Member"
	var userCount int64
	database.DB.Model(&models.User{}).Count(&userCount)
	if userCount == 0 {
		assignedRole = "Admin"
	}

	user := models.User{
		WorkspaceID:  workspace.ID,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         assignedRole,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create user"})
	}

	services.LogEvent(&user.ID, "auth.register", "User", user.ID.String(), map[string]string{"email": user.Email, "role": assignedRole}, c.IP())

	// Trigger workflow
	go engine.ExecuteEvent(database.DB, user.WorkspaceID, "user.created", map[string]interface{}{
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
	if err := database.DB.Where("id = ?", userIdStr).First(&user).Error; err != nil {
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
		if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not update profile"})
		}
	}

	return c.JSON(fiber.Map{"message": "Profile updated successfully"})
}
