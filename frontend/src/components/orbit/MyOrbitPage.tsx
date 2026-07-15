import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Orbit, LayoutGrid, Columns, Award, AlertCircle, X } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiPost, apiPut, apiDelete, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import SmartInputsColumn from "./SmartInputsColumn";
import FocusArenaColumn from "./FocusArenaColumn";
import GamificationColumn, { formatLevelTitle } from "./GamificationColumn";
import { OrbitTask, OrbitProfile } from "./types";

export default function MyOrbitPage() {
  const { t } = useLocalization();
  const [tasks, setTasks] = useState<OrbitTask[]>([]);
  const [profile, setProfile] = useState<OrbitProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"focus_first" | "grid_all">("focus_first");
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [slotsFullAlert, setSlotsFullAlert] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, profRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/orbit/tasks`),
        fetchWithAuth(`${API_BASE_URL}/orbit/profile`),
      ]);
      const tasksData = await tasksRes.json().catch(() => ({}));
      const profData = await profRes.json().catch(() => ({}));

      if (tasksData.tasks) {
        setTasks(tasksData.tasks);
      }
      if (profData.profile) {
        setProfile(profData.profile);
      }
    } catch (err) {
      console.error("Failed to load orbit data:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  useEffect(() => {
    if (slotsFullAlert) {
      const timer = setTimeout(() => setSlotsFullAlert(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [slotsFullAlert]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleAddTask = async (title: string, sourceType: string) => {
    try {
      const res = await apiPost<{ task?: OrbitTask }>("/orbit/tasks", {
        title,
        source_type: sourceType,
        focus_priority: 0,
        energy_tag: profile?.daily_energy_mode || "HIGH_ENERGY",
        xp_reward: 15,
      });
      if (res && res.task) {
        const newTask = res.task;
        setTasks((prev) => [newTask, ...prev]);
      } else {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to add task:", err);
    }
  };

  const handlePromoteToTop3 = async (task: OrbitTask, requestedSlot: number) => {
    // Find slot 1, 2, or 3 that is free
    const usedSlots = new Set(
      tasks.filter((t) => t.focus_priority >= 1 && t.focus_priority <= 3 && t.status !== "DONE").map((t) => t.focus_priority)
    );
    let targetSlot = requestedSlot;
    if (usedSlots.has(targetSlot)) {
      if (!usedSlots.has(1)) targetSlot = 1;
      else if (!usedSlots.has(2)) targetSlot = 2;
      else if (!usedSlots.has(3)) targetSlot = 3;
      else {
        setSlotsFullAlert(true);
        return;
      }
    }

    try {
      const res = await apiPut<{ task?: OrbitTask }>(`/orbit/tasks/${task.id}`, { focus_priority: targetSlot });
      if (res && res.task) {
        const updatedTask = res.task;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
      } else {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to promote task:", err);
    }
  };

  const handleDemoteFromTop3 = async (task: OrbitTask) => {
    try {
      const res = await apiPut<{ task?: OrbitTask }>(`/orbit/tasks/${task.id}`, { focus_priority: 0 });
      if (res && res.task) {
        const updatedTask = res.task;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
      } else {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to demote task:", err);
    }
  };

  const handleCompleteTask = async (task: OrbitTask) => {
    try {
      const res = await apiPut<{ task?: OrbitTask }>(`/orbit/tasks/${task.id}`, { status: "DONE" });
      if (res && res.task) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        // Refresh profile to get updated XP and badges
        const profRes = await fetchWithAuth(`${API_BASE_URL}/orbit/profile`);
        const profData = await profRes.json().catch(() => ({}));
        if (profData.profile) setProfile(profData.profile);
      } else {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to complete task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await apiDelete(`/orbit/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleToggleFocusTimer = async (active: boolean, taskId: string, secondsRemaining?: number) => {
    try {
      const body: { focus_timer_active: boolean; active_task_id: string; pomodoro_seconds_remaining?: number } = {
        focus_timer_active: active,
        active_task_id: taskId,
      };
      // Persist the countdown so pausing/resuming (or another device) picks up
      // where the user left off instead of snapping back to the default 25:00.
      if (typeof secondsRemaining === "number") {
        body.pomodoro_seconds_remaining = secondsRemaining;
      }
      const res = await apiPut<{ profile?: OrbitProfile }>("/orbit/profile", body);
      if (res && res.profile) {
        setProfile(res.profile);
      }
    } catch (err) {
      console.error("Failed to toggle focus timer:", err);
    }
  };

  const handleUpdateEnergyMode = async (mode: string) => {
    try {
      const res = await apiPut<{ profile?: OrbitProfile }>("/orbit/profile", { daily_energy_mode: mode });
      if (res && res.profile) {
        setProfile(res.profile);
      }
    } catch (err) {
      console.error("Failed to update energy mode:", err);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-slate-500 dark:text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-sm font-medium">{t("my_orbit.loading", "Loading your Orbit & focus metrics...")}</p>
      </div>
    );
  }

  // Get theme styles compliant with Color Constitution (Light Mode first, Dark Mode adaptive)
  const getThemeClass = (theme: string) => {
    switch (theme) {
      case "DEEP_SPACE":
        return "bg-slate-100 dark:bg-[#0D1117]";
      case "SERENE_HORIZON":
        return "bg-gradient-to-br from-blue-50/60 via-slate-50 to-indigo-50/40 dark:from-slate-950 dark:via-blue-950/40 dark:to-slate-950";
      default: // CYBER_NEBULA / Default Clean Sovereign
        return "bg-slate-50 dark:bg-[#1A1D21]";
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-64px)] overflow-hidden p-4 md:p-6 gap-4 ${getThemeClass(profile.theme_preference)}`}>
      {/* Top Bar / Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 bg-white dark:bg-slate-800/90 backdrop-blur-md border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white shadow-md shadow-brand/20">
            <Orbit className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>{t("my_orbit.title", "My Orbit")}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 font-mono">
                {formatLevelTitle(profile.level_title, profile.level, t)}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("my_orbit.subtitle", "Context-Aware Gamified Productivity Engine")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl border border-slate-200 dark:border-slate-600">
            <button
              onClick={() => setViewMode("focus_first")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "focus_first"
                  ? "bg-white dark:bg-slate-800 text-brand dark:text-blue-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t("my_orbit.view_focus_first", "Focus First (2 Cols)")}</span>
            </button>
            <button
              onClick={() => setViewMode("grid_all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "grid_all"
                  ? "bg-white dark:bg-slate-800 text-brand dark:text-blue-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{t("my_orbit.view_all_columns", "Full Dashboard (3 Cols)")}</span>
            </button>
          </div>

          {/* Quick Stats Button for Focus First mode */}
          {viewMode === "focus_first" && (
            <button
              onClick={() => setShowStatsModal(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>{t("my_orbit.toggle_stats", "Gamification Stats")}</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
            title="Refresh Orbit"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Inline Slots Full Alert */}
      {slotsFullAlert && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-500/50 rounded-2xl p-3.5 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{t("my_orbit.slots_full", "All 3 Top Focus slots are currently full! Unpin or complete a slot first.")}</span>
          </div>
          <button
            onClick={() => setSlotsFullAlert(false)}
            className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Orbital Layout Grid: Adapts based on viewMode */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Column 1: Smart Inputs Stream */}
        <div className={`${viewMode === "focus_first" ? "lg:col-span-5" : "lg:col-span-3"} h-full overflow-hidden transition-all duration-300`}>
          <SmartInputsColumn
            tasks={tasks}
            onAddTask={handleAddTask}
            onPromoteToTop3={handlePromoteToTop3}
            onCompleteTask={handleCompleteTask}
            onDeleteTask={handleDeleteTask}
          />
        </div>

        {/* Column 2: Current Focus Arena */}
        <div className={`${viewMode === "focus_first" ? "lg:col-span-7" : "lg:col-span-5"} h-full overflow-hidden transition-all duration-300`}>
          <FocusArenaColumn
            tasks={tasks}
            profile={profile}
            onToggleFocusTimer={handleToggleFocusTimer}
            onCompleteTask={handleCompleteTask}
            onDemoteFromTop3={handleDemoteFromTop3}
          />
        </div>

        {/* Column 3: Gamification & Stats Center (Only rendered in grid_all viewMode) */}
        {viewMode === "grid_all" && (
          <div className="lg:col-span-4 h-full overflow-hidden transition-all duration-300">
            <GamificationColumn
              profile={profile}
              onUpdateEnergyMode={handleUpdateEnergyMode}
              onRefreshProfile={fetchData}
            />
          </div>
        )}
      </div>

      {/* Slide-Over Gamification Modal when in Focus First mode */}
      {showStatsModal && viewMode === "focus_first" && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-800 p-4 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                {t("my_orbit.gamification_title", "Productivity Pulse")}
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <GamificationColumn
                profile={profile}
                onUpdateEnergyMode={handleUpdateEnergyMode}
                onRefreshProfile={fetchData}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
