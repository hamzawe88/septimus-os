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
      return <span key={i} className="text-brand bg-brand-light px-1 py-0.5 rounded cursor-pointer hover:bg-brand-light font-medium inline-block">{part}</span>;
    }
    if (part.startsWith('@')) {
      return <span key={i} className="text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded cursor-pointer hover:bg-emerald-100 font-medium inline-block">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
};

export default function ChatWindow({ chatId, chatName, onClose }: ChatWindowProps) {
  const safeName = chatName || "Chat";
  const { t } = useLocalization();
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    let timeoutId: NodeJS.Timeout;

    if (playingAudioId) {
      const msg = messages.find(m => m.id === playingAudioId);
      const audioUrl = msg?.fileUrl || msg?.attachmentUrl || 'https://actions.google.com/sounds/v1/water/water_drop.ogg';
      
      if (audioUrl) {
        audio = new Audio(audioUrl);
        
        // Reset UI when audio finishes naturally
        audio.onended = () => setPlayingAudioId(null);
        
        audio.play().catch(e => {
          console.error("Audio play failed:", e);
          setPlayingAudioId(null);
        });
      }
      
      // Fallback timeout only if it's the very short beep
      if (!msg?.attachmentUrl && !msg?.fileUrl) {
        timeoutId = setTimeout(() => {
          setPlayingAudioId(null);
        }, 3000);
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.onended = null;
      }
      clearTimeout(timeoutId);
    };
  }, [playingAudioId, messages]);

  const handleSendMessage = (content: string, type: "text" | "voice" | "file" = "text", attachmentUrl?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text: content,
      type,
      attachmentUrl: attachmentUrl || (type === "voice" || type === "file" ? content : undefined),
      fileUrl: attachmentUrl || (type === "voice" || type === "file" ? content : undefined),
      fileName: type === "file" ? (content || "Attachment") : undefined,
      fileSize: type === "file" ? "120 KB" : undefined,
      voiceDuration: type === "voice" ? "0:14" : undefined,
      sender: "me",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, newMessage]);
    
    // Simulate auto-reply
    if (type === "text") {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + "1",
          text: t("chat.autoReply"),
          sender: "other",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: "text"
        }]);
      }, 1500);
    }
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.type === "voice" && (msg.fileUrl || msg.attachmentUrl)) {
      const isPlaying = playingAudioId === msg.id;
      return (
        <div className="flex items-center gap-2.5 py-1 min-w-[140px]">
          <button 
            type="button"
            onClick={() => toggleVoicePlay(msg.id)}
            className="w-8 h-8 rounded-full bg-white/20 dark:bg-black/20 flex items-center justify-center text-current hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
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
            <img src={msg.fileUrl} alt={msg.fileName} className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-white/10" />
            {msg.text && <p className="text-sm mt-1">{msg.text}</p>}
          </div>
        );
      }
      return (
        <a 
          href={msg.fileUrl} 
          download={msg.fileName}
          className="flex items-center gap-2 p-2 rounded-lg bg-white/10 dark:bg-black/10 hover:bg-white/20 transition-colors"
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
    <div className="w-[340px] h-[480px] bg-white dark:bg-[#1a1a1a] rounded-t-2xl shadow-[0_-5px_25px_-5px_rgba(0,0,0,0.1)] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-5 transition-colors">
      {/* Header */}
      <div 
        className="h-[60px] px-4 flex items-center justify-between flex-shrink-0 cursor-pointer text-white shadow-sm relative z-20 bg-[var(--primary-hex)]"
        onClick={onClose}
      >
        <div className="flex items-center gap-3 overflow-hidden relative z-10">
          <Avatar className="w-8.5 h-8.5 rounded-lg border border-white/20 shadow-sm overflow-hidden">
            <img src={getAvatarForUser(safeName, userAvatar)} alt={safeName} className="w-full h-full object-cover" />
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold text-sm truncate">{safeName}</span>
              <span className="text-[10px] text-indigo-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> {t("chat.activeNow")}
            </span>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close Chat" title="Close Chat" className="p-2 hover:bg-white/20 rounded-full transition-colors text-white/90 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-[#f8fafc] dark:bg-[#121212]">
        {messages.map((msg) => {
          const m = msg as unknown as Record<string, unknown>;
          const userObj = m.User as Record<string, unknown> | undefined;
          const isMe = msg.sender === "me" || m.isMe === true || m.author === "Admin" || m.author === "admin@septimus.local" || m.author === (localStorage.getItem("septimus_display_name") || "Admin") || (userObj && (userObj.Email === "admin@septimus.local" || userObj.Email === (localStorage.getItem("septimus_display_name") || "")));
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <Avatar className="w-7 h-7 rounded-lg border border-slate-200/80 shadow-sm shrink-0 mb-5 overflow-hidden">
                  <img src={getAvatarForUser(safeName)} alt={safeName} className="w-full h-full object-cover" />
                </Avatar>
              )}
              <div className={`flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`px-4 py-2.5 max-w-[260px] text-[15px] ${
                    isMe 
                      ? 'bg-[var(--primary-hex)] text-white rounded-3xl rounded-ee-md shadow-sm' 
                      : 'bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-3xl rounded-es-md shadow-sm'
                  }`}
                >
                  {renderMessageContent(msg)}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
              </div>
              {isMe && (
                <Avatar className="w-7 h-7 rounded-lg border border-slate-200/80 shadow-sm shrink-0 mb-5 overflow-hidden">
                  <img src={userAvatar || getAvatarForUser("Admin User")} alt="Me" className="w-full h-full rounded-lg object-cover" />
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
          handleSendMessage(text || "Attachment", (type || "text") as "text" | "voice" | "file", url); 
          return true; 
        }} 
      />
    </div>
  );
}
