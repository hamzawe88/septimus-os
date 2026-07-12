"use client";

import React, { useState, useRef } from "react";
import { X, Save, Receipt, Camera, Loader2, ShieldCheck, DollarSign, Building2, FileImage, CheckCircle2 } from "lucide-react";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddExpenseModal({ isOpen, onClose, onSuccess }: AddExpenseModalProps) {
  const { t, secondaryCurrency, formatCurrency } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Use lazy initialization to avoid calling Date.now() on every render
  const [expenseRef] = useState(() => `EXP-${String(Date.now()).slice(-6)}`);

  const [supplierName, setSupplierName] = useState("");
  const [supplierVatNo, setSupplierVatNo] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("general");
  const [notes, setNotes] = useState("");
  const [subtotal, setSubtotal] = useState<number>(0);
  const [useSecondaryCurrency, setUseSecondaryCurrency] = useState(false);

  const vatAmount = subtotal * 0.15;
  const totalAmount = subtotal + vatAmount;

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setOcrProcessing(true);
    setOcrDone(false);
    // Simulate AI OCR extraction (2.2s demo)
    setTimeout(() => {
      const demo = {
        supplierName: t("finance.demoSupplierName"),
        supplierVatNo: "310123456700003",
        invoiceNumber: `INV-${Math.floor(Math.random() * 9000) + 1000}`,
        subtotal: Math.round((Math.random() * 2000 + 500) * 100) / 100,
        category: "software",
      };
      setSupplierName(demo.supplierName);
      setSupplierVatNo(demo.supplierVatNo);
      setInvoiceNumber(demo.invoiceNumber);
      setSubtotal(demo.subtotal);
      setCategory(demo.category);
      setOcrProcessing(false);
      setOcrDone(true);
    }, 2200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      await apiPost(`/entities?workspace_id=${workspaceId}`, {
        type: "finance_expense",
        name: `${expenseRef} - ${supplierName || "Expense"}`,
        data: {
          expense_ref: expenseRef,
          expense_type: category,
          supplier_name: supplierName,
          supplier_vat_no: supplierVatNo,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          subtotal,
          vat_amount: vatAmount,
          total_amount: totalAmount,
          status: "recorded",
          notes,
          ocr_extracted: ocrDone,
          created_date: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t("finance.recordExpenseError", "Failed to record expense."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-rose-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Receipt className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t("finance.addExpenseTitle")}</h2>
              <p className="text-xs text-slate-300">Ref: {expenseRef}</p>
            </div>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-300" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {/* Hidden file input — accessibility via aria-label on wrapper */}
          <input
            ref={fileInputRef}
            type="file"
            id="receipt_file"
            accept="image/*,application/pdf"
            aria-label={t("finance.uploadReceiptImage")}
            title={t("finance.uploadReceiptImage")}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* AI OCR Upload Card */}
          <div
            role="button"
            tabIndex={0}
            aria-label={t("finance.uploadForOcr")}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-4 cursor-pointer transition-all text-center ${
              ocrDone
                ? "border-emerald-400 bg-emerald-50"
                : ocrProcessing
                ? "border-blue-300 bg-blue-50 pointer-events-none"
                : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {ocrProcessing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm font-bold text-blue-700">{t("finance.aiReadingInvoice")}</p>
                <p className="text-xs text-blue-500">{t("finance.autoExtracting")}</p>
              </div>
            ) : ocrDone ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <p className="text-sm font-bold text-emerald-700">{t("finance.extractSuccess")}</p>
                <p className="text-xs text-emerald-600">{t("finance.reviewExtracted")}</p>
              </div>
            ) : previewUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Receipt preview" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                <div className="text-start">
                  <p className="text-sm font-semibold text-slate-700">{t("finance.receiptUploaded")}</p>
                  <p className="text-xs text-slate-400">{t("finance.clickToChange")}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Camera className="w-8 h-8 text-indigo-500" />
                  <FileImage className="w-4 h-4 text-indigo-300 absolute -bottom-1 -end-1" />
                </div>
                <p className="text-sm font-bold text-indigo-700">{t("finance.scanWithAI")}</p>
                <p className="text-xs text-slate-500">{t("finance.scanWithAIDesc")}</p>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">⚠️ {errorMsg}</div>
          )}

          {/* Manual Form */}
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="exp_supplier" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.supplierNameLabel")}</label>
              <div className="relative">
                <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="exp_supplier" required type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl ps-9 pe-3 py-2.5 text-sm focus:border-rose-500 outline-none" placeholder={t("finance.supplierNamePlaceholder")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exp_vat" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.supplierVatLabel")}</label>
                <div className="relative">
                  <ShieldCheck className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="exp_vat" type="text" value={supplierVatNo} onChange={e => setSupplierVatNo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl ps-9 pe-3 py-2.5 text-sm font-mono focus:border-rose-500 outline-none" placeholder="3XXXXXXXXXXXXXXX3" />
                </div>
              </div>
              <div>
                <label htmlFor="exp_inv_no" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.invoiceNumberLabel")}</label>
                <input id="exp_inv_no" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-rose-500 outline-none" placeholder="INV-001" />
              </div>
              <div>
                <label htmlFor="exp_date" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.invoiceDateLabel")}</label>
                <input id="exp_date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-rose-500 outline-none" />
              </div>
              <div>
                <label htmlFor="exp_cat" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.expenseCategoryLabel")}</label>
                <select id="exp_cat" value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:border-rose-500 outline-none">
                  <option value="general">{t("finance.catGeneral")}</option>
                  <option value="office_supplies">{t("finance.catOfficeSupplies")}</option>
                  <option value="utilities">{t("finance.catUtilities")}</option>
                  <option value="travel">{t("finance.catTravel")}</option>
                  <option value="marketing">{t("finance.catMarketing")}</option>
                  <option value="software">{t("finance.catSoftware")}</option>
                  <option value="maintenance">{t("finance.catMaintenance")}</option>
                  <option value="payroll">{t("finance.catPayroll")}</option>
                </select>
              </div>
            </div>

            {/* Amount Section */}
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3">
              <div>
                <label htmlFor="exp_subtotal" className="block text-xs font-semibold text-slate-600 uppercase mb-1 flex justify-between">
                  <span>{t("finance.subtotalBeforeTax")}</span>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setUseSecondaryCurrency(!useSecondaryCurrency)}>
                    <input type="checkbox" checked={useSecondaryCurrency} onChange={() => setUseSecondaryCurrency(!useSecondaryCurrency)} className="cursor-pointer" />
                    <span className="text-[10px] uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      Use Secondary ({secondaryCurrency})
                    </span>
                  </div>
                </label>
                <div className="relative">
                  <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input id="exp_subtotal" required type="number" min="0" step="0.01" value={subtotal || ""} onChange={e => setSubtotal(Number(e.target.value))}
                    className="w-full bg-white border border-rose-200 rounded-xl ps-9 pe-3 py-2.5 text-sm font-mono focus:border-rose-500 outline-none" placeholder="0.00" />
                </div>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("finance.vat15Label")}</span>
                <span className="font-mono font-bold text-rose-700">{formatCurrency(vatAmount, useSecondaryCurrency)}</span>
              </div>
              <div className="border-t border-rose-200 pt-2 flex justify-between font-bold text-slate-800">
                <span>{t("finance.totalWithTaxLabel")}</span>
                <span className="font-mono text-xl text-slate-900">{formatCurrency(totalAmount, useSecondaryCurrency)}</span>
              </div>
            </div>

            <div>
              <label htmlFor="exp_notes" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("finance.notesLabel")}</label>
              <textarea id="exp_notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none resize-none" />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50">
            {t("common.cancel")}
          </button>
          <button type="submit" form="expense-form" disabled={loading || ocrProcessing}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" />
            {loading ? t("common.saving") : t("finance.saveExpenseBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
