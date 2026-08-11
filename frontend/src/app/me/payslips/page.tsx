"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Receipt, ShieldCheck, Printer } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import PayslipPrintModal from "@/components/hr/PayslipPrintModal";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

interface Payslip {
  id: string;
  year: number;
  month: number;
  currency: string;
  base_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  gross_salary: number;
  gosi_employee: number;
  other_deductions: number;
  net_salary: number;
}

export default function MyPayslipsPage() {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [printing, setPrinting] = useState<Payslip | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, me] = await Promise.all([
        apiGet<{ data: Payslip[] }>(`/me/payslips`),
        apiGet<{ data: { data?: { full_name?: string } } }>(`/me/employee`).catch(() => null),
      ]);
      setPayslips(res.data || []);
      setEmployeeName(me?.data?.data?.full_name || "");
      setLinked(true);
    } catch (err) {
      setLinked(false);
      console.error("Failed to load payslips", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const monthName = (y: number, m: number) =>
    new Date(y, m - 1, 1).toLocaleString(isRtl ? "ar-SA" : "en-US", { month: "long", year: "numeric" });

  if (loading) {
    return <LoadingState />;
  }

  if (!linked) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-8">
        <div className="text-center text-muted-foreground max-w-md">
          <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>{t("ess.notLinked", "No employee record is linked to your account. Contact HR.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<Receipt className="w-6 h-6 text-brand" />}
        title={t("ess.myPayslips", "My Payslips")}
        description={t("ess.myPayslipsDesc", "Your posted monthly payslips.")}
      />

      <div className="p-8 max-w-3xl w-full mx-auto space-y-4">
        {payslips.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground shadow-sm">
            {t("ess.noPayslips", "No payslips yet.")}
          </div>
        ) : payslips.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900 text-white flex items-center justify-between">
              <span className="font-bold">{monthName(p.year, p.month)}</span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black font-mono text-emerald-400">{formatCurrency(p.net_salary)}</span>
                <button onClick={() => setPrinting(p)} title={t("hr.printSavePdf", "Print / Save PDF")} aria-label={t("hr.printSavePdf", "Print / Save PDF")} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("base_salary", "Base")}</p>
                <p className="font-mono font-semibold text-foreground">{formatCurrency(p.base_salary)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("allowances", "Allowances")}</p>
                <p className="font-mono font-semibold text-foreground">{formatCurrency(p.housing_allowance + p.transport_allowance)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-amber-600" /> GOSI</p>
                <p className="font-mono font-semibold text-amber-700">−{formatCurrency(p.gosi_employee)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("net_salary", "Net")}</p>
                <p className="font-mono font-bold text-emerald-700">{formatCurrency(p.net_salary)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <PayslipPrintModal isOpen={!!printing} onClose={() => setPrinting(null)} payslip={printing} employeeName={employeeName} />
    </div>
  );
}
