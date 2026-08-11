"use client";

import React, { useState, useEffect } from "react";
import { Gauge, TrendingDown, Timer } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

interface SprintRow {
  sprint_id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  total_tasks: number;
  done_tasks: number;
  committed_points: number;
  completed_points: number;
  completion_percent?: number;
}
interface Velocity {
  sprints: SprintRow[];
  completed_sprints: number;
  average_velocity_points: number;
}
interface BurndownPoint {
  date: string;
  ideal_remaining: number;
  remaining?: number;
}
interface Burndown {
  sprint_id: string;
  name: string;
  total_points: number;
  days: number;
  series: BurndownPoint[];
}
interface CycleTime {
  avg_cycle_days: number;
  completed_tasks: number;
  total_transitions: number;
  dwell_by_status: { status: string; avg_days: number; samples: number }[];
  bottleneck_status?: string;
  bottleneck_avg_days?: number;
}

export default function PmAnalytics() {
  const { t } = useLocalization();
  const [velocity, setVelocity] = useState<Velocity | null>(null);
  const [cycle, setCycle] = useState<CycleTime | null>(null);
  const [burndown, setBurndown] = useState<Burndown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const [v, c] = await Promise.all([
          apiGet<Velocity>(`/pm/velocity`),
          apiGet<CycleTime>(`/pm/cycle-time`).catch(() => null),
        ]);
        setVelocity(v);
        setCycle(c);
        // Burndown needs a specific sprint — prefer the active one, else the latest.
        const target = v?.sprints?.find((s) => s.status === "active") ?? v?.sprints?.at(-1);
        if (target) {
          setBurndown(await apiGet<Burndown>(`/pm/sprints/${target.sprint_id}/burndown`).catch(() => null));
        }
      } catch (err) {
        console.error("Failed to load PM analytics", err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  if (loading) return <LoadingState />;

  const maxPoints = Math.max(1, ...(velocity?.sprints ?? []).map((s) => s.committed_points));
  const statusLabel = (s: string) => t(`pm.status.${s}`, s.replace(/_/g, " "));

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <PageHeader
        icon={<Gauge className="h-6 w-6 text-brand" />}
        title={t("pm.analytics", "Delivery analytics")}
        description={t("pm.analyticsDesc", "Velocity, burndown, and cycle time from real task history.")}
      />

      <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
        {/* Headline */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-brand bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-brand">{t("pm.avgVelocity", "Avg velocity")}</p>
            <p className="font-mono text-2xl font-black text-brand">{velocity?.average_velocity_points ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("pm.pointsPerSprint", "points / sprint")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("pm.completedSprints", "Completed sprints")}</p>
            <p className="font-mono text-2xl font-black text-foreground">{velocity?.completed_sprints ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("pm.avgCycleTime", "Avg cycle time")}</p>
            <p className="font-mono text-2xl font-black text-foreground">{cycle?.avg_cycle_days ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t("hr.days", "days")}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-amber-600">
              <Timer className="h-3 w-3" />
              {t("pm.bottleneck", "Bottleneck")}
            </p>
            <p className="text-lg font-black capitalize text-amber-600">
              {cycle?.bottleneck_status ? statusLabel(cycle.bottleneck_status) : "—"}
            </p>
            {cycle?.bottleneck_avg_days ? (
              <p className="font-mono text-xs text-muted-foreground">{cycle.bottleneck_avg_days} {t("hr.days", "days")}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Velocity per sprint */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Gauge className="h-5 w-5 text-brand" />
              {t("pm.velocityBySprint", "Velocity by sprint")}
            </h3>
            {!velocity?.sprints?.length ? (
              <p className="text-sm text-muted-foreground">{t("pm.noSprints", "No sprints yet.")}</p>
            ) : (
              <div className="space-y-3">
                {velocity.sprints.map((s) => (
                  <div key={s.sprint_id}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="truncate text-foreground">
                        {s.name}
                        <span className="ms-2 text-xs capitalize text-muted-foreground">{s.status}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        <b className="text-brand">{s.completed_points}</b> / {s.committed_points}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((s.completed_points / maxPoints) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cycle time by status */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Timer className="h-5 w-5 text-brand" />
              {t("pm.dwellByStatus", "Time in each status")}
            </h3>
            {!cycle?.total_transitions ? (
              <p className="text-sm text-muted-foreground">{t("pm.noHistory", "No task history yet.")}</p>
            ) : (
              <div className="space-y-2">
                {cycle.dwell_by_status.map((d) => (
                  <div key={d.status} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm">
                    <span className="capitalize text-foreground">{statusLabel(d.status)}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-muted-foreground">{d.avg_days} {t("hr.days", "days")}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{d.samples}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Burndown */}
        {burndown ? (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
              <TrendingDown className="h-5 w-5 text-brand" />
              {t("pm.burndown", "Burndown")} · {burndown.name}
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              {t("pm.burndownDesc", "Remaining points versus the ideal line")} · {burndown.total_points} {t("pm.points", "points")}
            </p>
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-end gap-2" style={{ height: 160 }}>
                {burndown.series.map((pt) => {
                  const scale = (v: number) => (burndown.total_points > 0 ? (v / burndown.total_points) * 140 : 0);
                  return (
                    <div key={pt.date} className="flex w-12 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                      <div className="flex h-full w-full items-end justify-center gap-0.5">
                        {/* ideal */}
                        <div className="w-3 rounded-t bg-muted" style={{ height: Math.max(2, scale(pt.ideal_remaining)) }} title={`${t("pm.ideal", "Ideal")}: ${pt.ideal_remaining}`} />
                        {/* actual — absent for future days by design */}
                        {typeof pt.remaining === "number" ? (
                          <div className="w-3 rounded-t bg-brand" style={{ height: Math.max(2, scale(pt.remaining)) }} title={`${t("pm.actual", "Actual")}: ${pt.remaining}`} />
                        ) : null}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{pt.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-muted" />{t("pm.ideal", "Ideal")}</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-brand" />{t("pm.actual", "Actual")}</span>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
