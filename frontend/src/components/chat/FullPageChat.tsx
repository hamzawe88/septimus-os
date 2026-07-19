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
  const { t } = useLocalization();

  const currentId = (currentView === 'dm' && activeDmId) ? activeDmId : activeChannelId;

  const [isRecapOpen, setIsRecapOpen] = React.useState(false);
  const [recapSummary, setRecapSummary] = React.useState<string | null>(null);
  const [recapCitations, setRecapCitations] = React.useState<string[]>([]);
  const [isRecapLoading, setIsRecapLoading] = React.useState(false);
  const [typingUsers, setTypingUsers] = React.useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    if (!confirm(t("chat.confirmDelete"))) return;
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
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-[#0f0f0f] relative transition-colors">
      {/* Decorative Background Glows for modern Glassmorphism feel */}
      <div className="absolute top-0 end-0 w-[500px] h-[500px] bg-brand/5 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 start-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none -z-10" />

      {/* Modern Enterprise Header (Bento Style) */}
      <div className="h-20 bg-white/70 dark:bg-[#1a1a1a]/70 backdrop-blur-md border-b border-white/20 dark:border-slate-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] px-6 flex items-center justify-between sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-2xl shadow-lg shadow-brand/20 flex items-center justify-center text-white">
            {isDm ? <MessageSquare className="w-6 h-6" /> : <Hash className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <span>{activeChannel.name}</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {Object.values(onlineUsers || {}).filter(Boolean).length || 1} {t("chat.online")}
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{activeChannel.description || t("chat.defaultChannelDesc")}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 shadow-sm text-sm text-slate-500 dark:text-slate-300 transition-colors">
             <LiveDateTime />
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2 hidden lg:block transition-colors" />
          
          <Button variant="ghost" size="sm" className="h-10 px-4 rounded-xl text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-all" onClick={() => { setIsRagSidebarOpen(true); setActiveThread(null); setIsThreadsListOpen(false); }}>
            <Sparkles className="w-4 h-4 me-2 text-brand" /> {t("chat.docChat")}
          </Button>
          <Button variant="ghost" size="sm" className="h-10 px-4 rounded-xl text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-all" onClick={() => { setIsThreadsListOpen(!isThreadsListOpen); setActiveThread(null); setIsRagSidebarOpen(false); }}>
            <MessageSquare className="w-4 h-4 me-2" /> {t("chat.threadsBtn")}
          </Button>
          <Button variant="default" size="sm" className="h-10 px-4 rounded-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 hover:opacity-95 text-white shadow-md shadow-purple-500/25 border border-purple-400/30 transition-all flex items-center" onClick={handleTriggerRecap}>
            <Sparkles className="w-4 h-4 me-2 text-amber-300 animate-pulse" /> {t("chat.aiRecap")}
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <ScrollArea className="flex-1 px-4 lg:px-8">
        <div className="w-full py-8">
          <ChannelWelcome channelName={activeChannel.name} />

          <div className="flex items-center justify-center my-8">
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-xs font-bold px-4 py-1.5 rounded-full shadow-sm transition-colors">
              {t("chat.today")}
            </div>
          </div>

          <div className="space-y-1">
            {messages.map((rawMsg: unknown, idx: number) => {
              const msg = rawMsg as Record<string, any>;
              let msgType = "human";
              let author = msg.User ? msg.User.Email : "Unknown";
              
              if (msg.IsAIGenerated) {
                msgType = "ai";
                author = msg.AIAgentRole || "AI Orchestrator";
              } else if (msg.type === "system") {
                msgType = "system";
                author = "System Event";
              }

              const finalMsg: any = {
                ...msg,
                type: msgType,
                author: author,
                time: new Date(msg.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                text: msg.Content,
                aiProposal: msg.AIProposal,
                entityType: msg.EntityType,
                entityData: msg.EntityID ? { id: msg.EntityID } : undefined
              };

              return (
                <div key={msg.ID || (msg as any).id || `msg-${idx}`} className="transition-all duration-150">
                   <MessageRow 
                     msg={finalMsg}
                     onReplyClick={() => setActiveThread(finalMsg as any)}
                     onEdit={(id, newText) => handleEditMessage(id, newText)}
                     onDelete={(id) => handleDeleteMessage(id)}
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
            <div className="mb-2 px-4 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-2 animate-pulse bg-white/80 dark:bg-[#1a1a1a]/80 border border-slate-200/80 dark:border-slate-800/80 shadow-sm w-fit transition-colors">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce [animation-delay:300ms]" />
              </span>
              <span>
                {activeTypers.length === 1
                  ? `${activeTypers[0]} ${t("chat.typingNowSingle")}`
                  : `${activeTypers.join(" and ")} ${t("chat.typingNowMulti")}`}
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
        channelName={activeChannel?.name || "general"} 
        summary={recapSummary} 
        citations={recapCitations} 
        isLoading={isRecapLoading} 
      />
    </main>
  );
}
