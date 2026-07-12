"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Puzzle, CheckCircle2, Webhook, Key, LayoutGrid } from "lucide-react";
import DiscoverTab from "./hub/DiscoverTab";
import InstalledAppsTab from "./hub/InstalledAppsTab";
import WebhooksTab from "./hub/WebhooksTab";
import ApiKeysTab from "./hub/ApiKeysTab";
import McpTab from "./hub/McpTab";

export default function AppStoreHub() {
  const { isRtl } = useLocalization();
  const [activeTab, setActiveTab] = useState<"discover" | "installed" | "webhooks" | "apikeys" | "mcp">("discover");

  const tabs = [
    { id: "discover", label: isRtl ? "متجر التطبيقات" : "Discover", icon: <LayoutGrid className="w-5 h-5" /> },
    { id: "installed", label: isRtl ? "التطبيقات المثبتة" : "Installed Apps", icon: <CheckCircle2 className="w-5 h-5" /> },
    { id: "webhooks", label: isRtl ? "خطاطيف الويب" : "Webhooks", icon: <Webhook className="w-5 h-5" /> },
    { id: "apikeys", label: isRtl ? "مفاتيح الربط البرمجي" : "API Keys", icon: <Key className="w-5 h-5" /> },
    { id: "mcp", label: isRtl ? "خادم MCP (بروتوكول النموذج)" : "MCP Server (AI Tools)", icon: <Puzzle className="w-5 h-5 text-indigo-500" /> },
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc] dark:bg-[#121418] overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header & Tabs */}
      <div className="bg-white dark:bg-[#1a1d21] border-b border-slate-200 dark:border-slate-800 p-8 pb-0 shrink-0 z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2 text-brand">
            <Puzzle className="w-8 h-8" />
            <h1 className="text-3xl font-black text-slate-800 dark:text-white">
              {isRtl ? "مركز الإضافات والمطورين" : "App Store & Developer Hub"}
            </h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 max-w-2xl mb-8">
            {isRtl 
              ? "قم بتوسيع قدرات نظامك من خلال دمج التطبيقات والأدوات الخارجية، وإدارة خطاطيف الويب، ومفاتيح الواجهة البرمجية من مكان واحد."
              : "Extend your system's capabilities by integrating external apps, managing webhooks, and API keys from a single place."}
          </p>

          <div className="flex gap-6 overflow-x-auto hide-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Parameters<typeof setActiveTab>[0])}
                className={`flex items-center gap-2 pb-4 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full h-full">
          {activeTab === "discover" && <DiscoverTab />}
          {activeTab === "installed" && <InstalledAppsTab />}
          {activeTab === "webhooks" && <WebhooksTab />}
          {activeTab === "apikeys" && <ApiKeysTab />}
          {activeTab === "mcp" && <McpTab />}
        </div>
      </div>
    </div>
  );
}
