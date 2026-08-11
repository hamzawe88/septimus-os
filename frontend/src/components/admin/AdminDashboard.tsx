"use client";

import React, { useState, useEffect } from "react";
import { Users, Shield, Building2, Search, Plus, Sparkles, Activity } from "lucide-react";
import { apiGet, apiPut, apiPost } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import SaaSPlansManager from "./SaaSPlansManager";
import PaymentSettings from "./PaymentSettings";
import AuditLogsView from "./AuditLogsView";
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
import { useAppStore } from "@/store/useAppStore";

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
  const { t, isRtl } = useLocalization();
  const { isSidebarOpen } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<{ID: string, Name: string}[]>([]);
  const [roles, setRoles] = useState<{ID: string, Name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users"); // users, roles, departments, logs, saas
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
    <div className="flex flex-col h-full bg-muted dark:bg-slate-900 transition-colors" dir={isRtl ? "rtl" : "ltr"}>
      {/* Premium Header */}
      <div className="flex-none p-8 md:p-10 border-b border-border/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl transition-colors relative overflow-hidden">
        <div className="absolute -top-40 -end-40 w-96 h-96 bg-brand/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground dark:text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-brand" />
            {t("admin.title")}
          </h1>
          <p className="text-muted-foreground dark:text-muted-foreground mt-2 font-medium max-w-2xl">{t("admin.subtitle")}</p>
          
          {/* Tabs */}
          <div className="flex gap-2 md:gap-4 mt-8 overflow-x-auto pb-2 scrollbar-none">
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
            <TabButton 
              active={activeTab === "logs"} 
              onClick={() => setActiveTab("logs")} 
              icon={<Activity size={18} />} 
              label={t('admin.logsTab')} 
            />
            <TabButton 
              active={activeTab === "saas"} 
              onClick={() => setActiveTab("saas")} 
              icon={<Sparkles size={18} />} 
              label={t('admin.saasTab', 'SaaS Plans')} 
            />
            <TabButton 
              active={activeTab === "gateways"} 
              onClick={() => setActiveTab("gateways")} 
              icon={<Building2 size={18} />} 
              label={t('admin.gatewaysTab', 'Payment Gateways')} 
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {activeTab === "users" && (
          <div className={`bg-white/80 dark:bg-[#222529] backdrop-blur-xl rounded-[2rem] border border-border dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-300 mx-auto ${isSidebarOpen ? 'max-w-7xl' : 'max-w-full'}`}>
            <div className="p-6 md:p-8 border-b border-border dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="relative w-full md:w-auto">
                <Search className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("admin.searchUser")} 
                  className="w-full md:w-80 px-5 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-foreground dark:text-slate-100 placeholder:text-muted-foreground transition-all shadow-inner"
                />
              </div>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <Dialog open={isAddDeptOpen} onOpenChange={setIsAddDeptOpen}>
                  <DialogTrigger className="bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground dark:text-slate-300 flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-bold transition-all shadow-sm flex-1 md:flex-none">
                    <Building2 size={18} />
                    {t("admin.addDept")}
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-card dark:bg-slate-950 border-border dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
                    <DialogHeader className="p-6 pb-0 md:p-8 md:pb-0">
                      <DialogTitle className="text-2xl font-black text-foreground dark:text-white">{t("admin.addNewDept")}</DialogTitle>
                    </DialogHeader>
                    <div className="p-6 md:p-8 space-y-5">
                      <div>
                        <label className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.deptName")}</label>
                        <input title={t("admin.deptName")} aria-label={t("admin.deptName")} value={newDeptName} onChange={e => setNewDeptName(e.target.value)} className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all" placeholder={t("admin.deptNamePlaceholder")} />
                      </div>
                    </div>
                    <DialogFooter className="p-6 md:p-8 pt-0 border-t border-border dark:border-slate-800 mt-4">
                      <Button onClick={handleAddDepartment} className="bg-brand hover:bg-brand/90 text-white w-full rounded-xl h-12 font-bold shadow-md shadow-brand/20 text-base">{t("admin.saveDept")}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger className="bg-brand hover:bg-brand/90 text-white flex items-center justify-center gap-2 h-12 px-6 rounded-xl font-bold transition-all shadow-md shadow-brand/20 flex-1 md:flex-none">
                    <Plus size={18} />
                    {t("admin.addUser")}
                  </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-card dark:bg-slate-950 border-border dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
                  <form onSubmit={handleAddUser}>
                    <DialogHeader className="p-6 pb-0 md:p-8 md:pb-0">
                      <DialogTitle className="text-2xl font-black text-foreground dark:text-white">{t("admin.addNewUser")}</DialogTitle>
                      <DialogDescription className="mt-2 text-muted-foreground font-medium">
                        {t("admin.addNewUserDesc")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 md:p-8 space-y-5">
                      <div>
                        <label htmlFor="name" className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.name")}</label>
                        <input id="name" name="name" required className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100" placeholder={t("admin.namePlaceholder")} />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.email")}</label>
                        <input id="email" name="email" required type="email" className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100" placeholder="ahmed@septimus.local" />
                      </div>
                    </div>
                    <DialogFooter className="p-6 md:p-8 pt-0 border-t border-border dark:border-slate-800 mt-4">
                      <Button type="submit" className="bg-brand hover:bg-brand/90 text-white w-full rounded-xl h-12 font-bold shadow-md shadow-brand/20 text-base">{t("admin.saveUser")}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              </div>
            </div>
            
            <div className="divide-y divide-border dark:divide-slate-800">
              {isLoading ? (
                <div className="p-12 flex justify-center">
                  <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center text-muted-foreground dark:text-muted-foreground">
                  <Users className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{t("admin.noUsers")}</p>
                </div>
              ) : (
                filteredUsers.map(user => (
                  <div key={user.ID} className="p-6 md:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-muted dark:hover:bg-slate-800/50 transition-colors gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full">
                      <div>
                        <h3 className="font-bold text-foreground dark:text-slate-100 text-lg">{user.Name || user.Email.split('@')[0]}</h3>
                        <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">{user.Email}</p>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{t("admin.deptColumn")}</span>
                        <span className="text-sm font-medium text-foreground dark:text-slate-300">
                          {user.Department?.Name || t("admin.noDept")}
                        </span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{t("admin.roleColumn")}</span>
                        <div>
                          <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold shadow-sm inline-block">
                            {typeof user.Role === 'string' ? user.Role : (user.Role?.Name || t("admin.regularMember"))}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center w-full sm:w-auto mt-4 sm:mt-0">
                      <Dialog>
                        <DialogTrigger className="w-full sm:w-auto rounded-xl h-10 px-6 border border-border dark:border-slate-700 text-muted-foreground dark:text-slate-300 font-bold hover:bg-muted dark:hover:bg-slate-800 transition-colors">
                          {t("admin.edit")}
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-card dark:bg-slate-950 border-border dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
                          <form onSubmit={(e) => handleUpdateUser(e, user.ID)}>
                            <DialogHeader className="p-6 pb-0 md:p-8 md:pb-0">
                              <DialogTitle className="text-2xl font-black text-foreground dark:text-white">{t("admin.editUser")}</DialogTitle>
                              <DialogDescription className="mt-2 text-muted-foreground font-medium">
                                {t("admin.editUserDesc")} {user.Name || user.Email.split('@')[0]}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="p-6 md:p-8 space-y-5">
                              <div>
                                <label className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.name")}</label>
                                <input title={t("admin.name")} aria-label={t("admin.name")} name="name" defaultValue={user.Name || user.Email.split('@')[0]} className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100" />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.email")}</label>
                                <input title={t("admin.email")} aria-label={t("admin.email")} name="email" type="email" defaultValue={user.Email} className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100" />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.deptColumn")}</label>
                                <select title={t("admin.deptColumn")} aria-label={t("admin.deptColumn")} name="department" defaultValue={user.DepartmentID || ""} className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100 cursor-pointer">
                                  <option value="">{t("admin.noDept")}</option>
                                  {departments.map(d => <option key={d.ID} value={d.ID}>{d.Name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-foreground dark:text-slate-300 mb-2 uppercase tracking-wide">{t("admin.roleColumn")}</label>
                                <select title={t("admin.roleColumn")} aria-label={t("admin.roleColumn")} name="role" defaultValue={user.RoleID || ""} className="w-full px-4 h-12 bg-muted dark:bg-slate-900 border border-border dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-foreground dark:text-slate-100 cursor-pointer">
                                  <option value="">{t("admin.noRole")}</option>
                                  {roles.map(r => <option key={r.ID} value={r.ID}>{r.Name}</option>)}
                                </select>
                              </div>
                            </div>
                            <DialogFooter className="p-6 md:p-8 pt-0 border-t border-border dark:border-slate-800 mt-4">
                              <Button type="submit" className="bg-brand hover:bg-brand/90 text-white w-full rounded-xl h-12 font-bold shadow-md shadow-brand/20 text-base">{t("admin.saveChanges")}</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))
              )}
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

        {activeTab === "logs" && (
          <div className="h-full min-h-[600px]">
            <AuditLogsView />
          </div>
        )}

        {activeTab === "saas" && (
          <div className="h-full min-h-[600px]">
            <SaaSPlansManager />
          </div>
        )}

        {activeTab === "gateways" && (
          <div className="h-full min-h-[600px]">
            <PaymentSettings />
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
      className={`flex items-center gap-2 px-5 py-3 rounded-full transition-all font-bold text-sm whitespace-nowrap ${
        active 
          ? "bg-brand text-white shadow-md shadow-brand/30" 
          : "bg-transparent text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-slate-800 hover:text-foreground dark:hover:text-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
