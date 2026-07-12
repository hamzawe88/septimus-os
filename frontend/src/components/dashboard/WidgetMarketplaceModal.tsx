"use client";

import React, { useState } from "react";
import { 
  X, 
  Search, 
  Plus, 
  Check, 
  Sparkles, 
  Cpu, 
  Users, 
  DollarSign, 
  Briefcase, 
  ShieldCheck, 
  Workflow, 
  MessageSquare, 
  BookOpen, 
  Globe 
} from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: "all" | "ai" | "finance" | "hr" | "crm" | "ops" | "security";
  defaultSpan: "col-span-1" | "col-span-1 md:col-span-2" | "col-span-1 md:col-span-2 lg:col-span-3";
  iconName: string;
  component: React.ComponentType;
}

interface WidgetMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableWidgets: WidgetDefinition[];
  activeWidgets: string[];
  onAddWidget: (id: string) => void;
  onRemoveWidget: (id: string) => void;
}

export default function WidgetMarketplaceModal({
  isOpen,
  onClose,
  availableWidgets,
  activeWidgets,
  onAddWidget,
  onRemoveWidget,
}: WidgetMarketplaceModalProps) {
  const { t } = useLocalization();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  if (!isOpen) return null;

  const categories = [
    { id: "all", label: t("dashboard.marketplace.all", "All"), icon: Sparkles },
    { id: "ai", label: t("dashboard.marketplace.aiAutomation", "AI & Automation"), icon: Cpu },
    { id: "finance", label: t("dashboard.marketplace.financeHr", "Finance & HR"), icon: DollarSign },
    { id: "hr", label: t("dashboard.marketplace.financeHr", "HR & People"), icon: Users },
    { id: "crm", label: t("dashboard.marketplace.salesCrm", "Sales & CRM"), icon: Briefcase },
    { id: "ops", label: t("dashboard.marketplace.itSecurity", "Operations & PM"), icon: Workflow },
    { id: "security", label: t("dashboard.marketplace.itSecurity", "Security & IT"), icon: ShieldCheck },
  ];

  const getWidgetIcon = (iconName: string) => {
    switch (iconName) {
      case "cpu": return <Cpu className="w-5 h-5 text-purple-500" />;
      case "users": return <Users className="w-5 h-5 text-emerald-500" />;
      case "dollar": return <DollarSign className="w-5 h-5 text-blue-500" />;
      case "briefcase": return <Briefcase className="w-5 h-5 text-amber-500" />;
      case "workflow": return <Workflow className="w-5 h-5 text-indigo-500" />;
      case "shield": return <ShieldCheck className="w-5 h-5 text-red-500" />;
      case "message": return <MessageSquare className="w-5 h-5 text-pink-500" />;
      case "book": return <BookOpen className="w-5 h-5 text-cyan-500" />;
      case "globe": return <Globe className="w-5 h-5 text-teal-500" />;
      default: return <Sparkles className="w-5 h-5 text-blue-500" />;
    }
  };

  const filteredWidgets = availableWidgets.filter((w) => {
    const localizedName = t(`dashboard.catalog.${w.id}.name`, w.name);
    const localizedDesc = t(`dashboard.catalog.${w.id}.description`, w.description);
    const matchesCategory = activeTab === "all" || w.category === activeTab;
    const matchesSearch = localizedName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          localizedDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          w.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white">
                {t("dashboard.marketplace.title", "Sovereign Widget Marketplace")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("dashboard.marketplace.subtitle", "Discover, pin, and customize high-impact command widgets across Septimus OS.")}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Categories */}
        <div className="p-6 pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder={t("dashboard.marketplace.searchPlaceholder", "Search widgets by name or feature...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ltr:pl-10 ltr:pr-4 rtl:pr-10 rtl:pl-4 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button 
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    isActive 
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 scale-105" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Widgets Grid */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWidgets.length === 0 ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <Search className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-700 dark:text-slate-300">
                {t("dashboard.marketplace.noResultsTitle", "No widgets matched your search")}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                {t("dashboard.marketplace.noResultsDesc", "Try searching for another keyword or switch category tabs above.")}
              </p>
            </div>
          ) : (
            filteredWidgets.map((widget) => {
              const isAdded = activeWidgets.includes(widget.id);
              return (
                <div 
                  key={widget.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isAdded 
                      ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 shadow-sm" 
                      : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
                        {getWidgetIcon(widget.iconName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                            {t(`dashboard.catalog.${widget.id}.name`, widget.name)}
                          </h3>
                          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {widget.defaultSpan.includes("md:col-span-2") ? t("dashboard.gridWide", "Wide (2x)") : t("dashboard.gridCompact", "Compact (1x)")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {t(`dashboard.catalog.${widget.id}.description`, widget.description)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                    {isAdded ? (
                      <button 
                        onClick={() => onRemoveWidget(widget.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-red-500 transition-colors group"
                      >
                        <Check className="w-3.5 h-3.5 group-hover:hidden" />
                        <X className="w-3.5 h-3.5 hidden group-hover:inline" />
                        <span className="group-hover:hidden">{t("dashboard.marketplace.added", "Added")}</span>
                        <span className="hidden group-hover:inline">{t("dashboard.marketplace.remove", "Remove")}</span>
                      </button>
                    ) : (
                      <button 
                        onClick={() => onAddWidget(widget.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm shadow-blue-600/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t("dashboard.marketplace.add", "Add Widget")}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("dashboard.marketplace.pinnedCount", "Active Widgets pinned:")} <strong className="text-slate-800 dark:text-white font-black">{activeWidgets.length}</strong>
          </span>
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition"
          >
            {t("common.done", "Done")}
          </button>
        </div>
      </div>
    </div>
  );
}
