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
  const { t, baseCurrency } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    company: "",
    value: "",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiPost("/crm/opportunities", {
        title: formData.title,
        company: formData.company,
        value: Number(formData.value) || 0,
        stage: "new",
        currency: baseCurrency,
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
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 end-4 p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-full transition-colors"
          title={t("common.close")} aria-label={t("common.close")}>
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-foreground mb-6">{t("crm.forms.addLead")}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-1" className="block text-sm font-medium text-foreground mb-1">{t("crm.forms.leadName")}</label>
            <input placeholder={t("crm.forms.leadName")} id="field-1" title={t("crm.forms.leadName")} aria-label={t("crm.forms.leadName")}
              type="text"
              required
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-2" className="block text-sm font-medium text-foreground mb-1">{t("crm.forms.company")}</label>
            <input placeholder={t("crm.forms.companyPlaceholder")} id="field-2" title={t("crm.forms.company")} aria-label={t("crm.forms.company")}
              type="text"
              required
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.company}
              onChange={(e) => setFormData({...formData, company: e.target.value})}
            />
          </div>

          <div>
            <label htmlFor="field-3" className="block text-sm font-medium text-foreground mb-1">{t("crm.forms.expectedValue")}</label>
            <input placeholder={t("crm.forms.expectedValue")} id="field-3" title={t("crm.forms.expectedValue")} aria-label={t("crm.forms.expectedValue")}
              type="number"
              required
              min="0"
              className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
            />
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? t("common.saving") : t("crm.forms.saveLead")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
