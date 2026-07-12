"use client";

import React from "react";
import { Sparkles, X, CheckCircle2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";

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
  const { isRtl } = useLocalization();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-brand-light overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
            <h3 className="font-bold text-lg">{isRtl ? "التلخيص الذكي الفوري" : "Instant Smart Recap (Slack AI Recap)"}</h3>
          </div>
          <button 
            onClick={onClose}
            title={isRtl ? "إغلاق" : "Close"}
            aria-label={isRtl ? "إغلاق" : "Close"}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className={`p-6 overflow-y-auto flex-1 text-slate-800 space-y-4 ${isRtl ? 'text-end' : 'text-start'}`} dir={isRtl ? "rtl" : "ltr"}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-sm font-semibold text-slate-500">{isRtl ? "القناة المستهدفة:" : "Target Channel:"}</span>
            <span className="bg-brand-light text-brand px-3 py-1 rounded-full text-xs font-bold font-mono">#{channelName}</span>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-brand font-medium animate-pulse">{isRtl ? "يقوم العقل السيادي Septimus AI بقراءة وتلخيص المحادثات..." : "Septimus AI is reading and summarizing conversations..."}</p>
            </div>
          ) : (
            <>
              <div className="bg-brand-light/50 p-4 rounded-xl border border-brand-light/80 leading-relaxed text-[15px] whitespace-pre-wrap">
                {summary || (isRtl ? "لم يتم العثور على ملخص." : "No summary found.")}
              </div>

              {citations && citations.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {isRtl ? "المصادر الموثقة المستند إليها:" : "Grounded Citations:"}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {citations.map((citeId, idx) => (
                      <span key={idx} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] px-2.5 py-1 rounded-md font-mono flex items-center gap-1 transition-colors cursor-pointer">
                        <MessageSquare className="w-3 h-3 text-slate-400" /> {isRtl ? "رسالة" : "Message"} #{citeId.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            🔒 {isRtl ? "مُعالج محلياً 100% داخل سيادة المؤسسة" : "100% locally processed within enterprise sovereignty"}
          </span>
          <Button onClick={onClose} className="bg-brand hover:bg-brand text-white text-xs px-5 h-9 rounded-lg">
            {isRtl ? "إغلاق نافذة التلخيص" : "Close Recap Window"}
          </Button>
        </div>

      </div>
    </div>
  );
}
