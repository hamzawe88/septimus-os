import { create } from 'zustand';
import { apiPost } from '@/lib/apiClient';

export type MeetingRole = 'HOST' | 'SPEAKER' | 'LISTENER';

export interface MeetingParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
  role: MeetingRole;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  handRaised?: boolean;
}

export interface TranscriptLine {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export interface MeetingSummaryState {
  text: string;
  lang: string;
  noTranscript: boolean;
}

// Server payload shapes (backend entity data → client state)
export interface ServerParticipant {
  id: string;
  name: string;
  avatar?: string;
  role: MeetingRole;
  muted: boolean;
  hand_raised: boolean;
  screen_sharing: boolean;
}

export interface ServerTranscriptLine {
  id: string;
  speaker_id: string;
  speaker: string;
  text: string;
  ts: string;
}

export function mapServerParticipant(p: ServerParticipant): MeetingParticipant {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatar || undefined,
    role: p.role,
    isMuted: p.muted,
    isDeafened: false,
    isScreenSharing: p.screen_sharing,
    handRaised: p.hand_raised,
  };
}

export function mapServerTranscript(l: ServerTranscriptLine): TranscriptLine {
  return { id: l.id, sender: l.speaker, text: l.text, timestamp: Date.parse(l.ts) || Date.now() };
}

interface MeetingState {
  isActive: boolean;
  meetingId: string | null;
  meetingTitle: string;
  hostId: string | null;
  isLocked: boolean;
  currentUserRole: MeetingRole;
  isPiP: boolean; // Picture-in-Picture mode
  participants: MeetingParticipant[];

  // Sidebar State
  isSidebarOpen: boolean;
  activeSidebarTab: 'notes' | 'ai';
  notesText: string;
  transcriptLogs: TranscriptLine[];
  summary: MeetingSummaryState | null;
  isSummarizing: boolean;

  // Keep the stream alive globally
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  webRTCControls: {
    toggleMute: () => void;
    toggleVideo: () => void;
    toggleScreenShare: () => Promise<void>;
  } | null;

  // Actions
  startMeeting: (id: string, role: MeetingRole) => void;
  endMeeting: () => void;
  /** Tells the server first, then tears down locally. Use this for any user-facing
   *  hang-up; `endMeeting` alone only cleans up this tab. */
  leaveOrEndMeeting: () => Promise<void>;
  setPiPMode: (isPiP: boolean) => void;
  setRole: (role: MeetingRole) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setWebRTCControls: (controls: MeetingState['webRTCControls']) => void;
  addParticipant: (p: MeetingParticipant) => void;
  removeParticipant: (id: string) => void;
  updateParticipant: (id: string, updates: Partial<MeetingParticipant>) => void;
  raiseHand: (id: string, raised: boolean) => void;

  // Server sync
  syncFromServer: (data: {
    id: string;
    title?: string;
    hostId?: string;
    locked?: boolean;
    participants: ServerParticipant[];
    transcript?: ServerTranscriptLine[];
    currentUserId: string;
  }) => void;
  appendTranscriptFromServer: (line: ServerTranscriptLine) => void;
  setSummary: (summary: MeetingSummaryState | null) => void;
  setIsSummarizing: (v: boolean) => void;

  // Sidebar Actions
  setIsSidebarOpen: (isOpen: boolean) => void;
  setActiveSidebarTab: (tab: 'notes' | 'ai') => void;
  setNotesText: (text: string) => void;
  addTranscriptLog: (log: TranscriptLine) => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  isActive: false,
  meetingId: null,
  meetingTitle: '',
  hostId: null,
  isLocked: false,
  currentUserRole: 'LISTENER',
  isPiP: false,
  participants: [],
  localStream: null,
  screenStream: null,
  webRTCControls: null,

  isSidebarOpen: false,
  activeSidebarTab: 'notes',
  notesText: '',
  transcriptLogs: [],
  summary: null,
  isSummarizing: false,

  startMeeting: (id, role) => set({ isActive: true, meetingId: id, currentUserRole: role, isPiP: false }),
  endMeeting: () => set((state) => {
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    // The screen share was left running: its tracks were never stopped and the
    // stream was never cleared, so the browser kept showing "sharing your
    // screen" after the meeting ended.
    if (state.screenStream) {
      state.screenStream.getTracks().forEach(track => track.stop());
    }
    return {
      isActive: false, meetingId: null, meetingTitle: '', hostId: null, isLocked: false,
      currentUserRole: 'LISTENER', isPiP: false, participants: [], localStream: null,
      screenStream: null,
      transcriptLogs: [], summary: null, isSummarizing: false,
    };
  }),
  // The meetings page hung up through the server; the floating widget called the
  // local-only `endMeeting`. So hanging up from the widget left the meeting
  // marked "live" for everyone else and the workspace collected phantom rooms.
  // One implementation, both callers.
  leaveOrEndMeeting: async () => {
    const { meetingId, currentUserRole, endMeeting } = get();
    if (meetingId) {
      try {
        await apiPost(`/meetings/${meetingId}/${currentUserRole === 'HOST' ? 'end' : 'leave'}`, {});
      } catch {
        // Local teardown happens regardless — never trap the user in a call
        // because the network blipped.
      }
    }
    endMeeting();
  },
  setPiPMode: (isPiP) => set({ isPiP }),
  setRole: (role) => set({ currentUserRole: role }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setScreenStream: (stream) => set({ screenStream: stream }),
  setWebRTCControls: (controls) => set({ webRTCControls: controls }),

  addParticipant: (p) => set((state) => ({ participants: [...state.participants, p] })),
  removeParticipant: (id) => set((state) => ({ participants: state.participants.filter(p => p.id !== id) })),
  updateParticipant: (id, updates) => set((state) => ({
    participants: state.participants.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  raiseHand: (id, raised) => set((state) => ({
    participants: state.participants.map(p => p.id === id ? { ...p, handRaised: raised } : p)
  })),

  syncFromServer: ({ id, title, hostId, locked, participants, transcript, currentUserId }) => set((state) => {
    const mapped = participants.map(mapServerParticipant);
    const me = mapped.find(p => p.id === currentUserId);
    return {
      isActive: true,
      meetingId: id,
      meetingTitle: title ?? state.meetingTitle,
      hostId: hostId ?? state.hostId,
      isLocked: locked ?? state.isLocked,
      participants: mapped,
      currentUserRole: me?.role ?? 'LISTENER',
      transcriptLogs: transcript ? transcript.map(mapServerTranscript) : state.transcriptLogs,
    };
  }),
  appendTranscriptFromServer: (line) => set((state) => (
    state.transcriptLogs.some(l => l.id === line.id)
      ? {}
      : { transcriptLogs: [...state.transcriptLogs, mapServerTranscript(line)] }
  )),
  setSummary: (summary) => set({ summary, isSummarizing: false }),
  setIsSummarizing: (v) => set({ isSummarizing: v }),

  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
  setNotesText: (text) => set({ notesText: text }),
  addTranscriptLog: (log) => set((state) => ({ transcriptLogs: [...state.transcriptLogs, log] }))
}));
