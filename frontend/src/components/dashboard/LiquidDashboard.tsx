"use client";

import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, GripVertical, X, RotateCw, LayoutGrid, Sparkles, SlidersHorizontal, Check } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";

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
import MorningBriefWidget from "./MorningBriefWidget";
import WidgetMarketplaceModal, { WidgetDefinition } from "./WidgetMarketplaceModal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const availableWidgets: WidgetDefinition[] = [
  {
    id: "morning_brief",
    nameKey: "dashboard.catalog.morning_brief.name",
    descriptionKey: "dashboard.catalog.morning_brief.description",
    category: "ai",
    defaultSpan: "col-span-1 md:col-span-2",
    iconName: "brain",
    component: MorningBriefWidget,
  },
  {
    id: "ai",
    nameKey: "dashboard.catalog.ai.name",
    descriptionKey: "dashboard.catalog.ai.description",
    category: "ai",
    defaultSpan: "col-span-1 md:col-span-2",
    iconName: "cpu",
    component: AIOrchestratorWidget,
  },
  {
    id: "finance",
    nameKey: "dashboard.catalog.finance.name",
    descriptionKey: "dashboard.catalog.finance.description",
    category: "finance",
    defaultSpan: "col-span-1 md:col-span-2",
    iconName: "dollar",
    component: FinanceKPIsWidget,
  },
  {
    id: "tasks",
    nameKey: "dashboard.catalog.tasks.name",
    descriptionKey: "dashboard.catalog.tasks.description",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "workflow",
    component: TasksWidget,
  },
  {
    id: "hr",
    nameKey: "dashboard.catalog.hr.name",
    descriptionKey: "dashboard.catalog.hr.description",
    category: "hr",
    defaultSpan: "col-span-1",
    iconName: "users",
    component: HRPulseWidget,
  },
  {
    id: "crm",
    nameKey: "dashboard.catalog.crm.name",
    descriptionKey: "dashboard.catalog.crm.description",
    category: "crm",
    defaultSpan: "col-span-1",
    iconName: "briefcase",
    component: CRMDealsWidget,
  },
  {
    id: "security",
    nameKey: "dashboard.catalog.security.name",
    descriptionKey: "dashboard.catalog.security.description",
    category: "security",
    defaultSpan: "col-span-1",
    iconName: "shield",
    component: SecurityAuditWidget,
  },
  {
    id: "workflows",
    nameKey: "dashboard.catalog.workflows.name",
    descriptionKey: "dashboard.catalog.workflows.description",
    category: "ai",
    defaultSpan: "col-span-1",
    iconName: "workflow",
    component: WorkflowsWidget,
  },
  {
    id: "huddles",
    nameKey: "dashboard.catalog.huddles.name",
    descriptionKey: "dashboard.catalog.huddles.description",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "message",
    component: QuickConnectWidget,
  },
  {
    id: "branches",
    nameKey: "dashboard.catalog.branches.name",
    descriptionKey: "dashboard.catalog.branches.description",
    category: "ops",
    defaultSpan: "col-span-1",
    iconName: "globe",
    component: GlobalBranchesWidget,
  },
  {
    id: "knowledge",
    nameKey: "dashboard.catalog.knowledge.name",
    descriptionKey: "dashboard.catalog.knowledge.description",
    category: "all",
    defaultSpan: "col-span-1",
    iconName: "book",
    component: KnowledgeVaultWidget,
  },
];

const DEFAULT_LAYOUT = ["ai", "morning_brief", "tasks", "finance", "hr", "crm"];

export default function LiquidDashboard() {
  const { t } = useLocalization();
  const { isSidebarOpen } = useAppStore();
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
    <main
      data-testid="liquid-dashboard"
      className="relative flex h-full w-full flex-col overflow-y-auto bg-background px-4 py-6 pb-20 text-foreground sm:px-6"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {t("dashboard.title")}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsEditMode(!isEditMode)}
            variant={isEditMode ? "secondary" : "outline"}
            aria-pressed={isEditMode}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isEditMode ? t("dashboard.doneEditing") : t("dashboard.customizeGrid")}</span>
          </Button>

          <Button
            onClick={() => setShowMarketplace(true)}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t("dashboard.addWidget")}</span>
          </Button>
        </div>
      </div>

      {/* Grid or Empty state */}
      {activeWidgets.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<Sparkles className="animate-pulse" />}
          title={t("dashboard.emptyTitle")}
          description={t("dashboard.emptyDesc")}
          action={
            <Button onClick={() => setShowMarketplace(true)}>
              <Plus />
              {t("dashboard.browseWidgets")}
            </Button>
          }
        />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-widgets" direction="horizontal">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full mx-auto transition-all duration-300 ${isSidebarOpen ? 'max-w-7xl' : 'max-w-full'}`}
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
                            <section className="absolute inset-0 flex flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-card shadow-[var(--shadow-raised)] [backface-visibility:hidden]">
                              {/* Widget Header Bar */}
                              <div className="flex items-center justify-between border-b border-border bg-muted/35 px-5 py-3.5">
                                <div
                                  {...provided.dragHandleProps}
                                  className="flex cursor-grab items-center text-muted-foreground transition hover:text-brand active:cursor-grabbing"
                                >
                                  <GripVertical className="w-4 h-4 me-1.5 opacity-70" />
                                  <span className="select-none text-xs font-bold text-foreground">
                                    {t(WidgetDef.nameKey)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1">
                                  <Button
                                    onClick={() => toggleFlip(widgetId)}
                                    title={t("dashboard.flipConfigure")}
                                    aria-label={t("dashboard.flipConfigure")}
                                    variant="ghost"
                                    size="icon-xs"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    onClick={() => removeWidget(widgetId)}
                                    title={t("dashboard.removeWidget")}
                                    aria-label={t("dashboard.removeWidget")}
                                    variant="destructive"
                                    size="icon-xs"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {/* Widget Body */}
                              <div className="p-5 flex-1 flex flex-col overflow-y-auto">
                                <WidgetComponent />
                              </div>
                            </section>

                            {/* BACK FACE (Interactive Configuration & Controls) */}
                            <section className="absolute inset-0 flex flex-col justify-between rounded-[var(--radius-surface)] border border-brand/30 bg-card p-6 shadow-[var(--shadow-raised)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                              <div className="flex items-center justify-between border-b border-border pb-3">
                                <div className="flex items-center gap-2">
                                  <LayoutGrid className="w-4 h-4 text-brand" />
                                  <span className="text-xs font-bold">
                                    {t("dashboard.configureWidget")}
                                  </span>
                                </div>
                                <Button
                                  onClick={() => toggleFlip(widgetId)}
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={t("common.close")}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>

                              <div className="flex flex-col gap-4 my-auto py-2">
                                <div>
                                  <h4 className="mb-1 text-sm font-bold">
                                    {t(WidgetDef.nameKey)}
                                  </h4>
                                  <p className="text-xs leading-relaxed text-muted-foreground">
                                    {t(WidgetDef.descriptionKey)}
                                  </p>
                                </div>

                                <div>
                                  <label className="mb-2 block text-xs font-bold text-muted-foreground">
                                    {t("dashboard.gridSize")}
                                  </label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: t("dashboard.gridCompact"), value: "col-span-1" },
                                      { label: t("dashboard.gridWide"), value: "col-span-1 md:col-span-2" },
                                      { label: t("dashboard.gridFull"), value: "col-span-1 md:col-span-2 lg:col-span-3" },
                                    ].map((opt) => {
                                      const isSelected = currentSpan === opt.value;
                                      return (
                                        <Button
                                          key={opt.value}
                                          onClick={() => setSpan(widgetId, opt.value)}
                                          variant={isSelected ? "default" : "outline"}
                                          className="h-auto min-h-14 flex-col text-xs whitespace-normal"
                                          aria-pressed={isSelected}
                                        >
                                          <span>{opt.label}</span>
                                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-t border-border pt-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="flex cursor-grab items-center gap-1.5 rounded-[var(--radius-control)] bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                  <span>{t("dashboard.dragToMove")}</span>
                                </div>

                                <Button
                                  onClick={() => toggleFlip(widgetId)}
                                >
                                  {t("dashboard.saveFlipBack")}
                                </Button>
                              </div>
                            </section>
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
    </main>
  );
}
