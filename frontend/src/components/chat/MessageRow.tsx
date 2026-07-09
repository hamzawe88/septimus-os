/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Search, Sparkles, CheckSquare, Smile, Edit, Trash2, Check, X } from "lucide-react";
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

  if (msg.type === "human") {
    return (
      <div className="group relative flex items-start gap-3.5 py-2.5 px-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 rounded-xl transition-all duration-150">
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9 w-9 border border-slate-200/80 dark:border-slate-700 shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-brand/20 to-brand/5 text-brand font-bold text-sm">
              {msg.author ? msg.author.charAt(0).toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 end-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-sm" title={isRtl ? "متصل الآن" : "Online now"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[14px] text-slate-900 dark:text-slate-100 hover:underline cursor-pointer">{formatAuthorName(msg.author)}</span>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{msg.time}</span>
          </div>
          {msg.text && !isEditing && (
            <div className="text-[14.5px] text-slate-700 dark:text-slate-200 mt-1 leading-relaxed whitespace-pre-wrap markdown-body">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ ...props }) => {
                    if (props.href?.startsWith('hashtag:')) {
                      return <span className="text-brand bg-brand-light/80 dark:bg-brand/20 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-brand-light font-medium inline-block transition-colors">{props.children}</span>;
                    }
                    if (props.href?.startsWith('mention:')) {
                      return <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium inline-block transition-colors">{props.children}</span>;
                    }
                    return <a {...props} className="text-brand hover:underline font-medium" />;
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
      <div className="group relative flex items-start gap-3.5 py-3 px-4 bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/15 rounded-xl transition-all duration-150 border border-brand/15">
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9 w-9 border border-brand/30 shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-brand to-brand-dark text-white font-bold text-xs">
              AI
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 end-0 w-2.5 h-2.5 bg-amber-400 border-2 border-white dark:border-slate-900 rounded-full shadow-sm animate-pulse" title={isRtl ? "متصل الآن" : "Online now"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-[14px] text-brand dark:text-brand-light">{msg.author || "AI Orchestrator"}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light border border-brand/20">
              <Sparkles className="w-3 h-3" aria-hidden /> AI ORCHESTRATOR
            </span>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{msg.time}</span>
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
        </div>
        <div className="absolute top-[-14px] end-4 lg:end-6 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-md rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-95 group-hover:scale-100 flex items-center gap-1 z-10" aria-label="Message actions">
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
