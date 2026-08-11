/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { X, Ticket as TicketIcon, Save, User, Flag, CheckCircle, AlignLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface EditTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ticket: any | null;
}

export default function EditTicketModal({ isOpen, onClose, onSuccess, ticket }: EditTicketModalProps) {
  const { t } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => ({
    title: ticket?.name || ticket?.data?.subject || "",
    customer: ticket?.data?.customer_name || "",
    priority: ticket?.data?.priority || "medium",
    status: ticket?.data?.status || "open",
    assignedTo: ticket?.data?.assigned_team || "",
    description: ticket?.data?.description || "",
  }));

  if (!isOpen || !ticket) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiPatch(`/crm/tickets/${ticket.id}`, {
        expected_record_version: ticket.record_version,
		subject: formData.title,
		customer_name: formData.customer,
		description: formData.description,
        priority: formData.priority,
        status: formData.status,
        assigned_team: formData.assignedTo,
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
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-muted border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-light flex items-center justify-center text-brand">
              <TicketIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t("crm.editForm.title")} #{ticket.id.substring(0, 8)}</h2>
              <p className="text-xs text-muted-foreground">{t("crm.editForm.description")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-muted/60 hover:text-muted-foreground rounded-full transition-colors"
            title={t("common.close")}
            aria-label={t("common.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="edit-ticket-title" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <TicketIcon className="w-4 h-4 text-muted-foreground" />
              {t("crm.editForm.subject")}
            </label>
            <input
              id="edit-ticket-title"
              placeholder={t("crm.editForm.subjectPlaceholder")}
              type="text"
              required
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-ticket-customer" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-muted-foreground" />
                {t("crm.forms.customerName")}
              </label>
              <input
                id="edit-ticket-customer"
                placeholder={t("crm.editForm.customerPlaceholder")}
                type="text"
                required
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                value={formData.customer}
                onChange={(e) => setFormData({...formData, customer: e.target.value})}
              />
            </div>

            <div>
              <label htmlFor="edit-ticket-assignee" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <User className="w-4 h-4 text-muted-foreground" />
                {t("crm.assignee")}
              </label>
              <input
                id="edit-ticket-assignee"
                placeholder={t("crm.editForm.assigneePlaceholder")}
                type="text"
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
                value={formData.assignedTo}
                onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-ticket-priority" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-muted-foreground" />
                {t("crm.priority")}
              </label>
              <select
                id="edit-ticket-priority"
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all bg-card"
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
              >
                <option value="low">{t("crm.ticketPriority.low")}</option>
                <option value="medium">{t("crm.ticketPriority.medium")}</option>
                <option value="high">{t("crm.ticketPriority.high")}</option>
                <option value="urgent">{t("crm.ticketPriority.urgent")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-ticket-status" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                {t("crm.status")}
              </label>
              <select
                id="edit-ticket-status"
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all bg-card"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
              >
                <option value="open">{t("crm.ticketStatus.open")}</option>
                <option value="in_progress">{t("crm.ticketStatus.in_progress")}</option>
                <option value="resolved">{t("crm.ticketStatus.resolved")}</option>
                <option value="closed">{t("crm.ticketStatus.closed")}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="edit-ticket-description" className="block text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <AlignLeft className="w-4 h-4 text-muted-foreground" />
              {t("crm.editForm.details")}
            </label>
            <textarea
              id="edit-ticket-description"
              placeholder={t("crm.editForm.detailsPlaceholder")}
              rows={3}
              className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all resize-none"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl px-5">
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90 text-white rounded-xl px-6 gap-2">
              <Save className="w-4 h-4" />
              {loading ? t("common.saving") : t("common.saveChanges")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
