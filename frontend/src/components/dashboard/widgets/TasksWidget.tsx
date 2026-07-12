"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, Loader2, Check } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface TaskItem {
  id: string;
  name: string;
  status: string;
  assignee?: string;
  due_date?: string;
  priority?: "critical" | "high" | "normal";
}

const FALLBACK_TASKS: TaskItem[] = [
  { id: "1", name: "Approve new API schemas (#849)", status: "done", assignee: "Tech Lead", priority: "critical" },
  { id: "2", name: "Review HR Policy & Libya Labor Law", status: "todo", assignee: "Due today, 5:00 PM", priority: "high" },
  { id: "3", name: "Prepare Q3 Financial Audit Report", status: "todo", assignee: "Due next week", priority: "normal" },
  { id: "4", name: "Verify Multi-Node Redis Replication", status: "in_progress", assignee: "DevOps Team", priority: "critical" },
];

export default function TasksWidget() {
  const { t } = useLocalization();
  const [tasks, setTasks] = useState<TaskItem[]>(FALLBACK_TASKS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "todo" | "done">("all");

  useEffect(() => {
    let isMounted = true;
    const fetchTasks = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/projects`);
        if (!res.ok) throw new Error("Failed to fetch projects");
        const data = await res.json();
        if (isMounted && data.projects?.length > 0) {
          const projectId = data.projects[0].id;
          const tasksRes = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/tasks`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            const fetchedTasks = (tasksData.tasks || []).slice(0, 6).map((task: Record<string, unknown>, idx: number) => ({
              id: task.id as string,
              name: (task.name as string) || "Untitled Task",
              status: (task.status as string) || "todo",
              assignee: (task.assignee_name as string) || "Assigned",
              due_date: (task.due_date as string) || "",
              priority: idx % 3 === 0 ? "critical" : idx % 2 === 0 ? "high" : "normal",
            }));
            if (fetchedTasks.length > 0) {
              setTasks(fetchedTasks);
            }
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchTasks();
    return () => { isMounted = false; };
  }, []);

  const handleToggleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t
      )
    );
  };

  const tasksList = tasks.map((item) => {
    if (item.id === "1") return { ...item, name: t("dashboard.tasks.t1Name", "Approve new API schemas (#849)"), assignee: t("dashboard.tasks.t1Assignee", "Tech Lead") };
    if (item.id === "2") return { ...item, name: t("dashboard.tasks.t2Name", "Review HR Policy & Libya Labor Law"), assignee: t("dashboard.tasks.t2Assignee", "Due today, 5:00 PM") };
    if (item.id === "3") return { ...item, name: t("dashboard.tasks.t3Name", "Prepare Q3 Financial Audit Report"), assignee: t("dashboard.tasks.t3Assignee", "Due next week") };
    if (item.id === "4") return { ...item, name: t("dashboard.tasks.t4Name", "Verify Multi-Node Redis Replication"), assignee: t("dashboard.tasks.t4Assignee", "DevOps Team") };
    return item;
  });

  const filteredTasks = tasksList.filter((tItem) => {
    if (activeTab === "todo") return tItem.status !== "done";
    if (activeTab === "done") return tItem.status === "done";
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[160px]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Filter Tabs */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          {(["all", "todo", "done"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                activeTab === tab
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab === "all" ? t("dashboard.tasks.all", "All") : tab === "todo" ? t("dashboard.tasks.pending", "Pending") : t("dashboard.tasks.completed", "Completed")}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-bold text-slate-400">
          {tasksList.filter((tItem) => tItem.status === "done").length}/{tasksList.length} {t("dashboard.tasks.doneLabel", "Done")}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1 max-h-[180px]">
        {filteredTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-slate-400">
            <CheckCircle2 className="w-8 h-8 mb-1 opacity-50" />
            <p className="text-xs font-bold">{t("dashboard.tasks.empty", "No tasks in this view")}</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                onClick={() => handleToggleStatus(task.id)}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isDone
                    ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 opacity-75"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-400 dark:hover:border-blue-500"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : "border-2 border-slate-300 dark:border-slate-600 text-transparent group-hover:border-blue-500"
                    }`}
                  >
                    {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div className="min-w-0">
                    <h4
                      className={`text-xs font-bold truncate ${
                        isDone ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-white"
                      }`}
                    >
                      {task.name}
                    </h4>
                    {task.assignee && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{task.assignee}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {task.priority && !isDone && (
                    <span
                      className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        task.priority === "critical"
                          ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800"
                          : task.priority === "high"
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {task.priority === "critical" ? t("dashboard.tasks.critical", "critical") : task.priority === "high" ? t("dashboard.tasks.high", "high") : t("dashboard.tasks.normal", "normal")}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
