/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Mail, Phone, DollarSign, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/apiClient";
import Employee360Modal, { EmployeeEntity } from "@/components/plugins/Employee360Modal";
import PayrollRunModal from "@/components/plugins/PayrollRunModal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface EmployeeCard {
  id: string;
  name: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  status: "active" | "on_leave" | "probation" | "terminated" | string;
  joinDate: string;
  base_salary?: number;
  national_id_expiry?: string;
  iqama_expiry?: string;
  passport_expiry?: string;
  medical_insurance_expiry?: string;
  _raw: EmployeeEntity;
}

function getDaysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  const now = new Date();
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function hasComplianceAlert(emp: EmployeeCard): boolean {
  const fields = [emp.national_id_expiry, emp.iqama_expiry, emp.passport_expiry, emp.medical_insurance_expiry];
  return fields.some(d => {
    const days = getDaysUntilExpiry(d);
    return days !== null && days <= 90;
  });
}

export default function EmployeesDirectory() {
  const { t } = useLocalization();
  const [employees, setEmployees] = useState<EmployeeCard[]>([]);
  const [rawEmployees, setRawEmployees] = useState<EmployeeEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals state
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeEntity | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);

  const limit = 12;

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      const res = await apiGet<{ data: any[], total_pages: number }>(
        `/entities?workspace_id=${workspaceId}&type=hr_employee`,
        undefined,
        { page, limit }
      );
      if (res.data) {
        const raw: EmployeeEntity[] = res.data.map((entity: any) => ({
          id: entity.id || entity.ID,
          created_at: entity.created_at || entity.CreatedAt || "",
          data: {
            ...(entity.data || entity.Data || {}),
            full_name: entity.data?.full_name || entity.data?.name || entity.name || "N/A",
          },
        }));
        setRawEmployees(raw);

        const mapped: EmployeeCard[] = raw.map((entity) => ({
          id: entity.id,
          name: entity.data?.full_name || t("common.noName"),
          position: entity.data?.position || t("common.unspecified"),
          department: entity.data?.department || t("common.unspecified"),
          email: entity.data?.email || "",
          phone: entity.data?.phone || "",
          status: entity.data?.status || "active",
          joinDate: entity.data?.hire_date || new Date(entity.created_at).toLocaleDateString("en-CA"),
          base_salary: Number(entity.data?.base_salary || 0),
          national_id_expiry: entity.data?.national_id_expiry,
          iqama_expiry: entity.data?.iqama_expiry,
          passport_expiry: entity.data?.passport_expiry,
          medical_insurance_expiry: entity.data?.medical_insurance_expiry,
          _raw: entity,
        }));
        setEmployees(mapped);
        setTotalPages(res.total_pages || 1);
      }
    } catch (err) {
      console.error("Failed to fetch employees", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Defer to a microtask so state updates run outside the synchronous effect body
    void Promise.resolve().then(fetchEmployees);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: EmployeeCard["status"]) => {
    const map: Record<string, { label: string; cls: string }> = {
      active:     { label: "✅ " + t("common.active"),       cls: "bg-emerald-100 text-emerald-700" },
      on_leave:   { label: "🏖️ " + t("hr.onLeave"),    cls: "bg-orange-100 text-orange-700" },
      probation:  { label: "🔍 " + t("hr.probation"),     cls: "bg-blue-100 text-blue-700" },
      terminated: { label: "❌ " + t("hr.terminated"),     cls: "bg-red-100 text-red-700" },
    };
    const badge = map[status] || { label: status, cls: "bg-slate-100 text-slate-700" };
    return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>;
  };

  const alertCount = employees.filter(e => hasComplianceAlert(e)).length;
  const totalPayroll = employees
    .filter(e => e.status === "active" || e.status === "probation")
    .reduce((s, e) => s + (e.base_salary || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{t("hr.loadingEmployees")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">

      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("hr.employeeDirectory")}</h1>
            <p className="text-slate-500 mt-1 text-sm">{t("hr.employeeDirectoryDesc")}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t("hr.searchEmployee")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-4 pe-9 py-2 border border-slate-200 rounded-xl text-sm w-60 focus:outline-none focus:border-brand"
              />
            </div>
            <Button
              onClick={() => setShowPayrollModal(true)}
              variant="outline"
              className="text-emerald-700 gap-2 border-emerald-300 hover:bg-emerald-50"
            >
              <DollarSign className="w-4 h-4" />
              {t("hr.runPayroll")}
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("hr.addEmployee")}
            </Button>
          </div>
        </div>

        {/* KPI Summary Row */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
            <Users className="w-8 h-8 text-indigo-600 bg-indigo-100 rounded-lg p-1.5" />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.totalEmployees")}</p>
              <p className="text-xl font-black text-slate-800">{employees.length}</p>
            </div>
          </div>
          <div className={`flex items-center gap-3 rounded-xl p-3 border ${alertCount > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
            <AlertTriangle className={`w-8 h-8 rounded-lg p-1.5 ${alertCount > 0 ? "text-amber-700 bg-amber-100" : "text-slate-400 bg-slate-100"}`} />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.complianceAlerts")}</p>
              <p className={`text-xl font-black ${alertCount > 0 ? "text-amber-700" : "text-slate-800"}`}>{alertCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
            <DollarSign className="w-8 h-8 text-emerald-600 bg-emerald-100 rounded-lg p-1.5" />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.totalPayrollMonth")}</p>
              <p className="text-xl font-black text-emerald-700 font-mono">SAR {totalPayroll.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        {filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">{t("hr.noEmployees")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEmployees.map((emp) => (
              <div
                key={emp.id}
                className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${
                  hasComplianceAlert(emp) ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
                }`}
              >
                {/* Compliance Alert Badge */}
                {hasComplianceAlert(emp) && (
                  <div className="absolute top-3 end-3 bg-amber-100 border border-amber-300 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t("hr.compliance")}
                  </div>
                )}

                <div className="p-5">
                  {/* Avatar & Name */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-lg font-black text-white flex-shrink-0 shadow-md">
                      {emp.name.split(" ").slice(0, 2).map(n => n[0] || "").join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-900 truncate">{emp.name}</h3>
                      <p className="text-xs text-indigo-600 font-semibold truncate">{emp.position}</p>
                      <p className="text-xs text-slate-400">{emp.department}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("hr.joinDate")}</span>
                      <span className="font-medium text-slate-700">{emp.joinDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("hr.baseSalary")}</span>
                      <span className="font-mono font-semibold text-emerald-700">SAR {(emp.base_salary || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t("common.status")}</span>
                      {getStatusBadge(emp.status)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEmployee(emp._raw)}
                      className="flex-1 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
                    >
                      👤 Employee 360
                    </button>
                    {emp.email && (
                      <a href={`mailto:${emp.email}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors" title={emp.email}>
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    {emp.phone && (
                      <a href={`tel:${emp.phone}`} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 rounded-xl transition-colors" title={emp.phone}>
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center bg-white px-5 py-3 border border-slate-200 rounded-xl mt-6">
            <span className="text-sm text-slate-500">{t("common.page")} {page} {t("common.of")} {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>{t("common.prev")}</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{t("common.next")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Employee 360 Modal — Edit Existing */}
      {selectedEmployee && (
        <Employee360Modal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onSuccess={() => {
            setSelectedEmployee(null);
            fetchEmployees();
          }}
        />
      )}

      {/* Employee 360 Modal — Add New */}
      {showAddModal && (
        <Employee360Modal
          employee={null}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchEmployees();
          }}
        />
      )}

      {/* Payroll Run Modal */}
      {showPayrollModal && (
        <PayrollRunModal
          employees={rawEmployees}
          onClose={() => setShowPayrollModal(false)}
          onSuccess={() => {
            setShowPayrollModal(false);
          }}
        />
      )}
    </div>
  );
}
