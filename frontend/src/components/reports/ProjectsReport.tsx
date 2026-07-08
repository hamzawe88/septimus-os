"use client";

import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { CheckCircle2, Clock, Activity, LayoutGrid } from 'lucide-react';
import { apiGet } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';

interface Task {
  ID: string;
  Title: string;
  Status: string;
  Priority: number;
  ParentID?: string;
  Path: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export default function ProjectsReport() {
  const { t } = useLocalization();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await apiGet<{ tasks: Task[] }>('/tasks');
        setTasks(data.tasks || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTasks();

    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const msg = customEvent.detail;
      // Realtime update hook
      if (msg && (msg.type === "task_updated" || msg.type === "task_created" || msg.type === "task_deleted")) {
        fetchTasks();
      }
    };

    window.addEventListener("ws-message", handleWsMessage);
    return () => window.removeEventListener("ws-message", handleWsMessage);
  }, []);

  // Compute Statistics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.Status === "done").length;
  const pendingTasks = totalTasks - completedTasks;

  // Let's assume tasks without a ParentID are "Projects" or "Epics"
  const rootTasks = tasks.filter(t => !t.ParentID || t.Path.split('.').length === 1);
  const totalProjects = rootTasks.length;

  // Build Project Progress Data
  // Group by root task ID
  const projectProgressMap = new Map<string, { name: string; completed: number; pending: number }>();
  rootTasks.forEach(root => {
    projectProgressMap.set(root.ID, { name: root.Title, completed: 0, pending: 0 });
  });

  tasks.forEach(task => {
    const rootId = task.Path ? task.Path.split('.')[0] : task.ID;
    if (projectProgressMap.has(rootId)) {
      const p = projectProgressMap.get(rootId)!;
      if (task.Status === "done") p.completed++;
      else p.pending++;
    }
  });

  const projectProgressData = Array.from(projectProgressMap.values());

  // Build Velocity Data (Last 7 days based on UpdatedAt for 'done' tasks)
  const velocityMap = new Map<string, number>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    velocityMap.set(d.toISOString().split('T')[0], 0);
  }

  tasks.forEach(task => {
    if (task.Status === "done" && task.UpdatedAt) {
      const dateStr = task.UpdatedAt.split('T')[0];
      if (velocityMap.has(dateStr)) {
        velocityMap.set(dateStr, velocityMap.get(dateStr)! + 1);
      }
    }
  });

  const sprintVelocityData = Array.from(velocityMap.entries()).map(([date, count]) => {
    // Just show Month/Day
    const d = new Date(date);
    return { day: `${d.getMonth() + 1}/${d.getDate()}`, tasks: count };
  });

  const avgVelocity = Math.round(completedTasks / 7) || 0; // rough avg over 7 days

  const statusData = [
    { name: t("reports.projects.completed"), value: completedTasks, color: '#10b981' }, // emerald-500
    { name: t("reports.projects.inProgress"), value: tasks.filter(t => t.Status === "in_progress").length, color: '#3b82f6' }, // blue-500
    { name: t("reports.projects.pending"), value: tasks.filter(t => t.Status === "todo").length, color: '#cbd5e1' }, // slate-300
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("reports.projects.activeProjects")} value={totalProjects.toString()} icon={<LayoutGrid className="w-5 h-5 text-[#dfb2e5]" />} />
        <StatCard title={t("reports.projects.completedTasks")} value={completedTasks.toString()} icon={<CheckCircle2 className="w-5 h-5 text-[#dfb2e5]" />} />
        <StatCard title={t("reports.projects.tasksInProgress")} value={pendingTasks.toString()} icon={<Clock className="w-5 h-5 text-[#dfb2e5]" />} />
        <StatCard title={t("reports.projects.velocity")} value={`${avgVelocity}/${t("reports.projects.perDay")}`} icon={<Activity className="w-5 h-5 text-[#dfb2e5]" />} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Project Progress Bar Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-slate-100">{t("reports.projects.progressTitle")}</h3>
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectProgressData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} />
                <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend />
                <Bar dataKey="completed" name={t("reports.projects.completedTasksLegend")} stackId="a" fill="#dfb2e5" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" name={t("reports.projects.pendingTasksLegend")} stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sprint Velocity Line Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-slate-100">{t("reports.projects.velocityTitle")}</h3>
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sprintVelocityData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="tasks" name={t("reports.projects.completedTasksLegend")} stroke="#dfb2e5" strokeWidth={3} fill="#dfb2e5" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Task Status Distribution Pie Chart */}
        <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-2 transition-colors">
          <h3 className="text-lg font-semibold mb-6 text-slate-800 dark:text-slate-100">{t("reports.projects.statusDistribution")}</h3>
          <div className="h-72 w-full flex items-center justify-center" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
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

      {/* Data Table */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("reports.projects.topTasks")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-start">
            <thead className="bg-[#f8fafc] dark:bg-[#121212] text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium text-start">{t("reports.projects.taskTitle")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.projects.priority")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.projects.status")}</th>
                <th className="px-6 py-3 font-medium text-start">{t("reports.projects.path")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {tasks.slice(0, 10).map((row) => (
                <tr key={row.ID} className="hover:bg-[#f8fafc] dark:hover:bg-[#121212] transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{row.Title}</td>
                  <td className="px-6 py-4">{row.Priority}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                      ${row.Status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : ''}
                      ${row.Status === 'todo' ? 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400' : ''}
                      ${row.Status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : ''}
                    `}>
                      {t(`reports.projects.${row.Status}`, row.Status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">{row.Path}</td>
                </tr>
              ))}
              {tasks.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">{t("reports.projects.noTasks")}</td>
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
