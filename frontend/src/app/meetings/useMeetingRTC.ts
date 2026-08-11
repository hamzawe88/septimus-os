"use client";

// Mesh WebRTC transport for meetings.
//
// Media flows peer-to-peer (RTCPeerConnection); only the signaling travels
// through the stack we already trust: POST /meetings/:id/signal → backend
// participant checks → Centrifugo private user_<id> channel. No new service,
// no new dependency. A mesh is O(n²) connections, which is fine for the small
// internal meetings this module targets (≤ ~6 people); beyond that the upgrade
// path is an SFU (LiveKit) behind the same signaling shape.
//
// Initiator rule: for each pair, the peer with the lexicographically greater
// user id creates the offer. Both sides derive it independently, so there is
// no offer glare by construction.

import { useEffect, useRef, useState } from 'react';
import type { PublicationContext, Subscription } from 'centrifuge';
import { useAppStore } from '@/store/useAppStore';
import { useMeetingStore } from '@/store/useMeetingStore';
import { apiPost } from '@/lib/apiClient';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

interface SignalMessage {
  type?: string;
  meeting_id?: string;
  from?: string;
  kind?: 'offer' | 'answer' | 'ice';
  payload?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
}

interface UseMeetingRTCArgs {
  enabled: boolean;
  meetingId: string | null;
  selfId: string;
  peerIds: string[];
}

export function useMeetingRTC({ enabled, meetingId, selfId, peerIds }: UseMeetingRTCArgs) {
  const centrifuge = useAppStore((s) => s.centrifuge);
  const { setLocalStream, setScreenStream, setWebRTCControls } = useMeetingStore();

  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const meetingIdRef = useRef<string | null>(meetingId);

  const peersKey = [...peerIds].sort().join(',');

  useEffect(() => {
    meetingIdRef.current = meetingId;
  }, [meetingId]);

  // ── Local media + controls ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !meetingId || !selfId) return;
    let cancelled = false;

    const acquire = async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          return; // no devices / permission denied → signaling still works, media silent
        }
      }
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      localStreamRef.current = stream;
      cameraVideoTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);

      // Late media: if peer connections already exist, attach tracks now.
      peersRef.current.forEach((pc) => {
        stream?.getTracks().forEach(track => {
          const already = pc.getSenders().some(s => s.track === track);
          if (!already && stream) pc.addTrack(track, stream);
        });
      });
    };
    void acquire();

    const replaceVideoTrack = async (track: MediaStreamTrack | null) => {
      const replacements: Promise<void>[] = [];
      peersRef.current.forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === 'video' || (sender.track === null && track)) {
            replacements.push(sender.replaceTrack(track));
          }
        });
      });
      await Promise.all(replacements);
    };

    setWebRTCControls({
      toggleMute: () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      },
      toggleVideo: () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      },
      toggleScreenShare: async () => {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
          setScreenStream(null);
          await replaceVideoTrack(cameraVideoTrackRef.current);
          return;
        }
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const track = display.getVideoTracks()[0];
          if (!track) return;
          screenStreamRef.current = display;
          setScreenStream(display);
          await replaceVideoTrack(track);
          track.onended = () => {
            screenStreamRef.current = null;
            setScreenStream(null);
            void replaceVideoTrack(cameraVideoTrackRef.current);
          };
        } catch {
          // user cancelled the picker
        }
      },
    });

    return () => {
      cancelled = true;
      setWebRTCControls(null);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [enabled, meetingId, selfId, setLocalStream, setScreenStream, setWebRTCControls]);

  // ── Peer lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !meetingId || !selfId) return;

    const sendSignal = async (targetId: string, kind: string, payload: unknown) => {
      try {
        await apiPost(`/meetings/${meetingId}/signal`, { target_id: targetId, kind, payload });
      } catch {
        // peer may have just left; reconcile will clean up
      }
    };

    const dropPeer = (peerId: string) => {
      const pc = peersRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        peersRef.current.delete(peerId);
      }
      pendingIceRef.current.delete(peerId);
      setRemoteStreams(prev => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const ensurePeer = (peerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerId, pc);

      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach(track => pc.addTrack(track, local));
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          void sendSignal(peerId, 'ice', { candidate: e.candidate.toJSON() });
        }
      };
      pc.ontrack = (e) => {
        setRemoteStreams(prev => {
          const stream = prev[peerId] ?? new MediaStream();
          if (!stream.getTracks().some(t => t.id === e.track.id)) {
            stream.addTrack(e.track);
          }
          return { ...prev, [peerId]: stream };
        });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          dropPeer(peerId);
        }
      };
      return pc;
    };

    const makeOffer = async (peerId: string) => {
      const pc = ensurePeer(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(peerId, 'offer', { sdp: offer });
      } catch {
        dropPeer(peerId);
      }
    };

    const flushPendingIce = async (peerId: string, pc: RTCPeerConnection) => {
      const queued = pendingIceRef.current.get(peerId) ?? [];
      pendingIceRef.current.delete(peerId);
      for (const candidate of queued) {
        try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
      }
    };

    // Reconcile the mesh with the authoritative roster. Derived from peersKey
    // (a stable string) so this effect re-runs only on real roster changes,
    // not on every render of a fresh array identity.
    const desired = new Set(peersKey.split(',').filter(id => id && id !== selfId));
    peersRef.current.forEach((_pc, peerId) => {
      if (!desired.has(peerId)) dropPeer(peerId);
    });
    desired.forEach(peerId => {
      if (!peersRef.current.has(peerId) && selfId > peerId) {
        void makeOffer(peerId);
      }
      // selfId < peerId → that peer is the initiator; we wait for its offer.
    });

    // Incoming signals on our private channel.
    if (!centrifuge) return;
    const channel = `user_${selfId}`;
    const existingSub = centrifuge.getSubscription(channel);
    const sub: Subscription = existingSub ?? centrifuge.newSubscription(channel);

    const onPublication = (ctx: PublicationContext) => {
      const data = ctx.data as SignalMessage;
      if (data?.type !== 'meeting.signal') return;
      if (data.meeting_id !== meetingIdRef.current) return;
      const from = data.from;
      if (!from || from === selfId) return;

      void (async () => {
        try {
          if (data.kind === 'offer' && data.payload?.sdp) {
            const pc = ensurePeer(from);
            await pc.setRemoteDescription(data.payload.sdp);
            await flushPendingIce(from, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(from, 'answer', { sdp: answer });
          } else if (data.kind === 'answer' && data.payload?.sdp) {
            const pc = peersRef.current.get(from);
            if (pc && pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(data.payload.sdp);
              await flushPendingIce(from, pc);
            }
          } else if (data.kind === 'ice' && data.payload?.candidate) {
            const pc = peersRef.current.get(from);
            if (pc && pc.remoteDescription) {
              try { await pc.addIceCandidate(data.payload.candidate); } catch { /* stale */ }
            } else {
              const queue = pendingIceRef.current.get(from) ?? [];
              queue.push(data.payload.candidate);
              pendingIceRef.current.set(from, queue);
            }
          }
        } catch {
          dropPeer(from);
        }
      })();
    };

    sub.on('publication', onPublication);
    if (sub.state === 'unsubscribed') sub.subscribe();

    return () => {
      sub.removeListener('publication', onPublication);
    };
  }, [enabled, meetingId, selfId, peersKey, centrifuge]);

  // Full teardown when the meeting ends or the page unmounts.
  useEffect(() => {
    if (enabled) return;
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    pendingIceRef.current.clear();
    const timer = window.setTimeout(() => setRemoteStreams({}), 0);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return { remoteStreams };
}
