import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface TaskItem {
  id: string;
  name: string;
  status: string;
  assignee?: string;
  due_date?: string;
}

// Fallback tasks when no backend data is available
const FALLBACK_TASKS: TaskItem[] = [
  { id: "1", name: "Approve new API schemas", status: "done", assignee: "Tech Lead" },
  { id: "2", name: "Review HR Policy Update", status: "todo", assignee: "Due today, 5:00 PM" },
  { id: "3", name: "Prepare Q3 Report", status: "todo", assignee: "Due next week" },
];

export default function TasksWidget() {
  const { t } = useLocalization();
  const primary = useThemeStore((state) => state.primaryColor);

  const [tasks, setTasks] = useState<TaskItem[]>(FALLBACK_TASKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchTasks = async () => {
      try {
        // Try to fetch tasks from projects endpoint
        const res = await fetchWithAuth(`${API_BASE_URL}/projects`);
        if (!res.ok) throw new Error("Failed to fetch projects");
        const data = await res.json();
        if (isMounted && data.projects?.length > 0) {
          // Fetch tasks from the first project
          const projectId = data.projects[0].id;
          const tasksRes = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/tasks`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            const fetchedTasks = (tasksData.tasks || []).slice(0, 5).map((task: Record<string, unknown>) => ({
              id: task.id as string,
              name: task.name as string || "Untitled Task",
              status: task.status as string || "todo",
              assignee: task.assignee_name as string || "",
              due_date: task.due_date as string || "",
            }));
            if (fetchedTasks.length > 0) {
              setTasks(fetchedTasks);
            }
          }
        }
      } catch (err) {
        console.error("TasksWidget: using fallback data", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchTasks();
    return () => { isMounted = false; };
  }, []);

  const getStatusLabel = (status: string) => {
    if (status === "done") return t("dashboard.status.done", "Done");
    if (status === "in_progress") return t("dashboard.status.inProgress", "In Progress");
    if (status === "review") return t("dashboard.status.review", "In Review");
    if (status === "blocked") return t("dashboard.status.blocked", "Blocked");
    return t("dashboard.status.pending", "Pending");
  };

  const getStatusIcon = (status: string) => {
    if (status === "done") return CheckCircle2;
    return Clock;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 h-full">
      {tasks.map((task) => {
        const Icon = getStatusIcon(task.status);
        const isLowPriority = task.status === "blocked" || task.status === "todo";
        return (
          <div
            key={task.id}
            className={`group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer ${isLowPriority ? "opacity-70 hover:opacity-100" : ""}`}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = primary)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
          >
            <div className="flex items-center min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center ltr:me-4 rtl:ms-4 group-hover:scale-110 transition-transform dark:bg-slate-800 bg-blue-50 shrink-0"
              >
                <Icon className="w-5 h-5 text-[var(--primary-hex)]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-800 truncate">{task.name}</h4>
                {task.assignee && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{task.assignee}</p>
                )}
              </div>
            </div>
            <span
              className="text-xs font-bold px-3 py-1 rounded-full border dark:bg-slate-800 bg-blue-50 text-[var(--primary-hex)] dark:border-slate-700 border-blue-200 shrink-0 ms-2"
            >
              {getStatusLabel(task.status)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
