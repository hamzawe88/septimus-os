/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { Users, TrendingDown, Calendar, ShieldAlert, Target, Landmark, PieChart, AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

function Tile({ icon, label, value, tone = "slate" }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  const cls = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : tone === "brand" ? "text-brand" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span></div>
      <p className={`text-2xl font-black ${cls} font-mono`}>{value}</p>
    </div>
  );
}

export default function HrAnalytics() {
  const { t, formatCurrency } = useLocalization();
  const [data, setData] = useState<any | null>(null);
  const [risk, setRisk] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const [a, r] = await Promise.all([
          apiGet<any>(`/hr/analytics`),
          apiGet<any>(`/hr/attrition-risk`).catch(() => null),
        ]);
        setData(a);
        setRisk(r);
      }
      catch (err) { console.error("Failed to load analytics", err); }
      finally { setLoading(false); }
    });
  }, []);

  if (loading) {
    return <LoadingState />;
  }
  if (!data) {
    return <div className="h-full flex items-center justify-center bg-background text-muted-foreground">{t("hr.analyticsUnavailable", "Analytics unavailable.")}</div>;
  }

  const hc = data.headcount, tv = data.turnover, lv = data.leave, cmp = data.compliance, pf = data.performance, pay = data.payroll;
  const maxDept = Math.max(1, ...(hc.by_department || []).map((d: any) => d.count));

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<PieChart className="w-6 h-6 text-brand" />}
        title={t("hr.analytics", "HR Analytics")}
        description={t("hr.analyticsDesc", "Live workforce, compliance, and performance snapshot.")}
      />

      <div className="p-8 max-w-5xl w-full mx-auto space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile icon={<Users className="w-4 h-4 text-brand" />} label={t("hr.activeHeadcount", "Active headcount")} value={String(hc.active)} tone="brand" />
          <Tile icon={<Landmark className="w-4 h-4 text-emerald-600" />} label={t("hr.saudization", "Saudization")} value={`${hc.saudization_percent}%`} />
          <Tile icon={<TrendingDown className="w-4 h-4 text-rose-600" />} label={t("hr.turnover", "Turnover")} value={`${tv.rate_percent}%`} tone="rose" />
          <Tile icon={<ShieldAlert className="w-4 h-4 text-amber-600" />} label={t("hr.expiringDocs", "Expiring docs")} value={String(cmp.expiring_documents)} tone="amber" />
          <Tile icon={<Calendar className="w-4 h-4 text-indigo-600" />} label={t("hr.onLeaveToday", "On leave today")} value={String(lv.on_leave_today)} />
          <Tile icon={<Calendar className="w-4 h-4 text-muted-foreground" />} label={t("hr.pendingRequests", "Pending leave")} value={String(lv.pending_requests)} />
          <Tile icon={<Target className="w-4 h-4 text-brand" />} label={t("hr.activeGoals", "Active goals")} value={String(pf.active_goals)} />
          <Tile icon={<Target className="w-4 h-4 text-emerald-600" />} label={t("hr.completedGoals", "Completed goals")} value={String(pf.completed_goals)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Department breakdown */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">{t("hr.byDepartment", "Headcount by department")}</h3>
            <div className="space-y-3">
              {(hc.by_department || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("hr.noData", "No data.")}</p>
              ) : hc.by_department.map((d: any) => (
                <div key={d.department}>
                  <div className="flex justify-between text-sm mb-1"><span className="text-foreground capitalize">{d.department}</span><span className="font-mono text-muted-foreground">{d.count}</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: `${Math.round(d.count / maxDept * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Payroll snapshot */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">{t("hr.latestPayroll", "Latest posted payroll")}</h3>
            {pay && pay.month ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("hr.period", "Period")}</span><span className="font-mono">{String(pay.month).slice(0, 4)}-{String(pay.month).slice(4)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">GOSI</span><span className="font-mono text-amber-700">{formatCurrency(pay.total_gosi)}</span></div>
                <div className="flex justify-between items-baseline pt-2 border-t border-border"><span className="font-semibold text-foreground">{t("hr.netTransfer", "Net (WPS)")}</span><span className="text-2xl font-black text-emerald-600 font-mono">{formatCurrency(pay.total_net)}</span></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("hr.noPostedPayroll", "No posted payroll run yet.")}</p>
            )}
          </div>
        </div>

        {/* Attrition risk (heuristic early-warning) */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500" />{t("hr.attritionRisk", "Attrition risk")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("hr.attritionRiskDesc", "Explainable early-warning flag — every point is traceable to a signal.")}</p>
          {!risk || (risk.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.noRisk", "No employees flagged at risk.")}</p>
          ) : (
            <div className="space-y-2">
              {risk.data.map((r: any) => {
                const tone = r.level === "high" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700";
                return (
                  <div key={r.employee_id} className="flex items-center justify-between gap-3 border border-border rounded-lg p-3">
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground">{r.employee_name}</span>
                      {r.department && <span className="text-xs text-muted-foreground ms-2">{r.department}</span>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(r.factors || []).map((f: string) => (
                          <span key={f} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t(`hr.riskFactors.${f}`, f.replace(/_/g, " "))}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-sm font-bold text-foreground">{r.score}</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tone}`}>{t(`hr.riskLevel.${r.level}`, r.level)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
