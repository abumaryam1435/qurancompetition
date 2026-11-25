import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { rawFirestore, sanitizeForFirebase } from './firebase';

export interface LiveBroadcastRoomDoc {
  active: boolean;
  sessionId: string;
  competitionId: string;
  startedAt: number;
  updatedAt: number;
  heartbeatAt: number;
  audioEnabled: boolean;
  videoEnabled: boolean;
  caption?: string;
  viewers?: Record<string, { joinedAt: number }>;
}

interface SignalingDoc {
  sessionId: string;
  viewerId: string;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  broadcasterCandidates?: RTCIceCandidateInit[];
  viewerCandidates?: RTCIceCandidateInit[];
  updatedAt?: number;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 6,
};

const HEARTBEAT_INTERVAL_MS = 10000;
export const BROADCAST_STALE_MS = 45000;

export function sanitizeFirestoreKey(raw: string): string {
  return String(raw || 'default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

export function getBroadcastRoomDocId(competitionId: string): string {
  return `liveBroadcast_${sanitizeFirestoreKey(competitionId)}`;
}

function getSignalingDocId(sessionId: string, viewerId: string): string {
  return `liveSig_${sanitizeFirestoreKey(sessionId)}_${sanitizeFirestoreKey(viewerId)}`;
}

function createRandomId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function isBroadcastRoomCurrentlyLive(room: LiveBroadcastRoomDoc | null): boolean {
  if (!room || !room.active || !room.sessionId) return false;
  const lastBeat = Number(room.heartbeatAt || room.updatedAt || room.startedAt || 0);
  if (!lastBeat) return true;
  return Date.now() - lastBeat < BROADCAST_STALE_MS;
}

/**
 * الاستماع اللحظي لحالة البث المباشر لمسابقة محددة عبر Firestore
 */
export function subscribeToBroadcastRoom(
  competitionId: string,
  onUpdate: (room: LiveBroadcastRoomDoc | null) => void
): Unsubscribe {
  const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(competitionId));
  return onSnapshot(
    roomRef,
    snap => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const data = snap.data() as LiveBroadcastRoomDoc;
      onUpdate(data || null);
    },
    err => {
      console.warn('Live broadcast room snapshot error:', err);
    }
  );
}

/**
 * مدير جلسة البث المباشر من جهة المشرف (1-to-Many WebRTC over Firestore Signaling)
 * يدعم تبديل الكاميرا (أمامية/خلفية) وكتم الصوت دون انقطاع المشاهدين،
 * ويدعم عدة مشاهدين متزامنين عبر الرابط على Netlify وأي منصة استضافة.
 */
export class LiveBroadcasterController {
  private competitionId: string;
  private sessionId: string;
  private stream: MediaStream;
  private roomUnsub: Unsubscribe | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<
    string,
    {
      pc: RTCPeerConnection;
      videoSender: RTCRtpSender;
      audioSender: RTCRtpSender;
      sigUnsub: Unsubscribe;
      broadcasterCandidates: RTCIceCandidateInit[];
      addedViewerCandidates: number;
      remoteDescSet: boolean;
      pendingViewerCandidates: RTCIceCandidateInit[];
    }
  >();
  private stopped = false;
  private audioEnabled = true;
  private videoEnabled = true;
  private caption = '';
  private onViewerCountChange?: (count: number) => void;

  constructor(
    competitionId: string,
    stream: MediaStream,
    opts?: {
      caption?: string;
      audioEnabled?: boolean;
      videoEnabled?: boolean;
      onViewerCountChange?: (count: number) => void;
    }
  ) {
    this.competitionId = competitionId;
    this.sessionId = createRandomId('bcast');
    this.stream = stream;
    this.caption = opts?.caption || '';
    this.audioEnabled =
      typeof opts?.audioEnabled === 'boolean'
        ? opts.audioEnabled
        : stream.getAudioTracks().length > 0;
    this.videoEnabled =
      typeof opts?.videoEnabled === 'boolean'
        ? opts.videoEnabled
        : stream.getVideoTracks().length > 0;
    this.onViewerCountChange = opts?.onViewerCountChange;
  }

  private emitViewerCount() {
    if (!this.onViewerCountChange) return;
    let activeCount = 0;
    this.peers.forEach(entry => {
      const state = entry.pc.connectionState;
      if (state !== 'failed' && state !== 'closed') {
        activeCount += 1;
      }
    });
    this.onViewerCountChange(activeCount);
  }

  async start(): Promise<void> {
    const now = Date.now();
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));

    const initialPayload: LiveBroadcastRoomDoc = {
      active: true,
      sessionId: this.sessionId,
      competitionId: this.competitionId,
      startedAt: now,
      updatedAt: now,
      heartbeatAt: now,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      caption: this.caption,
      viewers: {},
    };

    await setDoc(roomRef, sanitizeForFirebase(initialPayload));

    // الاستماع لطلبات انضمام المشاهدين الجدد في وثيقة الغرفة
    this.roomUnsub = onSnapshot(
      roomRef,
      snap => {
        if (this.stopped || !snap.exists()) return;
        const data = snap.data() as LiveBroadcastRoomDoc;
        if (!data || data.sessionId !== this.sessionId || !data.active) return;
        const viewers = data.viewers || {};
        for (const [viewerId, meta] of Object.entries(viewers)) {
          if (!viewerId || !meta) continue;
          if (!this.peers.has(viewerId)) {
            this.connectViewer(viewerId).catch(err =>
              console.warn(`Failed to connect viewer ${viewerId}:`, err)
            );
          }
        }
      },
      err => {
        console.warn('Broadcaster room listener error:', err);
      }
    );

    // نبض دوري كل 10 ثوانٍ لإثبات استمرار البث الحي
    this.heartbeatTimer = setInterval(() => {
      if (this.stopped) return;
      setDoc(
        roomRef,
        sanitizeForFirebase({
          heartbeatAt: Date.now(),
          updatedAt: Date.now(),
        }),
        { merge: true }
      ).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async connectViewer(viewerId: string): Promise<void> {
    if (this.stopped || this.peers.has(viewerId)) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const sigRef = doc(
      rawFirestore,
      'appData',
      getSignalingDocId(this.sessionId, viewerId)
    );

    // استخدام transceivers مخصصة للصوت والصورة حتى نتمكن من تحرير عتاد الكاميرا أو الميكروفون فعلياً
    // (replaceTrack(null)) وإعادة تشغيله لاحقاً دون انقطاع اتصال المشاهدين أو إعادة تفاوض SDP.
    const videoTransceiver = pc.addTransceiver('video', {
      direction: 'sendonly',
      streams: [this.stream],
    });
    const audioTransceiver = pc.addTransceiver('audio', {
      direction: 'sendonly',
      streams: [this.stream],
    });

    const currentVideoTrack = this.stream.getVideoTracks()[0] || null;
    const currentAudioTrack = this.stream.getAudioTracks()[0] || null;
    if (currentVideoTrack && currentVideoTrack.readyState === 'live') {
      await videoTransceiver.sender.replaceTrack(currentVideoTrack).catch(() => {});
    }
    if (currentAudioTrack && currentAudioTrack.readyState === 'live') {
      await audioTransceiver.sender.replaceTrack(currentAudioTrack).catch(() => {});
    }

    const peerEntry = {
      pc,
      videoSender: videoTransceiver.sender,
      audioSender: audioTransceiver.sender,
      sigUnsub: (() => {}) as Unsubscribe,
      broadcasterCandidates: [] as RTCIceCandidateInit[],
      addedViewerCandidates: 0,
      remoteDescSet: false,
      pendingViewerCandidates: [] as RTCIceCandidateInit[],
    };
    this.peers.set(viewerId, peerEntry);
    this.emitViewerCount();

    // تجميع وإرسال مرشحات ICE الخاصة بالمشرف (مع debounce بسيط لتقليل الكتابة)
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushBroadcasterCandidates = () => {
      if (this.stopped) return;
      setDoc(
        sigRef,
        sanitizeForFirebase({
          sessionId: this.sessionId,
          viewerId,
          broadcasterCandidates: peerEntry.broadcasterCandidates,
          updatedAt: Date.now(),
        }),
        { merge: true }
      ).catch(() => {});
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        peerEntry.broadcasterCandidates.push(event.candidate.toJSON());
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flushBroadcasterCandidates, 120);
      }
    };

    pc.onconnectionstatechange = () => {
      this.emitViewerCount();
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.disconnectViewer(viewerId);
      }
    };

    // إنشاء عرض WebRTC Offer وإرساله للمشاهد
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    await setDoc(
      sigRef,
      sanitizeForFirebase({
        sessionId: this.sessionId,
        viewerId,
        offer: { type: offer.type, sdp: offer.sdp },
        broadcasterCandidates: peerEntry.broadcasterCandidates,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );

    // الاستماع لرد المشاهد (Answer + Viewer ICE Candidates)
    peerEntry.sigUnsub = onSnapshot(
      sigRef,
      async snap => {
        if (this.stopped || !snap.exists()) return;
        const data = snap.data() as SignalingDoc;
        if (!data) return;

        try {
          if (data.answer && !peerEntry.remoteDescSet && pc.signalingState !== 'closed') {
            peerEntry.remoteDescSet = true;
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            // تطبيق أي مرشحات وصلت قبل الرد
            for (const c of peerEntry.pendingViewerCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            peerEntry.pendingViewerCandidates = [];
          }

          const incoming = Array.isArray(data.viewerCandidates)
            ? data.viewerCandidates
            : [];
          if (incoming.length > peerEntry.addedViewerCandidates) {
            const fresh = incoming.slice(peerEntry.addedViewerCandidates);
            peerEntry.addedViewerCandidates = incoming.length;
            for (const cand of fresh) {
              if (peerEntry.remoteDescSet && pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              } else {
                peerEntry.pendingViewerCandidates.push(cand);
              }
            }
          }
        } catch (err) {
          console.warn('Error applying viewer answer/ICE:', err);
        }
      },
      err => {
        console.warn('Broadcaster signaling listener error:', err);
      }
    );
  }

  private disconnectViewer(viewerId: string) {
    const entry = this.peers.get(viewerId);
    if (!entry) return;
    try {
      entry.sigUnsub();
    } catch {}
    try {
      entry.pc.close();
    } catch {}
    this.peers.delete(viewerId);
    this.emitViewerCount();
  }

  /**
   * استبدال أو تحرير مسار واحد (صوت أو صورة) فعلياً لجميع المشاهدين دون قطع الجلسة.
   * تمرير null يوقف ويحرر عتاد الكاميرا أو الميكروفون بالكامل لبقية تطبيقات الهاتف.
   */
  async replaceTrack(
    kind: 'audio' | 'video',
    nextTrack: MediaStreamTrack | null
  ): Promise<void> {
    const existingTracks =
      kind === 'video' ? this.stream.getVideoTracks() : this.stream.getAudioTracks();
    existingTracks.forEach(t => {
      if (t !== nextTrack) {
        try {
          this.stream.removeTrack(t);
          t.stop();
        } catch {}
      }
    });

    if (nextTrack && !this.stream.getTracks().some(t => t.id === nextTrack.id)) {
      this.stream.addTrack(nextTrack);
    }

    if (kind === 'audio') {
      this.audioEnabled = Boolean(nextTrack && nextTrack.enabled);
    } else {
      this.videoEnabled = Boolean(nextTrack && nextTrack.enabled);
    }

    const tasks: Promise<void>[] = [];
    this.peers.forEach(entry => {
      const sender = kind === 'video' ? entry.videoSender : entry.audioSender;
      tasks.push(sender.replaceTrack(nextTrack).catch(() => {}));
    });
    await Promise.all(tasks);

    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        updatedAt: Date.now(),
      }),
      { merge: true }
    ).catch(() => {});
  }

  /**
   * استبدال مسار الكاميرا أو الصوت لجميع المشاهدين الحاليين لحظياً (مثلاً عند تبديل الكاميرا الأمامية/الخلفية)
   */
  async replaceStream(nextStream: MediaStream): Promise<void> {
    this.stream = nextStream;
    const nextVideoTrack = nextStream.getVideoTracks()[0] || null;
    const nextAudioTrack = nextStream.getAudioTracks()[0] || null;

    this.videoEnabled = Boolean(nextVideoTrack && nextVideoTrack.enabled);
    this.audioEnabled = Boolean(nextAudioTrack && nextAudioTrack.enabled);

    const tasks: Promise<void>[] = [];
    this.peers.forEach(entry => {
      tasks.push(entry.videoSender.replaceTrack(nextVideoTrack).catch(() => {}));
      tasks.push(entry.audioSender.replaceTrack(nextAudioTrack).catch(() => {}));
    });
    await Promise.all(tasks);

    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        updatedAt: Date.now(),
      }),
      { merge: true }
    ).catch(() => {});
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    this.audioEnabled = enabled;
    this.stream.getAudioTracks().forEach(t => {
      t.enabled = enabled;
    });
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({ audioEnabled: enabled, updatedAt: Date.now() }),
      { merge: true }
    ).catch(() => {});
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    this.videoEnabled = enabled;
    this.stream.getVideoTracks().forEach(t => {
      t.enabled = enabled;
    });
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({ videoEnabled: enabled, updatedAt: Date.now() }),
      { merge: true }
    ).catch(() => {});
  }

  async updateCaption(caption: string): Promise<void> {
    this.caption = caption.trim();
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({ caption: this.caption, updatedAt: Date.now() }),
      { merge: true }
    ).catch(() => {});
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.roomUnsub) {
      try {
        this.roomUnsub();
      } catch {}
      this.roomUnsub = null;
    }

    const viewerIds = Array.from(this.peers.keys());
    for (const vid of viewerIds) {
      this.disconnectViewer(vid);
      const sigRef = doc(
        rawFirestore,
        'appData',
        getSignalingDocId(this.sessionId, vid)
      );
      deleteDoc(sigRef).catch(() => {});
    }

    // إيقاف جميع مسارات الكاميرا والميكروفون فوراً
    try {
      this.stream.getTracks().forEach(t => t.stop());
    } catch {}

    // إبلاغ جميع المشاهدين فوراً بانتهاء البث للعودة التلقائية لشاشة المؤشرات
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));
    await setDoc(
      roomRef,
      sanitizeForFirebase({
        active: false,
        sessionId: this.sessionId,
        competitionId: this.competitionId,
        updatedAt: Date.now(),
        heartbeatAt: 0,
        viewers: {},
      }),
      { merge: true }
    ).catch(() => {});
  }
}

export type ViewerConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/**
 * مدير استقبال البث المباشر من جهة المشاهد (مدير الأوقاف / شاشة العرض)
 */
export class LiveViewerController {
  private competitionId: string;
  private sessionId: string;
  private viewerId: string;
  private pc: RTCPeerConnection | null = null;
  private sigUnsub: Unsubscribe | null = null;
  private stopped = false;
  private remoteStream: MediaStream;
  private viewerCandidates: RTCIceCandidateInit[] = [];
  private addedBroadcasterCandidates = 0;
  private remoteDescSet = false;
  private pendingBroadcasterCandidates: RTCIceCandidateInit[] = [];
  private onStreamReady: (stream: MediaStream) => void;
  private onStateChange: (state: ViewerConnectionState) => void;

  constructor(
    competitionId: string,
    sessionId: string,
    callbacks: {
      onStreamReady: (stream: MediaStream) => void;
      onStateChange: (state: ViewerConnectionState) => void;
    }
  ) {
    this.competitionId = competitionId;
    this.sessionId = sessionId;
    this.viewerId = createRandomId('vw');
    this.remoteStream = new MediaStream();
    this.onStreamReady = callbacks.onStreamReady;
    this.onStateChange = callbacks.onStateChange;
  }

  async connect(): Promise<void> {
    if (this.stopped) return;
    this.onStateChange('connecting');

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    const sigRef = doc(
      rawFirestore,
      'appData',
      getSignalingDocId(this.sessionId, this.viewerId)
    );
    const roomRef = doc(rawFirestore, 'appData', getBroadcastRoomDocId(this.competitionId));

    pc.ontrack = event => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          if (!this.remoteStream.getTracks().some(t => t.id === track.id)) {
            this.remoteStream.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream.getTracks().some(t => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }
      this.onStreamReady(this.remoteStream);
    };

    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushViewerCandidates = () => {
      if (this.stopped) return;
      setDoc(
        sigRef,
        sanitizeForFirebase({
          sessionId: this.sessionId,
          viewerId: this.viewerId,
          viewerCandidates: this.viewerCandidates,
          updatedAt: Date.now(),
        }),
        { merge: true }
      ).catch(() => {});
    };

    pc.onicecandidate = event => {
      if (event.candidate) {
        this.viewerCandidates.push(event.candidate.toJSON());
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flushViewerCandidates, 120);
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        this.onStateChange('connected');
      } else if (st === 'disconnected') {
        this.onStateChange('reconnecting');
      } else if (st === 'failed') {
        this.onStateChange('failed');
      }
    };

    // الاستماع لعرض المشرف (Offer + Broadcaster ICE Candidates)
    this.sigUnsub = onSnapshot(
      sigRef,
      async snap => {
        if (this.stopped || !snap.exists() || !this.pc) return;
        const data = snap.data() as SignalingDoc;
        if (!data) return;

        try {
          if (data.offer && !this.remoteDescSet && pc.signalingState !== 'closed') {
            this.remoteDescSet = true;
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

            for (const c of this.pendingBroadcasterCandidates) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            this.pendingBroadcasterCandidates = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await setDoc(
              sigRef,
              sanitizeForFirebase({
                sessionId: this.sessionId,
                viewerId: this.viewerId,
                answer: { type: answer.type, sdp: answer.sdp },
                viewerCandidates: this.viewerCandidates,
                updatedAt: Date.now(),
              }),
              { merge: true }
            );
          }

          const incoming = Array.isArray(data.broadcasterCandidates)
            ? data.broadcasterCandidates
            : [];
          if (incoming.length > this.addedBroadcasterCandidates) {
            const fresh = incoming.slice(this.addedBroadcasterCandidates);
            this.addedBroadcasterCandidates = incoming.length;
            for (const cand of fresh) {
              if (this.remoteDescSet && pc.signalingState !== 'closed') {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              } else {
                this.pendingBroadcasterCandidates.push(cand);
              }
            }
          }
        } catch (err) {
          console.warn('Viewer WebRTC handshake error:', err);
        }
      },
      err => {
        console.warn('Viewer signaling listener error:', err);
      }
    );

    // تسجيل طلب الانضمام لدى المشرف ليبدأ إرسال العرض
    await setDoc(
      roomRef,
      sanitizeForFirebase({
        viewers: {
          [this.viewerId]: {
            joinedAt: Date.now(),
          },
        },
      }),
      { merge: true }
    );
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.sigUnsub) {
      try {
        this.sigUnsub();
      } catch {}
      this.sigUnsub = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    const sigRef = doc(
      rawFirestore,
      'appData',
      getSignalingDocId(this.sessionId, this.viewerId)
    );
    deleteDoc(sigRef).catch(() => {});
    this.onStateChange('idle');
  }
}
