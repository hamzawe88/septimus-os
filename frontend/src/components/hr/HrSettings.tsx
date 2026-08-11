"use client";

import React, { useState, useEffect } from "react";
import { Settings, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { PageHeader } from "@/components/ui/page-header";

interface HrPolicyEntity {
  id: string;
  name: string;
  type: string;
  data?: {
    maxUsersOnLeavePerDept?: number;
    requireManagerApproval?: boolean;
    autoApproveSickLeave?: boolean;
    maxConsecutiveLeaveDays?: number;
  };
}

interface CreateEntityResponse {
  id?: string;
}

export default function HrSettings() {
  const { t } = useLocalization();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [policyId, setPolicyId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState({
    maxUsersOnLeavePerDept: 2,
    requireManagerApproval: true,
    autoApproveSickLeave: false,
    maxConsecutiveLeaveDays: 14,
  });



  useEffect(() => {
    let cancelled = false;
    const loadPolicy = async () => {
      try {
        const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
        const res = await apiGet<{data: HrPolicyEntity[]}>(`/entities?workspace_id=${workspaceId}&type=hr_policy`);
        if (cancelled) return;
        if (res.data && res.data.length > 0) {
          const policyEntity = res.data[0];
          setPolicyId(policyEntity.id);
          if (policyEntity.data) {
            setSettings({
              maxUsersOnLeavePerDept: policyEntity.data.maxUsersOnLeavePerDept ?? 2,
              requireManagerApproval: policyEntity.data.requireManagerApproval ?? true,
              autoApproveSickLeave: policyEntity.data.autoApproveSickLeave ?? false,
              maxConsecutiveLeaveDays: policyEntity.data.maxConsecutiveLeaveDays ?? 14,
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch HR policy", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadPolicy();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      if (policyId) {
        await apiPut(`/entities/${policyId}?workspace_id=${workspaceId}`, {
          name: "HR General Policy",
          type: "hr_policy",
          data: settings
        });
      } else {
        const res = await apiPost<CreateEntityResponse>(`/entities?workspace_id=${workspaceId}`, {
          name: "HR General Policy",
          type: "hr_policy",
          data: settings
        });
        if (res.id) {
          setPolicyId(res.id);
        }
      }
      // Simple notification
      alert(t("hr.settingsSaved"));
    } catch (err) {
      console.error("Failed to save policy", err);
      alert(t("hr.settingsFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<Settings className="w-6 h-6 text-brand" />}
        title={t("hr.hrSettings")}
        description={t("hr.hrSettingsDesc")}
      />

      <div className="p-8 max-w-3xl">
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 space-y-6">
            
            {/* Setting 1 */}
            <div className="flex flex-col gap-2">
              <label htmlFor="maxUsersOnLeavePerDept" className="text-sm font-semibold text-foreground">
                {t("hr.maxLeavePerDept")}
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="maxUsersOnLeavePerDept"
                  title={t("hr.maxLeavePerDept")}
                  aria-label={t("hr.maxLeavePerDept")}
                  type="number"
                  min="1"
                  className="w-24 px-3 py-2 border border-border rounded-md focus:border-brand focus:outline-none"
                  value={settings.maxUsersOnLeavePerDept}
                  onChange={(e) => setSettings({ ...settings, maxUsersOnLeavePerDept: parseInt(e.target.value) || 1 })}
                />
                <span className="text-sm text-muted-foreground">{t("hr.employees")}</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {t("hr.maxLeavePerDeptDesc")}
              </p>
            </div>

            <hr className="border-border" />

            {/* Setting 2 */}
            <div className="flex flex-col gap-2">
              <label htmlFor="maxConsecutiveLeaveDays" className="text-sm font-semibold text-foreground">
                {t("hr.maxConsecutiveDays")}
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="maxConsecutiveLeaveDays"
                  title={t("hr.maxConsecutiveDays")}
                  aria-label={t("hr.maxConsecutiveDays")}
                  type="number"
                  min="1"
                  className="w-24 px-3 py-2 border border-border rounded-md focus:border-brand focus:outline-none"
                  value={settings.maxConsecutiveLeaveDays}
                  onChange={(e) => setSettings({ ...settings, maxConsecutiveLeaveDays: parseInt(e.target.value) || 1 })}
                />
                <span className="text-sm text-muted-foreground">{t("hr.days")}</span>
              </div>
            </div>

            <hr className="border-border" />

            {/* Setting 3 */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{t("hr.managerApproval")}</h4>
                <p className="text-xs text-muted-foreground mt-1">{t("hr.managerApprovalDesc")}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <span className="sr-only">{t("hr.managerApproval")}</span>
                <input
                  title={t("hr.managerApproval")}
                  aria-label={t("hr.managerApproval")}
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.requireManagerApproval}
                  onChange={(e) => setSettings({ ...settings, requireManagerApproval: e.target.checked })}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>

            <hr className="border-border" />

            {/* Setting 4 */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{t("hr.autoApproveSick")}</h4>
                <p className="text-xs text-muted-foreground mt-1">{t("hr.autoApproveSickDesc")}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <span className="sr-only">{t("hr.autoApproveSick")}</span>
                <input
                  title={t("hr.autoApproveSick")}
                  aria-label={t("hr.autoApproveSick")}
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.autoApproveSickLeave}
                  onChange={(e) => setSettings({ ...settings, autoApproveSickLeave: e.target.checked })}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
              </label>
            </div>

          </div>
          
          <div className="bg-muted p-4 border-t border-border flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="bg-brand hover:bg-brand/90 gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? t("common.saving") : t("common.saveChanges")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
