import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddLeadModal({ isOpen, onClose, onSuccess }: AddLeadModalProps) {
  const { isRtl } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    company: "",
    value: "",
    status: "new",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }
      await apiPost("/entities", {
        workspace_id: workspaceId,
        entity_type: "lead",
        data: {
          name: formData.title,
          company: formData.company,
          value: Number(formData.value) || 0,
          status: formData.status,
          created_at: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to add lead", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 end-4 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
          title="Close" aria-label="Close">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-800 mb-6">Add New Lead</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-1" className="block text-sm font-medium text-slate-700 mb-1">Lead / Deal Name</label>
            <input placeholder="Lead / Deal Name" id="field-1" title="Lead / Deal Name" aria-label="Lead / Deal Name" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>
          
          <div>
            <label htmlFor="field-2" className="block text-sm font-medium text-slate-700 mb-1">Company</label>
            <input placeholder="Company Name" id="field-2" title="Company Name" aria-label="Company Name" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-3" className="block text-sm font-medium text-slate-700 mb-1">Expected Value ($)</label>
            <input placeholder="Expected Value ($)" id="field-3" title="Expected Value ($)" aria-label="Expected Value ($)" 
              type="number" 
              required
              min="0"
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-4" className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
            <select id="field-4" title="Stage" aria-label="Stage" 
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="proposal">Proposal</option>
              <option value="won">Closed Won</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="outline" onClick={onClose}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? "Saving..." : "Save Lead"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
