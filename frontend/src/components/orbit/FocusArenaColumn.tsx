import React, { useState, useEffect } from "react";
import { Play, Pause, X, Clock, Sparkles, Check, Maximize2, Minimize2, Timer } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { OrbitTask, OrbitProfile } from "./types";

interface FocusArenaColumnProps {
  tasks: OrbitTask[];
  profile: OrbitProfile;
  onToggleFocusTimer: (active: boolean, taskId: string, secondsRemaining?: number) => Promise<void>;
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
  const { t, language } = useLocalization();
  const [secondsLeft, setSecondsLeft] = useState(profile.pomodoro_seconds_remaining || 1500);
  const [isRunning, setIsRunning] = useState(profile.focus_timer_active);
  const [activeTaskId, setActiveTaskId] = useState(profile.active_task_id || "");
  const [isZenModeOpen, setIsZenModeOpen] = useState(false);
  const [selectedPresetMinutes, setSelectedPresetMinutes] = useState<number>(25);

  // Adopt server state only when the SERVER value itself changed between two
  // responses. Comparing the server snapshot against local state (the old
  // approach) fought the optimistic UI: pressing Start flipped isRunning
  // locally, then the stale profile flipped it straight back — freezing the
  // countdown at 25:00 and resetting the remaining seconds.
  const prevProfileRef = React.useRef(profile);
  useEffect(() => {
    const prev = prevProfileRef.current;
    prevProfileRef.current = profile;
    if (prev === profile) return;
    queueMicrotask(() => {
      if (prev.focus_timer_active !== profile.focus_timer_active) {
        setIsRunning(profile.focus_timer_active);
      }
      if ((prev.active_task_id || "") !== (profile.active_task_id || "")) {
        setActiveTaskId(profile.active_task_id || "");
      }
      if (
        profile.pomodoro_seconds_remaining &&
        prev.pomodoro_seconds_remaining !== profile.pomodoro_seconds_remaining &&
        !profile.focus_timer_active
      ) {
        setSecondsLeft(profile.pomodoro_seconds_remaining);
      }
    });
  }, [profile]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Session finished: stop locally and tell the server (DND off, timer at 0).
  useEffect(() => {
    if (secondsLeft !== 0 || !isRunning) return;
    queueMicrotask(() => {
      setIsRunning(false);
      onToggleFocusTimer(false, activeTaskId, 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isRunning]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectDuration = (mins: number) => {
    setSelectedPresetMinutes(mins);
    setIsRunning(false);
    setSecondsLeft(mins * 60);
  };

  const handleCustomDuration = () => {
    const input = window.prompt(
      t("my_orbit.custom_timer_prompt", "Enter focus duration in minutes (e.g. 30):"),
      String(selectedPresetMinutes)
    );
    if (!input) return;
    const parsed = parseInt(input.trim(), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 300) {
      handleSelectDuration(parsed);
    }
  };

  const top3Slots = [1, 2, 3];
  const activeTaskObj = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="flex flex-col h-full bg-card dark:bg-slate-800/90 border border-border dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm">
      {/* Column Header & Active Pomodoro Focus Banner */}
      <div className="p-4 border-b border-border dark:border-slate-700/80 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 dark:from-slate-900 dark:via-blue-950/40 dark:to-slate-900">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            {t("my_orbit.daily_focus_title", "Daily Focus Top 3")}
          </h3>
          {/* Presence Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-card dark:bg-slate-900 border border-border dark:border-slate-700 shadow-2xs">
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

        {/* Pomodoro Duration Presets Bar */}
        <div className="flex items-center justify-between gap-1 mb-3 bg-muted dark:bg-slate-800/80 p-1.5 rounded-xl border border-border/80 dark:border-slate-700">
          <div className="flex items-center gap-1 text-xs text-muted-foreground dark:text-muted-foreground font-medium px-1.5">
            <Timer className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">{t("my_orbit.timer_presets_title", "Timer Duration:")}</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {[
              { label: "15m", mins: 15 },
              { label: "25m", mins: 25 },
              { label: "45m", mins: 45 },
              { label: "60m", mins: 60 },
            ].map((p) => (
              <button
                key={p.mins}
                onClick={() => handleSelectDuration(p.mins)}
                className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedPresetMinutes === p.mins
                    ? "bg-brand text-white shadow-2xs"
                    : "bg-card text-muted-foreground hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={handleCustomDuration}
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-card dark:bg-slate-700 text-muted-foreground dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-dashed border-border dark:border-slate-600"
            >
              ⚙ {t("my_orbit.preset_custom", "Custom")}
            </button>
          </div>
        </div>

        {/* Pomodoro Timer Banner */}
        <div className="bg-card dark:bg-slate-900 border border-border dark:border-slate-700 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center text-brand dark:text-blue-400 shrink-0">
              <Clock className={`w-6 h-6 ${isRunning ? "animate-spin" : ""}`} />
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-foreground dark:text-slate-100 tracking-wider">
                {formatTime(secondsLeft)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground line-clamp-1">
                {activeTaskObj
                  ? `${t("my_orbit.focusing_prefix", "Focusing:")} ${activeTaskObj.title}`
                  : t("my_orbit.pomodoro_banner_title", "Select a Top 3 task & press Start")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => setIsZenModeOpen(true)}
              title={t("my_orbit.zen_mode_btn", "Enter Zen Focus Mode")}
              className="px-3 py-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-300/50 dark:border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
            >
              <Maximize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Zen</span>
            </button>

            {isRunning ? (
              <button
                onClick={() => {
                  setIsRunning(false);
                  onToggleFocusTimer(false, activeTaskId, secondsLeft);
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
                  onToggleFocusTimer(true, firstTask.id, secondsLeft);
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
                className="border-2 border-dashed border-border dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-muted/50 dark:bg-slate-900/30 min-h-[140px] transition-all hover:border-border dark:hover:border-slate-600"
              >
                <div className="w-8 h-8 rounded-full bg-muted dark:bg-slate-800 flex items-center justify-center text-muted-foreground font-mono font-bold text-sm mb-2 border border-border dark:border-slate-700">
                  {slotNum}
                </div>
                <p className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground max-w-xs">
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
                  : "bg-card dark:bg-slate-800 border-border dark:border-slate-700 hover:border-border dark:hover:border-slate-600"
              }`}
            >
              {/* Slot Number Badge */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-brand/10 text-brand border border-brand/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/40 font-mono text-xs font-bold flex items-center justify-center">
                    {slotNum}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-semibold">
                    ⭐ {language === "ar" ? "أولوية عليا" : "Top Priority"}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDemoteFromTop3(taskInSlot)}
                    title={t("my_orbit.demote_top3", "Unpin from Top 3")}
                    className="p-1.5 rounded-lg bg-muted hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Task Title and Description */}
              <h4 className="text-base font-bold text-foreground dark:text-slate-100 mb-1.5 leading-snug">
                {taskInSlot.title}
              </h4>
              {taskInSlot.description && (
                <p className="text-xs text-muted-foreground dark:text-slate-300 bg-muted dark:bg-slate-900/60 p-2.5 rounded-xl border border-border/80 dark:border-slate-700/60 mb-3">
                  {taskInSlot.description}
                </p>
              )}

              {/* Footer / Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-border dark:border-slate-700/80">
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
                        onToggleFocusTimer(false, taskInSlot.id, secondsLeft);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>{t("my_orbit.stop_focus", "Pause Timer")}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsRunning(true);
                        setActiveTaskId(taskInSlot.id);
                        onToggleFocusTimer(true, taskInSlot.id, secondsLeft);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{t("my_orbit.start_focus", "Start Focus Timer")}</span>
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

      {/* Immersive Fullscreen Zen Focus Mode Modal */}
      {isZenModeOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-card dark:bg-slate-950 text-foreground dark:text-slate-100 p-6 sm:p-12 animate-in fade-in zoom-in-95 duration-300">
          {/* Zen Header */}
          <div className="w-full max-w-5xl flex items-center justify-between border-b border-border dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-bounce">🧘</span>
              <h2 className="text-lg sm:text-xl font-bold tracking-wide text-foreground dark:text-slate-100">
                {t("my_orbit.zen_mode_title", "Immersive Zen Focus Mode")}
              </h2>
            </div>
            <button
              onClick={() => setIsZenModeOpen(false)}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-muted-foreground hover:text-foreground dark:text-slate-300 dark:hover:text-white flex items-center gap-2 text-sm font-semibold transition-all border border-border dark:border-slate-700"
            >
              <Minimize2 className="w-4 h-4" />
              <span>{t("my_orbit.zen_mode_exit", "Exit Zen Mode")}</span>
            </button>
          </div>

          {/* Zen Centerpiece: Huge Glowing Timer & Active Task */}
          <div className="flex flex-col items-center justify-center my-auto text-center max-w-3xl px-4 space-y-8">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-100/60 dark:bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
              <div className="text-7xl sm:text-9xl font-mono font-extrabold tracking-wider tabular-nums text-foreground dark:text-slate-100 relative z-10 py-4">
                {formatTime(secondsLeft)}
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-block px-3 py-1 rounded-full bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 text-muted-foreground dark:text-slate-300 text-xs font-semibold tracking-wide">
                {activeTaskObj ? t("my_orbit.focusing_prefix", "Focusing:") : t("my_orbit.zen_ready", "Zen Mode Ready")}
              </div>
              <h3 className="text-2xl sm:text-4xl font-extrabold text-foreground dark:text-slate-100 leading-tight">
                {activeTaskObj ? activeTaskObj.title : t("my_orbit.select_task_banner", "Select a Top 3 task & press Start")}
              </h3>
              {activeTaskObj?.description && (
                <p className="text-sm text-muted-foreground dark:text-slate-300 max-w-xl mx-auto bg-card dark:bg-slate-900 p-4 rounded-2xl border border-border dark:border-slate-700 shadow-sm">
                  {activeTaskObj.description}
                </p>
              )}
            </div>

            {/* Zen Controls */}
            <div className="flex items-center justify-center gap-4 pt-4">
              {isRunning ? (
                <button
                  onClick={() => {
                    setIsRunning(false);
                    onToggleFocusTimer(false, activeTaskId, secondsLeft);
                  }}
                  className="px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg flex items-center gap-3 shadow-lg shadow-amber-500/20 transition-all scale-105"
                >
                  <Pause className="w-6 h-6 fill-current" />
                  <span>{t("my_orbit.stop_focus", "Pause Timer")}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    const firstTask = activeTaskObj || tasks.find((t) => t.focus_priority >= 1 && t.focus_priority <= 3 && t.status !== "DONE");
                    if (!firstTask) return;
                    setIsRunning(true);
                    setActiveTaskId(firstTask.id);
                    onToggleFocusTimer(true, firstTask.id, secondsLeft);
                  }}
                  disabled={!tasks.some((t) => t.focus_priority >= 1 && t.focus_priority <= 3 && t.status !== "DONE")}
                  className="px-8 py-4 rounded-2xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-lg flex items-center gap-3 shadow-lg shadow-brand/20 transition-all scale-105"
                >
                  <Play className="w-6 h-6 fill-current" />
                  <span>{t("my_orbit.start_focus", "Start Focus Timer")}</span>
                </button>
              )}

              {activeTaskObj && (
                <button
                  onClick={() => {
                    onCompleteTask(activeTaskObj);
                    setIsRunning(false);
                  }}
                  className="px-6 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Check className="w-6 h-6 stroke-[3]" />
                  <span>{t("my_orbit.complete_task", "✔ Done")}</span>
                </button>
              )}
            </div>
          </div>

          {/* Zen Footer Presets */}
          <div className="w-full max-w-4xl border-t border-border dark:border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground dark:text-slate-300 font-medium">
            <span>{t("my_orbit.timer_presets_title", "Timer Duration:")}</span>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {[
                { label: t("my_orbit.preset_15m", "15m (Sprint)"), mins: 15 },
                { label: t("my_orbit.preset_25m", "25m (Pomodoro)"), mins: 25 },
                { label: t("my_orbit.preset_45m", "45m (Deep)"), mins: 45 },
                { label: t("my_orbit.preset_60m", "60m (Marathon)"), mins: 60 },
              ].map((p) => (
                <button
                  key={p.mins}
                  onClick={() => handleSelectDuration(p.mins)}
                  className={`px-3 py-1.5 rounded-xl border transition-all ${
                    selectedPresetMinutes === p.mins
                      ? "bg-brand/10 border-brand text-brand dark:text-blue-300 font-bold shadow-sm"
                      : "bg-card dark:bg-slate-900 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-300 hover:border-brand/40 hover:text-foreground dark:hover:text-slate-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={handleCustomDuration}
                className="px-3 py-1.5 rounded-xl bg-card dark:bg-slate-900 border border-dashed border-border dark:border-slate-600 text-muted-foreground dark:text-slate-300 hover:border-brand/40 hover:text-foreground dark:hover:text-slate-100 transition-all"
              >
                ⚙ {t("my_orbit.preset_custom", "Custom Time")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
