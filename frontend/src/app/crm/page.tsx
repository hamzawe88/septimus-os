"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import CrmDashboard from "@/components/crm/CrmDashboard";
import LeadsKanban from "@/components/crm/LeadsKanban";
import TicketsTable from "@/components/crm/TicketsTable";
import { Users, LayoutGrid, Ticket } from "lucide-react";

export default function CrmPage() {
  const { t, isRtl } = useLocalization();
  const [activeTab, setActiveTab] = useState<"dashboard" | "leads" | "tickets">("dashboard");

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc]" dir={isRtl ? "rtl" : "ltr"}>
      {/* Sub-navigation Tabs */}
      <div className="flex-none px-8 py-4 border-b border-slate-200 bg-white flex items-center gap-6">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "dashboard"
              ? "border-brand text-brand"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" />
          {t("crm.tabs.dashboard")}
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "leads"
              ? "border-brand text-brand"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          {t("crm.tabs.leads")}
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "tickets"
              ? "border-brand text-brand"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Ticket className="w-4 h-4" />
          {t("crm.tabs.tickets")}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "dashboard" && <CrmDashboard />}
        {activeTab === "leads" && <LeadsKanban />}
        {activeTab === "tickets" && <TicketsTable />}
      </div>
    </div>
  );
}
