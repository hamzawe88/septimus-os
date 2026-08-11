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
	PermCreateProject     PermissionName = "projects.create"
	PermUpdateProject     PermissionName = "projects.update"
	PermDeleteProject     PermissionName = "projects.delete"
	PermCreateTask        PermissionName = "tasks.create"
	PermUpdateTask        PermissionName = "tasks.update"
	PermDeleteTask        PermissionName = "tasks.delete"
	PermManageSprint      PermissionName = "sprints.manage"
	PermManageRoles       PermissionName = "roles.manage"
	PermManageHooks       PermissionName = "webhooks.manage"
	PermConfigureAI       PermissionName = "ai.configure"
	PermViewAgents        PermissionName = "agents.view"
	PermManageAgents      PermissionName = "agents.manage"
	PermExecuteAgent      PermissionName = "agents.execute"
	PermApproveAgent      PermissionName = "agents.approve"
	PermManageFacts       PermissionName = "facts.manage"
	PermCRMManagePipeline PermissionName = "crm.manage_pipeline"
	PermCRMConvertInvoice PermissionName = "crm.convert_invoice"
)

// RolePermissions maps a RoleName to a slice of PermissionName it is allowed to perform.
var RolePermissions = map[RoleName][]PermissionName{
	RoleAdmin: {
		PermCreateProject, PermUpdateProject, PermDeleteProject,
		PermCreateTask, PermUpdateTask, PermDeleteTask, PermManageSprint, PermManageRoles, PermManageHooks,
		PermConfigureAI, PermViewAgents, PermManageAgents, PermExecuteAgent, PermApproveAgent, PermManageFacts,
		PermCRMManagePipeline, PermCRMConvertInvoice,
	},
	RoleManager: {
		PermCreateProject, PermUpdateProject, PermDeleteProject,
		PermCreateTask, PermUpdateTask, PermDeleteTask, PermManageSprint,
		PermViewAgents, PermManageAgents, PermExecuteAgent, PermApproveAgent, PermManageFacts,
		PermCRMManagePipeline, PermCRMConvertInvoice,
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
