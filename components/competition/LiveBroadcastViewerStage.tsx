import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  LiveBroadcastRoomDoc,
  LiveViewerController,
  ViewerConnectionState,
} from '../../utils/liveBroadcastWebRTC';

interface LiveBroadcastViewerStageProps {
  competitionId: string;
  competitionName: string;
  broadcastRoom: LiveBroadcastRoomDoc;
  darkMode: boolean;
  isTvMode: boolean;
  summaryStats: {
    completionRate: number;
    evaluated: number;
    total: number;
    pending: number;
  };
}

function formatElapsed(startedAt: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const hrs = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/**
 * شاشة استقبال البث المباشر بالصوت والصورة عبر رابط المتابعة
 * تحل تلقائياً محل شاشة المؤشرات عند تشغيل المشرف للكاميرا، وتختفي تلقائياً لتعود المؤشرات عند إغلاقها.
 */
export const LiveBroadcastViewerStage: React.FC<LiveBroadcastViewerStageProps> = ({
  competitionId,
  competitionName,
  broadcastRoom,
  darkMode,
  isTvMode,
  summaryStats,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LiveViewerController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [connState, setConnState] = useState<ViewerConnectionState>('connecting');
  const [hasStream, setHasStream] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [autoplayBlockedAudio, setAutoplayBlockedAudio] = useState<boolean>(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onFs = () => setIsVideoFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const attachAndPlay = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    setHasStream(true);
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    try {
      el.muted = false;
      await el.play();
      setIsMuted(false);
      setAutoplayBlockedAudio(false);
    } catch {
      // المتصفح يمنع تشغيل الصوت التلقائي قبل نقرة المستخدم: نبدأ بالتشغيل الصامت مع زر واضح لتشغيل الصوت
      try {
        el.muted = true;
        await el.play();
        setIsMuted(true);
        setAutoplayBlockedAudio(true);
      } catch {
        setAutoplayBlockedAudio(true);
      }
    }
  }, []);

  useEffect(() => {
    setConnState('connecting');
    setHasStream(false);
    streamRef.current = null;

    const viewer = new LiveViewerController(competitionId, broadcastRoom.sessionId, {
      onStreamReady: stream => {
        attachAndPlay(stream);
      },
      onStateChange: st => {
        setConnState(st);
      },
    });
    controllerRef.current = viewer;
    viewer.connect().catch(err => {
      console.warn('Viewer live connect error:', err);
      setConnState('failed');
    });

    return () => {
      viewer.stop();
      controllerRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [competitionId, broadcastRoom.sessionId, reconnectNonce, attachAndPlay]);

  const handleToggleMute = async () => {
    const el = videoRef.current;
    if (!el) return;
    const nextMuted = !isMuted;
    el.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) {
      setAutoplayBlockedAudio(false);
      try {
        await el.play();
      } catch {}
    }
  };

  const handleUnmuteExplicit = async () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    setIsMuted(false);
    setAutoplayBlockedAudio(false);
    try {
      await el.play();
    } catch {}
  };

  const handleToggleStageFullscreen = async () => {
    try {
      if (!document.fullscreenElement && stageContainerRef.current?.requestFullscreen) {
        await stageContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <section className="space-y-4">
      {/* إطار البث المباشر الرسمي */}
      <div
        ref={stageContainerRef}
        className="relative rounded-2xl overflow-hidden border-2 border-[#D4AF37]/75 bg-[#050A14] shadow-2xl"
      >
        {/* الشريط العلوي فوق شاشة البث */}
        <div className="relative z-20 px-4 py-3 bg-gradient-to-b from-black/85 via-black/55 to-transparent flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs sm:text-sm font-black inline-flex items-center gap-1.5 shrink-0">
              <Radio size={15} className="animate-pulse" />
              <span>بث مباشر بالصوت والصورة</span>
            </span>

            <span className="text-xs sm:text-sm font-black text-[#F3E5AB] truncate">
              {broadcastRoom.caption?.trim() || `نقل مباشر لسير التقييم — ${competitionName}`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-black tabular-nums text-slate-200 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15">
              {formatElapsed(broadcastRoom.startedAt || nowMs, nowMs)}
            </span>

            <button
              type="button"
              onClick={handleToggleMute}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                isMuted
                  ? 'bg-amber-500 text-[#09152C] border-amber-300'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
              title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span className="hidden sm:inline">{isMuted ? 'تشغيل الصوت' : 'الصوت يعمل'}</span>
            </button>

            <button
              type="button"
              onClick={() => setReconnectNonce(n => n + 1)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
              title="إعادة الاتصال بالبث المباشر"
            >
              <RefreshCw size={15} />
              <span className="hidden sm:inline">إعادة الربط</span>
            </button>

            <button
              type="button"
              onClick={handleToggleStageFullscreen}
              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center justify-center transition cursor-pointer"
              title={isVideoFullscreen ? 'تصغير الشاشة' : 'ملء شاشة البث'}
              aria-label={isVideoFullscreen ? 'تصغير الشاشة' : 'ملء شاشة البث'}
            >
              {isVideoFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* شاشة الفيديو الفعلية */}
        <div
          className={`relative w-full bg-black flex items-center justify-center ${
            isVideoFullscreen
              ? 'h-[calc(100vh-110px)]'
              : isTvMode
              ? 'h-[62vh] min-h-[420px]'
              : 'aspect-video max-h-[70vh] min-h-[260px] sm:min-h-[380px]'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-contain transition-opacity duration-300 ${
              hasStream && broadcastRoom.videoEnabled !== false ? 'opacity-100' : 'opacity-15'
            }`}
          />

          {/* تنبيه تشغيل الصوت في حال كتمه المتصفح تلقائياً */}
          {hasStream && autoplayBlockedAudio && isMuted && (
            <button
              type="button"
              onClick={handleUnmuteExplicit}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 min-h-[48px] px-6 py-3 rounded-2xl bg-[#D4AF37] hover:bg-[#e1be49] text-[#09152C] font-black text-sm sm:text-base flex items-center gap-2.5 shadow-2xl border-2 border-white/40 cursor-pointer transition active:scale-95"
            >
              <Volume2 size={20} />
              <span>انقر هنا لتشغيل صوت البث المباشر</span>
            </button>
          )}

          {/* حالة إيقاف الصورة مؤقتاً أو تحرير الكاميرا مؤقتاً عند تبديل التطبيقات */}
          {hasStream && broadcastRoom.videoEnabled === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 pointer-events-none">
              <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-[#D4AF37]/40 text-[#F3E5AB] flex items-center justify-center">
                <VideoOff size={30} />
              </div>
              <p className="text-sm sm:text-base font-black text-white">
                {broadcastRoom.audioEnabled === false
                  ? 'البث متوقف مؤقتاً (سيُستأنف تلقائياً فور عودة جهاز البث)'
                  : 'البث الصوتي المباشر مستمر (الكاميرا متوقفة مؤقتاً من جهاز البث)'}
              </p>
            </div>
          )}

          {/* حالة الربط الأولي أو إعادة المحاولة */}
          {!hasStream && (
            <div className="absolute inset-0 bg-[#070E1C]/85 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#09152C] border border-[#D4AF37]/50 text-[#D4AF37] flex items-center justify-center">
                <RefreshCw
                  size={26}
                  className={connState === 'failed' ? '' : 'animate-spin'}
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-black text-white">
                  {connState === 'failed'
                    ? 'انقطع الاتصال بالبث المباشر مؤقتاً'
                    : 'جارٍ ربط البث المباشر بالصوت والصورة من موقع التقييم...'}
                </p>
                <p className="text-xs font-bold text-slate-400">
                  {connState === 'failed'
                    ? 'انقر على «إعادة الربط» لمحاولة استعادة البث فوراً'
                    : 'يرجى الانتظار لحظات حتى تستقر إشارة البث الحي'}
                </p>
              </div>
              {connState === 'failed' && (
                <button
                  type="button"
                  onClick={() => setReconnectNonce(n => n + 1)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition"
                >
                  <RefreshCw size={16} />
                  <span>إعادة الربط الآن</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* شريط سفلي هادئ يوضح أن المؤشرات ستعود تلقائياً بعد انتهاء البث */}
        <div className="px-4 py-2.5 bg-[#09152C] border-t border-[#D4AF37]/30 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-200">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
            <span className="text-[#F3E5AB] font-black">
              إنجاز التقييم الحالي: {summaryStats.completionRate}%
            </span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span>
              تم تقييم {summaryStats.evaluated.toLocaleString('ar-OM')} من{' '}
              {summaryStats.total.toLocaleString('ar-OM')} متسابق
            </span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span>بانتظار التقييم: {summaryStats.pending.toLocaleString('ar-OM')}</span>
          </div>
          <span className="text-[11px] text-slate-400">
            ستعود لوحة المؤشرات والرسوم البيانية تلقائياً فور إغلاق البث المباشر
          </span>
        </div>
      </div>

      {/* تنبيه صوتي في حال البث المرئي فقط بدون ميكروفون */}
      {broadcastRoom.videoEnabled !== false && broadcastRoom.audioEnabled === false && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-xs font-bold text-center ${
            darkMode
              ? 'bg-amber-950/40 border-amber-800 text-amber-200'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          ملاحظة: البث الحالي مرئي فقط (الميكروفون غير مفعّل من جهاز البث).
        </div>
      )}
    </section>
  );
};

export default LiveBroadcastViewerStage;
