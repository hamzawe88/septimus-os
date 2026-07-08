"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { MessageSquare, Hash, Users, Activity } from 'lucide-react';
import { apiGet } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';

interface ChannelStat {
  type: string;
  count: number;
}

interface DailyTrend {
  date: string;
  count: number;
}

interface CommunicationData {
  total_messages: number;
  active_channels: number;
  distribution: ChannelStat[];
  daily_trend: DailyTrend[];
}

export default function CommunicationReport() {
  const { t } = useLocalization();
  const [data, setData] = useState<CommunicationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const json = await apiGet<CommunicationData>('/reports/communication');
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">{t("reports.communication.loading")}</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">{t("reports.communication.error")}</div>;
  }

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

  const formattedTrend = data.daily_trend?.map(d => ({
    date: new Date(d.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }),
    [t("reports.communication.messages")]: d.count
  })) || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("reports.communication.totalMessages")} value={data.total_messages.toString()} icon={<MessageSquare className="w-5 h-5 text-brand" />} />
        <StatCard title={t("reports.communication.activeChannels")} value={data.active_channels.toString()} icon={<Hash className="w-5 h-5 text-brand" />} />
        <StatCard title={t("reports.communication.channelTypes")} value={data.distribution?.length.toString() || "0"} icon={<Users className="w-5 h-5 text-emerald-500" />} />
        <StatCard title={t("reports.communication.dailyRate")} value={data.daily_trend?.length ? Math.round(data.total_messages / data.daily_trend.length).toString() : "0"} icon={<Activity className="w-5 h-5 text-orange-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-2 transition-colors">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">{t("reports.communication.activityTitle")}</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMsgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey={t("reports.communication.messages")} stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMsgs)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Pie Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">{t("reports.communication.distributionTitle")}</h3>
          <div className="h-[300px] flex items-center justify-center" dir="ltr">
            {data.distribution && data.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="type"
                  >
                    {data.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400">{t("reports.communication.noData")}</div>
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
