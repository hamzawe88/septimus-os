"use client";

import React, { useState } from "react";
import { UserCheck, Calendar, Check, X, Clock } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function HRPulseWidget() {
  const { t } = useLocalization();
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [pendingLeaves, setPendingLeaves] = useState([
    { id: "l1", name: "Ahmed Mansour", type: "Annual Leave", days: "3 Days", date: "Jul 15 - Jul 17" },
    { id: "l2", name: "Sara Al-Obeidi", type: "Sick Leave", days: "1 Day", date: "Jul 12" },
  ]);

  const handleApproveLeave = (id: string) => {
    setPendingLeaves((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRejectLeave = (id: string) => {
    setPendingLeaves((prev) => prev.filter((item) => item.id !== id));
  };

  const pendingLeavesList = pendingLeaves.map((item) => {
    if (item.id === "l1") {
      return {
        ...item,
        name: t("dashboard.hr.emp1Name", "Ahmed Mansour"),
        type: t("dashboard.hr.emp1Type", "Annual Leave"),
        days: t("dashboard.hr.emp1Days", "3 Days"),
      };
    }
    if (item.id === "l2") {
      return {
        ...item,
        name: t("dashboard.hr.emp2Name", "Sara Al-Obeidi"),
        type: t("dashboard.hr.emp2Type", "Sick Leave"),
        days: t("dashboard.hr.emp2Days", "1 Day"),
      };
    }
    return item;
  });

  return (
    <div className="flex flex-col justify-between h-full space-y-4">
      {/* Attendance Radar Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl glass-card bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 flex flex-col items-center text-center">
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">42</span>
          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase mt-0.5">
            {t("dashboard.hr.present", "Present")}
          </span>
        </div>
        <div className="p-3 rounded-2xl glass-card bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/60 flex flex-col items-center text-center">
          <span className="text-xl font-black text-blue-600 dark:text-blue-400">12</span>
          <span className="text-[10px] font-bold text-blue-800 dark:text-blue-300 uppercase mt-0.5">
            {t("dashboard.hr.remote", "Remote")}
          </span>
        </div>
        <div className="p-3 rounded-2xl glass-card bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 flex flex-col items-center text-center">
          <span className="text-xl font-black text-amber-600 dark:text-amber-400">3</span>
          <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase mt-0.5">
            {t("dashboard.hr.onLeave", "On Leave")}
          </span>
        </div>
      </div>

      {/* Pending Leave Requests */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            {t("dashboard.hr.pendingLeaves", "Pending Leave Requests")}
          </span>
          <span className="text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
            {pendingLeavesList.length}
          </span>
        </div>

        {pendingLeavesList.length === 0 ? (
          <div className="flex-1 rounded-2xl glass-card bg-white/30 dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center p-4 text-center">
            <UserCheck className="w-8 h-8 text-emerald-500 mb-1" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t("dashboard.hr.allClear", "All leaves caught up!")}
            </p>
            <p className="text-[11px] text-slate-400">
              {t("dashboard.hr.allClearDesc", "No pending requests waiting for your approval.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[140px] pr-1">
            {pendingLeavesList.map((leave) => (
              <div
                key={leave.id}
                className="p-3 rounded-xl glass-card bg-white/40 dark:bg-slate-800/40 border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{leave.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span>{leave.type}</span> • <strong className="text-slate-700 dark:text-slate-300">{leave.days}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleApproveLeave(leave.id)}
                    title={t("common.approve", "Approve")}
                    className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRejectLeave(leave.id)}
                    title={t("common.reject", "Reject")}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-red-500 hover:text-white text-slate-600 dark:text-slate-300 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Attendance Check-in Button */}
      <button
        onClick={() => setIsCheckedIn(!isCheckedIn)}
        className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
          isCheckedIn
            ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
            : "bg-emerald-600 hover:bg-emerald-700 text-white"
        }`}
      >
        <Clock className="w-4 h-4" />
        <span>
          {isCheckedIn
            ? t("dashboard.hr.checkedIn", "Checked In (Tap to Check Out)")
            : t("dashboard.hr.checkInNow", "Check In for Today")}
        </span>
      </button>
    </div>
  );
}
