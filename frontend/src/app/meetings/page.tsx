"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useMeetingStore, ServerParticipant, ServerTranscriptLine } from '@/store/useMeetingStore';
import { useAppStore } from '@/store/useAppStore';
import { Mic, MicOff, PhoneOff, Video, Users, ShieldCheck, Hand, MoreVertical, Sparkles, MonitorUp, MonitorOff, Lock, Unlock, UserPlus, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useLocalization } from '@/contexts/LocalizationContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { PublicationContext } from "centrifuge";
import { useToastStore } from '@/store/useToastStore';
import { apiGet, apiPost } from '@/lib/apiClient';
import { InviteModal } from './InviteModal';
import { MeetingSidebar } from './MeetingSidebar';
import { useMeetingRTC } from './useMeetingRTC';

interface MeetingEntityData {
  title: string;
  status: string;
  host_id: string;
  locked: boolean;
  participants: ServerParticipant[];
  transcript?: ServerTranscriptLine[];
}

interface MeetingEntity {
  id: string;
  data: MeetingEntityData;
}

interface MeetingEvent {
  type?: string;
  meeting_id?: string;
  line?: ServerTranscriptLine;
  text?: string;
  lang?: string;
  no_transcript?: boolean;
  title?: string;
  count?: number;
  error?: string;
}

export default function MeetingsPage() {
  const { t, language } = useLocalization();
  const { currentUser } = useAppStore();

  const {
    isActive,
    meetingId,
    currentUserRole,
    isLocked,
    participants,
    endMeeting,
    leaveOrEndMeeting,
    updateParticipant,
    localStream,
    screenStream,
    webRTCControls,
    setPiPMode,
    isSidebarOpen,
    setIsSidebarOpen,
    setActiveSidebarTab,
    syncFromServer,
    appendTranscriptFromServer,
    setSummary,
  } = useMeetingStore();
  const centrifuge = useAppStore((s) => s.centrifuge);
  const { toast } = useToastStore();

  const activeUserId = String(currentUser?.id || currentUser?.ID || '');

  // Must match HuddleWidget's initial state: the camera starts off and the user
  // opts in. These two flip together on every click, so they stay in step.
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [lobbyChecked, setLobbyChecked] = useState(false);

  // Real peer-to-peer audio/video (mesh over Centrifugo signaling).
  const { remoteStreams } = useMeetingRTC({
    enabled: isActive && participants.some(p => p.id === activeUserId),
    meetingId,
    selfId: activeUserId,
    peerIds: participants.map(p => p.id),
  });

  // ── Server sync ────────────────────────────────────────────────────────────

  const refreshMeeting = useCallback(async (autoJoin: boolean) => {
    if (!activeUserId) return;
    try {
      const res = await apiGet<{ meeting: MeetingEntity | null }>('/meetings/active');
      const meeting = res.meeting;
      if (!meeting || meeting.data.status !== 'live') {
        if (useMeetingStore.getState().isActive) endMeeting();
        setLobbyChecked(true);
        return;
      }
      const isParticipant = meeting.data.participants.some(p => p.id === activeUserId);
      if (!isParticipant && autoJoin) {
        await apiPost(`/meetings/${meeting.id}/join`, {});
        // join broadcast will trigger a refresh for everyone incl. us
      }
      syncFromServer({
        id: meeting.id,
        title: meeting.data.title,
        hostId: meeting.data.host_id,
        locked: meeting.data.locked,
        participants: meeting.data.participants,
        transcript: meeting.data.transcript,
        currentUserId: activeUserId,
      });
      setLobbyChecked(true);
    } catch {
      setLobbyChecked(true);
    }
  }, [activeUserId, endMeeting, syncFromServer]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPiPMode(false);
      void refreshMeeting(false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      // Leaving this page must NOT spawn the floating widget. It used to turn PiP
      // on for you, so every navigation away planted a window you never asked
      // for — with the camera and mic still captured behind it.
      //
      // Now: navigating away tears down the local call (tracks stopped, widget
      // gone) while the meeting stays live on the server, so returning here
      // re-syncs you straight back in. The "minimise" button is the only way to
      // get the widget, and it sets isPiP first — which is what this checks.
      const state = useMeetingStore.getState();
      if (state.isActive && !state.isPiP) {
        state.endMeeting();
      }
    };
  }, [refreshMeeting, setPiPMode]);

  // Workspace channel: roster/state/transcript/summary events
  useEffect(() => {
    if (!centrifuge || !currentUser) return;
    const workspaceId = localStorage.getItem('currentWorkspaceId') || '';
    if (!workspaceId) return;

    const channel = `workspace_${workspaceId}`;
    const existing = centrifuge.getSubscription(channel);
    const sub = existing ?? centrifuge.newSubscription(channel);

    const onPublication = (ctx: PublicationContext) => {
      const data = ctx.data as MeetingEvent;
      if (!data?.type?.startsWith('meeting.')) return;
      const state = useMeetingStore.getState();

      switch (data.type) {
        case 'meeting.transcript':
          if (data.meeting_id === state.meetingId && data.line) {
            appendTranscriptFromServer(data.line);
          }
          break;
        case 'meeting.summary':
          if (data.meeting_id === state.meetingId && data.text) {
            setSummary({ text: data.text, lang: data.lang || 'ar', noTranscript: Boolean(data.no_transcript) });
          }
          break;
        case 'meeting.ended':
          if (data.meeting_id === state.meetingId) {
            endMeeting();
            toast.info(t('meetings.endedByHost'));
          }
          break;
        case 'meeting.tasks_extracted':
          if (data.meeting_id === state.meetingId) {
            if (data.error) {
              toast.error(t('meetings.extractFailed'));
            } else if ((data.count ?? 0) > 0) {
              toast.success(`${t('meetings.tasksExtracted')}: ${data.count}`);
            } else {
              toast.info(t('meetings.tasksExtractedNone'));
            }
          }
          break;
        default:
          // started / roster / state → re-pull authoritative state
          void refreshMeeting(false);
      }
    };

    sub.on('publication', onPublication);
    if (sub.state === 'unsubscribed') sub.subscribe();
    return () => {
      sub.removeListener('publication', onPublication);
    };
  }, [centrifuge, currentUser, appendTranscriptFromServer, setSummary, endMeeting, refreshMeeting, toast, t]);

  // Private channel: latecomer summaries + invitations
  useEffect(() => {
    if (!centrifuge || !currentUser) return;

    const channel = `user_${currentUser.id}`;
    const existing = centrifuge.getSubscription(channel);
    const sub = existing ?? centrifuge.newSubscription(channel);

    const onPublication = (ctx: PublicationContext) => {
      const payload = ctx.data as MeetingEvent & { from?: string };
      if (payload?.type === 'meeting.summary' && payload.text) {
        toast.info((payload.title || t('meetings.summaryTitle')) + ': ' + payload.text, 10000);
      }
      if (payload?.type === 'meeting.invite') {
        toast.info(t('meetings.invitedYou') + ': ' + (payload.title || ''), 10000);
        void refreshMeeting(false);
      }
    };

    sub.on('publication', onPublication);
    if (sub.state === 'unsubscribed') sub.subscribe();
    return () => {
      sub.removeListener('publication', onPublication);
    };
  }, [centrifuge, currentUser, toast, t, refreshMeeting]);

  // ── Actions (all enforced server-side) ─────────────────────────────────────

  const handleStartMeeting = async () => {
    setIsJoining(true);
    try {
      await apiPost<MeetingEntity>('/meetings/start', { title: t('meetings.defaultTitle') });
      await refreshMeeting(true);
    } catch {
      toast.error(t('meetings.startFailed'));
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinMeeting = async () => {
    setIsJoining(true);
    try {
      await refreshMeeting(true);
    } finally {
      setIsJoining(false);
    }
  };

  const stateAction = async (body: Record<string, unknown>) => {
    if (!meetingId) return;
    try {
      await apiPost(`/meetings/${meetingId}/state`, body);
    } catch {
      toast.error(t('meetings.actionFailed'));
    }
  };

  const handleSendInvite = async (userId: string) => {
    if (!meetingId) return;
    try {
      await apiPost(`/meetings/${meetingId}/invite`, { user_id: userId });
      toast.success(t('meetings.inviteSent'));
    } catch {
      toast.error(t('meetings.inviteFailed'));
    }
  };

  const requestSummary = async (latecomerId: string) => {
    if (!meetingId) return;
    try {
      toast.info(t('meetings.summarizingForGuest'), 5000);
      await apiPost(`/meetings/${meetingId}/summarize`, {
        lang: language,
        target_user_id: latecomerId,
      });
    } catch {
      toast.error(t('meetings.summaryFailed'));
    }
  };

  const handleMuteAll = async () => {
    await stateAction({ action: 'mute_all' });
    toast.success(t('meetings.mutedAll'));
  };

  const handleLockRoom = async () => {
    await stateAction({ action: isLocked ? 'unlock' : 'lock' });
    toast.success(isLocked ? t('meetings.roomUnlocked') : t('meetings.roomLocked'));
  };

  // Shared with the floating widget via the store — the two used to diverge, and
  // the widget's copy skipped the server entirely.
  const handleLeaveOrEnd = leaveOrEndMeeting;

  const myParticipant = participants.find(p => p.id === activeUserId);
  const isScreenSharing = myParticipant?.isScreenSharing || false;
  const isMuted = myParticipant?.isMuted || false;
  const isHost = currentUserRole === 'HOST';

  // ── Lobby ──────────────────────────────────────────────────────────────────

  if (!isActive) {
    // The lobby carries its own background: it is a full-height screen, so
    // without one it renders white over the dark theme instead of inheriting
    // it. Same pair the live meeting container below uses.
    return (
      <div data-testid="meetings-page" className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10 text-brand">
          <Users className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-foreground">
          {t('meetings.lobbyTitle')}
        </h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {lobbyChecked
            ? t('meetings.lobbyEmpty')
            : t('meetings.lobbyChecking')}
        </p>
        {lobbyChecked && (
          <div className="flex gap-3">
            <Button onClick={handleStartMeeting} disabled={isJoining} className="gap-2">
              <Video className="w-4 h-4" />
              {t('meetings.startMeeting')}
            </Button>
            <Button variant="outline" onClick={handleJoinMeeting} disabled={isJoining}>
              {t('meetings.refresh')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Live meeting ───────────────────────────────────────────────────────────

  return (
    <div data-testid="meetings-page" className="m-4 flex h-full min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-[var(--radius-surface)] border border-border bg-background shadow-[var(--shadow-raised)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/80 p-4 backdrop-blur-md">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand/10 text-brand">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{useMeetingStore.getState().meetingTitle || t('meetings.title')}</h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success"></span>
              {t('meetings.live')} • {participants.length} {t('meetings.participants')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isHost && (
            <div className="flex items-center bg-brand/5 border border-brand/20 rounded-lg p-1 px-3 text-sm font-semibold text-brand">
              <ShieldCheck className="w-4 h-4 me-2" />
              {t('meetings.hostControls')}
            </div>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setIsInviteModalOpen(true)}>
            <UserPlus className="w-4 h-4" />
            {t('meetings.invite')}
          </Button>
          <Button variant="outline" onClick={() => setPiPMode(true)}>{t('meetings.minimize')}</Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Grid */}
        <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto">
          {participants.map(p => (
          <div key={p.id} className="group relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-[var(--radius-surface)] border border-border bg-card shadow-sm">
            {p.handRaised && (
              <div className="absolute end-3 top-3 animate-bounce rounded-full bg-warning p-1.5 text-background shadow-lg">
                <Hand className="w-4 h-4" />
              </div>
            )}

            {p.isScreenSharing && (
              <div className="absolute start-3 top-3 flex animate-pulse items-center gap-1 rounded-[var(--radius-control)] bg-info/90 px-2 py-1 text-xs font-semibold text-background shadow-lg backdrop-blur-sm">
                <MonitorUp className="w-3 h-3" />
                <span>{t('meetings.screenSharing')}</span>
              </div>
            )}

            {p.id === activeUserId ? (
              p.isScreenSharing && screenStream ? (
                <video
                  ref={(el) => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream; }}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full bg-muted object-cover"
                />
              ) : localStream && !isVideoOff ? (
                <video
                  ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full bg-muted object-cover"
                />
              ) : (
                <Avatar className="relative z-10 h-24 w-24 border-4 border-border shadow-lg">
                  <AvatarImage src={p.avatarUrl} />
                  <AvatarFallback className="text-2xl font-bold">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              )
            ) : remoteStreams[p.id] ? (
              // Live peer media: screen share arrives as the same video track
              // (replaceTrack), so one element covers camera and screen.
              <video
                ref={(el) => { if (el && el.srcObject !== remoteStreams[p.id]) el.srcObject = remoteStreams[p.id]; }}
                autoPlay
                playsInline
                className="h-full w-full bg-muted object-cover"
              />
            ) : p.isScreenSharing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <MonitorUp className="h-24 w-24 text-muted-foreground opacity-50" />
              </div>
            ) : (
              <Avatar className="relative z-10 h-24 w-24 border-4 border-border shadow-lg">
                <AvatarImage src={p.avatarUrl} />
                <AvatarFallback className="text-2xl font-bold">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[var(--color-ink)]/60 to-transparent p-3">
              <div className="flex flex-col">
                <span className="text-white font-medium text-sm drop-shadow-md">{p.name}</span>
                <span className="flex items-center gap-1 text-xs text-[var(--sb-text-muted)]">
                  {p.role === 'HOST' && <ShieldCheck className="w-3 h-3 text-brand" />}
                  {p.role === 'HOST' ? t('meetings.roleHost') : p.role === 'SPEAKER' ? t('meetings.roleSpeaker') : t('meetings.roleListener')}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className={`rounded-full p-1.5 ${p.isMuted ? 'bg-destructive/80 text-background' : 'bg-[var(--sb-bg)]/50 text-[var(--sb-text)]'}`}>
                  {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </div>
                {isHost && p.id !== activeUserId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-7 w-7 rounded-full text-white hover:bg-white/20 inline-flex items-center justify-center transition-colors">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {p.role !== 'LISTENER' && (
                        <DropdownMenuItem onClick={() => stateAction({ action: 'set_role', target_id: p.id, role: 'LISTENER' })}>
                          {t('meetings.demote')}
                        </DropdownMenuItem>
                      )}
                      {p.role === 'LISTENER' && (
                        <DropdownMenuItem onClick={() => stateAction({ action: 'set_role', target_id: p.id, role: 'SPEAKER' })}>
                          {t('meetings.promote')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => requestSummary(p.id)}>
                        <Sparkles className="me-2 h-4 w-4 text-info" />
                        {t('meetings.summarize')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => stateAction({ action: 'remove', target_id: p.id })}>
                        {t('meetings.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>

        <MeetingSidebar />
      </div>

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleSendInvite}
      />

      {/* Control Bar */}
      <div className="flex items-center justify-center gap-3 border-t border-border bg-card/80 p-4 backdrop-blur-md">
        {currentUserRole !== 'LISTENER' ? (
          <>
            <Button
              variant={isMuted ? "destructive" : "outline"}
              size="icon"
              className={`h-12 w-12 rounded-full ${isMuted ? 'shadow-lg' : 'hover:bg-muted'}`}
              onClick={() => {
                if (myParticipant) updateParticipant(myParticipant.id, { isMuted: !isMuted });
                void stateAction({ action: 'self', role: 'muted', value: !isMuted });
                webRTCControls?.toggleMute();
              }}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
            <Button
              variant={isVideoOff ? "destructive" : "outline"}
              size="icon"
              className={`h-12 w-12 rounded-full ${isVideoOff ? 'shadow-lg' : 'hover:bg-muted'}`}
              onClick={() => {
                setIsVideoOff(!isVideoOff);
                webRTCControls?.toggleVideo();
              }}
            >
              <Video className="w-5 h-5" />
            </Button>
            <Button
              variant={isScreenSharing ? "default" : "outline"}
              size="icon"
              className={`h-12 w-12 rounded-full ${isScreenSharing ? 'bg-brand text-brand-foreground shadow-lg shadow-brand/30 hover:bg-brand-hover' : 'hover:bg-muted'}`}
              onClick={() => {
                if (myParticipant) updateParticipant(myParticipant.id, { isScreenSharing: !isScreenSharing });
                void stateAction({ action: 'self', role: 'screen', value: !isScreenSharing });
                webRTCControls?.toggleScreenShare();
              }}
              title={t('meetings.screenShareTitle')}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
            </Button>

            <div className="mx-2 h-8 w-px bg-border"></div>

            <Button
              variant={isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'notes' ? "default" : "outline"}
              size="icon"
              className={`h-12 w-12 rounded-full ${isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'notes' ? 'bg-brand text-brand-foreground shadow-lg shadow-brand/30 hover:bg-brand-hover' : 'hover:bg-muted'}`}
              onClick={() => {
                if (isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'notes') {
                  setIsSidebarOpen(false);
                } else {
                  setActiveSidebarTab('notes');
                  setIsSidebarOpen(true);
                }
              }}
              title={t('meetings.notesTitle')}
            >
              <FileText className="w-5 h-5" />
            </Button>

            <Button
              variant={isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'ai' ? "default" : "outline"}
              size="icon"
              className={`h-12 w-12 rounded-full ${isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'ai' ? 'bg-brand text-brand-foreground shadow-lg shadow-brand/30 hover:bg-brand-hover' : 'hover:bg-muted'}`}
              onClick={() => {
                if (isSidebarOpen && useMeetingStore.getState().activeSidebarTab === 'ai') {
                  setIsSidebarOpen(false);
                } else {
                  setActiveSidebarTab('ai');
                  setIsSidebarOpen(true);
                }
              }}
              title={t('meetings.aiAssistant')}
            >
              <Sparkles className="w-5 h-5" />
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="h-12 gap-2 rounded-full border-warning/20 px-6 text-warning hover:bg-warning/10"
            onClick={() => stateAction({ action: 'hand', value: !(myParticipant?.handRaised) })}
          >
            <Hand className="w-5 h-5" /> {t('meetings.raiseHand')}
          </Button>
        )}

        {isHost && (
          <div className="ms-4 flex gap-2 border-s border-border ps-4">
            <Button variant="secondary" className="h-12 rounded-full font-semibold" onClick={handleMuteAll}>
              <MicOff className="w-4 h-4 me-2" />
              {t('meetings.muteAll')}
            </Button>
            <Button
              variant={isLocked ? "default" : "secondary"}
              className={`h-12 rounded-full font-semibold ${isLocked ? 'bg-destructive text-background hover:bg-destructive/90' : ''}`}
              onClick={handleLockRoom}
            >
              {isLocked ? <Lock className="w-4 h-4 me-2" /> : <Unlock className="w-4 h-4 me-2" />}
              {t('meetings.lockRoom')}
            </Button>
          </div>
        )}

        <Button variant="destructive" size="icon" className="ms-4 h-12 w-12 rounded-full shadow-lg transition-colors hover:bg-destructive/20" onClick={handleLeaveOrEnd}>
          <PhoneOff className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
