"use client";

import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, Users, Clock, AlertTriangle, Building2 } from 'lucide-react';
import { apiGet } from '@/lib/apiClient';
import { useThemeStore } from '@/store/useThemeStore';
import { useLocalization } from '@/contexts/LocalizationContext';

interface AttendanceLog {
  ID: string;
  UserID: string;
  OfficeID: string;
  CheckInTime: string;
  CheckOutTime?: string;
  Status: string;
  User?: {
    Name: string;
    Email: string;
  };
  Office?: {
    Name: string;
  };
}

export default function AttendanceReport() {
  const { t, language } = useLocalization();
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const primaryColor = useThemeStore((state) => state.primaryColor);

  const mockAttendanceData = [
    { name: t("reports.days.sun"), hours: 8, expected: 8 },
    { name: t("reports.days.mon"), hours: 8.5, expected: 8 },
    { name: t("reports.days.tue"), hours: 7.5, expected: 8 },
    { name: t("reports.days.wed"), hours: 9, expected: 8 },
    { name: t("reports.days.thu"), hours: 8, expected: 8 },
  ];

  const mockStatusData = [
    { name: t("reports.status.onTime"), value: 65, color: '#10b981' }, // Green
    { name: t("reports.status.late"), value: 15, color: '#f59e0b' },      // Yellow
    { name: t("reports.status.remote"), value: 15, color: '#3b82f6' }, // Blue
    { name: t("reports.status.absent"), value: 5, color: '#ef4444' },        // Red
  ];

  // Compute stats from logs
  const calculateStats = () => {
    let present = 0, late = 0, absent = 0, remote = 0;
    let totalHours = 0;
    
    logs.forEach(log => {
      if (log.Status === 'present') present++;
      else if (log.Status === 'late') late++;
      else if (log.Status === 'absent') absent++;
      else remote++;

      if (log.CheckOutTime && log.CheckInTime) {
        const inTime = new Date(log.CheckInTime);
        const outTime = new Date(log.CheckOutTime);
        totalHours += (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
      }
    });

    const totalLogs = logs.length || 1;
    const avgHours = totalHours / totalLogs;

    return {
      statusData: [
        { name: t("reports.status.onTime"), value: present, color: '#10b981' },
        { name: t("reports.status.late"), value: late, color: '#f59e0b' },
        { name: t("reports.status.remote"), value: remote, color: '#3b82f6' },
        { name: t("reports.status.absent"), value: absent, color: '#ef4444' },
      ].filter(item => item.value > 0), // hide empty statuses
      avgHours: avgHours.toFixed(1),
      presentPercentage: Math.round(((present + late) / totalLogs) * 100)
    };
  };

  const { statusData, avgHours, presentPercentage } = calculateStats();
  
  // Provide fallback mock data if empty
  const activeStatusData = statusData.length > 0 ? statusData : mockStatusData;

  const fetchLogs = async () => {
    try {
      const data = await apiGet('/attendance/logs') as unknown as AttendanceLog[];
      setLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => { void fetchLogs(); });
  }, []);

  return (
    <div className="flex flex-col gap-6">

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("reports.totalEmployees")} value="42" icon={<Users className="w-5 h-5 text-[var(--primary-hex)]" />} />
        <StatCard title={t("reports.avgHours")} value={`${avgHours} ${t("reports.hoursPerDay")}`} icon={<Clock className="w-5 h-5 text-[var(--primary-hex)]" />} />
        <StatCard title={t("reports.attendanceLogs")} value={logs.length.toString()} icon={<AlertTriangle className="w-5 h-5 text-[var(--primary-hex)]" />} />
        <StatCard title={t("reports.presenceRate")} value={`${presentPercentage}%`} icon={<Building2 className="w-5 h-5 text-[var(--primary-hex)]" />} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Hours Bar Chart */}
        <div className="col-span-2 bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-slate-100">{t("reports.totalHoursWeek")}</h3>
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockAttendanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Bar dataKey="expected" name={t("reports.expectedHours")} fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hours" name={t("reports.actualHours")} fill={primaryColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pie Chart */}
        <div className="col-span-1 bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-slate-100">{t("reports.statusDistribution")}</h3>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {activeStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Custom Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {activeStatusData.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="w-3 h-3 rounded-full inline-block" ref={(el) => { if (el) el.style.backgroundColor = item.color; }} />
                {item.name} ({item.value})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("reports.dailyLog")}</h3>
          <button className="flex items-center gap-2 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md transition-colors">
            <Download className="w-4 h-4" />
            {t("common.exportCsv")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead className="bg-[#f8fafc] dark:bg-[#121212] text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium text-start">{t("reports.employee")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.dateIn")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.out")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.statusHeader")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.location")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {logs.map((row) => (
                <tr key={row.ID} className="hover:bg-[#f8fafc] dark:hover:bg-[#121212] transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{row.User?.Name || t("reports.unknownUser")}</td>
                  <td className="px-6 py-4">{new Date(row.CheckInTime).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}</td>
                  <td className="px-6 py-4">{row.CheckOutTime ? new Date(row.CheckOutTime).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                      ${row.Status === 'present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400'}
                    `}>
                      {t(`reports.status.${row.Status}`, row.Status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">{row.Office?.Name || t("reports.headquarters")}</td>
                </tr>
              ))}
              {logs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">{t("reports.noLogs")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 transition-colors">
      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#f8fafc] dark:bg-[#121212] border border-slate-100 dark:border-slate-700">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <h4 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</h4>
      </div>
    </div>
  );
}
