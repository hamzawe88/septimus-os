"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import HrDashboard from "@/components/hr/HrDashboard";
import EmployeesDirectory from "@/components/hr/EmployeesDirectory";
import LeaveRequests from "@/components/hr/LeaveRequests";
import AttendanceView from "@/components/hr/AttendanceView";
import HrSettings from "@/components/hr/HrSettings";
import { Users, LayoutGrid, Calendar, MapPin, Sparkles, Settings } from "lucide-react";
import AgentChatDrawer from "@/components/ai/AgentChatDrawer";

type HRTab = "dashboard" | "directory" | "leave" | "attendance" | "settings";

export default function HrPage() {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<HRTab>("dashboard");
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  const tabs: Array<{ id: HRTab; labelKey: string; defaultLabel: string; icon: React.ReactNode }> = [
    { id: "dashboard",   labelKey: "hr.tabs.dashboard",   defaultLabel: "Dashboard",       icon: <LayoutGrid className="w-4 h-4" /> },
    { id: "directory",   labelKey: "hr.tabs.directory",   defaultLabel: "Employees 360",        icon: <Users className="w-4 h-4" /> },
    { id: "attendance",  labelKey: "hr.tabs.attendance",  defaultLabel: "GPS Attendance",          icon: <MapPin className="w-4 h-4" /> },
    { id: "leave",       labelKey: "hr.tabs.leave",       defaultLabel: "Leave Requests",      icon: <Calendar className="w-4 h-4" /> },
    { id: "settings",    labelKey: "hr.tabs.settings",    defaultLabel: "Department Settings",      icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc]">

      {/* Sub-navigation Tabs */}
      <div className="flex-none px-8 py-4 border-b border-slate-200 bg-white flex items-center gap-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? tab.id === "attendance"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.icon}
            {t(tab.labelKey, tab.defaultLabel)}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "dashboard"   && <HrDashboard />}
        {activeTab === "directory"   && <EmployeesDirectory />}
        {activeTab === "attendance"  && <AttendanceView />}
        {activeTab === "leave"       && <LeaveRequests />}
        {activeTab === "settings"    && <HrSettings />}
      </div>

      {/* Floating AI Button */}
      <button
        onClick={() => setIsAgentOpen(true)}
        className="fixed bottom-8 end-8 w-14 h-14 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group z-30"
        title={t("hr.aiAssistant")}
        aria-label={t("hr.aiAssistant")}
      >
        <Sparkles className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>

      <AgentChatDrawer
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        agentType="hr"
        title={t("hr.aiAssistant")}
      />
    </div>
  );
}
