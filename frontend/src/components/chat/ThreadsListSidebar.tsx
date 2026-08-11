/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { X, MessageSquare, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface RealThread {
  id: string;
  content: string;
  created_at: string;
  author: string;
  is_ai_generated: boolean;
  reply_count: number;
}

export default function ThreadsListSidebar() {
  const { isThreadsListOpen, setIsThreadsListOpen, activeChannelId, setActiveThread } = useAppStore();
  const { t } = useLocalization();

  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("septimus_avatar") || null;
    }
    return null;
  });
  const [currentUserName, setCurrentUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("septimus_display_name") || "";
    }
    return "";
  });

  useEffect(() => {
    const loadSync = () => {
      if (typeof window === "undefined") return;
      setCurrentUserAvatar(localStorage.getItem("septimus_avatar") || null);
      setCurrentUserName(localStorage.getItem("septimus_display_name") || "");
    };
    loadSync();
    window.addEventListener("septimus_avatar_updated", loadSync);
    window.addEventListener("septimus_display_name_updated", loadSync);
    return () => {
      window.removeEventListener("septimus_avatar_updated", loadSync);
      window.removeEventListener("septimus_display_name_updated", loadSync);
    };
  }, []);

  const [threads, setThreads] = useState<RealThread[]>([]);

  useEffect(() => {
    if (!isThreadsListOpen || !activeChannelId) return;
    let cancelled = false;
    fetchWithAuth(`${API_BASE_URL}/channels/${activeChannelId}/threads`)
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((d) => { if (!cancelled) setThreads(d.threads || []); })
      .catch(() => { if (!cancelled) setThreads([]); });
    return () => { cancelled = true; };
  }, [isThreadsListOpen, activeChannelId]);

  if (!isThreadsListOpen) return null;

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <aside
      aria-label={t("chat.threads")}
      className="flex h-full w-[320px] shrink-0 flex-col border-s border-border bg-card text-card-foreground transition-all duration-300"
    >
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-foreground">
            <MessageSquare className="size-4 text-brand" aria-hidden />
            {t("chat.threads")}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setIsThreadsListOpen(false)}
          className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("common.close")}
        >
          <X className="size-5" />
        </button>
      </div>

      <ScrollArea className="flex-1 bg-card">
        <div className="flex flex-col gap-3 p-4">
          {threads.length === 0 && (
            <EmptyState
              icon={<MessageSquare aria-hidden />}
              title={t("chat.noThreads")}
              description={t("chat.noThreadsDescription")}
              className="border-0 py-10 shadow-none"
            />
          )}
          {threads.map((thread) => {
            const isMe = thread.author === "Admin" || thread.author === "admin@septimus.local" || (currentUserName && thread.author === currentUserName);
            return (
              <button
                type="button"
                key={thread.id}
                onClick={() => {
                  if (!activeChannelId) return;
                  setIsThreadsListOpen(false);
                  setActiveThread({
                    id: thread.id,
                    channel_id: activeChannelId,
                    type: thread.is_ai_generated ? "ai" : "human",
                    author: thread.author,
                    time: fmtTime(thread.created_at),
                    text: thread.content,
                  });
                }}
                className="group rounded-[var(--radius-control)] border border-border bg-card p-3 text-start shadow-[var(--shadow-raised)] transition-all hover:border-brand/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6 overflow-hidden border border-border">
                      {isMe && currentUserAvatar ? (
                        <img src={currentUserAvatar} alt={t("chat.myAvatar")} className="size-full rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-brand text-xs font-bold text-brand-foreground">
                          {thread.author.charAt(0) || t("chat.composer.unknownInitial")}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="text-[15px] font-semibold text-foreground">{thread.author || t("chat.unknownUser")}</span>
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="me-1 size-3" aria-hidden />
                    <time dateTime={thread.created_at}>{fmtTime(thread.created_at)}</time>
                  </div>
                </div>
                <div className="mb-3 line-clamp-2 text-[15px] leading-relaxed text-foreground-muted">
                  {thread.content}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {thread.reply_count > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className="flex size-4 items-center justify-center rounded-full bg-muted">
                        {thread.reply_count}
                      </span>
                      {t("chat.replies")}
                    </div>
                  ) : <span />}
                  {thread.is_ai_generated ? <ProvenanceBadge level="speculation" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}
