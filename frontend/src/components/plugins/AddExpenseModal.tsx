"use client";

import React, { useState } from "react";
import { X, Save, Receipt, Camera, ShieldCheck, DollarSign, Building2 } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ExpenseLineItem {
  description: string;
  amount: number;
  vat_amount: number;
}

interface AddExpenseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddExpenseModal({ onClose, onSuccess }: AddExpenseModalProps) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [supplierVatNo, setSupplierVatNo] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("general");
  const [notes, setNotes] = useState("");
  const [subtotal, setSubtotal] = useState<number>(0);

  const vatAmount = subtotal * 0.15;
  const totalAmount = subtotal + vatAmount;

  const [expenseRef] = useState(() => `EXP-${Date.now().toString().slice(-6)}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";

      const expenseData: ExpenseLineItem = {
        description: supplierName,
        amount: subtotal,
        vat_amount: vatAmount,
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({
          entity_type: "finance_expense",
          name: `${expenseRef} - ${supplierName || "Expense"}`,
          data: {
            expense_ref: expenseRef,
            expense_type: category,
            supplier_name: supplierName,
            supplier_vat_no: supplierVatNo,
            invoice_number: invoiceNumber,
            invoice_date: invoiceDate,
            subtotal: subtotal,
            vat_amount: vatAmount,
            total_amount: totalAmount,
            status: "recorded",
            notes,
            line_items: [expenseData],
            created_date: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record expense.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-rose-900 text-white border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Receipt className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("record_expense")}</h2>
              <p className="text-xs text-slate-300">{t("ref")}: {expenseRef}</p>
            </div>
          </div>
          <button type="button" aria-label={t("close_modal")} onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* AI OCR Hint Banner */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Camera className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700">{t("ai_ocr_coming_soon")}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t("ai_ocr_desc")}</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">⚠️ {errorMsg}</div>
          )}

          <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label htmlFor="supplier_name" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("supplier_name")} *</label>
                <div className="relative">
                  <Building2 className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                  <input id="supplier_name" required type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-slate-900 focus:border-rose-500 outline-none`} placeholder={t("supplier_name_placeholder")} />
                </div>
              </div>
              <div>
                <label htmlFor="supplier_vat_no" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("supplier_vat_no")}</label>
                <div className="relative">
                  <ShieldCheck className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                  <input id="supplier_vat_no" type="text" value={supplierVatNo} onChange={e => setSupplierVatNo(e.target.value)} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm font-mono text-slate-900 focus:border-rose-500 outline-none`} placeholder="3XXXXXXXXXXXXXXX3" />
                </div>
              </div>
              <div>
                <label htmlFor="invoice_number" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("invoice_number")}</label>
                <input id="invoice_number" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 focus:border-rose-500 outline-none" placeholder="INV-001" />
              </div>
              <div>
                <label htmlFor="invoice_date" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("invoice_date")}</label>
                <input id="invoice_date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-rose-500 outline-none" />
              </div>
              <div>
                <label htmlFor="category" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("expense_category")}</label>
                <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-rose-500 outline-none">
                  <option value="general">{t("cat_general")}</option>
                  <option value="office_supplies">{t("cat_office_supplies")}</option>
                  <option value="utilities">{t("cat_utilities")}</option>
                  <option value="travel">{t("cat_travel")}</option>
                  <option value="marketing">{t("cat_marketing")}</option>
                  <option value="software">{t("cat_software")}</option>
                  <option value="maintenance">{t("cat_maintenance")}</option>
                  <option value="payroll">{t("cat_payroll")}</option>
                </select>
              </div>
            </div>

            {/* Amount Inputs */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <label htmlFor="subtotal" className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  {t("subtotal_before_vat")} *
                </label>
                <div className="relative">
                  <DollarSign className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                  <input
                    id="subtotal"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={subtotal || ""}
                    onChange={e => setSubtotal(Number(e.target.value))}
                    className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm font-mono text-slate-900 focus:border-rose-500 outline-none`}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("vat_amount")}:</span>
                <span className="font-mono font-semibold text-rose-600">{formatCurrency(vatAmount)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold">
                <span className="text-slate-800">{t("total_including_vat")}:</span>
                <span className="font-mono text-lg text-slate-900">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <div>
              <label htmlFor="expense_notes" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("notes")}</label>
              <textarea id="expense_notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:border-rose-500 outline-none resize-none" placeholder={t("notes_placeholder")} />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors">
            {t("cancel")}
          </button>
          <button
            type="submit"
            form="expense-form"
            disabled={loading}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loading ? t("recording") : t("record_expense")}
          </button>
        </div>

      </div>
    </div>
  );
}
