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
import { Button } from "@/components/ui/button";
import { ProvenanceBadge, type ProvenanceLevel } from "@/components/ui/provenance";
import { Textarea } from "@/components/ui/textarea";

const processMentionsAndTags = (text: string) => {
  if (!text) return "";
  // Convert #hashtag to a special markdown link
  let processed = text.replace(/(^|\s)#([a-zA-Z0-9_\u0600-\u06FF]+)/g, "$1[#$2](https://hashtag.internal/$2)");
  // Convert @mention to a special markdown link
  processed = processed.replace(/(^|\s)@([a-zA-Z0-9_.\-\u0600-\u06FF]+)/g, "$1[@$2](https://mention.internal/$2)");
  return processed;
};

const formatAuthorName = (name: string, fallback: string) => {
  if (!name) return fallback;
  if (name.includes("@")) {
    const part = name.split("@")[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return name;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function MessageRow({ msg, onReplyClick, onEdit, onDelete, onConvertToTask }: { msg: any, onReplyClick?: () => void, onEdit?: (id: string, newText: string) => void, onDelete?: (id: string) => void, onConvertToTask?: (msg: any) => void }) {
  const { t } = useLocalization();
  const adminUserLabel = t("chat.adminUser");
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
      return localStorage.getItem("septimus_display_name") || adminUserLabel;
    }
    return adminUserLabel;
  });

  useEffect(() => {
    const loadSync = () => {
      if (typeof window === "undefined") return;
      const savedAvatar = localStorage.getItem("septimus_avatar");
      const savedName = localStorage.getItem("septimus_display_name") || adminUserLabel;
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
  }, [adminUserLabel]);

  const isCurrentUser =
    msg.sender === "me" ||
    msg.isMe === true ||
    msg.author === adminUserLabel ||
    msg.author === "admin@septimus.local" ||
    msg.author === currentUserName ||
    msg.author === formatAuthorName(currentUserName, t("chat.user")) ||
    (msg.User && (msg.User.Email === "admin@septimus.local" || msg.User.Email === currentUserName || msg.User.Name === currentUserName));

  // Build a deterministic avatar: prefer a real stored image, then ui-avatars keyed by name
  const fallbackAuthorName = isCurrentUser
    ? (currentUserName || adminUserLabel)
    : (msg.author || t("chat.user"));
  const rawAvatar = isCurrentUser
    ? (currentUserAvatar || msg.avatar || msg.AvatarUrl || (msg.User ? msg.User.AvatarUrl : undefined))
    : (msg.avatar || msg.AvatarUrl || (msg.User ? msg.User.AvatarUrl : undefined));
  // Only use stored avatar if it looks like a valid custom URL (not a placeholder/pravatar)
  const isValidCustomAvatar = rawAvatar &&
    typeof rawAvatar === 'string' &&
    rawAvatar.trim() !== '' &&
    !rawAvatar.includes('pravatar') &&
    !rawAvatar.includes('placeholder');
  const effectiveAvatar = isValidCustomAvatar ? rawAvatar : null;
  const authorInitials = fallbackAuthorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part.charAt(0))
    .join("")
    .toUpperCase();

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

  const handleConvertToTask = () => {
    if (onConvertToTask) {
      onConvertToTask(msg);
    }
  };

  const handleAddToMyOrbit = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/orbit/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (msg.text || t("chat.capturedMessage")).substring(0, 120),
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
        alert(t("chat.orbitAdded"));
      } else {
        alert(t("chat.orbitAddFailed"));
      }
    } catch (err) {
      console.error(err);
      alert(t("chat.serverError"));
    }
  };

  const declaredProvenance = msg.provenance_level || msg.provenanceLevel;
  const allowedProvenance: ProvenanceLevel[] = [
    "verified",
    "confident-recall",
    "assumption",
    "speculation",
  ];
  const provenanceLevel: ProvenanceLevel = allowedProvenance.includes(
    declaredProvenance,
  )
    ? declaredProvenance
    : Array.isArray(msg.citations) && msg.citations.length > 0
      ? "verified"
      : "confident-recall";

  if (msg.type === "human") {
    return (
      <article className="group relative flex items-start gap-3 rounded-[var(--radius-control)] px-4 py-2 transition-colors hover:bg-muted/60">
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9.5 w-9.5 overflow-hidden rounded-[var(--radius-control)] border border-border shadow-[var(--shadow-raised)]">
            {effectiveAvatar ? (
              <img src={effectiveAvatar} alt={fallbackAuthorName} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="bg-brand-light text-xs font-bold text-brand">
                {authorInitials}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="absolute bottom-[-2px] end-[-2px] size-3 rounded-full border-2 border-card bg-success shadow-[var(--shadow-raised)]" title={t("chat.onlineNow")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="cursor-pointer text-sm font-bold hover:underline">{formatAuthorName(msg.author, t("chat.user"))}</span>
            <span className="text-xs font-normal text-muted-foreground">{msg.time}</span>
          </div>
          {msg.text && !isEditing && (
            <div className="markdown-body mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ ...props }) => {
                    if (props.href?.startsWith('https://hashtag.internal/')) {
                      return <span
                        onClick={() => window.dispatchEvent(new CustomEvent('septimus:open-global-search', { detail: { query: props.children } }))}
                        className="inline-block cursor-pointer rounded-[var(--radius-control)] bg-info/10 px-1.5 py-0.5 font-semibold text-info transition-colors hover:bg-info/20"
                      >
                        {props.children}
                      </span>;
                    }
                    if (props.href?.startsWith('https://mention.internal/')) {
                      return <span
                        onClick={() => window.dispatchEvent(new CustomEvent('septimus:open-global-search', { detail: { query: props.children } }))}
                        className="inline-block cursor-pointer rounded-[var(--radius-control)] bg-info/10 px-1.5 py-0.5 font-semibold text-info transition-colors hover:bg-info/20"
                      >
                        {props.children}
                      </span>;
                    }
                    return <a {...props} className="font-medium text-info hover:underline" />;
                  }
                }}
              >
                {processMentionsAndTags(msg.text)}
              </ReactMarkdown>
            </div>
          )}
          {isEditing && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder={t("chat.editMessagePlaceholder")}
                aria-label={t("chat.editMessage")}
                className="w-full"
                rows={3}
                dir="auto"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    if (onEdit) {
                      onEdit(msg.ID || msg.id, editText);
                    }
                    setIsEditing(false);
                  }}
                  size="sm"
                >
                  <Check className="w-3 h-3" /> {t("chat.saveEdit")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEditText(msg.text || "");
                    setIsEditing(false);
                  }}
                  variant="secondary"
                  size="sm"
                >
                  <X className="w-3 h-3" /> {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
          {hasAttachment && msg.AttachmentType === "image" && (
            <div className="mt-2.5">
              { }
              <img src={msg.AttachmentURL} alt={t("chat.imageAttachment")} className="max-w-sm rounded-[var(--radius-surface)] border border-border shadow-[var(--shadow-raised)]" />
            </div>
          )}
          {hasAttachment && msg.AttachmentType !== "image" && (
            <div className="mt-2.5 flex max-w-sm items-center rounded-[var(--radius-control)] border border-border bg-muted/50 p-3 shadow-[var(--shadow-raised)]">
              <div className="flex-1 text-sm font-medium text-brand truncate">
                <a href={msg.AttachmentURL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">{t("chat.downloadAttachment")}</a>
              </div>
            </div>
          )}
        </div>
        <div className="absolute top-[-14px] end-4 z-10 flex scale-95 items-center gap-1 rounded-[var(--radius-control)] border border-border bg-popover/95 px-2 py-0.5 opacity-0 shadow-[var(--shadow-raised)] backdrop-blur-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 lg:end-6" aria-label={t("chat.messageActions")}>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-warning" aria-label={t("chat.reactWithEmoji")} title={t("chat.react")}><Smile className="w-3.5 h-3.5" /></button>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-brand" aria-label={t("chat.replyInThread")} title={t("chat.replyInThread")} onClick={onReplyClick}><MessageSquare className="w-3.5 h-3.5" /></button>
          {onEdit && (
            <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-info" aria-label={t("chat.editMessage")} title={t("chat.editMessage")} onClick={() => { setEditText(msg.text || ""); setIsEditing(true); }}>
              <Edit className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={t("chat.deleteMessageTitle")} title={t("chat.deleteMessageTitle")} onClick={() => onDelete(msg.ID || msg.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-brand" aria-label={t("chat.mention")} title={t("chat.mention")}><Search className="w-3.5 h-3.5" /></button>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-info/10 hover:text-info" aria-label={t("chat.addToOrbit")} title={t("chat.addToOrbit")} onClick={handleAddToMyOrbit}><Orbit className="w-3.5 h-3.5 animate-spin-slow" /></button>
          {onConvertToTask && (
            <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-success/10 hover:text-success" aria-label={t("chat.pinAsTask")} title={t("chat.pinAsTask")} onClick={handleConvertToTask}><CheckSquare className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </article>
    );
  }

  if (msg.type === "system" && msg.entityType) {
    return (
      <article className="group my-2 flex items-start gap-3.5 rounded-[var(--radius-control)] border border-border bg-muted/35 px-4 py-2">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-xs font-bold text-muted-foreground">
          {t("chat.systemShort")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-xs font-bold">{formatAuthorName(msg.author, t("chat.systemEvent"))}</span>
            <span className="rounded-[var(--radius-control)] bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">{t("chat.eventStream")}</span>
            <span className="text-xs text-muted-foreground">{msg.time}</span>
          </div>
          <EntityCard
            entityType={msg.entityType}
            entityId={msg.entityData?.id || ""}
            data={msg.entityData!}
          />
        </div>
      </article>
    );
  }

  if (msg.type === "ai") {
    return (
      <article
        data-testid="ai-message"
        className="group relative flex items-start gap-3 rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light px-4 py-3 transition-colors"
      >
        <div className="relative shrink-0 mt-0.5">
          <Avatar className="h-9.5 w-9.5 rounded-[var(--radius-control)] border border-brand/20 shadow-[var(--shadow-raised)]">
            <AvatarFallback className="rounded-[var(--radius-control)] bg-brand text-xs font-bold text-brand-foreground">
              AI
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-[-2px] end-[-2px] size-3 animate-pulse rounded-full border-2 border-card bg-warning shadow-[var(--shadow-raised)]" title={t("chat.onlineNow")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{msg.author || t("chat.aiOrchestrator")}</span>
            <ProvenanceBadge level={provenanceLevel} />
            <span className="text-xs font-normal text-muted-foreground">{msg.time}</span>
          </div>
          <div className="markdown-body mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {msg.text ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.text}
              </ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">{t("chat.aiEmptyResponse")}</p>
            )}
          </div>
          {msg.aiProposal && (
            <div className="mt-3">
              <AIProposalCard
                title={msg.aiProposal.title}
                description={msg.aiProposal.description}
                onApprove={() => alert(t("chat.aiProposalApproved"))}
                onDismiss={() => alert(t("chat.aiProposalDismissed"))}
              />
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-2 border-t border-brand/10 pt-2 text-xs text-muted-foreground">
            <span>{t("chat.wasHelpful")}</span>
            <button
              onClick={() => handleFeedback('up')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
                feedbackRating === 'up'
                  ? 'border border-success/20 bg-success/10 font-bold text-success'
                  : 'hover:bg-muted'
              }`}
              title={t("chat.helpfulResponse")}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFeedback('down')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
                feedbackRating === 'down'
                  ? 'border border-destructive/20 bg-destructive/10 font-bold text-destructive'
                  : 'hover:bg-muted'
              }`}
              title={t("chat.notHelpful")}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="absolute top-[-14px] end-4 z-10 flex scale-95 items-center gap-1 rounded-[var(--radius-control)] border border-border bg-popover/95 px-2 py-0.5 opacity-0 shadow-[var(--shadow-raised)] backdrop-blur-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 lg:end-6" aria-label={t("chat.messageActions")}>
          <button onClick={() => handleFeedback('up')} className={`rounded-[var(--radius-control)] p-1 transition-colors ${feedbackRating === 'up' ? 'font-bold text-success' : 'text-muted-foreground hover:bg-success/10 hover:text-success'}`} aria-label={t("chat.helpful")} title={t("chat.helpful")}><ThumbsUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => handleFeedback('down')} className={`rounded-[var(--radius-control)] p-1 transition-colors ${feedbackRating === 'down' ? 'font-bold text-destructive' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}`} aria-label={t("chat.notHelpful")} title={t("chat.notHelpful")}><ThumbsDown className="w-3.5 h-3.5" /></button>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-warning/10 hover:text-warning" aria-label={t("chat.reactWithEmoji")} title={t("chat.react")}><Smile className="w-3.5 h-3.5" /></button>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-brand" aria-label={t("chat.replyInThread")} title={t("chat.replyInThread")} onClick={onReplyClick}><MessageSquare className="w-3.5 h-3.5" /></button>
          {onDelete && (
            <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label={t("chat.deleteMessageTitle")} title={t("chat.deleteMessageTitle")} onClick={() => onDelete(msg.ID || msg.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-brand-light hover:text-brand" aria-label={t("chat.askAi")} title={t("chat.askAi")}><Sparkles className="w-3.5 h-3.5" /></button>
          <button className="rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-success/10 hover:text-success" aria-label={t("chat.convertToTask")} title={t("chat.convertToTask")} onClick={handleConvertToTask}><CheckSquare className="w-3.5 h-3.5" /></button>
        </div>
      </article>
    );
  }

  return null;
}
