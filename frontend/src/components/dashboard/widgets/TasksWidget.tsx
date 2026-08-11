"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { Task } from "@/types";

interface TaskListResponse {
  tasks: Task[];
}

const nextStatus: Record<string, string> = {
  todo: "in_progress",
  in_progress: "review",
  review: "done",
  blocked: "in_progress",
  done: "in_progress",
};

function taskTone(priority: number) {
  if (priority >= 3) return "danger" as const;
  if (priority >= 2) return "warning" as const;
  return "neutral" as const;
}

export default function TasksWidget() {
  const { t, language } = useLocalization();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "todo" | "done">("all");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiGet<TaskListResponse>("/tasks?page=1&limit=8");
      setTasks(response.tasks || []);
    } catch (error) {
      console.error("Failed to load canonical project tasks", error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchTasks);
    const refresh = () => void fetchTasks();
    window.addEventListener("ws-message", refresh);
    return () => window.removeEventListener("ws-message", refresh);
  }, [fetchTasks]);

  const handleAdvanceStatus = async (task: Task) => {
    const target = nextStatus[task.Status];
    if (!target) return;
    const previous = tasks;
    setTasks((current) => current.map((item) => item.ID === task.ID ? { ...item, Status: target } : item));
    try {
      await apiPost(`/tasks/${task.ID}/transition`, { status: target });
    } catch (error) {
      console.error("Failed to transition project task", error);
      setTasks(previous);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (activeTab === "todo") return task.Status !== "done";
    if (activeTab === "done") return task.Status === "done";
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center" aria-label={t("common.loading")}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <div className="flex items-center gap-1">
          {(["all", "todo", "done"] as const).map((tab) => (
            <Button key={tab} type="button" variant={activeTab === tab ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(tab)}>
              {tab === "all" ? t("dashboard.tasks.all") : tab === "todo" ? t("dashboard.tasks.pending") : t("dashboard.tasks.completed")}
            </Button>
          ))}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {tasks.filter((task) => task.Status === "done").length}/{tasks.length} {t("dashboard.tasks.doneLabel")}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title={t("dashboard.tasks.empty")} className="min-h-40" />
        ) : filteredTasks.map((task) => (
          <article key={task.ID} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => void handleAdvanceStatus(task)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("dashboard.tasks.toggleStatus")}
              title={t("dashboard.tasks.toggleStatus")}
            >
              {task.Status === "done" ? <CheckCircle2 className="size-5 text-success" /> : <Clock className="size-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <h3 className={task.Status === "done" ? "truncate text-sm font-semibold text-muted-foreground line-through" : "truncate text-sm font-semibold"}>{task.Title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t(`pm.kanban.status.${task.Status}`)}</span>
                {task.DueDate ? <time dateTime={task.DueDate}>{new Date(task.DueDate).toLocaleDateString(language === "ar" ? "ar-LY" : "en-US")}</time> : null}
              </div>
            </div>
            <Tag tone={taskTone(task.Priority)}>P{task.Priority}</Tag>
          </article>
        ))}
      </div>
    </div>
  );
}
