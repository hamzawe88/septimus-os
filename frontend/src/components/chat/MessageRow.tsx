/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Search, Sparkles, CheckSquare, Smile, Edit, Trash2, Check, X, ThumbsUp, ThumbsDown, Orbit } from "lucide-react";
import { EntityCard, AIProposalCard } from "@/components/messages/Cards";
// Message type is removed if unused
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

const processMentionsAndTags = (text: string) => {
  if (!text) return "";
  // Convert #hashtag to a special markdown link
  let processed = text.replace(/(^|\s)#([a-zA-Z0-9_\u0600-\u06FF]+)/g, "$1[#$2](hashtag:$2)");
  // Convert @mention to a special markdown link
  processed = processed.replace(/(^|\s)@([a-zA-Z0-9_.\-\u0600-\u06FF]+)/g, "$1[@$2](mention:$2)");
  return processed;
};

const formatAuthorName = (name: string) => {
  if (!name) return "User";
  if (name.includes("@")) {
    const part = name.split("@")[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return name;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function MessageRow({ msg, onReplyClick, onEdit, onDelete }: { msg: any, onReplyClick?: () => void, onEdit?: (id: string, newText: string) => void, onDelete?: (id: string) => void }) {
  const { isRtl } = useLocalization();
  const hasAttachment = !!msg.AttachmentURL;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");
  const [feedbackRating, setFeedbackRating] = useState<'up' | 'down' | null>(null);

  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("septimus_avatar") || null;
    }
    return null;
  });
  const [currentUserName, setCurrentUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("septimus_display_name") || "Admin";
    }
    return "Admin";
  });

  useEffect(() => {
    const loadSync = () => {
      if (typeof window === "undefined") return;
      const savedAvatar = localStorage.getItem("septimus_avatar");
      const savedName = localStorage.getItem("septimus_display_name") || "Admin";
      setCurrentUserAvatar(savedAvatar || null);
      setCurrentUserName(savedName);
    };
    loadSync();
    window.addEventListener("septimus_avatar_updated", loadSync);
    window.addEventListener("septimus_display_name_updated", loadSync);
    return () => {
      window.removeEventListener("septimus_avatar_updated", loadSync);
      window.removeEventListener("septimus_display_name_updated", loadSync);
    };
  }, []);

  const isCurrentUser = 
    msg.sender === "me" || 
    msg.isMe === true ||
    msg.author === "Admin" || 
    msg.author === "admin@septimus.local" || 
    msg.author === currentUserName || 
    msg.author === formatAuthorName(currentUserName) ||
    (msg.User && (msg.User.Email === "admin@septimus.local" || msg.User.Email === currentUserName || msg.User.Name === currentUserName));

  const effectiveAvatar = isCurrentUser 
    ? (currentUserAvatar || msg.avatar || msg.AvatarUrl || (msg.User ? msg.User.AvatarUrl : undefined))
    : (msg.avatar || msg.AvatarUrl || (msg.User ? msg.User.AvatarUrl : undefined));

  const handleFeedback = async (rating: 'up' | 'down') => {
    const targetID = msg.id || msg.ID;
    if (!targetID) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/messages/${targetID}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      });
      if (res.ok) {
        setFeedbackRating(rating);
      }
    } catch (err) {
      console.error("Failed to submit feedback", err);
    }
  };

  const handleConvertToTask = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/messages/convert-to-task`, {
        method: "POST",
        body: JSON.stringify({
          message_id: msg.id || msg.ID,
          project_id: "",
          title: ""
        })
      });
      if (res.ok) {
        alert("✅ Message converted to a Kanban task successfully!");
      } else {
        alert("❌ Failed to convert message to task.");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Server connection error.");
    }
  };

  const handleAddToMyOrbit = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/orbit/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (msg.text || "Captured message").substring(0, 120),
          description: msg.text || "",
          source_type: "CHAT",
          source_id: String(msg.id || msg.ID || ""),
          source_link: typeof window !== "undefined" ? window.location.pathname : "",
          focus_priority: 0,
          energy_tag: "HIGH_ENERGY",
          xp_reward: 15,
        }),
      });
      if (res.ok) {
        alert(isRtl ? "✅ تمت إضافة الرسالة إلى مداري الشخصي (My Orbit) بنجاح!" : "✅ Added to My Orbit stream successfully!");
      } else {
        alert(isRtl ? "❌ تعذر إضافة الرسالة إلى مداري." : "❌ Failed to add to My Orbit.");
      }
    } catch (err) {
      console.error(err);
      alert(isRtl ? "❌ خطأ في الاتصال بالخادم." : "❌ Server connection error.");
    }
  };

  if (msg.type === "human") {
    return (
      <div className="group relative flex items-start gap-3 py-2 px-4 hover:bg-[#F8F8F8] transition-colors rounded-lg">
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9.5 w-9.5 rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            {effectiveAvatar && !effectiveAvatar.includes('pravatar') ? (
              <img src={effectiveAvatar} alt="avatar" className="w-full h-full rounded-lg object-cover" />
            ) : (
              <AvatarFallback className="bg-gradient-to-br from-[#2563EB] to-[#60A5FA] text-white font-bold text-sm rounded-lg shadow-inner">
                {(isCurrentUser ? (currentUserName || "Admin") : (msg.author || "A")).charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="absolute bottom-[-2px] end-[-2px] w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-sm" title={isRtl ? "متصل الآن" : "Online now"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[15px] text-[#1D1C1D] hover:underline cursor-pointer">{formatAuthorName(msg.author)}</span>
            <span className="text-[12px] font-normal text-slate-400">{msg.time}</span>
          </div>
          {msg.text && !isEditing && (
            <div className="text-[15px] text-[#1D1C1D] mt-0.5 leading-relaxed whitespace-pre-wrap markdown-body">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ ...props }) => {
                    if (props.href?.startsWith('hashtag:')) {
                      return <span className="bg-[#E8F5FA] text-[#1264A3] font-semibold px-1.5 py-0.5 rounded cursor-pointer hover:bg-[#D0ECF7] transition-colors inline-block">{props.children}</span>;
                    }
                    if (props.href?.startsWith('mention:')) {
                      return <span className="bg-[#E8F5FA] text-[#1264A3] font-semibold px-1.5 py-0.5 rounded cursor-pointer hover:bg-[#D0ECF7] transition-colors inline-block">{props.children}</span>;
                    }
                    return <a {...props} className="text-[#1264A3] hover:underline font-medium" />;
                  }
                }}
              >
                {processMentionsAndTags(msg.text)}
              </ReactMarkdown>
            </div>
          )}
          {isEditing && (
            <div className="mt-2 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder={isRtl ? "تعديل الرسالة..." : "Edit message..."}
                aria-label={isRtl ? "تعديل الرسالة" : "Edit message"}
                className="w-full p-2.5 border border-brand/40 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand shadow-inner"
                rows={3}
                dir="auto"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onEdit) {
                      onEdit(msg.ID || msg.id, editText);
                    }
                    setIsEditing(false);
                  }}
                  className="px-3 py-1 bg-brand text-white text-xs font-semibold rounded-lg flex items-center gap-1 hover:bg-brand-dark transition-colors shadow-sm"
                >
                  <Check className="w-3 h-3" /> {isRtl ? "حفظ التعديل" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditText(msg.text || "");
                    setIsEditing(false);
                  }}
                  className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  <X className="w-3 h-3" /> {isRtl ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          )}
          {hasAttachment && msg.AttachmentType === "image" && (
            <div className="mt-2.5">
              { }
              <img src={msg.AttachmentURL} alt="attachment" className="max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow" />
            </div>
          )}
          {hasAttachment && msg.AttachmentType !== "image" && (
            <div className="mt-2.5 max-w-sm flex items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shadow-sm">
              <div className="flex-1 text-sm font-medium text-brand truncate">
                <a href={msg.AttachmentURL} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">Download Attached File</a>
              </div>
            </div>
          )}
        </div>
        <div className="absolute top-[-14px] end-4 lg:end-6 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-md rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 flex items-center gap-1 z-10" aria-label="Message actions">
          <button className="p-1 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "تفاعل" : "React with emoji"} title={isRtl ? "تفاعل" : "React"}><Smile className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "رد في خيط" : "Reply in thread"} title={isRtl ? "رد في خيط" : "Reply in thread"} onClick={onReplyClick}><MessageSquare className="w-3.5 h-3.5" /></button>
          {onEdit && (
            <button className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "تعديل الرسالة" : "Edit message"} title={isRtl ? "تعديل الرسالة" : "Edit message"} onClick={() => { setEditText(msg.text || ""); setIsEditing(true); }}>
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button className="p-1 text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "حذف الرسالة" : "Delete message"} title={isRtl ? "حذف الرسالة" : "Delete message"} onClick={() => onDelete(msg.ID || msg.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="p-1 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "إشارة" : "Mention"} title={isRtl ? "إشارة" : "Mention"}><Search className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-slate-500 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "إضافة إلى مداري" : "Add to My Orbit"} title={isRtl ? "إضافة إلى مداري" : "Add to My Orbit"} onClick={handleAddToMyOrbit}><Orbit className="w-3.5 h-3.5 text-cyan-500 animate-spin-slow" /></button>
          <button className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "تحويل إلى مهمة Kanban" : "Convert to Task"} title={isRtl ? "تحويل إلى مهمة Kanban" : "Convert to Task"} onClick={handleConvertToTask}><CheckSquare className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  if (msg.type === "system" && msg.entityType) {
    return (
      <div className="group flex items-start gap-3.5 py-2 px-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200/50 dark:border-slate-700/50 my-2">
        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">
          SYS
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="font-bold text-[13px] text-slate-700 dark:text-slate-300">{formatAuthorName(msg.author)}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">EVENT_STREAM</span>
            <span className="text-[11px] text-slate-400">{msg.time}</span>
          </div>
          <EntityCard
            entityType={msg.entityType}
            entityId={msg.entityData?.id || ""}
            data={msg.entityData!}
          />
        </div>
      </div>
    );
  }

  if (msg.type === "ai") {
    return (
      <div className="group relative flex items-start gap-3 py-3 px-4 bg-purple-50/50 hover:bg-purple-50 transition-colors rounded-lg border border-purple-100">
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9.5 w-9.5 rounded-lg border border-purple-200 shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white font-bold text-xs rounded-lg">
              AI
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-[-2px] end-[-2px] w-3 h-3 bg-amber-400 border-2 border-white rounded-full shadow-sm animate-pulse" title={isRtl ? "متصل الآن" : "Online now"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[15px] text-[#1D1C1D]">{msg.author || "AI Orchestrator"}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
              <Sparkles className="w-3 h-3" aria-hidden /> AI ORCHESTRATOR
            </span>
            <span className="text-[12px] font-normal text-slate-400">{msg.time}</span>
          </div>
          <div className="text-[14.5px] text-slate-800 dark:text-slate-100 mt-1.5 leading-relaxed whitespace-pre-wrap markdown-body">
            {msg.text || (
              <p>
                I noticed a new <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-xs">Task</code> entity was created without an assignee. Based on previous roadmap tasks, <span className="font-semibold text-brand">Sara M. usually handles this.</span>
              </p>
            )}
          </div>
          {msg.aiProposal && (
            <div className="mt-3">
              <AIProposalCard
                title={msg.aiProposal.title}
                description={msg.aiProposal.description}
                onApprove={() => alert("✅ Action Approved!")}
                onDismiss={() => alert("❌ Dismissed.")}
              />
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-2 border-t border-brand/10 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{isRtl ? "هل كان هذا الرد مفيداً؟" : "Was this response helpful?"}</span>
            <button
              onClick={() => handleFeedback('up')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
                feedbackRating === 'up'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20'
                  : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
              title={isRtl ? "رد مفيد" : "Helpful response"}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFeedback('down')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
                feedbackRating === 'down'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20'
                  : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
              title={isRtl ? "رد غير مفيد" : "Not helpful"}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="absolute top-[-14px] end-4 lg:end-6 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-md rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 flex items-center gap-1 z-10" aria-label="Message actions">
          <button onClick={() => handleFeedback('up')} className={`p-1 rounded-full transition-colors ${feedbackRating === 'up' ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`} aria-label={isRtl ? "مفيد" : "Helpful"} title={isRtl ? "مفيد" : "Helpful"}><ThumbsUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => handleFeedback('down')} className={`p-1 rounded-full transition-colors ${feedbackRating === 'down' ? 'text-red-600 font-bold' : 'text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`} aria-label={isRtl ? "غير مفيد" : "Not helpful"} title={isRtl ? "غير مفيد" : "Not helpful"}><ThumbsDown className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "تفاعل" : "React with emoji"} title={isRtl ? "تفاعل" : "React"}><Smile className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "رد في خيط" : "Reply in thread"} title={isRtl ? "رد في خيط" : "Reply in thread"} onClick={onReplyClick}><MessageSquare className="w-3.5 h-3.5" /></button>
          {onDelete && (
            <button className="p-1 text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "حذف الرسالة" : "Delete message"} title={isRtl ? "حذف الرسالة" : "Delete message"} onClick={() => onDelete(msg.ID || msg.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="p-1 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "سؤال الذكاء الاصطناعي" : "Ask AI"} title={isRtl ? "سؤال الذكاء الاصطناعي" : "Ask AI"}><Sparkles className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" aria-label={isRtl ? "تحويل إلى مهمة Kanban" : "Convert to Task"} title={isRtl ? "تحويل إلى مهمة Kanban" : "Convert to Task"} onClick={handleConvertToTask}><CheckSquare className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return null;
}
