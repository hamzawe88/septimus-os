/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Send, MessageSquare, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPut } from "@/lib/apiClient";

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
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!ticket) return [];
    const existingMessages = ticket.data?.messages;
    if (Array.isArray(existingMessages) && existingMessages.length > 0) {
      return existingMessages;
    }
    const initialSubject = ticket.name || ticket.data?.subject || "بدون موضوع";
    const initialDesc = ticket.data?.description || "مرحباً، أواجه مشكلة في هذا القسم وأحتاج إلى مساعدة الدعم الفني في أقرب وقت ممكن.";
    
    return [
      {
        id: "msg-1",
        sender: ticket.data?.customer || "العميل",
        senderType: "customer",
        text: `مرحباً، بخصوص التذكرة "${initialSubject}": ${initialDesc}`,
        timestamp: "10:30 ص",
      },
      {
        id: "msg-2",
        sender: "نظام الدعم الفني",
        senderType: "system",
        text: "تم استلام التذكرة وتحويلها إلى فريق الدعم المختص للمتابعة.",
        timestamp: "10:35 ص",
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
      sender: "الدعم الفني / أنت",
      senderType: "support",
      text: content.trim(),
      timestamp: new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      const updatedData = {
        ...(ticket.data || {}),
        messages: updatedMessages,
      };

      await apiPut(`/entities/${ticket.id}?workspace_id=${workspaceId}`, {
        name: ticket.name || ticket.data?.subject || "بدون موضوع",
        data: updatedData,
      });

      onUpdate();
    } catch (err) {
      console.error("Failed to save chat message to ticket", err);
    } finally {
      setIsSending(false);
    }
  };

  const quickReplies = [
    "مرحباً بك، جاري العمل على حل المشكلة الآن وفحص السجلات.",
    "تم حل المشكلة بنجاح، يرجى التحقق وإعلامنا في حال استمرارها.",
    "نحتاج إلى مزيد من التفاصيل أو لقطة شاشة للمشكلة لمساعدتك بشكل أفضل.",
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
                محادثة التذكرة #{ticket.id.substring(0, 8)}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ticket.data?.status === 'open' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {ticket.data?.status === 'open' ? 'مفتوحة' : 'محلولة'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">العميل: {ticket.data?.customer || 'غير محدد'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 rounded-full transition-colors"
            title="إغلاق المحادثة" 
            aria-label="إغلاق المحادثة">
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
            <Sparkles className="w-3 h-3 text-amber-500" /> ردود سريعة جاهزة:
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
              placeholder="اكتب ردك للعميل هنا..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
            />
            <Button 
              type="submit" 
              disabled={!input.trim() || isSending}
              className="bg-brand hover:bg-brand/90 text-white p-2.5 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
              title="إرسال"
              aria-label="إرسال"
            >
              <Send className="w-5 h-5 rotate-180" />
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
