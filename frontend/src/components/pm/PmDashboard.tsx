"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Flag,
  FolderKanban,
  PlayCircle,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { PanelBody, PanelHeader, PanelTitle, Surface } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiGet } from "@/lib/apiClient";
import { useAppStore } from "@/store/useAppStore";
import type { PMDashboardData, Task } from "@/types";

const statusOrder = ["todo", "in_progress", "review", "blocked", "done"];

function priorityTone(priority: number) {
  if (priority >= 3) return "danger" as const;
  if (priority >= 2) return "warning" as const;
  return "neutral" as const;
}

function priorityKey(priority: number) {
  if (priority >= 3) return "high";
  if (priority >= 2) return "medium";
  return "low";
}

export default function PmDashboard() {
  const { t } = useLocalization();
  const { projectId } = useAppStore();
  const [data, setData] = useState<PMDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
        const response = await apiGet<PMDashboardData>(`/pm/dashboard${query}`);
        if (active) setData(response);
      } catch (loadError) {
        console.error(loadError);
        if (active) setError(t("pm.dashboard.loadFailed"));
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    const refresh = (event: Event) => {
      const eventType = (event as CustomEvent<{ type?: string }>).detail?.type || "";
      if (["task_updated", "task_created", "task_deleted", "sprint_updated", "task.transitioned", "task.created"].includes(eventType)) {
        void load();
      }
    };
    window.addEventListener("ws-message", refresh);
    return () => {
      active = false;
      window.removeEventListener("ws-message", refresh);
    };
  }, [projectId, t]);

  const statusData = useMemo(
    () =>
      statusOrder.map((status) => ({
        status,
        name: t(`pm.kanban.status.${status}`),
        value: data?.status_counts?.[status] || 0,
      })),
    [data, t],
  );
  const completionRate = data?.total_tasks
    ? Math.round((data.completed_tasks * 100) / data.total_tasks)
    : 0;

  if (isLoading) {
    return (
      <main data-testid="pm-dashboard" className="h-full overflow-y-auto bg-background p-6">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <Skeleton key={item} className="h-36" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="pm-dashboard"
      className="h-full w-full overflow-y-auto bg-background px-4 py-6 text-start text-foreground sm:px-6"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-2xl font-bold">
              <Target className="size-7 shrink-0 text-brand" aria-hidden />
              <span className="truncate">{t("pm.dashboard.title")}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pm.dashboard.subtitle")}</p>
          </div>
          {data?.active_sprint ? (
            <Tag tone="brand" className="w-fit px-3 py-2">
              <Activity className="animate-pulse" aria-hidden />
              {t("pm.dashboard.activeSprintLabel")}: {data.active_sprint.name}
            </Tag>
          ) : (
            <Tag tone="neutral" className="w-fit px-3 py-2">
              {t("pm.dashboard.noActiveSprint")}
            </Tag>
          )}
        </header>

        {error ? (
          <Alert tone="danger">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section aria-label={t("pm.dashboard.metrics")} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label={t("pm.dashboard.totalTasks")} value={data?.total_tasks || 0} detail={t("pm.dashboard.projectsValue").replace("{value}", String(data?.project_count || 0))} icon={<Clock />} />
          <StatTile label={t("pm.dashboard.inProgress")} value={data?.status_counts?.in_progress || 0} detail={data?.active_sprint ? t("pm.dashboard.currentSprint") : t("pm.dashboard.noActiveSprint")} icon={<PlayCircle />} />
          <StatTile label={t("pm.dashboard.completed")} value={data?.completed_tasks || 0} detail={t("pm.dashboard.completionRateValue").replace("{value}", String(completionRate))} icon={<CheckCircle2 />} />
          <StatTile label={t("pm.dashboard.overdue")} value={data?.overdue_tasks || 0} detail={t("pm.dashboard.requiresAttention")} icon={<AlertCircle />} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Surface>
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4 shrink-0 text-brand" aria-hidden />
                  {t("pm.dashboard.timelineHealth")}
                </PanelTitle>
              </PanelHeader>
              <PanelBody className="space-y-3">
                <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-success/10 p-3 text-success">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  <span className="text-sm font-semibold">{t("pm.dashboard.onTrackValue").replace("{value}", String(data?.on_track_percent || 0))}</span>
                </div>
                <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-warning/10 p-3 text-warning">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  <span className="text-sm font-semibold">{t("pm.dashboard.blockedValue").replace("{value}", String(data?.blocked_tasks || 0))}</span>
                </div>
              </PanelBody>
            </Surface>

            <Surface>
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2 text-base">
                  <Flag className="size-4 shrink-0 text-brand" aria-hidden />
                  {t("pm.dashboard.sprintProgress")}
                </PanelTitle>
              </PanelHeader>
              <PanelBody className="space-y-5">
                {data?.active_sprint ? (
                  <>
                    <DashboardProgress label={t("pm.dashboard.timeElapsed")} value={data.active_sprint.time_elapsed_percent} />
                    <DashboardProgress label={t("pm.dashboard.workComplete")} value={data.active_sprint.work_complete_percent} success />
                  </>
                ) : (
                  <EmptyState icon={<Flag />} title={t("pm.dashboard.noActiveSprint")} description={t("pm.dashboard.noActiveSprintDescription")} className="min-h-36" />
                )}
              </PanelBody>
            </Surface>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Surface>
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 shrink-0 text-brand" aria-hidden />
                    {t("pm.dashboard.taskDistribution")}
                  </PanelTitle>
                </PanelHeader>
                <PanelBody className="space-y-4">
                  {statusData.map((entry) => (
                    <div key={entry.status} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-muted-foreground">{entry.name}</span>
                        <span className="font-semibold">{entry.value}</span>
                      </div>
                      <Progress value={data?.total_tasks ? (entry.value * 100) / data.total_tasks : 0} />
                    </div>
                  ))}
                </PanelBody>
              </Surface>

              <Surface>
                <PanelHeader>
                  <PanelTitle className="flex items-center gap-2 text-base">
                    <Users className="size-4 shrink-0 text-brand" aria-hidden />
                    {t("pm.dashboard.teamWorkload")}
                  </PanelTitle>
                </PanelHeader>
                <PanelBody className="h-[260px]">
                  {data?.workload?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.workload} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="email" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)" }} tickFormatter={(value: string) => value.split("@")[0]} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)" }} />
                        <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: "var(--radius-control)", border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} />
                        <Bar dataKey="task_count" name={t("pm.dashboard.totalTasks")} fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState icon={<Users />} title={t("pm.dashboard.noWorkload")} description={t("pm.dashboard.noWorkloadDescription")} className="h-full min-h-0" />
                  )}
                </PanelBody>
              </Surface>
            </div>

            <Surface>
              <PanelHeader>
                <PanelTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4 shrink-0 text-warning" aria-hidden />
                  {t("pm.dashboard.myTasks")}
                </PanelTitle>
              </PanelHeader>
              <PanelBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {data?.my_tasks?.length ? data.my_tasks.map((task) => <DashboardTask key={task.ID} task={task} t={t} />) : (
                  <EmptyState icon={<FolderKanban />} title={t("pm.dashboard.noMyTasks")} description={t("pm.dashboard.noMyTasksDescription")} className="md:col-span-2" />
                )}
              </PanelBody>
            </Surface>
          </div>
        </div>
      </div>
    </main>
  );
}

function DashboardProgress({ label, value, success = false }: { label: string; value: number; success?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className={success ? "font-bold text-success" : "font-bold"}>{value}%</span>
      </div>
      <Progress value={value} indicatorClassName={success ? "bg-success" : undefined} />
    </div>
  );
}

function DashboardTask({ task, t }: { task: Task; t: (key: string, fallback?: string) => string }) {
  return (
    <article className="flex min-h-28 flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-muted/35 p-4 transition-colors hover:border-brand/30 hover:bg-muted/60">
      <h3 className="line-clamp-2 text-sm font-semibold">{task.Title}</h3>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Tag tone="neutral">{t(`pm.kanban.status.${task.Status}`)}</Tag>
        <Tag tone={priorityTone(task.Priority)}>{t(`pm.dashboard.priority.${priorityKey(task.Priority)}`)}</Tag>
      </div>
    </article>
  );
}
