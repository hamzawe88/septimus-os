"use client";

import React, { useState } from "react";
import { Sun, X, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";
import { Alert } from "@/components/ui/alert";
import { ProvenanceSurface } from "@/components/ui/provenance";

interface MorningBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MorningBriefModal({ isOpen, onClose }: MorningBriefModalProps) {
  const { t } = useLocalization();
  const { currentUser, centrifuge } = useAppStore();
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!centrifuge || !currentUser?.id) return;
    const channel = `user_${currentUser.id}`;
    const sub = centrifuge.getSubscription(channel) ?? centrifuge.newSubscription(channel);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onPublication = (ctx: any) => {
      const data = ctx.data;
      if (data?.type === 'morning_brief') {
        setContent(data.content);
        setIsLoading(false);
      }
    };

    sub.on('publication', onPublication);
    
    // Call subscribe if it's not already connected
    if (sub.state === 'unsubscribed') {
      sub.subscribe();
    }

    return () => {
      sub.off('publication', onPublication);
    };
  }, [centrifuge, currentUser?.id]);

  if (!isOpen) return null;

  const triggerMorningBrief = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/agents/morning-brief`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to trigger morning brief");
      }

      // Wait for AI response via WebSocket
      setTimeout(() => {
        setIsLoading((prev) => {
          if (prev) {
            setError(t("chat.morningBrief.timeout"));
            return false;
          }
          return prev;
        });
      }, 60000); // 60 seconds timeout
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("chat.morningBrief.error"));
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-foreground/55 p-4 backdrop-blur-sm animate-in fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-brief-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]"
      >
        
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-warning px-6 py-4 text-brand-foreground">
          <div className="flex items-center gap-2">
            <Sun className="w-6 h-6 animate-spin-slow" />
            <h3 id="morning-brief-title" className="text-lg font-bold">{t("chat.morningBrief.title")}</h3>
          </div>
          <Button
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
            variant="ghost"
            size="icon-sm"
            className="text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-start">
          {!content && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <Calendar className="w-16 h-16 text-warning/25" />
              <p className="max-w-md text-muted-foreground">
                {t("chat.morningBrief.description")}
              </p>
              <Button onClick={triggerMorningBrief}>
                <Sun className="w-4 h-4" />
                {t("chat.morningBrief.generate")}
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="w-10 h-10 animate-spin text-warning" />
              <p className="animate-pulse text-sm font-medium text-warning">
                {t("chat.morningBrief.loading")}
              </p>
            </div>
          )}

          {error && (
            <Alert tone="danger">{error}</Alert>
          )}

          {content && !isLoading && (
            <ProvenanceSurface level="confident-recall">
              <p className="whitespace-pre-wrap">{content}</p>
            </ProvenanceSurface>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/35 px-6 py-3.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            🔒 {t("chat.morningBrief.schedule")}
          </span>
          <Button onClick={onClose} variant="outline">
            {t("common.close")}
          </Button>
        </div>

      </section>
    </div>
  );
}
