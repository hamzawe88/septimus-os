"use client";

import React, { useState, useEffect } from "react";
import { 
  Plug, 
  Unlink, 
  CheckCircle2, 
  MessageCircle, 
  LifeBuoy, 
  Database, 
  Sparkles,
  RefreshCw,
  Plus,
  Settings,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { fetchIntegrations, Integration as AppIntegration } from "@/lib/integrations";
import IntegrationConfigModal from "./IntegrationConfigModal";

const iconMap: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-6 h-6 text-green-500" />,
  helpdesk: <LifeBuoy className="w-6 h-6 text-brand" />,
  erp: <Database className="w-6 h-6 text-brand" />,
  ai: <Sparkles className="w-6 h-6 text-amber-500" />,
  google: <Zap className="w-6 h-6 text-blue-500" />,
  drive: <Zap className="w-6 h-6 text-blue-500" />,
  calendar: <Zap className="w-6 h-6 text-blue-500" />,
  sheets: <Database className="w-6 h-6 text-emerald-500" />
};

const iconBgMap: Record<string, string> = {
  whatsapp: "bg-green-50 border-green-200",
  helpdesk: "bg-brand-light border-brand-light",
  erp: "bg-brand-light border-brand-light",
  ai: "bg-amber-50 border-amber-200",
  google: "bg-blue-50 border-blue-200",
  drive: "bg-blue-50 border-blue-200",
  calendar: "bg-blue-50 border-blue-200",
  sheets: "bg-emerald-50 border-emerald-200"
};

export default function InstalledAppsTab() {
  const { t } = useLocalization();
  const [apps, setApps] = useState<AppIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedAppForConfig, setSelectedAppForConfig] = useState<AppIntegration | null>(null);
  const { setCurrentView } = useAppStore();

  const loadIntegrations = async (signal?: AbortSignal) => {
    try {
      const list = await fetchIntegrations(signal);
      if (!signal?.aborted) setApps(list);
    } catch (err) {
      if (!signal?.aborted) console.error("Failed to fetch integrations from backend:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    // Defer to a microtask so state updates run outside the synchronous effect body
    void Promise.resolve().then(() => loadIntegrations(controller.signal));
    return () => controller.abort();
  }, []);

  const handleDisconnect = async (app: AppIntegration) => {
    setTogglingId(app.id);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/${app.id}/disconnect`, {
        method: "POST"
      });
      if (res.ok) {
        setApps(prevApps => 
          prevApps.map(a => a.id === app.id ? { ...a, status: "disconnected" } : a)
        );
      }
    } catch (err) {
      console.error("Error disconnecting integration:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenConfig = (app: AppIntegration) => {
    setSelectedAppForConfig(app);
  };

  const connectedCount = apps.filter(a => a.status === "connected").length;

  return (
    <div className="w-full h-full p-8 overflow-y-auto bg-slate-50/50">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-md">
              <Plug className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t("plugins.storeTitle")}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t("plugins.storeSubtitle")}
              </p>
            </div>
          </div>
          
          <Button 
            className="bg-brand hover:bg-brand-hover text-white flex items-center gap-2 rounded-xl" 
            onClick={() => setCurrentView('webhooks_settings')}
          >
            <Plus className="w-4 h-4" />
            {t("plugins.developCustomApp")}
          </Button>
        </div>

        {/* Status Banner */}
        <div className="flex items-center gap-3 mb-8 px-5 py-4 bg-white dark:bg-[#1a1d21] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <CheckCircle2 className={`w-5 h-5 ${connectedCount > 0 ? "text-emerald-500" : "text-slate-400"}`} />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {t("plugins.youHave")} <span className="font-bold text-slate-900 dark:text-white">{connectedCount}</span> {t("plugins.activeAppsText")}
          </span>
        </div>

        {/* Apps Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-10 h-10 mb-4 animate-spin opacity-40" />
            <p>{t("plugins.loading", "Loading integrations...")}</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Plug className="w-16 h-16 mb-4 opacity-20" />
            <p>{t("plugins.noIntegrations", "No integrations available")}</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {apps.map((app) => {
            const isConnected = app.status === "connected";
            const isToggling = togglingId === app.id;
            
            return (
              <div 
                key={app.id} 
                className={`relative overflow-hidden flex flex-col p-6 rounded-2xl border transition-all duration-300 ${
                  isConnected 
                    ? "bg-white border-brand-light shadow-md shadow-indigo-100/50 ring-1 ring-indigo-50" 
                    : "bg-white/80 border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {/* Active Indicator Line */}
                {isConnected && (
                  <div className="absolute top-0 end-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${iconBgMap[app.icon] || "bg-slate-50 border-slate-200"}`}>
                    {iconMap[app.icon] || <Plug className="w-7 h-7 text-slate-400" />}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                    isConnected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {isConnected ? t("plugins.connectedActive") : t("plugins.disconnected")}
                  </span>
                </div>
                
                <div className="mb-6 flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{app.name}</h3>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mb-3">
                    {app.category}
                  </span>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {app.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <Button
                        onClick={() => handleOpenConfig(app)}
                        variant="outline"
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                      >
                        <Settings className="w-4 h-4" />
                        {t("plugins.configure")}
                      </Button>

                      <Button
                        onClick={() => handleDisconnect(app)}
                        disabled={isToggling}
                        variant="outline"
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {isToggling ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Unlink className="w-4 h-4" />
                            {t("plugins.deactivate")}
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => handleOpenConfig(app)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-semibold bg-brand hover:bg-brand-hover text-white shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {t("plugins.installActivate")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Configuration & Live Verification Modal */}
      <IntegrationConfigModal
        app={selectedAppForConfig}
        isOpen={!!selectedAppForConfig}
        onClose={() => setSelectedAppForConfig(null)}
        onSuccess={() => {
          void loadIntegrations();
        }}
      />
    </div>
  );
}
