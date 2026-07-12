"use client";

import React, { useState } from "react";
import { X, DollarSign, Users, FileDown, Building2, CheckCircle, AlertCircle, BadgeDollarSign } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { EmployeeEntity } from "./Employee360Modal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface PayrollEntry {
  employee_id: string;
  full_name: string;
  position: string;
  base_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  deductions: number;
  overtime_pay: number;
  net_salary: number;
  iban: string;
}

interface PayrollRunModalProps {
  employees: EmployeeEntity[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function PayrollRunModal({ employees, onClose }: PayrollRunModalProps) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [posted, setPosted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeEmployees = employees.filter(e => e.data?.status === "active" || e.data?.status === "probation" || !e.data?.status);

  const payrollData: PayrollEntry[] = activeEmployees.map(emp => {
    const base = Number(emp.data?.base_salary || 0);
    const housing = Number(emp.data?.housing_allowance || 0);
    const transport = Number(emp.data?.transport_allowance || 0);
    const gross = base + housing + transport;
    return {
      employee_id: emp.data?.employee_id || emp.id.slice(0, 8),
      full_name: emp.data?.full_name || "Unknown",
      position: emp.data?.position || "N/A",
      base_salary: base,
      housing_allowance: housing,
      transport_allowance: transport,
      deductions: 0,
      overtime_pay: 0,
      net_salary: gross,
      iban: emp.data?.iban || "N/A",
    };
  });

  const totalPayroll = payrollData.reduce((sum, e) => sum + e.net_salary, 0);

  const payrollMonth = new Date().toLocaleString(isRtl ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
  const [payrollRef] = useState(() => `PAY-${Date.now().toString().slice(-6)}`);

  const handlePostToFinance = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";

      // Create finance_expense entity for total payroll
      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({
          entity_type: "finance_expense",
          name: `Payroll ${payrollMonth} - ${payrollRef}`,
          data: {
            expense_type: "payroll",
            payroll_ref: payrollRef,
            month: payrollMonth,
            total_amount: totalPayroll,
            employee_count: payrollData.length,
            entries: payrollData,
            status: "posted",
            posted_date: new Date().toISOString(),
            notes: `Monthly WPS Payroll for ${payrollData.length} employees`,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to post payroll (${res.status})`);
      }

      setPosted(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to post payroll to Finance.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportWPS = () => {
    const rows = [
      ["Employee ID", "Full Name", "Position", "IBAN", "Base Salary", "Housing", "Transport", "Net Salary (SAR)"],
      ...payrollData.map(e => [e.employee_id, e.full_name, e.position, e.iban, e.base_salary, e.housing_allowance, e.transport_allowance, e.net_salary]),
      [],
      ["TOTAL", "", "", "", "", "", "", totalPayroll],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WPS_Payroll_${payrollMonth.replace(" ", "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900 text-white border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("monthly_payroll_run")} — {payrollMonth}</h2>
              <p className="text-xs text-slate-300">{t("ref")}: {payrollRef} • {activeEmployees.length} {t("active_employees")}</p>
            </div>
          </div>
          <button type="button" aria-label={t("close_modal")} onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 p-6 border-b border-slate-200 bg-slate-50">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-slate-500 uppercase">{t("employees")}</span>
            </div>
            <p className="text-2xl font-black text-slate-800">{payrollData.length}</p>
            <p className="text-xs text-slate-400">{t("active_and_probation")}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <BadgeDollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-slate-500 uppercase">{t("total_wps_transfer")}</span>
            </div>
            <p className="text-3xl font-black text-emerald-600 font-mono">{formatCurrency(totalPayroll)}</p>
            <p className="text-xs text-slate-400">{t("monthly_payroll_obligation")}</p>
          </div>
        </div>

        {/* Payroll Table */}
        <div className="overflow-y-auto flex-1">
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
            </div>
          )}
          {posted && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> Payroll posted to Finance as expense entry successfully!
            </div>
          )}

          <div className="p-6">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-start border-collapse">
                <thead className="bg-slate-100 text-slate-600 text-xs font-semibold uppercase">
                  <tr>
                    <th className="p-3 text-start">{t("employee")}</th>
                    <th className="p-3 text-start">{t("position_job_title")}</th>
                    <th className="p-3 text-end">{t("base_salary")}</th>
                    <th className="p-3 text-end">{t("allowances")}</th>
                    <th className="p-3 text-end">{t("net_salary")}</th>
                    <th className="p-3 text-start">{t("bank_iban")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {payrollData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">{t("no_active_employees")}</td>
                    </tr>
                  ) : payrollData.map((emp) => (
                    <tr key={emp.employee_id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-800 text-start">{emp.full_name}</td>
                      <td className="p-3 text-slate-500 text-xs text-start">{emp.position}</td>
                      <td className="p-3 text-end font-mono text-slate-700">{formatCurrency(emp.base_salary)}</td>
                      <td className="p-3 text-end font-mono text-slate-500 text-xs">
                        +{formatCurrency(emp.housing_allowance + emp.transport_allowance)}
                      </td>
                      <td className="p-3 text-end font-mono font-bold text-emerald-700">{formatCurrency(emp.net_salary)}</td>
                      <td className="p-3 text-start font-mono text-xs text-slate-400 truncate max-w-[120px]">{emp.iban}</td>
                    </tr>
                  ))}
                </tbody>
                {payrollData.length > 0 && (
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="p-3 text-sm font-bold text-slate-700">{t("total_payroll_obligation")}</td>
                      <td className={`p-3 ${isRtl ? 'text-start' : 'text-end'} font-black text-lg text-emerald-700 font-mono`}>{formatCurrency(totalPayroll)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors">
            {t("close_modal")}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportWPS}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              {t("export_wps_csv")}
            </button>
            <button
              type="button"
              onClick={handlePostToFinance}
              disabled={loading || posted}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              <Building2 className="w-4 h-4" />
              {loading ? t("posting") : posted ? t("posted_to_finance") : t("post_to_finance_expense")}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
