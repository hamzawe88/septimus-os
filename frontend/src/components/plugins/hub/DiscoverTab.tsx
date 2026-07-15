"use client";

import React, { useState, useEffect } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Search, Puzzle, Settings, Download, CheckCircle2, RefreshCw, Landmark } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import IntegrationConfigModal from "./IntegrationConfigModal";
import { fetchIntegrations, integrationName, integrationDescription, Integration } from "@/lib/integrations";

export default function DiscoverTab() {
  const { t, isRtl } = useLocalization();
  const { setCurrentView } = useAppStore();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<Integration | null>(null);

  const loadCatalog = async (signal?: AbortSignal) => {
    try {
      const list = await fetchIntegrations(signal);
      if (signal?.aborted) return;
      setIntegrations(list);
      setLoadError(null);
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to fetch integrations catalog:", err);
      setLoadError(t("plugins.loadError", "Could not load integrations"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    // Defer to a microtask so state updates run outside the synchronous effect body
    void Promise.resolve().then(() => loadCatalog(controller.signal));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive category filter chips from whatever the backend actually returns
  const categories: string[] = [
    "all",
    ...Array.from(new Set(integrations.map((i) => i.category))).filter(Boolean),
  ];

  // Backend returns English category names; translate for display (fallback keeps the raw value)
  const catLabel = (c: string) =>
    c === "all" ? t("plugins.categoryAll", "All") : t(`plugins.category${c}`, c);

  const filtered = integrations.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const handleConfigSuccess = () => {
    // Re-pull from backend so the connected badge reflects persisted state
    void loadCatalog();
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="p-8 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto">
          {/* Search and Filters */}
          <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto hide-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    activeCategory === cat
                      ? "bg-brand text-white shadow-md shadow-brand/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {catLabel(cat)}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80">
              <div className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder={t("plugins.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-white dark:bg-[#222529] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/50 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="p-8 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-10 h-10 mb-4 animate-spin opacity-40" />
            <p>{t("plugins.loading", "Loading integrations...")}</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Puzzle className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-xl font-bold mb-2 text-slate-600 dark:text-slate-300">{loadError}</h3>
            <button
              onClick={() => { setLoading(true); void loadCatalog(); }}
              className="mt-2 text-sm font-bold text-brand hover:underline"
            >
              {t("common.retry", "Retry")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* === SOVEREIGN DIWAN APPLICATION CARD === */}
            <div className="bg-white dark:bg-[#1a1d21] border border-amber-300 dark:border-amber-700/50 rounded-2xl p-6 flex flex-col hover:shadow-xl hover:border-amber-500/50 transition-all group shadow-md shadow-amber-500/5 ring-1 ring-amber-400/20">
              <div className="flex justify-between items-start mb-4">
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 group-hover:scale-110 transition-transform">
                  <Landmark className="w-7 h-7" />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {isRtl ? "مثبت ومفعل (سيادي)" : "Active (Sovereign Core)"}
                </span>
              </div>
              <div className="mb-6 flex-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 group-hover:text-brand transition-colors">
                  {isRtl ? "ديوان المراسلات الرسمية والأرشيف الإلكتروني الذكي" : "Official Diwan & Smart Archiving Studio"}
                </h3>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 mb-3">
                  {isRtl ? "إدارة سيادية وأرشفة متقدمة" : "Governmental & Enterprise Archiving"}
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                  {isRtl
                    ? "منظومة المراسلات الرسمية برقم تسلسلي مقفول، ومحرك القوالب التفاعلي Canvas، وأرشفة شجرية متقدمة مع الختم الرقمي المشفر QR."
                    : "Official enterprise correspondence with advisory-locked serial numbers, interactive Canvas studio, and hierarchical ltree archiving with external QR seal."}
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
                <button
                  onClick={() => setCurrentView('correspondence')}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Landmark className="w-4 h-4" />
                  {isRtl ? "فتح منصة الديوان والمراسلات" : "Launch Diwan & Archiving Platform"}
                </button>
              </div>
            </div>

            {filtered.map((item) => {
              const isConnected = item.status === "connected";
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col hover:shadow-xl hover:border-brand/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 bg-slate-50 dark:bg-[#222529] rounded-2xl flex items-center justify-center text-brand border border-slate-100 dark:border-slate-800 group-hover:scale-110 transition-transform">
                      <Puzzle className="w-7 h-7" />
                    </div>
                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t("plugins.installed")}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{integrationName(item, isRtl)}</h3>

                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-1 line-clamp-3">
                    {integrationDescription(item, isRtl)}
                  </p>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-medium text-slate-400">{catLabel(item.category)}</span>

                    {isConnected ? (
                      <button
                        onClick={() => setSelectedApp(item)}
                        className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-brand dark:hover:text-brand transition-colors bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 rounded-xl"
                      >
                        <Settings className="w-4 h-4" />
                        {t("plugins.settings")}
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedApp(item)}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-brand hover:bg-brand-hover shadow-md shadow-brand/20 transition-all px-4 py-2 rounded-xl"
                      >
                        <Download className="w-4 h-4" />
                        {t("plugins.install")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <IntegrationConfigModal
        app={selectedApp}
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        onSuccess={handleConfigSuccess}
      />
    </div>
  );
}
