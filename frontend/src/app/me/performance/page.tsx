"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Target, Star, Check, ClipboardCheck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";

interface Goal {
  id: string;
  title: string;
  description?: string;
  metric?: string;
  target_value: number;
  current_value: number;
  progress_percent: number;
  period?: string;
  status: string;
}

interface Review {
  id: string;
  period?: string;
  overall_rating: number;
  strengths?: string;
  improvements?: string;
  status: string;
  acknowledged_at?: string | null;
  created_at: string;
}

export default function MyPerformancePage() {
  const { t } = useLocalization();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        apiGet<{ data: Goal[] }>(`/me/goals`),
        apiGet<{ data: Review[] }>(`/me/reviews`),
      ]);
      setGoals(g.data || []);
      setReviews(r.data || []);
      setLinked(true);
    } catch (err) {
      setLinked(false);
      console.error("Failed to load performance", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const acknowledge = async (id: string) => {
    setAcking(id);
    try {
      await apiPost(`/me/reviews/${id}/acknowledge`, {});
      await load();
    } catch (err) {
      console.error("Failed to acknowledge", err);
    } finally {
      setAcking(null);
    }
  };

  const stars = (n: number) => (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-4 h-4 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );

  if (loading) {
    return <LoadingState />;
  }
  if (!linked) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-8">
        <div className="text-center text-muted-foreground max-w-md">
          <Target className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p>{t("ess.notLinked", "No employee record is linked to your account. Contact HR.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-y-auto">
      <PageHeader
        icon={<Target className="w-6 h-6 text-brand" />}
        title={t("ess.myPerformance", "My Performance")}
        description={t("ess.myPerformanceDesc", "Your goals and performance reviews.")}
      />

      <div className="p-8 max-w-4xl w-full mx-auto space-y-10">
        {/* Goals */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-brand" />{t("ess.myGoals", "My Goals")}</h2>
          {goals.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground shadow-sm">{t("ess.noGoals", "No goals set yet.")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((g) => (
                <div key={g.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-foreground">{g.title}</span>
                    {g.period && <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{g.period}</span>}
                  </div>
                  {g.description && <p className="text-sm text-muted-foreground mb-3">{g.description}</p>}
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-mono text-muted-foreground">{g.current_value} / {g.target_value} {g.metric}</span>
                    <span className="font-mono font-bold text-brand">{g.progress_percent}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${g.progress_percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reviews */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-brand" />{t("ess.myReviews", "My Reviews")}</h2>
          {reviews.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground shadow-sm">{t("ess.noReviews", "No reviews yet.")}</div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">{r.period || t("ess.review", "Review")}</span>
                      {stars(r.overall_rating)}
                    </div>
                    {r.status === "acknowledged" ? (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full inline-flex items-center gap-1"><Check className="w-3 h-3" />{t("ess.acknowledged", "Acknowledged")}</span>
                    ) : (
                      <button onClick={() => acknowledge(r.id)} disabled={acking === r.id} className="text-xs font-semibold text-white bg-brand hover:bg-brand/90 px-3 py-1.5 rounded-lg disabled:opacity-50">
                        {acking === r.id ? t("common.saving", "Saving…") : t("ess.acknowledge", "Acknowledge")}
                      </button>
                    )}
                  </div>
                  {r.strengths && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">{t("ess.strengths", "Strengths")}</p>
                      <p className="text-sm text-foreground">{r.strengths}</p>
                    </div>
                  )}
                  {r.improvements && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">{t("ess.improvements", "Areas to improve")}</p>
                      <p className="text-sm text-foreground">{r.improvements}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
