import React from "react";
import { useAppStore } from "@/store/useAppStore";
import { X, MessageSquare, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function ThreadsListSidebar() {
  const { isThreadsListOpen, setIsThreadsListOpen, activeChannelId, setActiveThread } = useAppStore();
  const { t } = useLocalization();

  if (!isThreadsListOpen) return null;

  // Mock threads for UI demonstration purposes
  const mockThreads = [
    { id: "thread-1", author: "Hamza We", time: "1:30 PM", text: t("chat.mockThread1"), replies: 4 },
    { id: "thread-2", author: "AI Agent", time: "1:45 PM", text: t("chat.mockThread2"), replies: 2 },
    { id: "thread-3", author: "System", time: "2:00 PM", text: t("chat.mockThread3"), replies: 0 },
  ];

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
          {mockThreads.map((thread) => (
            <div 
              key={thread.id}
              onClick={() => {
                setIsThreadsListOpen(false); // Close list
                setActiveThread({
                  id: thread.id,
                  channel_id: activeChannelId,
                  type: "human",
                  author: thread.author,
                  time: thread.time,
                  text: thread.text,
                } as unknown as Parameters<typeof setActiveThread>[0]);
              }}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] hover:border-[var(--sb-bg)]/30 dark:hover:border-slate-700 hover:bg-[#f8fafc] dark:hover:bg-[#1a1a1a] shadow-sm cursor-pointer transition-all group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 border border-slate-200 dark:border-slate-700">
                    <AvatarFallback className="bg-[var(--sb-bg)] dark:bg-brand text-xs font-bold text-white">
                      {thread.author.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-[var(--sb-bg)] dark:text-slate-100 text-[15px]">{thread.author}</span>
                </div>
                <div className="flex items-center text-xs text-[var(--sb-bg)]/70 dark:text-slate-400">
                  <Clock className="w-3 h-3 me-1" />
                  {thread.time}
                </div>
              </div>
              <div className="text-[15px] text-[var(--sb-bg)]/90 dark:text-slate-300 mb-3 line-clamp-2 leading-relaxed">
                {thread.text}
              </div>
              {thread.replies > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--sb-bg)] dark:text-slate-400">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[var(--sb-bg)]/10 dark:bg-slate-800">
                    {thread.replies}
                  </span>
                  {t("chat.replies")}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
