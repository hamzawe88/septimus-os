"use client";

import React, { useState } from "react";
import { Workflow, Play, CheckCircle2, PauseCircle, Activity, Zap } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function WorkflowsWidget() {
  const { t } = useLocalization();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState([
    { id: "w1", name: t("dashboard.workflows.w1Name", "Daily Attendance Auto-Sync"), status: "active", lastRun: t("dashboard.workflows.0800AM", "08:00 AM"), runsToday: 1 },
    { id: "w2", name: t("dashboard.workflows.w2Name", "Multi-Currency Treasury Scraper"), status: "active", lastRun: t("dashboard.workflows.1230PM", "12:30 PM"), runsToday: 4 },
    { id: "w3", name: t("dashboard.workflows.w3Name", "Sovereign Lead Scoring Bot"), status: "paused", lastRun: t("dashboard.workflows.yesterday", "Yesterday"), runsToday: 0 },
  ]);

  const handleRunWorkflow = (id: string) => {
    setRunningId(id);
    setTimeout(() => {
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, lastRun: t("dashboard.workflows.justNow", "Just now"), runsToday: w.runsToday + 1 } : w))
      );
      setRunningId(null);
    }, 800);
  };

  const handleToggleStatus = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w))
    );
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Workflow className="w-4 h-4 text-indigo-500" />
          {t("dashboard.workflows.title", "Automated Pipelines & Bots")}
        </span>
        <span className="text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
          {workflows.filter((w) => w.status === "active").length} {t("dashboard.workflows.active", "Active")}
        </span>
      </div>

      {/* Workflow List */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 max-h-[190px]">
        {workflows.map((wf) => {
          const isRunning = runningId === wf.id;
          const isActive = wf.status === "active";

          return (
            <div
              key={wf.id}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                isActive
                  ? "bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700"
                  : "bg-slate-100/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-slate-800 opacity-75"
              }`}
            >
              <div className="min-w-0 flex items-start gap-2.5">
                <button
                  onClick={() => handleToggleStatus(wf.id)}
                  title={isActive ? t("common.pause", "Pause Workflow") : t("common.activate", "Activate Workflow")}
                  className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition ${
                    isActive
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                      : "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-400"
                  }`}
                >
                  {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{wf.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>
                      {t("dashboard.workflows.lastRun", "Last:")} <strong>{wf.lastRun}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{wf.runsToday}</strong> {t("dashboard.workflows.runs", "runs")}
                    </span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleRunWorkflow(wf.id)}
                disabled={isRunning}
                className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  isRunning
                    ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-600 animate-pulse"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
                }`}
              >
                {isRunning ? (
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span className="hidden sm:inline">{isRunning ? t("dashboard.workflows.running", "Running") : t("dashboard.workflows.run", "Run")}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom info banner */}
      <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-between text-[11px] text-blue-800 dark:text-blue-300 font-medium">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{t("dashboard.workflows.n8nConnected", "Connected to Sovereign n8n Engine")}</span>
        </div>
        <span className="font-mono font-bold text-[10px]">{t("dashboard.workflows.zeroErrors", "0 ERRORS")}</span>
      </div>
    </div>
  );
}
