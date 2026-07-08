/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Users, Briefcase, Calendar, DollarSign, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddEmployeeModal from "./AddEmployeeModal";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function HrDashboard() {
  const { t, isRtl } = useLocalization();
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [stats, setStats] = useState({
    totalEmployees: 0,
    openPositions: 0,
    onLeave: 0,
    monthlyPayroll: 0,
  });

  const [departmentData, setDepartmentData] = useState([
    { name: "engineering", label: t("hr.engineering"), value: 1, color: "#3b82f6" },
    { name: "sales", label: t("hr.sales"), value: 1, color: "#10b981" },
    { name: "marketing", label: t("hr.marketing"), value: 1, color: "#f59e0b" },
    { name: "hr", label: t("hr.humanResources"), value: 1, color: "#8b5cf6" },
    { name: "admin", label: t("hr.administration"), value: 1, color: "#ef4444" },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [attendanceData, setAttendanceData] = useState([
    { day: "sunday", label: t("common.days.sun"), present: 0, absent: 0 },
    { day: "monday", label: t("common.days.mon"), present: 0, absent: 0 },
    { day: "tuesday", label: t("common.days.tue"), present: 0, absent: 0 },
    { day: "wednesday", label: t("common.days.wed"), present: 0, absent: 0 },
    { day: "thursday", label: t("common.days.thu"), present: 0, absent: 0 },
  ]);

  const fetchHrData = useCallback(async () => {
    await Promise.resolve();
    try {
      setIsLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      
      // Fetch Employees
      const empRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=hr_employee`) as any;
      let fetchedEmployees = [];
      let payroll = 0;
      const deptCounts: Record<string, number> = {};

      if (empRes.data) {
        fetchedEmployees = empRes.data;
        setEmployees(fetchedEmployees.slice(0, 5)); // Last 5 employees

        fetchedEmployees.forEach((emp: any) => {
          payroll += parseFloat(emp.data?.salary || 0);
          const dept = emp.data?.department || "General";
          deptCounts[dept] = (deptCounts[dept] || 0) + 1;
        });
      }

      const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6"];
      const newDeptData = Object.keys(deptCounts).map((key, i) => ({
        name: key,
        label: t(`hr.departments.${key.toLowerCase()}`, key),
        value: deptCounts[key],
        color: colors[i % colors.length]
      }));
      if (newDeptData.length > 0) setDepartmentData(newDeptData);

      // Fetch Open Positions
      const jobsRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=hr_job`) as any;
      let openPos = 0;
      if (jobsRes.data) {
        openPos = jobsRes.data.filter((j: any) => j.data?.status === "Open" || j.data?.status === "Open").length;
      }

      // Fetch Leaves
      const leavesRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=hr_leave_request`) as any;
      let leavesToday = 0;
      if (leavesRes.data) {
        const today = new Date().toISOString().split('T')[0];
        leavesToday = leavesRes.data.filter((l: any) => {
          const start = l.data?.start_date;
          const end = l.data?.end_date;
          const status = l.data?.status;
          if (status !== 'Approved' && status !== 'Approved') return false;
          return start <= today && end >= today;
        }).length;
      }

      setStats({
        totalEmployees: fetchedEmployees.length,
        openPositions: openPos,
        onLeave: leavesToday,
        monthlyPayroll: payroll,
      });

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load HR data", err);
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line
    fetchHrData();
  }, [fetchHrData]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-slate-500">{t("hr.loadingDashboard")}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-brand" />
              {t("hr.dashboardTitle")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("hr.dashboardSubtitle")}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className={`w-4 h-4 absolute ${isRtl ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-slate-400`} />
              <input 
                type="text" 
                placeholder={t("hr.searchEmployee")}
                className={`py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:border-brand ${isRtl ? "pr-9 pl-4" : "pl-9 pr-4"}`}
              />
            </div>
            <Button variant="outline" className="text-slate-600 gap-2 border-slate-200">
              <Calendar className="w-4 h-4" />
              {t("hr.monthlyReport")}
            </Button>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <UserPlus className="w-4 h-4" />
              {t("hr.addEmployee")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title={t("hr.totalEmployeesStat")} value={stats.totalEmployees.toString()} icon={<Users className="w-6 h-6 text-blue-500" />} />
          <StatCard title={t("hr.openPositions")} value={stats.openPositions.toString()} icon={<Briefcase className="w-6 h-6 text-orange-500" />} />
          <StatCard title={t("hr.onLeaveToday")} value={stats.onLeave.toString()} icon={<Calendar className="w-6 h-6 text-emerald-500" />} />
          <StatCard title={t("hr.monthlyPayroll")} value={`$${stats.monthlyPayroll.toLocaleString()}`} icon={<DollarSign className="w-6 h-6 text-brand" />} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Attendance Trend */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{t("hr.attendanceTrend")}</h3>
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} reversed={isRtl} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} orientation={isRtl ? "right" : "left"} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="present" name={t("hr.present")} fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absent" name={t("hr.absent")} fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Department Pie */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{t("hr.departmentDistribution")}</h3>
            <div className="h-72 w-full flex items-center justify-center" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="label"
                  >
                    {departmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Onboarding Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">{t("hr.recentOnboarding")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
              <thead className="bg-[#f8fafc] text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">{t("common.table.name")}</th>
                  <th className="px-6 py-3 font-medium">{t("hr.department")}</th>
                  <th className="px-6 py-3 font-medium">{t("hr.jobTitle")}</th>
                  <th className="px-6 py-3 font-medium">{t("hr.startDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {employees.length > 0 ? employees.map((row: any) => (
                  <tr key={row.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{row?.name || row?.data?.name || t("hr.noName")}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {t(`hr.departments.${row.data?.department?.toLowerCase()}`, row.data?.department || '-')}
                      </span>
                    </td>
                    <td className="px-6 py-4">{row.data?.role || '-'}</td>
                    <td className="px-6 py-4 text-slate-500">{row.data?.start_date || '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      {t("hr.noEmployees")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddEmployeeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={fetchHrData} 
      />
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
