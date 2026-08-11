import React, { useState } from "react";
import { X, Save } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import { LeaveRequestEntity } from "./HRLeaveRequestsView";

interface HRLeaveDetailsModalProps {
  leaveReq: LeaveRequestEntity;
  onClose: () => void;
  onSuccess: () => void;
}

export default function HRLeaveDetailsModal({ leaveReq, onClose, onSuccess }: HRLeaveDetailsModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<Record<string, any>>(leaveReq.data || {});
  const [loading, setLoading] = useState(false);
  const { t } = useLocalization();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      
      const res = await fetchWithAuth(`${API_BASE_URL}/entities/${leaveReq.id}?workspace_id=${workspaceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          data: formData
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update leave request:", err);
      alert(t("plugins.updateLeaveFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card text-foreground w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <h2 className="text-lg font-semibold text-foreground">
            {t("plugins.hr.leaveRequest")} {formData.employee || t("common.unknown")}
          </h2>
          <button aria-label="Close modal" onClick={onClose} className="p-2 text-muted-foreground hover:text-muted-foreground rounded-md hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto">
          <form id="update-leave-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="employee" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.employeeName")}</label>
                <input id="employee" required name="employee" type="text" value={formData.employee || ""} className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.status")}</label>
                <select id="status" name="status" value={formData.status || "pending"} className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange}>
                  <option value="pending">{t("plugins.hr.pending")}</option>
                  <option value="approved">{t("plugins.hr.approved")}</option>
                  <option value="rejected">{t("plugins.hr.rejected")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="start_date" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.startDate")}</label>
                <input id="start_date" required name="start_date" type="date" value={formData.start_date || ""} className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow text-start" dir="ltr" onChange={handleInputChange} />
              </div>
              <div>
                <label htmlFor="end_date" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.endDate")}</label>
                <input id="end_date" required name="end_date" type="date" value={formData.end_date || ""} className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow text-start" dir="ltr" onChange={handleInputChange} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="reason" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.reason")}</label>
                <input id="reason" required name="reason" type="text" value={formData.reason || ""} className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
              </div>
            </div>

            <div>
              <label htmlFor="manager_notes" className="block text-sm font-medium text-foreground mb-1">{t("plugins.hr.managerNotes")}</label>
              <textarea 
                id="manager_notes" 
                name="manager_notes" 
                rows={4} 
                value={formData.manager_notes || ""} 
                placeholder={t("plugins.hr.notesPlaceholder")}
                className="w-full bg-card border border-border rounded-lg p-3 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow resize-none" 
                onChange={handleInputChange} 
              />
            </div>
            
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted flex justify-between items-center">
          <div className="text-xs text-muted-foreground" dir="ltr">
            {t("plugins.hr.created")} {new Date(String(leaveReq.created_at)).toLocaleString()}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 font-medium rounded-lg text-muted-foreground hover:bg-muted transition-colors">
              {t("common.cancel")}
            </button>
            { }
            <button 
              type="submit" 
              form="update-leave-form" 
              disabled={loading} 
              className="px-4 py-2 font-medium rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center bg-brand"
            >
              {loading ? t("common.saving") : (
                <>
                  <Save className="w-4 h-4 ltr:me-2 rtl:ms-2" />
                  {t("common.saveChanges")}
                </>
              )}
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
