import React, { useContext, useState } from 'react';
import { AppContext } from '../App';

export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const DEFAULT_COMPETITION_LOGO_URL = '/icon.svg';
export const OFFICIAL_AWQAF_LOGO_URL = '/assets/aistudio/________254c48a2.jpg';
export const AWQAF_GOLD_TRANSPARENT_URL = '/awqaf_gold_transparent.png';
export const AWQAF_DARK_TRANSPARENT_URL = '/awqaf_dark_transparent.png';

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
  tone?: 'gold' | 'adaptive';
  className?: string;
}

/**
 * شعار وزارة الأوقاف والشؤون الدينية (إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة)
 * بدون خلفية بيضاء، مع بقاء الخنجر باللون الأحمر وخط المخطوطة الأصلي واضحاً باللون الذهبي الفاتح
 */
export const AwqafBadge: React.FC<AwqafBadgeProps> = ({
  variant = 'header',
  tone = 'gold',
  className = '',
}) => {
  if (variant === 'login') {
    return (
      <div
        className={`shrink-0 inline-flex items-center justify-center select-none bg-transparent ${className}`.trim()}
        title="وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
      >
        <img
          src={AWQAF_GOLD_TRANSPARENT_URL}
          alt="وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
          className="h-20 sm:h-24 w-auto max-w-[275px] sm:max-w-[330px] object-contain block drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
        />
      </div>
    );
  }

  const sizeStyles =
    variant === 'compact'
      ? 'h-8 sm:h-10 max-w-[76px] sm:max-w-[96px]'
      : 'h-9 sm:h-11 max-w-[84px] sm:max-w-[110px]';

  if (tone === 'adaptive') {
    return (
      <div
        className={`shrink-0 inline-flex items-center justify-center select-none bg-transparent ${className}`.trim()}
        title="وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
      >
        <img
          src={AWQAF_DARK_TRANSPARENT_URL}
          alt="إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
          className={`${sizeStyles} w-auto object-contain block dark:hidden`}
        />
        <img
          src={AWQAF_GOLD_TRANSPARENT_URL}
          alt="إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
          className={`${sizeStyles} w-auto object-contain hidden dark:block drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]`}
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center select-none bg-transparent ${className}`.trim()}
      title="وزارة الأوقاف والشؤون الدينية - إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
    >
      <img
        src={AWQAF_GOLD_TRANSPARENT_URL}
        alt="إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة"
        className={`${sizeStyles} w-auto object-contain block drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]`}
      />
    </div>
  );
};

export default Logo;
