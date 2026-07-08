import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { X, Activity, Target, CheckCircle2 } from 'lucide-react';

interface SprintReportProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[];
  onClose: () => void;
}

export default function SprintReport({ sprint, tasks, onClose }: SprintReportProps) {
  // 1. Completion Donut Chart
  const sprintTasks = tasks.filter(t => t.SprintID === sprint.ID);
  const totalTasks = sprintTasks.length;
  const doneTasks = sprintTasks.filter(t => t.Status === "done").length;
  const inProgressTasks = sprintTasks.filter(t => t.Status === "in_progress").length;
  const todoTasks = sprintTasks.filter(t => t.Status === "todo").length;

  const statusData = [
    { name: 'مكتملة', value: doneTasks, color: '#10b981' }, // emerald-500
    { name: 'قيد التنفيذ', value: inProgressTasks, color: '#3b82f6' }, // blue-500
    { name: 'معلقة', value: todoTasks, color: '#cbd5e1' }, // slate-300
  ];

  // 2. Workload Bar Chart (Assignee load)
  const assigneeMap = new Map<string, number>();
  sprintTasks.forEach(t => {
    const assignee = t.AssigneeID || 'غير معين';
    assigneeMap.set(assignee, (assigneeMap.get(assignee) || 0) + 1);
  });
  const workloadData = Array.from(assigneeMap.entries()).map(([name, count]) => ({
    name: name === 'غير معين' ? name : name.substring(0, 5), // Trim uuid for visual, in real app resolve user names
    count
  }));

  // 3. Burndown Chart (Mocking past 7 days up to sprint end)
  const burndownData = useMemo(() => {
    const data = [];
    const today = new Date();
    let remaining = totalTasks;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (i < 6) {
        remaining -= (i % 2 === 0 ? 1 : 0);
      }
      data.push({
        day: `${d.getMonth() + 1}/${d.getDate()}`,
        remaining: Math.max(0, remaining)
      });
    }
    return data;
  }, [totalTasks]);

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col overflow-y-auto">
      <div className="sticky top-0 bg-white/80 backdrop-blur-md p-4 border-b border-slate-200 flex justify-between items-center z-10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center">
            <Activity className="w-5 h-5 me-2 text-brand" />
            تقرير السبرنت: {sprint.Name}
          </h2>
          <span className="text-sm text-slate-500">إحصائيات الإنجاز وسير العمل المباشرة</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500" title="إغلاق التقرير">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-brand-light p-3 rounded-lg text-brand">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">إجمالي المهام</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalTasks}</h3>
            </div>
          </div>
          <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">المهام المنجزة</p>
              <h3 className="text-2xl font-bold text-slate-800">{doneTasks}</h3>
            </div>
          </div>
          <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-brand-light p-3 rounded-lg text-brand">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">نسبة الإنجاز</p>
              <h3 className="text-2xl font-bold text-slate-800">
                {totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%
              </h3>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Burndown Chart */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-6 text-slate-800">مخطط حرق المهام (Burndown)</h3>
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burndownData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="stepAfter" dataKey="remaining" name="المهام المتبقية" stroke="#4f46e5" strokeWidth={3} fill="#4f46e5" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Donut Chart */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold mb-6 text-slate-800">نسبة الإنجاز (Completion)</h3>
            <div className="h-72 w-full flex items-center justify-center" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
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

          {/* Workload Bar Chart */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold mb-6 text-slate-800">توزيع أعباء العمل (Workload)</h3>
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workloadData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" name="عدد المهام" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
