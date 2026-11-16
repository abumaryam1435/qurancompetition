import React from 'react';
import { LogOut, Moon, Sun, WifiOff, Award, Users } from 'lucide-react';
import { Logo } from '../Logo';

const RIGHT_GOVERNORATE_LOGO_URL = '/dhahirah_gov_logo.png';
const CENTER_COMPETITION_LOGO_URL = '/dhahirah_comp_center.png';
const LEFT_AWQAF_LOGO_URL = '/awqaf_dark_transparent.png';

interface OfficialBannerCrestsBandProps {
  compactMobile?: boolean;
  className?: string;
}

/**
 * شريط الترويسة الثلاثي المفصول:
 * - أقصى اليمين: شعار محافظة الظاهرة
 * - الوسط: شعار واسم مسابقة محافظة الظاهرة للقرآن الكريم
 * - أقصى اليسار: شعار وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف بمحافظة الظاهرة
 * مع خلفية هندسية متصلة تتكيف مع شاشات الهواتف والحواسيب وتقارير الـ PDF
 */
export const OfficialBannerCrestsBand: React.FC<OfficialBannerCrestsBandProps> = ({
  compactMobile = false,
  className = '',
}) => {
  return (
    <div
      dir="rtl"
      className={`relative w-full overflow-hidden bg-gradient-to-b from-[#f8fcf8] via-[#f2f8f2] to-[#eaf3ea] border-b border-[#D4AF37]/55 ${className}`.trim()}
    >
      {/* خلفية هندسية إسلامية خفيفة ممتدة بكامل عرض الترويسة */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(15,35,71,0.045)_0px,rgba(15,35,71,0.045)_1px,transparent_1px,transparent_22px),repeating-linear-gradient(-45deg,rgba(15,35,71,0.045)_0px,rgba(15,35,71,0.045)_1px,transparent_1px,transparent_22px)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.68)_0%,transparent_72%)]"
      />

      {/* زخارف الزوايا الذهبية */}
      <svg
        aria-hidden="true"
        viewBox="0 0 36 36"
        className="pointer-events-none absolute top-1.5 right-1.5 sm:top-2.5 sm:right-3 w-5 h-5 sm:w-7 sm:h-7 text-[#B8860B]/40"
        fill="none"
      >
        <path
          d="M34 2H12C6.477 2 2 6.477 2 12v22"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M28 7H14a7 7 0 0 0-7 7v14"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 36 36"
        className="pointer-events-none absolute top-1.5 left-1.5 sm:top-2.5 sm:left-3 w-5 h-5 sm:w-7 sm:h-7 text-[#B8860B]/40 -scale-x-100"
        fill="none"
      >
        <path
          d="M34 2H12C6.477 2 2 6.477 2 12v22"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M28 7H14a7 7 0 0 0-7 7v14"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

      {/* توزيع الشعارات الثلاثة: يمين (أقصى اليمين) • وسط (متمركز) • يسار (أقصى اليسار) */}
      <div
        className={`relative z-10 w-full px-3 sm:px-6 md:px-10 lg:px-14 ${
          compactMobile ? 'py-2.5 sm:py-3.5 md:py-4' : 'py-3 sm:py-4 md:py-5'
        } grid grid-cols-2 sm:grid-cols-[1fr_minmax(0,1.7fr)_1fr] items-center gap-x-3 gap-y-2 sm:gap-4`}
      >
        {/* أقصى اليمين: شعار محافظة الظاهرة */}
        <div className="order-1 justify-self-start flex items-center justify-start">
          <img
            src={RIGHT_GOVERNORATE_LOGO_URL}
            alt="محافظة الظاهرة"
            crossOrigin="anonymous"
            className={`${
              compactMobile
                ? 'h-12 xs:h-14 sm:h-20 md:h-24'
                : 'h-14 xs:h-16 sm:h-24 md:h-28'
            } w-auto max-w-[130px] sm:max-w-[180px] object-contain select-none block`}
          />
        </div>

        {/* الوسط: شعار واسم مسابقة محافظة الظاهرة للقرآن الكريم */}
        <div className="order-3 sm:order-2 col-span-2 sm:col-span-1 justify-self-center flex flex-col items-center justify-center text-center w-full">
          <img
            src={CENTER_COMPETITION_LOGO_URL}
            alt="مسابقة محافظة الظاهرة للقرآن الكريم"
            crossOrigin="anonymous"
            className={`${
              compactMobile
                ? 'h-14 xs:h-16 sm:h-22 md:h-26'
                : 'h-16 xs:h-20 sm:h-24 md:h-28'
            } w-auto max-w-full sm:max-w-[440px] md:max-w-[500px] object-contain select-none block`}
          />
        </div>

        {/* أقصى اليسار: شعار وزارة الأوقاف والشؤون الدينية بمحافظة الظاهرة */}
        <div className="order-2 sm:order-3 justify-self-end flex items-center justify-end">
          <img
            src={LEFT_AWQAF_LOGO_URL}
            alt="وزارة الأوقاف والشؤون الدينية — إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
            crossOrigin="anonymous"
            className={`${
              compactMobile
                ? 'h-12 xs:h-14 sm:h-20 md:h-24'
                : 'h-14 xs:h-16 sm:h-24 md:h-28'
            } w-auto max-w-[145px] sm:max-w-[205px] object-contain select-none block`}
          />
        </div>
      </div>
    </div>
  );
};

interface OfficialReportMastheadProps {
  compName: string;
  seasonText?: string;
  maxWidthClass?: string;
  footerSlot?: React.ReactNode;
}

/**
 * ترويسة رأس الصفحة الرسمية الكاملة (تغطي عرض رأس الصفحة بالكامل مع خلفية الترويسة وشعاراتها المفصولة)
 * مستخدمة في صفحة المقيم وصفحة بدء تقييم المتسابق
 */
export const OfficialReportMasthead: React.FC<OfficialReportMastheadProps> = ({
  compName,
  seasonText,
  maxWidthClass = 'max-w-5xl',
  footerSlot,
}) => {
  const resolvedSeason =
    seasonText?.trim() || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م';

  return (
    <div
      dir="rtl"
      className="w-full bg-white dark:bg-slate-900 border-b-2 border-[#D4AF37]/80 shadow-[0_8px_28px_-10px_rgba(9,21,44,0.22)] dark:shadow-[0_12px_34px_-10px_rgba(0,0,0,0.65)] transition-colors duration-300"
    >
      {/* الشريط الزخرفي الملكي العلوي بكامل عرض الصفحة */}
      <div
        aria-hidden="true"
        className="h-2.5 sm:h-3.5 w-full bg-gradient-to-r from-[#09152C] via-[#1C3B70] to-[#09152C] border-b border-[#D4AF37]/75 flex items-center justify-between overflow-hidden px-2 sm:px-6"
      >
        {Array.from({ length: 34 }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#F3E5AB]/85 rotate-45 shrink-0"
          />
        ))}
      </div>

      {/* خلفية رأس الصفحة وشعاراتها الثلاثة المفصولة (يمين / وسط / يسار) */}
      <OfficialBannerCrestsBand compactMobile={true} />

      {/* شريط الموسم واسم المسابقة بتصميم كحلي وذهبي متمركز */}
      <div
        className={`relative w-full bg-gradient-to-l from-[#09152C] via-[#132A52] to-[#09152C] text-white px-3 py-2 sm:px-6 sm:py-2.5 ${
          footerSlot ? 'border-b border-[#D4AF37]/50' : ''
        } overflow-hidden`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.18),transparent_68%)]"
        />
        <div
          className={`relative ${maxWidthClass} mx-auto flex flex-col items-center justify-center text-center gap-0.5`}
        >
          <div className="flex items-center justify-center gap-2 sm:gap-3 w-full">
            <span
              aria-hidden="true"
              className="hidden sm:block h-px w-12 md:w-24 bg-gradient-to-l from-[#D4AF37]/80 to-transparent"
            />
            <span className="inline-flex items-center justify-center gap-1.5 text-[#F3E5AB] font-black text-xs xs:text-sm sm:text-base md:text-lg leading-snug text-balance">
              <Award
                size={15}
                className="text-[#D4AF37] shrink-0 hidden xs:inline"
              />
              <span>{resolvedSeason}</span>
            </span>
            <span
              aria-hidden="true"
              className="hidden sm:block h-px w-12 md:w-24 bg-gradient-to-r from-[#D4AF37]/80 to-transparent"
            />
          </div>

          <div className="text-[11px] sm:text-sm font-extrabold text-white/95 leading-snug break-words text-balance">
            {compName}
          </div>
        </div>
      </div>

      {footerSlot && (
        <div className="w-full bg-gradient-to-b from-amber-50/85 to-white dark:from-slate-900 dark:to-slate-950">
          <div className={`${maxWidthClass} mx-auto`}>{footerSlot}</div>
        </div>
      )}
    </div>
  );
};

interface EvaluatorReportHeaderProps {
  compName: string;
  seasonText?: string;
  evaluatorName: string;
  assignedScopeLabel?: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  isOnline?: boolean;
  onLogout: () => void;
}

export const EvaluatorReportHeader: React.FC<EvaluatorReportHeaderProps> = ({
  compName,
  seasonText,
  evaluatorName,
  assignedScopeLabel,
  theme = 'light',
  onToggleTheme,
  isOnline = true,
  onLogout,
}) => {
  const issueDateStr = new Date().toLocaleDateString('ar-OM', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header>
      <OfficialReportMasthead
        compName={compName}
        seasonText={seasonText}
        maxWidthClass="max-w-5xl"
        footerSlot={
          <div className="px-3 py-2.5 sm:px-6 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-right">
              <Logo size="sm" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug break-words">
                    المقيم: {evaluatorName}
                  </span>
                  {!isOnline && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-700 dark:text-amber-300">
                      <WifiOff size={13} className="shrink-0" />
                      <span>بدون اتصال بالشبكة</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                  {assignedScopeLabel && (
                    <span className="inline-flex items-center gap-1 text-[#1D427B] dark:text-[#9ABBE4] font-extrabold break-words">
                      <Users size={12} className="shrink-0" />
                      <span>{assignedScopeLabel}</span>
                    </span>
                  )}
                  {assignedScopeLabel && (
                    <span
                      aria-hidden="true"
                      className="text-slate-300 dark:text-slate-600"
                    >
                      •
                    </span>
                  )}
                  <span className="text-slate-500 dark:text-slate-400">
                    {issueDateStr}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-amber-200/70 dark:border-slate-800">
              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 transition active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer shadow-2xs"
                  title={
                    theme === 'light'
                      ? 'التبديل إلى الوضع الليلي'
                      : 'التبديل إلى الوضع النهاري'
                  }
                  aria-label={
                    theme === 'light'
                      ? 'التبديل إلى الوضع الليلي'
                      : 'التبديل إلى الوضع النهاري'
                  }
                >
                  {theme === 'light' ? (
                    <Moon size={17} className="shrink-0" />
                  ) : (
                    <Sun size={17} className="shrink-0" />
                  )}
                  <span className="hidden md:inline">
                    {theme === 'light' ? 'الوضع الليلي' : 'الوضع النهاري'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-black shrink-0 shadow-xs cursor-pointer"
                title="تسجيل الخروج"
              >
                <LogOut size={16} className="shrink-0" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        }
      />
    </header>
  );
};

export default EvaluatorReportHeader;
