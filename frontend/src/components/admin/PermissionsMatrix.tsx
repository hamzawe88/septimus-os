import React, { useState, useEffect } from "react";
import { Check, X, Shield, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface Permission {
  ID: string;
  Module: string;
  Name: string; // The action name basically
}

interface Role {
  ID: string;
  Name: string;
  Description: string;
}

interface RolePermission {
  RoleID: string;
  PermissionID: string;
}

interface MatrixRole {
  id: string;
  name: string;
  permissions: string[];
}

interface MatrixPermission {
  id: string;
  module: string;
  action: string;
}

export default function PermissionsMatrix() {
  const { t } = useLocalization();
  const [roles, setRoles] = useState<MatrixRole[]>([]);
  const [permissions, setPermissions] = useState<MatrixPermission[]>([]);
  const [originalRolePerms, setOriginalRolePerms] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadMatrixData = async () => {
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      fetchWithAuth(`${API_BASE_URL}/admin/roles`, {}),
      fetchWithAuth(`${API_BASE_URL}/admin/permissions`, {}),
      fetchWithAuth(`${API_BASE_URL}/admin/role_permissions`, {})
    ]);

    if (!(rolesRes.ok && permsRes.ok && rpRes.ok)) return null;

    const rolesData: Role[] = await rolesRes.json();
    const permsData: Permission[] = await permsRes.json();
    const rpData: RolePermission[] = await rpRes.json();
    return { rolesData, permsData, rpData };
  };

  const applyMatrixData = ({ rolesData, permsData, rpData }: { rolesData: Role[]; permsData: Permission[]; rpData: RolePermission[] }) => {
    const mappedPerms: MatrixPermission[] = permsData.map(p => ({
      id: p.ID,
      module: p.Module,
      action: p.Name
    }));

    const mappedRoles: MatrixRole[] = rolesData.map(r => ({
      id: r.ID,
      name: r.Name,
      permissions: rpData.filter(rp => rp.RoleID === r.ID).map(rp => rp.PermissionID)
    }));

    setPermissions(mappedPerms);
    setRoles(mappedRoles);
    setOriginalRolePerms(rpData);
  };

  const fetchData = async () => {
    try {
      const result = await loadMatrixData();
      if (result) applyMatrixData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadMatrixData()
      .then((result) => {
        if (!cancelled && result) applyMatrixData(result);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePermission = (roleId: string, permissionId: string) => {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r;
      const hasPerm = r.permissions.includes(permissionId);
      return {
        ...r,
        permissions: hasPerm 
          ? r.permissions.filter(id => id !== permissionId)
          : [...r.permissions, permissionId]
      };
    }));
  };

  const savePermissions = async () => {
    setIsSaving(true);
    try {
      const headers = { "Content-Type": "application/json" };

      // Figure out what to add and what to delete
      const currentRolePerms: RolePermission[] = [];
      roles.forEach(r => {
        r.permissions.forEach(p => {
          currentRolePerms.push({ RoleID: r.id, PermissionID: p });
        });
      });

      const toAdd = currentRolePerms.filter(crp => 
        !originalRolePerms.some(orp => orp.RoleID === crp.RoleID && orp.PermissionID === crp.PermissionID)
      );
      
      const toDelete = originalRolePerms.filter(orp => 
        !currentRolePerms.some(crp => crp.RoleID === orp.RoleID && crp.PermissionID === orp.PermissionID)
      );

      // Perform API calls sequentially or in Promise.all
      const promises = [];
      for (const a of toAdd) {
        promises.push(fetchWithAuth(`${API_BASE_URL}/admin/permissions/assign`, {
          method: "POST",
          headers,
          body: JSON.stringify({ role_id: a.RoleID, permission_id: a.PermissionID })
        }));
      }
      for (const d of toDelete) {
        promises.push(fetchWithAuth(`${API_BASE_URL}/admin/roles/${d.RoleID}/permissions/${d.PermissionID}`, {
          method: "DELETE",
          headers
        }));
      }

      await Promise.all(promises);
      
      alert(t("admin.permissionsMatrix.saveSuccess"));
      fetchData(); // Refresh data
    } catch (err) {
      console.error(err);
      alert(t("admin.permissionsMatrix.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">{t("admin.permissionsMatrix.loading")}</div>;
  }

  const modules = Array.from(new Set(permissions.map(p => p.module)));

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full transition-colors">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#121212]">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand" />
            {t("admin.permissionsMatrix.title")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("admin.permissionsMatrix.subtitle")}</p>
        </div>
        <Button 
          onClick={savePermissions} 
          disabled={isSaving}
          className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2"
        >
          {isSaving ? t("common.saving") : <><Save className="w-4 h-4" /> {t("common.saveChanges")}</>}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-0">
        <table className="w-full text-start border-collapse">
          <thead className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-4 border-b border-e border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300 w-1/3 bg-white dark:bg-[#1a1a1a]">
                {t("admin.permissionsMatrix.modulePermission")}
              </th>
              {roles.map(role => (
                <th key={role.id} className="p-4 border-b border-e border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300 text-center w-48 bg-white dark:bg-[#1a1a1a]">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map(moduleName => {
              const modulePerms = permissions.filter(p => p.module === moduleName);
              return (
                <React.Fragment key={moduleName}>
                  <tr className="bg-slate-50 dark:bg-slate-800/30">
                    <td colSpan={roles.length + 1} className="p-3 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200 text-sm">
                      {t(`admin.permissionsMatrix.modules.${moduleName}`, moduleName)}
                    </td>
                  </tr>
                  
                  {modulePerms.map(perm => (
                    <tr key={perm.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors bg-white dark:bg-[#1a1a1a]">
                      <td className="p-3 border-b border-e border-slate-200 dark:border-slate-800">
                        <div className="font-medium text-slate-700 dark:text-slate-300 text-sm">{t(`admin.permissionsMatrix.actions.${perm.action}`, perm.action)}</div>
                      </td>
                      {roles.map(role => {
                        const hasPerm = role.permissions.includes(perm.id);
                        return (
                          <td key={`${role.id}-${perm.id}`} className="p-3 border-b border-e border-slate-200 dark:border-slate-800 text-center align-middle">
                            <button
                              onClick={() => togglePermission(role.id, perm.id)}
                              className={`w-8 h-8 rounded flex items-center justify-center mx-auto transition-colors ${
                                hasPerm 
                                  ? "bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:hover:bg-brand/30" 
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-500 dark:hover:text-slate-400"
                              }`}
                              title={hasPerm ? t("admin.permissionsMatrix.revoke") : t("admin.permissionsMatrix.grant")}
                            >
                              {hasPerm ? <Check className="w-5 h-5" /> : <X className="w-4 h-4" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {permissions.length === 0 && (
              <tr>
                <td colSpan={roles.length + 1} className="p-8 text-center text-slate-500 dark:text-slate-400">
                  {t("admin.permissionsMatrix.noPermissions")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
