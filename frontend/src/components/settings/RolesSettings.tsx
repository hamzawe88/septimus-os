"use client";

import React, { useState, useEffect } from "react";
import { Shield, Users, Plus, Edit2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface Role {
  ID: string;
  Name: string;
  Description: string;
}

interface User {
  ID: string;
  Email: string;
  Role: string;
  RoleRef?: Role;
  CreatedAt: string;
}

export default function RolesSettings() {
  const { t } = useLocalization();
  const [users, setUsers] = useState<User[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123"); // Default password
  const [roleName, setRoleName] = useState("Member");
  const [editUser, setEditUser] = useState<User | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
            const [usersRes, rolesRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/admin/users`),
        fetchWithAuth(`${API_BASE_URL}/admin/roles`)
      ]);
      
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData || []);
      }
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setAvailableRoles(rolesData || []);
        if (rolesData && rolesData.length > 0) {
          setRoleName(rolesData[0].Name);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({ email, password, role: roleName })
      });
      if (res.ok) {
         
        void fetchData();
        setIsAddModalOpen(false);
        setEmail("");
        setPassword("password123");
      } else {
        const err = await res.json();
        alert(err.error || t("settings.addUserFailed"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
            const updatedRoleName = editUser.RoleRef?.Name || editUser.Role;
      const res = await fetchWithAuth(`${API_BASE_URL}/admin/users/${editUser.ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({ role: updatedRoleName })
      });
      if (res.ok) {
         
        void fetchData();
        setIsEditModalOpen(false);
        setEditUser(null);
      } else {
        const err = await res.json();
        alert(err.error || t("settings.updateRoleFailed"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(t("settings.confirmDeleteUser"))) return;
    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/users/${id}`, {
        method: "DELETE",
        
      });
      if (res.ok) {
         
        void fetchData();
      } else {
        const err = await res.json();
        alert(err.error || t("settings.deleteUserFailed"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full h-full p-8 overflow-y-auto bg-[#f8fafc]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-light text-brand rounded-lg">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Roles & Permissions</h1>
        </div>
        <p className="text-slate-500 mb-8 ms-11">
          Manage access control and define custom roles for your workspace.
        </p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" /> System Users
            </h2>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand text-white border-0">
              <Plus className="w-4 h-4 me-2" /> Add User
            </Button>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">Loading users...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map(u => (
                <div key={u.ID} className="p-6 flex items-center justify-between hover:bg-[#f8fafc] transition-colors">
                  <div>
                    <h3 className="font-semibold text-slate-800">{u.Email}</h3>
                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-brand-light text-brand rounded-full text-xs font-medium">
                        {u.RoleRef?.Name || u.Role || 'User'}
                      </span>
                      <span>Joined {new Date(u.CreatedAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setEditUser({
                          ...u,
                          Role: u.RoleRef?.Name || u.Role
                        });
                        setIsEditModalOpen(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDeleteUser(u.ID)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {users.length === 0 && !isLoading && (
                <div className="p-8 text-center text-slate-500">No users found.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc]">
              <h2 className="text-lg font-bold text-slate-800">Add New User</h2>
              <button title="Close Modal" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input 
                  type="email" 
                  title="Email"
                  placeholder="user@example.com"
                  required 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input 
                  type="text" 
                  title="Password"
                  placeholder="Password"
                  required 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:border-brand focus:ring-1 focus:ring-brand"
                />
                <p className="text-xs text-slate-500 mt-1">Provide this password to the new user so they can login.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select 
                  title="Role"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:border-brand focus:ring-1 focus:ring-brand"
                >
                  {availableRoles.map(r => (
                    <option key={r.ID} value={r.Name}>{r.Name}</option>
                  ))}
                  {availableRoles.length === 0 && (
                    <>
                      <option value="Admin">Admin</option>
                      <option value="Manager">Manager</option>
                      <option value="Member">Member</option>
                      <option value="Viewer">Viewer</option>
                    </>
                  )}
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-brand hover:bg-brand text-white">Create User</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {isEditModalOpen && editUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-[#f8fafc]">
              <h2 className="text-lg font-bold text-slate-800">Edit User Role</h2>
              <button title="Close Modal" onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditRole} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">User Email</label>
                <input 
                  type="email" 
                  title="User Email"
                  placeholder="User Email"
                  disabled 
                  value={editUser.Email}
                  className="w-full p-2 border border-slate-200 bg-[#f8fafc] text-slate-500 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select 
                  title="Role"
                  value={editUser.Role}
                  onChange={e => setEditUser({...editUser, Role: e.target.value})}
                  className="w-full p-2 border border-slate-300 rounded focus:border-brand focus:ring-1 focus:ring-brand"
                >
                  {availableRoles.map(r => (
                    <option key={r.ID} value={r.Name}>{r.Name}</option>
                  ))}
                  {availableRoles.length === 0 && (
                    <>
                      <option value="Admin">Admin</option>
                      <option value="Manager">Manager</option>
                      <option value="Member">Member</option>
                      <option value="Viewer">Viewer</option>
                    </>
                  )}
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-brand hover:bg-brand text-white">Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

