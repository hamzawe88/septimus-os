"use client";

import React from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";
import { 
  Globe, 
  Palette, 
  Users, 
  Building2,
  Settings as SettingsIcon,
  Sparkles,
  ArrowRight,
  ArrowLeft
} from "lucide-react";
import LocalizationSettings from "./LocalizationSettings";
import AppearanceSettings from "./AppearanceSettings";
import RolesSettings from "./RolesSettings";
import CompanyProfileSettings from "./CompanyProfileSettings";
import BillingDashboard from "@/components/billing/BillingDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function SettingsLayout() {
  const { t, isRtl } = useLocalization();
  const { currentView, setCurrentView, isSidebarOpen } = useAppStore();

  // If currentView is just 'system_settings', default to localization so inner sidebar is visible
  const activeTab = currentView === 'system_settings' ? 'localization_settings' : currentView;

  const tabs = [
    { 
      id: "saas_settings", 
      label: t("settings.saas", isRtl ? "اشتراك الـ SaaS والحصص" : "SaaS Subscription & Quotas"), 
      icon: Sparkles,
      highlight: true 
    },
    { id: "localization_settings", label: t("settings.localization", "Localization & Currency"), icon: Globe },
    { id: "appearance_settings", label: t("settings.appearance", "Appearance"), icon: Palette },
    { id: "company_profile", label: t("settings.company_profile", "Company Profile"), icon: Building2 },
    { id: "roles_settings", label: t("settings.roles", "Roles & Permissions"), icon: Users },
  ];

  const handleTabClick = (id: string) => {
    setCurrentView(id as Parameters<typeof setCurrentView>[0]);
  };

  const isSaasView = activeTab === "saas_settings";

  return (
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Inner Sidebar - Hidden on SaaS View to give full width */}
      {!isSaasView && (
        <div className={`w-72 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col shrink-0`}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {t("settings.system_settings", isRtl ? "إعدادات النظام والساس" : "System & SaaS Settings")}
                </h2>
                <p className="text-[11px] text-slate-400 font-mono">Tenant Control Center</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all text-start ${
                    isActive 
                      ? "bg-gradient-to-r from-brand/15 via-brand/10 to-transparent text-brand border-s-4 border-brand shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${tab.highlight && isActive ? "text-brand animate-pulse" : ""}`} />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {tab.highlight && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand text-white shadow-sm shrink-0 uppercase">
                      {isRtl ? "SaaS" : "PRO"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tenant Quick Info in Settings Footer */}
          <div className="p-4 m-3 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 text-xs space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300">
              <span>{isRtl ? "عزل الـ RLS للمساحة" : "Tenant Isolation"}</span>
              <span className="text-emerald-500 font-mono">● ACTIVE</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              {isRtl 
                ? "بيانات هذه المؤسسة معزولة برمجياً ولا يمكن الوصول إليها من خارج الـ WorkspaceID." 
                : "Tenant database queries enforced strictly via PostgreSQL RLS policies."}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        {/* Optional back button for SaaS view */}
        {isSaasView && (
          <div className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center">
            <button 
              onClick={() => setCurrentView('localization_settings')}
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand transition-colors"
            >
              {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{isRtl ? "العودة لإعدادات النظام" : "Back to System Settings"}</span>
            </button>
          </div>
        )}
        <div className={`mx-auto h-full p-6 transition-all duration-300 ${isSaasView ? (isSidebarOpen ? 'max-w-[1400px]' : 'max-w-full px-12') : (isSidebarOpen ? 'max-w-6xl' : 'max-w-full px-12')}`}>
          {activeTab === "saas_settings" && (
            <ErrorBoundary>
              <BillingDashboard />
            </ErrorBoundary>
          )}
          {activeTab === "localization_settings" && <LocalizationSettings />}
          {activeTab === "appearance_settings" && <AppearanceSettings />}
          {activeTab === "company_profile" && <CompanyProfileSettings />}
          {activeTab === "roles_settings" && <RolesSettings />}
        </div>
      </div>
    </div>
  );
}
