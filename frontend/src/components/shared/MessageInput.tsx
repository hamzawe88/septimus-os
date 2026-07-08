/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Link2, Paperclip, Smile, AtSign, Sparkles, X } from "lucide-react";
import EmojiPicker from 'emoji-picker-react';
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';
import { useAppStore } from "@/store/useAppStore";

interface MessageInputProps {
  channelName: string;
  channelId?: string;
  onSend?: (text: string, attachmentUrl?: string, attachmentType?: string) => boolean | void;
  variant?: "default" | "compact";
  isDm?: boolean;
}

export default function MessageInput({ channelName, channelId, onSend, variant = "default", isDm = false }: MessageInputProps) {
  const { currentUser } = useAppStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachment, setAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [messageText, setMessageText] = useState("");

  // Auto-resize textarea as user types
  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Send on Enter (not Shift+Enter), reset height after send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Prevent sending when selecting IME suggestions (e.g. Arabic/Asian input)
    if (e.nativeEvent.isComposing) return;
    
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
            const res = await fetchWithAuth(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: {

        },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setAttachment({ url: data.url, type: data.type, name: file.name });
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    <div className={`msg-input-wrap ${isCompact ? 'compact-mode' : ''}`} role="form" aria-label={`Message input for ${channelName}`}>
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        title="Upload file"
        onChange={handleFileSelect} 
      />

      <div className="msg-input-box relative">
        {/* Attachment Preview */}
        {attachment && (
          <div className="absolute -top-14 start-0 end-0 bg-white border border-gray-200 rounded-lg p-2 flex items-center shadow-sm z-10">
            {attachment.type === 'image' ? (
              <img src={attachment.url} alt="upload" className="h-10 w-10 object-cover rounded me-3" />
            ) : (
              <Paperclip className="h-6 w-6 text-gray-500 me-3" />
            )}
            <div className="flex-1 truncate text-sm text-gray-700 font-medium">{attachment.name}</div>
            <button type="button" onClick={() => setAttachment(null)} className="p-1 hover:bg-gray-100 rounded-md" title="Remove attachment" aria-label="Remove attachment">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        )}
        {/* Emoji Picker Popup */}
        {showEmoji && (
          <div className={`absolute bottom-full mb-2 z-50 shadow-2xl rounded-xl border border-slate-200 bg-white overflow-hidden ${isCompact ? 'start-0 end-0 mx-auto w-fit flex justify-center' : 'start-0 rtl:end-0'}`}>
            <EmojiPicker 
              onEmojiClick={handleEmojiClick} 
              width={isCompact ? 300 : 350} 
              height={isCompact ? 320 : 400} 
            />
          </div>
        )}
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={messageText}
          onChange={(e) => {
            setMessageText(e.target.value);
            handleInput();
            if (channelId && !isTypingRef.current) {
              isTypingRef.current = true;
              fetchWithAuth(`${API_BASE_URL}/chat/typing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  channel_id: channelId,
                  user_email: currentUser?.Email || "مستخدم",
                  is_typing: true
                })
              }).catch(() => {});
            }
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
              isTypingRef.current = false;
              if (channelId) {
                fetchWithAuth(`${API_BASE_URL}/chat/typing`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    channel_id: channelId,
                    user_email: currentUser?.Email || "مستخدم",
                    is_typing: false
                  })
                }).catch(() => {});
              }
            }, 2500);
          }}
          rows={1}
          placeholder={isDm ? `Message ${channelName}` : `Message #${channelName}`}
          className="msg-input-textarea"
          onKeyDown={handleKeyDown}
          aria-label={`Type a message in #${channelName}`}
          aria-multiline="true"
          dir="auto"
        />

        {/* Bottom Toolbar & Send Button container */}
        <div className="msg-input-bottom-bar flex items-center justify-between p-2 pt-0 gap-2">
          <div className="msg-input-tools flex items-center gap-1 flex-wrap sm:flex-nowrap">
            {/* Formatting Tools - Hidden in compact mode */}
            {!isCompact && (
              <div className="flex items-center bg-slate-50 dark:bg-slate-800/50 rounded-lg p-0.5">
                <button type="button" className="msg-tool-btn" title="Bold" aria-label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("**", "**")}>
                  <Bold className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button type="button" className="msg-tool-btn" title="Italic" aria-label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("_", "_")}>
                  <Italic className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button type="button" className="msg-tool-btn" title="Link" aria-label="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("[", "](url)")}>
                  <Link2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
            
            {!isCompact && <div className="msg-tool-divider" aria-hidden />}
            
            {/* Action Tools */}
            <button 
              type="button"
              className="msg-tool-btn" 
              title="Attach file" 
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Paperclip className={`w-4 h-4 ${isUploading ? 'animate-pulse text-primary' : ''}`} strokeWidth={1.5} />
            </button>
            <button 
              type="button"
              className="msg-tool-btn" 
              title="Emoji" 
              aria-label="Add emoji"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowEmoji(!showEmoji)}
            >
              <Smile className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button type="button" className="msg-tool-btn" title="Mention" aria-label="Mention someone" onMouseDown={(e) => e.preventDefault()} onClick={() => insertText("@")}>
              <AtSign className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Ask AI Premium Pill */}
            <button 
              type="button"
              className="msg-tool-ai ms-1" 
              aria-label="Ask AI assistant"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toggle-rag-sidebar'));
              }}
            >
              <div className="ai-pill-bg"></div>
              <Sparkles className="w-3.5 h-3.5 relative z-10 shrink-0" aria-hidden />
              <span className={`relative z-10 ai-pill-text whitespace-nowrap ${isCompact ? 'hidden' : 'hidden sm:inline'}`}>Ask AI</span>
            </button>
          </div>

          {/* Send Button */}
          <button
            type="button"
            className="msg-send-btn shrink-0"
            onClick={handleSend}
            aria-label="Send message"
            title="Send message"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="ml-[-2px] mt-[1px]"
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
          <span>Septimus OS AI parses entities automatically. Press <strong>Enter</strong> to send.</span>
        </p>
      )}
    </div>
  );
}
