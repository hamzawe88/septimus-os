import React, { useState, useEffect } from "react";
import { Play, Pause, X, Clock, Sparkles, Check } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { OrbitTask, OrbitProfile } from "./types";

interface FocusArenaColumnProps {
  tasks: OrbitTask[];
  profile: OrbitProfile;
  onToggleFocusTimer: (active: boolean, taskId: string) => Promise<void>;
  onCompleteTask: (task: OrbitTask) => Promise<void>;
  onDemoteFromTop3: (task: OrbitTask) => Promise<void>;
}

export default function FocusArenaColumn({
  tasks,
  profile,
  onToggleFocusTimer,
  onCompleteTask,
  onDemoteFromTop3,
}: FocusArenaColumnProps) {
  const { t } = useLocalization();
  const [secondsLeft, setSecondsLeft] = useState(profile.pomodoro_seconds_remaining || 1500);
  const [isRunning, setIsRunning] = useState(profile.focus_timer_active);
  const [activeTaskId, setActiveTaskId] = useState(profile.active_task_id || "");

  // Update state asynchronously when profile changes to avoid synchronous setState inside useEffect
  useEffect(() => {
    queueMicrotask(() => {
      if (isRunning !== profile.focus_timer_active) {
        setIsRunning(profile.focus_timer_active);
      }
      if (activeTaskId !== (profile.active_task_id || "")) {
        setActiveTaskId(profile.active_task_id || "");
      }
      if (profile.pomodoro_seconds_remaining && secondsLeft !== profile.pomodoro_seconds_remaining && !isRunning) {
        setSecondsLeft(profile.pomodoro_seconds_remaining);
      }
    });
  }, [profile, isRunning, activeTaskId, secondsLeft]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const top3Slots = [1, 2, 3];
  const activeTaskObj = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      {/* Column Header & Active Pomodoro Focus Banner */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 dark:from-slate-900 dark:via-blue-950/40 dark:to-slate-900">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            {t("my_orbit.daily_focus_title", "Daily Focus Top 3")}
          </h3>
          {/* Presence Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs">
            {isRunning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="text-red-600 dark:text-red-400 font-mono">
                  {t("my_orbit.do_not_disturb_on", "🔴 DND - In Focus")}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {t("my_orbit.do_not_disturb_off", "🟢 Available")}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Pomodoro Timer Banner */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center text-brand dark:text-blue-400 shrink-0">
              <Clock className={`w-6 h-6 ${isRunning ? "animate-spin" : ""}`} />
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100 tracking-wider">
                {formatTime(secondsLeft)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                {activeTaskObj
                  ? `Focusing: ${activeTaskObj.title}`
                  : t("my_orbit.pomodoro_banner_title", "Select a Top 3 task & press Start")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isRunning ? (
              <button
                onClick={() => {
                  setIsRunning(false);
                  onToggleFocusTimer(false, activeTaskId);
                }}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Pause className="w-4 h-4 fill-current" />
                <span>{t("my_orbit.stop_focus", "Pause Timer")}</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  const firstTask = tasks.find((t) => t.focus_priority >= 1 && t.focus_priority <= 3 && t.status !== "DONE");
                  if (!firstTask) return;
                  setIsRunning(true);
                  setActiveTaskId(firstTask.id);
                  onToggleFocusTimer(true, firstTask.id);
                }}
                disabled={!tasks.some((t) => t.focus_priority >= 1 && t.focus_priority <= 3 && t.status !== "DONE")}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t("my_orbit.start_focus", "Start Focus Timer")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Top 3 Zen Slots Arena */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {top3Slots.map((slotNum) => {
          const taskInSlot = tasks.find((t) => t.focus_priority === slotNum && t.status !== "DONE" && t.status !== "ARCHIVED");

          if (!taskInSlot) {
            return (
              <div
                key={slotNum}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/30 min-h-[140px] transition-all hover:border-slate-300 dark:hover:border-slate-600"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-mono font-bold text-sm mb-2 border border-slate-200 dark:border-slate-700">
                  {slotNum}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-xs">
                  {t("my_orbit.empty_slot", "Empty Zen Slot — Promote or drag a task here")}
                </p>
              </div>
            );
          }

          const isThisActive = isRunning && activeTaskId === taskInSlot.id;

          return (
            <div
              key={taskInSlot.id}
              className={`relative rounded-2xl p-4 transition-all shadow-sm border ${
                isThisActive
                  ? "bg-blue-50/40 dark:bg-blue-950/40 border-brand ring-2 ring-brand/30 animate-pulse-border"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {/* Slot Number Badge */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand/10 text-brand border border-brand/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/40 font-mono text-xs font-bold flex items-center justify-center">
                    {slotNum}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-semibold">
                    ⭐ Top Priority
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDemoteFromTop3(taskInSlot)}
                    title={t("my_orbit.demote_top3", "Unpin from Top 3")}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Task Title and Description */}
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1.5 leading-snug">
                {taskInSlot.title}
              </h4>
              {taskInSlot.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 mb-3">
                  {taskInSlot.description}
                </p>
              )}

              {/* Footer / Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50 font-mono font-bold">
                    +{taskInSlot.xp_reward + 25} XP (Bonus!)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isThisActive ? (
                    <button
                      onClick={() => {
                        setIsRunning(false);
                        onToggleFocusTimer(false, taskInSlot.id);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsRunning(true);
                        setActiveTaskId(taskInSlot.id);
                        onToggleFocusTimer(true, taskInSlot.id);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Focus</span>
                    </button>
                  )}

                  <button
                    onClick={() => onCompleteTask(taskInSlot)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{t("my_orbit.complete_task", "✔ Done")}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
