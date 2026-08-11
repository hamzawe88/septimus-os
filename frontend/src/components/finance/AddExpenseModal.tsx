"use client";

import React, { useEffect, useState, useRef } from "react";
import { X, Save, Receipt, Camera, ShieldCheck, DollarSign, Building2, FileImage } from "lucide-react";
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState("");

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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setReceiptFileName(file.name);
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
          ocr_extracted: false,
          created_date: new Date().toISOString(),
        },
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t("finance.recordExpenseError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card text-foreground w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-muted to-destructive text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-card/10 rounded-lg">
              <Receipt className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t("finance.addExpenseTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("finance.referenceLabel")}: {expenseRef}</p>
            </div>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="p-2 hover:bg-card/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
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

          {/* Local receipt preview. OCR is not advertised until a real extraction endpoint is connected. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={t("finance.uploadReceiptImage")}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-border bg-muted p-4 text-center transition-all hover:border-brand/20 hover:bg-brand-light"
          >
            {previewUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={t("finance.receiptPreviewAlt")} className="w-12 h-12 object-cover rounded-lg border border-border" />
                <div className="text-start">
                  <p className="text-sm font-semibold text-foreground">{t("finance.receiptUploaded")}</p>
                  <p className="max-w-72 truncate text-xs text-muted-foreground">{receiptFileName}</p>
                  <p className="text-xs text-warning">{t("finance.receiptLocalOnly")}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Camera className="w-8 h-8 text-brand" />
                  <FileImage className="w-4 h-4 text-brand absolute -bottom-1 -end-1" />
                </div>
                <p className="text-sm font-bold text-brand">{t("finance.chooseReceipt")}</p>
                <p className="text-xs text-muted-foreground">{t("finance.receiptManualEntry")}</p>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm">⚠️ {errorMsg}</div>
          )}

          {/* Manual Form */}
          <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="exp_supplier" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.supplierNameLabel")}</label>
              <div className="relative">
                <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input id="exp_supplier" required type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl ps-9 pe-3 py-2.5 text-sm focus:border-destructive/20 outline-none" placeholder={t("finance.supplierNamePlaceholder")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exp_vat" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.supplierVatLabel")}</label>
                <div className="relative">
                  <ShieldCheck className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input id="exp_vat" type="text" value={supplierVatNo} onChange={e => setSupplierVatNo(e.target.value)}
                    className="w-full bg-card border border-border rounded-xl ps-9 pe-3 py-2.5 text-sm font-mono focus:border-destructive/20 outline-none" placeholder="3XXXXXXXXXXXXXXX3" />
                </div>
              </div>
              <div>
                <label htmlFor="exp_inv_no" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.invoiceNumberLabel")}</label>
                <input id="exp_inv_no" type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:border-destructive/20 outline-none" placeholder="INV-001" />
              </div>
              <div>
                <label htmlFor="exp_date" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.invoiceDateLabel")}</label>
                <input id="exp_date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:border-destructive/20 outline-none" />
              </div>
              <div>
                <label htmlFor="exp_cat" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.expenseCategoryLabel")}</label>
                <select id="exp_cat" value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:border-destructive/20 outline-none">
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
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 space-y-3">
              <div>
                <label htmlFor="exp_subtotal" className="block text-xs font-semibold text-muted-foreground uppercase mb-1 flex justify-between">
                  <span>{t("finance.subtotalBeforeTax")}</span>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setUseSecondaryCurrency(!useSecondaryCurrency)}>
                    <input type="checkbox" checked={useSecondaryCurrency} onChange={() => setUseSecondaryCurrency(!useSecondaryCurrency)} className="cursor-pointer" />
                    <span className="text-[10px] uppercase text-info bg-info/10 px-1.5 py-0.5 rounded">
                      {t("finance.useSecondaryCurrency")} ({secondaryCurrency})
                    </span>
                  </div>
                </label>
                <div className="relative">
                  <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input id="exp_subtotal" required type="number" min="0" step="0.01" value={subtotal || ""} onChange={e => setSubtotal(Number(e.target.value))}
                    className="w-full bg-card border border-destructive/20 rounded-xl ps-9 pe-3 py-2.5 text-sm font-mono focus:border-destructive/20 outline-none" placeholder="0.00" />
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t("finance.vat15Label")}</span>
                <span className="font-mono font-bold text-destructive">{formatCurrency(vatAmount, useSecondaryCurrency)}</span>
              </div>
              <div className="border-t border-destructive/20 pt-2 flex justify-between font-bold text-foreground">
                <span>{t("finance.totalWithTaxLabel")}</span>
                <span className="font-mono text-xl text-foreground">{formatCurrency(totalAmount, useSecondaryCurrency)}</span>
              </div>
            </div>

            <div>
              <label htmlFor="exp_notes" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("finance.notesLabel")}</label>
              <textarea id="exp_notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:border-destructive/20 outline-none resize-none" />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50">
            {t("common.cancel")}
          </button>
          <button type="submit" form="expense-form" disabled={loading}
            className="px-6 py-2.5 bg-destructive hover:bg-destructive text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" />
            {loading ? t("common.saving") : t("finance.saveExpenseBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
