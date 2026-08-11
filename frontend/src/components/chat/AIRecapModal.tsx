"use client";

import React from "react";
import { Sparkles, X, CheckCircle2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { ProvenanceSurface } from "@/components/ui/provenance";

interface AIRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  summary: string | null;
  citations: string[];
  isLoading: boolean;
}

export default function AIRecapModal({
  isOpen,
  onClose,
  channelName,
  summary,
  citations,
  isLoading
}: AIRecapModalProps) {
  const { t } = useLocalization();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/55 p-4 backdrop-blur-sm animate-in fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-recap-title"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]"
      >
        
        {/* Modal Header */}
        <div className="flex items-center justify-between bg-brand px-6 py-4 text-brand-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 animate-pulse" />
            <h3 id="ai-recap-title" className="text-lg font-bold">{t("chat.recap.title")}</h3>
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
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-sm font-semibold text-muted-foreground">{t("chat.recap.targetChannel")}</span>
            <span className="rounded-[var(--radius-control)] bg-brand-light px-3 py-1 font-mono text-xs font-bold text-brand">#{channelName}</span>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
              <p className="animate-pulse text-sm font-medium text-brand">{t("chat.recap.loading")}</p>
            </div>
          ) : (
            <>
              <ProvenanceSurface level={citations.length > 0 ? "verified" : "confident-recall"}>
                <p className="whitespace-pre-wrap">
                  {summary || t("chat.recap.empty")}
                </p>
              </ProvenanceSurface>

              {citations && citations.length > 0 && (
                <div className="pt-2">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> {t("chat.recap.citations")}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {citations.map((citeId, idx) => (
                      <span key={idx} className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-control)] bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
                        <MessageSquare className="w-3 h-3" /> {t("chat.recap.message")} #{citeId.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/35 px-6 py-3.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            🔒 {t("chat.recap.privacy")}
          </span>
          <Button onClick={onClose}>
            {t("chat.recap.close")}
          </Button>
        </div>

      </section>
    </div>
  );
}
