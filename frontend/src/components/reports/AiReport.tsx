"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Bot, Zap, CheckCircle2, AlertCircle, ThumbsUp, ThumbsDown, Activity } from 'lucide-react';
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
  feedback?: {
    up: number;
    down: number;
    total: number;
    score: number;
  };
}

export default function AiReport() {
  const { t, isRtl } = useLocalization();
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
    return <div className="flex items-center justify-center h-64 text-muted-foreground dark:text-muted-foreground">{t("reports.ai.loading")}</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground dark:text-muted-foreground">{t("reports.ai.error")}</div>;
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

  const feedbackScorePct = Math.round((data.feedback?.score || 0) * 100);
  const upVotes = data.feedback?.up || 0;
  const downVotes = data.feedback?.down || 0;
  const totalVotes = data.feedback?.total || 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title={t("reports.ai.totalActions")} value={data.total_ai_actions.toString()} icon={<Bot className="w-5 h-5 text-brand" />} />
        <StatCard title={t("reports.ai.successRate")} value={`${Math.round(data.success_rate)}%`} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
        <StatCard title={isRtl ? "رضا المستخدمين (👍)" : "User Satisfaction"} value={`${feedbackScorePct}%`} icon={<ThumbsUp className="w-5 h-5 text-brand-light" />} />
        <StatCard title={t("reports.ai.successfulAutomations")} value={data.workflow_stats?.find(s => s.status === 'success')?.count.toString() || "0"} icon={<Zap className="w-5 h-5 text-yellow-500" />} />
        <StatCard title={t("reports.ai.automationErrors")} value={data.workflow_stats?.find(s => s.status === 'failed')?.count.toString() || "0"} icon={<AlertCircle className="w-5 h-5 text-red-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-card dark:bg-[#1a1a1a] p-6 rounded-xl border border-border dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-foreground dark:text-slate-100 mb-6">{t("reports.ai.usageTitle")}</h3>
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
        <div className="bg-card dark:bg-[#1a1a1a] p-6 rounded-xl border border-border dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-foreground dark:text-slate-100 mb-6">{t("reports.ai.workflowsStatus")}</h3>
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
              <div className="h-full flex items-center justify-center text-muted-foreground">{t("reports.ai.noAutomations")}</div>
            )}
          </div>
        </div>
      </div>

      {/* AI Observability & MessageFeedback Card */}
      <div className="bg-card dark:bg-[#1a1a1a] p-6 rounded-xl border border-border dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-brand/10 dark:bg-brand/20 text-brand rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground dark:text-slate-100">
              {isRtl ? "مراقبة جودة الذكاء الاصطناعي (AI Observability & Message Feedback)" : "AI Observability & Message Feedback"}
            </h3>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              {isRtl ? "تحليل تقييمات ردود المساعد الذكي (👍 / 👎) من قبل المستخدمين في قنوات العمل" : "Live telemetry of AI response ratings (👍 / 👎) across team channels"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="p-4 rounded-xl bg-muted dark:bg-[#121212] border border-border/60 dark:border-slate-800 flex flex-col justify-between">
            <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">{isRtl ? "إجمالي التقييمات المسجلة" : "Total Rated Responses"}</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground dark:text-slate-100">{totalVotes}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand">Signals</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted dark:bg-[#121212] border border-border/60 dark:border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">{isRtl ? "الردود الإيجابية المفيدة (👍)" : "Helpful / Positive (👍)"}</span>
              <ThumbsUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{upVotes}</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                ({totalVotes > 0 ? Math.round((upVotes / totalVotes) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted dark:bg-[#121212] border border-border/60 dark:border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">{isRtl ? "الردود السلبية / بحاجة لتحسين (👎)" : "Needs Improvement (👎)"}</span>
              <ThumbsDown className="w-4 h-4 text-red-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-red-600 dark:text-red-400">{downVotes}</span>
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                ({totalVotes > 0 ? Math.round((downVotes / totalVotes) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground dark:text-slate-300 mb-2">
            <span>{isRtl ? "نسبة الرضا الدقيقة للنماذج الذكية" : "Overall Quality Index"}</span>
            <span>{feedbackScorePct}% {isRtl ? "رضا" : "Satisfaction"}</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex">
            <div 
              className="bg-emerald-500 transition-all duration-500" 
              style={{ width: `${totalVotes > 0 ? (upVotes / totalVotes) * 100 : 100}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-500" 
              style={{ width: `${totalVotes > 0 ? (downVotes / totalVotes) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-card dark:bg-[#1a1a1a] p-6 rounded-xl border border-border dark:border-slate-800 shadow-sm flex items-start gap-4 transition-colors">
      <div className="p-3 bg-muted dark:bg-[#121212] rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-foreground dark:text-slate-100 mt-1">{value}</h3>
      </div>
    </div>
  );
}
