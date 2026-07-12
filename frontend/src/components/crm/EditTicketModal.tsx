/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { X, Ticket as TicketIcon, Save, User, Flag, CheckCircle, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface EditTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ticket: any | null;
}

export default function EditTicketModal({ isOpen, onClose, onSuccess, ticket }: EditTicketModalProps) {
  const { isRtl } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => ({
    title: ticket?.name || ticket?.data?.subject || "",
    customer: ticket?.data?.customer || "",
    priority: ticket?.data?.priority || "medium",
    status: ticket?.data?.status || "open",
    assignedTo: ticket?.data?.assignedTo || "",
    description: ticket?.data?.description || "",
  }));

  if (!isOpen || !ticket) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      
      const updatedData = {
        ...(ticket.data || {}),
        subject: formData.title,
        customer: formData.customer,
        priority: formData.priority,
        status: formData.status,
        assignedTo: formData.assignedTo,
        description: formData.description,
      };

      await apiPut(`/entities/${ticket.id}?workspace_id=${workspaceId}`, {
        name: formData.title,
        data: updatedData,
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update ticket", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-light flex items-center justify-center text-brand">
              <TicketIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{isRtl ? "تعديل التذكرة #" : "Edit Ticket #"}{ticket.id.substring(0, 8)}</h2>
              <p className="text-xs text-slate-500">{isRtl ? "تحديث الحالة والمسؤول والبيانات الأساسية" : "Update status, assignee and basic info"}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 rounded-full transition-colors"
            title={isRtl ? "إغلاق" : "Close"} 
            aria-label={isRtl ? "إغلاق" : "Close"}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="edit-ticket-title" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <TicketIcon className="w-4 h-4 text-slate-400" />
              {isRtl ? "موضوع التذكرة" : "Ticket Subject"}
            </label>
            <input 
              id="edit-ticket-title" 
              placeholder={isRtl ? "عنوان أو موضوع التذكرة" : "Ticket title or subject"} 
              type="text" 
              required
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-ticket-customer" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                {isRtl ? "اسم العميل" : "Customer Name"}
              </label>
              <input 
                id="edit-ticket-customer" 
                placeholder={isRtl ? "اسم العميل أو الشركة" : "Customer or company name"} 
                type="text" 
                required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                value={formData.customer}
                onChange={(e) => setFormData({...formData, customer: e.target.value})}
              />
            </div>

            <div>
              <label htmlFor="edit-ticket-assignee" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                {isRtl ? "المسؤول عن الحل" : "Assignee"}
              </label>
              <input 
                id="edit-ticket-assignee" 
                placeholder={isRtl ? "مثال: أحمد محمد / الدعم الفني" : "e.g. John Doe / Tech Support"} 
                type="text" 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                value={formData.assignedTo}
                onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-ticket-priority" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-slate-400" />
                {isRtl ? "الأولوية" : "Priority"}
              </label>
              <select 
                id="edit-ticket-priority" 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all bg-white"
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
              >
                <option value="low">{isRtl ? "منخفضة" : "Low"}</option>
                <option value="medium">{isRtl ? "متوسطة" : "Medium"}</option>
                <option value="high">{isRtl ? "عالية" : "High"}</option>
                <option value="urgent">{isRtl ? "عاجلة جداً" : "Urgent"}</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-ticket-status" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-slate-400" />
                {isRtl ? "حالة التذكرة" : "Ticket Status"}
              </label>
              <select 
                id="edit-ticket-status" 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all bg-white"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
              >
                <option value="open">{isRtl ? "مفتوحة" : "Open"}</option>
                <option value="in_progress">{isRtl ? "قيد المعالجة" : "In Progress"}</option>
                <option value="resolved">{isRtl ? "محلولة" : "Resolved"}</option>
                <option value="closed">{isRtl ? "مغلقة" : "Closed"}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="edit-ticket-description" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <AlignLeft className="w-4 h-4 text-slate-400" />
              {isRtl ? "تفاصيل وملاحظات التذكرة" : "Details and Notes"}
            </label>
            <textarea 
              id="edit-ticket-description" 
              placeholder={isRtl ? "أدخل وصف المشكلة أو ملاحظات المعالجة..." : "Enter problem description or processing notes..."} 
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all resize-none"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl px-5">
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90 text-white rounded-xl px-6 gap-2">
              <Save className="w-4 h-4" />
              {loading ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
