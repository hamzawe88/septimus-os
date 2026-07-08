/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import { X, FileText, Play, Pause } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    let timeoutId: NodeJS.Timeout;

    if (playingAudioId) {
      const msg = messages.find(m => m.id === playingAudioId);
      const audioUrl = msg?.attachmentUrl || 'https://actions.google.com/sounds/v1/water/water_drop.ogg';
      
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
      if (!msg?.attachmentUrl) {
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
      attachmentUrl,
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
    if (msg.type === "voice") {
      return (
        <div className="flex items-center gap-2 bg-brand-light text-brand-dark p-2 rounded-lg border border-brand-light min-w-[150px]">
          <button 
            onClick={() => setPlayingAudioId(playingAudioId === msg.id ? null : msg.id)}
            className="w-8 h-8 flex items-center justify-center bg-brand text-white rounded-full hover:bg-brand"
          >
            {playingAudioId === msg.id ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ms-1" />}
          </button>
          <div className="flex-1">
            <div className="h-1.5 bg-indigo-200 rounded-full w-full overflow-hidden">
              <div className={`h-full bg-brand rounded-full ${playingAudioId === msg.id ? 'w-full transition-all duration-[3000ms] ease-linear' : 'w-0'}`} />
            </div>
          </div>
          <span className="text-xs font-mono">{msg.text.match(/\((.*?)\)/)?.[1] || "0:05"}</span>
        </div>
      );
    }
    
    if (msg.type === "file") {
      const isImage = msg.text.match(/\.(jpeg|jpg|gif|png)$/i);
      if (isImage) {
        return (
          <div className="flex flex-col gap-1">
            <img src={msg.attachmentUrl} alt="attachment" className="rounded-lg max-w-[200px] border border-slate-200" />
            <span className="text-sm">{msg.text}</span>
          </div>
        );
      }
      return (
        <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
          <div className="w-8 h-8 flex items-center justify-center bg-brand-light text-brand rounded">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium underline underline-offset-2">{msg.text}</span>
        </a>
      );
    }

    return <p className="text-sm whitespace-pre-wrap leading-relaxed">{formatTextWithTags(msg.text)}</p>;
  };

  return (
    <div className="w-[340px] h-[480px] bg-white dark:bg-[#1a1a1a] rounded-t-2xl shadow-[0_-5px_25px_-5px_rgba(0,0,0,0.1)] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-5 transition-colors">
      {/* Header */}
      <div 
        className="h-[60px] px-4 flex items-center justify-between flex-shrink-0 cursor-pointer text-white shadow-sm relative z-20 bg-[var(--primary-hex)]"
        onClick={onClose}
      >
        <div className="flex items-center gap-3 overflow-hidden relative z-10">
          <Avatar className="w-8 h-8 border border-white/20 shadow-sm">
            <AvatarFallback className="bg-brand text-white text-xs">{safeName.charAt(0).toUpperCase()}</AvatarFallback>
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
          const isMe = msg.sender === "me";
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
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
