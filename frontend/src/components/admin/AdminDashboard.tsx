"use client";

import React, { useState, useEffect } from "react";
import { Users, Shield, Building2, Search, Plus } from "lucide-react";
import { apiGet, apiPut, apiPost } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import PermissionsMatrix from "./PermissionsMatrix";
import OrgChartContainer from "../org/OrgChartContainer";
import { useLocalization } from "@/contexts/LocalizationContext";

interface User {
  ID: string;
  Name: string;
  Email: string;
  RoleID: string | null;
  Role?: { Name: string };
  DepartmentID: string | null;
  Department?: { Name: string };
}

export default function AdminDashboard() {
  const { t } = useLocalization();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<{ID: string, Name: string}[]>([]);
  const [roles, setRoles] = useState<{ID: string, Name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users"); // users, roles, departments
  const [searchQuery, setSearchQuery] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);

  const filteredUsers = users.filter(user => 
    (user.Name && user.Name.toLowerCase().includes(searchQuery.toLowerCase())) || 
    (user.Email && user.Email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const fetchAllData = async () => {
    try {
      const [usersData, deptsData, rolesData] = await Promise.all([
        apiGet<User[] | { users: User[] }>("/admin/users"),
        apiGet<{ ID: string; Name: string }[]>("/admin/departments"),
        apiGet<{ ID: string; Name: string }[]>("/admin/roles")
      ]);

      setUsers(Array.isArray(usersData) ? usersData : usersData.users || []);
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchAllData();
    };
    loadData();
  }, []);

  const handleUpdateUser = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      department_id: (form.elements.namedItem("department") as HTMLSelectElement).value || null,
      role_id: (form.elements.namedItem("role") as HTMLSelectElement).value || null,
    };
    
    try {
      await apiPut(`/admin/users/${userId}`, data);
      fetchAllData();
      alert(t("admin.userUpdated"));
    } catch (error) {
      console.error(error);
      alert(t("admin.userUpdateError"));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
    };
    
    try {
      await apiPost("/admin/users", data);
      fetchAllData();
      alert(t("admin.userAdded"));
    } catch (error) {
      console.error(error);
      alert(t("admin.userAddError"));
    }
  };

  const handleAddDepartment = async () => {
    if (!newDeptName) return;
    try {
      await apiPost("/admin/departments", { Name: newDeptName });
      setNewDeptName("");
      setIsAddDeptOpen(false);
      fetchAllData();
      alert(t("admin.deptAdded"));
    } catch (error) {
      console.error(error);
      alert(t("admin.deptAddError"));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f0f0f]">
      {/* Header */}
      <div className="flex-none p-8 pb-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] transition-colors">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t("admin.title")}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t("admin.subtitle")}</p>
        
        {/* Tabs */}
        <div className="flex gap-4 mt-6">
          <TabButton 
            active={activeTab === "users"} 
            onClick={() => setActiveTab("users")} 
            icon={<Users size={18} />} 
            label={t("admin.usersTab")} 
          />
          <TabButton 
            active={activeTab === "roles"} 
            onClick={() => setActiveTab("roles")} 
            icon={<Shield size={18} />} 
            label={t("admin.rolesTab")} 
          />
          <TabButton 
            active={activeTab === "departments"} 
            onClick={() => setActiveTab("departments")} 
            icon={<Building2 size={18} />} 
            label={t("admin.departmentsTab")} 
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === "users" && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="relative">
                <Search className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("admin.searchUser")} 
                  className="ps-4 pe-10 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand w-64 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-2">
                <Dialog open={isAddDeptOpen} onOpenChange={setIsAddDeptOpen}>
                  <DialogTrigger className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-2 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                    <Building2 size={16} />
                    {t("admin.addDept")}
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle>{t("admin.addNewDept")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-end text-sm font-medium">{t("admin.deptName")}</label>
                        <input title={t("admin.deptName")} aria-label={t("admin.deptName")} value={newDeptName} onChange={e => setNewDeptName(e.target.value)} className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm dark:text-slate-100" placeholder={t("admin.deptNamePlaceholder")} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddDepartment} className="bg-brand hover:bg-brand text-white w-full">{t("admin.saveDept")}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger className="bg-brand hover:bg-brand text-white flex items-center gap-2 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                    <Plus size={16} />
                    {t("admin.addUser")}
                  </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]" dir="rtl">
                  <form onSubmit={handleAddUser}>
                    <DialogHeader>
                      <DialogTitle>{t("admin.addNewUser")}</DialogTitle>
                      <DialogDescription>
                        {t("admin.addNewUserDesc")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-end text-sm font-medium">{t("admin.name")}</label>
                        <input id="name" name="name" required className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:text-slate-100" placeholder={t("admin.namePlaceholder")} />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="email" className="text-end text-sm font-medium">{t("admin.email")}</label>
                        <input id="email" name="email" required type="email" className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:text-slate-100" placeholder="ahmed@septimus.local" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-brand hover:bg-brand text-white w-full">{t("admin.saveUser")}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-end">
                <thead className="bg-slate-50 dark:bg-[#121212] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{t("admin.name")}</th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{t("admin.emailColumn")}</th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{t("admin.deptColumn")}</th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{t("admin.roleColumn")}</th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">{t("admin.actionsColumn")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">{t("admin.loading")}</td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">{t("admin.noUsers")}</td>
                    </tr>
                  ) : (
                    filteredUsers.map(user => (
                      <tr key={user.ID} className="hover:bg-slate-50 dark:hover:bg-[#121212] transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-100 font-medium">{user.Name || user.Email.split('@')[0]}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{user.Email}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{user.Department?.Name || t("admin.noDept")}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                            {typeof user.Role === 'string' ? user.Role : (user.Role?.Name || t("admin.regularMember"))}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <Dialog>
                            <DialogTrigger className="text-brand hover:text-brand hover:bg-brand-light px-3 py-1 rounded-md text-sm font-medium transition-colors">
                              {t("admin.edit")}
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]" dir="rtl">
                              <form onSubmit={(e) => handleUpdateUser(e, user.ID)}>
                                <DialogHeader>
                                  <DialogTitle>{t("admin.editUser")}</DialogTitle>
                                  <DialogDescription>
                                    {t("admin.editUserDesc")} {user.Name || user.Email.split('@')[0]}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <label className="text-end text-sm font-medium">{t("admin.name")}</label>
                                    <input title={t("admin.name")} aria-label={t("admin.name")} name="name" defaultValue={user.Name || user.Email.split('@')[0]} className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm dark:text-slate-100" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <label className="text-end text-sm font-medium">{t("admin.email")}</label>
                                    <input title={t("admin.email")} aria-label={t("admin.email")} name="email" type="email" defaultValue={user.Email} className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm dark:text-slate-100" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <label className="text-end text-sm font-medium">{t("admin.deptColumn")}</label>
                                    <select title={t("admin.deptColumn")} aria-label={t("admin.deptColumn")} name="department" defaultValue={user.DepartmentID || ""} className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm dark:text-slate-100">
                                      <option value="">{t("admin.noDept")}</option>
                                      {departments.map(d => <option key={d.ID} value={d.ID}>{d.Name}</option>)}
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                    <label className="text-end text-sm font-medium">{t("admin.roleColumn")}</label>
                                    <select title={t("admin.roleColumn")} aria-label={t("admin.roleColumn")} name="role" defaultValue={user.RoleID || ""} className="col-span-3 flex h-10 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm dark:text-slate-100">
                                      <option value="">{t("admin.noRole")}</option>
                                      {roles.map(r => <option key={r.ID} value={r.ID}>{r.Name}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button type="submit" className="bg-brand hover:bg-brand text-white w-full">{t("admin.saveChanges")}</Button>
                                </DialogFooter>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "roles" && (
          <div className="h-full min-h-[600px]">
            <PermissionsMatrix />
          </div>
        )}

        {activeTab === "departments" && (
          <div className="h-full min-h-[600px]">
            <OrgChartContainer />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors font-medium text-sm ${
        active 
          ? "border-brand text-brand" 
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
