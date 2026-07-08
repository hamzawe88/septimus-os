"use client";

import React, { useMemo } from "react";
import { ShieldCheck, TrendingUp, TrendingDown, Scale, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { InvoiceEntity } from "../plugins/FinanceInvoicesView";
import { useLocalization } from "@/contexts/LocalizationContext";

interface VATReturnEntity {
  id: string;
  created_at: string;
  data: {
    entity_type?: string;
    expense_type?: string;
    total_amount?: number | string;
    vat_amount?: number | string;
    subtotal?: number | string;
    amount?: number | string;
    status?: string;
    [key: string]: unknown;
  };
}

interface VATReturnDashboardProps {
  invoices: InvoiceEntity[];
  expenses: VATReturnEntity[];
}

export default function VATReturnDashboard({ invoices, expenses }: VATReturnDashboardProps) {
  const { t, formatCurrency } = useLocalization();
  
  const vatData = useMemo(() => {
    // Output VAT: from sales invoices (finance_invoice)
    const outputVAT = invoices.reduce((sum, inv) => {
      const vatAmt = Number(inv.data?.vat_amount || 0);
      if (!isNaN(vatAmt) && vatAmt > 0) return sum + vatAmt;
      // If no explicit VAT amount, estimate from total
      const total = Number(inv.data?.amount || inv.data?.subtotal || 0);
      if (!isNaN(total) && total > 0) return sum + (total * 0.15 / 1.15);
      return sum;
    }, 0);

    const totalSalesRevenue = invoices.reduce((sum, inv) => {
      const amt = Number(inv.data?.amount || inv.data?.subtotal || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    // Input VAT: from expenses (finance_expense) - excludes payroll
    const purchaseExpenses = expenses.filter(e =>
      e.data?.entity_type === "finance_expense" &&
      e.data?.expense_type !== "payroll"
    );
    const inputVAT = purchaseExpenses.reduce((sum, exp) => {
      const vatAmt = Number(exp.data?.vat_amount || 0);
      if (!isNaN(vatAmt) && vatAmt > 0) return sum + vatAmt;
      const total = Number(exp.data?.total_amount || exp.data?.amount || 0);
      if (!isNaN(total) && total > 0) return sum + (total * 0.15 / 1.15);
      return sum;
    }, 0);

    const totalPurchasesValue = purchaseExpenses.reduce((sum, exp) => {
      const amt = Number(exp.data?.total_amount || exp.data?.amount || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    const netVATPayable = outputVAT - inputVAT;
    const vatPeriod = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

    return {
      outputVAT,
      inputVAT,
      netVATPayable,
      totalSalesRevenue,
      totalPurchasesValue,
      vatPeriod,
      invoiceCount: invoices.length,
      expenseCount: purchaseExpenses.length,
    };
  }, [invoices, expenses]);

  const isRefund = vatData.netVATPayable < 0;

  const handleExportVAT = () => {
    const rows = [
      ["VAT Return Summary", vatData.vatPeriod],
      [],
      ["Box", "Description", "Amount"],
      ["1a", "Total Sales (Taxable)", vatData.totalSalesRevenue.toFixed(2)],
      ["1b", "Output VAT (15% on Sales)", vatData.outputVAT.toFixed(2)],
      ["2a", "Total Purchases (Claimable)", vatData.totalPurchasesValue.toFixed(2)],
      ["2b", "Input VAT (Reclaimable)", vatData.inputVAT.toFixed(2)],
      [],
      ["NET VAT PAYABLE", isRefund ? "REFUND DUE" : "PAYABLE", Math.abs(vatData.netVATPayable).toFixed(2)],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VAT_Return_${vatData.vatPeriod.replace(" ", "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-brand/10 rounded-xl">
            <ShieldCheck className="w-7 h-7 text-brand" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              {t("finance.vatReturnBoard")} <span dir="ltr" className="text-slate-500 font-normal text-lg">(VAT Return)</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("finance.periodLabel")} <span dir="ltr" className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 rounded text-xs">{vatData.vatPeriod}</span> • {t("finance.vatEstimatedDesc")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportVAT}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-brand hover:bg-slate-800 dark:hover:bg-brand/90 text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg"
        >
          <FileDown className="w-5 h-5" />
          {t("finance.exportVatReturn")}
        </button>
      </div>

      {/* Main VAT Formula Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Output VAT */}
        <div className="bg-white dark:bg-[#222529] border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp className="w-24 h-24 text-emerald-600" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex flex-col">
                {t("finance.outputSales")}
                <span dir="ltr" className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400/70">OUTPUT VAT</span>
              </h3>
            </div>
            <p dir="ltr" className="text-3xl font-black text-emerald-700 dark:text-emerald-400 font-mono text-start">{formatCurrency(vatData.outputVAT)}</p>
            <div className="mt-4 pt-4 border-t border-emerald-100 dark:border-emerald-900/30 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t("finance.totalTaxableSales")}</span>
                <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(vatData.totalSalesRevenue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t("finance.invoiceCount")}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{vatData.invoiceCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Input VAT */}
        <div className="bg-white dark:bg-[#222529] border border-rose-200 dark:border-rose-900/50 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingDown className="w-24 h-24 text-rose-600" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-rose-50 dark:bg-rose-900/30 rounded-lg">
                <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-sm font-bold text-rose-800 dark:text-rose-300 flex flex-col">
                {t("finance.inputPurchases")}
                <span dir="ltr" className="text-[10px] font-mono text-rose-600 dark:text-rose-400/70">INPUT VAT</span>
              </h3>
            </div>
            <p dir="ltr" className="text-3xl font-black text-rose-700 dark:text-rose-400 font-mono text-start">{formatCurrency(vatData.inputVAT)}</p>
            <div className="mt-4 pt-4 border-t border-rose-100 dark:border-rose-900/30 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t("finance.eligiblePurchases")}</span>
                <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">{formatCurrency(vatData.totalPurchasesValue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t("finance.expenseRecords")}</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{vatData.expenseCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net VAT Payable */}
        <div className={`rounded-2xl p-6 shadow-md border-2 relative overflow-hidden group transition-all ${isRefund ? "bg-blue-50 dark:bg-blue-900/10 border-blue-400 dark:border-blue-500/50" : "bg-amber-50 dark:bg-amber-900/10 border-amber-400 dark:border-amber-500/50"}`}>
           <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Scale className={`w-32 h-32 ${isRefund ? "text-blue-600" : "text-amber-600"}`} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-lg ${isRefund ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"}`}>
                <Scale className="w-5 h-5" />
              </div>
              <h3 className={`text-sm font-bold flex flex-col ${isRefund ? "text-blue-800 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>
                {isRefund ? t("finance.taxRefundTitle") : t("finance.taxPayableTitle")}
                <span dir="ltr" className={`text-[10px] font-mono ${isRefund ? "text-blue-600 dark:text-blue-400/70" : "text-amber-600 dark:text-amber-400/70"}`}>NET VAT</span>
              </h3>
            </div>
            <p dir="ltr" className={`text-3xl font-black font-mono text-start ${isRefund ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>
              {formatCurrency(Math.abs(vatData.netVATPayable))}
            </p>
            <div className={`mt-4 pt-4 border-t text-sm font-medium ${isRefund ? "border-blue-200 dark:border-blue-900/30 text-blue-800 dark:text-blue-300" : "border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300"}`}>
              {isRefund ? t("finance.refundMessage") : t("finance.payableMessage")}
            </div>
          </div>
        </div>
      </div>

      {/* VAT Formula Explanation */}
      <div className="bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand" />
          {t("finance.vatFormulaTitle")}
          <span dir="ltr" className="text-slate-400 font-normal text-sm">(Calculation Formula)</span>
        </h3>
        
        {/* LTR container to keep the math logical left-to-right visually if preferred, but for Arabic RTL is right-to-left. 
            We will use RTL layout: Payable = Output - Input */}
        <div className="flex flex-col md:flex-row items-center gap-4 text-center" dir="rtl">
          
          <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-4 w-full">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">{t("finance.outputLabel")}</p>
            <p dir="ltr" className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">{formatCurrency(vatData.outputVAT)}</p>
          </div>
          
          <div className="text-3xl font-black text-slate-300 dark:text-slate-600 shrink-0">−</div>
          
          <div className="flex-1 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-900/30 rounded-xl p-4 w-full">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">{t("finance.inputLabel")}</p>
            <p dir="ltr" className="text-xl font-black text-rose-700 dark:text-rose-400 font-mono">{formatCurrency(vatData.inputVAT)}</p>
          </div>
          
          <div className="text-3xl font-black text-slate-300 dark:text-slate-600 shrink-0">=</div>
          
          <div className={`flex-1 rounded-xl p-4 w-full border-2 ${isRefund ? "bg-blue-50 dark:bg-blue-900/10 border-blue-300 dark:border-blue-800/50" : "bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-800/50"}`}>
            <p className={`text-xs font-bold mb-2 ${isRefund ? "text-blue-700 dark:text-blue-400" : "text-amber-800 dark:text-amber-400"}`}>
              {isRefund ? t("finance.refundFormulaLabel") : t("finance.payableFormulaLabel")}
            </p>
            <p dir="ltr" className={`text-xl font-black font-mono ${isRefund ? "text-blue-700 dark:text-blue-400" : "text-amber-800 dark:text-amber-400"}`}>
              {formatCurrency(Math.abs(vatData.netVATPayable))}
            </p>
          </div>
          
        </div>
      </div>

      {/* Compliance Status */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <h4 className="text-base font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
            {t("finance.checklistTitle")} 
            <span dir="ltr" className="text-slate-400 font-normal text-sm">(Compliance Checklist)</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { ok: vatData.invoiceCount > 0, label: t("finance.chkSalesOk"), hint: t("finance.chkSalesHint") },
            { ok: vatData.expenseCount > 0, label: t("finance.chkExpOk"), hint: t("finance.chkExpHint") },
            { ok: vatData.outputVAT > 0, label: t("finance.chkOutOk"), hint: t("finance.chkOutHint") },
            { ok: vatData.inputVAT >= 0, label: t("finance.chkInOk"), hint: t("finance.chkInHint") },
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
              <div className="mt-0.5">
              {item.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              )}
              </div>
              <div>
                <span className={`block text-sm font-bold ${item.ok ? "text-slate-700 dark:text-slate-200" : "text-amber-700 dark:text-amber-500"}`}>{item.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.hint}</span>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
