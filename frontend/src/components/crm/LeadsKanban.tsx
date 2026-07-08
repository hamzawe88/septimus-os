/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Search, Building, Mail, Phone, Calendar, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddLeadModal from "./AddLeadModal";
import Customer360Modal from "./Customer360Modal";
import AddQuoteModal from "@/components/plugins/AddQuoteModal";
import { apiGet, apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

// A dummy type for a lead
interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost" | string;
  value: number;
  lastContact: string;
  score?: number;
  _originalEntity?: any;
}

const COLUMNS = [
  { id: "new", title: "New Lead", color: "bg-blue-100 border-blue-200 text-blue-800" },
  { id: "contacted", title: "Contacted", color: "bg-purple-100 border-purple-200 text-purple-800" },
  { id: "qualified", title: "Qualified", color: "bg-amber-100 border-amber-200 text-amber-800" },
  { id: "proposal", title: "Proposal", color: "bg-orange-100 border-orange-200 text-orange-800" },
  { id: "won", title: "Won", color: "bg-emerald-100 border-emerald-200 text-emerald-800" },
  { id: "lost", title: "Lost", color: "bg-rose-100 border-rose-200 text-rose-800" },
];

export default function LeadsKanban() {
  const { t } = useLocalization();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [quoteTargetLead, setQuoteTargetLead] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLeads = useCallback(async () => {
    await Promise.resolve();
    try {
      setIsLoading(true);
      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }
      const res = await apiGet<{data: any[]}>(`/entities?workspace_id=${workspaceId}&type=lead`, undefined, { limit: 500 });
      if (res.data) {
        const mappedLeads: Lead[] = res.data.map((entity: any) => ({
          id: entity.id,
          name: entity.name || entity.data?.name || t("common.noName", "No Name"),
          company: entity.data?.company || t("common.unspecified", "Unspecified"),
          email: entity.data?.email || t("common.unspecified", "Unspecified"),
          phone: entity.data?.phone || t("common.unspecified", "Unspecified"),
          status: entity.data?.status || "new",
          value: parseFloat(entity.data?.value || 0),
          lastContact: entity.data?.lastContact || new Date(entity.created_at).toLocaleDateString('en-CA'),
          score: entity.data?.score || 0,
          _originalEntity: entity
        }));
        setLeads(mappedLeads);
      }
    } catch (err) {
      console.error("Failed to fetch leads", err);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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

  const handleDrop = async (e: React.DragEvent, statusId: Lead["status"]) => {
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
      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }
      const entity = leadToUpdate._originalEntity;
      if (entity) {
        const updatedData = { ...(entity.data as any), status: statusId };
        await apiPut(`/entities/${leadId}?workspace_id=${workspaceId}`, {
          data: updatedData
        });
      }
    } catch (err) {
      console.error("Failed to update lead status", err);
      // Revert could be implemented here
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-slate-500">{t("crm.loadingLeads", "Loading leads...")}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {t("crm.pipelineTitle", "Leads Pipeline")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("crm.pipelineSubtitle", "Manage leads and move them across sales stages easily.")}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={t("crm.searchLeads", "Search leads...")} 
                className="ps-4 pe-9 py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:border-brand"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" className="text-slate-600 gap-2 border-slate-200">
              <Filter className="w-4 h-4" />
              {t("common.filter", "Filter")}
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("crm.addLead", "Add Lead")}
            </Button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6">
        {COLUMNS.map(col => {
          const colTitleMap: Record<string, string> = {
            new: t("crm.columnNew", "New Lead 🆕"),
            contacted: t("crm.columnContacted", "Contacted 📞"),
            qualified: t("crm.columnQualified", "Qualified ⭐"),
            proposal: t("crm.columnProposal", "Proposal 📑"),
            won: t("crm.columnClosedWon", "Closed Won 🎉"),
            lost: t("crm.columnClosedLost", "Closed Lost ❌"),
          };
          const title = colTitleMap[col.id] || col.title;
          const colLeads = leads.filter(l => l.status === col.id && (
            l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            l.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.email.toLowerCase().includes(searchQuery.toLowerCase())
          ));
          const colValue = colLeads.reduce((acc, l) => acc + l.value, 0);

          return (
            <div 
              key={col.id} 
              className="flex flex-col w-80 flex-shrink-0 bg-slate-100 rounded-xl border border-slate-200"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id as Lead["status"])}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md border ${col.color}`}>
                    {title}
                  </span>
                  <span className="text-slate-500 text-sm font-medium">{colLeads.length}</span>
                </div>
                <div className="text-slate-600 text-sm font-semibold">
                  ${colValue.toLocaleString()}
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
                    className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow group relative"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-slate-800 flex items-center gap-1">
                        {lead.name}
                        {lead.score && lead.score > 80 && (
                          <span title="Hot Lead"><Sparkles className="w-3 h-3 text-orange-500" /></span>
                        )}
                      </h4>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        ${lead.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-3">
                      <Building className="w-3 h-3" />
                      {lead.company}
                    </div>
                    <div className="space-y-1.5 mb-4">
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                        <Phone className="w-3 h-3" />
                        {lead.phone}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Calendar className="w-3 h-3" />
                        {t("crm.lastContact", "Last contact:")} {lead.lastContact}
                      </div>
                      <button
                        type="button"
                        aria-label="Generate quotation"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuoteTargetLead(lead._originalEntity);
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors flex items-center shadow-2xs"
                      >
                        {t("crm.quote", "📑 Quote")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
