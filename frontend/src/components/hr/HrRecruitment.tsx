"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Star, ChevronLeft, X, UserCheck, Briefcase } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";

interface Candidate {
  id: string; full_name: string; email?: string; position?: string;
  stage: string; rating: number; source?: string; hired_employee_id?: string | null;
}

const STAGES = ["applied", "screening", "interview", "offer"];
const nextStage = (s: string) => { const i = STAGES.indexOf(s); return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null; };

export default function HrRecruitment() {
  const { t } = useLocalization();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ full_name: "", position: "", source: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCandidates((await apiGet<{ data: Candidate[] }>(`/candidates`)).data || []); }
    catch (err) { console.error("Failed to load candidates", err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    await apiPost(`/candidates`, form);
    setForm({ full_name: "", position: "", source: "" });
    await load();
  };
  const move = async (id: string, stage: string) => { setBusy(id); try { await apiPut(`/candidates/${id}`, { stage }); await load(); } finally { setBusy(null); } };
  const hire = async (id: string) => { setBusy(id); try { await apiPost(`/candidates/${id}/hire`, {}); await load(); } finally { setBusy(null); } };

  const stars = (n: number) => <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3 h-3 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}</span>;

  const stageLabel = (s: string) => t(`hr.stages.${s}`, s.charAt(0).toUpperCase() + s.slice(1));
  const hiredCount = candidates.filter(c => c.stage === "hired").length;
  const rejectedCount = candidates.filter(c => c.stage === "rejected").length;

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-hidden">
      <div className="flex-none px-8 py-5 border-b border-border bg-card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Briefcase className="w-6 h-6 text-brand" />{t("hr.recruitment", "Recruitment")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("hr.recruitmentDesc", "Move candidates through the hiring pipeline.")} · <span className="text-emerald-600">{hiredCount} {t("hr.stages.hired", "hired")}</span> · <span className="text-muted-foreground">{rejectedCount} {t("hr.stages.rejected", "rejected")}</span></p>
        </div>
        <form onSubmit={add} className="flex items-end gap-2">
          <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder={t("hr.candidateName", "Candidate name")} required className="border border-border rounded-lg px-3 py-2 text-sm w-40" />
          <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder={t("hr.jobTitle", "Position")} className="border border-border rounded-lg px-3 py-2 text-sm w-36" />
          <button type="submit" className="bg-brand hover:bg-brand/90 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t("common.add", "Add")}</button>
        </form>
      </div>

      {/* Pipeline board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-4 h-full min-w-max">
          {STAGES.map(stage => {
            const col = candidates.filter(c => c.stage === stage);
            return (
              <div key={stage} className="w-72 flex-shrink-0 flex flex-col bg-muted/60 rounded-xl">
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">{stageLabel(stage)}</span>
                  <span className="text-xs font-mono text-muted-foreground bg-card rounded-full px-2 py-0.5">{col.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                  {col.map(cd => (
                    <div key={cd.id} className="bg-card border border-border rounded-lg p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">{cd.full_name}</span>
                        {cd.rating > 0 && stars(cd.rating)}
                      </div>
                      {cd.position && <p className="text-xs text-muted-foreground mt-0.5">{cd.position}</p>}
                      {cd.source && <p className="text-[11px] text-muted-foreground mt-0.5">{cd.source}</p>}
                      <div className="flex items-center gap-1.5 mt-2.5">
                        {stage === "offer" ? (
                          <button onClick={() => hire(cd.id)} disabled={busy === cd.id} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2 py-1 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"><UserCheck className="w-3.5 h-3.5" />{t("hr.hire", "Hire")}</button>
                        ) : nextStage(stage) && (
                          <button onClick={() => move(cd.id, nextStage(stage)!)} disabled={busy === cd.id} className="flex-1 bg-brand hover:bg-brand/90 text-white rounded-md px-2 py-1 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50">
                            {stageLabel(nextStage(stage)!)} <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
                          </button>
                        )}
                        <button onClick={() => move(cd.id, "rejected")} disabled={busy === cd.id} className="text-rose-500 hover:bg-rose-50 rounded-md p-1.5 disabled:opacity-50" title={t("hr.reject", "Reject")}><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">{t("hr.noCandidates", "No candidates")}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
