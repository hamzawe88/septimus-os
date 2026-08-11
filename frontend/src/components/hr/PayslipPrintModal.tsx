"use client";

import React from "react";
import { X, Printer } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

interface Payslip {
  id: string; year: number; month: number; currency: string;
  base_salary: number; housing_allowance: number; transport_allowance: number;
  gross_salary: number; gosi_employee: number; other_deductions: number; net_salary: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  payslip: Payslip | null;
  employeeName?: string;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-2 border-b border-slate-100 ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span><span className="font-mono">{value}</span>
    </div>
  );
}

export default function PayslipPrintModal({ isOpen, onClose, payslip, employeeName }: Props) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [company] = React.useState<{ name?: string }>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("septimus_company_profile") || "{}"); } catch { return {}; }
  });

  if (!isOpen || !payslip) return null;

  const period = new Date(payslip.year, payslip.month - 1, 1).toLocaleString(isRtl ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
  const allowances = payslip.housing_allowance + payslip.transport_allowance;
  const deductions = payslip.gosi_employee + payslip.other_deductions;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4 print:p-0 print:bg-white print:static print:block">
      {/* Print isolation: only the payslip prints. */}
      <style>{`@media print { body * { visibility: hidden !important; } #payslip-print, #payslip-print * { visibility: visible !important; } #payslip-print { position: absolute; inset: 0; margin: 0; box-shadow: none; border: none; } }`}</style>

      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 my-8 print:my-0 print:max-w-full print:rounded-none">
        {/* Toolbar (hidden in print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl print:hidden">
          <h2 className="font-bold text-slate-800">{t("hr.payslip", "Payslip")}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="bg-brand hover:bg-brand/90 text-white rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-2">
              <Printer className="w-4 h-4" />{t("hr.printSavePdf", "Print / Save PDF")}
            </button>
            <button onClick={onClose} aria-label={t("common.close", "Close")} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Printable payslip */}
        <div id="payslip-print" className="p-8 md:p-12 bg-white">
          <div className="flex items-center justify-between pb-6 border-b-2 border-slate-800">
            <div>
              <h1 className="text-xl font-black text-slate-900">{company.name || "Septimus OS"}</h1>
              <p className="text-sm text-slate-500 mt-1">{t("hr.payslip", "Payslip")} · {period}</p>
            </div>
            <div className="text-end text-sm">
              <p className="text-slate-500">{t("hr.employee", "Employee")}</p>
              <p className="font-bold text-slate-800">{employeeName || "—"}</p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-1">{t("hr.earnings", "Earnings")}</h3>
            <Row label={t("base_salary", "Base salary")} value={formatCurrency(payslip.base_salary)} />
            <Row label={t("housing_allowance", "Housing allowance")} value={formatCurrency(payslip.housing_allowance)} />
            <Row label={t("transport_allowance", "Transport allowance")} value={formatCurrency(payslip.transport_allowance)} />
            <Row label={t("hr.grossSalary", "Gross salary")} value={formatCurrency(payslip.gross_salary)} strong />
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-1">{t("hr.deductions", "Deductions")}</h3>
            <Row label={`GOSI (${t("hr.employeeShare", "employee share")})`} value={`− ${formatCurrency(payslip.gosi_employee)}`} />
            {payslip.other_deductions > 0 && <Row label={t("hr.otherDeductions", "Other deductions")} value={`− ${formatCurrency(payslip.other_deductions)}`} />}
            <Row label={t("hr.totalDeductions", "Total deductions")} value={`− ${formatCurrency(deductions)}`} strong />
          </div>

          <div className="mt-8 bg-slate-900 text-white rounded-xl px-6 py-4 flex items-center justify-between">
            <span className="font-semibold">{t("net_salary", "Net salary")} ({t("hr.netTransfer", "WPS transfer")})</span>
            <span className="text-2xl font-black font-mono text-emerald-400">{formatCurrency(payslip.net_salary)}</span>
          </div>

          <p className="mt-6 text-[11px] text-slate-400 text-center">
            {t("hr.payslipFooter", "This payslip is computer-generated.")} · {t("hr.allowances", "Allowances")}: {formatCurrency(allowances)}
          </p>
        </div>
      </div>
    </div>
  );
}
