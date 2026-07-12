"use client";

import React, { useState } from "react";
import { Cpu, Sparkles, Zap, ArrowRight, Activity, CheckCircle2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function AIOrchestratorWidget() {
  const { t } = useLocalization();
  const [promptInput, setPromptInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  const handleRunCommand = (text?: string) => {
    const cmd = text || promptInput;
    if (!cmd.trim()) return;
    setIsProcessing(true);
    setLastResponse(null);
    setTimeout(() => {
      setIsProcessing(false);
      setLastResponse(
        `${t("dashboard.ai.processedPrefix", "[Sovereign AI] Processed:")} "${cmd}". ${t("dashboard.ai.processedMsg", "System efficiency optimum (+14% today). All neural nodes synced.")}`
      );
      if (!text) setPromptInput("");
    }, 900);
  };

  const quickPrompts = [
    t("dashboard.ai.prompt1", "Run Daily Executive Briefing"),
    t("dashboard.ai.prompt2", "Analyze Q3 Cashflow Variance"),
    t("dashboard.ai.prompt3", "Audit Active API Sessions"),
  ];

  return (
    <div className="flex flex-col justify-between h-full space-y-4">
      {/* Top Header metrics */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10 border border-indigo-500/20 dark:border-indigo-500/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                {t("dashboard.ai.sidecar", "Sovereign Sidecar")}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {t("dashboard.ai.status", "Neural Mesh Active • 98.8% Accuracy")}
            </p>
          </div>
        </div>
        <div className="text-end">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
            {t("dashboard.ai.latency", "12ms Latency")}
          </span>
        </div>
      </div>

      {/* Quick Action Chips */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {t("dashboard.ai.quickCommands", "Instant Executive Prompts:")}
        </span>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleRunCommand(p)}
              disabled={isProcessing}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700 transition flex items-center gap-1 text-slate-700 dark:text-slate-300"
            >
              <span>{p}</span>
              <ArrowRight className="w-3 h-3 opacity-60" />
            </button>
          ))}
        </div>
      </div>

      {/* Input box & output */}
      <div className="flex flex-col gap-3 pt-1">
        <div className="relative">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRunCommand()}
            placeholder={t("dashboard.ai.placeholder", "Ask Sidecar anything or trigger automated workflow...")}
            className="w-full ltr:pl-3.5 ltr:pr-24 rtl:pr-3.5 rtl:pl-24 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-medium"
          />
          <button
            onClick={() => handleRunCommand()}
            disabled={isProcessing || !promptInput.trim()}
            className="absolute ltr:right-1.5 rtl:left-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"
          >
            {isProcessing ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span>{t("dashboard.ai.run", "Execute")}</span>
          </button>
        </div>

        {lastResponse && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-start gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>{lastResponse}</span>
          </div>
        )}
      </div>
    </div>
  );
}
