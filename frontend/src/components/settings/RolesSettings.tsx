"use client";

import React, { useState, useEffect } from "react";
import { Shield, Users, Plus, Edit2, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
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
  const { t, isRtl } = useLocalization();
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
    <div className="w-full h-full p-8 overflow-y-auto bg-slate-50 dark:bg-slate-900 transition-colors" dir={isRtl ? "rtl" : "ltr"}>
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Card - Premium Glassmorphism */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-lg shadow-slate-200/20 dark:shadow-none p-8 md:p-10">
          <div className="absolute -top-40 -end-40 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3 text-slate-900 dark:text-white">
                <Shield className="w-8 h-8 text-brand" />
                {isRtl ? "الأدوار والصلاحيات" : "Roles & Permissions"}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 max-w-2xl text-sm font-medium">
                {isRtl 
                  ? "إدارة صلاحيات الوصول وتحديد أدوار مخصصة لمساحة العمل الخاصة بك بأمان واحترافية." 
                  : "Manage access control and define custom roles for your workspace securely and professionally."}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#222529] backdrop-blur-xl rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400 dark:text-slate-500" /> 
              {isRtl ? "مستخدمو النظام" : "System Users"}
            </h2>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 text-white border-0 rounded-xl h-11 px-6 font-bold shadow-md shadow-brand/20 transition-all">
              <Plus className="w-4 h-4 me-2" /> 
              {isRtl ? "إضافة مستخدم" : "Add User"}
            </Button>
          </div>
          
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map(u => (
                <div key={u.ID} className="p-6 md:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-4">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{u.Email}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-3">
                      <span className="px-3 py-1 bg-brand/10 text-brand rounded-full text-xs font-bold shadow-sm">
                        {u.RoleRef?.Name || u.Role || 'User'}
                      </span>
                      <span className="flex items-center gap-1.5 opacity-80">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        {isRtl ? "انضم في" : "Joined"} {new Date(u.CreatedAt).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setEditUser({
                          ...u,
                          Role: u.RoleRef?.Name || u.Role
                        });
                        setIsEditModalOpen(true);
                      }}
                      className="flex-1 sm:flex-none rounded-xl h-10 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit2 className="w-4 h-4 sm:me-2" />
                      <span className="hidden sm:inline">{isRtl ? "تعديل" : "Edit"}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleDeleteUser(u.ID)}
                      className="flex-1 sm:flex-none rounded-xl h-10 border-rose-200 dark:border-rose-900/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                    >
                      <Trash2 className="w-4 h-4 sm:me-2" />
                      <span className="hidden sm:inline">{isRtl ? "حذف" : "Delete"}</span>
                    </Button>
                  </div>
                </div>
              ))}
              {users.length === 0 && !isLoading && (
                <div className="p-16 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <Users className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{isRtl ? "لا يوجد مستخدمين" : "No users found"}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader className="p-6 pb-0 md:p-8 md:pb-0">
            <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white">
              {isRtl ? "إضافة مستخدم جديد" : "Add New User"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="p-6 md:p-8 space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {isRtl ? "البريد الإلكتروني" : "Email"}
              </label>
              <input 
                type="email" 
                title="Email"
                placeholder="user@example.com"
                required 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {isRtl ? "كلمة المرور" : "Password"}
              </label>
              <input 
                type="text" 
                title="Password"
                placeholder="Password"
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-2 font-medium">
                {isRtl ? "قم بتزويد المستخدم بهذه الكلمة ليتمكن من الدخول." : "Provide this password to the new user so they can login."}
              </p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                {isRtl ? "الدور والصلاحية" : "Role"}
              </label>
              <select 
                title="Role"
                value={roleName}
                onChange={e => setRoleName(e.target.value)}
                className="w-full px-4 h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all cursor-pointer"
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
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} className="rounded-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800">
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-xl font-bold shadow-md shadow-brand/20">
                {isRtl ? "إنشاء المستخدم" : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Role Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader className="p-6 pb-0 md:p-8 md:pb-0">
            <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white">
              {isRtl ? "تعديل صلاحيات المستخدم" : "Edit User Role"}
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEditRole} className="p-6 md:p-8 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                  {isRtl ? "البريد الإلكتروني" : "User Email"}
                </label>
                <input 
                  type="email" 
                  title="User Email"
                  placeholder="User Email"
                  disabled 
                  value={editUser.Email}
                  className="w-full px-4 h-12 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-500 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                  {isRtl ? "الدور والصلاحية" : "Role"}
                </label>
                <select 
                  title="Role"
                  value={editUser.Role}
                  onChange={e => setEditUser({...editUser, Role: e.target.value})}
                  className="w-full px-4 h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all cursor-pointer"
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
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)} className="rounded-xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800">
                  {isRtl ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-xl font-bold shadow-md shadow-brand/20">
                  {isRtl ? "حفظ التغييرات" : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

