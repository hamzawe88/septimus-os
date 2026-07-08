package models

type RoleName string

const (
	RoleAdmin   RoleName = "Admin"
	RoleManager RoleName = "Manager"
	RoleMember  RoleName = "Member"
	RoleViewer  RoleName = "Viewer"
)

type PermissionName string

const (
	PermCreateTask   PermissionName = "tasks.create"
	PermUpdateTask   PermissionName = "tasks.update"
	PermDeleteTask   PermissionName = "tasks.delete"
	PermManageSprint PermissionName = "sprints.manage"
	PermManageRoles  PermissionName = "roles.manage"
	PermManageHooks  PermissionName = "webhooks.manage"
)

// RolePermissions maps a RoleName to a slice of PermissionName it is allowed to perform.
var RolePermissions = map[RoleName][]PermissionName{
	RoleAdmin: {
		PermCreateTask, PermUpdateTask, PermDeleteTask, PermManageSprint, PermManageRoles, PermManageHooks,
	},
	RoleManager: {
		PermCreateTask, PermUpdateTask, PermDeleteTask, PermManageSprint,
	},
	RoleMember: {
		PermCreateTask, PermUpdateTask,
	},
	RoleViewer: {
		// Can only view
	},
}

// HasPermission checks if a given role has the required permission
func HasPermission(role RoleName, perm PermissionName) bool {
	perms, ok := RolePermissions[role]
	if !ok {
		return false
	}
	for _, p := range perms {
		if p == perm {
			return true
		}
	}
	return false
}
