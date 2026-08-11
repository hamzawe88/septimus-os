"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Users, Settings2, Sparkles, Headphones, MonitorUp, MonitorOff, Volume2, VolumeX, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";
import { useMeetingStore } from "@/store/useMeetingStore";
import { useRouter } from "next/navigation";

interface CurrentUserExtended {
  avatarUrl?: string;
  name?: string;
  email?: string;
}

export default function HuddleWidget({ onClose }: { onClose: () => void }) {
  const { t, isRtl } = useLocalization();
  const { currentUser } = useAppStore();
  const user = currentUser as unknown as CurrentUserExtended;
  const router = useRouter();

  const { setLocalStream, setScreenStream, setWebRTCControls, setPiPMode } = useMeetingStore();

  // Camera and mic both start OFF. Joining a call must never open a video feed
  // the user did not ask for — and the previous default (video on) also meant
  // the camera light came on the moment the widget mounted anywhere in the app.
  const [isMuted, setIsMuted] = useState(true);

  // The controls handed to the meetings page are registered once (empty-deps
  // effect), so anything they read from the render closure is frozen at mount.
  // These refs are the live truth for the track state; `isMuted` also has state
  // because this widget renders it, while the camera is only rendered by the
  // meetings page — hence a ref alone.
  const isMutedRef = useRef(true);
  const isVideoOffRef = useRef(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const isDeafenedRef = useRef(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Keep ref synchronized with state
  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    if (aiAudioRef.current) {
      aiAudioRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  useEffect(() => {
    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then((stream) => {
        streamRef.current = stream;
        // getUserMedia always hands back ENABLED tracks. Nothing used to turn
        // them off, so the UI showed "muted, camera off" while the mic was live
        // and the camera was streaming. Apply the initial state to the hardware.
        stream.getAudioTracks().forEach((track) => { track.enabled = !isMutedRef.current; });
        stream.getVideoTracks().forEach((track) => { track.enabled = !isVideoOffRef.current; });
        setLocalStream(stream);
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
      if (aiAudioRef.current) {
        aiAudioRef.current.pause();
        aiAudioRef.current = null;
      }
    };
  }, [setLocalStream]);

  const handleToggleScreenShare = async () => {
    if (isScreenSharing && screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      stream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
        setScreenStream(null);
      };
    } catch (err) {
      console.error("Screen sharing denied", err);
      setIsScreenSharing(false);
    }
  };

  // An explicit setter, not a toggle. The old code flipped the state twice for a
  // single click — once here and once in the control exposed to the meetings
  // page — while reading `isMuted` from the mount-time closure. The track ended
  // up pinned to that stale value no matter what the button said.
  const applyMuted = (muted: boolean) => {
    isMutedRef.current = muted;
    setIsMuted(muted);

    streamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });

    // Push-to-talk for the AI copilot: unmuting records, muting sends the clip.
    if (!muted) {
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
          formData.append("workspace_id", localStorage.getItem("currentWorkspaceId") || "");

          if (screenStreamRef.current && screenStreamRef.current.getVideoTracks().length > 0) {
            try {
              const video = document.createElement("video");
              video.srcObject = screenStreamRef.current;
              await video.play();
              const canvas = document.createElement("canvas");
              canvas.width = video.videoWidth || 1280;
              canvas.height = video.videoHeight || 720;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
                const imageBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
                if (imageBase64) {
                  formData.append("image_base64", imageBase64);
                }
              }
              video.pause();
              video.srcObject = null;
            } catch (captureErr) {
              console.error("Failed to capture screen frame for AI Vision", captureErr);
            }
          }

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
              aiAudio.muted = isDeafenedRef.current;
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
    } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleToggleMute = () => applyMuted(!isMutedRef.current);

  // Same shape as applyMuted, and the reason the camera never came back: the old
  // handler set `track.enabled = isVideoOff` from a stale closure, so once the
  // video track was disabled it stayed disabled — a black frame with the button
  // showing "on".
  const applyVideoOff = (off: boolean) => {
    isVideoOffRef.current = off;
    streamRef.current?.getVideoTracks().forEach(track => {
      track.enabled = !off;
    });
  };

  const handleToggleVideo = () => applyVideoOff(!isVideoOffRef.current);

  // Expose WebRTC controls to the global store so `page.tsx` can trigger them
  useEffect(() => {
    // Direct references: the handlers read the refs, so registering them once is
    // safe. They used to be wrapped in a setState-plus-setTimeout dance that
    // flipped the state a second time behind the handler's back.
    setWebRTCControls({
      toggleMute: handleToggleMute,
      toggleVideo: handleToggleVideo,
      toggleScreenShare: handleToggleScreenShare
    });
    return () => setWebRTCControls(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userName = user?.name || "User";
  const userAvatar = user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`;
  const userInitials = userName.substring(0, 2).toUpperCase();

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="fixed bottom-6 ltr:left-6 rtl:right-6 z-50 w-80 bg-card dark:bg-slate-900 rounded-2xl shadow-2xl border border-border dark:border-slate-800 p-4 animate-in slide-in-from-bottom-5 transition-all text-foreground dark:text-slate-100">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2 rtl:space-x-reverse cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { setPiPMode(false); router.push('/meetings'); }}>
          <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />
          <span className="font-bold text-sm truncate">{t("huddleWidget.activeStreaming") || "Huddle Active (Streaming)"}</span>
        </div>
        <div className="flex items-center space-x-1.5 rtl:space-x-reverse bg-muted dark:bg-slate-800 px-2 py-0.5 rounded-full text-xs font-semibold text-muted-foreground dark:text-slate-300">
          <Users className="w-3.5 h-3.5 text-primary" />
          <span>2</span>
        </div>
      </div>

      {/* Settings & Device Info Drawer */}
      {isSettingsOpen && (
        <div className="mb-4 p-3 bg-muted dark:bg-slate-800/80 rounded-xl border border-border dark:border-slate-700/80 text-xs space-y-2.5 animate-in fade-in-50">
          <div className="font-bold text-foreground dark:text-slate-200 flex items-center justify-between">
            <span>{t("huddleWidget.deviceInfo") || "Connected Audio & Media Devices:"}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-center justify-between text-muted-foreground dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Mic className="w-3.5 h-3.5 text-blue-500" /> {t("huddleWidget.micDevice") || "System Microphone"}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="flex items-center justify-between text-muted-foreground dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Volume2 className="w-3.5 h-3.5 text-purple-500" /> {t("huddleWidget.speakerDevice") || "System Speaker"}</span>
            <span className={`font-semibold ${isDeafened ? 'text-red-500' : 'text-emerald-500'}`}>
              {isDeafened ? (t("huddleWidget.deafen") || "Muted") : "Active"}
            </span>
          </div>
          {isScreenSharing && (
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold pt-1 border-t border-border dark:border-slate-700">
              <span className="flex items-center gap-1.5"><MonitorUp className="w-3.5 h-3.5" /> {t("huddleWidget.screenShare") || "Sharing Screen"}</span>
              <span className="animate-pulse">Live ●</span>
            </div>
          )}
        </div>
      )}

      {/* Avatars & Waveform Center */}
      <div className="flex items-center justify-center py-5 space-x-5 rtl:space-x-reverse relative">
        {/* User Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-full bg-primary/20 blur-md transition-all duration-75 ${!isMuted ? 'opacity-100 scale-125 animate-pulse' : 'opacity-0 scale-100'}`}
            />
            <Avatar className="h-16 w-16 border-2 border-primary relative z-10 shadow-md">
              <AvatarImage src={userAvatar} alt={userName} />
              <AvatarFallback className="font-bold bg-primary/10 text-primary">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -end-1 bg-card dark:bg-slate-900 rounded-full p-1 border-2 border-border dark:border-slate-800 z-20 shadow-sm">
              {isMuted ? <MicOff className="w-3 h-3 text-red-500" /> : <Mic className="w-3 h-3 text-emerald-500 animate-bounce" />}
            </div>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground dark:text-muted-foreground mt-1.5 truncate max-w-[70px]">{t("huddleWidget.you") || "You"}</span>
        </div>

        {/* Audio Waveform / Status Indicator Between Avatars */}
        <div className="flex flex-col items-center justify-center w-12 h-16">
          {isAiThinking ? (
            <div className="flex flex-col items-center text-primary">
              <Sparkles className="w-5 h-5 animate-spin" />
              <span className="text-[9px] font-bold mt-1 animate-pulse">{t("huddleWidget.aiThinking") || "Thinking"}</span>
            </div>
          ) : isAiSpeaking && !isDeafened ? (
            <div className="flex items-center gap-1 h-8">
              <span className="w-1 bg-primary rounded-full animate-[bounce_0.6s_infinite_100ms] h-6" />
              <span className="w-1 bg-purple-500 rounded-full animate-[bounce_0.6s_infinite_300ms] h-8" />
              <span className="w-1 bg-primary rounded-full animate-[bounce_0.6s_infinite_200ms] h-4" />
              <span className="w-1 bg-purple-500 rounded-full animate-[bounce_0.6s_infinite_400ms] h-7" />
            </div>
          ) : !isMuted ? (
            <div className="flex items-center gap-1 h-8">
              <span className="w-1 bg-emerald-500 rounded-full animate-[bounce_0.5s_infinite_100ms] h-5" />
              <span className="w-1 bg-emerald-400 rounded-full animate-[bounce_0.5s_infinite_250ms] h-7" />
              <span className="w-1 bg-emerald-500 rounded-full animate-[bounce_0.5s_infinite_150ms] h-4" />
            </div>
          ) : (
            <div className="h-0.5 w-8 bg-slate-200 dark:bg-slate-700 rounded-full" />
          )}
        </div>

        {/* AI Copilot Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-full bg-purple-500/30 blur-md transition-all duration-75 ${isAiSpeaking && !isDeafened ? 'animate-ping opacity-100 scale-150' : 'opacity-0 scale-100'}`}
            />
            <Avatar className={`h-16 w-16 border-2 ${isAiSpeaking && !isDeafened ? 'border-purple-500 ring-2 ring-purple-500/40' : 'border-border dark:border-slate-700'} relative z-10 transition-all shadow-md`}>
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-extrabold text-sm">
                {isAiThinking ? <Sparkles className="w-5 h-5 animate-spin" /> : "AI"}
              </AvatarFallback>
            </Avatar>
            {isDeafened && (
              <div className="absolute -bottom-1 -end-1 bg-card dark:bg-slate-900 rounded-full p-1 border-2 border-border dark:border-slate-800 z-20 shadow-sm" title={t("huddleWidget.deafen") || "Deafened"}>
                <VolumeX className="w-3 h-3 text-red-500" />
              </div>
            )}
          </div>
          <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 mt-1.5 truncate max-w-[70px]">{t("huddleWidget.aiCopilot") || "AI Copilot"}</span>
        </div>
      </div>

      {isDeafened && isAiSpeaking && (
        <div className="mb-3 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-center text-[11px] font-semibold text-red-600 dark:text-red-400 animate-pulse">
          ⚠️ {t("huddleWidget.audioOutputMuted") || "AI audio output is currently muted"}
        </div>
      )}

      {/* Control Buttons Bottom Bar */}
      <div className="flex items-center justify-between p-1.5 bg-muted dark:bg-slate-800/90 rounded-xl border border-border/80 dark:border-slate-700/80 shadow-inner">
        {/* Mute/Unmute Mic */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={isMuted ? (t("huddleWidget.unmute") || "Unmute") : (t("huddleWidget.mute") || "Mute")}
          title={isMuted ? (t("huddleWidget.unmute") || "Unmute") : (t("huddleWidget.mute") || "Mute")}
          className={`h-10 w-10 rounded-full transition-all ${!isMuted ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground dark:text-slate-300'}`}
          onClick={handleToggleMute}
        >
          {isMuted ? <MicOff className="w-4 h-4 text-red-500" /> : <Mic className="w-4 h-4 text-emerald-500" />}
        </Button>

        {/* Deafen/Undeafen AI Output */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDeafened ? (t("huddleWidget.undeafen") || "Unmute AI") : (t("huddleWidget.deafen") || "Mute AI")}
          title={isDeafened ? (t("huddleWidget.undeafen") || "Unmute AI") : (t("huddleWidget.deafen") || "Mute AI")}
          className={`h-10 w-10 rounded-full transition-all ${isDeafened ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground dark:text-slate-300'}`}
          onClick={() => setIsDeafened(!isDeafened)}
        >
          {isDeafened ? <Headphones className="w-4 h-4 text-red-500" /> : <Headphones className="w-4 h-4" />}
        </Button>

        {/* Audio/Video Settings */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("huddleWidget.settings") || "Settings"}
          title={t("huddleWidget.settings") || "Settings"}
          className={`h-10 w-10 rounded-full transition-all ${isSettingsOpen ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground dark:text-slate-300'}`}
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
        >
          <Settings2 className="w-4 h-4" />
        </Button>

        {/* Toggle Screen Share */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={isScreenSharing ? (t("huddleWidget.stopScreenShare") || "Stop Sharing") : (t("huddleWidget.screenShare") || "Share Screen")}
          title={isScreenSharing ? (t("huddleWidget.stopScreenShare") || "Stop Sharing") : (t("huddleWidget.screenShare") || "Share Screen")}
          className={`h-10 w-10 rounded-full transition-all ${isScreenSharing ? 'bg-primary/20 text-primary ring-2 ring-primary/40 animate-pulse' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground dark:text-slate-300'}`}
          onClick={handleToggleScreenShare}
        >
          {isScreenSharing ? <MonitorUp className="w-4 h-4 text-primary" /> : <MonitorOff className="w-4 h-4" />}
        </Button>

        {/* End Call */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("huddleWidget.endCall") || "End Call"}
          title={t("huddleWidget.endCall") || "End Call"}
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-sm"
        >
          <PhoneOff className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
