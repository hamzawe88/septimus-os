"use client";

import { useState, useEffect } from "react";
import { Users, Shield, Building2, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalization } from "@/contexts/LocalizationContext";

import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, X } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';

interface User {
  ID: string;
  Email: string;
  Role: string;
  RoleRef?: { Name: string };
  Department?: { Name: string };
  JobTitle?: string;
  CreatedAt: string;
}

interface Department {
  ID: string;
  Name: string;
  ParentID?: string;
}

interface RoleType {
  ID: string;
  Name: string;
  Description?: string;
  IsSystemRole?: boolean;
}

interface Permission {
  ID: string;
  Name: string;
  Module?: string;
}

interface RolePermission {
  RoleID: string;
  PermissionID: string;
}

export default function AdminDashboard() {
  const { t } = useLocalization();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<RoleType[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  
  // Modals state
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [editRole, setEditRole] = useState<RoleType | null>(null);

  // Form State
  const [deptName, setDeptName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const [usersRes, deptsRes, rolesRes, permsRes, rpRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/admin/users`),
          fetchWithAuth(`${API_BASE_URL}/admin/departments`),
          fetchWithAuth(`${API_BASE_URL}/admin/roles`),
          fetchWithAuth(`${API_BASE_URL}/admin/permissions`),
          fetchWithAuth(`${API_BASE_URL}/admin/role_permissions`)
        ]);

        if (usersRes.ok) setUsers(await usersRes.json());
        if (deptsRes.ok) setDepartments(await deptsRes.json());
        if (rolesRes.ok) setRoles(await rolesRes.json());
        if (permsRes.ok) setPermissions(await permsRes.json());
        if (rpRes.ok) setRolePermissions(await rpRes.json());
      } catch (err) {
        console.error("Failed to load admin data:", err);
      }
    };
    fetchAdminData();
  }, []);

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
            const url = editDept ? `${API_BASE_URL}/admin/departments/${editDept.ID}` : `${API_BASE_URL}/admin/departments`;
      const method = editDept ? "PUT" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify({ name: deptName })
      });
      if (res.ok) {
        setIsDeptModalOpen(false);
        setEditDept(null);
        setDeptName("");
        // simple reload
        const deptsRes = await fetchWithAuth(`${API_BASE_URL}/admin/departments`);
        if (deptsRes.ok) setDepartments(await deptsRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/departments/${id}`, {
        method: "DELETE",
        
      });
      if (res.ok) {
        const deptsRes = await fetchWithAuth(`${API_BASE_URL}/admin/departments`);
        if (deptsRes.ok) setDepartments(await deptsRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
            const url = editRole ? `${API_BASE_URL}/admin/roles/${editRole.ID}` : `${API_BASE_URL}/admin/roles`;
      const method = editRole ? "PUT" : "POST";
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify({ name: roleName, description: roleDesc })
      });
      if (res.ok) {
        setIsRoleModalOpen(false);
        setEditRole(null);
        setRoleName("");
        setRoleDesc("");
        // simple reload
        const rolesRes = await fetchWithAuth(`${API_BASE_URL}/admin/roles`);
        if (rolesRes.ok) setRoles(await rolesRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/roles/${id}`, {
        method: "DELETE",
        
      });
      if (res.ok) {
        const rolesRes = await fetchWithAuth(`${API_BASE_URL}/admin/roles`);
        if (rolesRes.ok) setRoles(await rolesRes.json());
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete role");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Addressing lints: Using permissions and rolePermissions state in the matrix
  const handleTogglePermission = async (roleId: string, permId: string, isAssigned: boolean) => {
    try {
      const headers = { "Content-Type": "application/json" };
      if (isAssigned) {
        await fetchWithAuth(`${API_BASE_URL}/admin/roles/${roleId}/permissions/${permId}`, { method: "DELETE", headers });
      } else {
        await fetchWithAuth(`${API_BASE_URL}/admin/permissions/assign`, {
          method: "POST",
          headers,
          body: JSON.stringify({ role_id: roleId, permission_id: permId })
        });
      }
      const rpRes = await fetchWithAuth(`${API_BASE_URL}/admin/role_permissions`, {});
      if (rpRes.ok) setRolePermissions(await rpRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center space-x-3">
        <LayoutDashboard className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold text-gray-900 ">{t("sidebar.adminCenter")} Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.totalEmployees", "Total Employees")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.departments", "Departments")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{departments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.customRoles", "Custom Roles")}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="users">{t("admin.usersTab", "Users")}</TabsTrigger>
          <TabsTrigger value="departments">{t("admin.departmentsTab", "Departments")}</TabsTrigger>
          <TabsTrigger value="roles">{t("admin.rolesTab", "Roles & Permissions (RBAC)")}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.employeeDirectory", "Employee Directory")}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm text-start">
                <thead className="bg-gray-100 text-gray-600 ">
                  <tr>
                    <th className="p-3 rounded-ss-md">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Job Title</th>
                    <th className="p-3 rounded-se-md">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.ID} className="border-b hover:bg-background :bg-slate-800/50">
                      <td className="p-3 font-medium">{u.Email}</td>
                      <td className="p-3">{u.RoleRef?.Name || u.Role || "N/A"}</td>
                      <td className="p-3">{u.Department?.Name || "N/A"}</td>
                      <td className="p-3">{u.JobTitle || "N/A"}</td>
                      <td className="p-3">{new Date(u.CreatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>{t("admin.departmentTree", "Department Tree")}</CardTitle>
              <Button onClick={() => { setEditDept(null); setDeptName(""); setIsDeptModalOpen(true); }} size="sm">
                <Plus className="w-4 h-4 me-1" /> Add Department
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {departments.map(d => (
                  <li key={d.ID} className="p-4 border rounded-md flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{d.Name}</span>
                      {d.ParentID && <span className="text-xs text-gray-500 block">Sub-department</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditDept(d); setDeptName(d.Name); setIsDeptModalOpen(true); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteDept(d.ID)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle>{t("admin.rolesAndPermissions", "Roles & Permissions")}</CardTitle>
              <Button onClick={() => { setEditRole(null); setRoleName(""); setRoleDesc(""); setIsRoleModalOpen(true); }} size="sm">
                <Plus className="w-4 h-4 me-1" /> Add Role
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {roles.map(r => (
                  <li key={r.ID} className="p-4 border rounded-md flex justify-between items-center">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {r.Name} 
                        {r.IsSystemRole && <span className="px-2 py-0.5 bg-blue-100 text-brand text-xs rounded-full">System</span>}
                      </div>
                      <div className="text-sm text-gray-500">{r.Description || "No description"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditRole(r); setRoleName(r.Name); setRoleDesc(r.Description || ""); setIsRoleModalOpen(true); }}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {!r.IsSystemRole && (
                        <Button variant="outline" size="sm" onClick={() => handleDeleteRole(r.ID)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("admin.permissionMatrix", "Permission Matrix")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-start border">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 border">{t("admin.permissionRole", "Permission / Role")}</th>
                      {roles.map(r => <th key={r.ID} className="p-3 border text-center font-bold">{r.Name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map(p => (
                      <tr key={p.ID} className="border-b hover:bg-gray-50">
                        <td className="p-3 border font-semibold">
                          {p.Name}
                          <span className="block text-xs text-gray-500">{p.Module || "General"}</span>
                        </td>
                        {roles.map(r => {
                          const assigned = rolePermissions.some(rp => rp.RoleID === r.ID && rp.PermissionID === p.ID);
                          return (
                            <td key={r.ID} className="p-3 border text-center">
                              <input
                                title={`Assign ${p.Name} to ${r.Name}`}
                                type="checkbox"
                                checked={assigned}
                                onChange={() => handleTogglePermission(r.ID, p.ID, assigned)}
                                className="w-4 h-4 text-brand rounded cursor-pointer"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dept Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold">{editDept ? "Edit Department" : "Add Department"}</h2>
              <button title="Close Modal" onClick={() => setIsDeptModalOpen(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSaveDept} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input 
                  title="Department Name" 
                  placeholder="Department Name"
                  required 
                  value={deptName} 
                  onChange={e => setDeptName(e.target.value)} 
                  className="w-full p-2 border rounded" 
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDeptModalOpen(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold">{editRole ? "Edit Role" : "Add Role"}</h2>
              <button title="Close Modal" onClick={() => setIsRoleModalOpen(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSaveRole} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input 
                  title="Role Name" 
                  placeholder="Role Name"
                  required 
                  value={roleName} 
                  onChange={e => setRoleName(e.target.value)} 
                  className="w-full p-2 border rounded" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input 
                  title="Role Description" 
                  placeholder="Role Description"
                  value={roleDesc} 
                  onChange={e => setRoleDesc(e.target.value)} 
                  className="w-full p-2 border rounded" 
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsRoleModalOpen(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
