/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Target, Plus, Trash2, Send, Star, ClipboardCheck } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { PageHeader } from "@/components/ui/page-header";

interface Goal {
  id: string; title: string; metric?: string; target_value: number;
  current_value: number; progress_percent: number; period?: string; status: string;
}
interface Review {
  id: string; period?: string; overall_rating: number; strengths?: string;
  improvements?: string; status: string;
}

export default function HrPerformance() {
  const { t } = useLocalization();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  const [goalForm, setGoalForm] = useState({ title: "", metric: "", target_value: "", period: "" });
  const [reviewForm, setReviewForm] = useState({ period: "", overall_rating: "3", strengths: "", improvements: "" });

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const res = await apiGet<{ data: any[] }>(`/employees`);
        setEmployees((res.data || []).map((e: any) => ({ id: e.id, name: e.data?.full_name || e.name || "—" })));
      } catch (err) { console.error("Failed to load employees", err); }
    });
  }, []);

  const loadFor = useCallback(async (empId: string) => {
    if (!empId) { setGoals([]); setReviews([]); return; }
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        apiGet<{ data: Goal[] }>(`/goals?employee_id=${empId}`),
        apiGet<{ data: Review[] }>(`/reviews?employee_id=${empId}`),
      ]);
      setGoals(g.data || []);
      setReviews(r.data || []);
    } catch (err) { console.error("Failed to load performance", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => loadFor(selected)); }, [selected, loadFor]);

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !goalForm.title.trim()) return;
    await apiPost(`/goals`, {
      employee_id: selected, title: goalForm.title, metric: goalForm.metric,
      target_value: Number(goalForm.target_value) || 0, current_value: 0, period: goalForm.period,
    });
    setGoalForm({ title: "", metric: "", target_value: "", period: "" });
    await loadFor(selected);
  };

  const setProgress = async (g: Goal, current: number) => {
    await apiPut(`/goals/${g.id}`, { current_value: current });
    await loadFor(selected);
  };
  const removeGoal = async (id: string) => { await apiDelete(`/goals/${id}`); await loadFor(selected); };

  const addReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    await apiPost(`/reviews`, {
      employee_id: selected, period: reviewForm.period,
      overall_rating: Number(reviewForm.overall_rating) || 0,
      strengths: reviewForm.strengths, improvements: reviewForm.improvements, status: "draft",
    });
    setReviewForm({ period: "", overall_rating: "3", strengths: "", improvements: "" });
    await loadFor(selected);
  };
  const submitReview = async (id: string) => { await apiPut(`/reviews/${id}`, { status: "submitted" }); await loadFor(selected); };

  const stars = (n: number) => (
    <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}</span>
  );

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<Target className="w-6 h-6 text-brand" />}
        title={t("hr.performance", "Performance")}
        description={t("hr.performanceDesc", "Set goals and write reviews for your team.")}
      />

      <div className="p-8 max-w-4xl w-full mx-auto space-y-8">
        <div>
          <label htmlFor="emp" className="block text-sm font-medium text-foreground mb-1">{t("hr.employee", "Employee")}</label>
          <select id="emp" value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full max-w-md border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand outline-none">
            <option value="">{t("hr.selectEmployee", "Select an employee")}</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {selected && (loading ? (
          <div className="text-muted-foreground text-sm py-8 text-center">{t("common.loading", "Loading…")}</div>
        ) : (
          <>
            {/* Goals */}
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Target className="w-5 h-5 text-brand" />{t("hr.goals", "Goals")}</h2>
              <div className="space-y-3 mb-4">
                {goals.map(g => (
                  <div key={g.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-foreground">{g.title} {g.period && <span className="text-xs text-muted-foreground font-mono">· {g.period}</span>}</span>
                      <button onClick={() => removeGoal(g.id)} className="text-muted-foreground hover:text-rose-600" title={t("common.delete", "Delete")}><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: `${g.progress_percent}%` }} /></div>
                      <span className="font-mono text-sm font-bold text-brand w-12 text-end">{g.progress_percent}%</span>
                      <input type="number" defaultValue={g.current_value} onBlur={(e) => { const v = Number(e.target.value); if (v !== g.current_value) setProgress(g, v); }}
                        className="w-20 border border-border rounded px-2 py-1 text-sm font-mono" title={t("hr.currentValue", "Current")} />
                      <span className="text-xs text-muted-foreground font-mono">/ {g.target_value} {g.metric}</span>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && <p className="text-sm text-muted-foreground">{t("hr.noGoals", "No goals yet.")}</p>}
              </div>
              <form onSubmit={addGoal} className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2"><label htmlFor="gt" className="block text-xs font-medium text-muted-foreground mb-1">{t("hr.goalTitle", "Goal")}</label><input id="gt" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} required className="w-full border border-border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="gtarget" className="block text-xs font-medium text-muted-foreground mb-1">{t("hr.target", "Target")}</label><input id="gtarget" type="number" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm" /></div>
                <button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-center gap-1"><Plus className="w-4 h-4" />{t("common.add", "Add")}</button>
              </form>
            </section>

            {/* Reviews */}
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand" />{t("hr.reviews", "Reviews")}</h2>
              <div className="space-y-3 mb-4">
                {reviews.map(r => (
                  <div key={r.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3"><span className="font-semibold text-foreground">{r.period || t("hr.review", "Review")}</span>{stars(r.overall_rating)}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "draft" ? "bg-muted text-muted-foreground" : r.status === "acknowledged" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{r.status}</span>
                        {r.status === "draft" && <button onClick={() => submitReview(r.id)} className="text-xs font-semibold text-white bg-brand hover:bg-brand/90 px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><Send className="w-3 h-3" />{t("hr.submit", "Submit")}</button>}
                      </div>
                    </div>
                    {(r.strengths || r.improvements) && <div className="mt-2 text-sm text-muted-foreground space-y-1">{r.strengths && <p><b className="text-muted-foreground">{t("ess.strengths", "Strengths")}:</b> {r.strengths}</p>}{r.improvements && <p><b className="text-muted-foreground">{t("ess.improvements", "Improve")}:</b> {r.improvements}</p>}</div>}
                  </div>
                ))}
                {reviews.length === 0 && <p className="text-sm text-muted-foreground">{t("hr.noReviews", "No reviews yet.")}</p>}
              </div>
              <form onSubmit={addReview} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label htmlFor="rp" className="block text-xs font-medium text-muted-foreground mb-1">{t("hr.period", "Period")}</label><input id="rp" value={reviewForm.period} onChange={e => setReviewForm({ ...reviewForm, period: e.target.value })} placeholder="2026-H1" className="w-full border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label htmlFor="rr" className="block text-xs font-medium text-muted-foreground mb-1">{t("hr.rating", "Rating")}</label>
                    <select id="rr" value={reviewForm.overall_rating} onChange={e => setReviewForm({ ...reviewForm, overall_rating: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm">{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label htmlFor="rs" className="block text-xs font-medium text-muted-foreground mb-1">{t("ess.strengths", "Strengths")}</label><input id="rs" value={reviewForm.strengths} onChange={e => setReviewForm({ ...reviewForm, strengths: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label htmlFor="ri" className="block text-xs font-medium text-muted-foreground mb-1">{t("ess.improvements", "Areas to improve")}</label><input id="ri" value={reviewForm.improvements} onChange={e => setReviewForm({ ...reviewForm, improvements: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="flex justify-end"><button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t("hr.addReview", "Add review")}</button></div>
              </form>
            </section>
          </>
        ))}
      </div>
    </div>
  );
}
