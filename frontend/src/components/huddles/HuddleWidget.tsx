"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Users, Settings2, Sparkles, Headphones, MonitorUp, MonitorOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';

export default function HuddleWidget({ onClose }: { onClose: () => void }) {
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);

  useEffect(() => {
    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream;
      })
      .catch((err) => {
        console.error("Mic access denied", err);
      });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      
      stream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
      };
    } catch (err) {
      console.error("Screen sharing denied", err);
      setIsScreenSharing(false);
    }
  };

  const handleToggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
    }

    if (isMuted) {
      if (streamRef.current) {
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        mediaRecorder.onstop = async () => {
          setIsAiThinking(true);
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          
          const formData = new FormData();
          formData.append("audio", audioBlob, "huddle_audio.webm");
          formData.append("workspace_id", localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e");

          try {
            const res = await fetchWithAuth(`${API_BASE_URL}/huddle/speak`, {
              method: "POST",
              
              body: formData,
            });
            const data = await res.json();
            
            if (data.audio_base64) {
              const audioUrl = `data:audio/mp3;base64,${data.audio_base64}`;
              const aiAudio = new Audio(audioUrl);
              aiAudioRef.current = aiAudio;
              aiAudio.onplay = () => setIsAiSpeaking(true);
              aiAudio.onended = () => setIsAiSpeaking(false);
              aiAudio.play();
            }
          } catch (err) {
            console.error("Failed to send huddle audio", err);
          } finally {
            setIsAiThinking(false);
          }
        };
        mediaRecorder.start(250);
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }

    setIsMuted(!isMuted);
  };

  return (
    <div className="fixed bottom-6 start-6 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-[var(--sb-bg)] font-semibold text-sm">Huddle Active (Streaming)</span>
        </div>
        <div className="flex items-center space-x-1 text-[var(--sb-bg)]/70 text-xs">
          <Users className="w-3 h-3" />
          <span>2</span>
        </div>
      </div>

      <div className="flex items-center justify-center py-6 space-x-6">
        <div className="relative">
          <div 
            className={`absolute inset-0 rounded-full bg-primary/20 blur-md transition-all duration-75 ${isMuted ? 'opacity-0 scale-100' : 'opacity-100 scale-125'}`}
          />
          <Avatar className="h-16 w-16 border-2 border-primary relative z-10">
            <AvatarImage src="https://i.pravatar.cc/100?u=admin" />
            <AvatarFallback>ME</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-2 -end-2 bg-[#f8fafc] rounded-full p-1 border-2 border-white z-20">
            {isMuted ? <MicOff className="w-3 h-3 text-red-500" /> : <Mic className="w-3 h-3 text-green-500" />}
          </div>
        </div>

        <div className="relative opacity-100">
          <div 
            className={`absolute inset-0 rounded-full bg-brand/20 blur-md transition-all duration-75 ${isAiSpeaking ? 'animate-ping opacity-100 scale-150' : 'opacity-0 scale-100'}`}
          />
          <Avatar className={`h-14 w-14 border ${isAiSpeaking ? 'border-brand' : 'border-gray-300'} relative z-10 transition-all`}>
            <AvatarFallback className="bg-brand-light text-brand font-bold">
              {isAiThinking ? <Sparkles className="w-5 h-5 animate-spin" /> : "AI"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="flex items-center justify-center space-x-2 p-2 bg-white rounded-xl border border-slate-100 ">
        <Button variant="ghost" size="icon" aria-label="Toggle Mute" className="rounded-full hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 hover:text-[var(--sb-bg)] :text-slate-100" onClick={handleToggleMute}>
          {isMuted ? <MicOff className="w-5 h-5 text-red-500" /> : <Mic className="w-5 h-5" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Deafen" className="rounded-full hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 hover:text-[var(--sb-bg)] :text-slate-100" onClick={() => setIsDeafened(!isDeafened)}>
          {isDeafened ? <Headphones className="w-5 h-5 text-red-500" /> : <Headphones className="w-5 h-5" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Settings" className="rounded-full hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 hover:text-[var(--sb-bg)] :text-slate-100">
          <Settings2 className="w-5 h-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          aria-label="Toggle Screen Share" 
          className={`rounded-full hover:bg-slate-200 :bg-slate-100 ${isScreenSharing ? 'bg-primary/20 text-primary' : 'text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 hover:text-[var(--sb-bg)] :text-slate-100'}`}
          onClick={handleToggleScreenShare}
        >
          {isScreenSharing ? <MonitorUp className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          aria-label="End Call"
          onClick={onClose}
          className="rounded-full bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white"
        >
          <PhoneOff className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
