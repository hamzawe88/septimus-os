"use client";

import React, { useState } from "react";
import { ShieldCheck, Lock, Terminal, RefreshCw } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function SecurityAuditWidget() {
  const { t } = useLocalization();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState([
    { id: "s1", event: t("dashboard.security.e1Event", "Admin User Authenticated"), time: t("dashboard.security.2minsAgo", "2 mins ago"), type: "info" },
    { id: "s2", event: t("dashboard.security.e2Event", "API Schema Validated (#849)"), time: t("dashboard.security.14minsAgo", "14 mins ago"), type: "success" },
    { id: "s3", event: t("dashboard.security.e3Event", "Failed Login Attempt (IP 197.25.1.8)"), time: t("dashboard.security.1hourAgo", "1 hour ago"), type: "warning" },
    { id: "s4", event: t("dashboard.security.e4Event", "Redis Cache Synced (Libya Switch Node)"), time: t("dashboard.security.2hoursAgo", "2 hours ago"), type: "info" },
  ]);

  const handleRefreshLogs = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLogs((prev) => [
        { id: `s_${Date.now()}`, event: t("dashboard.security.scanCompleted", "Security Audit Scan Completed (Zero Threats)"), time: t("dashboard.security.justNow", "Just now"), type: "success" },
        ...prev.slice(0, 3),
      ]);
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Security Health Badge */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 dark:text-white">
              {t("dashboard.security.title", "System Shield Active")}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {t("dashboard.security.uptime", "99.99% Uptime • Sovereign SAIF Checked")}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefreshLogs}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-emerald-500 transition rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          title={t("common.refresh", "Refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
        </button>
      </div>

      {/* Audit Log Feed */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-blue-500" />
          {t("dashboard.security.recentEvents", "Live Security & Audit Feed")}
        </span>

        <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-[160px]">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    log.type === "success"
                      ? "bg-emerald-500"
                      : log.type === "warning"
                      ? "bg-amber-500"
                      : "bg-blue-500"
                  }`}
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{log.event}</span>
              </div>
              <span className="text-[10px] text-slate-400 flex-shrink-0">{log.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action bar */}
      <div className="pt-1 flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex-1 flex items-center gap-1">
          <Lock className="w-3.5 h-3.5 text-emerald-500" />
          <span>{t("dashboard.security.encryption", "AES-256 GCM Encrypted Vault")}</span>
        </span>
        <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg">
          NODE: LBY-1
        </span>
      </div>
    </div>
  );
}
