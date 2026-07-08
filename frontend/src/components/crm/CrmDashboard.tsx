/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Users, Ticket, DollarSign, TrendingUp, Search, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddCustomerModal from "./AddCustomerModal";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function CrmDashboard() {
  const { t, isRtl } = useLocalization();
  const [isLoading, setIsLoading] = useState(true);
  const [leads, setLeads] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stats, setStats] = useState({
    totalLeads: 0,
    newTickets: 0,
    conversionRate: 0,
    revenue: 0,
  });

  const [periodFilter, setPeriodFilter] = useState("this_month");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [revenueData, setRevenueData] = useState([
    { month: "Jan", revenue: 0 },
    { month: "Feb", revenue: 0 },
    { month: "Mar", revenue: 0 },
    { month: "Apr", revenue: 0 },
    { month: "May", revenue: 0 },
    { month: "Jun", revenue: 0 },
  ]);

  const [leadsSourceData, setLeadsSourceData] = useState([
    { name: "Organic", value: 1, color: "#dfb2e5" },
    { name: "Direct", value: 1, color: "#3b82f6" },
    { name: "Referral", value: 1, color: "#10b981" },
    { name: "إعلانات", value: 1, color: "#f59e0b" },
  ]);

  const fetchCrmData = useCallback(async () => {
    await Promise.resolve();
    try {
      setIsLoading(true);
      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }
      
      // Fetch CRM Leads
      const leadsRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=lead&limit=200`) as any;
      let fetchedLeads: any[] = [];
      if (leadsRes && Array.isArray(leadsRes.data)) {
        let filteredLeads = leadsRes.data;

        // Apply filters
        const now = new Date();
        filteredLeads = filteredLeads.filter((lead: any) => {
          let keep = true;
          
          // Source filter
          if (sourceFilter !== "all" && lead.data?.source !== sourceFilter) {
            keep = false;
          }

          // Period filter
          if (keep && lead.created_at) {
            const createdAt = new Date(lead.created_at);
            if (periodFilter === "this_month") {
              if (createdAt.getMonth() !== now.getMonth() || createdAt.getFullYear() !== now.getFullYear()) keep = false;
            } else if (periodFilter === "هذا الربع") {
              const currentQuarter = Math.floor(now.getMonth() / 3);
              const leadQuarter = Math.floor(createdAt.getMonth() / 3);
              if (leadQuarter !== currentQuarter || createdAt.getFullYear() !== now.getFullYear()) keep = false;
            } else if (periodFilter === "هذا العام") {
              if (createdAt.getFullYear() !== now.getFullYear()) keep = false;
            }
          }

          return keep;
        });

        fetchedLeads = filteredLeads;
        setLeads(fetchedLeads.slice(0, 5)); // Last 5 leads
      }

      // Calculate revenue from Won Leads
      let totalRevenue = 0;
      let wonDeals = 0;
      fetchedLeads.forEach((lead: any) => {
        if (lead?.data?.status === "won" || lead?.data?.status === "Won" || lead?.data?.status === "تم البيع") {
          const amount = parseFloat(lead?.data?.value || lead?.data?.amount || 0);
          if (!isNaN(amount)) totalRevenue += amount;
          wonDeals++;
        }
      });

      // Fetch CRM Tickets (for new tickets)
      const ticketsRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=ticket`) as any;
      let newTicketsCount = 0;
      if (ticketsRes && Array.isArray(ticketsRes.data)) {
        newTicketsCount = ticketsRes.data.filter((t: any) => t?.data?.status === "New" || t?.data?.status === "Open" || t?.data?.status === "مفتوحة").length;
      }

      const totalLeadsCount = fetchedLeads.length;
      const convRate = totalLeadsCount > 0 ? ((wonDeals / totalLeadsCount) * 100).toFixed(1) : 0;

      setStats({
        totalLeads: totalLeadsCount,
        newTickets: newTicketsCount,
        conversionRate: Number(convRate),
        revenue: totalRevenue,
      });

      // Basic source aggregation
      const sources: Record<string, number> = { "Organic": 0, "Direct": 0, "Referral": 0, "إعلانات": 0 };
      fetchedLeads.forEach((lead: any) => {
        const s = lead?.data?.source || "Direct";
        if (sources[s] !== undefined) {
          sources[s]++;
        } else {
          sources["Direct"] = (sources["Direct"] || 0) + 1;
        }
      });

      setLeadsSourceData([
        { name: "Organic", value: sources["Organic"] || 1, color: "#dfb2e5" },
        { name: "Direct", value: sources["Direct"] || 1, color: "#3b82f6" },
        { name: "Referral", value: sources["Referral"] || 1, color: "#10b981" },
        { name: "إعلانات", value: sources["إعلانات"] || 1, color: "#f59e0b" },
      ]);

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load CRM data", err);
      setIsLoading(false);
    }
  }, [periodFilter, sourceFilter]);

  useEffect(() => {
    // eslint-disable-next-line
    fetchCrmData();
  }, [fetchCrmData]);

  if (isLoading && leads.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-500">{t("crm.loading")}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-brand" />
              {t("crm.title")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("crm.subtitle")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
              <Filter className="w-4 h-4 text-slate-500" />
              <select 
                value={periodFilter} 
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-transparent text-sm text-slate-700 focus:outline-none cursor-pointer"
                title={t("crm.filters.periodTitle")}
                aria-label={t("crm.filters.periodTitle")}
              >
                <option value="this_month">{t("crm.filters.thisMonth")}</option>
                <option value="هذا الربع">{t("crm.filters.thisQuarter")}</option>
                <option value="هذا العام">{t("crm.filters.thisYear")}</option>
              </select>
              <div className="w-px h-4 bg-slate-300 mx-1"></div>
              <select 
                value={sourceFilter} 
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-transparent text-sm text-slate-700 focus:outline-none cursor-pointer"
                title={t("crm.filters.sourceTitle")}
                aria-label={t("crm.filters.sourceTitle")}
              >
                <option value="all">{t("crm.filters.allSources")}</option>
                <option value="Organic">{t("crm.filters.organic")}</option>
                <option value="Referral">{t("crm.filters.referral")}</option>
                <option value="إعلانات">{t("crm.filters.ads")}</option>
              </select>
            </div>
            
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={t("crm.searchPlaceholder")}
                className="ps-4 pe-9 py-2 border border-slate-200 rounded-md text-sm w-full sm:w-64 focus:outline-none focus:border-brand"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("crm.addCustomer")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title={t("crm.stats.totalCustomers")} value={stats.totalLeads.toString()} icon={<Users className="w-6 h-6 text-blue-500" />} />
          <StatCard title={t("crm.stats.revenue")} value={`$${stats.revenue.toLocaleString()}`} icon={<DollarSign className="w-6 h-6 text-emerald-500" />} />
          <StatCard title={t("crm.stats.conversionRate")} value={`${stats.conversionRate}%`} icon={<TrendingUp className="w-6 h-6 text-brand" />} />
          <StatCard title={t("crm.stats.newTickets")} value={stats.newTickets.toString()} icon={<Ticket className="w-6 h-6 text-orange-500" />} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Revenue Trend */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{t("crm.charts.revenueGrowth")}</h3>
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData.map(d => ({ ...d, month: t(`crm.months.${d.month.toLowerCase()}`, d.month) }))} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} reversed={isRtl} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} orientation={isRtl ? "right" : "left"} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="revenue" name={t("crm.stats.revenue")} stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lead Sources Pie */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{t("crm.charts.customerSources")}</h3>
            <div className="h-72 w-full flex items-center justify-center" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsSourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {leadsSourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Leads Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">{t("crm.recentLeads")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-end">
              <thead className="bg-[#f8fafc] text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">{t("crm.table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.company")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.status")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.source")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {(() => {
                  const filteredLeads = leads.filter((row: any) => {
                    const leadName = String(row?.name || row?.data?.name || row?.data?.title || "بدون اسم");
                    const companyName = String(row?.data?.company || "");
                    const matchesSearch = leadName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                          companyName.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesSource = sourceFilter === "all" || row?.data?.source === sourceFilter;
                    return matchesSearch && matchesSource;
                  });

                  if (filteredLeads.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          {t("crm.noLeads")}
                        </td>
                      </tr>
                    );
                  }

                  return filteredLeads.map((row: any, index: number) => {
                    const leadName = String(row?.name || row?.data?.name || row?.data?.title || "بدون اسم");
                    const status = row?.data?.status || 'جديد';
                    const company = row?.data?.company || '-';
                    const source = row?.data?.source || '-';
                    return (
                      <tr key={row?.id || `lead-${index}`} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{leadName}</td>
                        <td className="px-6 py-4">{company}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{source}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <AddCustomerModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={fetchCrmData} />
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
      <div className="p-3 bg-slate-50 rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800 mt-1">{value}</h3>
      </div>
    </div>
  );
}
