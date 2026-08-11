"use client";

import React from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useCrmStore } from "@/store/useCrmStore";
import CrmDashboard from "@/components/crm/CrmDashboard";
import LeadsKanban from "@/components/crm/LeadsKanban";
import TicketsTable from "@/components/crm/TicketsTable";
import CrmForecast from "@/components/crm/CrmForecast";
import { Users, LayoutGrid, Ticket, TrendingUp } from "lucide-react";

export default function CrmPage() {
  const { t } = useLocalization();
  const { activeTab, setActiveTab } = useCrmStore();

  return (
    <div data-testid="crm-page" className="flex h-full w-full flex-col bg-background">
      {/* Sub-navigation Tabs */}
	  <div className="flex flex-none items-center gap-3 overflow-x-auto whitespace-nowrap border-b border-border bg-card px-4 py-4 sm:gap-6 sm:px-8">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "dashboard"
              ? "border-brand text-brand"
              : "border-transparent text-muted-foreground hover:text-foreground"
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
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          {t("crm.tabs.leads")}
        </button>
        <button
          onClick={() => setActiveTab("forecast")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "forecast"
              ? "border-brand text-brand"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {t("crm.tabs.forecast", "Forecast")}
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            activeTab === "tickets"
              ? "border-brand text-brand"
              : "border-transparent text-muted-foreground hover:text-foreground"
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
        {activeTab === "forecast" && <CrmForecast />}
        {activeTab === "tickets" && <TicketsTable />}
      </div>
    </div>
  );
}
