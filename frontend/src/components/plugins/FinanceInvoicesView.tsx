"use client";

import React, { useState, useEffect } from "react";
import { PlusCircle, Search, LayoutGrid, List, Printer, Building2, FileText } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import FinanceInvoiceDetailsModal from "./FinanceInvoiceDetailsModal";
import InvoicePrintModal, { SMEInvoiceData } from "../finance/InvoicePrintModal";

export interface InvoiceData {
  client_name?: string;
  clientName?: string;
  clientCompany?: string;
  invoice_number?: string;
  invoiceNumber?: string;
  amount?: string | number;
  subtotal?: string | number;
  due_date?: string;
  dueDate?: string;
  status?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface InvoiceEntity {
  id: string;
  created_at: string;
  data: InvoiceData;
}

interface FinanceInvoicesViewProps {
  entities: InvoiceEntity[];
  loading: boolean;
  onNewInvoice: () => void;
  onRefresh?: () => void;
}

const BASE_COLUMNS = [
  { id: "pending", titleKey: "finance.status.pending", defaultTitle: "Pending", bg: "bg-amber-500/10", border: "border-amber-200" },
  { id: "paid", titleKey: "finance.status.paid", defaultTitle: "Paid", bg: "bg-emerald-500/10", border: "border-emerald-200" },
  { id: "overdue", titleKey: "finance.status.overdue", defaultTitle: "Overdue", bg: "bg-rose-500/10", border: "border-rose-200" },
];

export default function FinanceInvoicesView({ entities, loading, onNewInvoice, onRefresh }: FinanceInvoicesViewProps) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceEntity | null>(null);
  const [selectedPrintInvoice, setSelectedPrintInvoice] = useState<InvoiceEntity | null>(null);
  
  const [localEntities, setLocalEntities] = useState<InvoiceEntity[]>(entities);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalEntities(entities);
  }, [entities]);

  const filteredEntities = localEntities.filter((e) => {
    const client = String(e.data?.client_name || e.data?.clientName || e.data?.clientCompany || "").toLowerCase();
    const num = String(e.data?.invoice_number || e.data?.invoiceNumber || e.id || "").toLowerCase();
    return client.includes(searchTerm.toLowerCase()) || num.includes(searchTerm.toLowerCase());
  });

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;

    setLocalEntities((prev) =>
      prev.map((e) => (e.id === draggableId ? { ...e, data: { ...e.data, status: newStatus } } : e))
    );

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const entityToUpdate = localEntities.find((e) => e.id === draggableId);

      if (entityToUpdate) {
        const res = await fetchWithAuth(`${API_BASE_URL}/entities/${draggableId}?workspace_id=${workspaceId}`, {
          method: "PUT",
          body: JSON.stringify({
            data: { ...entityToUpdate.data, status: newStatus },
          }),
        });
        if (!res.ok) throw new Error("Failed to update status");
      }
    } catch (err) {
      console.error("Failed to update invoice status:", err);
      setLocalEntities(entities);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
      case "overdue": return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-900">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand" />
            <span>{t("finance.title")}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("finance.subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "kanban" ? "bg-white shadow-sm text-brand" : "text-slate-500 hover:text-slate-700"}`}
              title={t("finance.kanbanView")}
              aria-label={t("finance.kanbanView")}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-brand" : "text-slate-500 hover:text-slate-700"}`}
              title={t("finance.tableView")}
              aria-label={t("finance.tableView")}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={onNewInvoice}
            className="flex items-center px-5 py-2.5 rounded-xl font-bold transition-colors text-white hover:opacity-90 shadow-md gap-2 bg-brand"
          >
            <PlusCircle className="w-5 h-5" />
            <span>{t("finance.issueInvoice")}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex items-center">
        <Search className="w-5 h-5 text-slate-400 ltr:me-3 rtl:ms-3" />
        <input
          title={t("finance.searchInvoices")}
          aria-label={t("finance.searchInvoices")}
          type="text"
          placeholder={t("finance.searchInvoices")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent border-none outline-none text-slate-900 w-full placeholder:text-slate-400 text-sm"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">{t("finance.loadingInvoices")}</div>
        ) : filteredEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50 p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mb-3" />
            <p className="font-bold text-slate-700">{t("finance.noInvoicesFound")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("finance.noInvoicesDesc")}</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full overflow-y-auto shadow-sm">
            <table className="w-full text-start">
              <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 text-xs font-bold text-slate-600 uppercase">
                <tr>
                  <th className="p-4">{t("finance.invoiceNumber")}</th>
                  <th className="p-4">{t("finance.clientAndCompany")}</th>
                  <th className="p-4">{t("finance.amountDue")}</th>
                  <th className="p-4">{t("finance.dueDate")}</th>
                  <th className="p-4">{t("finance.statusLabel")}</th>
                  <th className="p-4">{t("finance.createdDate")}</th>
                  <th className="p-4 text-end">{t("finance.printAndDetails")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEntities.map((entity) => {
                  const num = entity.data?.invoiceNumber || entity.data?.invoice_number || `INV-${entity.id.slice(0, 6)}`;
                  const client = entity.data?.clientName || entity.data?.client_name || t("finance.unknownClient");
                  const comp = entity.data?.clientCompany || "";
                  const amt = entity.data?.amount !== undefined ? Number(entity.data.amount) : 0;
                  const due = entity.data?.dueDate || entity.data?.due_date || t("finance.notSpecified");

                  return (
                    <tr key={String(entity.id)} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-900 cursor-pointer" onClick={() => setSelectedInvoice(entity)}>{num}</td>
                      <td className="p-4 cursor-pointer" onClick={() => setSelectedInvoice(entity)}>
                        <p className="font-bold text-slate-800">{client}</p>
                        {comp && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3 text-brand" />{comp}</p>}
                      </td>
                      <td className="p-4 font-mono font-bold text-brand text-base cursor-pointer" onClick={() => setSelectedInvoice(entity)}>{formatCurrency(amt)}</td>
                      <td className="p-4 font-mono text-slate-600 cursor-pointer" onClick={() => setSelectedInvoice(entity)}>{due}</td>
                      <td className="p-4 cursor-pointer" onClick={() => setSelectedInvoice(entity)}>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(entity.data?.status)}`}>
                          {t(`finance.status.${entity.data?.status || "pending"}`, String(entity.data?.status || "pending"))}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 font-mono cursor-pointer" onClick={() => setSelectedInvoice(entity)}>
                        {new Date(String(entity.created_at)).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-end">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPrintInvoice(entity);
                            }}
                            className="p-1.5 bg-brand/10 text-brand hover:bg-brand hover:text-white rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                            title={t("finance.printPDF")}
                            aria-label={t("finance.printPDF")}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className={`flex h-full space-x-6 overflow-x-auto pb-4 ${isRtl ? "space-x-reverse" : ""}`}>
              {BASE_COLUMNS.map((col) => {
                const columnInvoices = filteredEntities.filter((e) => (e.data?.status || "pending") === col.id);
                return (
                  <div key={col.id} className="w-80 flex flex-col h-full bg-slate-50/80 rounded-2xl border border-slate-200/80 shrink-0 shadow-sm overflow-hidden">
                    <div className={`flex items-center justify-between p-4 border-b border-slate-200 bg-white ${col.bg}`}>
                      <h3 className="font-bold text-slate-800 text-sm">{t(col.titleKey, col.defaultTitle)}</h3>
                      <span className="text-xs font-bold bg-white text-slate-700 py-1 px-2.5 rounded-full border border-slate-200 shadow-2xs">
                        {columnInvoices.length}
                      </span>
                    </div>

                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? "bg-brand/5" : ""}`}
                        >
                          {columnInvoices.map((invoice, index) => {
                            const num = invoice.data?.invoiceNumber || invoice.data?.invoice_number || `INV-${invoice.id.slice(0, 6)}`;
                            const client = invoice.data?.clientName || invoice.data?.client_name || t("finance.unknownClient");
                            const comp = invoice.data?.clientCompany || "";
                            const amt = invoice.data?.amount !== undefined ? Number(invoice.data.amount) : 0;
                            const due = invoice.data?.dueDate || invoice.data?.due_date || t("finance.notSpecified");

                            return (
                              <Draggable key={invoice.id} draggableId={invoice.id} index={index}>
                                {(dragProvided) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-brand hover:shadow-md transition-all group relative"
                                    onClick={() => setSelectedInvoice(invoice)}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{num}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPrintInvoice(invoice);
                                        }}
                                        className="p-1 text-slate-400 hover:text-brand hover:bg-brand/10 rounded transition-colors"
                                        title={t("finance.printPDF")}
                                        aria-label={t("finance.printPDF")}
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="font-bold text-slate-900 text-sm mb-0.5">{client}</div>
                                    {comp && <div className="text-xs text-slate-500 font-medium flex items-center gap-1 mb-2"><Building2 className="w-3 h-3 text-brand" />{comp}</div>}
                                    <div className="text-xs text-slate-500 mb-3 font-mono">{t("finance.dueOn")} {due}</div>
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                      <span className="text-brand font-bold font-mono text-base">{formatCurrency(amt)}</span>
                                      <span className="text-[11px] text-slate-400 font-mono">{new Date(String(invoice.created_at)).toLocaleDateString()}</span>
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
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </div>

      {selectedInvoice && (
        <FinanceInvoiceDetailsModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {selectedPrintInvoice && (
        <InvoicePrintModal
          isOpen={!!selectedPrintInvoice}
          onClose={() => setSelectedPrintInvoice(null)}
          invoiceData={selectedPrintInvoice.data as SMEInvoiceData}
          invoiceId={selectedPrintInvoice.id}
        />
      )}
    </div>
  );
}
