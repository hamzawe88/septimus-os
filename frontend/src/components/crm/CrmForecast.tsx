"use client";

import React, { useState, useEffect } from "react";
import { TrendingUp, Filter, Clock, Gauge } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

interface StageRow {
  stage: string;
  count: number;
  value: number;
  probability: number;
  weighted_value: number;
}
interface FunnelRow {
  stage: string;
  reached: number;
  conversion_from_previous_percent?: number;
}
interface StalledRow {
  id: string;
  title: string;
  stage: string;
  value: number;
  idle_days: number;
}
interface Forecast {
  currency: string;
  pipeline: { open_count: number; open_value: number; weighted_value: number; by_stage: StageRow[] };
  outcomes: { won_count: number; won_value: number; lost_count: number; win_rate_percent: number };
  funnel: FunnelRow[];
  stalled: StalledRow[];
  stale_after_days: number;
}
interface Velocity {
  avg_cycle_days: number;
  closed_deals: number;
  dwell_by_stage: { stage: string; avg_days: number; samples: number }[];
  bottleneck_stage?: string;
  bottleneck_avg_days?: number;
}

export default function CrmForecast() {
  const { t, formatCurrency } = useLocalization();
  const [data, setData] = useState<Forecast | null>(null);
  const [velocity, setVelocity] = useState<Velocity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const [f, v] = await Promise.all([
          apiGet<Forecast>(`/crm/forecast?currency=SAR`),
          apiGet<Velocity>(`/crm/velocity`).catch(() => null),
        ]);
        setData(f);
        setVelocity(v);
      } catch (err) {
        console.error("Failed to load CRM forecast", err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  if (loading) return <LoadingState />;
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        {t("crm.forecastUnavailable", "Forecast unavailable.")}
      </div>
    );
  }

  const p = data.pipeline;
  const maxStageValue = Math.max(1, ...p.by_stage.map((s) => s.value));
  const stageLabel = (s: string) => t(`crm.stages.${s}`, s.replace(/_/g, " "));

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <PageHeader
        icon={<TrendingUp className="h-6 w-6 text-brand" />}
        title={t("crm.forecast", "Sales forecast")}
        description={t("crm.forecastDesc", "Weighted pipeline, conversion funnel, and stalled deals.")}
      />

      <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("crm.openDeals", "Open deals")}</p>
            <p className="font-mono text-2xl font-black text-foreground">{p.open_count}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("crm.openValue", "Open value")}</p>
            <p className="font-mono text-xl font-black text-foreground">{formatCurrency(p.open_value)}</p>
          </div>
          <div className="rounded-xl border border-brand bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-brand">{t("crm.weightedValue", "Weighted forecast")}</p>
            <p className="font-mono text-xl font-black text-brand">{formatCurrency(p.weighted_value)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("crm.winRate", "Win rate")}</p>
            <p className="font-mono text-2xl font-black text-emerald-600">{data.outcomes.win_rate_percent}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Weighted pipeline by stage */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Gauge className="h-5 w-5 text-brand" />
              {t("crm.pipelineByStage", "Pipeline by stage")}
            </h3>
            <div className="space-y-3">
              {p.by_stage.map((s) => (
                <div key={s.stage}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="capitalize text-foreground">
                      {stageLabel(s.stage)}
                      <span className="ms-2 text-xs text-muted-foreground">
                        {s.count} · {Math.round(s.probability * 100)}%
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatCurrency(s.value)} → <b className="text-brand">{formatCurrency(s.weighted_value)}</b>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.round((s.value / maxStageValue) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Conversion funnel */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Filter className="h-5 w-5 text-brand" />
              {t("crm.funnel", "Conversion funnel")}
            </h3>
            <div className="space-y-2">
              {data.funnel.map((f) => (
                <div key={f.stage} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm">
                  <span className="capitalize text-foreground">{stageLabel(f.stage)}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground">{f.reached}</span>
                    {typeof f.conversion_from_previous_percent === "number" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {f.conversion_from_previous_percent}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {velocity && velocity.closed_deals > 0 && (
              <div className="mt-4 border-t border-border pt-4 text-sm">
                <p className="text-muted-foreground">
                  {t("crm.avgCycle", "Average cycle")}:{" "}
                  <b className="font-mono text-foreground">{velocity.avg_cycle_days}</b>{" "}
                  {t("hr.days", "days")}
                  {velocity.bottleneck_stage && (
                    <>
                      {" · "}
                      {t("crm.bottleneck", "Bottleneck")}:{" "}
                      <b className="capitalize text-amber-600">{stageLabel(velocity.bottleneck_stage)}</b>
                    </>
                  )}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Stalled deals */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Clock className="h-5 w-5 text-amber-500" />
            {t("crm.stalledDeals", "Stalled deals")}
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("crm.stalledDesc", "Open deals with no activity for over")} {data.stale_after_days} {t("hr.days", "days")}
          </p>
          {data.stalled.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("crm.noStalled", "No stalled deals.")}</p>
          ) : (
            <div className="space-y-2">
              {data.stalled.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-foreground">{s.title}</span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    <span className="text-xs capitalize text-muted-foreground">{stageLabel(s.stage)}</span>
                    <span className="font-mono text-muted-foreground">{formatCurrency(s.value)}</span>
                    <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {s.idle_days} {t("hr.days", "days")}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
