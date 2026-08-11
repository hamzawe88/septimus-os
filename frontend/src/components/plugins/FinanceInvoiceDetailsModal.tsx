"use client";

import React, { useState } from "react";
import { X, Save, Printer, FileText } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { InvoiceEntity } from "./FinanceInvoicesView";
import InvoicePrintModal, { SMEInvoiceData } from "../finance/InvoicePrintModal";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";

interface FinanceInvoiceDetailsModalProps {
  invoice: InvoiceEntity;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FinanceInvoiceDetailsModal({ invoice, onClose, onSuccess }: FinanceInvoiceDetailsModalProps) {
  const { t, formatCurrency } = useLocalization();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<Record<string, any>>(invoice.data || {});
  const [loading, setLoading] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";

      const res = await fetchWithAuth(`${API_BASE_URL}/entities/${invoice.id}?workspace_id=${workspaceId}`, {
        method: "PUT",
        body: JSON.stringify({
          data: formData,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update invoice:", err);
      alert(t("plugins.updateInvoiceFailed"));
    } finally {
      setLoading(false);
    }
  };

  const invNumber = formData.invoiceNumber || formData.invoice_number || `INV-${invoice.id.slice(0, 6)}`;
  const clientName = formData.clientName || formData.client_name || "Unknown Client";
  const clientCompany = formData.clientCompany || "";
  const lineItems = Array.isArray(formData.lineItems) ? formData.lineItems : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card text-foreground w-full max-w-3xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>{t("invoice_details")}:</span>
                <span className="font-mono text-brand">{invNumber}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{clientName} {clientCompany ? `(${clientCompany})` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 text-brand border-brand/30 hover:bg-brand/5 font-semibold text-xs"
              title={t("print_pdf")}
              aria-label={t("print_pdf")}
            >
              <Printer className="w-4 h-4" />
              <span>{t("print_pdf")}</span>
            </Button>
            <button
              aria-label={t("close_modal")}
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-muted-foreground rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <form id="update-invoice-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted p-4 rounded-xl border border-border">
              <div>
                <label htmlFor="client_name" className="block text-xs font-bold text-foreground mb-1">
                  {t("client_name")}
                </label>
                <input
                  id="client_name"
                  required
                  name="client_name"
                  type="text"
                  value={formData.client_name || formData.clientName || ""}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm font-semibold text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="clientCompany" className="block text-xs font-bold text-foreground mb-1">
                  {t("company")}
                </label>
                <input
                  id="clientCompany"
                  name="clientCompany"
                  type="text"
                  value={formData.clientCompany || ""}
                  placeholder={t("company_name")}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="status" className="block text-xs font-bold text-foreground mb-1">
                  {t("status")}
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status || "pending"}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm font-bold text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                >
                  <option value="pending">{t("status_pending")}</option>
                  <option value="paid">{t("status_paid")}</option>
                  <option value="overdue">{t("status_overdue")}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="amount" className="block text-xs font-bold text-foreground mb-1">
                  {t("total_amount")}
                </label>
                <input
                  id="amount"
                  required
                  name="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount || formData.subtotal || ""}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm font-mono font-bold text-brand focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="date" className="block text-xs font-bold text-foreground mb-1">
                  {t("issue_date")}
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  value={formData.date || formData.issueDate || ""}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm font-mono text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="due_date" className="block text-xs font-bold text-foreground mb-1">
                  {t("due_date")}
                </label>
                <input
                  id="due_date"
                  required
                  name="due_date"
                  type="date"
                  value={formData.due_date || formData.dueDate || ""}
                  className="w-full bg-card border border-border rounded-lg p-2.5 text-sm font-mono text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow"
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {/* Line items read-only summary if present */}
            {lineItems.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-foreground mb-2">{t("invoice_line_items")}:</h3>
                <div className="border border-border rounded-xl overflow-hidden bg-muted">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-muted font-bold text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-2.5 text-start">{t("description")}</th>
                        <th className="p-2.5 text-end">{t("quantity")}</th>
                        <th className="p-2.5 text-end">{t("unit_price")}</th>
                        <th className="p-2.5 text-end">{t("total")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {lineItems.map((item: Record<string, string | number>, idx: number) => {
                        const sub = (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
                        return (
                          <tr key={idx} className="hover:bg-muted/50">
                            <td className="p-2 font-medium text-foreground">{item.description}</td>
                            <td className="p-2 text-center font-mono">{item.quantity}</td>
                            <td className="p-2 text-start font-mono">{formatCurrency(Number(item.unitPrice))}</td>
                            <td className="p-2 text-start font-mono font-bold">{formatCurrency(sub)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="notes" className="block text-xs font-bold text-foreground mb-1">
                {t("notes_iban")}
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes || ""}
                placeholder={t("notes_iban_placeholder")}
                className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow resize-none"
                onChange={handleInputChange}
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted flex justify-between items-center">
          <div className="text-xs text-muted-foreground font-mono">
            {t("created_at")}: {new Date(String(invoice.created_at)).toLocaleString()}
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="px-5 font-semibold"
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="update-invoice-form"
              disabled={loading}
              className="px-6 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2 shadow-md bg-brand"
            >
              {loading ? t("saving") : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t("save_changes")}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Print Modal */}
      {isPrintModalOpen && (
        <InvoicePrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          invoiceData={formData as SMEInvoiceData}
          invoiceId={invoice.id}
        />
      )}
    </div>
  );
}
