import React, { useState, useEffect } from "react";
import { DollarSign, Briefcase } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface CRMLeadEntity {
  data?: { status?: string; value?: number | string };
}

export default function CRMDealsWidget() {
  const { t, formatCurrency } = useLocalization();

  const [activeDeals, setActiveDeals] = useState(0);
  const [totalPipeline, setTotalPipeline] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchDeals = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/entities?module=crm&type=lead`);
        if (!res.ok) throw new Error("Failed to fetch leads");
        const data = await res.json();
        if (isMounted) {
          const entities: CRMLeadEntity[] = data.entities || [];
          const active = entities.filter((e) => e.data?.status !== "closed_won" && e.data?.status !== "closed_lost");
          setActiveDeals(active.length);
          const pipelineValue = active.reduce((sum: number, e) => sum + Number(e.data?.value || 0), 0);
          setTotalPipeline(pipelineValue);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetchDeals();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="flex flex-col space-y-4 h-full justify-between">
      <div className="flex flex-col gap-4 flex-1">
        <div 
          className="group hover:bg-slate-50 border p-4 rounded-2xl flex flex-col justify-between transition-all duration-300 dark:bg-slate-800 bg-blue-50 dark:border-slate-700 border-blue-200"
        >
          <div className="flex items-center justify-between mb-3">
            <div 
              className="w-10 h-10 bg-white shadow-sm flex items-center justify-center rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 text-[var(--primary-hex)]"
            >
              <Briefcase className="w-5 h-5" />
            </div>
            <p 
              className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md text-[var(--primary-hex)] dark:bg-slate-800 bg-blue-50"
            >
              {t("dashboard.openDeals", "Open")}
            </p>
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight">{loading ? "..." : activeDeals}</h3>
            <p className="text-xs font-semibold text-slate-500 mt-1">{t("dashboard.activeDeals", "Active Deals")}</p>
          </div>
        </div>
        
        <div 
          className="group hover:bg-slate-50 border p-4 rounded-2xl flex flex-col justify-between transition-all duration-300 dark:bg-slate-800 bg-blue-50 dark:border-slate-700 border-blue-200"
        >
          <div className="flex items-center justify-between mb-3">
            <div 
              className="w-10 h-10 bg-white shadow-sm flex items-center justify-center rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 text-[var(--primary-hex)]"
            >
              <DollarSign className="w-5 h-5" />
            </div>
            <p 
              className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md text-[var(--primary-hex)] dark:bg-slate-800 bg-blue-50"
            >
              {t("dashboard.value", "Value")}
            </p>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{loading ? "..." : formatCurrency(totalPipeline)}</h3>
            <p className="text-xs font-semibold text-slate-500 mt-1">{t("dashboard.totalPipeline", "Total Pipeline")}</p>
          </div>
        </div>
      </div>
      
      <div className="mt-2">
        <h4 className="text-[11px] font-bold text-slate-400 mb-3 uppercase tracking-widest px-1">{t("dashboard.recentActivity", "Recent Activity")}</h4>
        <ul className="space-y-2">
          <li className="flex items-start text-sm text-slate-600 bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm p-3 rounded-xl transition-all">
            <span className="w-2 h-2 rounded-full mt-1.5 ltr:me-3 rtl:ms-3 flex-shrink-0 bg-[var(--primary-hex)]"></span>
            <p className="leading-snug"><strong className="text-slate-800">Acme Corp</strong> {t("dashboard.activityMoved", "moved to Negotiation phase.")}</p>
          </li>
          <li className="flex items-start text-sm text-slate-600 bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm p-3 rounded-xl transition-all">
            <span className="w-2 h-2 rounded-full mt-1.5 ltr:me-3 rtl:ms-3 flex-shrink-0 bg-[var(--primary-hex)]"></span>
            <p className="leading-snug"><strong className="text-slate-800">Global Tech</strong> {t("dashboard.activitySent", "sent a proposal request.")}</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
