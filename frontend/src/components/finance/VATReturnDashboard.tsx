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
            <h2 className="text-xl font-bold text-foreground dark:text-white flex items-center gap-2">
              {t("finance.vatReturnBoard")} <span dir="ltr" className="text-muted-foreground font-normal text-lg">(VAT Return)</span>
            </h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
              {t("finance.periodLabel")} <span dir="ltr" className="font-mono bg-muted dark:bg-card px-1.5 rounded text-xs">{vatData.vatPeriod}</span> • {t("finance.vatEstimatedDesc")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportVAT}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg"
        >
          <FileDown className="w-5 h-5" />
          {t("finance.exportVatReturn")}
        </button>
      </div>

      {/* Main VAT Formula Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Output VAT */}
        <div className="bg-card dark:bg-card border border-success/20 dark:border-success/20 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp className="w-24 h-24 text-success" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-success/10 dark:bg-success/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-success dark:text-success" />
              </div>
              <h3 className="text-sm font-bold text-success dark:text-success flex flex-col">
                {t("finance.outputSales")}
                <span dir="ltr" className="text-[10px] font-mono text-success dark:text-success/70">{t("finance.outputVatCode")}</span>
              </h3>
            </div>
            <p dir="ltr" className="text-3xl font-black text-success dark:text-success font-mono text-start">{formatCurrency(vatData.outputVAT)}</p>
            <div className="mt-4 pt-4 border-t border-success/20 dark:border-success/20 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">{t("finance.totalTaxableSales")}</span>
                <span dir="ltr" className="font-mono text-foreground dark:text-muted-foreground">{formatCurrency(vatData.totalSalesRevenue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">{t("finance.invoiceCount")}</span>
                <span className="font-bold text-foreground dark:text-muted-foreground">{vatData.invoiceCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Input VAT */}
        <div className="bg-card dark:bg-card border border-destructive/20 dark:border-destructive/20 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingDown className="w-24 h-24 text-destructive" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-destructive/10 dark:bg-destructive/30 rounded-lg">
                <TrendingDown className="w-5 h-5 text-destructive dark:text-destructive" />
              </div>
              <h3 className="text-sm font-bold text-destructive dark:text-destructive flex flex-col">
                {t("finance.inputPurchases")}
                <span dir="ltr" className="text-[10px] font-mono text-destructive dark:text-destructive/70">{t("finance.inputVatCode")}</span>
              </h3>
            </div>
            <p dir="ltr" className="text-3xl font-black text-destructive dark:text-destructive font-mono text-start">{formatCurrency(vatData.inputVAT)}</p>
            <div className="mt-4 pt-4 border-t border-destructive/20 dark:border-destructive/20 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">{t("finance.eligiblePurchases")}</span>
                <span dir="ltr" className="font-mono text-foreground dark:text-muted-foreground">{formatCurrency(vatData.totalPurchasesValue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground dark:text-muted-foreground">{t("finance.expenseRecords")}</span>
                <span className="font-bold text-foreground dark:text-muted-foreground">{vatData.expenseCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net VAT Payable */}
        <div className={`rounded-2xl p-6 shadow-md border-2 relative overflow-hidden group transition-all ${isRefund ? "bg-info/10 dark:bg-info/10 border-info/20 dark:border-info/20" : "bg-warning/10 dark:bg-warning/10 border-warning/20 dark:border-warning/20"}`}>
           <div className="absolute top-0 end-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Scale className={`w-32 h-32 ${isRefund ? "text-info" : "text-warning"}`} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-lg ${isRefund ? "bg-info/10 dark:bg-info/40 text-info dark:text-info" : "bg-warning/10 dark:bg-warning/40 text-warning dark:text-warning"}`}>
                <Scale className="w-5 h-5" />
              </div>
              <h3 className={`text-sm font-bold flex flex-col ${isRefund ? "text-info dark:text-info" : "text-warning dark:text-warning"}`}>
                {isRefund ? t("finance.taxRefundTitle") : t("finance.taxPayableTitle")}
                <span dir="ltr" className={`text-[10px] font-mono ${isRefund ? "text-info dark:text-info/70" : "text-warning dark:text-warning/70"}`}>{t("finance.netVatCode")}</span>
              </h3>
            </div>
            <p dir="ltr" className={`text-3xl font-black font-mono text-start ${isRefund ? "text-info dark:text-info" : "text-warning dark:text-warning"}`}>
              {formatCurrency(Math.abs(vatData.netVATPayable))}
            </p>
            <div className={`mt-4 pt-4 border-t text-sm font-medium ${isRefund ? "border-info/20 dark:border-info/20 text-info dark:text-info" : "border-warning/20 dark:border-warning/20 text-warning dark:text-warning"}`}>
              {isRefund ? t("finance.refundMessage") : t("finance.payableMessage")}
            </div>
          </div>
        </div>
      </div>

      {/* VAT Formula Explanation */}
      <div className="bg-card dark:bg-card border border-border dark:border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-foreground dark:text-white mb-6 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand" />
          {t("finance.vatFormulaTitle")}
          <span dir="ltr" className="text-muted-foreground font-normal text-sm">(Calculation Formula)</span>
        </h3>

        {/* Tax arithmetic keeps a fixed mathematical order in both languages. */}
        <div className="flex flex-col items-center gap-4 text-center md:flex-row" dir="ltr">

          <div className="flex-1 bg-success/10 dark:bg-success/10 border border-success/20 dark:border-success/20 rounded-xl p-4 w-full">
            <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground mb-2">{t("finance.outputLabel")}</p>
            <p dir="ltr" className="text-xl font-black text-success dark:text-success font-mono">{formatCurrency(vatData.outputVAT)}</p>
          </div>

          <div className="text-3xl font-black text-muted-foreground dark:text-muted-foreground shrink-0">−</div>

          <div className="flex-1 bg-destructive/10 dark:bg-destructive/10 border border-destructive/20 dark:border-destructive/20 rounded-xl p-4 w-full">
            <p className="text-xs font-bold text-muted-foreground dark:text-muted-foreground mb-2">{t("finance.inputLabel")}</p>
            <p dir="ltr" className="text-xl font-black text-destructive dark:text-destructive font-mono">{formatCurrency(vatData.inputVAT)}</p>
          </div>

          <div className="text-3xl font-black text-muted-foreground dark:text-muted-foreground shrink-0">=</div>

          <div className={`flex-1 rounded-xl p-4 w-full border-2 ${isRefund ? "bg-info/10 dark:bg-info/10 border-info/20 dark:border-info/20" : "bg-warning/10 dark:bg-warning/10 border-warning/20 dark:border-warning/20"}`}>
            <p className={`text-xs font-bold mb-2 ${isRefund ? "text-info dark:text-info" : "text-warning dark:text-warning"}`}>
              {isRefund ? t("finance.refundFormulaLabel") : t("finance.payableFormulaLabel")}
            </p>
            <p dir="ltr" className={`text-xl font-black font-mono ${isRefund ? "text-info dark:text-info" : "text-warning dark:text-warning"}`}>
              {formatCurrency(Math.abs(vatData.netVATPayable))}
            </p>
          </div>

        </div>
      </div>

      {/* Compliance Status */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-card dark:bg-card border border-border dark:border-border rounded-2xl p-6">
          <h4 className="text-base font-bold text-foreground dark:text-white mb-5 flex items-center gap-2">
            {t("finance.checklistTitle")}
            <span dir="ltr" className="text-muted-foreground font-normal text-sm">(Compliance Checklist)</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { ok: vatData.invoiceCount > 0, label: t("finance.chkSalesOk"), hint: t("finance.chkSalesHint") },
            { ok: vatData.expenseCount > 0, label: t("finance.chkExpOk"), hint: t("finance.chkExpHint") },
            { ok: vatData.outputVAT > 0, label: t("finance.chkOutOk"), hint: t("finance.chkOutHint") },
            { ok: vatData.inputVAT >= 0, label: t("finance.chkInOk"), hint: t("finance.chkInHint") },
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-4 p-3 rounded-xl hover:bg-muted dark:hover:bg-card/50 transition-colors border border-transparent hover:border-border dark:hover:border-border">
              <div className="mt-0.5">
              {item.ok ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <AlertCircle className="w-5 h-5 text-warning" />
              )}
              </div>
              <div>
                <span className={`block text-sm font-bold ${item.ok ? "text-foreground dark:text-muted-foreground" : "text-warning dark:text-warning"}`}>{item.label}</span>
                <span className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">{item.hint}</span>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
