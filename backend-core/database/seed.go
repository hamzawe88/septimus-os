package database

import (
	"log"

	"github.com/septimus-os/backend-core/models"
)

func SeedDatabase() {
	log.Println("Seeding roles...")

	roles := []models.Role{
		{Name: "Admin", Description: "Full access to all system features.", IsSystemRole: true},
		{Name: "Manager", Description: "Can manage projects, tasks, and sprints.", IsSystemRole: true},
		{Name: "Member", Description: "Can create and edit tasks.", IsSystemRole: true},
		{Name: "Viewer", Description: "Read-only access.", IsSystemRole: true},
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
		{Name: "channels.manage", Module: "Chat"},
		{Name: "workflows.manage", Module: "Automations"},
		{Name: "attendance.manage", Module: "HR"},
		{Name: "finance.manage", Module: "Finance"},
		{Name: "apikeys.manage", Module: "Integrations"},
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
				RoleID: adminRole.ID,
				PermissionID: p.ID,
			}
			DB.Where("role_id = ? AND permission_id = ?", rolePerm.RoleID, rolePerm.PermissionID).FirstOrCreate(&rolePerm)
		}
	}

	// Managers get project/chat/automation management but not admin or finance
	managerPerms := []string{"projects.delete", "channels.manage", "workflows.manage"}
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

	// Create users via Raw SQL to bypass any GORM struct mapping issues
	DB.Exec(`
		INSERT INTO users (id, workspace_id, email, password_hash, role, employee_id)
		VALUES ('2f67ffe1-d96d-4cff-93b3-a8dd743b6907', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'admin@septimus.local', 'admin123', 'Admin', 'EMP-000')
		ON CONFLICT (email) DO UPDATE SET password_hash = 'admin123', role = 'Admin';
	`)

	DB.Exec(`
		INSERT INTO users (workspace_id, email, password_hash, role, department_id, employee_id)
		VALUES ('dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'ahmed.dev@septimus.local', '123456', 'Developer', ?, 'EMP-001')
		ON CONFLICT (email) DO UPDATE SET password_hash = '123456', workspace_id = 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d';
	`, devDept.ID)

	DB.Exec(`
		INSERT INTO users (workspace_id, email, password_hash, role, department_id, employee_id)
		VALUES ('dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'sara.hr@septimus.local', '123456', 'HR Manager', ?, 'EMP-002')
		ON CONFLICT (email) DO UPDATE SET password_hash = '123456', workspace_id = 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d';
	`, hrDept.ID)

	DB.Exec(`
		INSERT INTO users (workspace_id, email, password_hash, role, department_id, employee_id)
		VALUES ('dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'cto@septimus.local', '123456', 'CTO', ?, 'EMP-003')
		ON CONFLICT (email) DO UPDATE SET password_hash = '123456', workspace_id = 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d';
	`, itDept.ID)
	
	// Fetch the CTO to set as manager
	var cto models.User
	DB.Where("email = ?", "cto@septimus.local").First(&cto)
	user3 := cto

	// Set CTO as IT Dept manager
	DB.Model(&itDept).Update("manager_id", user3.ID)

	// Seed default workspaces and projects required by frontend UI components
	DB.Exec(`
		INSERT INTO workspaces (id, name, industry, created_at, updated_at)
		VALUES 
			('dab3d9c9-829a-4f1d-90be-ab70603c5e7d', 'Default Workspace', 'Technology', NOW(), NOW()),
			('797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'Septimus HQ', 'Technology', NOW(), NOW())
		ON CONFLICT DO NOTHING;
	`)

	DB.Exec(`
		INSERT INTO projects (id, workspace_id, created_by, name, settings, created_at, updated_at)
		VALUES 
			('b3b8a553-1d67-470d-97e8-36099f608ca1', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', '2f67ffe1-d96d-4cff-93b3-a8dd743b6907', 'Default Project', '{}', NOW(), NOW()),
			('5bf90680-cf33-44ae-851c-eef563e82920', 'dab3d9c9-829a-4f1d-90be-ab70603c5e7d', '2f67ffe1-d96d-4cff-93b3-a8dd743b6907', 'Septimus Core Platform', '{}', NOW(), NOW())
		ON CONFLICT DO NOTHING;
	`)

	// Link user role_ids if missing
	DB.Exec(`UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Admin' LIMIT 1) WHERE role ILIKE '%admin%' AND role_id IS NULL;`)

	// Seed default connected marketplace apps for Septimus HQ workspace
	DB.Exec(`
		INSERT INTO workspace_integrations (id, workspace_id, provider, access_token, metadata, created_at, updated_at)
		VALUES 
			('a1111111-1111-1111-1111-111111111111', '797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'zendesk', 'mock_token_zendesk', '{"status":"connected"}', NOW(), NOW()),
			('a2222222-2222-2222-2222-222222222222', '797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e', 'ai_analytics', 'mock_token_ai', '{"status":"connected"}', NOW(), NOW())
		ON CONFLICT DO NOTHING;
	`)

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

