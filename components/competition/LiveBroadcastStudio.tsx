import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  ShieldCheck,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { Competition } from '../../types';
import { LiveBroadcasterController } from '../../utils/liveBroadcastWebRTC';
import { buildCompetitionLiveUrl, ensureLiveShareConfig } from '../../utils/liveShareUrl';

interface LiveBroadcastStudioProps {
  comp: Competition;
  initialAudioEnabled?: boolean;
  onEnsureLinkEnabled?: () => void;
  onClose: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

// إعدادات صوت صديقة لنظام الهاتف (تمنع إجبار الهاتف على وضع المكالمات الصوتية الذي يخفض صوت التطبيقات الأخرى قدر الإمكان)
const NON_INTRUSIVE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * شاشة الكاميرا والبث المباشر بالصوت والصورة للمشرف أو مصور القاعة
 * - عند كتم الصوت أو إيقاف الكاميرا يتم تحرير عتاد الميكروفون/الكاميرا فعلياً لبقية تطبيقات الهاتف.
 * - عند الانتقال لتطبيق آخر في الهاتف يتم تحرير الكاميرا والميكروفون تلقائياً وإعادة التشغيل فور العودة.
 * - عند الضغط على زر «إغلاق الكاميرا» يتوقف البث وتعود شاشة المؤشرات تلقائياً.
 */
export const LiveBroadcastStudio: React.FC<LiveBroadcastStudioProps> = ({
  comp,
  initialAudioEnabled = true,
  onEnsureLinkEnabled,
  onClose,
  showToast,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controllerRef = useRef<LiveBroadcasterController | null>(null);
  const suspendedByAppSwitchRef = useRef<{ video: boolean; audio: boolean } | null>(null);
  const audioEnabledRef = useRef<boolean>(initialAudioEnabled);
  const videoEnabledRef = useRef<boolean>(true);
  const facingModeRef = useRef<'environment' | 'user'>('environment');
  const autoReleaseRef = useRef<boolean>(isMobileBrowser());

  const [status, setStatus] = useState<'starting' | 'live' | 'error' | 'stopping'>('starting');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(initialAudioEnabled);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(true);
  const [autoReleaseOnSwitch, setAutoReleaseOnSwitch] = useState<boolean>(() => isMobileBrowser());
  const [isTogglingAudio, setIsTogglingAudio] = useState<boolean>(false);
  const [isTogglingVideo, setIsTogglingVideo] = useState<boolean>(false);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [caption, setCaption] = useState<string>(`نقل مباشر للتقييم — ${comp.name}`);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState<boolean>(false);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    autoReleaseRef.current = autoReleaseOnSwitch;
  }, [autoReleaseOnSwitch]);

  const liveShareCfg = ensureLiveShareConfig(comp);
  const liveUrl = buildCompetitionLiveUrl(comp.id, liveShareCfg.token);

  const attachPreviewStream = useCallback((stream: MediaStream | null) => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream && stream.getVideoTracks().length > 0) {
      el.play().catch(() => {});
    }
  }, []);

  // إيقاف كامل ونظيف للكاميرا والميكروفون والبث السحابي
  const stopAndClose = useCallback(async () => {
    setStatus('stopping');
    suspendedByAppSwitchRef.current = null;
    const ctrl = controllerRef.current;
    controllerRef.current = null;
    if (ctrl) {
      await ctrl.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    attachPreviewStream(null);
    showToast?.('تم إغلاق الكاميرا وإنهاء البث المباشر وعودة شاشة المؤشرات للمتابعين.', 'info');
    onClose();
  }, [attachPreviewStream, onClose, showToast]);

  // الحصول على مسار الفيديو فقط
  const acquireVideoTrack = useCallback(
    async (preferredFacing: 'environment' | 'user'): Promise<MediaStreamTrack> => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'المتصفح الحالي لا يدعم الوصول إلى الكاميرا (تأكد من فتح التطبيق عبر رابط آمن HTTPS).'
        );
      }

      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: preferredFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      let lastErr: any = null;
      for (const constraints of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(constraints);
          const track = s.getVideoTracks()[0];
          if (track) return track;
        } catch (err: any) {
          lastErr = err;
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            throw new Error(
              'تم رفض صلاحية الكاميرا. يُرجى السماح بالوصول للكاميرا من إعدادات المتصفح ثم المحاولة مجدداً.'
            );
          }
        }
      }

      throw new Error(
        lastErr?.message ||
          'تعذر تشغيل الكاميرا. تأكد من عدم استخدامها حالياً في تطبيق آخر.'
      );
    },
    []
  );

  // الحصول على مسار الصوت فقط بإعدادات لا تجبر الهاتف على وضع المكالمات الصوتية
  const acquireAudioTrack = useCallback(async (): Promise<MediaStreamTrack | null> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return null;
    }
    const attempts: MediaStreamConstraints[] = [
      { video: false, audio: NON_INTRUSIVE_AUDIO_CONSTRAINTS },
      { video: false, audio: true },
    ];
    for (const constraints of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        const track = s.getAudioTracks()[0];
        if (track) return track;
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          throw new Error(
            'تم رفض صلاحية الميكروفون. يُرجى السماح بالوصول للميكروفون من إعدادات المتصفح.'
          );
        }
      }
    }
    return null;
  }, []);

  // ربط مستمع إنهاء المسار (في حال قام تطبيق آخر في الهاتف بسحب الكاميرا أو الميكروفون)
  const bindExternalEndHandler = useCallback(
    (track: MediaStreamTrack, kind: 'video' | 'audio') => {
      track.onended = () => {
        if (!controllerRef.current) return;
        if (kind === 'video') {
          if (videoEnabledRef.current) {
            setVideoEnabled(false);
            controllerRef.current.replaceTrack('video', null).catch(() => {});
          }
        } else {
          if (audioEnabledRef.current) {
            setAudioEnabled(false);
            controllerRef.current.replaceTrack('audio', null).catch(() => {});
          }
        }
      };
    },
    []
  );

  // تشغيل الكاميرا (والميكروفون اختيارياً) وبدء البث فور فتح الشاشة
  const startBroadcast = useCallback(async () => {
    setStatus('starting');
    setErrorMessage('');
    try {
      onEnsureLinkEnabled?.();

      const combinedStream = new MediaStream();
      const videoTrack = await acquireVideoTrack(facingModeRef.current);
      bindExternalEndHandler(videoTrack, 'video');
      combinedStream.addTrack(videoTrack);

      let gotAudio = false;
      if (initialAudioEnabled) {
        try {
          const audioTrack = await acquireAudioTrack();
          if (audioTrack) {
            bindExternalEndHandler(audioTrack, 'audio');
            combinedStream.addTrack(audioTrack);
            gotAudio = true;
          }
        } catch {
          // في حال رفض الميكروفون أو عدم وجوده نكمل البث المرئي بسلاسة
          gotAudio = false;
        }
      }

      streamRef.current = combinedStream;
      setVideoEnabled(true);
      setAudioEnabled(gotAudio);
      attachPreviewStream(combinedStream);

      const controller = new LiveBroadcasterController(comp.id, combinedStream, {
        caption,
        audioEnabled: gotAudio,
        videoEnabled: true,
        onViewerCountChange: count => setViewerCount(count),
      });
      controllerRef.current = controller;
      await controller.start();

      setElapsedSec(0);
      setStatus('live');
      showToast?.(
        gotAudio
          ? 'بدأ البث المباشر بالصوت والصورة! يظهر البث الآن عبر رابط المتابعة.'
          : 'بدأ البث المرئي المباشر (صورة فقط بدون ميكروفون — دون أي تأثير على صوت الهاتف).',
        'success'
      );
    } catch (err: any) {
      console.error('Failed to start live broadcast:', err);
      setErrorMessage(
        err?.message || 'تعذر بدء البث المباشر. يُرجى التأكد من صلاحية الكاميرا.'
      );
      setStatus('error');
    }
  }, [
    acquireAudioTrack,
    acquireVideoTrack,
    attachPreviewStream,
    bindExternalEndHandler,
    caption,
    comp.id,
    initialAudioEnabled,
    onEnsureLinkEnabled,
    showToast,
  ]);

  useEffect(() => {
    startBroadcast();

    const handlePageExit = () => {
      const ctrl = controllerRef.current;
      if (ctrl) {
        ctrl.stop().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
    window.addEventListener('beforeunload', handlePageExit);
    window.addEventListener('pagehide', handlePageExit);

    return () => {
      window.removeEventListener('beforeunload', handlePageExit);
      window.removeEventListener('pagehide', handlePageExit);
      handlePageExit();
    };
    // تشغيل مرة واحدة عند فتح الشاشة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحرير الكاميرا والميكروفون تلقائياً عند الانتقال لتطبيق آخر في الهاتف، واستئنافهما فور العودة
  useEffect(() => {
    if (status !== 'live') return;

    const handleVisibilityChange = async () => {
      const ctrl = controllerRef.current;
      if (!ctrl) return;

      if (document.visibilityState === 'hidden') {
        if (!autoReleaseRef.current) return;
        const hadVideo = videoEnabledRef.current;
        const hadAudio = audioEnabledRef.current;
        if (!hadVideo && !hadAudio) return;

        suspendedByAppSwitchRef.current = { video: hadVideo, audio: hadAudio };

        if (hadVideo) {
          setVideoEnabled(false);
          await ctrl.replaceTrack('video', null).catch(() => {});
        }
        if (hadAudio) {
          setAudioEnabled(false);
          await ctrl.replaceTrack('audio', null).catch(() => {});
        }
        attachPreviewStream(null);
      } else if (document.visibilityState === 'visible') {
        const snapshot = suspendedByAppSwitchRef.current;
        if (!snapshot) return;
        suspendedByAppSwitchRef.current = null;

        const stream = streamRef.current || new MediaStream();
        streamRef.current = stream;

        if (snapshot.video) {
          try {
            const vTrack = await acquireVideoTrack(facingModeRef.current);
            bindExternalEndHandler(vTrack, 'video');
            await ctrl.replaceTrack('video', vTrack);
            setVideoEnabled(true);
            attachPreviewStream(stream);
          } catch {
            setVideoEnabled(false);
          }
        }
        if (snapshot.audio) {
          try {
            const aTrack = await acquireAudioTrack();
            if (aTrack) {
              bindExternalEndHandler(aTrack, 'audio');
              await ctrl.replaceTrack('audio', aTrack);
              setAudioEnabled(true);
            }
          } catch {
            setAudioEnabled(false);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    acquireAudioTrack,
    acquireVideoTrack,
    attachPreviewStream,
    bindExternalEndHandler,
    status,
  ]);

  // ربط عنصر الفيديو بالبث عند تغير الحالة إلى live
  useEffect(() => {
    if (status === 'live' && videoEnabled && streamRef.current) {
      attachPreviewStream(streamRef.current);
    }
  }, [status, videoEnabled, attachPreviewStream]);

  // عداد زمن البث المباشر الحقيقي
  useEffect(() => {
    if (status !== 'live') return;
    const t = window.setInterval(() => {
      setElapsedSec(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [status]);

  // كتم الصوت يحرر الميكروفون فعلياً لبقية تطبيقات الهاتف، وإعادة تفعيله تعيد فتح الميكروفون بسلاسة
  const handleToggleAudio = async () => {
    const ctrl = controllerRef.current;
    if (!ctrl || status !== 'live' || isTogglingAudio) return;
    setIsTogglingAudio(true);
    try {
      if (audioEnabled) {
        await ctrl.replaceTrack('audio', null);
        setAudioEnabled(false);
        showToast?.(
          'تم إيقاف الميكروفون وتحرير الصوت بالكامل لبقية تطبيقات الهاتف.',
          'info'
        );
      } else {
        const nextAudio = await acquireAudioTrack();
        if (!nextAudio) {
          showToast?.('لم يتم العثور على ميكروفون متاح على هذا الجهاز.', 'error');
          return;
        }
        bindExternalEndHandler(nextAudio, 'audio');
        await ctrl.replaceTrack('audio', nextAudio);
        setAudioEnabled(true);
        showToast?.('تم تشغيل الميكروفون وإرساله للمتابعين.', 'success');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'تعذر تشغيل الميكروفون.', 'error');
    } finally {
      setIsTogglingAudio(false);
    }
  };

  // إيقاف الصورة يحرر عتاد الكاميرا فعلياً لبقية تطبيقات الهاتف، وإعادة تفعيله تعيد فتح الكاميرا بسلاسة
  const handleToggleVideo = async () => {
    const ctrl = controllerRef.current;
    if (!ctrl || status !== 'live' || isTogglingVideo) return;
    setIsTogglingVideo(true);
    try {
      if (videoEnabled) {
        await ctrl.replaceTrack('video', null);
        setVideoEnabled(false);
        attachPreviewStream(null);
        showToast?.(
          'تم إيقاف الكاميرا وتحريرها بالكامل لتتمكن التطبيقات الأخرى من استخدامها.',
          'info'
        );
      } else {
        const nextVideo = await acquireVideoTrack(facingModeRef.current);
        bindExternalEndHandler(nextVideo, 'video');
        await ctrl.replaceTrack('video', nextVideo);
        setVideoEnabled(true);
        if (streamRef.current) {
          attachPreviewStream(streamRef.current);
        }
        showToast?.('تم إعادة تشغيل الكاميرا بنجاح.', 'success');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'تعذر إعادة تشغيل الكاميرا.', 'error');
    } finally {
      setIsTogglingVideo(false);
    }
  };

  const handleSwitchCamera = async () => {
    const ctrl = controllerRef.current;
    if (!ctrl || isSwitchingCamera || status !== 'live' || !videoEnabled) return;
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setIsSwitchingCamera(true);
    try {
      // نحرر الكاميرا الحالية أولاً قبل فتح الأخرى (مطلوب في أغلب الهواتف الذكية)
      await ctrl.replaceTrack('video', null);
      const nextVideo = await acquireVideoTrack(nextFacing);
      bindExternalEndHandler(nextVideo, 'video');
      setFacingMode(nextFacing);
      await ctrl.replaceTrack('video', nextVideo);
      if (streamRef.current) {
        attachPreviewStream(streamRef.current);
      }
      showToast?.(
        nextFacing === 'environment'
          ? 'تم التبديل إلى الكاميرا الخلفية'
          : 'تم التبديل إلى الكاميرا الأمامية',
        'info'
      );
    } catch {
      // استعادة الكاميرا السابقة في حال عدم توفر كاميرا بديلة
      try {
        const fallbackVideo = await acquireVideoTrack(facingMode);
        bindExternalEndHandler(fallbackVideo, 'video');
        await ctrl.replaceTrack('video', fallbackVideo);
        if (streamRef.current) attachPreviewStream(streamRef.current);
      } catch {}
      showToast?.('لا توجد كاميرا بديلة متاحة على هذا الجهاز.', 'info');
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const handleUpdateCaption = async () => {
    if (controllerRef.current) {
      await controllerRef.current.updateCaption(caption);
      showToast?.('تم تحديث عنوان البث المباشر على شاشة المتابعين.', 'success');
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopiedLink(true);
      showToast?.('تم نسخ رابط البث المباشر!', 'success');
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast?.('تعذر نسخ الرابط تلقائياً.', 'error');
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] bg-[#060C18] text-white flex flex-col overflow-hidden"
    >
      {/* الشريط العلوي فوق الكاميرا — يعرض اسم المسابقة بالكامل وعدد المتصلين بوضوح على الهاتف والحاسوب */}
      <div className="relative z-20 px-3 sm:px-6 py-2.5 sm:py-3 bg-[#09152C]/95 border-b border-[#D4AF37]/35 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* اسم المسابقة بالكامل في رأس شاشة الكاميرا */}
          <h2 className="text-sm sm:text-base font-black text-white leading-snug break-words">
            {comp.name}
          </h2>

          {/* شارة البث المباشر + المدة + عدد المتصلين */}
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              <span
                className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-black inline-flex items-center gap-1 shrink-0 whitespace-nowrap ${
                  status === 'live'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                <Radio
                  size={13}
                  className={status === 'live' ? 'animate-pulse shrink-0' : 'shrink-0'}
                />
                <span>{status === 'live' ? 'بث مباشر' : 'جارٍ التجهيز'}</span>
              </span>

              <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-[11px] sm:text-xs font-mono font-black text-slate-200 tabular-nums shrink-0 whitespace-nowrap">
                {formatDuration(elapsedSec)}
              </span>

              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[11px] sm:text-xs font-black text-emerald-200 inline-flex items-center gap-1 tabular-nums shrink-0 whitespace-nowrap">
                <Users size={13} className="shrink-0 text-emerald-300" />
                <span>المتصلون: {viewerCount}</span>
              </span>
            </div>

            {/* زر إغلاق مدمج لشاشة الهاتف حتى لا يزاحم عدد المتصلين */}
            <button
              type="button"
              onClick={stopAndClose}
              disabled={status === 'stopping'}
              className="sm:hidden min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-[11px] inline-flex items-center justify-center gap-1 shadow border border-rose-400/50 cursor-pointer shrink-0 whitespace-nowrap transition"
              title="إغلاق الكاميرا وإنهاء البث والعودة لعرض المؤشرات"
            >
              <X size={15} className="shrink-0" />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        {/* زر الإغلاق العلوي لشاشات الحاسوب والأجهزة اللوحية */}
        <button
          type="button"
          onClick={stopAndClose}
          disabled={status === 'stopping'}
          className="hidden sm:inline-flex min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-sm items-center justify-center gap-1.5 shadow-lg border border-rose-400/50 cursor-pointer shrink-0 whitespace-nowrap transition"
          title="إغلاق الكاميرا وإنهاء البث والعودة لعرض المؤشرات"
        >
          <X size={18} className="shrink-0" />
          <span>إغلاق الكاميرا</span>
        </button>
      </div>

      {/* مساحة عرض الكاميرا الحية */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain transition-opacity duration-300 ${
            facingMode === 'user' ? '-scale-x-100' : ''
          } ${videoEnabled && status === 'live' ? 'opacity-100' : 'opacity-15'}`}
        />

        {/* حالة إيقاف الصورة مؤقتاً مع تحرير الكاميرا لبقية التطبيقات */}
        {status === 'live' && !videoEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/90 border border-white/15 flex items-center justify-center text-amber-300">
              <VideoOff size={30} />
            </div>
            <p className="text-sm sm:text-base font-black text-white">
              {audioEnabled
                ? 'الكاميرا متوقفة ومحرّرة لبقية التطبيقات (البث الصوتي مستمر)'
                : 'الكاميرا والميكروفون محرّران بالكامل لبقية تطبيقات الهاتف'}
            </p>
          </div>
        )}

        {/* حالة بدء التشغيل */}
        {status === 'starting' && (
          <div className="absolute inset-0 bg-[#060C18]/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#09152C] border border-[#D4AF37]/50 text-[#D4AF37] flex items-center justify-center">
              <Camera size={28} className="animate-pulse" />
            </div>
            <div className="text-base sm:text-lg font-black">
              {initialAudioEnabled
                ? 'جارٍ تشغيل الكاميرا والميكروفون وبدء البث المباشر...'
                : 'جارٍ تشغيل الكاميرا (صورة فقط بدون ميكروفون)...'}
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-400 max-w-md">
              يُرجى الموافقة على إذن الكاميرا عند ظهور نافذة المتصفح.
            </p>
          </div>
        )}

        {/* حالة خطأ صلاحية الكاميرا */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-[#060C18]/95 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-700 text-rose-300 flex items-center justify-center">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-lg font-black text-white">تعذر تشغيل الكاميرا</h3>
              <p className="text-xs sm:text-sm font-bold text-slate-300 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={startBroadcast}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center gap-2 cursor-pointer transition"
              >
                <RefreshCw size={16} />
                <span>إعادة المحاولة</span>
              </button>
              <button
                type="button"
                onClick={stopAndClose}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-black text-sm flex items-center gap-2 cursor-pointer transition"
              >
                <X size={16} />
                <span>إغلاق والعودة</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* شريط التحكم السفلي المباشر */}
      <div className="relative z-20 bg-[#09152C]/95 border-t border-[#D4AF37]/35 px-3 sm:px-6 py-3 space-y-2.5">
        {/* عنوان البث + خيار التحرير التلقائي لعتاد الهاتف عند مغادرة التطبيق */}
        {status === 'live' && (
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="عنوان البث الظاهر للمتابعين (مثال: نقل مباشر — تقييم المستوى الأول)"
                className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs sm:text-sm font-bold text-white placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="button"
                onClick={handleUpdateCaption}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#c5a02f] text-[#09152C] font-black text-xs transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                تحديث العنوان
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAutoReleaseOnSwitch(prev => !prev)}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap ${
                autoReleaseOnSwitch
                  ? 'bg-emerald-900/60 border-emerald-500/60 text-emerald-200'
                  : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
              title="عند التفعيل، يتم تحرير الكاميرا والميكروفون فوراً عند انتقالك لتطبيق آخر على الهاتف ثم استئنافهما تلقائياً عند العودة"
            >
              <ShieldCheck size={15} className="shrink-0" />
              <span>
                {autoReleaseOnSwitch
                  ? 'تحرير تلقائي للتطبيقات الأخرى: مفعّل'
                  : 'تحرير تلقائي للتطبيقات الأخرى: متوقف'}
              </span>
            </button>
          </div>
        )}

        {/* أزرار التحكم الرئيسية — متناسقة للهاتف (شبكة عمودين + زر إغلاق عريض) وللحاسوب (شريط أفقي) */}
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleToggleAudio}
            disabled={status !== 'live' || isTogglingAudio}
            className={`min-h-[46px] px-3 sm:px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer border whitespace-nowrap ${
              audioEnabled
                ? 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500'
            } disabled:opacity-40`}
            title="إيقاف الصوت يحرر الميكروفون فعلياً لبقية تطبيقات الهاتف"
          >
            {audioEnabled ? <Mic size={17} className="shrink-0" /> : <MicOff size={17} className="shrink-0" />}
            <span className="truncate">
              {isTogglingAudio
                ? 'جارٍ التحديث...'
                : audioEnabled
                ? 'الميكروفون يعمل'
                : 'بدون ميكروفون (محرّر)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleVideo}
            disabled={status !== 'live' || isTogglingVideo}
            className={`min-h-[46px] px-3 sm:px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer border whitespace-nowrap ${
              videoEnabled
                ? 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500'
            } disabled:opacity-40`}
            title="إيقاف الصورة يحرر الكاميرا فعلياً لبقية تطبيقات الهاتف"
          >
            {videoEnabled ? <Video size={17} className="shrink-0" /> : <VideoOff size={17} className="shrink-0" />}
            <span className="truncate">
              {isTogglingVideo
                ? 'جارٍ التحديث...'
                : videoEnabled
                ? 'الكاميرا تعمل'
                : 'الكاميرا محرّرة'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSwitchCamera}
            disabled={status !== 'live' || isSwitchingCamera || !videoEnabled}
            className="min-h-[46px] px-3 sm:px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            <SwitchCamera size={17} className="shrink-0" />
            <span className="truncate">تبديل الكاميرا</span>
          </button>

          <button
            type="button"
            onClick={handleCopyUrl}
            className="min-h-[46px] px-3 sm:px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap"
          >
            {copiedLink ? <Check size={17} className="shrink-0" /> : <Copy size={17} className="shrink-0" />}
            <span className="truncate">{copiedLink ? 'تم نسخ الرابط' : 'نسخ رابط المشاهدة'}</span>
          </button>

          {/* زر إنهاء البث وإغلاق الكاميرا الرئيسي */}
          <button
            type="button"
            onClick={stopAndClose}
            disabled={status === 'stopping'}
            className="col-span-2 sm:col-span-1 min-h-[48px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg border border-rose-400/50 transition cursor-pointer whitespace-nowrap"
          >
            <X size={18} className="shrink-0" />
            <span>
              {status === 'stopping'
                ? 'جارٍ الإغلاق...'
                : 'إغلاق الكاميرا وإنهاء البث'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveBroadcastStudio;
