import React, { useContext, useState } from 'react';
import { AppContext } from '../App';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const DEFAULT_COMPETITION_LOGO_URL = '/icon.svg';
export const OFFICIAL_AWQAF_LOGO_URL = '/assets/aistudio/________254c48a2.jpg';

interface LogoProps {
  className?: string;
  size?: LogoSize;
}

const SIZE_CLASSES: Record<LogoSize, string> = {
  xs: 'w-8 h-8 sm:w-9 sm:h-9',
  sm: 'w-9 h-9 sm:w-11 sm:h-11',
  md: 'w-11 h-11 sm:w-12 sm:h-12',
  lg: 'w-20 h-20 sm:w-24 sm:h-24',
  xl: 'w-24 h-24 sm:w-28 sm:h-28',
};

/**
 * الشعار الأساسي السابق للتطبيق (أيقونة المصحف والرحل الذهبية الدائرية)
 */
export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const context = useContext(AppContext);
  const customLogo = context?.customLogo;
  const [imgError, setImgError] = useState(false);

  const logoSrc = customLogo && !imgError ? customLogo : DEFAULT_COMPETITION_LOGO_URL;

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center rounded-full bg-[#0F2347] border-2 border-[#D4AF37] shadow-[0_3px_12px_rgba(212,175,55,0.28)] overflow-hidden transition-transform duration-200 select-none ${SIZE_CLASSES[size]} ${className}`.trim()}
      aria-label="شعار مسابقة القرآن الكريم"
      role="img"
    >
      <img
        src={logoSrc}
        alt="شعار مسابقة القرآن الكريم"
        onError={e => {
          if (customLogo && !imgError) {
            setImgError(true);
          } else {
            (e.currentTarget as HTMLImageElement).src = '/logo.png';
          }
        }}
        className="w-full h-full object-cover block"
      />
    </div>
  );
};

interface AwqafBadgeProps {
  variant?: 'login' | 'header' | 'compact';
  className?: string;
}

/**
 * شارة شعار وزارة الأوقاف والشؤون الدينية (إدارة الأوقاف بمحافظة الظاهرة) كإضافة أنيقة متجاوبة
 */
export const AwqafBadge: React.FC<AwqafBadgeProps> = ({
  variant = 'header',
  className = '',
}) => {
  const containerStyles =
    variant === 'login'
      ? 'h-10 sm:h-12 px-2.5 sm:px-3.5 py-1 rounded-xl border border-[#D4AF37]/80 bg-white shadow-sm'
      : variant === 'compact'
      ? 'h-7 sm:h-8 px-1.5 py-0.5 rounded-lg border border-[#D4AF37]/70 bg-white shadow-2xs'
      : 'h-8 sm:h-10 px-1.5 sm:px-2 py-0.5 rounded-lg sm:rounded-xl border border-[#D4AF37]/80 bg-white shadow-2xs';

  const imgStyles =
    variant === 'login'
      ? 'h-full w-auto max-w-[140px] sm:max-w-[170px]'
      : variant === 'compact'
      ? 'h-full w-auto max-w-[56px] sm:max-w-[72px]'
      : 'h-full w-auto max-w-[62px] sm:max-w-[84px]';

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden select-none ${containerStyles} ${className}`.trim()}
      title="وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
    >
      <img
        src={OFFICIAL_AWQAF_LOGO_URL}
        alt="إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
        className={`${imgStyles} object-contain block`}
      />
    </div>
  );
};

export default Logo;
