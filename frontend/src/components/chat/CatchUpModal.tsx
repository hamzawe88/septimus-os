"use client";

import React, { useState, useEffect } from "react";
import { Flame, X, Check, Clock, MessageSquare, CheckCircle, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tag } from "@/components/ui/tag";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface CatchUpMessage {
  id?: string | number;
  ID?: string | number;
  Content?: string;
  content?: string;
  User?: {
    Email?: string;
    Name?: string;
  };
  Channel?: {
    Name?: string;
  };
}

export default function CatchUpModal({ isOpen = true, onClose }: { isOpen?: boolean; onClose: () => void }) {
  const { t } = useLocalization();
  const [queue, setQueue] = useState<CatchUpMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "danger">("success");
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/catchup/feed`)
      .then(res => res.json())
      .then(data => {
        if (data.queue) {
          setQueue(data.queue);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const currentMsg = queue[currentIndex];

  const handleSwipe = async (action: "read" | "task" | "later") => {
    if (!currentMsg) return;

    if (action === "task") {
      setIsActing(true);
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/messages/convert-to-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: currentMsg.id || currentMsg.ID,
            project_id: "",
            title: currentMsg.Content || currentMsg.content
          })
        });
        if (!response.ok) throw new Error("convert-to-task failed");
        setToastTone("success");
        setToastMsg(t("chat.catchUp.converted"));
      } catch {
        setToastTone("danger");
        setToastMsg(t("chat.catchUp.convertFailed"));
        return;
      } finally {
        setIsActing(false);
      }
    } else if (action === "read") {
      setToastTone("success");
      setToastMsg(t("chat.catchUp.markedRead"));
    }

    setTimeout(() => setToastMsg(null), 2000);
    setCurrentIndex(prev => prev + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex animate-in items-center justify-center bg-overlay/60 p-4 backdrop-blur-md fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.catchUp.title")}
        className="relative flex h-[580px] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-card text-card-foreground shadow-[var(--shadow-overlay)]"
      >
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-[var(--radius-control)] bg-warning/10 p-2 text-warning">
              <Flame className="size-5" aria-hidden />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-extrabold tracking-tight">{t("chat.catchUp.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("chat.catchUp.description")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>

        {toastMsg && (
          <Alert tone={toastTone} className="absolute start-1/2 top-20 z-50 w-max max-w-[90%] -translate-x-1/2 animate-in shadow-[var(--shadow-overlay)] fade-in slide-in-from-top-3">
            <CheckCircle className="size-4" />
            <AlertDescription>{toastMsg}</AlertDescription>
          </Alert>
        )}

        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6">
          {isLoading ? (
            <div className="w-full space-y-3" aria-label={t("chat.catchUp.loading")}>
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : !currentMsg ? (
            <EmptyState
              icon={<CheckCircle aria-hidden />}
              title={t("chat.catchUp.emptyTitle")}
              description={t("chat.catchUp.emptyDescription")}
              action={<Button onClick={onClose}>{t("chat.catchUp.backToWork")}</Button>}
              className="w-full border-0 bg-transparent shadow-none"
            />
          ) : (
            <article className="flex w-full animate-in flex-col space-y-4 rounded-[var(--radius-surface)] border border-border bg-surface-subtle p-6 shadow-[var(--shadow-raised)] transition-all zoom-in-95">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10 border border-border">
                    <AvatarFallback className="bg-brand text-sm font-bold text-brand-foreground">
                      {(currentMsg.User?.Email || t("chat.composer.unknownInitial")).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h5 className="text-sm font-bold text-foreground">
                      {currentMsg.User?.Name || t("chat.catchUp.systemEmployee")}
                    </h5>
                    <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <MessageSquare className="size-3 text-brand" /> #{currentMsg.Channel?.Name || t("chat.generalChannel")}
                    </span>
                  </div>
                </div>
                <Tag tone="neutral">{currentIndex + 1} {t("chat.catchUp.of")} {queue.length}</Tag>
              </div>

              <div className="min-h-[140px] max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border border-border bg-card p-4 font-sans text-sm leading-relaxed text-foreground">
                {currentMsg.Content || currentMsg.content}
              </div>

              <div className="flex items-center gap-1.5 px-2 text-muted-foreground">
                <Clock className="size-3" />
                <span className="text-[10px]">{t("chat.catchUp.sentInSystem")}</span>
              </div>
            </article>
          )}
        </div>

        {currentMsg && (
          <footer className="grid grid-cols-3 gap-3 border-t border-border bg-surface-subtle p-6">
            <Button 
              onClick={() => handleSwipe("later")}
              variant="outline" 
              disabled={isActing}
              className="h-16 flex-col gap-1 text-[11px]"
            >
              <Clock className="size-5 text-warning" />
              {t("chat.catchUp.later")}
            </Button>

            <Button 
              onClick={() => handleSwipe("task")}
              disabled={isActing}
              className="h-16 flex-col gap-1 text-[11px]"
            >
              <ListTodo className="size-5" />
              {isActing ? t("common.saving") : t("chat.catchUp.convertToTask")}
            </Button>

            <Button 
              onClick={() => handleSwipe("read")}
              variant="secondary"
              disabled={isActing}
              className="h-16 flex-col gap-1 text-[11px] text-success"
            >
              <Check className="size-5" />
              {t("chat.catchUp.markRead")}
            </Button>
          </footer>
        )}

      </section>
    </div>
  );
}
