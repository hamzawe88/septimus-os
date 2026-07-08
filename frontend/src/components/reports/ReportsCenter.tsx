"use client";

import { useState } from "react";

import AttendanceReport from "./AttendanceReport";
import ProjectsReport from "./ProjectsReport";
import CommunicationReport from "./CommunicationReport";
import AiReport from "./AiReport";
import OKRsReport from "./OKRsReport";
import { PieChart, KanbanSquare, MessageSquare, Zap, Target } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function ReportsCenter() {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<"attendance" | "projects" | "communication" | "ai" | "okrs">("attendance");

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0f0f0f] w-full overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 dark:border-slate-700 dark:bg-[#121212]">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <PieChart className="w-6 h-6 text-[var(--primary-hex)]" />
          {t("reports.title")}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {t("reports.subtitle")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex-none px-8 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#121212]">
        <div className="flex gap-4">
          <TabButton 
            active={activeTab === "attendance"} 
            onClick={() => setActiveTab("attendance")}
            icon={<PieChart className="w-4 h-4" />}
            label={t("reports.tabs.attendance")} 
          />
          <TabButton 
            active={activeTab === "projects"} 
            onClick={() => setActiveTab("projects")}
            icon={<KanbanSquare className="w-4 h-4" />}
            label={t("reports.tabs.projects")} 
          />
          <TabButton 
            active={activeTab === "communication"} 
            onClick={() => setActiveTab("communication")}
            icon={<MessageSquare className="w-4 h-4" />}
            label={t("reports.tabs.communication")} 
          />
          <TabButton 
            active={activeTab === "ai"} 
            onClick={() => setActiveTab("ai")}
            icon={<Zap className="w-4 h-4" />}
            label={t("reports.tabs.aiReport")} 
          />
          <TabButton 
            active={activeTab === "okrs"} 
            onClick={() => setActiveTab("okrs")}
            icon={<Target className="w-4 h-4" />}
            label={t("reports.tabs.okrs")} 
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] dark:bg-[#1a1a1a]">
        {activeTab === "attendance" && <AttendanceReport />}
        {activeTab === "projects" && <ProjectsReport />}
        {activeTab === "communication" && <CommunicationReport />}
        {activeTab === "ai" && <AiReport />}
        {activeTab === "okrs" && <OKRsReport />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
        active 
          ? "font-semibold shadow-sm border bg-[var(--primary-light)] text-[var(--primary-hex)] border-[var(--primary-hex)]" 
          : "text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
