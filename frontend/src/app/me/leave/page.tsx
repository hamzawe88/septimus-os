"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CalendarClock, Plus, Check, Clock, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";

interface Balance {
  leave_type: string;
  entitled_days: number;
  carried_over_days: number;
  adjustment_days: number;
  taken_days: number;
  remaining_days: number;
}

interface MyRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
}

export default function MyLeavePage() {
  const { t } = useLocalization();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [meta, setMeta] = useState<{ employee_name?: string; years_of_service?: number; year?: number }>({});
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [bal, reqs] = await Promise.all([
        apiGet<{ data: Balance[]; employee_name?: string; years_of_service?: number; year?: number }>(`/me/leave-balances`),
        apiGet<{ data: MyRequest[] }>(`/me/leave-requests`),
      ]);
      setBalances(bal.data || []);
      setMeta({ employee_name: bal.employee_name, years_of_service: bal.years_of_service, year: bal.year });
      setRequests(reqs.data || []);
      setLinked(true);
    } catch (err) {
      // 404 = no employee record linked to this account.
      setLinked(false);
      console.error("Failed to load my leave", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiPost(`/me/leave-requests`, form);
      setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
      await load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === "approved") return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><Check className="w-3 h-3" />{t("hr.approved", "Approved")}</span>;
    if (s === "rejected") return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 inline-flex items-center gap-1"><X className="w-3 h-3" />{t("hr.rejected", "Rejected")}</span>;
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 inline-flex items-center gap-1"><Clock className="w-3 h-3" />{t("hr.pending", "Pending")}</span>;
  };

  if (loading) {
    return <LoadingState />;
  }

  if (!linked) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-8">
        <div className="text-center text-muted-foreground max-w-md">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>{t("ess.notLinked", "No employee record is linked to your account. Contact HR.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <div className="flex-none px-8 py-6 border-b border-border bg-card">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-brand" />
          {t("ess.myLeave", "My Leave")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {meta.employee_name}
          {typeof meta.years_of_service === "number" && <span className="ms-2 text-sm">· {t("years_of_service", "Years of service")}: {meta.years_of_service}</span>}
        </p>
      </div>

      <div className="p-8 space-y-8 max-w-4xl w-full mx-auto">
        {/* Balances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map((b) => {
            const total = Number(b.entitled_days) + Number(b.carried_over_days) + Number(b.adjustment_days);
            const pct = total > 0 ? Math.min(100, Math.round((Number(b.taken_days) / total) * 100)) : 0;
            return (
              <div key={b.leave_type} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground capitalize">{t(`hr.leaveTypes.${b.leave_type}`, b.leave_type)}</span>
                  <span className="text-sm font-mono"><b className="text-brand">{b.remaining_days}</b><span className="text-muted-foreground"> / {total}</span></span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>{t("hr.taken", "Taken")}: {b.taken_days}</span>
                  <span>{t("hr.entitled", "Entitled")}: {b.entitled_days}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* New request */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-brand" />{t("ess.newRequest", "Request Leave")}</h2>
          {errorMsg && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{errorMsg}</div>}
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lt" className="block text-sm font-medium text-foreground mb-1">{t("hr.leaveType", "Leave type")}</label>
              <select id="lt" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none">
                <option value="annual">{t("hr.leaveTypes.annual", "Annual")}</option>
                <option value="sick">{t("hr.leaveTypes.sick", "Sick")}</option>
                <option value="hajj">{t("hr.leaveTypes.hajj", "Hajj")}</option>
                <option value="unpaid">{t("hr.leaveTypes.unpaid", "Unpaid")}</option>
              </select>
            </div>
            <div />
            <div>
              <label htmlFor="sd" className="block text-sm font-medium text-foreground mb-1">{t("hr.startDate", "Start date")}</label>
              <input id="sd" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none" />
            </div>
            <div>
              <label htmlFor="ed" className="block text-sm font-medium text-foreground mb-1">{t("hr.endDate", "End date")}</label>
              <input id="ed" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="rs" className="block text-sm font-medium text-foreground mb-1">{t("hr.reason", "Reason")}</label>
              <input id="rs" type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none" />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-brand hover:bg-brand/90 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                <Plus className="w-4 h-4" />{submitting ? t("hr.submitting", "Submitting…") : t("hr.submitRequest", "Submit")}
              </button>
            </div>
          </form>
        </div>

        {/* My requests */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{t("ess.myRequests", "My Requests")}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium text-start">{t("hr.leaveType", "Type")}</th>
                  <th className="px-6 py-3 font-medium text-start">{t("hr.duration", "Duration")}</th>
                  <th className="px-6 py-3 font-medium text-start">{t("hr.daysCount", "Days")}</th>
                  <th className="px-6 py-3 font-medium text-start">{t("common.status", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {requests.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">{t("ess.noRequests", "No leave requests yet.")}</td></tr>
                ) : requests.map((r) => (
                  <tr key={r.id} className="hover:bg-background">
                    <td className="px-6 py-3 capitalize">{t(`hr.leaveTypes.${r.leave_type}`, r.leave_type)}</td>
                    <td className="px-6 py-3 text-muted-foreground text-xs">{r.start_date} → {r.end_date}</td>
                    <td className="px-6 py-3 font-mono">{r.days}</td>
                    <td className="px-6 py-3">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
