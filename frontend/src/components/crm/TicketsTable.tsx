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
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [selectedTicketContext, setSelectedTicketContext] = useState<any>(null);
  const limit = 10;

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams({ limit: String(limit) });
      const cursor = cursorStack[page - 1];
      if (cursor) query.set("cursor", cursor);
      if (searchTerm.trim()) query.set("q", searchTerm.trim());
      if (statusFilter !== "all") query.set("status", statusFilter);
      const res = await apiGet<{data: any[], next_cursor?: string}>(`/crm/tickets?${query.toString()}`);

      if (res.data) {
        setTickets(res.data);
        setNextCursor(res.next_cursor || "");
      }
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchTickets(), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, cursorStack, searchTerm, statusFilter]);

  const resetCursor = () => {
    setPage(1);
    setCursorStack([""]);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">{t("crm.loadingTickets")}</div>;
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">{t("crm.ticketStatus.open")}</span>;
      case "in_progress":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-info/10 text-info">{t("crm.ticketStatus.in_progress")}</span>;
      case "resolved":
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success">{t("crm.ticketStatus.resolved")}</span>;
      case "closed":
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">{status || t("crm.ticketStatus.closed")}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "urgent":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-destructive/20 text-destructive">{t("crm.ticketPriority.urgent")}</span>;
      case "high":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-warning/20 text-warning">{t("crm.ticketPriority.high")}</span>;
      case "medium":
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-info/20 text-info">{t("crm.ticketPriority.medium")}</span>;
      case "low":
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold border border-border text-foreground">{priority || t("crm.ticketPriority.low")}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-hidden">
      {/* Header */}
	  <div className="flex-none border-b border-border bg-card px-4 py-5 sm:px-8 sm:py-6">
		<div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TicketIcon className="w-6 h-6 text-brand" />
              {t("crm.ticketsTitle")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("crm.ticketsSubtitle")}
            </p>
          </div>
		  <div className="flex flex-wrap gap-2 sm:gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("crm.searchTickets")}
				value={searchTerm}
				onChange={(event) => { setSearchTerm(event.target.value); resetCursor(); }}
				className="w-full min-w-0 rounded-md border border-border py-2 ps-4 pe-9 text-sm focus:border-brand focus:outline-none sm:w-64"
              />
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 text-muted-foreground">
              <Filter className="w-4 h-4" />
              <select
                value={statusFilter}
                onChange={(event) => { setStatusFilter(event.target.value); resetCursor(); }}
                className="bg-transparent py-2 text-sm text-foreground outline-none"
                aria-label={t("common.filter")}
              >
                <option value="all">{t("common.all")}</option>
                <option value="open">{t("crm.ticketStatus.open")}</option>
                <option value="in_progress">{t("crm.ticketStatus.in_progress")}</option>
                <option value="resolved">{t("crm.ticketStatus.resolved")}</option>
                <option value="closed">{t("crm.ticketStatus.closed")}</option>
              </select>
            </label>
            <Button
              onClick={() => { setSelectedTicketContext(null); setIsAgentOpen(true); }}
              className="bg-brand-light text-brand hover:bg-brand-light border border-brand/20 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {t("crm.aiAssistant")}
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("crm.newTicket")}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
	  <div className="flex-1 overflow-y-auto p-3 sm:p-8">
		<div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
		  <table className="min-w-[900px] w-full text-sm text-end">
            <thead className="bg-background text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">{t("crm.ticketNumber")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.subject")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.customer")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.priority")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.status")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.assignee")}</th>
                <th className="px-6 py-4 font-medium">{t("crm.date")}</th>
                <th className="px-6 py-4 font-medium text-start">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-background transition-colors group">
                  <td className="px-6 py-4 font-bold text-muted-foreground">{ticket.id.substring(0, 8)}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{ticket.display_value || ticket.data?.subject || t("crm.noSubject")}</td>
                  <td className="px-6 py-4 text-muted-foreground">{ticket.data?.customer_name || t("common.unspecified")}</td>
                  <td className="px-6 py-4">{getPriorityBadge(ticket.data?.priority)}</td>
                  <td className="px-6 py-4">{getStatusBadge(ticket.data?.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand-light flex items-center justify-center text-[10px] font-bold text-brand">
                        {(ticket.data?.assigned_team || t("common.unspecifiedShort"))[0]}
                      </div>
                      <span className="text-sm">{ticket.data?.assigned_team || ticket.data?.assignee || t("common.unspecified")}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{formatDate(new Date(ticket.created_at))}</td>
                  <td className="px-6 py-4 text-start">
                    <div className="flex items-center justify-end gap-2 opacity-90 hover:opacity-100 transition-opacity">
                      <button
                        title={t("crm.aiHelp")}
                        onClick={() => { setSelectedTicketContext(ticket); setIsAgentOpen(true); }}
                        className="p-1.5 text-brand hover:text-brand hover:bg-brand-light rounded-md transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button
                        title={t("crm.ticketChat")}
                        onClick={() => { setSelectedTicketContext(ticket); setIsChatDrawerOpen(true); }}
                        className="p-1.5 text-muted-foreground hover:text-brand hover:bg-brand-light rounded-md transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        title={t("crm.editTicket")}
                        onClick={() => { setSelectedTicketContext(ticket); setIsEditModalOpen(true); }}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    {t("crm.noTickets")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-6 py-4 bg-card border-t border-border">
            <span className="text-sm text-muted-foreground">
              {t("common.page")} {page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!nextCursor) return;
                  setCursorStack((current) => {
                    const next = current.slice(0, page);
                    next[page] = nextCursor;
                    return next;
                  });
                  setPage((current) => current + 1);
                }}
                disabled={!nextCursor}
              >
                {t("common.next")}
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
        title={selectedTicketContext ? `AI: ${t("crm.ticketNumber")}${selectedTicketContext.id?.substring(0,8)}` : t("crm.aiAssistant")}
        contextData={selectedTicketContext ? {
          purpose: "crm_ticket_assist",
          entity_ref: { definition_key: "crm_ticket", record_id: selectedTicketContext.id },
        } : undefined}
      />
      <EditTicketModal
		key={selectedTicketContext?.id || "no-ticket"}
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
