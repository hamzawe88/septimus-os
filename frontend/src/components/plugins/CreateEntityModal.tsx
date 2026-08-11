import React, { useState } from "react";

import { X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface CreateEntityModalProps {
  pluginType: "lead" | "invoice" | "leave_request";
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateEntityModal({ pluginType, onClose, onSuccess }: CreateEntityModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { t } = useLocalization();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      
      const res = await fetchWithAuth(`${API_BASE_URL}/entities`, {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          entity_type: pluginType,
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
      console.error("Failed to create entity:", err);
      alert(t("plugins.createEntityFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card text-foreground w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <h2 className="text-lg font-semibold text-foreground capitalize">
            Create New {pluginType.replace("_", " ")}
          </h2>
          <button aria-label="Close modal" onClick={onClose} className="p-2 text-muted-foreground hover:text-muted-foreground rounded-md hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto">
          <form id="create-entity-form" onSubmit={handleSubmit} className="space-y-4">
            
            {pluginType === "lead" && (
              <>
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-foreground mb-1">Company Name</label>
                  <input id="company" required name="company" type="text" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="contact_person" className="block text-sm font-medium text-foreground mb-1">Contact Person</label>
                  <input id="contact_person" required name="contact_person" type="text" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">Contact Email</label>
                  <input id="email" required name="email" type="email" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">Phone Number</label>
                  <input id="phone" name="phone" type="tel" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="value" className="block text-sm font-medium text-foreground mb-1">Estimated Value ($)</label>
                  <input id="value" required name="value" type="number" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="status_lead" className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <select id="status_lead" name="status" defaultValue="new" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </>
            )}

            {pluginType === "invoice" && (
              <>
                <div>
                  <label htmlFor="client_name" className="block text-sm font-medium text-foreground mb-1">Client Name</label>
                  <input id="client_name" required name="client_name" type="text" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1">Amount ($)</label>
                  <input id="amount" required name="amount" type="number" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="due_date" className="block text-sm font-medium text-foreground mb-1">Due Date</label>
                  <input id="due_date" required name="due_date" type="date" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="status_invoice" className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <select id="status_invoice" name="status" defaultValue="pending" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </>
            )}

            {pluginType === "leave_request" && (
              <>
                <div>
                  <label htmlFor="employee" className="block text-sm font-medium text-foreground mb-1">Employee Name</label>
                  <input id="employee" required name="employee" type="text" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-foreground mb-1">Start Date</label>
                  <input id="start_date" required name="start_date" type="date" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="end_date" className="block text-sm font-medium text-foreground mb-1">End Date</label>
                  <input id="end_date" required name="end_date" type="date" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-foreground mb-1">Reason</label>
                  <input id="reason" required name="reason" type="text" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="status_leave" className="block text-sm font-medium text-foreground mb-1">Status</label>
                  <select id="status_leave" name="status" defaultValue="pending" className="w-full bg-card border border-border rounded-lg p-2.5 text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted flex justify-end gap-3 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button type="submit" form="create-entity-form" disabled={loading} className="bg-brand hover:bg-brand/90 text-white">
            {loading ? "Saving..." : (
              <>
                <Save className="w-4 h-4 me-2" /> Save {pluginType.replace("_", " ")}
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
