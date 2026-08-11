package database

import (
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
	"golang.org/x/crypto/bcrypt"
)

func SeedDatabase() {
	log.Println("Seeding roles...")

	roles := []models.Role{
		{Name: "Admin", Description: "Full access to all system features.", IsSystemRole: true},
		{Name: "Manager", Description: "Can manage projects, tasks, and sprints.", IsSystemRole: true},
		{Name: "Member", Description: "Can create and edit tasks.", IsSystemRole: true},
		{Name: "Viewer", Description: "Read-only access.", IsSystemRole: true},
		// Roles the seeded org users carry — must exist so seedUser can resolve
		// each user's role_id (permissions are granted in SeedRBAC.roleGrants).
		{Name: "HR Manager", Description: "Human Resources lead — full HR module access.", IsSystemRole: true},
		{Name: "CTO", Description: "Technology leadership.", IsSystemRole: true},
		{Name: "Developer", Description: "Engineer — create and edit records.", IsSystemRole: true},
	}

	for _, role := range roles {
		var existingRole models.Role
		if err := DB.Where("name = ?", role.Name).First(&existingRole).Error; err != nil {
			// Role not found, create it
			if createErr := DB.Create(&role).Error; createErr != nil {
				log.Printf("Failed to create role %s: %v\n", role.Name, createErr)
			} else {
				log.Printf("Created role: %s\n", role.Name)
			}
		}
	}

	log.Println("Seeding permissions...")
	permissions := []models.Permission{
		{Name: "view_users", Module: "Users"},
		{Name: "manage_users", Module: "Users"},
		{Name: "view_roles", Module: "Roles"},
		{Name: "manage_roles", Module: "Roles"},
		{Name: "view_departments", Module: "Departments"},
		{Name: "manage_departments", Module: "Departments"},
		{Name: "admin.manage", Module: "Admin"},
		{Name: "projects.delete", Module: "Agile"},
		{Name: string(models.PermCreateProject), Module: "Agile"},
		{Name: string(models.PermUpdateProject), Module: "Agile"},
		{Name: string(models.PermCreateTask), Module: "Agile"},
		{Name: string(models.PermUpdateTask), Module: "Agile"},
		{Name: string(models.PermDeleteTask), Module: "Agile"},
		{Name: string(models.PermManageSprint), Module: "Agile"},
		{Name: "channels.manage", Module: "Chat"},
		{Name: "workflows.manage", Module: "Automations"},
		{Name: "attendance.manage", Module: "HR"},
		{Name: "finance.manage", Module: "Finance"},
		{Name: "apikeys.manage", Module: "Integrations"},
		{Name: "schemas.view", Module: "Data"},
		{Name: "schemas.manage", Module: "Data"},
		{Name: "schemas.publish", Module: "Data"},
		{Name: "records.read", Module: "Data"},
		{Name: "records.create", Module: "Data"},
		{Name: "records.update", Module: "Data"},
		{Name: "records.delete", Module: "Data"},
		{Name: string(models.PermConfigureAI), Module: "AI"},
		{Name: string(models.PermViewAgents), Module: "AI"},
		{Name: string(models.PermManageAgents), Module: "AI"},
		{Name: string(models.PermExecuteAgent), Module: "AI"},
		{Name: string(models.PermApproveAgent), Module: "AI"},
		{Name: string(models.PermManageFacts), Module: "Knowledge"},
		{Name: string(models.PermCRMManagePipeline), Module: "CRM"},
		{Name: string(models.PermCRMConvertInvoice), Module: "CRM"},
	}

	for _, perm := range permissions {
		DB.Where("name = ?", perm.Name).FirstOrCreate(&perm)
	}

	log.Println("Assigning permissions to Admin role...")
	var adminRole models.Role
	if err := DB.Where("name = ?", "Admin").First(&adminRole).Error; err == nil {
		for _, perm := range permissions {
			var p models.Permission
			DB.Where("name = ?", perm.Name).First(&p)
			rolePerm := models.RolePermission{
				RoleID:       adminRole.ID,
				PermissionID: p.ID,
			}
			DB.Where("role_id = ? AND permission_id = ?", rolePerm.RoleID, rolePerm.PermissionID).FirstOrCreate(&rolePerm)
		}
	}

	// Managers get project/chat/automation management but not admin or finance
	managerPerms := []string{
		"projects.delete",
		string(models.PermCreateProject),
		string(models.PermUpdateProject),
		string(models.PermCreateTask),
		string(models.PermUpdateTask),
		string(models.PermDeleteTask),
		string(models.PermManageSprint),
		"channels.manage",
		"workflows.manage",
		"schemas.view",
		"schemas.manage",
		"records.read",
		"records.create",
		"records.update",
		"records.delete",
		string(models.PermViewAgents),
		string(models.PermManageAgents),
		string(models.PermExecuteAgent),
		string(models.PermApproveAgent),
		string(models.PermManageFacts),
		string(models.PermCRMManagePipeline),
		string(models.PermCRMConvertInvoice),
	}
	var managerRole models.Role
	if err := DB.Where("name = ?", "Manager").First(&managerRole).Error; err == nil {
		for _, permName := range managerPerms {
			var p models.Permission
			if err := DB.Where("name = ?", permName).First(&p).Error; err != nil {
				continue
			}
			rolePerm := models.RolePermission{
				RoleID:       managerRole.ID,
				PermissionID: p.ID,
			}
			DB.Where("role_id = ? AND permission_id = ?", rolePerm.RoleID, rolePerm.PermissionID).FirstOrCreate(&rolePerm)
		}
	}

	log.Println("Seeding mock departments and users for Org Chart...")

	// All seed fixtures belong to the seed admin's workspace so they are never
	// orphaned (NULL workspace_id) — which used to leak across tenants.
	seedWS := ParseUUID("dab3d9c9-829a-4f1d-90be-ab70603c5e7d")

	// Workspaces must exist before departments/users/projects because those rows
	// carry foreign keys to the tenant. The old order relied on disabled FK
	// checks and failed on a correctly configured database.
	DB.Exec(`
		INSERT INTO workspaces (id, name, industry, created_at, updated_at)
		VALUES
			('dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'Default Workspace', 'Technology', NOW(), NOW()),
			('797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'Septimus HQ', 'Technology', NOW(), NOW())
		ON CONFLICT DO NOTHING;
	`)

	// Create root department
	itDept := models.Department{WorkspaceID: seedWS, Name: "قسم تقنية المعلومات"}
	DB.Where("name = ?", itDept.Name).FirstOrCreate(&itDept)
	DB.Model(&itDept).Update("workspace_id", seedWS)

	devDept := models.Department{WorkspaceID: seedWS, Name: "فريق التطوير", ParentID: &itDept.ID}
	DB.Where("name = ?", devDept.Name).FirstOrCreate(&devDept)
	DB.Model(&devDept).Update("workspace_id", seedWS)

	hrDept := models.Department{WorkspaceID: seedWS, Name: "الموارد البشرية"}
	DB.Where("name = ?", hrDept.Name).FirstOrCreate(&hrDept)
	DB.Model(&hrDept).Update("workspace_id", seedWS)

	// Demo users are opt-in and use a bcrypt hash generated from an operator
	// supplied password. Never seed a known password or a plaintext credential.
	seedPassword := os.Getenv("SEED_PASSWORD")
	var seedPasswordHash string
	if len(seedPassword) >= 8 {
		if hash, err := bcrypt.GenerateFromPassword([]byte(seedPassword), bcrypt.DefaultCost); err == nil {
			seedPasswordHash = string(hash)
		}
	} else {
		log.Println("SEED_PASSWORD is unset or too short; skipping demo users")
	}

	if seedPasswordHash != "" {
		seedUser := func(id uuid.UUID, email, role, employee string, departmentID *uuid.UUID) models.User {
			// Resolve the role string to its role row so the user gets a role_id.
			// CheckPermission grants granular permissions through role_id; a user
			// with only the string is locked out of every gated route.
			var roleRow models.Role
			var roleIDPtr *uuid.UUID
			if err := DB.Where("name = ?", role).First(&roleRow).Error; err == nil {
				roleIDPtr = &roleRow.ID
			}

			var user models.User
			if err := DB.Where("email = ?", email).First(&user).Error; err != nil {
				user = models.User{ID: id, WorkspaceID: seedWS, Email: email, PasswordHash: seedPasswordHash, Role: role, RoleID: roleIDPtr, DepartmentID: departmentID}
				employeeCopy := employee
				user.EmployeeID = &employeeCopy
				if createErr := DB.Create(&user).Error; createErr != nil {
					log.Printf("Failed to seed user %s: %v", email, createErr)
				}
				return user
			}
			updates := map[string]interface{}{
				"workspace_id":  seedWS,
				"password_hash": seedPasswordHash,
				"role":          role,
				"department_id": departmentID,
			}
			if roleIDPtr != nil {
				updates["role_id"] = roleIDPtr
			}
			if err := DB.Model(&user).Updates(updates).Error; err != nil {
				log.Printf("Failed to update seeded user %s: %v", email, err)
			}
			return user
		}

		seedUser(ParseUUID("2f67ffe1-d96d-4cff-93b3-a8dd743b6907"), "admin@septimus.local", "Admin", "EMP-000", nil)
		seedUser(uuid.New(), "ahmed.dev@septimus.local", "Developer", "EMP-001", &devDept.ID)
		seedUser(uuid.New(), "sara.hr@septimus.local", "HR Manager", "EMP-002", &hrDept.ID)
		seedUser(uuid.New(), "cto@septimus.local", "CTO", "EMP-003", &itDept.ID)
	}

	// Fetch the CTO to set as manager
	if seedPasswordHash != "" {
		var cto models.User
		DB.Where("email = ? AND workspace_id = ?", "cto@septimus.local", seedWS).First(&cto)
		if cto.ID != uuid.Nil {
			// Set CTO as IT Dept manager
			DB.Model(&itDept).Update("manager_id", cto.ID)
		}
	}

	if seedPasswordHash != "" {
		DB.Exec(`
		INSERT INTO projects (id, workspace_id, created_by, name, settings, created_at, updated_at)
		VALUES 
			('b3b8a553-1d67-470d-97e8-36099f608ca1', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', '2f67ffe1-d96d-4cff-93b3-a8dd743b6907', 'Default Project', '{}', NOW(), NOW()),
			('5bf90680-cf33-44ae-851c-eef563e82920', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', '2f67ffe1-d96d-4cff-93b3-a8dd743b6907', 'Septimus Core Platform', '{}', NOW(), NOW())
		ON CONFLICT DO NOTHING;
		`)
	}

	// Link user role_ids if missing
	DB.Exec(`UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Admin' LIMIT 1) WHERE role ILIKE '%admin%' AND role_id IS NULL;`)

	// Seed default channels for Default Workspace and Septimus HQ
	DB.Exec(`
		INSERT INTO channels (id, workspace_id, name, type, is_system, created_at, updated_at)
		VALUES 
			('c1111111-1111-1111-1111-111111111111', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'عام', 'PUBLIC', true, NOW(), NOW()),
			('c2222222-2222-2222-2222-222222222222', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'إعلانات-الشركة', 'PUBLIC', true, NOW(), NOW()),
			('c3333333-3333-3333-3333-333333333333', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'مشاريع-وتطوير', 'PUBLIC', false, NOW(), NOW()),
			('c4444444-4444-4444-4444-444444444444', '797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'عام', 'PUBLIC', true, NOW(), NOW()),
			('c5555555-5555-5555-5555-555555555555', '797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'إعلانات-الشركة', 'PUBLIC', true, NOW(), NOW())
		ON CONFLICT DO NOTHING;
	`)

	// Enroll existing users into default channels
	DB.Exec(`
		INSERT INTO channel_members (channel_id, user_id, role, is_muted, joined_at)
		SELECT c.id, u.id, 'MEMBER', false, NOW()
		FROM channels c
		JOIN users u ON u.workspace_id = c.workspace_id
		ON CONFLICT DO NOTHING;
	`)
}
