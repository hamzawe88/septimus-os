"use client";

import React, { useState } from "react";
import {
  X, Save, User, Calendar, BadgeDollarSign, Phone, Mail,
  AlertTriangle, CheckCircle, Building2, CreditCard, Zap
} from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
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

function getDaysUntilExpiry(dateStr?: string): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  const now = new Date();
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ label, dateStr }: { label: string; dateStr?: string }) {
  const days = getDaysUntilExpiry(dateStr);
  if (days === null) return null;

  let bgColor = "bg-slate-100 text-slate-600 border-slate-200";
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
  const [activeTab, setActiveTab] = useState<"personal" | "financial" | "compliance">("personal");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        ? `${API_BASE_URL}/entities/${employee!.id}?workspace_id=${workspaceId}`
        : `${API_BASE_URL}/entities?workspace_id=${workspaceId}`;

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

  const tabs: Array<{ id: "personal" | "financial" | "compliance"; label: string; icon: React.ReactNode }> = [
    { id: "personal", label: t("personal_info"), icon: <User className="w-4 h-4" /> },
    { id: "financial", label: t("salary_iban"), icon: <BadgeDollarSign className="w-4 h-4" /> },
    { id: "compliance", label: t("legal_compliance"), icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

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
          <button type="button" aria-label={t("close_modal")} onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
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
        <div className="flex border-b border-slate-200 bg-slate-50 px-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 me-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
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
                    <label htmlFor="full_name" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("full_name")} *</label>
                    <div className="relative">
                      <User className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                      <input id="full_name" required name="full_name" type="text" value={formData.full_name || ""} onChange={handleChange} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none`} placeholder="Ahmed Al-Rashidi" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="employee_id" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("employee_id")}</label>
                    <input id="employee_id" name="employee_id" type="text" value={formData.employee_id || ""} onChange={handleChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-800 focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="position" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("position_job_title")} *</label>
                    <input id="position" required name="position" type="text" value={formData.position || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none" placeholder={t("position_placeholder")} />
                  </div>
                  <div>
                    <label htmlFor="department" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("department")}</label>
                    <select id="department" name="department" value={formData.department || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none">
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
                    <label htmlFor="email" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("work_email")}</label>
                    <div className="relative">
                      <Mail className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                      <input id="email" name="email" type="email" value={formData.email || ""} onChange={handleChange} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none`} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("mobile_phone")}</label>
                    <div className="relative">
                      <Phone className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                      <input id="phone" name="phone" type="tel" value={formData.phone || ""} onChange={handleChange} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none`} placeholder="+966 5XX XXX XXXX" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="hire_date" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("hire_date")}</label>
                    <div className="relative">
                      <Calendar className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                      <input id="hire_date" name="hire_date" type="date" value={formData.hire_date || ""} onChange={handleChange} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none`} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="status" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("employee_status")}</label>
                    <select id="status" name="status" value={formData.status || "active"} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none">
                      <option value="active">✅ {t("status_active")}</option>
                      <option value="on_leave">🏖️ {t("status_on_leave")}</option>
                      <option value="probation">🔍 {t("status_probation")}</option>
                      <option value="terminated">❌ {t("status_terminated")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
                  <textarea id="notes" name="notes" rows={3} value={formData.notes || ""} onChange={handleChange} className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none resize-none" placeholder="Additional notes, skills, or remarks..." />
                </div>
              </div>
            )}

            {/* Financial Tab */}
            {activeTab === "financial" && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="base_salary" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("base_salary")}</label>
                    <input id="base_salary" name="base_salary" type="number" min="0" value={formData.base_salary || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-500 outline-none" placeholder="8000" />
                  </div>
                  <div>
                    <label htmlFor="housing_allowance" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("housing_allowance")}</label>
                    <input id="housing_allowance" name="housing_allowance" type="number" min="0" value={formData.housing_allowance || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-500 outline-none" placeholder="2000" />
                  </div>
                  <div>
                    <label htmlFor="transport_allowance" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("transport_allowance")}</label>
                    <input id="transport_allowance" name="transport_allowance" type="number" min="0" value={formData.transport_allowance || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-500 outline-none" placeholder="500" />
                  </div>
                </div>

                {/* Salary Summary Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-200 rounded-xl p-5 space-y-2.5">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <BadgeDollarSign className="w-4 h-4 text-indigo-600" />
                    {t("monthly_compensation_summary")}
                  </h4>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>{t("base_salary")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.base_salary || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>{t("housing_allowance")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.housing_allowance || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>{t("transport_allowance")}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Number(formData.transport_allowance || 0))}</span>
                  </div>
                  <div className="pt-2 border-t border-indigo-200 flex justify-between items-baseline">
                    <span className="font-bold text-slate-800">{t("total_monthly_wps")}:</span>
                    <span className="text-2xl font-black text-indigo-700 font-mono">{formatCurrency(totalCompensation)}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="iban" className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    {t("bank_iban")} <Building2 className={`inline w-3.5 h-3.5 ${isRtl ? 'me-1' : 'ms-1'} text-slate-400`} />
                  </label>
                  <div className="relative">
                    <CreditCard className={`absolute ${isRtl ? 'end-3' : 'start-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
                    <input id="iban" name="iban" type="text" value={formData.iban || ""} onChange={handleChange} className={`w-full bg-white border border-slate-300 rounded-lg ${isRtl ? 'pe-9 ps-3' : 'ps-9 pe-3'} py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-500 outline-none`} placeholder="SA00 0000 0000 0000 0000 0000" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{t("used_for_wps")}</p>
                </div>
              </div>
            )}

            {/* Compliance Tab */}
            {activeTab === "compliance" && (
              <div className="p-6 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                  ⚠️ Keep all expiry dates up to date. The system will alert you 90, 30, and 0 days before expiry.
                </div>
                <div>
                  <label htmlFor="national_id" className="block text-xs font-semibold text-slate-500 uppercase mb-1">National ID / Iqama Number</label>
                  <input id="national_id" name="national_id" type="text" value={formData.national_id || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 focus:border-indigo-500 outline-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="national_id_expiry" className="block text-xs font-semibold text-slate-500 uppercase mb-1">National ID Expiry</label>
                    <input id="national_id_expiry" name="national_id_expiry" type="date" value={formData.national_id_expiry || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="ID" dateStr={formData.national_id_expiry} />
                  </div>
                  <div>
                    <label htmlFor="iqama_expiry" className="block text-xs font-semibold text-slate-500 uppercase mb-1">Iqama (Residency) Expiry</label>
                    <input id="iqama_expiry" name="iqama_expiry" type="date" value={formData.iqama_expiry || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Iqama" dateStr={formData.iqama_expiry} />
                  </div>
                  <div>
                    <label htmlFor="passport_expiry" className="block text-xs font-semibold text-slate-500 uppercase mb-1">Passport Expiry</label>
                    <input id="passport_expiry" name="passport_expiry" type="date" value={formData.passport_expiry || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Passport" dateStr={formData.passport_expiry} />
                  </div>
                  <div>
                    <label htmlFor="medical_insurance_expiry" className="block text-xs font-semibond text-slate-500 uppercase mb-1">Medical Insurance Expiry</label>
                    <input id="medical_insurance_expiry" name="medical_insurance_expiry" type="date" value={formData.medical_insurance_expiry || ""} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none" />
                    <ExpiryBadge label="Medical Ins." dateStr={formData.medical_insurance_expiry} />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
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
