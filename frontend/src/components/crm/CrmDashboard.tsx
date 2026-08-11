/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Users, Ticket, DollarSign, TrendingUp, Search, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddCustomerModal from "./AddCustomerModal";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { CRM_STAGE_LABEL_KEYS, normalizeCRMStage } from "@/lib/crm";
import { LoadingState } from "@/components/ui/loading-state";

export default function CrmDashboard() {
  const { t, language, formatCurrency, baseCurrency } = useLocalization();
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

  const [revenueData, setRevenueData] = useState([
    { month: "", revenue: 0 },
  ]);

  const [leadsSourceData, setLeadsSourceData] = useState([
    { name: t("crm.filters.organic"), value: 0, color: "var(--primary)" },
    { name: t("crm.filters.direct"), value: 0, color: "var(--info)" },
    { name: t("crm.filters.referral"), value: 0, color: "var(--success)" },
    { name: t("crm.filters.ads"), value: 0, color: "var(--warning)" },
  ]);

  const fetchCrmData = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams({ period: periodFilter, source: sourceFilter, currency: baseCurrency });
      const dashboard = await apiGet<any>(`/crm/dashboard?${query.toString()}`);
      const metrics = dashboard?.stats || {};
      setStats({
        totalLeads: Number(metrics.total_opportunities || 0),
        newTickets: Number(metrics.open_tickets || 0),
        conversionRate: Number(metrics.conversion_rate || 0),
        revenue: Number(metrics.revenue || 0),
      });
      setLeads(Array.isArray(dashboard?.recent_opportunities) ? dashboard.recent_opportunities : []);
      const sources = dashboard?.sources || {};
      setLeadsSourceData([
        { name: t("crm.filters.organic"), value: Number(sources.organic || 0), color: "var(--primary)" },
        { name: t("crm.filters.direct"), value: Number(sources.direct || 0), color: "var(--info)" },
        { name: t("crm.filters.referral"), value: Number(sources.referral || 0), color: "var(--success)" },
        { name: t("crm.filters.ads"), value: Number(sources.ads || 0), color: "var(--warning)" },
      ]);
      const monthFormatter = new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", { month: "short" });
      const monthlyRevenue = Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        return {
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
          month: monthFormatter.format(date),
          revenue: 0,
        };
      });
      (dashboard?.monthly_revenue || []).forEach((entry: { month: string; revenue: number }) => {
        const bucket = monthlyRevenue.find((candidate) => candidate.key === entry.month);
        if (bucket) bucket.revenue = Number(entry.revenue || 0);
      });
      setRevenueData(monthlyRevenue.map(({ month, revenue }) => ({ month, revenue })));
    } catch (err) {
      console.error("Failed to load CRM data", err);
    } finally {
      setIsLoading(false);
    }
  }, [baseCurrency, language, periodFilter, sourceFilter, t]);

  useEffect(() => {
    // eslint-disable-next-line
    fetchCrmData();
  }, [fetchCrmData]);

  if (isLoading) {
    return (
      <LoadingState />
    );
  }


  return (
    <div className="flex flex-col h-full bg-background w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-border bg-card">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-brand" />
              {t("crm.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("crm.subtitle")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md border border-border">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
                title={t("crm.filters.periodTitle")}
                aria-label={t("crm.filters.periodTitle")}
              >
                <option value="this_month">{t("crm.filters.thisMonth")}</option>
                <option value="this_quarter">{t("crm.filters.thisQuarter")}</option>
                <option value="this_year">{t("crm.filters.thisYear")}</option>
              </select>
              <div className="w-px h-4 bg-muted mx-1"></div>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-transparent text-sm text-foreground focus:outline-none cursor-pointer"
                title={t("crm.filters.sourceTitle")}
                aria-label={t("crm.filters.sourceTitle")}
              >
                <option value="all">{t("crm.filters.allSources")}</option>
                <option value="organic">{t("crm.filters.organic")}</option>
                <option value="direct">{t("crm.filters.direct")}</option>
                <option value="referral">{t("crm.filters.referral")}</option>
                <option value="ads">{t("crm.filters.ads")}</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("crm.searchPlaceholder")}
                className="ps-4 pe-9 py-2 border border-border rounded-md text-sm w-full sm:w-64 focus:outline-none focus:border-brand"
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
          <StatCard title={t("crm.stats.totalLeads")} value={stats.totalLeads.toString()} icon={<Users className="w-6 h-6 text-info" />} />
          <StatCard title={t("crm.stats.revenue")} value={formatCurrency(stats.revenue)} icon={<DollarSign className="w-6 h-6 text-success" />} />
          <StatCard title={t("crm.stats.conversionRate")} value={`${stats.conversionRate}%`} icon={<TrendingUp className="w-6 h-6 text-brand" />} />
          <StatCard title={t("crm.stats.newTickets")} value={stats.newTickets.toString()} icon={<Ticket className="w-6 h-6 text-warning" />} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Revenue Trend */}
          <div className="bg-card p-6 rounded-xl border border-border shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold text-foreground mb-6">{t("crm.charts.revenueGrowth")}</h3>
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)'}} reversed={language === "ar"} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--muted-foreground)'}} orientation={language === "ar" ? "right" : "left"} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="revenue" name={t("crm.stats.revenue")} stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lead Sources Pie */}
          <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-6">{t("crm.charts.customerSources")}</h3>
            <div className="h-72 w-full flex items-center justify-center" dir="ltr">
              {leadsSourceData.some((entry) => entry.value > 0) ? <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer> : <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
            </div>
          </div>
        </div>

        {/* Recent Leads Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">{t("crm.recentLeads")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-end">
              <thead className="bg-background text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">{t("crm.table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.company")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.status")}</th>
                  <th className="px-6 py-3 font-medium">{t("crm.table.source")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {(() => {
                  const filteredLeads = leads.filter((row: any) => {
                    const leadName = String(row?.name || row?.data?.name || row?.data?.title || t("common.noName"));
                    const companyName = String(row?.data?.company || "");
                    const matchesSearch = leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                          companyName.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesSource = sourceFilter === "all" || row?.data?.source === sourceFilter;
                    return matchesSearch && matchesSource;
                  });

                  if (filteredLeads.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                          {t("crm.noLeads")}
                        </td>
                      </tr>
                    );
                  }

                  return filteredLeads.slice(0, 5).map((row: any, index: number) => {
                    const leadName = String(row?.name || row?.data?.name || row?.data?.title || t("common.noName"));
                    const stage = normalizeCRMStage(row?.data?.stage || row?.data?.status);
                    const company = row?.account?.data?.name || '-';
                    const source = row?.data?.source || '-';
                    return (
                      <tr key={row?.id || `lead-${index}`} className="hover:bg-background transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{leadName}</td>
                        <td className="px-6 py-4">{company}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-info/10 text-info">
                            {t(CRM_STAGE_LABEL_KEYS[stage])}
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
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex items-start gap-4">
      <div className="p-3 bg-muted rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-foreground mt-1">{value}</h3>
      </div>
    </div>
  );
}
