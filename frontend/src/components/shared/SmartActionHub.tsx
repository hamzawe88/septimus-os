"use client";

import React, { useState } from "react";
import { Sparkles, Headphones, X, ChevronUp, ChevronDown, Bot } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function SmartActionHub() {
  const { 
    unreadDMs, 
    setUnreadDMs, 
    floatingChats, 
    addFloatingChat 
  } = useAppStore();
  const { t, isRtl } = useLocalization();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHuddleSimulated, setIsHuddleSimulated] = useState(false);

  // Calculate total unread DM messages across all threads
  const unreadEntries = Object.entries(unreadDMs || {});
  const totalUnreadCount = unreadEntries.reduce((sum, [, data]) => sum + (data.count || 0), 0);

  const handleOpenCopilot = () => {
    window.dispatchEvent(new CustomEvent("open-copilot"));
    setIsExpanded(false);
  };

  const handleOpenChat = (id: string, name: string) => {
    if (unreadDMs && unreadDMs[id]) {
      const newDms = { ...unreadDMs };
      delete newDms[id];
      setUnreadDMs(newDms);
    }
    addFloatingChat({ id, name });
    setIsExpanded(false);
  };

  const handleToggleHuddle = () => {
    setIsHuddleSimulated(!isHuddleSimulated);
    window.dispatchEvent(new CustomEvent("toggle-huddle"));
    setIsExpanded(false);
  };

  return (
    <div className="fixed bottom-6 start-6 z-[9990] flex flex-col items-start gap-3 select-none transition-all duration-300">
      {/* Expanded Accordion / Popover State */}
      {isExpanded && (
        <div className="w-72 bg-card dark:bg-slate-900 rounded-2xl shadow-2xl border border-border dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-light animate-pulse" />
              <span className="text-sm font-bold tracking-tight">
                {t("smart_dock_title") || "Septimus Smart Hub"}
              </span>
            </div>
            <button 
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              aria-label="Close Smart Hub"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action List */}
          <div className="p-2 space-y-1 divide-y divide-border dark:divide-slate-800/60">
            {/* Action 1: Copilot AI */}
            <button
              onClick={handleOpenCopilot}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 group transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="text-start">
                  <p className="text-sm font-semibold text-foreground dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {t("smart_dock_ai") || "Copilot AI Assistant"}
                  </p>
                  <p className="text-[11px] text-muted-foreground dark:text-muted-foreground">
                    {isRtl ? "المساعد الذكي العام (⌘I)" : "Supervisor AI (⌘I)"}
                  </p>
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Action 2: Direct Messages */}
            <div className="pt-1">
              <div className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                  {t("smart_dock_dms") || "Direct Messages"}
                </span>
                {totalUnreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {totalUnreadCount}
                  </span>
                )}
              </div>

              {unreadEntries.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {unreadEntries.map(([id, data]) => {
                    const isAlreadyOpen = floatingChats?.some(c => c.id === id);
                    if (isAlreadyOpen) return null;

                    return (
                      <button
                        key={id}
                        onClick={() => handleOpenChat(id, data.name)}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-muted dark:hover:bg-slate-800/80 transition-colors text-start"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar className="w-8 h-8 rounded-lg border border-border dark:border-slate-700 shadow-sm">
                            <AvatarFallback className="bg-gradient-to-br from-[#2563EB] to-[#60A5FA] text-white font-bold text-xs rounded-lg shadow-inner">
                              {data.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-semibold text-foreground dark:text-slate-200 leading-tight">
                              {data.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">
                              {isRtl ? "رسالة جديدة" : "New message"}
                            </p>
                          </div>
                        </div>
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {data.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground dark:text-muted-foreground">
                  {isRtl ? "لا توجد رسائل غير مقروءة" : "No unread messages"}
                </div>
              )}
            </div>

            {/* Action 3: Huddle Audio Call */}
            <div className="pt-1">
              <button
                onClick={handleToggleHuddle}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 group transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isHuddleSimulated ? "bg-emerald-500 text-white animate-pulse" : "bg-muted dark:bg-slate-800 text-muted-foreground dark:text-slate-300"} transition-colors`}>
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="text-start">
                    <p className="text-sm font-semibold text-foreground dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {t("smart_dock_huddle") || "Active Huddle"}
                    </p>
                    <p className="text-[11px] text-muted-foreground dark:text-muted-foreground">
                      {isHuddleSimulated 
                        ? (isRtl ? "مكالمة جارية..." : "Call in progress...") 
                        : (isRtl ? "انقر لبدء/الانضمام لغرفة" : "Click to join huddle")}
                    </p>
                  </div>
                </div>
                {isHuddleSimulated && (
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed Capsule Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group relative flex items-center gap-2.5 rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-4 py-3 text-white shadow-xl shadow-slate-900/30 border border-slate-700/80 hover:border-indigo-500/80 hover:scale-105 active:scale-95 transition-all duration-200"
        aria-label="Toggle Smart Hub"
        title={t("smart_dock_title") || "Septimus Smart Hub"}
      >
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-indigo-400 group-hover:rotate-12 transition-transform" />
          {isHuddleSimulated && (
            <span className="absolute -top-1 -end-1 flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </div>

        <span className="text-sm font-bold tracking-wide pe-1">
          {t("smart_dock_title") || "Septimus Hub"}
        </span>

        {/* Combined Badge Counter */}
        {totalUnreadCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold text-white shadow-sm border border-slate-900 animate-bounce">
            {totalUnreadCount}
          </span>
        )}

        <div className="ps-1 border-s border-slate-700/60 text-white/70 group-hover:text-white transition-colors">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>
    </div>
  );
}
