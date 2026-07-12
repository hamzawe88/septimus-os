import React, { useState } from "react";
import { Plus, MessageSquare, Zap, Lock, ExternalLink, Star, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { OrbitTask } from "./types";

interface SmartInputsColumnProps {
  tasks: OrbitTask[];
  onAddTask: (title: string, sourceType: string) => Promise<void>;
  onPromoteToTop3: (task: OrbitTask, slot: number) => Promise<void>;
  onCompleteTask: (task: OrbitTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export default function SmartInputsColumn({
  tasks,
  onAddTask,
  onPromoteToTop3,
  onCompleteTask,
  onDeleteTask,
}: SmartInputsColumnProps) {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<"chat" | "workflow" | "private">("chat");
  const [quickInput, setQuickInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || isAdding) return;
    setIsAdding(true);
    try {
      await onAddTask(quickInput.trim(), "PRIVATE");
      setQuickInput("");
    } finally {
      setIsAdding(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (t.status === "ARCHIVED" || t.status === "DONE") return false;
    if (t.focus_priority > 0) return false; // Hide tasks that are currently inside Top 3 focus slots
    if (activeTab === "chat") return t.source_type === "CHAT";
    if (activeTab === "workflow")
      return t.source_type === "WORKFLOW" || t.source_type === "CRM" || t.source_type === "HR";
    return t.source_type === "PRIVATE";
  });

  const getEnergyBadge = (tag: string) => {
    switch (tag) {
      case "HIGH_ENERGY":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50 font-medium">⚡ High</span>;
      case "DEEP_FOCUS":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50 font-medium">🧠 Deep</span>;
      case "LIGHT":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50 font-medium">☕ Light</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      {/* Column Header & Quick Capture */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand" />
          {t("my_orbit.tab_chat", "Stream & Inputs")}
        </h3>
        <form onSubmit={handleQuickAdd} className="flex gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder={t("my_orbit.quick_capture_placeholder", "+ Quick capture (Press Enter)")}
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all shadow-2xs"
          />
          <Button
            type="submit"
            disabled={isAdding || !quickInput.trim()}
            className="px-3 bg-brand hover:bg-brand-dark text-white rounded-xl shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/60 p-1.5 gap-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "chat"
              ? "bg-brand/10 text-brand border border-brand/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30 shadow-2xs font-bold"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{t("my_orbit.tab_chat", "💬 Chats")}</span>
        </button>
        <button
          onClick={() => setActiveTab("workflow")}
          className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "workflow"
              ? "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 shadow-2xs font-bold"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{t("my_orbit.tab_workflows", "⚡ Workflows")}</span>
        </button>
        <button
          onClick={() => setActiveTab("private")}
          className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "private"
              ? "bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30 shadow-2xs font-bold"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{t("my_orbit.tab_private", "🔒 Private")}</span>
        </button>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2 border-2 border-dashed border-slate-200 dark:border-slate-700/80 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 m-1">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 mb-1">
              {activeTab === "chat" && <MessageSquare className="w-6 h-6" />}
              {activeTab === "workflow" && <Zap className="w-6 h-6" />}
              {activeTab === "private" && <Lock className="w-6 h-6" />}
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {activeTab === "chat" && t("my_orbit.empty_chat", "No tasks captured from chat.")}
              {activeTab === "workflow" && t("my_orbit.empty_workflow", "No pending workflow assignments.")}
              {activeTab === "private" && t("my_orbit.empty_private", "No private backlog tasks.")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("my_orbit.capture_hint", "Use quick capture above or hover over any chat message to add items.")}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className="group relative bg-white dark:bg-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand/40 rounded-xl p-3.5 transition-all shadow-xs hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                  {task.title}
                </h4>
                {task.source_link && (
                  <a
                    href={task.source_link}
                    title="Jump to source"
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-brand shrink-0 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {task.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mb-2.5 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
                  {task.description}
                </p>
              )}

              {/* Badges and Actions footer */}
              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-700/80">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getEnergyBadge(task.energy_tag)}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50 font-mono font-semibold">
                    +{task.xp_reward} XP
                  </span>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      // Find first open slot 1, 2, or 3
                      const slot = 1;
                      onPromoteToTop3(task, slot);
                    }}
                    title={t("my_orbit.promote_top3", "⭐ Promote to Top 3 Focus")}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span className="hidden sm:inline">Top 3</span>
                  </button>
                  <button
                    onClick={() => onCompleteTask(task)}
                    title={t("my_orbit.complete_task", "✔ Mark Completed")}
                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 transition-colors shadow-2xs"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    title={t("my_orbit.delete_task", "Archive/Delete")}
                    className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 dark:border-red-500/30 opacity-0 group-hover:opacity-100 transition-all shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
