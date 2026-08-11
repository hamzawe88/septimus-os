/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState, useEffect } from "react";
import { Bold, Italic, Link2, Paperclip, Smile, AtSign, Sparkles, X } from "lucide-react";
import EmojiPicker from 'emoji-picker-react';
import { useAppStore } from "@/store/useAppStore";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface MessageInputProps {
  channelName: string;
  channelId?: string;
  onSend?: (text: string, attachmentUrl?: string, attachmentType?: string) => boolean | void;
  variant?: "default" | "compact";
  isDm?: boolean;
}

export default function MessageInput({ channelName, channelId, onSend, variant = "default", isDm = false }: MessageInputProps) {
  const { t } = useLocalization();
  const { currentUser } = useAppStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [messageText, setMessageText] = useState("");

  interface MentionUser {
    ID?: string;
    id?: string;
    Email: string;
    Role: string;
    [key: string]: unknown;
  }

  const [users, setUsers] = useState<MentionUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  // Hashtag (#) channel detection
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);
  const [channels, setChannels] = useState<{id: string; name: string}[]>([]);
  const [hashtagIndex, setHashtagIndex] = useState(0);

  const { fileInputRef, attachment, setAttachment, isUploading, handleFileSelect } = useFileUpload();
  const { notifyTyping } = useTypingIndicator(channelId, currentUser?.Email || t("chat.user"));

  useEffect(() => {
    fetchWithAuth(`${API_BASE_URL}/users/search?q=`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setUsers(data);
        else if (data && Array.isArray(data.users)) setUsers(data.users);
      })
      .catch(console.error);

    fetchWithAuth(`${API_BASE_URL}/channels`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setChannels(arr.map((c: {id?: string; ID?: string; name?: string; Name?: string}) => ({ id: c.id || c.ID || '', name: c.name || c.Name || '' })));
      })
      .catch(console.error);
  }, []);

  const filteredUsers = mentionQuery !== null
    ? users.filter(u => u.Email?.toLowerCase().includes(mentionQuery.toLowerCase()) || u.Role?.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const filteredChannels = hashtagQuery !== null
    ? channels.filter(c => c.name.toLowerCase().includes(hashtagQuery.toLowerCase()))
    : [];

  const insertMention = (user: MentionUser) => {
    const emailPrefix = user.Email.split('@')[0];
    const textBeforeCursor = messageText.slice(0, cursorPos);
    const textAfterCursor = messageText.slice(cursorPos);
    const replaced = textBeforeCursor.replace(/(^|\s)@([a-zA-Z0-9_.\-\u0600-\u06FF]*)$/, `$1@${emailPrefix} `);
    setMessageText(replaced + textAfterCursor);
    setMentionQuery(null);
    setTimeout(() => { textareaRef.current?.focus(); }, 0);
  };

  const insertHashtag = (channel: {id: string; name: string}) => {
    const textBeforeCursor = messageText.slice(0, cursorPos);
    const textAfterCursor = messageText.slice(cursorPos);
    const replaced = textBeforeCursor.replace(/(^|\s)#([a-zA-Z0-9_.\-\u0600-\u06FF]*)$/, `$1#${channel.name} `);
    setMessageText(replaced + textAfterCursor);
    setHashtagQuery(null);
    setTimeout(() => { textareaRef.current?.focus(); }, 0);
  };

  // Auto-resize textarea as user types
  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Send on Enter (not Shift+Enter), reset height after send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (mentionQuery !== null) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(prev => Math.min(prev + 1, filteredUsers.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' && filteredUsers.length > 0) { e.preventDefault(); insertMention(filteredUsers[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }

    if (hashtagQuery !== null) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHashtagIndex(prev => Math.min(prev + 1, filteredChannels.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHashtagIndex(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' && filteredChannels.length > 0) { e.preventDefault(); insertHashtag(filteredChannels[hashtagIndex]); return; }
      if (e.key === 'Escape') { setHashtagQuery(null); return; }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const text = messageText.trim();
    if (!text && !attachment) return; // Allow sending if only attachment exists

    const success = onSend ? onSend(text, attachment?.url, attachment?.type) : true;
    if (success === false) return; // Don't clear if failed to send

    // Reset
    setMessageText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
    setAttachment(null);
    setShowEmoji(false);
  };

  const handleEmojiClick = (emojiObj: { emoji: string }) => {
    setMessageText(prev => prev + emojiObj.emoji);
    setTimeout(() => {
      handleInput(); // Resize if needed
      textareaRef.current?.focus();
    }, 0);
  };

  const insertText = (prefix: string, suffix: string = "") => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = messageText.substring(0, start);
    const selected = messageText.substring(start, end);
    const after = messageText.substring(end);

    const insertContent = selected || (suffix ? "text" : "");
    const newText = before + prefix + insertContent + suffix + after;

    setMessageText(newText);

    // Set cursor position
    const newCursorPos = before.length + prefix.length + (selected ? selected.length : insertContent.length);

    // Focus and update selection
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        handleInput(); // Trigger resize
      }
    }, 0);
  };

  const isCompact = variant === 'compact' || channelName === 'thread';

  return (
    <div className={`msg-input-wrap ${isCompact ? 'compact-mode' : ''}`} role="form" aria-label={`${t("chat.composer.inputFor")} ${channelName}`}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        title={t("chat.composer.uploadFile")}
        onChange={handleFileSelect}
      />

      <div className="msg-input-box relative">
        {/* Attachment Preview */}
        {attachment && (
          <div className="absolute -top-14 start-0 end-0 z-10 flex items-center rounded-[var(--radius-control)] border border-border bg-popover p-2 text-popover-foreground shadow-[var(--shadow-raised)]">
            {attachment.type === 'image' ? (
              <img src={attachment.url} alt={t("chat.composer.uploadPreview")} className="me-3 size-10 rounded-[var(--radius-control)] object-cover" />
            ) : (
              <Paperclip className="me-3 size-6 text-muted-foreground" />
            )}
            <div className="flex-1 truncate text-sm font-medium">{attachment.name}</div>
            <button type="button" onClick={() => setAttachment(null)} className="rounded-[var(--radius-control)] p-1 hover:bg-muted" title={t("chat.composer.removeAttachment")} aria-label={t("chat.composer.removeAttachment")}>
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}
        {/* Emoji Picker Popup */}
        {showEmoji && (
          <div className={`absolute bottom-full z-50 mb-2 overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover shadow-[var(--shadow-overlay)] ${isCompact ? 'start-0 end-0 mx-auto flex w-fit justify-center' : 'start-0'}`}>
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              width={isCompact ? 300 : 350}
              height={isCompact ? 320 : 400}
            />
          </div>
        )}
        {/* Hashtag Channel Picker Popup */}
        {hashtagQuery !== null && filteredChannels.length > 0 && (
          <div className={`absolute bottom-full z-50 mb-2 max-h-48 w-64 overflow-y-auto rounded-[var(--radius-control)] border border-border bg-popover p-1 shadow-[var(--shadow-overlay)] ${isCompact ? 'start-0 end-0 mx-auto' : 'start-0'}`}>
            {filteredChannels.map((c, idx) => (
              <div
                key={c.id}
                onClick={(e) => { e.preventDefault(); insertHashtag(c); }}
                onMouseEnter={() => setHashtagIndex(idx)}
                className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] p-2 transition-colors ${idx === hashtagIndex ? 'bg-brand-light' : 'hover:bg-muted'}`}
              >
                <div className="flex size-6 items-center justify-center rounded-[var(--radius-control)] bg-muted text-xs font-bold text-muted-foreground">#</div>
                <div className="flex-1 truncate text-sm font-medium">{c.name}</div>
              </div>
            ))}
          </div>
        )}
        {/* Mention Picker Popup */}
        {mentionQuery !== null && filteredUsers.length > 0 && (
          <div className={`absolute bottom-full z-50 mb-2 max-h-48 w-64 overflow-y-auto rounded-[var(--radius-control)] border border-border bg-popover p-1 shadow-[var(--shadow-overlay)] ${isCompact ? 'start-0 end-0 mx-auto' : 'start-0'}`}>
            {filteredUsers.map((u, idx) => (
              <div
                key={u.ID || u.id || idx}
                onClick={(e) => { e.preventDefault(); insertMention(u); }}
                onMouseEnter={() => setMentionIndex(idx)}
                className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] p-2 transition-colors ${idx === mentionIndex ? 'bg-brand-light' : 'hover:bg-muted'}`}
              >
                <div className="flex size-6 items-center justify-center rounded-full bg-brand-light text-xs font-bold uppercase text-brand">
                   {u.Email?.charAt(0) || t("chat.composer.unknownInitial")}
                </div>
                <div className="flex-1 truncate text-sm font-medium">
                   {u.Email?.split('@')[0] || t("chat.unknownUser")}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={messageText}
          onChange={(e) => {
            const val = e.target.value;
            setMessageText(val);
            handleInput();
            notifyTyping();

            // Mention detection
            const cursor = e.target.selectionStart;
            setCursorPos(cursor);
            const textBeforeCursor = val.slice(0, cursor);
            // @ mention detection
            const atMatch = textBeforeCursor.match(/(^|\s)@([a-zA-Z0-9_.\-\u0600-\u06FF]*)$/);
            if (atMatch) {
              setMentionQuery(atMatch[2]);
              setMentionIndex(0);
              setHashtagQuery(null);
            } else {
              setMentionQuery(null);
            }
            // # hashtag/channel detection
            const hashMatch = textBeforeCursor.match(/(^|\s)#([a-zA-Z0-9_.\-\u0600-\u06FF]*)$/);
            if (hashMatch) {
              setHashtagQuery(hashMatch[2]);
              setHashtagIndex(0);
              setMentionQuery(null);
            } else {
              setHashtagQuery(null);
            }
          }}
          onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
          onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
          onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
          rows={1}
          placeholder={`${t(isDm ? "chat.composer.messagePerson" : "chat.composer.messageChannel")} ${isDm ? channelName : `#${channelName}`}`}
          className="msg-input-textarea"
          onKeyDown={handleKeyDown}
          aria-label={`${t("chat.composer.typeMessage")} ${isDm ? channelName : `#${channelName}`}`}
          aria-multiline="true"
          dir="auto"
        />

        {/* Bottom Toolbar & Send Button container */}
        <div className="msg-input-bottom-bar flex items-center justify-between p-2 pt-0 gap-2">
          <div className="msg-input-tools flex items-center gap-1 flex-wrap sm:flex-nowrap">
            {/* Formatting Tools - Hidden in compact mode */}
            {!isCompact && (
              <div className="flex items-center rounded-lg bg-muted/60 p-0.5">
                <button type="button" className="msg-tool-btn" title={t("chat.composer.bold")} aria-label={t("chat.composer.bold")} onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("**", "**")}>
                  <Bold className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button type="button" className="msg-tool-btn" title={t("chat.composer.italic")} aria-label={t("chat.composer.italic")} onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("_", "_")}>
                  <Italic className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button type="button" className="msg-tool-btn" title={t("chat.composer.link")} aria-label={t("chat.composer.insertLink")} onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("[", "](url)")}>
                  <Link2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            )}

            {!isCompact && <div className="msg-tool-divider" aria-hidden />}

            {/* Action Tools */}
            <button
              type="button"
              className="msg-tool-btn"
              title={t("chat.composer.attachFile")}
              aria-label={t("chat.composer.attachFile")}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Paperclip className={`w-4 h-4 ${isUploading ? 'animate-pulse text-primary' : ''}`} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="msg-tool-btn"
              title={t("chat.composer.emoji")}
              aria-label={t("chat.composer.addEmoji")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowEmoji(!showEmoji)}
            >
              <Smile className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button type="button" className="msg-tool-btn" title={t("chat.composer.mention")} aria-label={t("chat.composer.mentionSomeone")} onMouseDown={(e) => e.preventDefault()} onClick={() => {
              // Insert @ and immediately open the mention picker
              const el = textareaRef.current;
              if (el) {
                const pos = el.selectionStart;
                const before = messageText.slice(0, pos);
                const after = messageText.slice(pos);
                const newText = before + '@' + after;
                setMessageText(newText);
                setCursorPos(pos + 1);
                setMentionQuery('');
                setMentionIndex(0);
                setTimeout(() => { el.focus(); el.setSelectionRange(pos + 1, pos + 1); }, 0);
              } else {
                insertText('@');
                setMentionQuery('');
                setMentionIndex(0);
              }
            }}>
              <AtSign className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Ask AI Premium Pill */}
            <button
              type="button"
              className="ms-1 inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] bg-brand px-2 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand-hover"
              aria-label={t("chat.composer.askAiAssistant")}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toggle-rag-sidebar'));
              }}
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              <span className={`whitespace-nowrap ${isCompact ? 'hidden' : 'hidden sm:inline'}`}>{t("chat.askAi")}</span>
            </button>
          </div>

          {/* Send Button */}
          <button
            type="button"
            className="msg-send-btn shrink-0"
            onClick={handleSend}
            aria-label={t("chat.composer.sendMessage")}
            title={t("chat.composer.sendMessage")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="-ms-0.5 mt-px"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {!isCompact && (
        <p className="msg-input-hint flex items-center justify-center gap-1.5 opacity-60">
          <Sparkles className="w-3 h-3" aria-hidden />
          <span>{t("chat.composer.hintBefore")} <kbd className="font-semibold">{t("chat.composer.enterKey")}</kbd> {t("chat.composer.hintAfter")}</span>
        </p>
      )}
    </div>
  );
}
