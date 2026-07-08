import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerModal({ isOpen, onClose, onSuccess }: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    status: "active",
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
          name: formData.name,
          email: formData.email,
          company: formData.company,
          status: formData.status,
          created_at: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to add customer", err);
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

        <h2 className="text-xl font-bold text-slate-800 mb-6">Add New Customer</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-1" className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
            <input placeholder="Customer Name" id="field-1" title="Customer Name" aria-label="Customer Name" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          
          <div>
            <label htmlFor="field-2" className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input placeholder="Email Address" id="field-2" title="Email Address" aria-label="Email Address" 
              type="email" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-3" className="block text-sm font-medium text-slate-700 mb-1">Company</label>
            <input placeholder="Company Name" id="field-3" title="Company Name" aria-label="Company Name" 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
