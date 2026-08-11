"use client";

import React, { useState, useEffect, useCallback } from "react";
import { UserCircle, Save, Lock } from "lucide-react";
import { apiGet, apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

interface EmployeeData {
  full_name?: string;
  department?: string;
  position?: string;
  phone?: string;
  address?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  personal_email?: string;
  [k: string]: unknown;
}

export default function MyProfilePage() {
  const { t } = useLocalization();
  const [data, setData] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: "", address: "", emergency_contact: "", emergency_phone: "", personal_email: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ data: { data: EmployeeData } }>(`/me/employee`);
      const d = res.data?.data || {};
      setData(d);
      setForm({
        phone: d.phone || "",
        address: d.address || "",
        emergency_contact: d.emergency_contact || "",
        emergency_phone: d.emergency_phone || "",
        personal_email: d.personal_email || "",
      });
      setLinked(true);
    } catch (err) {
      setLinked(false);
      console.error("Failed to load profile", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await apiPut(`/me/employee`, form);
      setSaved(true);
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }
  if (!linked) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-8">
        <div className="text-center text-muted-foreground max-w-md">
          <UserCircle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>{t("ess.notLinked", "No employee record is linked to your account. Contact HR.")}</p>
        </div>
      </div>
    );
  }

  const field = (id: string, label: string, key: keyof typeof form, type = "text") => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <input id={id} type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none" />
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<UserCircle className="w-6 h-6 text-brand" />}
        title={t("ess.myProfile", "My Profile")}
        description={[data?.full_name, data?.position, data?.department].filter(Boolean).join(" · ")}
      />

      <div className="p-8 max-w-2xl w-full mx-auto">
        {/* HR-controlled (read-only) */}
        <div className="bg-muted border border-border rounded-xl p-4 mb-6 flex items-start gap-3">
          <Lock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">{t("ess.hrControlledNote", "Name, position, salary and legal fields are managed by HR. You can update your contact details below.")}</p>
        </div>

        <form onSubmit={save} className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          {errorMsg && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{errorMsg}</div>}
          {saved && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{t("ess.profileSaved", "Your details were saved.")}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field("phone", t("hr.phone", "Phone"), "phone", "tel")}
            {field("personal_email", t("ess.personalEmail", "Personal email"), "personal_email", "email")}
          </div>
          {field("address", t("ess.address", "Address"), "address")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field("emergency_contact", t("ess.emergencyContact", "Emergency contact"), "emergency_contact")}
            {field("emergency_phone", t("ess.emergencyPhone", "Emergency phone"), "emergency_phone", "tel")}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-brand hover:bg-brand/90 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? t("common.saving", "Saving…") : t("common.save", "Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
