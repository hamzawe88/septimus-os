package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services"
	"golang.org/x/crypto/bcrypt"
)

// ─── Departments ─────────────────────────────────────────────────────────────

func GetDepartments(c *fiber.Ctx) error {
	var depts []models.Department
	if err := database.DB.Preload("Parent").Find(&depts).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch departments"})
	}
	return c.JSON(depts)
}

func CreateDepartment(c *fiber.Ctx) error {
	var dept models.Department
	if err := c.BodyParser(&dept); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}
	if err := database.DB.Create(&dept).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create department"})
	}
	logAdminEvent(c, "department.create", "Department", dept.ID.String(), dept)
	return c.JSON(dept)
}

func UpdateDepartment(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.Department
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var dept models.Department
	if err := database.DB.Where("id = ?", id).First(&dept).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Department not found"})
	}

	dept.Name = req.Name
	dept.ParentID = req.ParentID
	dept.ManagerID = req.ManagerID

	if err := database.DB.Save(&dept).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update department"})
	}
	logAdminEvent(c, "department.update", "Department", dept.ID.String(), dept)
	return c.JSON(dept)
}

func DeleteDepartment(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := database.DB.Where("id = ?", id).Delete(&models.Department{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete department"})
	}
	logAdminEvent(c, "department.delete", "Department", id, nil)
	return c.JSON(fiber.Map{"message": "Department deleted successfully"})
}

// ─── Roles ───────────────────────────────────────────────────────────────────

func GetRoles(c *fiber.Ctx) error {
	var roles []models.Role
	if err := database.DB.Find(&roles).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch roles"})
	}
	return c.JSON(roles)
}

func CreateRole(c *fiber.Ctx) error {
	var role models.Role
	if err := c.BodyParser(&role); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}
	if err := database.DB.Create(&role).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create role"})
	}
	logAdminEvent(c, "role.create", "Role", role.ID.String(), role)
	return c.JSON(role)
}

func UpdateRole(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.Role
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var role models.Role
	if err := database.DB.Where("id = ?", id).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Role not found"})
	}

	role.Name = req.Name
	role.Description = req.Description

	if err := database.DB.Save(&role).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update role"})
	}
	logAdminEvent(c, "role.update", "Role", role.ID.String(), role)
	return c.JSON(role)
}

func DeleteRole(c *fiber.Ctx) error {
	id := c.Params("id")
	
	// Prevent deleting system roles
	var role models.Role
	if err := database.DB.Where("id = ?", id).First(&role).Error; err == nil && role.IsSystemRole {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Cannot delete system role"})
	}

	if err := database.DB.Where("id = ?", id).Delete(&models.Role{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete role"})
	}
	logAdminEvent(c, "role.delete", "Role", id, nil)
	return c.JSON(fiber.Map{"message": "Role deleted successfully"})
}

// ─── Permissions ─────────────────────────────────────────────────────────────

func GetPermissions(c *fiber.Ctx) error {
	var perms []models.Permission
	if err := database.DB.Find(&perms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch permissions"})
	}
	return c.JSON(perms)
}

func CreatePermission(c *fiber.Ctx) error {
	var perm models.Permission
	if err := c.BodyParser(&perm); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}
	if err := database.DB.Create(&perm).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create permission"})
	}
	logAdminEvent(c, "permission.create", "Permission", perm.ID.String(), perm)
	return c.JSON(perm)
}

func DeletePermission(c *fiber.Ctx) error {
	id := c.Params("id")
	if err := database.DB.Where("id = ?", id).Delete(&models.Permission{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete permission"})
	}
	logAdminEvent(c, "permission.delete", "Permission", id, nil)
	return c.JSON(fiber.Map{"message": "Permission deleted successfully"})
}

func GetRolePermissions(c *fiber.Ctx) error {
	var rps []models.RolePermission
	if err := database.DB.Find(&rps).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch role permissions"})
	}
	return c.JSON(rps)
}

type AssignRolePermissionRequest struct {
	RoleID       string `json:"role_id"`
	PermissionID string `json:"permission_id"`
}

func AssignPermissionToRole(c *fiber.Ctx) error {
	var req AssignRolePermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	rid, errR := uuid.Parse(req.RoleID)
	pid, errP := uuid.Parse(req.PermissionID)
	if errR != nil || errP != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid UUIDs"})
	}

	rp := models.RolePermission{
		RoleID:       rid,
		PermissionID: pid,
	}

	if err := database.DB.Create(&rp).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to assign permission"})
	}
	logAdminEvent(c, "role.permission.assign", "RolePermission", rid.String(), req)
	return c.JSON(rp)
}

func RemovePermissionFromRole(c *fiber.Ctx) error {
	roleID := c.Params("roleId")
	permID := c.Params("permId")

	if err := database.DB.Where("role_id = ? AND permission_id = ?", roleID, permID).Delete(&models.RolePermission{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to remove permission"})
	}
	logAdminEvent(c, "role.permission.remove", "RolePermission", roleID, map[string]string{"role_id": roleID, "permission_id": permID})
	return c.JSON(fiber.Map{"message": "Permission removed from role successfully"})
}

// ─── Users (Admin Context) ───────────────────────────────────────────────────

func GetUsersAdmin(c *fiber.Ctx) error {
	var users []models.User
	if err := database.DB.Preload("RoleRef").Preload("Department").Find(&users).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to fetch users"})
	}

	// Scrub passwords
	for i := range users {
		users[i].PasswordHash = ""
	}

	return c.JSON(users)
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`    // legacy string role
	RoleID   string `json:"role_id"` // actual role uuid
}

func CreateUserAdmin(c *fiber.Ctx) error {
	var req CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	workspaceIDStr, _ := c.Locals("workspace_id").(string)

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	user := models.User{
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		Role:         req.Role, // keep for backward compatibility
	}

	if req.RoleID != "" {
		if rid, err := uuid.Parse(req.RoleID); err == nil {
			user.RoleID = &rid
		}
	} else if req.Role != "" {
		// Try to find the role by name to assign RoleID
		var existingRole models.Role
		if err := database.DB.Where("name ILIKE ?", req.Role).First(&existingRole).Error; err == nil {
			user.RoleID = &existingRole.ID
		}
	}

	// Safely parse workspace_id if it exists
	if workspaceIDStr != "" {
		if id, err := uuid.Parse(workspaceIDStr); err == nil {
			user.WorkspaceID = id
		}
	}

	if err := database.DB.Create(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user"})
	}

	// ─── AUDIT LOG ───
	logAdminEvent(c, "user.create", "User", user.ID.String(), map[string]string{"email": user.Email, "role": user.Role})

	user.PasswordHash = ""
	return c.JSON(user)
}

type UpdateUserRequest struct {
	Role   string `json:"role"`
	RoleID string `json:"role_id"`
}

func UpdateUserAdmin(c *fiber.Ctx) error {
	id := c.Params("id")
	var req UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var user models.User
	if err := database.DB.Where("id = ?", id).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	if req.RoleID != "" {
		if rid, err := uuid.Parse(req.RoleID); err == nil {
			user.RoleID = &rid
		}
	}
	
	if req.Role != "" {
		user.Role = req.Role
		// Try to find the role by name to assign RoleID if not provided
		if req.RoleID == "" {
			var existingRole models.Role
			if err := database.DB.Where("name ILIKE ?", req.Role).First(&existingRole).Error; err == nil {
				user.RoleID = &existingRole.ID
			}
		}
	}

	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update user"})
	}

	logAdminEvent(c, "user.update", "User", user.ID.String(), req)

	user.PasswordHash = ""
	return c.JSON(user)
}

func DeleteUserAdmin(c *fiber.Ctx) error {
	id := c.Params("id")

	// Prevent user from deleting themselves
	currentUserID, _ := c.Locals("user_id").(string)
	if id == currentUserID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Cannot delete your own account"})
	}

	if err := database.DB.Where("id = ?", id).Delete(&models.User{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete user"})
	}

	// ─── AUDIT LOG ───
	logAdminEvent(c, "user.delete", "User", id, nil)

	return c.JSON(fiber.Map{"message": "User deleted successfully"})
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

func GetAuditLogs(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	limit := c.QueryInt("limit", 50)
	if limit < 1 || limit > 200 {
		limit = 50
	}
	search := c.Query("search")
	entityType := c.Query("entity_type")
	userID := c.Query("user_id")

	query := database.DB.Model(&models.AuditLog{})

	if search != "" {
		searchLike := "%" + search + "%"
		query = query.Where("action ILIKE ? OR entity_type ILIKE ? OR entity_id ILIKE ? OR ip_address ILIKE ? OR details::text ILIKE ?", searchLike, searchLike, searchLike, searchLike, searchLike)
	}
	if entityType != "" && entityType != "all" && entityType != "All" {
		query = query.Where("entity_type ILIKE ?", entityType)
	}
	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to count audit logs"})
	}

	offset := (page - 1) * limit
	var logs []models.AuditLog
	if err := query.Preload("User").Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch audit logs"})
	}

	return c.JSON(fiber.Map{
		"data":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func logAdminEvent(c *fiber.Ctx, action, entityType, entityID string, details interface{}) {
	var uid *uuid.UUID
	if idStr, ok := c.Locals("user_id").(string); ok && idStr != "" {
		if parsed := database.ParseUUID(idStr); parsed != uuid.Nil {
			uid = &parsed
		}
	}
	services.LogEvent(uid, action, entityType, entityID, details, c.IP())
}
