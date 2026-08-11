/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import { X, FileText, Play, Pause } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { getAvatarForUser } from "@/lib/avatarEngine";
import MessageInput from "@/components/shared/MessageInput";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ChatWindowProps {
  chatId: string;
  chatName?: string;
  onClose: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  time: string;
  type?: "text" | "voice" | "file";
  attachmentUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  voiceDuration?: string;
}

const formatTextWithTags = (text: string) => {
  if (!text) return text;
  const regex = /(#[\w\u0600-\u06FF]+|@[\w\u0600-\u06FF.-]+)/g;
  const parts = text.split(regex);
  
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      return <span key={i} className="inline-block cursor-pointer rounded bg-brand-light px-1 py-0.5 font-medium text-brand hover:bg-brand-light/80">{part}</span>;
    }
    if (part.startsWith('@')) {
      return <span key={i} className="inline-block cursor-pointer rounded bg-success/10 px-1 py-0.5 font-medium text-success hover:bg-success/15">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
};

export default function ChatWindow({ chatId, chatName, onClose }: ChatWindowProps) {
  const { t } = useLocalization();
  const safeName = chatName || t("sidebar.directMessageDefault");
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", text: t("chat.welcomeMsg"), sender: "other", time: "10:00 AM", type: "text" }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const toggleVoicePlay = (id: string) => {
    if (playingAudioId === id) {
      setPlayingAudioId(null);
    } else {
      setPlayingAudioId(id);
    }
  };

  useEffect(() => {
    const loadAvatar = () => {
      const saved = localStorage.getItem("septimus_avatar");
      setUserAvatar(saved || null);
    };
    loadAvatar();
    window.addEventListener("septimus_avatar_updated", loadAvatar);
    return () => window.removeEventListener("septimus_avatar_updated", loadAvatar);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    if (playingAudioId) {
      const msg = messages.find(m => m.id === playingAudioId);
      const audioUrl = msg?.fileUrl || msg?.attachmentUrl;
      
      if (audioUrl) {
        audio = new Audio(audioUrl);
        
        // Reset UI when audio finishes naturally
        audio.onended = () => setPlayingAudioId(null);
        
        audio.play().catch(e => {
          console.error("Audio play failed:", e);
          setPlayingAudioId(null);
        });
      }
      
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.onended = null;
      }
    };
  }, [playingAudioId, messages]);

  const handleSendMessage = (content: string, type: "text" | "voice" | "file" = "text", attachmentUrl?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text: content,
      type,
      attachmentUrl: attachmentUrl || (type === "voice" || type === "file" ? content : undefined),
      fileUrl: attachmentUrl || (type === "voice" || type === "file" ? content : undefined),
      fileName: type === "file" ? (content || t("chat.attachment")) : undefined,
      fileSize: undefined,
      voiceDuration: undefined,
      sender: "me",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, newMessage]);
    
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.type === "voice" && (msg.fileUrl || msg.attachmentUrl)) {
      const isPlaying = playingAudioId === msg.id;
      return (
        <div className="flex items-center gap-2.5 py-1 min-w-[140px]">
          <button
            type="button"
            onClick={() => toggleVoicePlay(msg.id)}
            className="flex size-8 items-center justify-center rounded-full bg-current/10 text-current transition-transform hover:scale-105"
            aria-label={isPlaying ? t("chat.pauseVoice") : t("chat.playVoice")}
          >
            {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="ms-0.5 size-4 fill-current" />}
          </button>
          <div className="flex-1 flex flex-col gap-1">
            <div className="h-1.5 w-full bg-current/20 rounded-full overflow-hidden">
              <div className={`h-full bg-current rounded-full transition-all duration-300 ${isPlaying ? 'w-full animate-pulse' : 'w-1/3'}`} />
            </div>
            <span className="text-[10px] opacity-80">{msg.voiceDuration || "0:05"}</span>
          </div>
        </div>
      );
    }

    if (msg.type === "file" && msg.fileUrl) {
      const isImage = msg.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
      if (isImage) {
        return (
          <div className="space-y-1">
            <img src={msg.fileUrl} alt={msg.fileName} className="max-h-[150px] max-w-[200px] rounded-lg border border-border/50 object-cover" />
            {msg.text && <p className="text-sm mt-1">{msg.text}</p>}
          </div>
        );
      }
      return (
        <a 
          href={msg.fileUrl} 
          download={msg.fileName}
          className="flex items-center gap-2 rounded-lg bg-current/10 p-2 transition-colors hover:bg-current/15"
        >
          <FileText className="w-5 h-5 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">{msg.fileName}</span>
            <span className="text-[10px] opacity-75">{msg.fileSize}</span>
          </div>
        </a>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{formatTextWithTags(msg.text)}</p>;
  };

  return (
    <section
      aria-label={`${t("sidebar.directMessageDefault")}: ${safeName}`}
      className="flex h-[480px] w-[340px] animate-in flex-col overflow-hidden rounded-t-[var(--radius-surface)] border border-border bg-card text-card-foreground shadow-[var(--shadow-overlay)] transition-colors slide-in-from-bottom-5"
    >
      <div className="relative z-20 flex h-[60px] shrink-0 items-center justify-between bg-brand px-4 text-brand-foreground shadow-sm">
        <div className="relative z-10 flex items-center gap-3 overflow-hidden">
          <Avatar className="size-9 overflow-hidden rounded-lg border border-brand-foreground/20 shadow-sm">
            <img src={getAvatarForUser(safeName, userAvatar)} alt={safeName} className="size-full object-cover" />
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold text-sm truncate">{safeName}</span>
              <span className="flex items-center gap-1 text-[10px] text-brand-foreground/80">
                <span className="size-1.5 rounded-full bg-success" aria-hidden /> {t("chat.activeNow")}
            </span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t("chat.closeChat")} title={t("chat.closeChat")} className="rounded-full p-2 text-brand-foreground/90 transition-colors hover:bg-brand-foreground/15 hover:text-brand-foreground">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-surface-subtle p-3">
        {messages.map((msg) => {
          const m = msg as unknown as Record<string, unknown>;
          const userObj = m.User as Record<string, unknown> | undefined;
          const isMe = msg.sender === "me" || m.isMe === true || m.author === "Admin" || m.author === "admin@septimus.local" || m.author === (localStorage.getItem("septimus_display_name") || "Admin") || (userObj && (userObj.Email === "admin@septimus.local" || userObj.Email === (localStorage.getItem("septimus_display_name") || "")));
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <Avatar className="mb-5 size-7 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                  <img src={getAvatarForUser(safeName)} alt={safeName} className="size-full object-cover" />
                </Avatar>
              )}
              <div className={`flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`px-4 py-2.5 max-w-[260px] text-[15px] ${
                    isMe 
                      ? 'rounded-3xl rounded-ee-md bg-brand text-brand-foreground shadow-sm'
                      : 'rounded-3xl rounded-es-md border border-border bg-card text-card-foreground shadow-sm'
                  }`}
                >
                  {renderMessageContent(msg)}
                </div>
                <time className="mt-1 px-1 text-[10px] text-muted-foreground">{msg.time}</time>
              </div>
              {isMe && (
                <Avatar className="mb-5 size-7 shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                  <img src={userAvatar || getAvatarForUser(t("chat.user"))} alt={t("chat.myAvatar")} className="size-full rounded-lg object-cover" />
                </Avatar>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <MessageInput 
        channelName={safeName} 
        channelId={chatId}
        variant="compact"
        isDm={true}
        onSend={(text, url, type) => { 
          handleSendMessage(text || t("chat.attachment"), (type || "text") as "text" | "voice" | "file", url);
          return true; 
        }} 
      />
    </section>
  );
}
