/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Send, MessageSquare, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPut } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface TicketChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any | null;
  onUpdate: () => void;
}

interface ChatMessage {
  id: string;
  sender: string;
  senderType: "customer" | "support" | "system";
  text: string;
  timestamp: string;
}

export default function TicketChatDrawer({ isOpen, onClose, ticket, onUpdate }: TicketChatDrawerProps) {
  const { isRtl } = useLocalization();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!ticket) return [];
    const existingMessages = ticket.data?.messages;
    if (Array.isArray(existingMessages) && existingMessages.length > 0) {
      return existingMessages;
    }
    const initialSubject = ticket.name || ticket.data?.subject || (isRtl ? "بدون موضوع" : "No Subject");
    const initialDesc = ticket.data?.description || (isRtl ? "مرحباً، أواجه مشكلة في هذا القسم وأحتاج إلى مساعدة الدعم الفني في أقرب وقت ممكن." : "Hello, I'm facing an issue here and need technical support as soon as possible.");
    
    return [
      {
        id: "msg-1",
        sender: ticket.data?.customer || (isRtl ? "العميل" : "Customer"),
        senderType: "customer",
        text: isRtl ? `مرحباً، بخصوص التذكرة "${initialSubject}": ${initialDesc}` : `Hello, regarding ticket "${initialSubject}": ${initialDesc}`,
        timestamp: "10:30",
      },
      {
        id: "msg-2",
        sender: isRtl ? "نظام الدعم الفني" : "System Support",
        senderType: "system",
        text: isRtl ? "تم استلام التذكرة وتحويلها إلى فريق الدعم المختص للمتابعة." : "Ticket received and forwarded to the appropriate support team.",
        timestamp: "10:35",
      }
    ];
  });
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen || !ticket) return null;

  const handleSend = async (textToSend?: string) => {
    const content = textToSend || input;
    if (!content.trim()) return;

    const newMsg: ChatMessage = {
      id: "msg-" + (messages.length + 1),
      sender: isRtl ? "الدعم الفني / أنت" : "Support / You",
      senderType: "support",
      text: content.trim(),
      timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const updatedData = {
        ...(ticket.data || {}),
        messages: updatedMessages,
      };

      await apiPut(`/entities/${ticket.id}?workspace_id=${workspaceId}`, {
        name: ticket.name || ticket.data?.subject || (isRtl ? "بدون موضوع" : "No Subject"),
        data: updatedData,
      });

      onUpdate();
    } catch (err) {
      console.error("Failed to save chat message to ticket", err);
    } finally {
      setIsSending(false);
    }
  };

  const quickReplies = isRtl ? [
    "مرحباً بك، جاري العمل على حل المشكلة الآن وفحص السجلات.",
    "تم حل المشكلة بنجاح، يرجى التحقق وإعلامنا في حال استمرارها.",
    "نحتاج إلى مزيد من التفاصيل أو لقطة شاشة للمشكلة لمساعدتك بشكل أفضل.",
  ] : [
    "Hello, we are currently working on resolving the issue and checking logs.",
    "The issue has been successfully resolved. Please check and let us know if it persists.",
    "We need more details or a screenshot of the problem to assist you better.",
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md h-full shadow-2xl border-s border-slate-200 flex flex-col animate-in slide-in-from-left duration-300">
        
        {/* Header */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {isRtl ? "محادثة التذكرة #" : "Ticket Chat #"}{ticket.id.substring(0, 8)}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ticket.data?.status === 'open' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {ticket.data?.status === 'open' ? (isRtl ? 'مفتوحة' : 'Open') : (isRtl ? 'محلولة' : 'Resolved')}
                </span>
              </h3>
              <p className="text-xs text-slate-500">{isRtl ? "العميل:" : "Customer:"} {ticket.data?.customer || (isRtl ? 'غير محدد' : 'Unspecified')}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 rounded-full transition-colors"
            title={isRtl ? "إغلاق المحادثة" : "Close Chat"} 
            aria-label={isRtl ? "إغلاق المحادثة" : "Close Chat"}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
          {messages.map((msg) => {
            const isSupport = msg.senderType === "support";
            const isSystem = msg.senderType === "system";

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-3">
                  <span className="bg-slate-200/80 text-slate-600 text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium shadow-sm">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isSupport ? "items-start" : "items-end"}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-xs font-semibold text-slate-700">{msg.sender}</span>
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>
                <div 
                  className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isSupport 
                      ? "bg-brand text-white rounded-se-none" 
                      : "bg-white text-slate-800 border border-slate-200 rounded-ss-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        <div className="p-3 bg-white border-t border-slate-100 flex flex-wrap gap-1.5">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1 w-full mb-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> {isRtl ? "ردود سريعة جاهزة:" : "Quick replies:"}
          </span>
          {quickReplies.map((reply, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(reply)}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors text-end truncate max-w-full"
            >
              {reply}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2"
          >
            <input 
              type="text"
              placeholder={isRtl ? "اكتب ردك للعميل هنا..." : "Type your reply to the customer here..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
            />
            <Button 
              type="submit" 
              disabled={!input.trim() || isSending}
              className="bg-brand hover:bg-brand/90 text-white p-2.5 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
              title={isRtl ? "إرسال" : "Send"}
              aria-label={isRtl ? "إرسال" : "Send"}
            >
              <Send className="w-5 h-5 rotate-180" />
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
