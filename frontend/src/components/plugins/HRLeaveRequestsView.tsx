"use client";

import React, { useState, useEffect } from "react";
import { PlusCircle, Search, LayoutGrid, List } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import HRLeaveDetailsModal from "./HRLeaveDetailsModal";

export interface LeaveRequestData {
  employee?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  status?: string;
  manager_notes?: string;
  [key: string]: unknown;
}

export interface LeaveRequestEntity {
  id: string;
  created_at: string;
  data: LeaveRequestData;
}

interface HRLeaveRequestsViewProps {
  entities: LeaveRequestEntity[];
  loading: boolean;
  onNewRequest: () => void;
  onRefresh?: () => void;
}

const COLUMNS = [
  { id: "pending", title: "Pending" },
  { id: "approved", title: "Approved" },
  { id: "rejected", title: "Rejected" },
];

export default function HRLeaveRequestsView({ entities, loading, onNewRequest, onRefresh }: HRLeaveRequestsViewProps) {
  const { t } = useLocalization();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestEntity | null>(null);
  
  const [localEntities, setLocalEntities] = useState<LeaveRequestEntity[]>(entities);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalEntities(entities);
  }, [entities]);

  const filteredEntities = localEntities.filter((e) => {
    const employee = String(e.data?.employee || "").toLowerCase();
    return employee.includes(searchTerm.toLowerCase());
  });

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    
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
        if (!res.ok) throw new Error("Failed to update status");
      }
    } catch (err) {
      console.error("Failed to update leave request status:", err);
      setLocalEntities(entities);
    }
  };

  return (
    <div className="flex flex-col h-full text-foreground dark:text-slate-100">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold capitalize">{t("hr.title")}</h1>
        <div className="flex items-center gap-4">
          <div className="flex bg-muted dark:bg-slate-800 rounded-lg p-1 border border-border dark:border-slate-700">
            <button 
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-card dark:bg-[#1a1a1a] shadow-sm text-brand" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-slate-200"}`}
              title={t("crm.kanbanView")}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-card dark:bg-[#1a1a1a] shadow-sm text-brand" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-slate-200"}`}
              title={t("crm.tableView")}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          <button 
            onClick={onNewRequest}
            className="flex items-center px-4 py-2 rounded-lg font-medium transition-colors text-white hover:opacity-90 bg-brand"
          >
            <PlusCircle className="w-5 h-5 ltr:me-2 rtl:ms-2" />
            {t("hr.newRequest")}
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-card dark:bg-[#1a1a1a] p-4 rounded-xl border border-border dark:border-slate-800 shadow-sm mb-6 flex items-center transition-colors">
        <Search className="w-5 h-5 text-muted-foreground ltr:me-3 rtl:ms-3" />
        <input 
          type="text" 
          placeholder={t("hr.searchByEmployee")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none text-foreground dark:text-slate-100 w-full placeholder:text-muted-foreground"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">{t("hr.loadingRequests")}</div>
        ) : filteredEntities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground dark:text-muted-foreground border-2 border-dashed border-border dark:border-slate-700 rounded-xl bg-white/50 dark:bg-[#1a1a1a]/50">
            {t("hr.noRequestsFound")}
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-card dark:bg-[#1a1a1a] rounded-xl border border-border dark:border-slate-800 overflow-hidden h-full overflow-y-auto shadow-sm transition-colors">
            <table className="w-full text-start">
              <thead className="bg-muted dark:bg-[#121212] border-b border-border dark:border-slate-800 sticky top-0">
                <tr>
                  <th className="p-4 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">{t("hr.employee")}</th>
                  <th className="p-4 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">{t("hr.dates")}</th>
                  <th className="p-4 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">{t("hr.reason")}</th>
                  <th className="p-4 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">{t("crm.status")}</th>
                  <th className="p-4 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">{t("hr.requestedOn")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-slate-800">
                {filteredEntities.map((entity) => (
                  <tr key={String(entity.id)} className="hover:bg-muted dark:hover:bg-[#121212] transition-colors cursor-pointer" onClick={() => setSelectedRequest(entity)}>
                    <td className="p-4 text-sm text-foreground dark:text-slate-100 font-medium">{entity.data?.employee || t("common.unknown")}</td>
                    <td className="p-4 text-sm text-muted-foreground dark:text-muted-foreground">{entity.data?.start_date} {t("hr.to")} {entity.data?.end_date}</td>
                    <td className="p-4 text-sm text-muted-foreground dark:text-muted-foreground truncate max-w-xs">{entity.data?.reason || t("common.na")}</td>
                    <td className="p-4 text-sm">
                      <span className="px-2 py-1 bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 rounded-md text-xs font-medium text-muted-foreground dark:text-muted-foreground capitalize">
                        {t(`hr.${entity.data?.status || "pending"}`, String(entity.data?.status || "pending"))}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {new Date(String(entity.created_at)).toLocaleDateString()}
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
                const columnRequests = filteredEntities.filter((e) => (e.data?.status || "pending") === col.id);
                return (
                  <div key={col.id} className="w-80 flex flex-col h-full bg-background/50 dark:bg-[#121212]/50 rounded-xl border border-border dark:border-slate-800 shrink-0 shadow-sm transition-colors">
                    <div className="flex items-center justify-between p-3 border-b border-border dark:border-slate-800 bg-card dark:bg-[#1a1a1a] rounded-t-xl">
                      <h3 className="font-semibold text-foreground dark:text-slate-100">{t(`hr.${col.id}`, col.title)}</h3>
                      <span className="text-xs font-semibold bg-muted dark:bg-slate-800 text-muted-foreground dark:text-muted-foreground py-1 px-2 rounded-full border border-border dark:border-slate-700">
                        {columnRequests.length}
                      </span>
                    </div>
                    
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-muted/80 dark:bg-slate-800/50 rounded-b-xl' : ''}`}
                        >
                          {columnRequests.map((req, index) => (
                            <Draggable key={req.id} draggableId={req.id} index={index}>
                              {(dragProvided) => (
                                <div 
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className="bg-card dark:bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-border dark:border-slate-800 cursor-pointer hover:border-brand hover:shadow-md transition-all group"
                                  onClick={() => setSelectedRequest(req)}
                                >
                                  <div className="font-medium text-foreground dark:text-slate-100 mb-1">{req.data?.employee || t("hr.unknownEmployee")}</div>
                                  <div className="text-sm text-muted-foreground dark:text-muted-foreground mb-3">{req.data?.start_date} - {req.data?.end_date}</div>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground dark:text-muted-foreground truncate me-2">{req.data?.reason}</span>
                                    <span className="text-muted-foreground shrink-0">{new Date(String(req.created_at)).toLocaleDateString()}</span>
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
      
      {selectedRequest && (
        <HRLeaveDetailsModal 
          leaveReq={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}
