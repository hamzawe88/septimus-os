"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  PauseCircle,
  Play,
  Workflow,
  Zap,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

const INITIAL_WORKFLOWS = [
  {
    id: "w1",
    nameKey: "w1Name",
    status: "active",
    lastRunKey: "0800AM",
    runsToday: 1,
  },
  {
    id: "w2",
    nameKey: "w2Name",
    status: "active",
    lastRunKey: "1230PM",
    runsToday: 4,
  },
  {
    id: "w3",
    nameKey: "w3Name",
    status: "paused",
    lastRunKey: "yesterday",
    runsToday: 0,
  },
];

export default function WorkflowsWidget() {
  const { t } = useLocalization();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState(INITIAL_WORKFLOWS);

  const runWorkflow = (id: string) => {
    setRunningId(id);
    window.setTimeout(() => {
      setWorkflows((current) =>
        current.map((workflow) =>
          workflow.id === id
            ? {
                ...workflow,
                lastRunKey: "justNow",
                runsToday: workflow.runsToday + 1,
              }
            : workflow,
        ),
      );
      setRunningId(null);
    }, 800);
  };

  const toggleStatus = (id: string) => {
    setWorkflows((current) =>
      current.map((workflow) =>
        workflow.id === id
          ? {
              ...workflow,
              status: workflow.status === "active" ? "paused" : "active",
            }
          : workflow,
      ),
    );
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          <Workflow className="size-4 text-brand" aria-hidden />
          {t("dashboard.workflows.title")}
        </h3>
        <Tag tone="brand">
          {workflows.filter((workflow) => workflow.status === "active").length}{" "}
          {t("dashboard.workflows.active")}
        </Tag>
      </div>

      <div className="flex max-h-[195px] flex-1 flex-col gap-2.5 overflow-y-auto">
        {workflows.map((workflow) => {
          const isRunning = runningId === workflow.id;
          const isActive = workflow.status === "active";
          return (
            <article
              key={workflow.id}
              className={`flex items-center justify-between gap-2 rounded-[var(--radius-surface)] border p-3 transition-colors ${
                isActive
                  ? "border-border bg-muted/35"
                  : "border-border/60 bg-muted/20 opacity-70"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant={isActive ? "secondary" : "ghost"}
                  className={isActive ? "text-success" : ""}
                  onClick={() => toggleStatus(workflow.id)}
                  title={
                    isActive ? t("common.pause") : t("common.activate")
                  }
                  aria-label={
                    isActive ? t("common.pause") : t("common.activate")
                  }
                >
                  {isActive ? <CheckCircle2 /> : <PauseCircle />}
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    {t(`dashboard.workflows.${workflow.nameKey}`)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {t("dashboard.workflows.lastRun")}{" "}
                      <strong>
                        {t(
                          `dashboard.workflows.${workflow.lastRunKey}`,
                        )}
                      </strong>
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      <strong>{workflow.runsToday}</strong>{" "}
                      {t("dashboard.workflows.runs")}
                    </span>
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isRunning ? "secondary" : "default"}
                onClick={() => runWorkflow(workflow.id)}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Activity className="animate-spin" />
                ) : (
                  <Play />
                )}
                <span className="hidden sm:inline">
                  {isRunning
                    ? t("dashboard.workflows.running")
                    : t("dashboard.workflows.run")}
                </span>
              </Button>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-info/20 bg-info/10 p-2.5 text-xs font-medium text-info">
        <span className="flex min-w-0 items-center gap-1.5">
          <Zap className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {t("dashboard.workflows.n8nConnected")}
          </span>
        </span>
        <span className="shrink-0 font-mono text-xs font-bold">
          {t("dashboard.workflows.zeroErrors")}
        </span>
      </div>
    </div>
  );
}
