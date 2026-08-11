"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useMeetingStore } from '@/store/useMeetingStore';
import { X, FileText, Sparkles, Mic, MicOff, AudioLines, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProvenanceSurface } from '@/components/ui/provenance';
import { useLocalization } from '@/contexts/LocalizationContext';
import { apiPost, fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useToastStore } from '@/store/useToastStore';

// Minimal typed shim over the Web Speech API (Chrome/Edge). No `any`.
interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { 0: SpeechAlternativeLike; isFinal: boolean }
interface SpeechEventLike { resultIndex: number; results: { length: number; [index: number]: SpeechResultLike } }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function MeetingSidebar() {
  const { t, language } = useLocalization();
  const {
    isSidebarOpen,
    setIsSidebarOpen,
    activeSidebarTab,
    setActiveSidebarTab,
    notesText,
    setNotesText,
    meetingId,
    transcriptLogs,
    summary,
    isSummarizing,
    setIsSummarizing,
  } = useMeetingStore();
  const { toast } = useToastStore();

  const [isDictating, setIsDictating] = useState(false);
  const [isServerStt, setIsServerStt] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptLogs.length]);

  // Stop dictation/recording when the sidebar unmounts or the meeting changes
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, [meetingId]);

  if (!isSidebarOpen) return null;

  const speechSupported = typeof window !== 'undefined' && getSpeechRecognition() !== null;

  const pushTranscriptLine = async (text: string) => {
    if (!meetingId || !text.trim()) return;
    try {
      await apiPost(`/meetings/${meetingId}/transcript`, { text: text.trim() });
    } catch {
      // Line is lost only for the shared record; do not interrupt dictation.
      console.error('transcript push failed');
    }
  };

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsDictating(false);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error(t('meetings.dictationUnsupported'));
      return;
    }
    const rec = new Ctor();
    rec.lang = language === 'ar' ? 'ar-SA' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechEventLike) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          void pushTranscriptLine(r[0].transcript);
        }
      }
    };
    rec.onend = () => {
      // Chrome stops recognition periodically; restart while toggled on.
      if (recognitionRef.current === rec) {
        try { rec.start(); } catch { /* tab lost mic permission */ }
      }
    };
    rec.onerror = () => { /* transient errors: onend restarts */ };
    recognitionRef.current = rec;
    rec.start();
    setIsDictating(true);
  };

  // Server-side STT: record complete 15s audio segments (stop/start so every
  // file is standalone and decodable) and let the sidecar's local Whisper
  // transcribe them with speaker attribution.
  const uploadAudioChunk = async (blob: Blob) => {
    const id = useMeetingStore.getState().meetingId;
    if (!id || blob.size < 4000) return; // skip near-silent fragments
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'chunk.webm');
      fd.append('lang', language);
      await fetchWithAuth(`${API_BASE_URL}/meetings/${id}/stt`, { method: 'POST', body: fd });
    } catch {
      console.error('server stt upload failed');
    }
  };

  const stopServerStt = () => {
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
    segmentTimerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsServerStt(false);
  };

  const toggleServerStt = () => {
    if (isServerStt) {
      stopServerStt();
      return;
    }
    const stream = useMeetingStore.getState().localStream;
    if (!stream || stream.getAudioTracks().length === 0) {
      toast.error(t('meetings.noMicrophone'));
      return;
    }
    const audioOnly = new MediaStream(stream.getAudioTracks());
    const startSegment = () => {
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(audioOnly, { mimeType: 'audio/webm' });
      } catch {
        try {
          rec = new MediaRecorder(audioOnly);
        } catch {
          toast.error(t('meetings.recorderUnsupported'));
          stopServerStt();
          return;
        }
      }
      rec.ondataavailable = (e: BlobEvent) => { void uploadAudioChunk(e.data); };
      rec.start();
      recorderRef.current = rec;
    };
    startSegment();
    segmentTimerRef.current = setInterval(() => {
      recorderRef.current?.stop(); // flushes a complete file to ondataavailable
      startSegment();
    }, 15000);
    setIsServerStt(true);
  };

  const handleExtractTasks = async () => {
    if (!meetingId) return;
    try {
      await apiPost(`/meetings/${meetingId}/extract-tasks`, { lang: language });
      toast.info(t('meetings.extractingTasks'), 6000);
    } catch {
      toast.error(t('meetings.extractFailed'));
    }
  };

  const handleSummarize = async () => {
    if (!meetingId) return;
    setIsSummarizing(true);
    try {
      // Async by design: the sidecar reads the real transcript and the result
      // arrives on the workspace channel as a `meeting.summary` event.
      await apiPost(`/meetings/${meetingId}/summarize`, { lang: language });
    } catch {
      setIsSummarizing(false);
      toast.error(t('meetings.summaryFailed'));
    }
  };

  return (
    <div className="relative z-20 flex h-full w-80 shrink-0 flex-col border-s border-border bg-card shadow-[var(--shadow-overlay)] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex gap-2">
          <Button
            variant={activeSidebarTab === 'notes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSidebarTab('notes')}
            className={activeSidebarTab === 'notes' ? 'bg-brand text-white' : ''}
          >
            <FileText className="w-4 h-4 me-2" />
            {t('meetings.notes')}
          </Button>
          <Button
            variant={activeSidebarTab === 'ai' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSidebarTab('ai')}
            className={activeSidebarTab === 'ai' ? 'bg-brand text-brand-foreground hover:bg-brand-hover' : ''}
          >
            <Sparkles className="w-4 h-4 me-2" />
            {t('meetings.aiAssistant')}
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="rounded-full">
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeSidebarTab === 'notes' ? (
          <div className="flex-1 p-4 flex flex-col">
            <textarea
              className="w-full flex-1 resize-none rounded-[var(--radius-control)] border border-input bg-muted p-3 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-brand/50"
              placeholder={t('meetings.notesPlaceholder')}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
            <div className="mt-3 text-center text-xs font-medium text-muted-foreground">
              {t('meetings.privateNotesHint')}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden bg-muted/50">
            {/* Live shared transcript (the real input the AI summarizes) */}
            <div className="flex items-center justify-between px-4 pt-4 gap-1 flex-wrap">
              <span className="text-xs font-bold text-muted-foreground">
                {t('meetings.transcript')} ({transcriptLogs.length})
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={isDictating ? 'destructive' : 'outline'}
                  className="gap-1 h-7 text-xs"
                  onClick={toggleDictation}
                  disabled={!speechSupported}
                  title={speechSupported ? undefined : t('meetings.dictationUnsupported')}
                >
                  {isDictating ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  {isDictating ? t('meetings.stopDictation') : t('meetings.startDictation')}
                </Button>
                <Button
                  size="sm"
                  variant={isServerStt ? 'destructive' : 'outline'}
                  className="gap-1 h-7 text-xs"
                  onClick={toggleServerStt}
                  title={t('meetings.serverSttHint')}
                >
                  <AudioLines className="w-3 h-3" />
                  {isServerStt ? t('meetings.stopServerStt') : t('meetings.startServerStt')}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {transcriptLogs.length === 0 ? (
                <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
                  {t('meetings.transcriptEmpty')}
                </p>
              ) : (
                transcriptLogs.map(line => (
                  <div key={line.id} className="rounded-[var(--radius-control)] border border-border bg-card p-2 text-xs">
                    <span className="font-bold text-foreground">{line.sender}: </span>
                    <span className="text-muted-foreground">{line.text}</span>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Summary */}
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <Button
                  size="lg"
                  className="flex-1 bg-brand font-semibold text-brand-foreground hover:bg-brand-hover"
                  onClick={handleSummarize}
                  disabled={isSummarizing || !meetingId}
                >
                  <Sparkles className="w-4 h-4 me-2" />
                  {isSummarizing ? t('meetings.summarizing') : t('meetings.summarizeNow')}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-1 font-semibold"
                  onClick={handleExtractTasks}
                  disabled={!meetingId || transcriptLogs.length === 0}
                  title={t('meetings.extractTasksHint')}
                >
                  <ListTodo className="w-4 h-4" />
                  {t('meetings.extractTasks')}
                </Button>
              </div>

              {summary && (
                <ProvenanceSurface
                  level={summary.noTranscript ? 'assumption' : 'confident-recall'}
                  className="mt-4 max-h-56 overflow-y-auto"
                >
                  <p className="font-semibold">
                    {summary.noTranscript ? t('meetings.aiNoData') : t('meetings.aiResult')}
                  </p>
                  <p>{summary.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('meetings.summaryProvenance')}
                  </p>
                </ProvenanceSurface>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
