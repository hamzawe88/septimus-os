"use client";

import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, GripVertical, X, RotateCw, LayoutGrid, Sparkles, SlidersHorizontal, Check } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

import TasksWidget from "./widgets/TasksWidget";
import CRMDealsWidget from "./widgets/CRMDealsWidget";
import FinanceKPIsWidget from "./widgets/FinanceKPIsWidget";
import AIOrchestratorWidget from "./widgets/AIOrchestratorWidget";
import HRPulseWidget from "./widgets/HRPulseWidget";
import SecurityAuditWidget from "./widgets/SecurityAuditWidget";
import WorkflowsWidget from "./widgets/WorkflowsWidget";
import QuickConnectWidget from "./widgets/QuickConnectWidget";
import GlobalBranchesWidget from "./widgets/GlobalBranchesWidget";
import KnowledgeVaultWidget from "./widgets/KnowledgeVaultWidget";
import WidgetMarketplaceModal, { WidgetDefinition } from "./WidgetMarketplaceModal";

export const availableWidgets: WidgetDefinition[] = [
  {
    id: "ai",
    name: "AI Sovereign Sidecar Pulse",
    description: "Executive neural mesh command center, real-time token processing, and instant prompt execution.",
    category: "ai",
    defaultSpan: "col-span-1 md:col-span-2",
    iconName: "cpu",
    component: AIOrchestratorWidget,
  },
  {
    id: "finance",
    name: "Finance Multi-Currency Treasury",
    description: "Real-time cashflow across LYD, USD, and EUR with quick invoice approval and AI financial insights.",
    category: "finance",
    defaultSpan: "col-span-1 md:col-span-2",
    iconName: "dollar",
    component: FinanceKPIsWidget,
  },
  {
    id: "tasks",
    name: "Tasks & Project Command",
    description: "Interactive priority task checklist with 1-click checkbox completion and assignee status.",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "workflow",
    component: TasksWidget,
  },
  {
    id: "hr",
    name: "HR & Attendance 360 Radar",
    description: "Live present/remote/leave employee breakdown with 1-click pending leave request approval.",
    category: "hr",
    defaultSpan: "col-span-1",
    iconName: "users",
    component: HRPulseWidget,
  },
  {
    id: "crm",
    name: "CRM Pipeline & High-Value Deals",
    description: "Visual sales funnel breakdown with instant lead creation and high-value deal tracking.",
    category: "crm",
    defaultSpan: "col-span-1",
    iconName: "briefcase",
    component: CRMDealsWidget,
  },
  {
    id: "security",
    name: "Security Shield & Audit Stream",
    description: "Real-time administrative audit feed, failed login radar, and Sovereign SAIF encryption status.",
    category: "security",
    defaultSpan: "col-span-1",
    iconName: "shield",
    component: SecurityAuditWidget,
  },
  {
    id: "workflows",
    name: "Automated Workflows Controller",
    description: "Sovereign n8n automation pipelines with instant Run Now execution triggers and active toggles.",
    category: "ai",
    defaultSpan: "col-span-1",
    iconName: "workflow",
    component: WorkflowsWidget,
  },
  {
    id: "huddles",
    name: "Live Team Huddles Hub",
    description: "Instant voice & video audio mesh channels with quick 1-click join and participant count.",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "message",
    component: QuickConnectWidget,
  },
  {
    id: "branches",
    name: "Global Corporate Clocks & Nodes",
    description: "Multi-timezone clocks for Libya HQ (Tripoli/Benghazi), Dubai, London, and New York nodes.",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "globe",
    component: GlobalBranchesWidget,
  },
  {
    id: "knowledge",
    name: "Sovereign Knowledge Vault",
    description: "SOP document search across payment switch architecture, labor laws, and corporate policies.",
    category: "all",
    defaultSpan: "col-span-1",
    iconName: "book",
    component: KnowledgeVaultWidget,
  },
];

const DEFAULT_LAYOUT = ["ai", "tasks", "finance", "hr", "crm"];

export default function LiquidDashboard() {
  const { t } = useLocalization();
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_LAYOUT);
  const [widgetSpans, setWidgetSpans] = useState<Record<string, string>>({});
  const [flippedWidgets, setFlippedWidgets] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      const savedLayout = localStorage.getItem("septimus_dashboard_layout_v2");
      const savedSpans = localStorage.getItem("septimus_dashboard_spans_v2");
      if (savedLayout) {
        try {
          const parsed = JSON.parse(savedLayout);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setActiveWidgets(parsed);
          }
        } catch {
          // fallback
        }
      }
      if (savedSpans) {
        try {
          const parsedSpans = JSON.parse(savedSpans);
          if (parsedSpans && typeof parsedSpans === "object") {
            setWidgetSpans(parsedSpans);
          }
        } catch {
          // fallback
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("septimus_dashboard_layout_v2", JSON.stringify(activeWidgets));
      localStorage.setItem("septimus_dashboard_spans_v2", JSON.stringify(widgetSpans));
    }
  }, [activeWidgets, widgetSpans, isMounted]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(activeWidgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setActiveWidgets(items);
  };

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) {
      setActiveWidgets([...activeWidgets, id]);
    }
  };

  const removeWidget = (id: string) => {
    setActiveWidgets(activeWidgets.filter((w) => w !== id));
  };

  const toggleFlip = (id: string) => {
    setFlippedWidgets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setSpan = (id: string, spanClass: string) => {
    setWidgetSpans((prev) => ({ ...prev, [id]: spanClass }));
  };

  const getWidgetSpan = (id: string, defaultSpan: string) => {
    return widgetSpans[id] || defaultSpan;
  };

  if (!isMounted) return null;

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] dark:bg-[#121212] p-6 pb-20 overflow-y-auto w-full relative transition-colors">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
              {t("dashboard.title", "My Sovereign Workspace")}
            </h1>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              V2 Liquid Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t("dashboard.subtitle", "Customize your personalized liquid command dashboard across all corporate subsystems.")}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition border shadow-sm ${
              isEditMode
                ? "bg-amber-500 text-white border-amber-600 shadow-amber-500/20"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isEditMode ? t("dashboard.doneEditing", "Exit Edit Mode") : t("dashboard.customizeGrid", "Customize Grid")}</span>
          </button>

          <button
            onClick={() => setShowMarketplace(true)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/20"
          >
            <Plus className="w-4 h-4 ltr:me-1.5 rtl:ms-1.5 stroke-[2.5]" />
            <span>{t("dashboard.addWidget", "Add Widget")}</span>
          </button>
        </div>
      </div>

      {/* Grid or Empty state */}
      {activeWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl bg-slate-50/50 dark:bg-slate-900/40 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950 rounded-2xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm">
            <Sparkles className="w-8 h-8 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {t("dashboard.emptyTitle", "Your workspace is empty")}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 max-w-md">
            {t("dashboard.emptyDesc", "Start building your perfect sovereign dashboard by clicking Add Widget or browsing the marketplace.")}
          </p>
          <button
            onClick={() => setShowMarketplace(true)}
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t("dashboard.browseWidgets", "Open Widget Marketplace")}</span>
          </button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-widgets" direction="horizontal">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto"
              >
                {activeWidgets.map((widgetId, index) => {
                  const WidgetDef = availableWidgets.find((w) => w.id === widgetId);
                  if (!WidgetDef) return null;
                  const WidgetComponent = WidgetDef.component;
                  const isFlipped = Boolean(flippedWidgets[widgetId]) || isEditMode;
                  const currentSpan = getWidgetSpan(widgetId, WidgetDef.defaultSpan);

                  return (
                    <Draggable key={widgetId} draggableId={widgetId} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`${currentSpan} aspect-auto min-h-[340px] [perspective:1000px] transition-all duration-300 ${
                            snapshot.isDragging ? "z-50 scale-[1.02] shadow-2xl" : ""
                          }`}
                        >
                          <div
                            className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
                              isFlipped ? "[transform:rotateY(180deg)]" : ""
                            }`}
                          >
                            {/* FRONT FACE */}
                            <div className="absolute inset-0 [backface-visibility:hidden] bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-lg transition-all flex flex-col overflow-hidden">
                              {/* Widget Header Bar */}
                              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 rounded-t-3xl">
                                <div
                                  {...provided.dragHandleProps}
                                  className="flex items-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing transition"
                                >
                                  <GripVertical className="w-4 h-4 me-1.5 opacity-70" />
                                  <span className="font-extrabold text-xs text-slate-700 dark:text-slate-200 select-none">
                                    {t(`dashboard.catalog.${WidgetDef.id}.name`, WidgetDef.name)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => toggleFlip(widgetId)}
                                    title={t("dashboard.flipConfigure", "Flip / Configure Card")}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => removeWidget(widgetId)}
                                    title={t("common.remove", "Remove Widget")}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Widget Body */}
                              <div className="p-5 flex-1 flex flex-col overflow-y-auto">
                                <WidgetComponent />
                              </div>
                            </div>

                            {/* BACK FACE (Interactive Configuration & Controls) */}
                            <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-white via-slate-50 to-blue-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 rounded-3xl shadow-xl flex flex-col justify-between p-6 border-2 border-blue-500/30 dark:border-blue-500/40">
                              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                                <div className="flex items-center gap-2">
                                  <LayoutGrid className="w-4 h-4 text-blue-500" />
                                  <span className="font-bold text-xs text-slate-800 dark:text-white">
                                    {t("dashboard.configureWidget", "Widget Configuration")}
                                  </span>
                                </div>
                                <button
                                  onClick={() => toggleFlip(widgetId)}
                                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="flex flex-col gap-4 my-auto py-2">
                                <div>
                                  <h4 className="font-black text-sm text-slate-800 dark:text-white mb-1">
                                    {t(`dashboard.catalog.${WidgetDef.id}.name`, WidgetDef.name)}
                                  </h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {t(`dashboard.catalog.${WidgetDef.id}.description`, WidgetDef.description)}
                                  </p>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
                                    {t("dashboard.gridSize", "Card Width & Grid Span")}
                                  </label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: "Compact (1x)", value: "col-span-1" },
                                      { label: "Wide (2x)", value: "col-span-1 md:col-span-2" },
                                      { label: "Full (3x)", value: "col-span-1 md:col-span-2 lg:col-span-3" },
                                    ].map((opt) => {
                                      const isSelected = currentSpan === opt.value;
                                      return (
                                        <button
                                          key={opt.value}
                                          onClick={() => setSpan(widgetId, opt.value)}
                                          className={`py-2 px-2 rounded-xl text-[11px] font-extrabold transition border flex flex-col items-center justify-center gap-1 ${
                                            isSelected
                                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                                          }`}
                                        >
                                          <span>{opt.label}</span>
                                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                                <div
                                  {...provided.dragHandleProps}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold cursor-grab active:cursor-grabbing hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                  <span>Drag to move</span>
                                </div>

                                <button
                                  onClick={() => toggleFlip(widgetId)}
                                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                                >
                                  {t("common.save", "Save & Flip Back")}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Widget Marketplace Modal */}
      <WidgetMarketplaceModal
        isOpen={showMarketplace}
        onClose={() => setShowMarketplace(false)}
        availableWidgets={availableWidgets}
        activeWidgets={activeWidgets}
        onAddWidget={addWidget}
        onRemoveWidget={removeWidget}
      />
    </div>
  );
}
