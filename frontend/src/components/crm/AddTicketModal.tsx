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
  const { t } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    customer: "",
    priority: "medium",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiPost("/crm/tickets", {
        subject: formData.title,
        customer_name: formData.customer,
        priority: formData.priority,
        channel: "portal",
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
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 end-4 p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-full transition-colors"
          title={t("common.close")} aria-label={t("common.close")}>
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-foreground mb-6">{t("crm.forms.createTicket")}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-1" className="block text-sm font-medium text-foreground mb-1">{t("crm.forms.ticketTitle")}</label>
            <input placeholder={t("crm.forms.ticketTitle")} id="field-1" title={t("crm.forms.ticketTitle")} aria-label={t("crm.forms.ticketTitle")}
              type="text"
              required
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-2" className="block text-sm font-medium text-foreground mb-1">{t("crm.forms.customerName")}</label>
            <input placeholder={t("crm.forms.customerName")} id="field-2" title={t("crm.forms.customerName")} aria-label={t("crm.forms.customerName")}
              type="text"
              required
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.customer}
              onChange={(e) => setFormData({...formData, customer: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-3" className="block text-sm font-medium text-foreground mb-1">{t("crm.priority")}</label>
            <select id="field-3" title={t("crm.priority")} aria-label={t("crm.priority")}
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.priority}
              onChange={(e) => setFormData({...formData, priority: e.target.value})}
            >
              <option value="low">{t("crm.ticketPriority.low")}</option>
              <option value="medium">{t("crm.ticketPriority.medium")}</option>
              <option value="high">{t("crm.ticketPriority.high")}</option>
              <option value="urgent">{t("crm.ticketPriority.urgent")}</option>
            </select>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? t("common.saving") : t("crm.forms.createTicket")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
