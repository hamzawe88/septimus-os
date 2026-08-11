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
  Zap,
  Landmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { fetchIntegrations, integrationName, integrationDescription, Integration as AppIntegration } from "@/lib/integrations";
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
  const { t, isRtl } = useLocalization();
  const catLabel = (c: string) => t(`plugins.category${c}`, c);
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
    <div className="w-full h-full p-8 overflow-y-auto bg-muted/50">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand text-white rounded-2xl shadow-md">
              <Plug className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground dark:text-white">
                {t("plugins.storeTitle")}
              </h1>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
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
        <div className="flex items-center gap-3 mb-8 px-5 py-4 bg-card dark:bg-[#1a1d21] rounded-2xl border border-border dark:border-slate-800 shadow-sm">
          <CheckCircle2 className={`w-5 h-5 ${connectedCount > 0 ? "text-emerald-500" : "text-muted-foreground"}`} />
          <span className="text-sm text-muted-foreground dark:text-slate-300">
            {t("plugins.youHave")} <span className="font-bold text-foreground dark:text-white">{connectedCount}</span> {t("plugins.activeAppsText")}
          </span>
        </div>

        {/* Apps Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="w-10 h-10 mb-4 animate-spin opacity-40" />
            <p>{t("plugins.loading", "Loading integrations...")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* === SOVEREIGN DIWAN APPLICATION CARD === */}
            <div className="relative overflow-hidden flex flex-col p-6 rounded-2xl border transition-all duration-300 bg-card dark:bg-[#1a1d21] border-amber-300 dark:border-amber-700/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-400/20">
              <div className="absolute top-0 end-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500" />
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                  <Landmark className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {isRtl ? "مثبت ومفعل (سيادي)" : "Installed (Sovereign Core)"}
                </span>
              </div>
              <div className="mb-6 flex-1">
                <h3 className="text-lg font-bold text-foreground dark:text-white mb-1">
                  {isRtl ? "ديوان المراسلات الرسمية والأرشيف الإلكتروني الذكي" : "Official Diwan & Smart Archiving Studio"}
                </h3>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 mb-3">
                  {isRtl ? "إدارة سيادية وأرشفة متقدمة" : "Governmental & Enterprise Archiving"}
                </span>
                <p className="text-sm text-muted-foreground dark:text-slate-300 leading-relaxed">
                  {isRtl
                    ? "منظومة المراسلات الرسمية برقم تسلسلي مقفول، ومحرك القوالب التفاعلي Canvas، وأرشفة شجرية متقدمة مع الختم الرقمي المشفر QR."
                    : "Official enterprise correspondence with advisory-locked serial numbers, interactive Canvas studio, and hierarchical ltree archiving with external QR seal."}
                </p>
              </div>
              <div className="pt-4 border-t border-border dark:border-slate-800 mt-auto">
                <Button
                  onClick={() => setCurrentView('correspondence')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md transition-all cursor-pointer"
                >
                  <Landmark className="w-4 h-4" />
                  {isRtl ? "فتح منصة الديوان والمراسلات" : "Launch Diwan & Archiving Platform"}
                </Button>
              </div>
            </div>

            {apps.map((app) => {
            const isConnected = app.status === "connected";
            const isToggling = togglingId === app.id;
            
            return (
              <div 
                key={app.id} 
                className={`relative overflow-hidden flex flex-col p-6 rounded-2xl border transition-all duration-300 ${
                  isConnected 
                    ? "bg-card border-brand shadow-md shadow-brand/10 ring-1 ring-brand/20" 
                    : "bg-white/80 border-border hover:border-border hover:shadow-sm"
                }`}
              >
                {/* Active Indicator Line */}
                {isConnected && (
                  <div className="absolute top-0 end-0 w-full h-1 bg-gradient-to-r from-brand to-brand-secondary" />
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${iconBgMap[app.icon] || "bg-muted border-border"}`}>
                    {iconMap[app.icon] || <Plug className="w-7 h-7 text-muted-foreground" />}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                    isConnected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground dark:bg-slate-800 dark:text-muted-foreground"
                  }`}>
                    {isConnected ? t("plugins.connectedActive") : t("plugins.disconnected")}
                  </span>
                </div>
                
                <div className="mb-6 flex-1">
                  <h3 className="text-lg font-bold text-foreground dark:text-white mb-1">{integrationName(app, isRtl)}</h3>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-muted dark:bg-slate-800 text-muted-foreground dark:text-muted-foreground mb-3">
                    {catLabel(app.category)}
                  </span>
                  <p className="text-sm text-muted-foreground dark:text-slate-300 leading-relaxed">
                    {integrationDescription(app, isRtl)}
                  </p>
                </div>

                <div className="pt-4 border-t border-border dark:border-slate-800 mt-auto flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <Button
                        onClick={() => handleOpenConfig(app)}
                        variant="outline"
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-semibold border-brand/30 text-brand hover:bg-brand/10 dark:border-brand/40 dark:text-brand dark:hover:bg-brand/20"
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
