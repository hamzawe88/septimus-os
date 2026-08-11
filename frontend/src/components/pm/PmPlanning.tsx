"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, CircleDot, Route } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { PanelBody, PanelHeader, PanelTitle, Surface } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiGet } from "@/lib/apiClient";
import { useAppStore } from "@/store/useAppStore";
import type { PMPlanningData, PMPortfolioData } from "@/types";

export default function PmPlanning() {
  const { t } = useLocalization();
  const { projectId } = useAppStore();
  const [data, setData] = useState<PMPlanningData | null>(null);
  const [portfolio, setPortfolio] = useState<PMPortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!projectId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      apiGet<PMPlanningData>(`/pm/planning?project_id=${encodeURIComponent(projectId)}`),
      apiGet<PMPortfolioData>("/pm/portfolio"),
    ])
      .then(([planningResult, portfolioResult]) => { if (active) { setData(planningResult); setPortfolio(portfolioResult); } })
      .catch((loadError) => {
        console.error(loadError);
        if (active) setError(t("pm.planning.loadFailed"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, t]);

  const taskNames = useMemo(
    () => new Map((data?.tasks || []).map((task) => [task.id, task.title])),
    [data],
  );
  const timelineDays = Math.max(7, data?.duration_days || 0);
  const criticalCount = data?.tasks.filter((task) => task.critical).length || 0;

  if (!projectId) {
    return (
      <main data-testid="pm-planning" className="h-full overflow-auto bg-background p-6">
        <EmptyState icon={<CalendarRange />} title={t("pm.projectScope.noProjects")} description={t("pm.projectScope.chooseOrCreate")} />
      </main>
    );
  }

  if (loading) {
    return <main data-testid="pm-planning" className="grid h-full gap-4 overflow-auto bg-background p-6"><Skeleton className="h-28" /><Skeleton className="h-96" /></main>;
  }

  return (
    <main data-testid="pm-planning" className="h-full overflow-auto bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarRange className="size-7 text-brand" />{t("pm.planning.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pm.planning.description")}</p>
        </header>

        {error ? <Alert tone="danger"><AlertTriangle /><AlertDescription>{error}</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-3" aria-label={t("pm.planning.metrics")}>
          <StatTile label={t("pm.planning.duration")} value={data?.duration_days || 0} detail={t("pm.planning.days")} icon={<CalendarRange />} />
          <StatTile label={t("pm.planning.criticalTasks")} value={criticalCount} detail={t("pm.planning.zeroSlack")} icon={<Route />} />
          <StatTile label={t("pm.planning.dependencies")} value={data?.dependencies.length || 0} detail={t("pm.planning.guardedEdges")} icon={<CircleDot />} />
        </section>

        <Surface>
          <PanelHeader><PanelTitle>{t("pm.planning.gantt")}</PanelTitle></PanelHeader>
          <PanelBody>
            {data?.tasks.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[760px] space-y-2">
                  <div className="grid grid-cols-[minmax(180px,1fr)_4fr] gap-3 text-xs text-muted-foreground">
                    <span>{t("pm.planning.task")}</span>
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${timelineDays}, minmax(24px, 1fr))` }}>
                      {Array.from({ length: timelineDays }, (_, day) => <span key={day} className="text-center">{day + 1}</span>)}
                    </div>
                  </div>
                  {data.tasks.map((task) => (
                    <div key={task.id} className="grid grid-cols-[minmax(180px,1fr)_4fr] items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{task.title}</span>{task.critical ? <Tag tone="danger">{t("pm.planning.critical")}</Tag> : null}</div>
                        <span className="text-xs text-muted-foreground">{t("pm.planning.slack").replace("{value}", String(task.slack_days))}</span>
                      </div>
                      <div className="grid h-9 rounded-md bg-muted/60 p-1" style={{ gridTemplateColumns: `repeat(${timelineDays}, minmax(24px, 1fr))` }}>
                        <div
                          className={`flex items-center justify-center rounded px-2 text-xs font-semibold ${task.critical ? "bg-destructive text-destructive-foreground" : "bg-brand text-brand-foreground"}`}
                          style={{ gridColumn: `${task.earliest_start_day + 1} / span ${Math.max(1, task.duration_days)}` }}
                          title={`${task.title}: ${task.duration_days} ${t("pm.planning.days")}`}
                        >
                          {task.duration_days}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyState icon={<Route />} title={t("pm.planning.noTasks")} description={t("pm.planning.noTasksDescription")} />}
          </PanelBody>
        </Surface>

        {data?.dependencies.length ? (
          <Surface>
            <PanelHeader><PanelTitle>{t("pm.planning.dependencyMap")}</PanelTitle></PanelHeader>
            <PanelBody className="grid gap-2 md:grid-cols-2">
              {data.dependencies.map((edge) => (
                <div key={edge.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border p-3 text-sm">
                  <span className="truncate">{taskNames.get(edge.predecessor_id)} → {taskNames.get(edge.successor_id)}</span>
                  <Tag tone="neutral">{t("pm.planning.lag").replace("{value}", String(edge.lag_days))}</Tag>
                </div>
              ))}
            </PanelBody>
          </Surface>
        ) : null}

        <Surface data-testid="pm-portfolio-capacity">
          <PanelHeader><PanelTitle>{t("pm.planning.portfolio")}</PanelTitle></PanelHeader>
          <PanelBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {portfolio?.projects.map((project) => (
              <article key={project.project_id} className="space-y-3 rounded-[var(--radius-control)] border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-semibold">{project.project_name}</h3><p className="text-xs text-muted-foreground">{t("pm.planning.openPoints").replace("{value}", String(project.open_points))}</p></div>
                  <Tag tone={project.forecast_confidence === "high" ? "success" : project.forecast_confidence === "medium" ? "brand" : "neutral"}>{t(`pm.planning.confidence.${project.forecast_confidence}`)}</Tag>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-muted-foreground">{t("pm.planning.velocity")}</dt><dd className="font-semibold">{project.average_velocity}</dd></div>
                  <div><dt className="text-muted-foreground">{t("pm.planning.forecast")}</dt><dd className="font-semibold">{project.forecast_sprints ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">{t("pm.planning.capacity")}</dt><dd className="font-semibold">{project.capacity_utilization_percent == null ? "—" : `${project.capacity_utilization_percent}%`}</dd></div>
                  <div><dt className="text-muted-foreground">{t("pm.planning.unassigned")}</dt><dd className="font-semibold">{project.unassigned_points}</dd></div>
                </dl>
                {project.forecast_confidence === "insufficient_history" ? <p className="text-xs text-warning">{t("pm.planning.historyRequired")}</p> : null}
              </article>
            ))}
          </PanelBody>
        </Surface>
      </div>
    </main>
  );
}
