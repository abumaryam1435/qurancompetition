import React, { useState, useEffect } from 'react';
import {
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
} from 'lucide-react';
import { Competition, CompetitionLiveShareConfig } from '../../types';
import {
  buildCompetitionLiveUrl,
  buildWhatsAppShareUrl,
  ensureLiveShareConfig,
  generateLiveShareToken,
} from '../../utils/liveShareUrl';

interface LiveShareControlPanelProps {
  comp: Competition;
  onUpdate: (updated: Competition) => void;
  onPreview: (compId: string, token: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

/**
 * لوحة تحكم المشرف لإدارة رابط المتابعة المباشرة لمدير الأوقاف والمسؤولين وشاشات العرض
 */
export const LiveShareControlPanel: React.FC<LiveShareControlPanelProps> = ({
  comp,
  onUpdate,
  onPreview,
  showToast,
  compact = false,
}) => {
  const config = ensureLiveShareConfig(comp);
  const [customSubtitle, setCustomSubtitle] = useState<string>(config.customSubtitle || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCustomSubtitle(comp.liveShare?.customSubtitle || '');
  }, [comp.id, comp.liveShare?.customSubtitle]);

  const liveUrl = buildCompetitionLiveUrl(comp.id, config.token);
  const whatsappUrl = buildWhatsAppShareUrl(comp.name, comp.seasonText, liveUrl);

  const commitConfig = (
    partial: Partial<CompetitionLiveShareConfig>,
    toastMessage?: string,
    toastType: 'success' | 'info' = 'success'
  ) => {
    const nextConfig: CompetitionLiveShareConfig = {
      ...config,
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

  const handleToggleEnabled = (nextEnabled: boolean) => {
    if (nextEnabled === config.enabled && comp.liveShare?.token) return;
    commitConfig(
      { enabled: nextEnabled, token: config.token },
      nextEnabled
        ? 'تم تفعيل رابط المتابعة المباشرة بنجاح! يمكن الآن إرساله لمدير الأوقاف أو فتحه على شاشات العرض.'
        : 'تم إيقاف رابط المتابعة المباشرة مؤقتاً. لن يعرض الرابط أي بيانات حتى إعادة التفعيل.',
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

  const handleRegenerateToken = () => {
    const freshToken = generateLiveShareToken(12);
    commitConfig(
      { token: freshToken },
      'تم توليد رابط جديد وإلغاء صلاحية الرابط السابق فوراً.',
      'info'
    );
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(liveUrl);
      } else {
        const input = document.createElement('textarea');
        input.value = liveUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      showToast?.('تم نسخ رابط المتابعة المباشرة إلى الحافظة!', 'success');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast?.('تعذر النسخ التلقائي، يمكنك تحديد الرابط ونسخه يدوياً.', 'error');
    }
  };

  return (
    <div
      className={`rounded-2xl border-2 transition-colors ${
        config.enabled
          ? 'border-[#D4AF37]/80 bg-gradient-to-br from-[#09152C]/[0.03] via-white to-amber-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-[#0F1F3D]/80'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/70'
      } ${compact ? 'p-4 space-y-4' : 'p-4 sm:p-5 space-y-4'}`}
    >
      {/* الرأس وحالة الرابط */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-black text-[#09152C] dark:text-[#F3E5AB] flex items-center gap-2">
            <Monitor size={19} className="text-amber-600 dark:text-[#D4AF37] shrink-0" />
            <span>رابط المتابعة المباشرة للإدارة وشاشات العرض (URL)</span>
          </h3>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
            رابط مباشر يُرسل لمدير الأوقاف أو أي مسؤول إداري لمتابعة تقدم التقييمات والرسوم البيانية وإحصائيات كل مستوى لحظياً على الهاتف أو الحاسوب أو شاشات العرض الكبيرة دون الحاجة لتسجيل الدخول.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-xs font-black ${
              config.enabled
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-500 text-white dark:bg-slate-700'
            }`}
          >
            {config.enabled ? 'الرابط مفعّل ✓' : 'الرابط متوقف'}
          </span>
        </div>
      </div>

      {/* أزرار التفعيل والإيقاف الفوري */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => handleToggleEnabled(true)}
          className={`min-h-[44px] px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border-2 ${
            config.enabled
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
          }`}
        >
          <Power size={16} />
          <span>تفعيل رابط المتابعة المباشرة</span>
        </button>

        <button
          type="button"
          onClick={() => handleToggleEnabled(false)}
          className={`min-h-[44px] px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border-2 ${
            !config.enabled
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400'
          }`}
        >
          <Power size={16} />
          <span>إيقاف الرابط مؤقتاً</span>
        </button>
      </div>

      {/* خيار إظهار أسماء الأوائل + العدد */}
      <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Trophy size={18} />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                إظهار أسماء الأوائل في شاشة المتابعة (اختياري)
              </div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                عند الإيقاف تظهر الإحصائيات ونسب الإنجاز والرسوم البيانية فقط دون عرض أسماء المتسابقين.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleTopPerformers}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 border ${
              config.showTopPerformers
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            {config.showTopPerformers ? 'أسماء الأوائل ظاهرة ✓' : 'أسماء الأوائل مخفية'}
          </button>
        </div>

        {config.showTopPerformers && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              عدد الأوائل الظاهرين في كل مستوى:
            </span>
            <div className="flex items-center gap-1.5">
              {[3, 5, 10].map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleChangeTopCount(cnt)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer border ${
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
      </div>

      {/* عنوان فرعي اختياري للعرض */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={customSubtitle}
          onChange={e => setCustomSubtitle(e.target.value)}
          placeholder="عنوان فرعي اختياري للشاشة (مثال: متابعة سير لجان التصفيات النهائية — ولاية عبري)"
          className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600"
        />
        <button
          type="button"
          onClick={handleSaveSubtitle}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-black transition cursor-pointer shrink-0"
        >
          حفظ العنوان
        </button>
      </div>

      {/* صندوق الرابط وأزرار النسخ والمشاركة والمعاينة */}
      <div className="space-y-2.5">
        <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Link2 size={15} className="text-emerald-700 dark:text-emerald-400" />
          <span>رابط المتابعة المباشرة الخاص بهذه المسابقة:</span>
        </label>

        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <input
            type="text"
            readOnly
            dir="ltr"
            value={liveUrl}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-950 font-mono text-xs text-slate-700 dark:text-slate-200 select-all"
          />

          <button
            type="button"
            onClick={handleCopyLink}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-[#09152C] hover:bg-[#132A52] text-[#F3E5AB]'
            }`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shadow-2xs"
          >
            <Send size={15} />
            <span>إرسال عبر واتساب للمسؤول</span>
          </a>

          <button
            type="button"
            onClick={() => onPreview(comp.id, config.token)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Eye size={15} />
            <span>معاينة شاشة العرض الآن</span>
          </button>

          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-black flex items-center justify-center gap-1.5 transition"
          >
            <ExternalLink size={15} />
            <span>فتح الرابط بصفحة مستقلة</span>
          </a>

          <button
            type="button"
            onClick={handleRegenerateToken}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            title="إنشاء رمز جديد لإلغاء صلاحية الرابط السابق"
          >
            <RefreshCw size={14} />
            <span>تجديد الرابط</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveShareControlPanel;
