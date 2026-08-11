/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Hash, MessageSquare, Sparkles } from "lucide-react";
import MessageInput from "@/components/shared/MessageInput";
import MessageRow from "@/components/chat/MessageRow";
import ChannelWelcome from "@/components/chat/ChannelWelcome";
import AIRecapModal from "@/components/chat/AIRecapModal";
import ConvertToTaskModal from "@/components/chat/ConvertToTaskModal";
import PinnedTasksBanner from "@/components/chat/PinnedTasksBanner";
import LiveDateTime from "@/components/shared/LiveDateTime";
import { useAppStore } from "@/store/useAppStore";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { Channel } from "@/types";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function FullPageChat() {
  const {
    activeChannelId,
    activeDmId,
    currentView,
    channels,
    messages,
    setMessages,
    isThreadsListOpen,
    setIsThreadsListOpen,
    setActiveThread,
    setIsRagSidebarOpen,
    onlineUsers,
    centrifuge,
  } = useAppStore();
  const { t, language } = useLocalization();

  const currentId = (currentView === 'dm' && activeDmId) ? activeDmId : activeChannelId;

  const [isRecapOpen, setIsRecapOpen] = React.useState(false);
  const [recapSummary, setRecapSummary] = React.useState<string | null>(null);
  const [recapCitations, setRecapCitations] = React.useState<string[]>([]);
  const [isRecapLoading, setIsRecapLoading] = React.useState(false);
  const [typingUsers, setTypingUsers] = React.useState<Record<string, boolean>>({});

  const [taskModalMsg, setTaskModalMsg] = React.useState<any>(null);
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = React.useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages — block: "end" avoids horizontal jumps
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Subscribe to channel for typing indicators and chat messages
  useEffect(() => {
    if (!centrifuge || !currentId) return;

    let sub = centrifuge.getSubscription(`channel_${currentId}`);
    if (!sub) {
      sub = centrifuge.newSubscription(`channel_${currentId}`);
      sub.subscribe();
    }

    const handlePublication = (ctx: any) => {
      const msg = ctx.data;
      if (msg.type === 'typing' && msg.user) {
        setTypingUsers(prev => ({
          ...prev,
          [msg.user]: msg.is_typing
        }));
      } else if (msg.type === 'chat_message' || msg.Content || msg.message) {
        const actualMsg = msg.message || msg;
        if (actualMsg.ParentID || actualMsg.parent_id) return;
        const channelId = actualMsg.ChannelID || actualMsg.channel_id;
        if (channelId && String(channelId) !== String(currentId)) return;
        const msgId = String(actualMsg.ID || actualMsg.id || "").trim();
        if (!msgId) return;
        setMessages((prev: any[]) => {
          if (prev.some((p: any) => String(p.ID || p.id || "").trim() === msgId)) return prev;
          return [...prev, actualMsg];
        });
      } else if (msg.type === 'message_updated') {
        const updated = msg.message;
        if (!updated) return;
        const updId = String(updated.ID || updated.id || "").trim();
        setMessages((prev: any[]) => prev.map(p => String(p.ID || p.id || "").trim() === updId ? { ...p, ...updated } : p));
      } else if (msg.type === 'message_deleted') {
        const delId = String(msg.message_id || "").trim();
        if (!delId) return;
        setMessages((prev: any[]) => prev.filter(p => String(p.ID || p.id || "").trim() !== delId));
      } else if (msg.type === 'system' && msg.entityType === 'channel_pinned_task') {
        window.dispatchEvent(new CustomEvent('refresh_pinned_tasks', { detail: { channelId: currentId } }));
      }
    };

    sub.on('publication', handlePublication);

    return () => {
      sub?.removeListener('publication', handlePublication);
    };
  }, [centrifuge, currentId, setMessages]);

  const activeChannelRaw = channels.find((c: Channel) => (c.ID || (c as any).id) === currentId);
  const isDm = currentView === 'dm' || activeChannelRaw?.Type === "DM";
  const activeChannel = activeChannelRaw
    ? {
        name: String(activeChannelRaw.Name || (activeChannelRaw as any).name || (isDm ? t("chat.dm") : t("chat.generalChannel"))),
        description: String(activeChannelRaw.Description || (isDm ? t("chat.dmDesc") : t("chat.generalDesc"))),
      }
    : { name: isDm ? t("chat.dm") : t("chat.generalChannel"), description: "" };

  const handleSendMessage = (text: string, attachmentUrl?: string, attachmentType?: string) => {
    if (!currentId) return false;
    
    fetchWithAuth(`${API_BASE_URL}/channels/${currentId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: text,
        AttachmentURL: attachmentUrl,
        AttachmentType: attachmentType
      })
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to send message");
      })
      .then(newMsg => {
        const msgId = String(newMsg.ID || newMsg.id || "").trim();
        if (!msgId) return;
        setMessages((prev: any[]) => {
          if (prev.some((p: any) => String(p.ID || p.id || "").trim() === msgId)) return prev;
          return [...prev, newMsg];
        });
      })
      .catch(err => console.error(err));
    return true;
  };

  const handleEditMessage = async (id: string, newText: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/messages/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content: newText })
      });
      if (res.ok) {
        const updated = await res.json();
        const updId = String(updated.ID || updated.id || id).trim();
        setMessages((prev: any[]) => prev.map(p => String(p.ID || p.id || "").trim() === updId ? { ...p, ...updated, Content: newText } : p));
      } else {
        alert(t("chat.editFailed"));
      }
    } catch (err) {
      console.error(err);
      alert(t("chat.editError"));
    }
  };

  const handleDeleteMessage = async (id: string) => {
    setConfirmDeleteMsgId(id);
  };

  const confirmDeleteMessage = async () => {
    const id = confirmDeleteMsgId;
    if (!id) return;
    setConfirmDeleteMsgId(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/messages/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setMessages((prev: any[]) => prev.filter(p => String(p.ID || p.id || "").trim() !== String(id).trim()));
      } else {
        alert(t("chat.deleteFailed"));
      }
    } catch (err) {
      console.error(err);
      alert(t("chat.deleteError"));
    }
  };

  const handleTriggerRecap = () => {
    if (!activeChannelId) return;
    setIsRecapOpen(true);
    setIsRecapLoading(true);
    fetchWithAuth(`${API_BASE_URL}/chat/recap?channel_id=${activeChannelId}`)
      .then(res => res.json())
      .then(data => {
        setRecapSummary(data.summary || null);
        setRecapCitations(data.citations || []);
        setIsRecapLoading(false);
      })
      .catch((err) => {
        console.error("Recap error:", err);
        setIsRecapLoading(false);
      });
  };

  return (
    <main
      data-testid="full-page-chat"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="sticky top-0 z-10 flex min-h-20 flex-col justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur-md sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand text-brand-foreground shadow-[var(--shadow-raised)]">
            {isDm ? <MessageSquare className="w-6 h-6" /> : <Hash className="w-6 h-6" />}
          </div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <span className="truncate">{activeChannel.name}</span>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                {Object.values(onlineUsers || {}).filter(Boolean).length || 1} {t("chat.online")}
              </span>
            </h1>
            <p className="truncate text-sm text-muted-foreground">{activeChannel.description || t("chat.defaultChannelDesc")}</p>
          </div>
        </div>
        
        <div className="flex max-w-full items-center gap-1 overflow-x-auto sm:gap-2">
          <div className="hidden items-center rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground lg:flex">
             <LiveDateTime />
          </div>
          <div className="mx-1 hidden h-8 w-px bg-border lg:block" />
          
          <Button variant="ghost" size="sm" onClick={() => { setIsRagSidebarOpen(true); setActiveThread(null); setIsThreadsListOpen(false); }}>
            <Sparkles className="text-brand" /> <span className="hidden md:inline">{t("chat.docChat")}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setIsThreadsListOpen(!isThreadsListOpen); setActiveThread(null); setIsRagSidebarOpen(false); }}>
            <MessageSquare /> <span className="hidden md:inline">{t("chat.threadsBtn")}</span>
          </Button>
          <Button size="sm" onClick={handleTriggerRecap}>
            <Sparkles className="animate-pulse" /> {t("chat.aiRecap")}
          </Button>
        </div>
      </header>

      {/* Pinned Tasks Banner */}
      {!isDm && currentId && (
        <PinnedTasksBanner channelId={currentId} />
      )}

      {/* Messages Scroll Area */}
      <ScrollArea className="flex-1 min-h-0 px-4 lg:px-8 overflow-y-auto">
        <div className="w-full py-8">
          <ChannelWelcome channelName={activeChannel.name} />

          <div className="flex items-center justify-center my-8">
            <div className="rounded-[var(--radius-control)] border border-border bg-card px-4 py-1.5 text-xs font-bold text-muted-foreground shadow-[var(--shadow-raised)]">
              {t("chat.today")}
            </div>
          </div>

          <div className="space-y-1">
            {messages.map((rawMsg: unknown, idx: number) => {
              const msg = rawMsg as Record<string, any>;
              let msgType = "human";

              // Support both snake_case (new API) and PascalCase (legacy)
              const user = msg.user || msg.User;
              const isAI = msg.is_ai_generated ?? msg.IsAIGenerated ?? false;
              const aiRole = msg.ai_agent_role || msg.AIAgentRole;
              const createdAt = msg.created_at || msg.CreatedAt;
              const content = msg.content || msg.Content;
              const aiProposal = msg.ai_proposal || msg.AIProposal;
              const entityType = msg.entity_type || msg.EntityType;
              const entityId = msg.entity_id || msg.EntityID;

              // Resolve author name: prefer display_name > Name > Email > Unknown
              let author = t("chat.unknownUser");
              if (user) {
                author = user.display_name || user.DisplayName || user.name || user.Name || user.email || user.Email || t("chat.unknownUser");
              }

              if (isAI) {
                msgType = "ai";
                author = aiRole || t("chat.aiOrchestrator");
              } else if (msg.type === "system") {
                msgType = "system";
                author = t("chat.systemEvent");
              }

              // Parse date safely
              let timeStr = "";
              if (createdAt) {
                const d = new Date(createdAt);
                timeStr = isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }

              const finalMsg: any = {
                ...msg,
                id: msg.id || msg.ID,
                channel_id: msg.channel_id || msg.ChannelID,
                type: msgType,
                author: author,
                time: timeStr,
                text: content,
                aiProposal: aiProposal,
                entityType: entityType,
                entityData: entityId ? { id: entityId } : undefined
              };

              return (
                <div key={msg.id || msg.ID || `msg-${idx}`} className="transition-all duration-150">
                   <MessageRow 
                     msg={finalMsg}
                     onReplyClick={() => setActiveThread(finalMsg as any)}
                     onEdit={(id, newText) => handleEditMessage(id, newText)}
                     onDelete={(id) => handleDeleteMessage(id)}
                     onConvertToTask={(msgToConvert) => setTaskModalMsg(msgToConvert)}
                   />
                </div>
              );
            })}
          </div>
          <div ref={messagesEndRef} className="h-8" />
        </div>
      </ScrollArea>

      {/* Floating Input Area (Bento Style) */}
      <div className="p-4 lg:p-6 lg:pt-0 w-full">
        {(() => {
          const activeTypers = Object.entries(typingUsers)
            .filter(([, isTyping]) => isTyping)
            .map(([u]) => u);
          if (activeTypers.length === 0) return null;
          return (
            <div className="mb-2 flex w-fit animate-pulse items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-raised)]">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:300ms]" />
              </span>
              <span>
                {activeTypers.length === 1
                  ? `${activeTypers[0]} ${t("chat.typingNowSingle")}`
                  : `${new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(activeTypers)} ${t("chat.typingNowMulti")}`}
              </span>
            </div>
          );
        })()}
        <MessageInput
          channelName={activeChannel.name}
          channelId={currentId}
          onSend={handleSendMessage}
        />
      </div>
      <AIRecapModal 
        isOpen={isRecapOpen} 
        onClose={() => setIsRecapOpen(false)} 
        channelName={activeChannel?.name || t("chat.generalChannel")}
        summary={recapSummary} 
        citations={recapCitations} 
        isLoading={isRecapLoading} 
      />
      <ConvertToTaskModal
        isOpen={!!taskModalMsg}
        onClose={() => setTaskModalMsg(null)}
        message={taskModalMsg}
        channelId={currentId}
      />

      {/* Inline Delete Confirmation Modal */}
      {confirmDeleteMsgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteMsgId(null)}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
            className="w-[90vw] max-w-sm rounded-[var(--radius-surface)] border border-border bg-popover p-6 text-popover-foreground shadow-[var(--shadow-overlay)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-destructive/10">
                <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <div>
                <h3 id="delete-message-title" className="text-base font-bold">{t("chat.deleteMessageTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("chat.deleteMessageDescription")}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setConfirmDeleteMsgId(null)} variant="outline">
                {t("common.cancel")}
              </Button>
              <Button onClick={confirmDeleteMessage} variant="destructive">
                {t("chat.confirmDeleteAction")}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
