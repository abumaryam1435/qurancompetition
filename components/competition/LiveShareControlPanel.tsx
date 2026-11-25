import React, { useState, useEffect } from 'react';
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Monitor,
  Power,
  RefreshCw,
  Send,
  Trophy,
  Video,
} from 'lucide-react';
import { Competition, CompetitionLiveShareConfig } from '../../types';
import {
  buildCameraWhatsAppShareUrl,
  buildCompetitionCameraUrl,
  buildCompetitionLiveUrl,
  buildWhatsAppShareUrl,
  ensureLiveShareConfig,
  generateLiveShareToken,
} from '../../utils/liveShareUrl';

interface LiveShareControlPanelProps {
  comp: Competition;
  onUpdate: (updated: Competition) => void;
  onPreview: (compId: string, token: string) => void;
  onStartBroadcast?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

/**
 * لوحة تحكم المشرف المنسقة للهاتف والحاسوب لإدارة:
 * 1) رابط الداشبورد والمتابعة المباشرة لمدير الأوقاف وشاشات العرض
 * 2) البث المباشر بالصوت والصورة ورابط التحكم في الكاميرا عن بُعد (لإرساله لشخص داخل قاعة التقييم)
 */
export const LiveShareControlPanel: React.FC<LiveShareControlPanelProps> = ({
  comp,
  onUpdate,
  onPreview,
  onStartBroadcast,
  showToast,
  compact = false,
}) => {
  const config = ensureLiveShareConfig(comp);
  const [customSubtitle, setCustomSubtitle] = useState<string>(config.customSubtitle || '');
  const [copiedDashboard, setCopiedDashboard] = useState(false);
  const [copiedCamera, setCopiedCamera] = useState(false);

  useEffect(() => {
    setCustomSubtitle(comp.liveShare?.customSubtitle || '');
  }, [comp.id, comp.liveShare?.customSubtitle]);

  const liveUrl = buildCompetitionLiveUrl(comp.id, config.token);
  const whatsappDashboardUrl = buildWhatsAppShareUrl(comp.name, comp.seasonText, liveUrl);

  const cameraToken = config.cameraToken || generateLiveShareToken(12);
  const cameraLinkEnabled = config.cameraLinkEnabled !== false;
  const cameraUrl = buildCompetitionCameraUrl(comp.id, cameraToken);
  const whatsappCameraUrl = buildCameraWhatsAppShareUrl(comp.name, comp.seasonText, cameraUrl);

  const commitConfig = (
    partial: Partial<CompetitionLiveShareConfig>,
    toastMessage?: string,
    toastType: 'success' | 'info' = 'success'
  ) => {
    const nextConfig: CompetitionLiveShareConfig = {
      ...config,
      cameraToken,
      cameraLinkEnabled,
      ...partial,
      updatedAt: Date.now(),
    };
    onUpdate({
      ...comp,
      liveShare: nextConfig,
    });
    if (toastMessage) {
      showToast?.(toastMessage, toastType);
    }
  };

  // حفظ cameraToken تلقائياً في السحابة إذا كان قديماً لم يتولد له رمز كاميرا بعد عند أي تفاعل
  const ensureCameraTokenSaved = () => {
    if (!comp.liveShare?.cameraToken) {
      commitConfig({ cameraToken, cameraLinkEnabled: true });
    }
  };

  const handleToggleEnabled = (nextEnabled: boolean) => {
    if (nextEnabled === config.enabled && comp.liveShare?.token && comp.liveShare?.cameraToken) {
      return;
    }
    commitConfig(
      { enabled: nextEnabled, token: config.token, cameraToken },
      nextEnabled
        ? 'تم تفعيل رابط المتابعة المباشرة بنجاح! يمكن الآن إرساله لمدير الأوقاف أو فتحه على شاشات العرض.'
        : 'تم إيقاف رابط المتابعة المباشرة مؤقتاً. لن يعرض الرابط أي بيانات حتى إعادة التفعيل.',
      nextEnabled ? 'success' : 'info'
    );
  };

  const handleToggleCameraLink = (nextEnabled: boolean) => {
    commitConfig(
      { cameraLinkEnabled: nextEnabled, cameraToken },
      nextEnabled
        ? 'تم تفعيل رابط تشغيل الكاميرا عن بُعد! يمكن للشخص في القاعة الآن فتح الكاميرا ليظهر البث في الداشبورد.'
        : 'تم إيقاف رابط الكاميرا عن بُعد مؤقتاً ولن يتمكن حامله من بدء البث حتى إعادة التفعيل.',
      nextEnabled ? 'success' : 'info'
    );
  };

  const handleToggleTopPerformers = () => {
    const next = !config.showTopPerformers;
    commitConfig(
      { showTopPerformers: next },
      next
        ? 'تم تفعيل إظهار أسماء الأوائل في شاشة المتابعة المباشرة.'
        : 'تم إخفاء أسماء الأوائل من شاشة المتابعة (تظهر الإحصائيات والرسوم البيانية فقط).',
      'info'
    );
  };

  const handleChangeTopCount = (count: number) => {
    commitConfig(
      { topPerformersCount: count },
      `تم ضبط عرض أعلى ${count} متسابقين في كل مستوى.`
    );
  };

  const handleSaveSubtitle = () => {
    commitConfig(
      { customSubtitle: customSubtitle.trim() },
      'تم حفظ العنوان الفرعي لشاشة المتابعة المباشرة.'
    );
  };

  const handleRegenerateDashboardToken = () => {
    const freshToken = generateLiveShareToken(12);
    commitConfig(
      { token: freshToken },
      'تم توليد رابط داشبورد جديد وإلغاء صلاحية الرابط السابق فوراً.',
      'info'
    );
  };

  const handleRegenerateCameraToken = () => {
    const freshCamToken = generateLiveShareToken(12);
    commitConfig(
      { cameraToken: freshCamToken, cameraLinkEnabled: true },
      'تم توليد رابط كاميرا جديد وإلغاء صلاحية رابط الكاميرا السابق فوراً.',
      'info'
    );
  };

  const copyTextToClipboard = async (
    text: string,
    onDone: () => void,
    successMsg: string
  ) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      onDone();
      showToast?.(successMsg, 'success');
    } catch {
      showToast?.('تعذر النسخ التلقائي، يمكنك تحديد الرابط ونسخه يدوياً.', 'error');
    }
  };

  const handleCopyDashboardLink = () => {
    if (!comp.liveShare?.token) {
      commitConfig({ token: config.token, cameraToken });
    }
    copyTextToClipboard(
      liveUrl,
      () => {
        setCopiedDashboard(true);
        window.setTimeout(() => setCopiedDashboard(false), 2200);
      },
      'تم نسخ رابط المتابعة المباشرة (الداشبورد) إلى الحافظة!'
    );
  };

  const handleCopyCameraLink = () => {
    ensureCameraTokenSaved();
    copyTextToClipboard(
      cameraUrl,
      () => {
        setCopiedCamera(true);
        window.setTimeout(() => setCopiedCamera(false), 2200);
      },
      'تم نسخ رابط تشغيل الكاميرا عن بُعد! أرسله للشخص الموجود في قاعة التقييم.'
    );
  };

  return (
    <div
      className={`rounded-2xl border-2 transition-colors ${
        config.enabled
          ? 'border-[#D4AF37]/80 bg-gradient-to-br from-[#09152C]/[0.03] via-white to-amber-50/45 dark:from-slate-900 dark:via-slate-900 dark:to-[#0F1F3D]/80'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70'
      } ${compact ? 'p-3 sm:p-4 space-y-3.5' : 'p-3.5 sm:p-5 space-y-4 sm:space-y-5'}`}
    >
      {/* العنوان وحالة رابط المتابعة */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-sm sm:text-base font-black text-[#09152C] dark:text-[#F3E5AB] flex items-center gap-2 leading-snug">
            <Monitor size={18} className="text-amber-600 dark:text-[#D4AF37] shrink-0" />
            <span>روابط المتابعة المباشرة والبث الحي</span>
          </h3>
          <p className="text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
            أدر رابط لوحة المؤشرات (الداشبورد) المرسل للمسؤولين، وشغّل البث المباشر من جهازك أو أرسل رابط الكاميرا لشخص داخل القاعة.
          </p>
        </div>

        <span
          className={`self-start shrink-0 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-black whitespace-nowrap ${
            config.enabled
              ? 'bg-emerald-700 text-white'
              : 'bg-slate-500 text-white dark:bg-slate-700'
          }`}
        >
          {config.enabled ? 'الداشبورد مفعّل ✓' : 'الداشبورد متوقف'}
        </span>
      </div>

      {/* القسم 1: رابط الداشبورد لمدير الأوقاف وشاشات العرض */}
      <div className="p-3 sm:p-4 rounded-xl bg-white/95 dark:bg-slate-950/60 border border-slate-200/90 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-black text-[#09152C] dark:text-slate-100 flex items-center gap-1.5 leading-snug">
            <Link2 size={16} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>1. رابط الداشبورد (للمدير وشاشات العرض)</span>
          </span>
        </div>

        {/* أزرار التفعيل والإيقاف الفوري لرابط الداشبورد — متناسقة للهاتف */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleToggleEnabled(true)}
            className={`min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer border-2 ${
              config.enabled
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
            }`}
          >
            <Power size={15} className="shrink-0" />
            <span>تفعيل الرابط</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleEnabled(false)}
            className={`min-h-[44px] px-2.5 sm:px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer border-2 ${
              !config.enabled
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400'
            }`}
          >
            <Power size={15} className="shrink-0" />
            <span>إيقاف الرابط</span>
          </button>
        </div>

        {/* خانة الرابط + زر النسخ */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <input
            type="text"
            readOnly
            dir="ltr"
            value={liveUrl}
            onFocus={e => e.currentTarget.select()}
            className="w-full min-w-0 sm:flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900 font-mono text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 select-all"
          />

          <button
            type="button"
            onClick={handleCopyDashboardLink}
            className={`w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer shrink-0 ${
              copiedDashboard
                ? 'bg-emerald-600 text-white'
                : 'bg-[#09152C] hover:bg-[#132A52] text-[#F3E5AB]'
            }`}
          >
            {copiedDashboard ? <Check size={16} className="shrink-0" /> : <Copy size={16} className="shrink-0" />}
            <span>{copiedDashboard ? 'تم النسخ!' : 'نسخ رابط الداشبورد'}</span>
          </button>
        </div>

        {/* أزرار إجراءات الداشبورد: شبكة 2×2 مريحة للهاتف وصف أفقي للحاسوب */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
          <a
            href={whatsappDashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (!comp.liveShare?.token) commitConfig({ token: config.token, cameraToken });
            }}
            className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-2xs text-center leading-tight"
          >
            <Send size={14} className="shrink-0" />
            <span>إرسال واتساب</span>
          </a>

          <button
            type="button"
            onClick={() => onPreview(comp.id, config.token)}
            className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer shadow-2xs text-center leading-tight"
          >
            <Eye size={14} className="shrink-0" />
            <span>معاينة الشاشة</span>
          </button>

          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98] text-center leading-tight"
          >
            <ExternalLink size={14} className="shrink-0" />
            <span>فتح الرابط</span>
          </a>

          <button
            type="button"
            onClick={handleRegenerateDashboardToken}
            className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer text-center leading-tight"
            title="إنشاء رمز جديد لإلغاء صلاحية الرابط السابق"
          >
            <RefreshCw size={14} className="shrink-0" />
            <span>تجديد الرابط</span>
          </button>
        </div>
      </div>

      {/* القسم 2: البث المباشر بالصوت والصورة + رابط التحكم في الكاميرا عن بُعد */}
      <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-bl from-rose-50/85 via-white to-amber-50/45 dark:from-rose-950/30 dark:via-slate-950/70 dark:to-slate-900 border border-rose-200/90 dark:border-rose-900/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Camera size={19} />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                2. البث المباشر ورابط الكاميرا عن بُعد
              </div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                بث مباشرة من جهازك، أو أرسل «رابط الكاميرا» لشخص داخل القاعة لفتح الكاميرا من هاتفه فتظهر تلقائياً في الداشبورد.
              </div>
            </div>
          </div>

          {onStartBroadcast && (
            <button
              type="button"
              onClick={onStartBroadcast}
              className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-sm shrink-0"
            >
              <Video size={17} className="shrink-0" />
              <span>بث مباشر من جهازي الآن</span>
            </button>
          )}
        </div>

        {/* التحكم في رابط الكاميرا عن بُعد — أزرار تفعيل وإيقاف ونسخ وإرسال واضحة للهاتف */}
        <div className="pt-3 border-t border-rose-200/70 dark:border-rose-900/50 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-rose-950 dark:text-rose-200 flex items-center gap-1.5 leading-snug">
              <Video size={15} className="text-rose-600 dark:text-rose-400 shrink-0" />
              <span>رابط الكاميرا عن بُعد (لمصوّر القاعة):</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 whitespace-nowrap ${
                cameraLinkEnabled
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-500 text-white dark:bg-slate-700'
              }`}
            >
              {cameraLinkEnabled ? 'مفعّل ✓' : 'متوقف'}
            </span>
          </div>

          {/* أزرار تشغيل وإيقاف رابط الكاميرا بوضوح تام على الهاتف */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleToggleCameraLink(true)}
              className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer border-2 ${
                cameraLinkEnabled
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
              }`}
            >
              <Power size={14} className="shrink-0" />
              <span>تفعيل الكاميرا</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleCameraLink(false)}
              className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer border-2 ${
                !cameraLinkEnabled
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400'
              }`}
            >
              <Power size={14} className="shrink-0" />
              <span>إيقاف الكاميرا</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              type="text"
              readOnly
              dir="ltr"
              value={cameraUrl}
              onFocus={e => e.currentTarget.select()}
              className="w-full min-w-0 sm:flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 select-all"
            />

            <button
              type="button"
              onClick={handleCopyCameraLink}
              className={`w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer shrink-0 ${
                copiedCamera
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-700 hover:bg-rose-800 text-white'
              }`}
            >
              {copiedCamera ? <Check size={16} className="shrink-0" /> : <Copy size={16} className="shrink-0" />}
              <span>{copiedCamera ? 'تم النسخ!' : 'نسخ رابط الكاميرا'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2">
            <a
              href={whatsappCameraUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={ensureCameraTokenSaved}
              className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98] shadow-2xs text-center leading-tight"
            >
              <Send size={14} className="shrink-0" />
              <span>إرسال للمصور</span>
            </a>

            <a
              href={cameraUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={ensureCameraTokenSaved}
              className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98] text-center leading-tight"
            >
              <ExternalLink size={14} className="shrink-0" />
              <span>فتح الكاميرا</span>
            </a>

            <button
              type="button"
              onClick={handleRegenerateCameraToken}
              className="col-span-2 sm:col-span-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer text-center leading-tight"
              title="إنشاء رابط كاميرا جديد وإلغاء الرابط السابق"
            >
              <RefreshCw size={14} className="shrink-0" />
              <span>تجديد رابط الكاميرا</span>
            </button>
          </div>
        </div>
      </div>

      {/* القسم 3: خيارات العرض (أسماء الأوائل + العنوان الفرعي) */}
      <div className="p-3 sm:p-4 rounded-xl bg-white/95 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Trophy size={18} />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                إظهار أسماء الأوائل في شاشة الداشبورد (اختياري)
              </div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                عند الإيقاف تظهر الإحصائيات والرسوم البيانية فقط دون عرض أسماء المتسابقين.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleTopPerformers}
            className={`w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-[0.98] cursor-pointer shrink-0 border ${
              config.showTopPerformers
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            {config.showTopPerformers ? 'أسماء الأوائل ظاهرة ✓' : 'أسماء الأوائل مخفية'}
          </button>
        </div>

        {config.showTopPerformers && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              عدد الأوائل الظاهرين في كل مستوى:
            </span>
            <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
              {[3, 5, 10].map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleChangeTopCount(cnt)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-black transition active:scale-[0.98] cursor-pointer border ${
                    (config.topPerformersCount || 3) === cnt
                      ? 'bg-[#09152C] text-[#F3E5AB] border-[#D4AF37]'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  أول {cnt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={customSubtitle}
            onChange={e => setCustomSubtitle(e.target.value)}
            placeholder="عنوان فرعي اختياري للشاشة (مثال: متابعة التصفيات النهائية)"
            className="w-full min-w-0 sm:flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600"
          />
          <button
            type="button"
            onClick={handleSaveSubtitle}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-black transition active:scale-[0.98] cursor-pointer shrink-0"
          >
            حفظ العنوان
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveShareControlPanel;
