/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Ticket as TicketIcon, MoreVertical, MessageSquare, Filter, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/apiClient";
import AddTicketModal from "./AddTicketModal";
import AgentChatDrawer from "@/components/ai/AgentChatDrawer";
import EditTicketModal from "./EditTicketModal";
import TicketChatDrawer from "./TicketChatDrawer";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function TicketsTable() {
  const { t, formatDate } = useLocalization();
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [selectedTicketContext, setSelectedTicketContext] = useState<any>(null);
  const limit = 10;

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const res = await apiGet<{data: any[], total_pages: number}>(`/entities?workspace_id=${workspaceId}&type=ticket`, undefined, { page, limit });
      
      if (res.data) {
        setTickets(res.data);
        setTotalPages(res.total_pages || 1);
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-slate-500">{t("crm.loadingTickets", "Loading tickets...")}</div>;
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
      case "open":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{t("crm.ticketStatus.open", "Open")}</span>;
      case "in_progress":
      case "in_progress":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{t("crm.ticketStatus.in_progress", "In Progress")}</span>;
      case "resolved":
      case "resolved":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{t("crm.ticketStatus.resolved", "Resolved")}</span>;
      case "closed":
      case "closed":
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{status || t("crm.ticketStatus.closed", "Closed")}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "urgent":
      case "urgent":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-red-200 text-red-700">{t("crm.ticketPriority.urgent", "Urgent")}</span>;
      case "high":
      case "high":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-orange-200 text-orange-700">{t("crm.ticketPriority.high", "High")}</span>;
      case "medium":
      case "medium":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200 text-blue-700">{t("crm.ticketPriority.medium", "Medium")}</span>;
      case "low":
      case "low":
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200 text-slate-700">{priority || t("crm.ticketPriority.low", "Low")}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TicketIcon className="w-6 h-6 text-brand" />
              {t("crm.ticketsTitle", "Support Tickets")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("crm.ticketsSubtitle", "Manage and resolve customer inquiries and issues.")}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={t("crm.searchTickets", "Search tickets...")} 
                className="ps-4 pe-9 py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:border-brand"
              />
            </div>
            <Button variant="outline" className="text-slate-600 gap-2 border-slate-200">
              <Filter className="w-4 h-4" />
              {t("common.filter", "Filter")}
            </Button>
            <Button 
              onClick={() => { setSelectedTicketContext(null); setIsAgentOpen(true); }} 
              className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {t("crm.aiAssistant", "AI Assistant")}
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("crm.newTicket", "New Ticket")}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-end">
            <thead className="bg-[#f8fafc] text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">{t("crm.ticketNumber", "Ticket #")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.subject", "Subject")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.customer", "Customer")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.priority", "Priority")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.status", "Status")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.assignee", "Assignee")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.date", "Date")}</th>
                <th className="px-6 py-4 font-medium text-start">{t("common.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-[#f8fafc] transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-600">{ticket.id.substring(0, 8)}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{ticket.name || ticket.data?.subject || t("crm.noSubject", "No Subject")}</td>
                  <td className="px-6 py-4 text-slate-600">{ticket.data?.customer || t("common.unspecified", "Unspecified")}</td>
                  <td className="px-6 py-4">{getPriorityBadge(ticket.data?.priority)}</td>
                  <td className="px-6 py-4">{getStatusBadge(ticket.data?.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-bold text-brand">
                        {(ticket.data?.assignedTo || t("common.unspecifiedShort", "?"))[0]}
                      </div>
                      <span className="text-sm">{ticket.data?.assignedTo || t("common.unspecified", "Unspecified")}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(new Date(ticket.created_at))}</td>
                  <td className="px-6 py-4 text-start">
                    <div className="flex items-center justify-end gap-2 opacity-90 hover:opacity-100 transition-opacity">
                      <button 
                        title={t("crm.aiHelp", "AI Assistance")} 
                        onClick={() => { setSelectedTicketContext(ticket); setIsAgentOpen(true); }}
                        className="p-1.5 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button 
                        title={t("crm.ticketChat", "Ticket Chat")} 
                        onClick={() => { setSelectedTicketContext(ticket); setIsChatDrawerOpen(true); }}
                        className="p-1.5 text-slate-500 hover:text-brand hover:bg-brand-light rounded-md transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button 
                        title={t("crm.editTicket", "Edit Ticket")} 
                        onClick={() => { setSelectedTicketContext(ticket); setIsEditModalOpen(true); }}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    {t("crm.noTickets", "No tickets recorded.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-200">
            <span className="text-sm text-slate-500">
              {t("common.page", "Page")} {page} {t("common.of", "of")} {totalPages || 1}
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("common.previous", "Previous")}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("common.next", "Next")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AddTicketModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={fetchTickets} 
      />
      <AgentChatDrawer
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        agentType="crm"
        title={selectedTicketContext ? `AI: ${t("crm.ticketNumber", "Ticket #")}${selectedTicketContext.id?.substring(0,8)}` : t("crm.aiAssistant", "CRM AI Assistant")}
        contextData={selectedTicketContext}
      />
      <EditTicketModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchTickets}
        ticket={selectedTicketContext}
      />
      <TicketChatDrawer
        isOpen={isChatDrawerOpen}
        onClose={() => setIsChatDrawerOpen(false)}
        ticket={selectedTicketContext}
        onUpdate={fetchTickets}
      />
    </div>
  );
}
