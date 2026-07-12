"use client";

import React, { useState, useEffect } from "react";
import { Flame, X, Check, Clock, MessageSquare, Sparkles, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export default function CatchUpModal({ isOpen, onClose }: { isOpen?: boolean; onClose: () => void }) {
  const { isRtl } = useLocalization();
  const [queue, setQueue] = useState<CatchUpMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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

  const handleSwipe = (action: "read" | "task" | "later") => {
    if (!currentMsg) return;

    if (action === "task") {
      fetchWithAuth(`${API_BASE_URL}/messages/convert-to-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: currentMsg.id || currentMsg.ID,
          project_id: "",
          title: currentMsg.Content || currentMsg.content
        })
      });
      setToastMsg(isRtl ? "✅ تم تحويل الرسالة إلى مهمة في الكانبان!" : "✅ Message converted to Kanban task!");
      setTimeout(() => setToastMsg(null), 3000);
    } else if (action === "read") {
      setToastMsg(isRtl ? "✨ تم وضع علامة مقروء" : "✨ Marked as read");
      setTimeout(() => setToastMsg(null), 1500);
    }

    setCurrentIndex(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-md p-4 animate-in fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="bg-[var(--bg-secondary)] text-[var(--text-primary)] w-full max-w-md rounded-3xl shadow-2xl border border-[var(--border-strong)] overflow-hidden flex flex-col relative h-[580px]">
        
        <div className="px-6 py-5 flex items-center justify-between border-b border-[var(--border-strong)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 shadow-lg shadow-rose-500/20">
              <Flame className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div className="flex-1">
              <h3 className="font-extrabold text-base tracking-tight">{isRtl ? "وضع المتابعة السريعة" : "Catch Up Mode"}</h3>
              <p className="text-[11px] text-[var(--text-secondary)]">{isRtl ? "تصفية التحديثات بضغطة واحدة" : "Clear updates with one click"}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            title={isRtl ? "إغلاق" : "Close"}
            aria-label={isRtl ? "إغلاق" : "Close"}
            className="p-2 rounded-full bg-[var(--bg-primary)] hover:bg-[var(--sb-hover)] transition-colors text-[var(--text-secondary)] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {toastMsg && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-[var(--blue)] text-white text-xs px-4 py-2 rounded-full shadow-xl z-50 animate-in fade-in slide-in-from-top-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> {toastMsg}
          </div>
        )}

        <div className="flex-1 p-6 flex flex-col items-center justify-center relative overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50">
              <Sparkles className="w-8 h-8 text-[var(--blue)] animate-pulse" />
              <p className="text-xs text-[var(--text-secondary)]">{isRtl ? "تحميل طابور المتابعة..." : "Loading catch-up queue..."}</p>
            </div>
          ) : !currentMsg ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-gradient-to-tr from-[var(--blue)] to-purple-500 rounded-3xl flex items-center justify-center shadow-lg mb-6 transform rotate-12">
                <CheckCircle className="w-8 h-8 text-white -rotate-12" />
              </div>
              <h4 className="font-bold text-lg text-[var(--text-primary)] mb-2">{isRtl ? "أنت على اطلاع تام حالياً!" : "You are all caught up!"}</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6">{isRtl ? "لا توجد رسائل غير مقروءة أو تحديثات معلقة في طابور المتابعة الخاص بك." : "No unread messages or pending updates in your catch-up queue."}</p>
              <Button onClick={onClose} className="bg-[var(--blue)] hover:bg-[var(--blue-dark)] text-white w-full rounded-xl text-xs py-5 shadow-sm hover:shadow">
                {isRtl ? "العودة للعمل" : "Back to work"}
              </Button>
            </div>
          ) : (
            <div className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-strong)] rounded-2xl p-6 shadow-xl flex flex-col space-y-4 animate-in slide-in-from-right-8 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border border-[var(--border-strong)]">
                    <AvatarFallback className="bg-brand text-white font-bold text-sm">
                      {(currentMsg.User?.Email || "M").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)]">
                      {currentMsg.User?.Name || (isRtl ? "موظف سيادي" : "System Employee")}
                    </h5>
                    <span className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-0.5 font-mono">
                      <MessageSquare className="w-3 h-3 text-indigo-400" /> #{currentMsg.Channel?.Name || "general"}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold tracking-wider text-[var(--text-secondary)] uppercase bg-[var(--bg-hover)] px-2 py-1 rounded-md">
                  {isRtl ? "1 من " : "1 of "}{queue.length - currentIndex}
                </span>
              </div>

              <div className="bg-[var(--bg-primary)]/60 p-4 rounded-xl border border-[var(--border-strong)]/50 text-sm leading-relaxed text-[var(--text-primary)] min-h-[140px] max-h-[220px] overflow-y-auto whitespace-pre-wrap font-sans">
                {currentMsg.Content || currentMsg.content}
              </div>

              <div className="flex items-center gap-1.5 px-2">
                <Clock className="w-3 h-3 text-[var(--text-secondary)]" />
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {isRtl ? "تم الإرسال في النظام السيادي" : "Sent in sovereign system"}
                </span>
              </div>
            </div>
          )}
        </div>

        {currentMsg && (
          <div className="p-6 bg-[var(--bg-primary)]/80 border-t border-[var(--border-strong)]/80 grid grid-cols-3 gap-3">
            <Button 
              onClick={() => handleSwipe("later")}
              variant="outline" 
              className="bg-[var(--bg-secondary)] border-[var(--border-strong)] hover:bg-[var(--sb-hover)] text-[var(--text-secondary)] hover:text-white flex flex-col items-center justify-center h-16 rounded-2xl gap-1 text-[11px]"
            >
              <Clock className="w-5 h-5 text-amber-400" />
              {isRtl ? "تأجيل" : "Later"}
            </Button>

            <Button 
              onClick={() => handleSwipe("task")}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex flex-col items-center justify-center h-16 rounded-2xl gap-1 text-[11px] shadow-lg shadow-purple-600/25"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              {isRtl ? "تحويل لمهمة" : "Convert to Task"}
            </Button>

            <Button 
              onClick={() => handleSwipe("read")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center h-16 rounded-2xl gap-1 text-[11px] shadow-lg shadow-emerald-600/25"
            >
              <Check className="w-5 h-5" />
              {isRtl ? "تم" : "Mark Read"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
