"use client";

import React from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";
import { 
  Globe, 
  Palette, 
  Users, 
  Building2,
  Settings as SettingsIcon
} from "lucide-react";
import LocalizationSettings from "./LocalizationSettings";
import AppearanceSettings from "./AppearanceSettings";
import RolesSettings from "./RolesSettings";
import CompanyProfileSettings from "./CompanyProfileSettings";

export default function SettingsLayout() {
  const { t } = useLocalization();
  // We can use local state for the tabs, or read currentView from app store
  // Since Sidebar links to 'system_settings', we'll manage internal tabs here
  const { currentView, setCurrentView } = useAppStore();

  // If currentView is just 'system_settings', default to localization
  const activeTab = currentView === 'system_settings' ? 'localization_settings' : currentView;

  const tabs = [
    { id: "localization_settings", label: t("settings.localization", "Localization & Currency"), icon: Globe },
    { id: "appearance_settings", label: t("settings.appearance", "Appearance"), icon: Palette },
    { id: "company_profile", label: t("settings.company_profile", "Company Profile"), icon: Building2 },
    { id: "roles_settings", label: t("settings.roles", "Roles & Permissions"), icon: Users },
  ];

  const handleTabClick = (id: string) => {
    setCurrentView(id as Parameters<typeof setCurrentView>[0]);
  };

  return (
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Inner Sidebar */}
      <div className={`w-64 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-[var(--brand)]/10 flex items-center justify-center text-[var(--brand)]">
            <SettingsIcon className="w-4 h-4" />
          </div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">
            {t("settings.system_settings", "System Settings")}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-start ${
                  isActive 
                    ? "bg-[var(--brand)]/10 text-[var(--brand)]" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-6">
        <div className="max-w-5xl mx-auto h-full">
          {activeTab === "localization_settings" && <LocalizationSettings />}
          {activeTab === "appearance_settings" && <AppearanceSettings />}
          {activeTab === "company_profile" && <CompanyProfileSettings />}
          {activeTab === "roles_settings" && <RolesSettings />}
        </div>
      </div>
    </div>
  );
}
