"use client";

import { useEffect, useState } from "react";
import type { PublicationContext } from "centrifuge";
import { AlertCircle, Brain, RefreshCw, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProvenanceSurface } from "@/components/ui/provenance";

export default function MorningBriefWidget() {
  const { t } = useLocalization();
  const currentUser = useAppStore((state) => state.currentUser);
  const centrifuge = useAppStore((state) => state.centrifuge);
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!centrifuge || !currentUser) return;
    const channel = `user_${currentUser.id}`;
    const subscription =
      centrifuge.getSubscription(channel) ??
      centrifuge.newSubscription(channel);

    const onPublication = (context: PublicationContext) => {
      const payload = context.data;
      if (payload?.type === "morning_brief") {
        setBrief(payload.content);
        setLoading(false);
      }
    };

    subscription.on("publication", onPublication);
    if (subscription.state === "unsubscribed") subscription.subscribe();

    return () => {
      subscription.removeListener("publication", onPublication);
    };
  }, [centrifuge, currentUser]);

  const triggerMorningBrief = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/agents/morning-brief`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(t("chat.morningBrief.error"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("chat.morningBrief.error"),
      );
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Brain className="size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold">
              {t("dashboard.morningBrief.title")}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {t("dashboard.morningBrief.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerMorningBrief}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading
              ? t("dashboard.morningBrief.auditing")
              : t("dashboard.morningBrief.refresh")}
          </Button>
          {brief ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setBrief(null)}
              aria-label={t("dashboard.morningBrief.clear")}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="danger">
          <AlertCircle />
          <span>{error}</span>
        </Alert>
      ) : null}

      {loading && !brief ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
          <Brain className="size-8 animate-pulse text-brand" aria-hidden />
          <p className="text-center text-sm">
            {t("dashboard.morningBrief.loading")}
          </p>
        </div>
      ) : null}

      {brief ? (
        <ProvenanceSurface
          level="confident-recall"
          className="max-h-[420px] overflow-y-auto"
        >
          <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
            <ReactMarkdown>{brief}</ReactMarkdown>
          </div>
        </ProvenanceSurface>
      ) : null}

      {!brief && !loading && !error ? (
        <p className="my-auto text-center text-sm text-muted-foreground">
          {t("dashboard.morningBrief.empty")}
        </p>
      ) : null}
    </div>
  );
}
