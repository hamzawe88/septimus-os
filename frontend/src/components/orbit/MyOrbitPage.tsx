import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Orbit } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiPost, apiPut, apiDelete, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import SmartInputsColumn from "./SmartInputsColumn";
import FocusArenaColumn from "./FocusArenaColumn";
import GamificationColumn from "./GamificationColumn";
import { OrbitTask, OrbitProfile } from "./types";

export default function MyOrbitPage() {
  const { t } = useLocalization();
  const [tasks, setTasks] = useState<OrbitTask[]>([]);
  const [profile, setProfile] = useState<OrbitProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
        alert(t("my_orbit.slots_full", "All 3 Top Focus slots are currently full! Unpin or complete a slot first."));
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

  const handleToggleFocusTimer = async (active: boolean, taskId: string) => {
    try {
      const res = await apiPut<{ profile?: OrbitProfile }>("/orbit/profile", {
        focus_timer_active: active,
        active_task_id: taskId,
      });
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
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                v1.0 Sovereign
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("my_orbit.subtitle", "Context-Aware Gamified Productivity Engine")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* 3-Column Orbital Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Column 1: Smart Inputs Stream (3 cols on large screen) */}
        <div className="lg:col-span-3 h-full overflow-hidden">
          <SmartInputsColumn
            tasks={tasks}
            onAddTask={handleAddTask}
            onPromoteToTop3={handlePromoteToTop3}
            onCompleteTask={handleCompleteTask}
            onDeleteTask={handleDeleteTask}
          />
        </div>

        {/* Column 2: Current Focus Arena (5 cols on large screen) */}
        <div className="lg:col-span-5 h-full overflow-hidden">
          <FocusArenaColumn
            tasks={tasks}
            profile={profile}
            onToggleFocusTimer={handleToggleFocusTimer}
            onCompleteTask={handleCompleteTask}
            onDemoteFromTop3={handleDemoteFromTop3}
          />
        </div>

        {/* Column 3: Gamification & Stats Center (4 cols on large screen) */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <GamificationColumn
            profile={profile}
            onUpdateEnergyMode={handleUpdateEnergyMode}
            onRefreshProfile={fetchData}
          />
        </div>
      </div>
    </div>
  );
}
