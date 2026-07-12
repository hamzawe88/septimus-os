"use client";

import React, { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function GlobalBranchesWidget() {
  const { t } = useLocalization();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const formatBranchTime = (timeZone: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(time);
    } catch {
      return "12:00 PM";
    }
  };

  const branches = [
    { name: t("dashboard.branches.hq", "Libya HQ (Tripoli / Benghazi)"), tz: "Africa/Tripoli", status: "open" },
    { name: t("dashboard.branches.dubai", "Dubai Regional Hub"), tz: "Asia/Dubai", status: "open" },
    { name: t("dashboard.branches.london", "London Office"), tz: "Europe/London", status: "after_hours" },
    { name: t("dashboard.branches.nyc", "New York Node"), tz: "America/New_York", status: "after_hours" },
  ];

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-teal-500" />
          {t("dashboard.branches.title", "Global Corporate Clocks")}
        </span>
        <span className="text-[10px] font-extrabold bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full">
          {branches.length} {t("dashboard.branches.nodes", "Nodes")}
        </span>
      </div>

      {/* Branch cards */}
      <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto">
        {branches.map((b, idx) => {
          const isOpen = b.status === "open";
          return (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 dark:text-white truncate" title={b.name}>
                  {b.name}
                </span>
                {isOpen ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Open" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="After Hours" />
                )}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                  {formatBranchTime(b.tz)}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    isOpen
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {isOpen ? t("dashboard.branches.open", "Open") : t("dashboard.branches.standby", "Standby")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
