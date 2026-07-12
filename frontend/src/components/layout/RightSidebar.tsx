import React, { useState, useEffect, useRef } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { X, Sparkles, BrainCircuit, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppStore } from "@/store/useAppStore";
import MessageInput from "@/components/shared/MessageInput";
import { fetchWithAuth, API_BASE_URL, AI_BASE_URL } from '@/lib/apiClient';

export function RightSidebar() {
  const { isRtl } = useLocalization();
  const { activeThread: activeThreadRaw, setActiveThread, centrifuge, isRagSidebarOpen, setIsRagSidebarOpen } = useAppStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeThread = activeThreadRaw as any;
  
  // Thread state
  interface ThreadReply {
    ID?: string;
    SenderID?: string;
    Content?: string;
    CreatedAt?: string;
    User?: { Email?: string };
  }
  const [replies, setReplies] = useState<ThreadReply[]>([]);
  
  // RAG state
  const [ragHistory, setRagHistory] = useState<{role: string, text: string}[]>([]);
  const [isRagLoading, setIsRagLoading] = useState(false);
  const ragScrollRef = useRef<HTMLDivElement>(null);

  // Thread Data fetching
  useEffect(() => {
    if (!activeThread || !activeThread.id) return;
        fetchWithAuth(`${API_BASE_URL}/messages/${activeThread.id}/replies`)
      .then(res => res.json())
      .then(data => setReplies(data.replies || []));
  }, [activeThread]);

  useEffect(() => {
    if (!centrifuge || !activeThread || !activeThread.channel_id) return;

    let sub = centrifuge.getSubscription(`channel_${activeThread.channel_id}`);
    if (!sub) {
      sub = centrifuge.newSubscription(`channel_${activeThread.channel_id}`);
      sub.subscribe();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlePublication = (ctx: any) => {
      const msg = ctx.data;
      if (msg.ParentID === activeThread.id || msg.parent_id === activeThread.id) {
        setReplies(prev => {
          if (prev.some(p => p.ID === msg.ID)) return prev;
          return [...prev, msg];
        });
      }
    };

    sub.on('publication', handlePublication);

    return () => {
      sub.removeListener('publication', handlePublication);
    };
  }, [centrifuge, activeThread]);

  // Scroll RAG chat to bottom
  useEffect(() => {
    if (ragScrollRef.current) {
      ragScrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [ragHistory]);

  const handleSendReply = async (text: string, attachmentUrl?: string, attachmentType?: string) => {
    if (activeThread) {
      // Optimistic update
      const tempId = "temp-" + Date.now().toString();
      setReplies(prev => [...prev, {
        ID: tempId,
        Content: text,
        CreatedAt: new Date().toISOString(),
        User: { Email: "You" },
        ParentID: activeThread.id,
        AttachmentURL: attachmentUrl,
        AttachmentType: attachmentType
      }]);
      
            try {
        await fetchWithAuth(`${API_BASE_URL}/channels/${activeThread.channel_id}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

          },
          body: JSON.stringify({
            content: text,
            parent_id: activeThread.id,
            attachment_url: attachmentUrl,
            attachment_type: attachmentType,
          })
        });
      } catch (err) {
        console.error("Failed to send reply", err);
      }
    }
  };

  const handleRagQuery = async (text: string) => {
    if (!text.trim()) return;
    setRagHistory(prev => [...prev, { role: "user", text }]);
    setIsRagLoading(true);
    
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const res = await fetchWithAuth(`${AI_BASE_URL}/ai/query`, {
        method: "POST",
        body: JSON.stringify({ query: text, workspace_id: workspaceId, lang: isRtl ? 'ar' : 'en' })
      });
      const data = await res.json();
      if (res.ok) {
        setRagHistory(prev => [...prev, { role: "ai", text: data.answer }]);
      } else {
        setRagHistory(prev => [...prev, { role: "ai", text: (isRtl ? "خطأ: " : "Error: ") + (data.detail || (isRtl ? "فشل الاستعلام." : "Failed to query.")) }]);
      }
    } catch {
      setRagHistory(prev => [...prev, { role: "ai", text: isRtl ? "خطأ شبكة أثناء الاتصال بوكيل الذكاء الاصطناعي." : "Network error connecting to AI agent." }]);
    } finally {
      setIsRagLoading(false);
    }
  };

  // If neither is open, return null
  if (!activeThread && !isRagSidebarOpen) return null;

  const isThread = !!activeThread;

  return (
    <div className="w-[320px] shrink-0 border-s border-slate-200 bg-white flex flex-col h-full transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center space-x-2">
          {isThread ? (
            <h3 className="font-bold text-[15px] text-[var(--sb-bg)]">{isRtl ? "الموضوع" : "Thread"}</h3>
          ) : (
            <h3 className="font-bold text-[15px] text-[var(--sb-bg)] flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-[var(--sb-bg)]" />
              {isRtl ? "مساعد المستندات" : "Document Assistant"}
            </h3>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-[#f8fafc] rounded-md" 
          onClick={() => {
            setActiveThread(null);
            setIsRagSidebarOpen(false);
          }}
        >
          <X className="h-5 w-5 text-[var(--sb-bg)]/70" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 bg-white">
        {isThread ? (
          <>
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-start space-x-3">
                <Avatar className="h-9 w-9 rounded">
                  <AvatarImage src="https://i.pravatar.cc/40?u=admin" />
                  <AvatarFallback className="rounded bg-[#4a154b] text-white">OP</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-baseline space-x-2">
                    <span className="font-bold text-[15px] text-[var(--sb-bg)]">{activeThread.author || "User"}</span>
                    <span className="text-xs text-[var(--sb-bg)]/70">{activeThread.time}</span>
                  </div>
                  <p className="text-[15px] text-[var(--sb-bg)] mt-0.5 leading-relaxed">{activeThread.text || activeThread.Content}</p>
                </div>
              </div>
            </div>

            {/* Replies */}
            <div className="px-5 py-4">
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 border-t border-slate-200"></div>
                <span className="text-xs font-medium text-[var(--sb-bg)]/70">{replies.length} {isRtl ? "ردود" : "replies"}</span>
                <div className="flex-1 border-t border-slate-200"></div>
              </div>

              <div className="space-y-4">
                {replies.map((reply, i) => (
                  <div key={reply.ID || i} className="flex items-start space-x-3 group">
                    <Avatar className="h-9 w-9 rounded">
                      <AvatarImage src={`https://i.pravatar.cc/40?u=${reply.SenderID || i}`} />
                      <AvatarFallback className="rounded bg-[var(--sb-bg)] text-white">RE</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline space-x-2">
                        <span className="font-bold text-[15px] text-[var(--sb-bg)]">{reply.User?.Email || "User"}</span>
                        <span className="text-xs text-[var(--sb-bg)]/70 hover:underline cursor-pointer">
                          {reply.CreatedAt ? new Date(reply.CreatedAt).toLocaleTimeString() : ""}
                        </span>
                      </div>
                      <p className="text-[15px] text-[var(--sb-bg)] mt-0.5 leading-relaxed">{reply.Content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="p-5 flex flex-col h-full">
            {ragHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 pt-10">
                <div className="w-16 h-16 bg-slate-100 text-[var(--sb-bg)] rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-lg text-[var(--sb-bg)]">{isRtl ? "اسأل عن مستنداتك" : "Ask about your documents"}</h4>
                <p className="text-sm text-[var(--sb-bg)]/70 max-w-xs">
                  Upload PDFs or text files to the channel, then ask the AI Orchestrator to summarize or extract information from them.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {ragHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] ${
                      msg.role === 'user' 
                        ? 'bg-[var(--sb-bg)] text-white rounded-ee-none' 
                        : 'bg-[#f8fafc] text-[var(--sb-bg)] rounded-es-none'
                    }`}>
                      {msg.role === 'ai' && <Sparkles className="w-4 h-4 text-[var(--sb-bg)] mb-1 inline-block me-1" />}
                      <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
                    </div>
                  </div>
                ))}
                {isRagLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] bg-[#f8fafc] rounded-2xl rounded-es-none px-4 py-3 flex items-center gap-1">
                      <div className="w-2 h-2 bg-[var(--sb-bg)]/60 rounded-full animate-bounce delay-0"></div>
                      <div className="w-2 h-2 bg-[var(--sb-bg)]/60 rounded-full animate-bounce delay-[200ms]"></div>
                      <div className="w-2 h-2 bg-[var(--sb-bg)]/60 rounded-full animate-bounce delay-[400ms]"></div>
                    </div>
                  </div>
                )}
                <div ref={ragScrollRef} />
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Reply Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        {isThread ? (
          <MessageInput channelName="thread" onSend={(text, url, type) => { handleSendReply(text, url, type); }} />
        ) : (
          <div className="relative">
             <input 
               type="text" 
               placeholder={isRtl ? "اسأل الذكاء الاصطناعي عن المستندات..." : "Ask AI about documents..."} 
               className="w-full ps-4 pe-10 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-[var(--sb-bg)] focus:ring-2 focus:ring-[var(--sb-bg)]/30 transition-all text-sm"
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   handleRagQuery(e.currentTarget.value);
                   e.currentTarget.value = "";
                 }
               }}
             />
             <div className="absolute end-2 top-2">
               <div className="bg-[var(--sb-bg)] p-1.5 rounded-lg">
                 <ArrowUp className="w-4 h-4 text-white" />
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
