import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AddTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddTicketModal({ isOpen, onClose, onSuccess }: AddTicketModalProps) {
  const { isRtl } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    customer: "",
    priority: "medium",
    status: "open",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      await apiPost("/entities", {
        workspace_id: workspaceId,
        entity_type: "ticket",
        data: {
          name: formData.title,
          customer: formData.customer,
          priority: formData.priority,
          status: formData.status,
          created_at: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to add ticket", err);
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

        <h2 className="text-xl font-bold text-slate-800 mb-6">Create New Ticket</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-1" className="block text-sm font-medium text-slate-700 mb-1">Ticket Title</label>
            <input placeholder="Ticket Title" id="field-1" title="Ticket Title" aria-label="Ticket Title" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>
          
          <div>
            <label htmlFor="field-2" className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
            <input placeholder="Customer Name" id="field-2" title="Customer Name" aria-label="Customer Name" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.customer}
              onChange={(e) => setFormData({...formData, customer: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-3" className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
            <select id="field-3" title="Priority" aria-label="Priority" 
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.priority}
              onChange={(e) => setFormData({...formData, priority: e.target.value})}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="outline" onClick={onClose}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? "Saving..." : "Create Ticket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
