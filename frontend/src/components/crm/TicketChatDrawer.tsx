/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Send, MessageSquare, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { apiGet, apiPost } from "@/lib/apiClient";
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
  const { t, language } = useLocalization();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
	  if (!isOpen || !ticket?.id) return;
      apiGet<{data: any[]}>(`/crm/tickets/${ticket.id}/messages`)
		.then((response) => setMessages((response.data || []).slice().reverse().map((record) => ({
          id: record.id,
          sender: record.data?.sender ? t("crm.chat.supportYou") : t("crm.customer"),
          senderType: record.data?.channel === "system" ? "system" : record.data?.sender ? "support" : "customer",
          text: record.data?.body || "",
          timestamp: new Date(record.data?.sent_at || record.created_at).toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" }),
		}))))
        .catch(() => setMessages([]));
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [isOpen, language, t, ticket]);

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
      sender: t("crm.chat.supportYou"),
      senderType: "support",
      text: content.trim(),
      timestamp: new Date().toLocaleTimeString(language === "ar" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    if (!textToSend) setInput("");
    setIsSending(true);

    try {
      const saved = await apiPost<any>(`/crm/tickets/${ticket.id}/messages`, {
        body: content.trim(),
        channel: "portal",
      });
	  setMessages((current) => current.map((message) => message.id === newMsg.id ? { ...message, id: saved.id } : message));

      onUpdate();
    } catch (err) {
      console.error("Failed to save chat message to ticket", err);
      setMessages(messages);
    } finally {
      setIsSending(false);
    }
  };

  const quickReplies = [
    t("crm.chat.replyInvestigating"),
    t("crm.chat.replyResolved"),
    t("crm.chat.replyNeedDetails"),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--color-ink)]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-md animate-in flex-col border-s border-border bg-card shadow-[var(--shadow-overlay)] duration-300">

        {/* Header */}
        <div className="p-5 bg-muted border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground flex items-center gap-2">
                {t("crm.chat.title")} #{ticket.id.substring(0, 8)}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ticket.data?.status === 'open' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                }`}>
                  {ticket.data?.status === 'open' ? t("crm.ticketStatus.open") : t("crm.ticketStatus.resolved")}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">{t("crm.customer")}: {ticket.data?.customer_name || t("common.unspecified")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-muted/60 hover:text-muted-foreground rounded-full transition-colors"
            title={t("crm.chat.close")}
            aria-label={t("crm.chat.close")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-muted/50">
          {messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare />}
              title={t("crm.chat.empty")}
              description={t("crm.chat.emptyDescription")}
            />
          ) : messages.map((msg) => {
            const isSupport = msg.senderType === "support";
            const isSystem = msg.senderType === "system";

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-3">
                  <span className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium shadow-sm">
                    <Clock className="w-3 h-3 text-muted-foreground" />
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
                  <span className="text-xs font-semibold text-foreground">{msg.sender}</span>
                  <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                </div>
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    isSupport
                      ? "bg-brand text-brand-foreground rounded-se-none"
                      : "bg-card text-foreground border border-border rounded-ss-none"
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
        <div className="p-3 bg-card border-t border-border flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 w-full mb-1">
            <Sparkles className="w-3 h-3 text-warning" /> {t("crm.chat.quickReplyTemplates")}
          </span>
          {quickReplies.map((reply, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(reply)}
              className="text-xs bg-muted hover:bg-muted text-foreground px-3 py-1.5 rounded-lg transition-colors text-end truncate max-w-full"
            >
              {reply}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-card border-t border-border">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={t("crm.chat.replyPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all"
            />
            <Button
              type="submit"
              disabled={!input.trim() || isSending}
              className="flex items-center justify-center rounded-xl bg-brand p-2.5 text-brand-foreground transition-all hover:bg-brand-hover disabled:opacity-50"
              title={t("crm.chat.send")}
              aria-label={t("crm.chat.send")}
            >
              <Send className="h-5 w-5 rtl:rotate-180" />
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
