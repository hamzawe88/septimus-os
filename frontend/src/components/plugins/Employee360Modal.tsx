"use client";

import React, { useState, useEffect } from "react";
import {
  X, Save, User, Calendar, BadgeDollarSign, Phone, Mail,
  AlertTriangle, CheckCircle, Building2, CreditCard, Zap, Brain, Sparkles, CalendarClock
} from "lucide-react";
import { fetchWithAuth, apiGet, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

export interface EmployeeData {
  employee_id?: string;
  full_name?: string;
  position?: string;
  department?: string;
  email?: string;
  phone?: string;
  iban?: string;
  national_id?: string;
  national_id_expiry?: string;
  iqama_expiry?: string;
  passport_expiry?: string;
  medical_insurance_expiry?: string;
  base_salary?: number | string;
  housing_allowance?: number | string;
  transport_allowance?: number | string;
  hire_date?: string;
  status?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface EmployeeEntity {
  id: string;
  created_at: string;
  data: EmployeeData;
}

interface Employee360ModalProps {
  employee?: EmployeeEntity | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface LeaveBalanceRow {
  leave_type: string;
  entitled_days: number;
  carried_over_days: number;
  adjustment_days: number;
  taken_days: number;
  remaining_days: number;
}

interface EosbResult {
  years_of_service: number;
  monthly_wage: number;
  gross_award: number;
  payable_amount: number;
}

function getDaysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  const now = new Date();
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ label, dateStr }: { label: string; dateStr?: string }) {
  const days = getDaysUntilExpiry(dateStr);
  if (days === null) return null;

  let bgColor = "bg-muted text-muted-foreground border-border";
  let icon = <CheckCircle className="w-3.5 h-3.5" />;

  if (days <= 0) {
    bgColor = "bg-rose-100 text-rose-700 border-rose-200";
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
  } else if (days <= 30) {
    bgColor = "bg-amber-100 text-amber-700 border-amber-200";
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
  } else if (days <= 90) {
    bgColor = "bg-yellow-50 text-yellow-700 border-yellow-200";
    icon = <Zap className="w-3.5 h-3.5" />;
  }

  const expiryText = days <= 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${bgColor}`}>
      {icon}
      {label}: {expiryText}
    </span>
  );
}

export default function Employee360Modal({ employee, onClose, onSuccess }: Employee360ModalProps) {
  const { t, formatCurrency, isRtl } = useLocalization();
  const isEditing = !!employee;
  const [activeTab, setActiveTab] = useState<"personal" | "financial" | "compliance" | "leave" | "copilot">("personal");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Leave balances — lazy-loaded the first time the Leave tab opens for an
  // existing employee (a new, unsaved employee has no id and no balances yet).
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalanceRow[] | null>(null);
  const [leaveMeta, setLeaveMeta] = useState<{ years_of_service?: number; year?: number }>({});
  const [leaveLoading, setLeaveLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "leave" || !isEditing || !employee?.id) return;
    let active = true;
    const load = async () => {
      setLeaveLoading(true);
      try {
        const res = await apiGet<{ data: LeaveBalanceRow[]; years_of_service?: number; year?: number }>(
          `/leave-balances?employee_id=${employee.id}`
        );
        if (!active) return;
        setLeaveBalances(res.data || []);
        setLeaveMeta({ years_of_service: res.years_of_service, year: res.year });
      } catch (err) {
        console.error("Failed to load leave balances", err);
        if (active) setLeaveBalances([]);
      } finally {
        if (active) setLeaveLoading(false);
      }
    };
    // Defer to a microtask so no setState runs synchronously in the effect body.
    void Promise.resolve().then(load);
    return () => { active = false; };
  }, [activeTab, isEditing, employee?.id]);

  // End-of-service benefit — loaded lazily when the Financial tab opens.
  const [eosb, setEosb] = useState<EosbResult | null>(null);
  const [eosbLoading, setEosbLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "financial" || !isEditing || !employee?.id) return;
    let active = true;
    const load = async () => {
      setEosbLoading(true);
      try {
        const res = await apiGet<EosbResult>(`/employees/${employee.id}/eosb?reason=termination`);
        if (active) setEosb(res);
      } catch (err) {
        console.error("Failed to load end-of-service", err);
        if (active) setEosb(null);
      } finally {
        if (active) setEosbLoading(false);
      }
    };
    void Promise.resolve().then(load);
    return () => { active = false; };
  }, [activeTab, isEditing, employee?.id]);

  const [formData, setFormData] = useState<EmployeeData>(() => ({
    employee_id: employee?.data?.employee_id || `EMP-${Date.now().toString().slice(-4)}`,
    full_name: employee?.data?.full_name || "",
    position: employee?.data?.position || "",
    department: employee?.data?.department || "",
    email: employee?.data?.email || "",
    phone: employee?.data?.phone || "",
    iban: employee?.data?.iban || "",
    national_id: employee?.data?.national_id || "",
    national_id_expiry: employee?.data?.national_id_expiry || "",
    iqama_expiry: employee?.data?.iqama_expiry || "",
    passport_expiry: employee?.data?.passport_expiry || "",
    medical_insurance_expiry: employee?.data?.medical_insurance_expiry || "",
    base_salary: employee?.data?.base_salary || 0,
    housing_allowance: employee?.data?.housing_allowance || 0,
    transport_allowance: employee?.data?.transport_allowance || 0,
    hire_date: employee?.data?.hire_date || new Date().toISOString().split("T")[0],
    status: employee?.data?.status || "active",
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const totalCompensation =
    Number(formData.base_salary || 0) +
    Number(formData.housing_allowance || 0) +
    Number(formData.transport_allowance || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const url = isEditing
        ? `${API_BASE_URL}/employees/${employee!.id}?workspace_id=${workspaceId}`
        : `${API_BASE_URL}/employees?workspace_id=${workspaceId}`;

      const method = isEditing ? "PUT" : "POST";
      const body = isEditing
        ? JSON.stringify({ data: formData })
        : JSON.stringify({
            entity_type: "hr_employee",
            name: formData.full_name || "New Employee",
            data: formData,
          });

      const res = await fetchWithAuth(url, { method, body });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const tabs: Array<{ id: "personal" | "financial" | "compliance" | "leave" | "copilot"; label: string; icon: React.ReactNode }> = [
    { id: "personal", label: t("personal_info") || "Personal", icon: <User className="w-4 h-4" /> },
    { id: "financial", label: t("salary_iban") || "Financial", icon: <BadgeDollarSign className="w-4 h-4" /> },
    { id: "compliance", label: t("legal_compliance") || "Compliance", icon: <AlertTriangle className="w-4 h-4" /> },
    // Leave balances only exist for a saved employee (needs an id to query).
    ...(isEditing ? [{ id: "leave" as const, label: t("leave_balance") || "Leave", icon: <CalendarClock className="w-4 h-4" /> }] : []),
    { id: "copilot", label: "Copilot", icon: <Brain className="w-4 h-4 text-purple-500" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card text-foreground w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900 text-white border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <User className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {isEditing ? `${t("employee_360")}: ${formData.full_name || "Unknown"}` : t("add_employee") + " 👤"}
              </h2>
              <p className="text-xs text-slate-300">{formData.employee_id} • {formData.position || t("not_set")} • {formData.department || t("not_set")}</p>
            </div>
          </div>
          <button type="button" aria-label={t("close_modal")} onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compliance Alerts Banner */}
        {isEditing && (() => {
          const alerts = [
            { label: "National ID", dateStr: formData.national_id_expiry },
            { label: "Iqama", dateStr: formData.iqama_expiry },
            { label: "Passport", dateStr: formData.passport_expiry },
            { label: "Medical Ins.", dateStr: formData.medical_insurance_expiry },
          ].filter(a => {
            const d = getDaysUntilExpiry(a.dateStr);
            return d !== null && d <= 90;
          });

          if (alerts.length === 0) return null;
          return (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-amber-700 me-1">⚠️ Compliance Alerts:</span>
              {alerts.map(a => (
                <ExpiryBadge key={a.label} label={a.label} dateStr={a.dateStr} />
              ))}
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted px-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 me-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto">
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
              ⚠️ {errorMsg}
            </div>
          )}

          <form id="employee-form" onSubmit={handleSubmit}>
            {/* Personal Info Tab */}
            {activeTab === "personal" && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="full_name" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("full_name")} *</label>
                    <div className="relative">
                      <User className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                      <input id="full_name" required name="full_name" type="text" value={formData.full_name || ""} onChange={handleChange} className={`w-full bg-card border border-border rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none`} placeholder="Ahmed Al-Rashidi" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="employee_id" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("employee_id")}</label>
                    <input id="employee_id" name="employee_id" type="text" value={formData.employee_id || ""} onChange={handleChange} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="position" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("position_job_title")} *</label>
                    <input id="position" required name="position" type="text" value={formData.position || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none" placeholder={t("position_placeholder")} />
                  </div>
                  <div>
                    <label htmlFor="department" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("department")}</label>
                    <select id="department" name="department" value={formData.department || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none">
                      <option value="">{t("select_department")}</option>
                      <option value="engineering">{t("dept_engineering")}</option>
                      <option value="sales">{t("dept_sales")}</option>
                      <option value="finance">{t("dept_finance")}</option>
                      <option value="hr">{t("dept_hr")}</option>
                      <option value="operations">{t("dept_operations")}</option>
                      <option value="management">{t("dept_management")}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("work_email")}</label>
                    <div className="relative">
                      <Mail className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                      <input id="email" name="email" type="email" value={formData.email || ""} onChange={handleChange} className={`w-full bg-card border border-border rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none`} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("mobile_phone")}</label>
                    <div className="relative">
                      <Phone className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                      <input id="phone" name="phone" type="tel" value={formData.phone || ""} onChange={handleChange} className={`w-full bg-card border border-border rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none`} placeholder="+966 5XX XXX XXXX" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="hire_date" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("hire_date")}</label>
                    <div className="relative">
                      <Calendar className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                      <input id="hire_date" name="hire_date" type="date" value={formData.hire_date || ""} onChange={handleChange} className={`w-full bg-card border border-border rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none`} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="status" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("employee_status")}</label>
                    <select id="status" name="status" value={formData.status || "active"} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none">
                      <option value="active">✅ {t("status_active")}</option>
                      <option value="on_leave">🏖️ {t("status_on_leave")}</option>
                      <option value="probation">🔍 {t("status_probation")}</option>
                      <option value="terminated">❌ {t("status_terminated")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Notes</label>
                  <textarea id="notes" name="notes" rows={3} value={formData.notes || ""} onChange={handleChange} className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none resize-none" placeholder="Additional notes, skills, or remarks..." />
                </div>
              </div>
            )}

            {/* Financial Tab */}
            {activeTab === "financial" && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="base_salary" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("base_salary")}</label>
                    <input id="base_salary" name="base_salary" type="number" min="0" value={formData.base_salary || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none" placeholder="8000" />
                  </div>
                  <div>
                    <label htmlFor="housing_allowance" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("housing_allowance")}</label>
                    <input id="housing_allowance" name="housing_allowance" type="number" min="0" value={formData.housing_allowance || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none" placeholder="2000" />
                  </div>
                  <div>
                    <label htmlFor="transport_allowance" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("transport_allowance")}</label>
                    <input id="transport_allowance" name="transport_allowance" type="number" min="0" value={formData.transport_allowance || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none" placeholder="500" />
                  </div>
                </div>

                {/* Salary Summary Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-200 rounded-xl p-5 space-y-2.5">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <BadgeDollarSign className="w-4 h-4 text-indigo-600" />
                    {t("monthly_compensation_summary")}
                  </h4>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t("base_salary")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.base_salary || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t("housing_allowance")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.housing_allowance || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t("transport_allowance")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.transport_allowance || 0))}</span>
                  </div>
                  <div className="pt-2 border-t border-indigo-200 flex justify-between items-baseline">
                    <span className="font-bold text-foreground">{t("total_monthly_wps")}:</span>
                    <span className="text-2xl font-black text-indigo-700 font-mono">{formatCurrency(totalCompensation)}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="iban" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">
                    {t("bank_iban")} <Building2 className={`inline w-3.5 h-3.5 ${isRtl ? 'me-1' : 'ms-1'} text-muted-foreground`} />
                  </label>
                  <div className="relative">
                    <CreditCard className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                    <input id="iban" name="iban" type="text" value={formData.iban || ""} onChange={handleChange} className={`w-full bg-card border border-border rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none`} placeholder="SA00 0000 0000 0000 0000 0000" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t("used_for_wps")}</p>
                </div>

                {/* End-of-Service Benefit (Saudi Labour Law Arts. 84–85) */}
                {isEditing && (
                  <div className="bg-gradient-to-br from-amber-50 to-slate-50 border border-amber-200 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
                      <BadgeDollarSign className="w-4 h-4 text-amber-600" />
                      {t("end_of_service", "End of Service (EOSB)")}
                    </h4>
                    {eosbLoading ? (
                      <p className="text-sm text-muted-foreground">{t("loading") || "Loading…"}</p>
                    ) : eosb ? (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("years_of_service", "Years of service")}</p>
                          <p className="text-lg font-bold text-foreground font-mono">{eosb.years_of_service}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("monthly_wage", "Monthly wage")}</p>
                          <p className="text-lg font-bold text-foreground font-mono">{formatCurrency(eosb.monthly_wage)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("eosb_on_termination", "Award (on termination)")}</p>
                          <p className="text-lg font-black text-amber-700 font-mono">{formatCurrency(eosb.payable_amount)}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("eosb_unavailable", "Add a hire date to calculate end-of-service.")}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Leave Balance Tab */}
            {activeTab === "leave" && (
              <div className="p-6 space-y-4">
                {leaveLoading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">{t("loading") || "Loading…"}</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-indigo-600" />
                        {t("leave_balance") || "Leave Balance"}{leaveMeta.year ? ` · ${leaveMeta.year}` : ""}
                      </h4>
                      {typeof leaveMeta.years_of_service === "number" && (
                        <span className="text-xs text-muted-foreground">
                          {t("years_of_service") || "Years of service"}: <b>{leaveMeta.years_of_service}</b>
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {(leaveBalances || []).map((b) => {
                        const total = Number(b.entitled_days) + Number(b.carried_over_days) + Number(b.adjustment_days);
                        const pct = total > 0 ? Math.min(100, Math.round((Number(b.taken_days) / total) * 100)) : 0;
                        return (
                          <div key={b.leave_type} className="border border-border rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-foreground capitalize">
                                {t(`hr.leaveTypes.${b.leave_type}`, b.leave_type)}
                              </span>
                              <span className="text-sm font-mono">
                                <b className="text-indigo-700">{b.remaining_days}</b>
                                <span className="text-muted-foreground"> / {total} {t("hr.days") || "days"}</span>
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                              <span>{t("hr.taken") || "Taken"}: {b.taken_days}</span>
                              <span>{t("hr.entitled") || "Entitled"}: {b.entitled_days}</span>
                            </div>
                          </div>
                        );
                      })}
                      {(leaveBalances || []).length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-8">{t("hr.noLeaveBalances", "No leave balance yet")}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Compliance Tab */}
            {activeTab === "compliance" && (
              <div className="p-6 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                  ⚠️ Keep all expiry dates up to date. The system will alert you 90, 30, and 0 days before expiry.
                </div>
                <div>
                  <label htmlFor="national_id" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">National ID / Iqama Number</label>
                  <input id="national_id" name="national_id" type="text" value={formData.national_id || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:border-indigo-500 outline-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="national_id_expiry" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">National ID Expiry</label>
                    <input id="national_id_expiry" name="national_id_expiry" type="date" value={formData.national_id_expiry || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="ID" dateStr={formData.national_id_expiry} />
                  </div>
                  <div>
                    <label htmlFor="iqama_expiry" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Iqama (Residency) Expiry</label>
                    <input id="iqama_expiry" name="iqama_expiry" type="date" value={formData.iqama_expiry || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Iqama" dateStr={formData.iqama_expiry} />
                  </div>
                  <div>
                    <label htmlFor="passport_expiry" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Passport Expiry</label>
                    <input id="passport_expiry" name="passport_expiry" type="date" value={formData.passport_expiry || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Passport" dateStr={formData.passport_expiry} />
                  </div>
                  <div>
                    <label htmlFor="medical_insurance_expiry" className="block text-xs font-semibond text-muted-foreground uppercase mb-1">Medical Insurance Expiry</label>
                    <input id="medical_insurance_expiry" name="medical_insurance_expiry" type="date" value={formData.medical_insurance_expiry || ""} onChange={handleChange} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Medical Ins." dateStr={formData.medical_insurance_expiry} />
                  </div>
                </div>
              </div>
            )}

            {/* AI Copilot Tab */}
            {activeTab === "copilot" && (
              <div className="p-6 overflow-y-auto space-y-5 text-center flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                  <Brain className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-foreground">HR Copilot</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  {t("hr.copilotDesc") || "Analyze this employee's profile, check compliance alerts, and get tailored HR recommendations."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-copilot', {
                      detail: { agentType: 'hr', contextData: { employee_data: formData }, title: "HR Copilot" }
                    }));
                  }}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-sm transition-colors flex items-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  {isRtl ? "تفعيل المساعد الذكي" : "Launch AI Copilot"}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50">
            {t("cancel")}
          </button>
          <button
            type="submit"
            form="employee-form"
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loading ? t("saving") : isEditing ? t("update_employee") : t("add_employee") + " 👤"}
          </button>
        </div>

      </div>
    </div>
  );
}
