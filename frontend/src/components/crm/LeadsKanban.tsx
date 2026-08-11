/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Search, Building, Mail, Phone, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddLeadModal from "./AddLeadModal";
import Customer360Modal from "./Customer360Modal";
import AddQuoteModal from "@/components/plugins/AddQuoteModal";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { CRM_STAGE_LABEL_KEYS, CRMStage, normalizeCRMStage } from "@/lib/crm";

interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: CRMStage;
  value: number;
  lastContact: string;
  score?: number;
  _originalEntity?: any;
}

const COLUMNS: Array<{ id: CRMStage; color: string }> = [
  { id: "new", color: "bg-info/10 border-info/20 text-info" },
  { id: "contacted", color: "bg-brand-light border-brand/20 text-brand" },
  { id: "qualified", color: "bg-warning/10 border-warning/20 text-warning" },
  { id: "proposal", color: "bg-warning/10 border-warning/20 text-warning" },
  { id: "negotiation", color: "bg-warning/10 border-warning/20 text-warning" },
  { id: "closed_won", color: "bg-success/10 border-success/20 text-success" },
  { id: "closed_lost", color: "bg-destructive/10 border-destructive/20 text-destructive" },
];

export default function LeadsKanban() {
  const { t, formatCurrency, formatDate } = useLocalization();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [quoteTargetLead, setQuoteTargetLead] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const mapOpportunities = useCallback((records: any[]): Lead[] => records.map((entity: any) => ({
    id: entity.id,
    name: entity.display_value || entity.data?.title || t("common.noName"),
    company: entity.account?.data?.name || t("common.unspecified"),
    email: entity.contact?.data?.email || entity.account?.data?.email || t("common.unspecified"),
    phone: entity.contact?.data?.phone || entity.account?.data?.phone || t("common.unspecified"),
    status: normalizeCRMStage(entity.data?.stage),
    value: parseFloat(entity.data?.value || 0),
    lastContact: entity.data?.lastContact || formatDate(entity.created_at),
    score: entity.data?.probability,
    _originalEntity: {
      ...entity,
      data: {
        ...entity.data,
        company: entity.account?.data?.name,
        contact_person: entity.contact?.data?.full_name,
        email: entity.contact?.data?.email || entity.account?.data?.email,
      },
    },
  })), [formatDate, t]);

  const fetchLeads = useCallback(async () => {
    await Promise.resolve();
    try {
      setIsLoading(true);
      const res = await apiGet<{data: any[]; next_cursor?: string}>("/crm/opportunities", undefined, { limit: 100 });
      if (res.data) {
		setLeads(mapOpportunities(res.data));
		setNextCursor(res.next_cursor || "");
      }
    } catch (err) {
      console.error("Failed to fetch leads", err);
    } finally {
      setIsLoading(false);
    }
  }, [mapOpportunities]);

  const fetchMoreLeads = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const query = new URLSearchParams({ limit: "100", cursor: nextCursor });
      const res = await apiGet<{data: any[]; next_cursor?: string}>(`/crm/opportunities?${query.toString()}`);
      const incoming = mapOpportunities(res.data || []);
      setLeads((current) => {
        const known = new Set(current.map((lead) => lead.id));
        return [...current, ...incoming.filter((lead) => !known.has(lead.id))];
      });
      setNextCursor(res.next_cursor || "");
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    fetchLeads();
  }, [fetchLeads]);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // allow drop
  };

  const handleDrop = async (e: React.DragEvent, statusId: CRMStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (!leadId) return;

    const leadToUpdate = leads.find(l => l.id === leadId);
    if (!leadToUpdate || leadToUpdate.status === statusId) return;

    // Optimistic update
    setLeads(prev => prev.map(lead => {
      if (lead.id === leadId) {
        return { ...lead, status: statusId };
      }
      return lead;
    }));

    // Backend update
    try {
      const entity = leadToUpdate._originalEntity;
      if (entity) {
        const response = await apiPatch<{ entity: any }>(`/crm/opportunities/${leadId}/stage`, {
          stage: statusId,
          expected_version: Number(entity.record_version || 1),
        });
        setLeads((current) => current.map((lead) => (
          lead.id === leadId
            ? { ...lead, status: statusId, _originalEntity: response.entity }
            : lead
        )));
      }
    } catch (err) {
      console.error("Failed to update lead status", err);
      setLeads((current) => current.map((lead) => (
        lead.id === leadId ? { ...lead, status: leadToUpdate.status } : lead
      )));
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">{t("crm.loadingLeads")}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-hidden">
      {/* Header */}
	  <div className="flex-none border-b border-border bg-card px-4 py-5 sm:px-8 sm:py-6">
		<div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              {t("crm.pipelineTitle")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("crm.pipelineSubtitle")}
            </p>
          </div>
		  <div className="flex flex-wrap gap-2 sm:gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("crm.searchLeads")}
				className="w-full min-w-0 rounded-md border border-border py-2 ps-4 pe-9 text-sm focus:border-brand focus:outline-none sm:w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("crm.addLead")}
            </Button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6">
        {COLUMNS.map(col => {
          const title = t(CRM_STAGE_LABEL_KEYS[col.id]);
          const colLeads = leads.filter(l => l.status === col.id && (
            l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.email.toLowerCase().includes(searchQuery.toLowerCase())
          ));
          const colValue = colLeads.reduce((acc, l) => acc + l.value, 0);

          return (
            <div
              key={col.id}
              className="flex flex-col w-80 flex-shrink-0 bg-muted rounded-xl border border-border"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md border ${col.color}`}>
                    {title}
                  </span>
                  <span className="text-muted-foreground text-sm font-medium">{colLeads.length}</span>
                </div>
                <div className="text-muted-foreground text-sm font-semibold">
                  {formatCurrency(colValue)}
                </div>
              </div>

              {/* Column Cards */}
              <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3">
                {colLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onClick={() => setSelectedLead(lead)}
                    className="bg-card p-4 rounded-lg border border-border shadow-sm cursor-pointer hover:shadow-md transition-shadow group relative"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-foreground flex items-center gap-1">
                        {lead.name}
                        {lead.score && lead.score > 80 && (
                          <span title="Hot Lead"><Sparkles className="w-3 h-3 text-warning" /></span>
                        )}
                      </h4>
                      <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded">
                        {formatCurrency(lead.value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
                      <Building className="w-3 h-3" />
                      {lead.company}
                    </div>
                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Calendar className="w-3 h-3" />
                        {t("crm.lastContact")} {lead.lastContact}
                      </div>
                      <button
                        type="button"
                        aria-label="Generate quotation"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuoteTargetLead(lead._originalEntity);
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand-light text-brand hover:bg-brand-light border border-brand/20 transition-colors flex items-center shadow-2xs"
                      >
                        {t("crm.quote")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <div className="flex-none border-t border-border bg-card p-3 text-center">
          <Button variant="outline" onClick={fetchMoreLeads} disabled={isLoadingMore}>
            {isLoadingMore ? t("common.loading") : t("schemaBuilder.records.loadMore")}
          </Button>
        </div>
      )}

      {selectedLead && (
        <Customer360Modal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {quoteTargetLead && (
        <AddQuoteModal
          lead={quoteTargetLead}
          onClose={() => setQuoteTargetLead(null)}
          onSuccess={() => {
            setQuoteTargetLead(null);
            fetchLeads();
          }}
        />
      )}
      <AddLeadModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={fetchLeads} />
    </div>
  );
}
