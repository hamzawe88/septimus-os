"use client";

import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Plus, GripVertical, X } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

import TasksWidget from "./widgets/TasksWidget";
import CRMDealsWidget from "./widgets/CRMDealsWidget";
import FinanceKPIsWidget from "./widgets/FinanceKPIsWidget";

const availableWidgets = [
  { id: "tasks", name: "Tasks Overview", component: TasksWidget },
  { id: "crm", name: "CRM Deals", component: CRMDealsWidget },
  { id: "finance", name: "Finance KPIs", component: FinanceKPIsWidget },
];

export default function LiquidDashboard() {
  const { t } = useLocalization();
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
      const saved = localStorage.getItem("septimus_dashboard_layout");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setActiveWidgets(parsed);
          }
        } catch {
          console.error("Error parsing saved layout");
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("septimus_dashboard_layout", JSON.stringify(activeWidgets));
    }
  }, [activeWidgets, isMounted]);

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
    setShowAddMenu(false);
  };

  const removeWidget = (id: string) => {
    setActiveWidgets(activeWidgets.filter((w) => w !== id));
  };

  if (!isMounted) return null;

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] p-6 pb-20 overflow-y-auto w-full relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("dashboard.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("dashboard.subtitle")}</p>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
          >
            <Plus className="w-4 h-4 ltr:me-2 rtl:ms-2" />
            {t("dashboard.addWidget")}
          </button>

          {showAddMenu && (
            <div className="absolute ltr:end-0 rtl:start-0 top-12 w-56 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-50">
              <div className="text-xs font-bold text-slate-400 mb-2 px-2 uppercase">{t("dashboard.availableWidgets")}</div>
              {availableWidgets.filter(w => !activeWidgets.includes(w.id)).length === 0 ? (
                <div className="px-2 py-2 text-sm text-slate-500">{t("dashboard.allWidgetsAdded")}</div>
              ) : (
                availableWidgets.filter(w => !activeWidgets.includes(w.id)).map(widget => (
                  <button 
                    key={widget.id}
                    onClick={() => addWidget(widget.id)}
                    className="w-full text-start px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600 rounded-lg transition"
                  >
                    {widget.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {activeWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">{t("dashboard.emptyTitle", "Your workspace is empty")}</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm text-center">
            {t("dashboard.emptyDesc", "Start building your perfect dashboard by clicking \"Add Widget\" to pin your most important tools here.")}
          </p>
          <button 
            onClick={() => setShowAddMenu(true)}
            className="mt-6 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
          >
            {t("dashboard.browseWidgets", "Browse Widgets")}
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
                  const WidgetDef = availableWidgets.find(w => w.id === widgetId);
                  if (!WidgetDef) return null;
                  const WidgetComponent = WidgetDef.component;

                  return (
                    <Draggable key={widgetId} draggableId={widgetId} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`group aspect-square w-full min-h-[320px] [perspective:1000px] ${
                            snapshot.isDragging ? "z-50 scale-105" : ""
                          }`}
                        >
                          <div 
                            className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${
                              snapshot.isDragging ? "" : "group-hover:[transform:rotateY(180deg)]"
                            }`}
                          >
                            {/* FRONT FACE */}
                            <div className="absolute inset-0 [backface-visibility:hidden] bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
                              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl group/header">
                                <div 
                                  {...provided.dragHandleProps} 
                                  className="flex items-center text-slate-400 hover:text-brand cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="w-5 h-5 me-2" />
                                  <span className="font-bold text-sm text-slate-700 select-none">
                                    {WidgetDef.name}
                                  </span>
                                </div>
                                <button 
                                  onClick={() => removeWidget(widgetId)}
                                  title="Remove Widget"
                                  className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition opacity-0 group-hover/header:opacity-100"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="p-5 flex-1 flex flex-col overflow-hidden">
                                <WidgetComponent />
                              </div>
                            </div>

                            {/* BACK FACE - PROPOSED LIGHT WOW-FACTOR */}
                            <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-white via-slate-50 to-blue-50/40 rounded-3xl shadow-xl flex flex-col items-center justify-center p-6 text-center border-2 border-brand/20 backdrop-blur-md">
                              <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-brand/20">
                                <GripVertical className="w-8 h-8" />
                              </div>
                              <h3 className="font-extrabold text-xl text-slate-800 mb-2">{WidgetDef.name}</h3>
                              <p className="text-sm font-medium text-slate-600 mb-6 max-w-[220px]">
                                {t("dashboard.widgetBackDesc", "Flip side for quick interaction and instant widget control.")}
                              </p>
                              <div 
                                {...provided.dragHandleProps} 
                                className="px-5 py-2.5 bg-brand text-white hover:bg-brand/90 rounded-xl cursor-grab active:cursor-grabbing transition-all shadow-md font-bold text-sm flex items-center gap-2"
                              >
                                <span>{t("dashboard.dragToMove", "Drag to move widget")}</span>
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
    </div>
  );
}
