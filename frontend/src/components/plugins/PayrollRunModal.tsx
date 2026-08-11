"use client";

import React, { useState, useEffect } from "react";
import { X, DollarSign, Users, FileDown, Building2, CheckCircle, AlertCircle, BadgeDollarSign, ShieldCheck } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { EmployeeEntity } from "./Employee360Modal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface Payslip {
  id: string;
  employee_id: string;
  employee_name: string;
  base_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  gross_salary: number;
  gosi_employee: number;
  gosi_employer: number;
  net_salary: number;
  iban: string;
  is_saudi: boolean;
}

interface PayrollRun {
  id: string;
  year: number;
  month: number;
  status: string;
  employee_count: number;
  total_gross: number;
  total_gosi: number;
  total_net: number;
  payslips: Payslip[];
}

interface PayrollRunModalProps {
  employees: EmployeeEntity[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function PayrollRunModal({ employees, onClose }: PayrollRunModalProps) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const payrollMonth = now.toLocaleString(isRtl ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
  // Fallback headcount shown while the server run is still generating.
  const activeCount = employees.filter(e => e.data?.status === "active" || e.data?.status === "probation" || !e.data?.status).length;

  // Generate (or fetch the existing) payroll run for the current month on open.
  // The figures — including statutory GOSI — come from the server engine, not
  // the browser.
  useEffect(() => {
    let active = true;
    const generate = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/payroll/runs`, {
          method: "POST",
          body: JSON.stringify({ year, month }),
        });
        let data: PayrollRun;
        if (res.status === 409) {
          // A run already exists for this period — load it instead of duplicating.
          const conflict = await res.json().catch(() => ({}));
          const getRes = await fetchWithAuth(`${API_BASE_URL}/payroll/runs/${conflict.payroll_run_id}`);
          data = (await getRes.json()).data;
        } else if (res.ok) {
          data = (await res.json()).data;
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to generate payroll (${res.status})`);
        }
        if (active) setRun(data);
      } catch (err: unknown) {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Failed to generate payroll.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void Promise.resolve().then(generate);
    return () => { active = false; };
  }, [year, month]);

  const handlePost = async () => {
    if (!run) return;
    setPosting(true);
    setErrorMsg(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/payroll/runs/${run.id}/post`, { method: "POST" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Failed to post payroll (${res.status})`);
      }
      const data = (await res.json()).data;
      setRun(prev => (prev ? { ...prev, status: data.status } : prev));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to post payroll.");
    } finally {
      setPosting(false);
    }
  };

  // Download the WPS SIF straight from the server (GOSI-aware, bank-ready).
  const handleExportWPS = async () => {
    if (!run) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/payroll/runs/${run.id}/wps`);
      if (!res.ok) throw new Error(`Failed to export WPS (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WPS_${run.year}_${String(run.month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to export WPS.");
    }
  };

  const posted = run?.status === "posted";
  const payslips = run?.payslips || [];
  const employeeCount = run?.employee_count ?? activeCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card text-foreground w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900 text-white border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("monthly_payroll_run")} — {payrollMonth}</h2>
              <p className="text-xs text-slate-300">
                {employeeCount} {t("active_employees")}
                {posted && <span className="ms-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full">{t("posted_to_finance") || "Posted"}</span>}
              </p>
            </div>
          </div>
          <button type="button" aria-label={t("close_modal")} onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 p-6 border-b border-border bg-muted">
          <div className="bg-card p-4 rounded-xl border border-border shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase">{t("employees")}</span>
            </div>
            <p className="text-2xl font-black text-foreground">{employeeCount}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <BadgeDollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase">{t("gross") || "Gross"}</span>
            </div>
            <p className="text-xl font-black text-foreground font-mono">{formatCurrency(run?.total_gross || 0)}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase">GOSI</span>
            </div>
            <p className="text-xl font-black text-amber-700 font-mono">{formatCurrency(run?.total_gosi || 0)}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <BadgeDollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase">{t("total_wps_transfer")}</span>
            </div>
            <p className="text-xl font-black text-emerald-600 font-mono">{formatCurrency(run?.total_net || 0)}</p>
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
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> {t("payroll_posted") || "Payroll run posted."}
            </div>
          )}

          <div className="p-6">
            <div className="border border-border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-start border-collapse">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold uppercase">
                  <tr>
                    <th className="p-3 text-start">{t("employee")}</th>
                    <th className="p-3 text-end">{t("base_salary")}</th>
                    <th className="p-3 text-end">{t("allowances")}</th>
                    <th className="p-3 text-end">GOSI</th>
                    <th className="p-3 text-end">{t("net_salary")}</th>
                    <th className="p-3 text-start">{t("bank_iban")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">{t("loading") || "Loading…"}</td></tr>
                  ) : payslips.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">{t("no_active_employees")}</td></tr>
                  ) : payslips.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/50">
                      <td className="p-3 font-semibold text-foreground text-start">
                        {p.employee_name}
                        {!p.is_saudi && <span className="ms-2 text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">{t("non_saudi") || "Non-Saudi"}</span>}
                      </td>
                      <td className="p-3 text-end font-mono text-foreground">{formatCurrency(p.base_salary)}</td>
                      <td className="p-3 text-end font-mono text-muted-foreground text-xs">+{formatCurrency(p.housing_allowance + p.transport_allowance)}</td>
                      <td className="p-3 text-end font-mono text-amber-700 text-xs">−{formatCurrency(p.gosi_employee)}</td>
                      <td className="p-3 text-end font-mono font-bold text-emerald-700">{formatCurrency(p.net_salary)}</td>
                      <td className="p-3 text-start font-mono text-xs text-muted-foreground truncate max-w-[120px]">{p.iban}</td>
                    </tr>
                  ))}
                </tbody>
                {payslips.length > 0 && (
                  <tfoot className="bg-muted border-t-2 border-border">
                    <tr>
                      <td colSpan={4} className="p-3 text-sm font-bold text-foreground">{t("total_payroll_obligation")}</td>
                      <td className={`p-3 ${isRtl ? 'text-start' : 'text-end'} font-black text-lg text-emerald-700 font-mono`}>{formatCurrency(run?.total_net || 0)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors">
            {t("close_modal")}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportWPS}
              disabled={!run || payslips.length === 0}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              {t("export_wps_csv")}
            </button>
            <button
              type="button"
              onClick={handlePost}
              disabled={posting || posted || !run || payslips.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              <Building2 className="w-4 h-4" />
              {posting ? t("posting") : posted ? t("posted_to_finance") : t("post_to_finance_expense")}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
