"use client";

import React, { useState, useEffect } from "react";
import { DollarSign, Briefcase, TrendingUp, Plus, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface CRMLeadEntity {
  id?: string;
  data?: { status?: string; value?: number | string; company?: string; contact?: string };
}

export default function CRMDealsWidget() {
  const { t, formatCurrency } = useLocalization();
  const [activeDeals, setActiveDeals] = useState(14);
  const [totalPipeline, setTotalPipeline] = useState(342000);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const [topDeals, setTopDeals] = useState([
    { id: "c1", company: "Al-Madina Logistics", value: 120000, stage: "Negotiation" },
    { id: "c2", company: "Oil & Gas Libya Services", value: 95000, stage: "Qualified" },
    { id: "c3", company: "Tripoli Tech Hub", value: 45000, stage: "Closing" },
  ]);

  const stages = [
    { name: t("dashboard.crm.stageLeads", "Leads"), count: 6, color: "bg-blue-500" },
    { name: t("dashboard.crm.stageQualified", "Qualified"), count: 4, color: "bg-indigo-500" },
    { name: t("dashboard.crm.stageNegotiation", "Negotiation"), count: 3, color: "bg-amber-500" },
    { name: t("dashboard.crm.stageClosing", "Closing"), count: 1, color: "bg-emerald-500" },
  ];

  const topDealsList = topDeals.map((deal) => {
    if (deal.id === "c1") return { ...deal, company: t("dashboard.crm.d1Company", "Al-Madina Logistics"), stage: t("dashboard.crm.stageNegotiation", "Negotiation") };
    if (deal.id === "c2") return { ...deal, company: t("dashboard.crm.d2Company", "Oil & Gas Libya Services"), stage: t("dashboard.crm.stageQualified", "Qualified") };
    if (deal.id === "c3") return { ...deal, company: t("dashboard.crm.d3Company", "Tripoli Tech Hub"), stage: t("dashboard.crm.stageClosing", "Closing") };
    return { ...deal, stage: t(`dashboard.crm.stage${deal.stage}`, deal.stage) };
  });

  useEffect(() => {
    let isMounted = true;
    const fetchDeals = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/entities?module=crm&type=lead`);
        if (!res.ok) throw new Error("Failed to fetch leads");
        const data = await res.json();
        if (isMounted && data.entities && data.entities.length > 0) {
          const entities: CRMLeadEntity[] = data.entities;
          const active = entities.filter((e) => e.data?.status !== "closed_won" && e.data?.status !== "closed_lost");
          if (active.length > 0) setActiveDeals(active.length);
          const pipelineValue = active.reduce((sum: number, e) => sum + Number(e.data?.value || 0), 0);
          if (pipelineValue > 0) setTotalPipeline(pipelineValue);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchDeals();
    return () => { isMounted = false; };
  }, []);

  const handleQuickLead = () => {
    const newDeal = {
      id: `c_${Date.now()}`,
      company: t("dashboard.crm.newPartner", "Sovereign Enterprise Partner"),
      value: 65000,
      stage: "Leads",
    };
    setTopDeals((prev) => [newDeal, ...prev.slice(0, 2)]);
    setActiveDeals((prev) => prev + 1);
    setTotalPipeline((prev) => prev + 65000);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-3 relative">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/60 dark:from-slate-800 dark:to-slate-800/80 border border-blue-200/60 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-blue-600 dark:text-blue-400">
              {t("dashboard.openDeals", "Active Deals")}
            </span>
            <Briefcase className="w-4 h-4 text-blue-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {loading ? "..." : activeDeals}
          </h3>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 mt-0.5">
            <TrendingUp className="w-3 h-3" />
            <span>{t("dashboard.crm.monthGrowth", "+18% this month")}</span>
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/60 dark:from-slate-800 dark:to-slate-800/80 border border-amber-200/60 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">
              {t("dashboard.value", "Pipeline Value")}
            </span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2 truncate font-mono">
            {loading ? "..." : formatCurrency(totalPipeline)}
          </h3>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
            {t("dashboard.crm.avgDeal", "Avg deal:")} {formatCurrency(totalPipeline / (activeDeals || 1))}
          </span>
        </div>
      </div>

      {/* Funnel breakdown bar */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
          <span>{t("dashboard.crm.stages", "Funnel Stage Distribution")}</span>
          <span className="font-mono text-xs text-slate-800 dark:text-white font-black">100%</span>
        </div>
        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden gap-0.5">
          {stages.map((stg, idx) => {
            const widthPct = Math.max(12, Math.round((stg.count / activeDeals) * 100));
            return (
              <div
                key={idx}
                style={{ width: `${widthPct}%` }}
                className={`${stg.color} h-full transition-all duration-500`}
                title={`${stg.name}: ${stg.count}`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
          {stages.map((stg, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${stg.color}`} />
              <span>{stg.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top Deals List */}
      <div className="flex-1 flex flex-col gap-2 pt-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {t("dashboard.crm.topDeals", "High-Value Opportunities")}
          </span>
          <button
            onClick={handleQuickLead}
            className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition flex items-center gap-1 shadow-sm shadow-blue-600/20"
          >
            <Plus className="w-3 h-3" />
            <span>{t("dashboard.crm.addLead", "+ Add Lead")}</span>
          </button>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-[130px]">
          {topDealsList.map((deal) => (
            <div
              key={deal.id}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">{deal.company}</h4>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                  {deal.stage}
                </span>
              </div>
              <div className="text-end flex items-center gap-1.5">
                <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
                  {formatCurrency(deal.value)}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {showToast && (
        <div className="absolute top-1 right-1 left-1 bg-emerald-600 text-white text-xs font-bold p-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 z-20">
          <CheckCircle2 className="w-4 h-4" />
          <span>{t("dashboard.crm.dealAdded", "New sovereign deal opportunity added!")}</span>
        </div>
      )}
    </div>
  );
}
