/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { X, MessageSquare, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
      return localStorage.getItem("septimus_display_name") || "Admin";
    }
    return "Admin";
  });

  useEffect(() => {
    const loadSync = () => {
      if (typeof window === "undefined") return;
      setCurrentUserAvatar(localStorage.getItem("septimus_avatar") || null);
      setCurrentUserName(localStorage.getItem("septimus_display_name") || "Admin");
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
    <div className="w-[320px] shrink-0 border-s border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] flex flex-col h-full transition-all duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] transition-colors">
        <div className="flex items-center space-x-2">
          <h3 className="font-bold text-[15px] text-[var(--sb-bg)] dark:text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--sb-bg)] dark:text-brand" />
            {t("chat.threads")}
          </h3>
        </div>
        <button 
          onClick={() => setIsThreadsListOpen(false)}
          className="p-1 rounded-md hover:bg-[#f8fafc] dark:hover:bg-[#252525] text-[var(--sb-bg)]/70 dark:text-slate-400 transition-colors"
          aria-label={t("common.close")}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <ScrollArea className="flex-1 bg-white dark:bg-[#1a1a1a] transition-colors">
        <div className="p-4 flex flex-col gap-3">
          {threads.length === 0 && (
            <div className="text-center text-sm text-[var(--sb-bg)]/60 dark:text-slate-500 py-10">
              {t("chat.noThreads", "No threads yet")}
            </div>
          )}
          {threads.map((thread) => {
            const isMe = thread.author === "Admin" || thread.author === "admin@septimus.local" || thread.author === currentUserName;
            return (
              <div 
                key={thread.id}
                onClick={() => {
                  setIsThreadsListOpen(false);
                  setActiveThread({
                    id: thread.id,
                    channel_id: activeChannelId,
                    type: thread.is_ai_generated ? "ai" : "human",
                    author: thread.author,
                    time: fmtTime(thread.created_at),
                    text: thread.content,
                  } as unknown as Parameters<typeof setActiveThread>[0]);
                }}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] hover:border-[var(--sb-bg)]/30 dark:hover:border-slate-700 hover:bg-[#f8fafc] dark:hover:bg-[#1a1a1a] shadow-sm cursor-pointer transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6 border border-slate-200 dark:border-slate-700 overflow-hidden">
                      {isMe && currentUserAvatar ? (
                        <img src={currentUserAvatar} alt="Me" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-[var(--sb-bg)] dark:bg-brand text-xs font-bold text-white">
                          {thread.author.charAt(0)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span className="font-semibold text-[var(--sb-bg)] dark:text-slate-100 text-[15px]">{thread.author}</span>
                  </div>
                  <div className="flex items-center text-xs text-[var(--sb-bg)]/70 dark:text-slate-400">
                    <Clock className="w-3 h-3 me-1" />
                    {fmtTime(thread.created_at)}
                  </div>
                </div>
                <div className="text-[15px] text-[var(--sb-bg)]/90 dark:text-slate-300 mb-3 line-clamp-2 leading-relaxed">
                  {thread.content}
                </div>
                {thread.reply_count > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sb-bg)] dark:text-slate-400">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--sb-bg)]/10 dark:bg-slate-800">
                      {thread.reply_count}
                    </span>
                    {t("chat.replies")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
