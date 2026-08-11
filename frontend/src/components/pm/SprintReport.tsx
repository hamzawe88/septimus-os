import React from "react";
import { Activity, CheckCircle2, History, Target, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/ui/stat-tile";
import { Surface, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import type { Task } from "@/types";

interface SprintSummary {
  ID: string;
  Name: string;
}

interface SprintReportProps {
  sprint: SprintSummary;
  tasks: Task[];
  onClose: () => void;
}

export default function SprintReport({
  sprint,
  tasks,
  onClose,
}: SprintReportProps) {
  const { t } = useLocalization();
  const sprintTasks = tasks.filter((task) => task.SprintID === sprint.ID);
  const totalTasks = sprintTasks.length;
  const doneTasks = sprintTasks.filter((task) => task.Status === "done").length;
  const inProgressTasks = sprintTasks.filter(
    (task) => task.Status === "in_progress",
  ).length;
  const reviewTasks = sprintTasks.filter(
    (task) => task.Status === "review",
  ).length;
  const todoTasks = sprintTasks.filter((task) => task.Status === "todo").length;
  const completionRate =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const workload = new Map<string, number>();
  sprintTasks.forEach((task) => {
    const assignee = task.AssigneeID || "unassigned";
    workload.set(assignee, (workload.get(assignee) || 0) + 1);
  });
  const workloadData = Array.from(workload.entries())
    .map(([assignee, count]) => ({ assignee, count }))
    .sort((a, b) => b.count - a.count);
  const maxWorkload = Math.max(1, ...workloadData.map((item) => item.count));

  const statusData = [
    { key: "done", value: doneTasks, tone: "success" as const },
    { key: "in_progress", value: inProgressTasks, tone: "brand" as const },
    { key: "review", value: reviewTasks, tone: "warning" as const },
    { key: "todo", value: todoTasks, tone: "neutral" as const },
  ];

  return (
    <section
      className="absolute inset-0 z-50 flex flex-col overflow-y-auto bg-background text-foreground"
      aria-label={t("pm.sprintReport.label")}
      data-testid="sprint-report"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/90 p-4 backdrop-blur-md">
        <div>
          <h2 className="flex items-center text-xl font-bold">
            <Activity className="me-2 size-5 text-brand" aria-hidden />
            {t("pm.sprintReport.title")}: {sprint.Name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("pm.sprintReport.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          title={t("pm.sprintReport.close")}
          aria-label={t("pm.sprintReport.close")}
        >
          <X />
        </Button>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatTile
            icon={<Target />}
            label={t("pm.sprintReport.totalTasks")}
            value={totalTasks}
            detail={t("pm.sprintReport.currentSnapshot")}
          />
          <StatTile
            icon={<CheckCircle2 />}
            label={t("pm.sprintReport.completedTasks")}
            value={doneTasks}
            detail={t("pm.sprintReport.approvedDone")}
          />
          <StatTile
            icon={<Activity />}
            label={t("pm.sprintReport.completionRate")}
            value={`${completionRate}%`}
            detail={t("pm.sprintReport.basedOnStatus")}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Surface>
            <PanelHeader>
              <PanelTitle>{t("pm.sprintReport.statusSnapshot")}</PanelTitle>
            </PanelHeader>
            <PanelBody className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("pm.sprintReport.completionRate")}
                  </span>
                  <strong>{completionRate}%</strong>
                </div>
                <Progress value={completionRate} aria-label={t("pm.sprintReport.completionRate")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {statusData.map((status) => (
                  <div
                    key={status.key}
                    className="flex items-center justify-between rounded-[var(--radius-control)] border border-border bg-surface-subtle p-3"
                  >
                    <Tag tone={status.tone}>
                      {t(`pm.kanban.status.${status.key}`)}
                    </Tag>
                    <strong>{status.value}</strong>
                  </div>
                ))}
              </div>
            </PanelBody>
          </Surface>

          <Surface>
            <PanelHeader>
              <PanelTitle>{t("pm.sprintReport.burndown")}</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <EmptyState
                icon={<History aria-hidden />}
                title={t("pm.sprintReport.noHistory")}
                description={t("pm.sprintReport.noHistoryDescription")}
                className="border-0 shadow-none"
              />
            </PanelBody>
          </Surface>

          <Surface className="lg:col-span-2">
            <PanelHeader>
              <PanelTitle>{t("pm.sprintReport.workload")}</PanelTitle>
            </PanelHeader>
            <PanelBody>
              {workloadData.length === 0 ? (
                <EmptyState
                  title={t("pm.sprintReport.noWorkload")}
                  description={t("pm.sprintReport.noWorkloadDescription")}
                  className="border-0 shadow-none"
                />
              ) : (
                <div className="space-y-4">
                  {workloadData.map(({ assignee, count }) => {
                    const label =
                      assignee === "unassigned"
                        ? t("pm.taskDetails.unassigned")
                        : `${t("pm.sprintReport.assigneeReference")} ${assignee.slice(0, 8)}`;
                    return (
                      <div key={assignee} className="grid grid-cols-[minmax(8rem,auto)_1fr_auto] items-center gap-3">
                        <span className="truncate text-sm font-medium" title={label}>
                          {label}
                        </span>
                        <Progress
                          value={(count / maxWorkload) * 100}
                          aria-label={`${label}: ${count}`}
                        />
                        <Tag tone="neutral">{count}</Tag>
                      </div>
                    );
                  })}
                </div>
              )}
            </PanelBody>
          </Surface>
        </div>
      </div>
    </section>
  );
}
