"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Bot, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';

interface WorkflowStat {
  status: string;
  count: number;
}

interface DailyTrend {
  date: string;
  count: number;
}

interface AiData {
  total_ai_actions: number;
  workflow_stats: WorkflowStat[];
  success_rate: number;
  daily_trend: DailyTrend[];
}

export default function AiReport() {
  const { t } = useLocalization();
  const [data, setData] = useState<AiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
                const res = await fetchWithAuth(`${API_BASE_URL}/reports/ai`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">{t("reports.ai.loading")}</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">{t("reports.ai.error")}</div>;
  }

  const formattedTrend = data.daily_trend?.map(d => ({
    date: new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    [t("reports.ai.operations")]: d.count
  })) || [];

  const workflowChartData = data.workflow_stats?.map(w => ({
    name: w.status === 'success' ? t("reports.ai.success") : w.status === 'failed' ? t("reports.ai.failed") : w.status,
    [t("reports.ai.count")]: w.count,
    fill: w.status === 'success' ? '#10b981' : '#ef4444' // green for success, red for fail
  })) || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("reports.ai.totalActions")} value={data.total_ai_actions.toString()} icon={<Bot className="w-5 h-5 text-brand" />} />
        <StatCard title={t("reports.ai.successRate")} value={`${Math.round(data.success_rate)}%`} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
        <StatCard title={t("reports.ai.successfulAutomations")} value={data.workflow_stats?.find(s => s.status === 'success')?.count.toString() || "0"} icon={<Zap className="w-5 h-5 text-yellow-500" />} />
        <StatCard title={t("reports.ai.automationErrors")} value={data.workflow_stats?.find(s => s.status === 'failed')?.count.toString() || "0"} icon={<AlertCircle className="w-5 h-5 text-red-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">{t("reports.ai.usageTitle")}</h3>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey={t("reports.ai.operations")} stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorAi)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Workflows Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">{t("reports.ai.workflowsStatus")}</h3>
          <div className="h-[300px]" dir="ltr">
            {workflowChartData && workflowChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workflowChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <RechartsTooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey={t("reports.ai.count")} radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">{t("reports.ai.noAutomations")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4 transition-colors">
      <div className="p-3 bg-slate-50 dark:bg-[#121212] rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</h3>
      </div>
    </div>
  );
}
