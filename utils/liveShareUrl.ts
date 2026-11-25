import { Competition, CompetitionLiveShareConfig } from '../types';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/**
 * توليد رمز سري عشوائي آمن وقصير ومناسب للروابط
 */
export function generateLiveShareToken(length: number = 12): string {
  const chars: string[] = [];
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]);
    }
  }
  return chars.join('');
}

/**
 * إنشاء رابط متابعة مباشر يعمل على جميع منصات الاستضافة الثابتة (Netlify / Vercel / GitHub Pages / غيرها)
 * باستخدام معاملات الاستعلام (?liveView=...&token=...) دون الحاجة لأي خادم خلفي.
 */
export function buildCompetitionLiveUrl(compId: string, token: string): string {
  if (typeof window === 'undefined') {
    return `?liveView=${encodeURIComponent(compId)}&token=${encodeURIComponent(token)}`;
  }
  const basePath =
    window.location.pathname && window.location.pathname !== '/index.html'
      ? window.location.pathname
      : '/';
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}`;
  return `${window.location.origin}${normalizedBase}?liveView=${encodeURIComponent(
    compId
  )}&token=${encodeURIComponent(token)}`;
}

export interface LiveViewUrlParams {
  competitionId: string;
  token: string;
}

/**
 * قراءة معاملات شاشة المتابعة المباشرة من عنوان URL (يدعم Query Params و Hash كخيار احتياطي)
 */
export function parseLiveViewParamsFromLocation(): LiveViewUrlParams | null {
  if (typeof window === 'undefined') return null;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const liveView = searchParams.get('liveView')?.trim();
    const token = searchParams.get('token')?.trim();
    if (liveView && token) {
      return { competitionId: liveView, token };
    }

    if (window.location.hash) {
      const hashBody = window.location.hash.replace(/^#\/?/, '');
      const hashQueryIdx = hashBody.indexOf('?');
      const hashParams = new URLSearchParams(
        hashQueryIdx >= 0 ? hashBody.slice(hashQueryIdx + 1) : hashBody
      );
      const hashLive = hashParams.get('liveView')?.trim();
      const hashToken = hashParams.get('token')?.trim();
      if (hashLive && hashToken) {
        return { competitionId: hashLive, token: hashToken };
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * بناء رسالة واتساب رسمية جاهزة لإرسال الرابط إلى مدير الأوقاف أو المسؤول الإداري
 */
export function buildWhatsAppShareUrl(
  compName: string,
  seasonText: string | undefined,
  liveUrl: string
): string {
  const lines = [
    'السلام عليكم ورحمة الله وبركاته،',
    `يسرّنا مشاركتكم رابط المتابعة المباشرة لسير لجان التحكيم والتقييم في:`,
    `*${compName}*`,
    ...(seasonText?.trim() ? [seasonText.trim()] : []),
    '',
    'يمكن فتح الرابط عبر الهاتف أو الحاسوب أو شاشة العرض الكبيرة للاطلاع المباشر على الإحصائيات والرسوم البيانية أولاً بأول:',
    liveUrl,
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * ضمان وجود إعدادات رابط متابعة صالحة للمسابقة عند التفعيل لأول مرة
 */
export function ensureLiveShareConfig(comp: Competition): CompetitionLiveShareConfig {
  const existing = comp.liveShare;
  return {
    enabled: Boolean(existing?.enabled),
    token: existing?.token && existing.token.trim().length >= 6
      ? existing.token.trim()
      : generateLiveShareToken(12),
    showTopPerformers: Boolean(existing?.showTopPerformers),
    topPerformersCount:
      Number(existing?.topPerformersCount) > 0
        ? Number(existing?.topPerformersCount)
        : 3,
    customSubtitle: existing?.customSubtitle || '',
    updatedAt: existing?.updatedAt || Date.now(),
  };
}
