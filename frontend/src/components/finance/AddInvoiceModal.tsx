"use client";

import React, { useState } from "react";
import { X, Plus, Trash2, Building2, FileText, Calculator, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LineItem } from "./InvoicePrintModal";

interface AddInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddInvoiceModal({ isOpen, onClose, onSuccess }: AddInvoiceModalProps) {
  const { t } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => ({
    invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    clientName: "",
    clientCompany: "",
    clientTaxId: "",
    clientEmail: "",
    clientAddress: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    status: "pending",
    paymentTerms: t("finance.dueOnReceipt"),
    bankIban: "SA98 1000 0000 1234 5678 9012",
    notes: t("finance.invoiceNotesDefault"),
  }));

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0, discountRate: 0, taxRate: 15 },
  ]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Math.random().toString(36).substring(2, 9),
        description: "",
        quantity: 1,
        unitPrice: 0,
        discountRate: 0,
        taxRate: 15,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const numValue = field === "description" ? value : Number(value) || 0;
          return { ...item, [field]: numValue };
        }
        return item;
      })
    );
  };

  // Real-time calculation engine
  const computedSubtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const computedDiscount = lineItems.reduce(
    (acc, item) => acc + (item.quantity * item.unitPrice * item.discountRate) / 100,
    0
  );
  const computedTax = lineItems.reduce(
    (acc, item) =>
      acc + ((item.quantity * item.unitPrice * (1 - item.discountRate / 100)) * item.taxRate) / 100,
    0
  );
  const computedGrandTotal = computedSubtotal - computedDiscount + computedTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      await apiPost(`/entities?workspace_id=${workspaceId}`, {
        type: "finance_invoice",
        name: `${t("finance.invoiceLabel")} - ${formData.clientName || formData.clientCompany} (${formData.invoiceNumber})`,
        data: {
          ...formData,
          lineItems,
          subtotal: computedSubtotal,
          totalDiscount: computedDiscount,
          totalTax: computedTax,
          amount: computedGrandTotal,
          client_name: formData.clientName, // legacy mapping
          due_date: formData.dueDate, // legacy mapping
          date: formData.issueDate,
          created_at: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to add invoice", err);
      alert(t("finance.addInvoiceError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t("finance.issueNewInvoice")}</h2>
              <p className="text-xs text-slate-500">{t("finance.invoiceSystemDesc")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-8 flex-1">
          {/* Section 1: Invoice Header & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div>
              <label htmlFor="inv-number" className="block text-xs font-bold text-slate-700 mb-1">{t("finance.invoiceNumber")}</label>
              <input
                id="inv-number"
                title={t("finance.invoiceNumber")}
                aria-label={t("finance.invoiceNumber")}
                type="text"
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-brand outline-none"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="inv-status" className="block text-xs font-bold text-slate-700 mb-1">{t("finance.invoiceStatus")}</label>
              <select
                id="inv-status"
                title={t("finance.invoiceStatus")}
                aria-label={t("finance.invoiceStatus")}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-brand outline-none"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="pending">{t("finance.statusPending")}</option>
                <option value="paid">{t("finance.statusPaid")}</option>
                <option value="overdue">{t("finance.statusOverdue")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="inv-issue-date" className="block text-xs font-bold text-slate-700 mb-1">{t("finance.issueDate")}</label>
              <input
                id="inv-issue-date"
                title={t("finance.issueDate")}
                aria-label={t("finance.issueDate")}
                type="date"
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-brand outline-none"
                value={formData.issueDate}
                onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="inv-due-date" className="block text-xs font-bold text-slate-700 mb-1">{t("finance.dueDate")}</label>
              <input
                id="inv-due-date"
                title={t("finance.dueDate")}
                aria-label={t("finance.dueDate")}
                type="date"
                required
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:ring-2 focus:ring-brand outline-none"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>

          {/* Section 2: Client & Tax Details */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-brand" />
              {t("finance.clientTaxDetails")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="client-name" className="block text-xs font-semibold text-slate-600 mb-1">{t("finance.clientName")} <span className="text-rose-500">*</span></label>
                <input
                  id="client-name"
                  title={t("finance.clientName")}
                  aria-label={t("finance.clientName")}
                  type="text"
                  required
                  placeholder={t("finance.clientNamePlaceholder")}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="client-company" className="block text-xs font-semibold text-slate-600 mb-1">{t("finance.clientCompany")} <span className="text-rose-500">*</span></label>
                <input
                  id="client-company"
                  title={t("finance.clientCompany")}
                  aria-label={t("finance.clientCompany")}
                  type="text"
                  required
                  placeholder={t("finance.clientCompanyPlaceholder")}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
                  value={formData.clientCompany}
                  onChange={(e) => setFormData({ ...formData, clientCompany: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="client-tax-id" className="block text-xs font-semibold text-slate-600 mb-1">{t("finance.clientTaxId")}</label>
                <input
                  id="client-tax-id"
                  title={t("finance.clientTaxId")}
                  aria-label={t("finance.clientTaxId")}
                  type="text"
                  placeholder={t("finance.clientTaxIdPlaceholder")}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-brand outline-none"
                  value={formData.clientTaxId}
                  onChange={(e) => setFormData({ ...formData, clientTaxId: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="client-address" className="block text-xs font-semibold text-slate-600 mb-1">{t("finance.clientAddress")}</label>
                <input
                  id="client-address"
                  title={t("finance.clientAddress")}
                  aria-label={t("finance.clientAddress")}
                  type="text"
                  placeholder={t("finance.clientAddressPlaceholder")}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-brand outline-none"
                  value={formData.clientAddress}
                  onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="client-email" className="block text-xs font-semibold text-slate-600 mb-1">{t("finance.clientEmail")}</label>
                <input
                  id="client-email"
                  title={t("finance.clientEmail")}
                  aria-label={t("finance.clientEmail")}
                  type="email"
                  placeholder="billing@client.com"
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-brand outline-none"
                  value={formData.clientEmail}
                  onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Line Items Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-brand" />
                {t("finance.lineItemsTable")}
              </h3>
              <Button
                type="button"
                onClick={handleAddItem}
                variant="outline"
                size="sm"
                className="gap-1.5 text-brand border-brand/30 hover:bg-brand/5 font-semibold text-xs"
                title={t("finance.addInvoiceItem")}
                aria-label={t("finance.addInvoiceItem")}
              >
                <Plus className="w-3.5 h-3.5" />
                {t("finance.addItem")}
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-slate-50/40">
              <table className="w-full text-end border-collapse min-w-[650px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
                    <th className="py-3 px-3 w-5/12">{t("finance.descriptionLabel")}</th>
                    <th className="py-3 px-2 w-2/12 text-center">{t("finance.quantityLabel")}</th>
                    <th className="py-3 px-2 w-2/12 text-start">{t("finance.unitPriceLabel")}</th>
                    <th className="py-3 px-2 w-1/12 text-center">{t("finance.discountLabel")}</th>
                    <th className="py-3 px-2 w-1/12 text-center">{t("finance.taxLabel")}</th>
                    <th className="py-3 px-3 w-1/12 text-start">{t("finance.totalLabel")}</th>
                    <th className="py-3 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {lineItems.map((item, idx) => {
                    const sub = item.quantity * item.unitPrice;
                    const disc = (sub * item.discountRate) / 100;
                    const tax = ((sub - disc) * item.taxRate) / 100;
                    const tot = sub - disc + tax;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <input
                            title={t("finance.descriptionTitle")}
                            aria-label={t("finance.descriptionTitle")}
                            type="text"
                            required
                            placeholder={`${t("finance.itemNum")} ${idx + 1}: ${t("finance.itemDescPlaceholder")}`}
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-brand outline-none font-medium"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            title={t("finance.quantityTitle")}
                            aria-label={t("finance.quantityTitle")}
                            type="number"
                            min="1"
                            required
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center font-mono font-medium focus:ring-1 focus:ring-brand outline-none"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            title={t("finance.unitPriceTitle")}
                            aria-label={t("finance.unitPriceTitle")}
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-start font-mono font-medium focus:ring-1 focus:ring-brand outline-none"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            title={t("finance.discountTitle")}
                            aria-label={t("finance.discountTitle")}
                            type="number"
                            min="0"
                            max="100"
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center font-mono text-slate-600 focus:ring-1 focus:ring-brand outline-none"
                            value={item.discountRate}
                            onChange={(e) => handleItemChange(item.id, "discountRate", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            title={t("finance.taxTitle")}
                            aria-label={t("finance.taxTitle")}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center font-mono text-slate-600 focus:ring-1 focus:ring-brand outline-none bg-white"
                            value={item.taxRate}
                            onChange={(e) => handleItemChange(item.id, "taxRate", e.target.value)}
                          >
                            <option value={15}>15%</option>
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                          </select>
                        </td>
                        <td className="p-2 text-start font-mono font-bold text-slate-800">
                          ${tot.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={lineItems.length === 1}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors disabled:opacity-30"
                            title={t("finance.removeItem")}
                            aria-label={t("finance.removeItem")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Auto Calculation Summary Box */}
            <div className="mt-4 flex justify-end">
              <div className="w-full md:w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{t("finance.subtotalLabel")}</span>
                  <span className="font-mono font-semibold">${computedSubtotal.toFixed(2)}</span>
                </div>
                {computedDiscount > 0 && (
                  <div className="flex justify-between text-xs text-rose-600 font-medium">
                    <span>{t("finance.totalDiscountLabel")}</span>
                    <span className="font-mono">-${computedDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{t("finance.vatLabel")}</span>
                  <span className="font-mono font-semibold">${computedTax.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>{t("finance.grandTotalLabel")}</span>
                  <span className="font-mono text-lg text-brand">${computedGrandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Payment Terms & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
            <div>
              <label htmlFor="pay-terms" className="block text-xs font-semibold text-slate-700 mb-1">{t("finance.paymentTermsLabel")}</label>
              <select
                id="pay-terms"
                title={t("finance.paymentTermsLabel")}
                aria-label={t("finance.paymentTermsLabel")}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-brand outline-none mb-3"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              >
                <option value="due_on_receipt">{t("finance.dueOnReceipt")}</option>
                <option value="net_15">{t("finance.net15")}</option>
                <option value="net_30">{t("finance.net30")}</option>
              </select>

              <label htmlFor="iban-field" className="block text-xs font-semibold text-slate-700 mb-1">{t("finance.ibanLabel")}</label>
              <input
                id="iban-field"
                title={t("finance.ibanLabel")}
                aria-label={t("finance.ibanLabel")}
                type="text"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-brand outline-none"
                value={formData.bankIban}
                onChange={(e) => setFormData({ ...formData, bankIban: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="inv-notes" className="block text-xs font-semibold text-slate-700 mb-1">{t("finance.invoiceNotesLabel")}</label>
              <textarea
                id="inv-notes"
                title={t("finance.invoiceNotesLabel")}
                aria-label={t("finance.invoiceNotesLabel")}
                rows={4}
                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-brand outline-none resize-none"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{t("finance.aiJSONBNote")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="px-6 font-semibold">
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-brand hover:bg-brand/90 text-white px-8 font-bold shadow-md"
              >
                {loading ? t("finance.savingInvoice") : t("finance.issueInvoiceBtn")}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
