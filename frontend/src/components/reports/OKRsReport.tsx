"use client";

import React, { useState, useEffect } from "react";
import { Target, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

interface KeyResult {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
}

interface Objective {
  id: string;
  title: string;
  owner: string;
  progress: number;
  status: "on_track" | "at_risk" | "behind";
  key_results: KeyResult[];
}

export default function OKRsReport() {
  const { t } = useLocalization();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // For now, let's use dummy data until backend is ready
    setTimeout(() => {
      setObjectives([
        {
          id: "obj-1",
          title: t("reports.okrs.mock.obj1Title"),
          owner: t("reports.okrs.mock.obj1Owner"),
          progress: 65,
          status: "on_track",
          key_results: [
            { id: "kr-1", title: t("reports.okrs.mock.kr1Title"), target_value: 500, current_value: 350, unit: t("reports.okrs.mock.kr1Unit") },
            { id: "kr-2", title: t("reports.okrs.mock.kr2Title"), target_value: 20, current_value: 12, unit: "%" },
          ]
        },
        {
          id: "obj-2",
          title: t("reports.okrs.mock.obj2Title"),
          owner: t("reports.okrs.mock.obj2Owner"),
          progress: 40,
          status: "at_risk",
          key_results: [
            { id: "kr-3", title: t("reports.okrs.mock.kr3Title"), target_value: 50, current_value: 20, unit: "%" },
            { id: "kr-4", title: t("reports.okrs.mock.kr4Title"), target_value: 100, current_value: 40, unit: "%" },
          ]
        }
      ]);
      setIsLoading(false);
    }, 1000);
  }, [t]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">{t("reports.okrs.loading")}</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "on_track": return "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10";
      case "at_risk": return "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10";
      case "behind": return "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10";
      default: return "text-slate-600 bg-slate-50 dark:text-slate-400 dark:bg-slate-500/10";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "on_track": return t("reports.okrs.onTrack");
      case "at_risk": return t("reports.okrs.atRisk");
      case "behind": return t("reports.okrs.behind");
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "on_track": return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "at_risk": return <AlertCircle className="w-4 h-4 text-amber-600" />;
      case "behind": return <TrendingUp className="w-4 h-4 text-rose-600 rotate-180" />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4 transition-colors">
          <div className="p-3 rounded-lg bg-[var(--primary-light)] dark:bg-[var(--primary-hex)]/10">
            <Target className="w-6 h-6 text-[var(--primary-hex)]" />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{t("reports.okrs.totalObjectives")}</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{objectives.length}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("reports.okrs.title")}</h3>
        </div>
        <div className="p-6 flex flex-col gap-6">
          {objectives.map(obj => (
            <div key={obj.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-slate-50/50 dark:bg-[#121212] transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                <div>
                  <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">{obj.title}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("reports.okrs.owner")} {obj.owner}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(obj.status)}`}>
                    {getStatusIcon(obj.status)}
                    {getStatusText(obj.status)}
                  </span>
                  <div className="text-end">
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{obj.progress}%</span>
                  </div>
                </div>
              </div>
              
              {/* Objective Progress Bar */}
              <progress 
                value={obj.progress} 
                max="100" 
                className="w-full h-2.5 mb-6 rounded-full [&::-webkit-progress-bar]:bg-slate-200 dark:[&::-webkit-progress-bar]:bg-slate-800 [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-[var(--primary-hex)] [&::-webkit-progress-value]:bg-[var(--primary-hex)] text-[var(--primary-hex)]"
              />

              {/* Key Results */}
              <div className="space-y-4">
                <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t("reports.okrs.keyResults")}</h5>
                {obj.key_results.map(kr => {
                  const krProgress = Math.min(100, Math.round((kr.current_value / kr.target_value) * 100));
                  return (
                    <div key={kr.id} className="bg-white dark:bg-[#1a1a1a] p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-800 dark:text-slate-100 font-medium">{kr.title}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{kr.current_value} / {kr.target_value} {kr.unit} ({krProgress}%)</span>
                      </div>
                      <progress 
                        value={krProgress} 
                        max="100" 
                        className="w-full h-2 rounded-full [&::-webkit-progress-bar]:bg-slate-100 dark:[&::-webkit-progress-bar]:bg-slate-800 [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500 text-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {objectives.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">{t("reports.okrs.noObjectives")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
