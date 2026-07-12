"use client";

import React, { useState } from "react";
import { PlusCircle, Search, LayoutGrid, List } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import LeadDetailsModal from "./LeadDetailsModal";
import AddQuoteModal from "./AddQuoteModal";

export interface LeadData {
  company?: string;
  email?: string;
  status?: string;
  value?: string | number;
  contact_person?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface LeadEntity {
  id: string;
  created_at: string;
  data: LeadData;
}

interface CRMLeadsViewProps {
  entities: LeadEntity[];
  loading: boolean;
  onNewLead: () => void;
  onRefresh?: () => void;
}

export interface ColumnConfig {
  id: string;
  title: string;
  probability: number;
  color: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: "new", title: "New Lead 🆕", probability: 0.1, color: "bg-blue-50 border-blue-200 text-blue-700" },
  { id: "contacted", title: "Contacted 📞", probability: 0.3, color: "bg-amber-50 border-amber-200 text-amber-700" },
  { id: "quote_sent", title: "Quote Sent 📑", probability: 0.6, color: "bg-purple-50 border-purple-200 text-purple-700" },
  { id: "negotiation", title: "Negotiating 🤝", probability: 0.8, color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { id: "closed_won", title: "Closed Won 🎉", probability: 1.0, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { id: "closed_lost", title: "Closed Lost ❌", probability: 0.0, color: "bg-rose-50 border-rose-200 text-rose-700" },
];

export default function CRMLeadsView({ entities, loading, onNewLead, onRefresh }: CRMLeadsViewProps) {
  const { t, formatCurrency } = useLocalization();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedLead, setSelectedLead] = useState<LeadEntity | null>(null);
  const [quoteTargetLead, setQuoteTargetLead] = useState<LeadEntity | null>(null);
  
  // Local state for optimistic updates during drag and drop
  const [localEntities, setLocalEntities] = useState<LeadEntity[]>(entities);

  // Sync local entities when props change
  React.useEffect(() => {
    // eslint-disable-next-line
    setLocalEntities(entities);
  }, [entities]);

  const filteredEntities = localEntities.filter((e) => {
    const company = String(e.data?.company || "").toLowerCase();
    const email = String(e.data?.email || "").toLowerCase();
    return company.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
  });

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    
    // Optimistic update
    setLocalEntities((prev) => 
      prev.map(e => e.id === draggableId ? { ...e, data: { ...e.data, status: newStatus } } : e)
    );

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const entityToUpdate = localEntities.find(e => e.id === draggableId);
      
      if (entityToUpdate) {
        const res = await fetchWithAuth(`${API_BASE_URL}/entities/${draggableId}?workspace_id=${workspaceId}`, {
          method: 'PUT',
          body: JSON.stringify({
            data: { ...entityToUpdate.data, status: newStatus }
          })
        });
        if (!res.ok) {
          throw new Error("Failed to update status");
        }
      }
    } catch (err) {
      console.error("Failed to update lead status:", err);
      // Revert optimistic update
      setLocalEntities(entities);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-900 dark:text-slate-100">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold capitalize">{t("crm.title")}</h1>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-brand" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
              title={t("crm.kanbanView")}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-white dark:bg-[#1a1a1a] shadow-sm text-brand" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
              title={t("crm.tableView")}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          { }
          <button 
            onClick={onNewLead}
            className="flex items-center px-4 py-2 rounded-lg font-medium transition-colors text-white hover:opacity-90 bg-brand"
          >
            <PlusCircle className="w-5 h-5 ltr:me-2 rtl:ms-2" />
            {t("crm.newLead")}
          </button>
        </div>
      </div>

      {/* Pipeline Forecasting Summary Bar */}
      {(() => {
        const totalLeads = filteredEntities.length;
        const totalPipelineValue = filteredEntities.reduce((sum, e) => {
          const val = Number(e.data?.value || 0);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
        
        const weightedExpectedRevenue = filteredEntities.reduce((sum, e) => {
          const val = Number(e.data?.value || 0);
          const status = String(e.data?.status || "new");
          const col = COLUMNS.find(c => c.id === status);
          const prob = col ? col.probability : 0.1;
          return sum + (isNaN(val) ? 0 : val * prob);
        }, 0);

        const wonLeads = filteredEntities.filter(e => e.data?.status === "closed_won").length;
        const lostLeads = filteredEntities.filter(e => e.data?.status === "closed_lost").length;
        const winRate = (wonLeads + lostLeads) > 0 ? Math.round((wonLeads / (wonLeads + lostLeads)) * 100) : 0;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("crm.totalActiveLeads")}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalLeads}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t("crm.across6Stages")}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("crm.totalPipelineValue")}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-mono">{formatCurrency(totalPipelineValue)}</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t("crm.fullValue")}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t("crm.totalPipelineValue")}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-slate-800 font-mono">{formatCurrency(totalPipelineValue)}</span>
                <span className="text-xs text-emerald-600 font-medium">{t("crm.fullValue")}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between ltr:border-s-4 ltr:border-s-brand rtl:border-e-4 rtl:border-e-brand transition-colors">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("crm.weightedExpectedRevenue")}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-brand font-mono">{formatCurrency(Math.round(weightedExpectedRevenue))}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t("crm.probabilityWeighted")}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("crm.winRate")}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{winRate}%</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{wonLeads} {t("crm.won")} / {lostLeads} {t("crm.lost")}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Search & Filter */}
      <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 flex items-center transition-colors">
        <Search className="w-5 h-5 text-slate-400 ltr:me-3 rtl:ms-3" />
        <input 
          type="text" 
          placeholder={t("crm.searchLeads")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 w-full placeholder:text-slate-400"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">{t("crm.loadingLeads")}</div>
        ) : filteredEntities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-white/50 dark:bg-[#1a1a1a]/50">
            {t("crm.noLeadsFound")}
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden h-full overflow-y-auto shadow-sm transition-colors">
            <table className="w-full text-start">
              <thead className="bg-slate-50 dark:bg-[#121212] border-b border-slate-200 dark:border-slate-800 sticky top-0">
                <tr>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t("crm.company")}</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t("crm.contactEmail")}</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t("crm.status")}</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t("crm.value")}</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">{t("crm.createdAt")}</th>
                  <th className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-400 text-end">{t("crm.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntities.map((entity) => (
                  <tr key={String(entity.id)} className="hover:bg-slate-50 dark:hover:bg-[#121212] transition-colors cursor-pointer" onClick={() => setSelectedLead(entity)}>
                    <td className="p-4 text-sm text-slate-800 dark:text-slate-100 font-medium">{entity.data?.company || t("common.unknown")}</td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-400">{entity.data?.email || t("common.na")}</td>
                    <td className="p-4 text-sm">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">
                        {entity.data?.status || "new"}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-400 font-mono">{formatCurrency(Number(entity.data?.value || 0))}</td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(String(entity.created_at)).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-sm text-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Generate quotation for ${entity.data?.company || 'lead'}`}
                        onClick={() => setQuoteTargetLead(entity)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors inline-flex items-center shadow-2xs"
                      >
                        📑 {t("crm.quote")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex h-full space-x-6 overflow-x-auto pb-4">
              {COLUMNS.map((col) => {
                const columnLeads = filteredEntities.filter((e) => (e.data?.status || "new") === col.id);
                return (
                  <div key={col.id} className="w-80 flex flex-col h-full bg-[#f8fafc]/50 dark:bg-[#121212]/50 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 shadow-sm transition-colors">
                    <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] rounded-t-xl">
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{col.title}</h3>
                      <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 py-1 px-2 rounded-full border border-slate-200 dark:border-slate-700">
                        {columnLeads.length}
                      </span>
                    </div>
                    
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-100/80 rounded-b-xl' : ''}`}
                        >
                          {columnLeads.map((lead, index) => (
                            <Draggable key={lead.id} draggableId={lead.id} index={index}>
                              {(dragProvided) => (
                                <div 
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-brand hover:shadow-md transition-all group"
                                  onClick={() => setSelectedLead(lead)}
                                >
                                  <div className="font-medium text-slate-800 dark:text-slate-100 mb-1">{lead.data?.company || t("crm.unknownCompany")}</div>
                                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-3">{lead.data?.contact_person || lead.data?.email || t("crm.noContactInfo")}</div>
                                  <div className="flex justify-between items-center text-xs mb-3">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium font-mono">{formatCurrency(Number(lead.data?.value || 0))}</span>
                                    <span className="text-slate-400">{new Date(String(lead.created_at)).toLocaleDateString()}</span>
                                  </div>
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      aria-label={`Generate quotation for ${lead.data?.company || 'lead'}`}
                                      onClick={() => setQuoteTargetLead(lead)}
                                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors flex items-center shadow-2xs"
                                    >
                                      📑 {t("crm.quote")}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </div>
      
      {/* Lead Details Modal */}
      {selectedLead && (
        <LeadDetailsModal 
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Quote Generator Modal - Fully Wired */}
      {quoteTargetLead && (
        <AddQuoteModal
          lead={quoteTargetLead}
          onClose={() => setQuoteTargetLead(null)}
          onSuccess={() => {
            setQuoteTargetLead(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}
