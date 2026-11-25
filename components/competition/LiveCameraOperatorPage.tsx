import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Camera,
  Lock,
  MicOff,
  Moon,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sun,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Competition } from '../../types';
import { OfficialBannerCrestsBand } from './EvaluatorReportHeader';
import LiveBroadcastStudio from './LiveBroadcastStudio';
import {
  LiveBroadcastRoomDoc,
  isBroadcastRoomCurrentlyLive,
  subscribeToBroadcastRoom,
} from '../../utils/liveBroadcastWebRTC';

interface LiveCameraOperatorPageProps {
  competitionId: string;
  cameraToken: string;
  competitions: Competition[];
  isLoadingFirebase: boolean;
  firebaseConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'offline';
  darkMode: boolean;
  onToggleDarkMode: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * صفحة تشغيل الكاميرا عن بُعد (تُفتح عبر رابط الكاميرا المُرسل من المشرف لأي شخص داخل قاعة التقييم)
 * لا تتطلب تسجيل دخول مشرف، وتتيح فقط فتح وإغلاق كاميرا البث المباشر ليظهر في رابط الداشبورد.
 */
export const LiveCameraOperatorPage: React.FC<LiveCameraOperatorPageProps> = ({
  competitionId,
  cameraToken,
  competitions,
  isLoadingFirebase,
  firebaseConnectionStatus,
  darkMode,
  onToggleDarkMode,
  showToast,
}) => {
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [startWithAudio, setStartWithAudio] = useState<boolean>(true);
  const [broadcastRoom, setBroadcastRoom] = useState<LiveBroadcastRoomDoc | null>(null);

  const comp = useMemo(
    () => competitions.find(c => String(c.id) === String(competitionId)) || null,
    [competitions, competitionId]
  );

  useEffect(() => {
    if (comp?.name) {
      document.title = `التحكم في البث المباشر — ${comp.name}`;
    }
  }, [comp?.name]);

  useEffect(() => {
    if (!competitionId) return;
    const unsub = subscribeToBroadcastRoom(competitionId, room => {
      setBroadcastRoom(room);
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [competitionId]);

  const isCameraAuthorized = Boolean(
    comp &&
      comp.liveShare?.cameraToken &&
      comp.liveShare.cameraToken === cameraToken &&
      comp.liveShare.cameraLinkEnabled !== false
  );

  // في حال أوقف المشرف رابط الكاميرا أثناء البث نُغلق الكاميرا تلقائياً
  useEffect(() => {
    if (isCameraOpen && comp && !isCameraAuthorized) {
      setIsCameraOpen(false);
    }
  }, [isCameraOpen, comp, isCameraAuthorized]);

  const anotherDeviceBroadcasting = Boolean(
    !isCameraOpen && broadcastRoom && isBroadcastRoomCurrentlyLive(broadcastRoom)
  );

  // حالة التحميل الأولى
  if (!comp && isLoadingFirebase) {
    return (
      <div
        dir="rtl"
        className={`min-h-screen flex flex-col ${
          darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
        }`}
      >
        <OfficialBannerCrestsBand compactMobile={true} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#09152C] text-[#D4AF37] flex items-center justify-center shadow-lg">
            <RefreshCw size={28} className="animate-spin" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-black">جارٍ التحقق من رابط البث المباشر...</h1>
            <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
              يرجى الانتظار لحظات للاتصال ببيانات المسابقة
            </p>
          </div>
        </div>
      </div>
    );
  }

  // حالة إيقاف رابط الكاميرا أو تجديد الرمز من المشرف
  if (!comp || !isCameraAuthorized) {
    const isExplicitlyDisabled = Boolean(
      comp &&
        comp.liveShare?.cameraToken === cameraToken &&
        comp.liveShare?.cameraLinkEnabled === false
    );

    return (
      <div
        dir="rtl"
        className={`min-h-screen flex flex-col ${
          darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
        }`}
      >
        <div className="h-2.5 w-full bg-gradient-to-r from-[#09152C] via-[#1C3B70] to-[#09152C] border-b border-[#D4AF37]/70" />
        <OfficialBannerCrestsBand compactMobile={true} />

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div
            className={`max-w-lg w-full rounded-3xl border p-6 sm:p-8 text-center space-y-5 shadow-xl ${
              darkMode
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-white border-amber-200/80'
            }`}
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              {isExplicitlyDisabled ? <Lock size={30} /> : <ShieldAlert size={30} />}
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#09152C] dark:text-white">
                {isExplicitlyDisabled
                  ? 'تم إيقاف رابط تشغيل الكاميرا مؤقتاً'
                  : 'رابط تشغيل الكاميرا غير صالح أو تم تحديثه'}
              </h1>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                {isExplicitlyDisabled
                  ? `قام مشرف المسابقة بإيقاف صلاحية رابط الكاميرا لمسابقة «${comp?.name}» مؤقتاً. سيُتاح التشغيل فور إعادة التفعيل من المشرف.`
                  : 'هذا الرابط غير مفعّل أو تم تجديد رمزه الأمني من قِبل مشرف المسابقة. يُرجى طلب رابط الكاميرا المحدّث من المشرف.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // عند تشغيل الكاميرا نفتح شاشة البث الكاملة مع زر الإغلاق الواضح
  if (isCameraOpen) {
    return (
      <LiveBroadcastStudio
        comp={comp}
        initialAudioEnabled={startWithAudio}
        onClose={() => setIsCameraOpen(false)}
        showToast={showToast}
      />
    );
  }

  const resolvedSeason =
    comp.seasonText?.trim() || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م';

  return (
    <div
      dir="rtl"
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
      }`}
    >
      {/* الترويسة الرسمية الثلاثية */}
      <header className="w-full border-b-2 border-[#D4AF37]/75 shadow-sm">
        <div
          aria-hidden="true"
          className="h-2.5 w-full bg-gradient-to-r from-[#09152C] via-[#1C3B70] to-[#09152C] border-b border-[#D4AF37]/70"
        />
        <OfficialBannerCrestsBand compactMobile={true} />

        <div className="bg-gradient-to-l from-[#09152C] via-[#12284E] to-[#09152C] text-white px-4 py-3.5 sm:px-6">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-center sm:text-right space-y-0.5 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-black text-[#F3E5AB]">
                <Award size={15} className="text-[#D4AF37] shrink-0" />
                <span>{resolvedSeason}</span>
              </div>
              <h1 className="text-base sm:text-xl font-black text-white leading-snug break-words">
                {comp.name}
              </h1>
            </div>

            <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1.5">
                {firebaseConnectionStatus === 'connected' ? (
                  <>
                    <Wifi size={14} className="text-emerald-300" />
                    <span className="text-emerald-300 font-black">متصل</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={14} className="text-amber-300" />
                    <span className="text-amber-300 font-black">جارٍ الاتصال</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onToggleDarkMode}
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-[#F3E5AB] flex items-center justify-center cursor-pointer transition"
                aria-label={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
              >
                {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* بطاقة التحكم المركزية في الكاميرا — منسقة للهاتف والحاسوب */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div
          className={`max-w-xl w-full rounded-3xl border p-5 sm:p-8 space-y-6 shadow-xl ${
            darkMode
              ? 'bg-slate-900/90 border-slate-800'
              : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="text-center space-y-3">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-gradient-to-br from-rose-600 to-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-600/25">
              <Camera size={34} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-2xl font-black text-[#09152C] dark:text-white">
                وحدة التحكم في البث المباشر (كاميرا القاعة)
              </h2>
              <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                عند الضغط على زر تشغيل الكاميرا أدناه، سيتحول رابط الداشبورد لدى المسؤولين وشاشات العرض تلقائياً إلى البث المباشر بالصوت والصورة من جهازك، وعند إغلاق الكاميرا تعود شاشة المؤشرات والرسوم البيانية فوراً.
              </p>
            </div>
          </div>

          {/* تنبيه إذا كان رابط الداشبورد غير مفعّل بعد لدى المسؤولين */}
          {!comp.liveShare?.enabled && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold leading-relaxed ${
                darkMode
                  ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              ملاحظة: رابط الداشبورد الرئيسي متوقف مؤقتاً من قِبل المشرف حالياً؛ يمكنك تشغيل الكاميرا الآن وسيظهر البث فور تفعيل المشرف لرابط الداشبورد.
            </div>
          )}

          {/* تنبيه إذا كان هناك جهاز آخر يبث حالياً */}
          {anotherDeviceBroadcasting && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 ${
                darkMode
                  ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <Radio size={18} className="text-rose-600 dark:text-rose-400 shrink-0 animate-pulse" />
              <span>
                يوجد بث مباشر يعمل حالياً من جهاز آخر لهذه المسابقة. تشغيل الكاميرا من هنا سيستبدل مصدر البث بجهازك.
              </span>
            </div>
          )}

          {/* أزرار تشغيل الكاميرا (صوت وصورة أو صورة فقط بدون ميكروفون) */}
          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setStartWithAudio(true);
                setIsCameraOpen(true);
              }}
              className="w-full min-h-[54px] px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-rose-600/25 transition cursor-pointer"
            >
              <Video size={21} className="shrink-0" />
              <span>تشغيل الكاميرا وبدء البث المباشر (صوت وصورة)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStartWithAudio(false);
                setIsCameraOpen(true);
              }}
              className={`w-full min-h-[48px] px-5 py-2.5 rounded-2xl border font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-100'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              <MicOff size={17} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>بث صورة فقط (بدون ميكروفون — دون تأثير على صوت الهاتف)</span>
            </button>
          </div>

          {/* إرشادات مختصرة وواضحة للمصور */}
          <div
            className={`rounded-2xl border p-4 space-y-2 text-xs font-bold ${
              darkMode
                ? 'bg-slate-950/60 border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-200/80 text-slate-600'
            }`}
          >
            <div className="font-black text-slate-800 dark:text-slate-100">
              إرشادات سريعة أثناء البث:
            </div>
            <div className="space-y-1.5 leading-relaxed">
              <p>· عند كتم الميكروفون أو إيقاف الكاميرا أو الانتقال لتطبيق آخر في هاتفك، يتم تحرير الميكروفون والكاميرا فعلياً حتى تعمل التطبيقات الأخرى بحرية تامة، وتُستأنف فور عودتك.</p>
              <p>· يظهر على الشاشة زر أحمر واضح «إغلاق الكاميرا»؛ فور الضغط عليه يتوقف البث وتعود المؤشرات على رابط الداشبورد.</p>
              <p>· يُفضل تثبيت الهاتف بالوضع الأفقي (Landscape) للحصول على أفضل صورة على شاشات العرض الكبيرة.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-3 px-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 border-t border-slate-200/70 dark:border-slate-800/70">
        إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة · نظام البث المباشر عن بُعد
      </footer>
    </div>
  );
};

export default LiveCameraOperatorPage;
