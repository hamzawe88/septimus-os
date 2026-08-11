"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { DollarSign, Cpu, Activity } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface Totals {
  total_tokens: number;
  total_cost_usd: number;
  calls: number;
}
interface ModelRow {
  model: string;
  tokens: number;
  cost_usd: number;
  calls: number;
}
interface DailyRow {
  date: string;
  tokens: number;
  cost_usd: number;
}
interface CostData {
  range_days: number;
  totals: Totals;
  by_model: ModelRow[] | null;
  daily_trend: DailyRow[] | null;
}

export default function AiCostReport() {
  const { t, isRtl } = useLocalization();
  const [data, setData] = useState<CostData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/reports/ai/cost`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json))
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground dark:text-muted-foreground">{t("reports.aiCost.loading")}</div>;
  }
  if (!data) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground dark:text-muted-foreground">{t("reports.aiCost.error")}</div>;
  }

  const fmtCost = (n: number) => `$${(n ?? 0).toFixed(4)}`;
  const fmtNum = (n: number) => (n ?? 0).toLocaleString(isRtl ? "ar-EG" : "en-US");

  const trend = (data.daily_trend ?? []).map((d) => ({
    date: new Date(d.date).toLocaleDateString(isRtl ? "ar-SA" : "en-US", { month: "short", day: "numeric" }),
    [t("reports.aiCost.cost")]: Number((d.cost_usd ?? 0).toFixed(4)),
  }));

  const models = data.by_model ?? [];

  return (
    <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label={t("reports.aiCost.totalCost")}
          value={fmtCost(data.totals?.total_cost_usd)}
          hint={`${t("reports.aiCost.window")}: ${data.range_days} ${t("reports.aiCost.daysUnit")}`}
        />
        <StatCard
          icon={<Cpu className="w-5 h-5" />}
          label={t("reports.aiCost.totalTokens")}
          value={fmtNum(data.totals?.total_tokens)}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label={t("reports.aiCost.calls")}
          value={fmtNum(data.totals?.calls)}
        />
      </div>

      {/* Daily cost trend */}
      <div className="bg-card dark:bg-[#121212] rounded-xl border border-border dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-foreground dark:text-slate-200 mb-4">{t("reports.aiCost.dailyCost")}</h3>
        {trend.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">{t("reports.aiCost.noData")}</div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.3} />
              <XAxis dataKey="date" reversed={isRtl} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis orientation={isRtl ? "right" : "left"} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RechartsTooltip />
              <Area type="monotone" dataKey={t("reports.aiCost.cost")} stroke="var(--primary-hex)" fill="var(--primary-light)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By-model breakdown */}
      <div className="bg-card dark:bg-[#121212] rounded-xl border border-border dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-foreground dark:text-slate-200 mb-4">{t("reports.aiCost.byModel")}</h3>
        {models.length === 0 ? (
          <div className="text-muted-foreground text-sm py-6 text-center">{t("reports.aiCost.noData")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground dark:text-muted-foreground border-b border-border dark:border-slate-700">
                  <th className="text-start font-medium py-2">{t("reports.aiCost.model")}</th>
                  <th className="text-end font-medium py-2">{t("reports.aiCost.tokens")}</th>
                  <th className="text-end font-medium py-2">{t("reports.aiCost.callsShort")}</th>
                  <th className="text-end font-medium py-2">{t("reports.aiCost.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.model} className="border-b border-border dark:border-slate-800 last:border-0">
                    <td className="py-2 text-foreground dark:text-slate-200 font-medium">{m.model || "—"}</td>
                    <td className="py-2 text-end text-muted-foreground dark:text-slate-300">{fmtNum(m.tokens)}</td>
                    <td className="py-2 text-end text-muted-foreground dark:text-slate-300">{fmtNum(m.calls)}</td>
                    <td className="py-2 text-end text-foreground dark:text-slate-200 font-semibold">{fmtCost(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card dark:bg-[#121212] rounded-xl border border-border dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 text-muted-foreground dark:text-muted-foreground text-sm">
        <span className="text-[var(--primary-hex)]">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground dark:text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
