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

function getBaseAppUrl(): string {
  if (typeof window === 'undefined') return '';
  const basePath =
    window.location.pathname && window.location.pathname !== '/index.html'
      ? window.location.pathname
      : '/';
  return `${window.location.origin}${basePath}`;
}

/**
 * إنشاء رابط لوحة المتابعة المباشرة (الداشبورد) لمدير الأوقاف وشاشات العرض
 * يعمل على جميع منصات الاستضافة الثابتة (Netlify / Vercel / GitHub Pages / غيرها).
 */
export function buildCompetitionLiveUrl(compId: string, token: string): string {
  const query = `?liveView=${encodeURIComponent(compId)}&token=${encodeURIComponent(token)}`;
  const base = getBaseAppUrl();
  return base ? `${base}${query}` : query;
}

/**
 * إنشاء رابط التحكم في كاميرا البث المباشر (يُرسل لأي شخص في قاعة التقييم ليفتح الكاميرا من جهازه)
 * يستخدم رمزاً أمنياً مستقلاً عن رابط الداشبورد.
 */
export function buildCompetitionCameraUrl(compId: string, cameraToken: string): string {
  const query = `?liveCamera=${encodeURIComponent(compId)}&camToken=${encodeURIComponent(cameraToken)}`;
  const base = getBaseAppUrl();
  return base ? `${base}${query}` : query;
}

export interface LiveViewUrlParams {
  competitionId: string;
  token: string;
}

export interface LiveCameraUrlParams {
  competitionId: string;
  cameraToken: string;
}

function extractParamsFromLocation(): URLSearchParams[] {
  if (typeof window === 'undefined') return [];
  const results: URLSearchParams[] = [];
  try {
    results.push(new URLSearchParams(window.location.search));
    if (window.location.hash) {
      const hashBody = window.location.hash.replace(/^#\/?/, '');
      const hashQueryIdx = hashBody.indexOf('?');
      results.push(
        new URLSearchParams(hashQueryIdx >= 0 ? hashBody.slice(hashQueryIdx + 1) : hashBody)
      );
    }
  } catch {}
  return results;
}

/**
 * قراءة معاملات شاشة المتابعة المباشرة (الداشبورد) من عنوان URL
 */
export function parseLiveViewParamsFromLocation(): LiveViewUrlParams | null {
  for (const params of extractParamsFromLocation()) {
    const liveView = params.get('liveView')?.trim();
    const token = params.get('token')?.trim();
    if (liveView && token) {
      return { competitionId: liveView, token };
    }
  }
  return null;
}

/**
 * قراءة معاملات رابط تشغيل الكاميرا عن بُعد من عنوان URL
 */
export function parseLiveCameraParamsFromLocation(): LiveCameraUrlParams | null {
  for (const params of extractParamsFromLocation()) {
    const liveCamera = params.get('liveCamera')?.trim();
    const camToken = params.get('camToken')?.trim();
    if (liveCamera && camToken) {
      return { competitionId: liveCamera, cameraToken: camToken };
    }
  }
  return null;
}

/**
 * بناء رسالة واتساب رسمية جاهزة لإرسال رابط الداشبورد إلى مدير الأوقاف أو المسؤول الإداري
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
    'يمكن فتح الرابط عبر الهاتف أو الحاسوب أو شاشة العرض الكبيرة للاطلاع المباشر على الإحصائيات والرسوم البيانية والبث المباشر أولاً بأول:',
    liveUrl,
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * بناء رسالة واتساب جاهزة لإرسال رابط تشغيل الكاميرا إلى الشخص الموجود في قاعة التقييم
 */
export function buildCameraWhatsAppShareUrl(
  compName: string,
  seasonText: string | undefined,
  cameraUrl: string
): string {
  const lines = [
    'السلام عليكم ورحمة الله وبركاته،',
    `هذا رابط تشغيل كاميرا البث المباشر (صوت وصورة) من قاعة التقييم لمسابقة:`,
    `*${compName}*`,
    ...(seasonText?.trim() ? [seasonText.trim()] : []),
    '',
    'افتح الرابط من هاتفك أو جهازك في القاعة واضغط على «تشغيل الكاميرا وبدء البث المباشر» ليظهر النقل مباشرة في لوحة المتابعة، وعند إغلاق الكاميرا تعود شاشة المؤشرات تلقائياً:',
    cameraUrl,
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * ضمان وجود إعدادات رابط المتابعة ورابط الكاميرا عن بُعد بشكل متكامل للمسابقة
 */
export function ensureLiveShareConfig(comp: Competition): CompetitionLiveShareConfig {
  const existing = comp.liveShare;
  const viewerToken =
    existing?.token && existing.token.trim().length >= 6
      ? existing.token.trim()
      : generateLiveShareToken(12);
  const cameraToken =
    existing?.cameraToken && existing.cameraToken.trim().length >= 6
      ? existing.cameraToken.trim()
      : generateLiveShareToken(12);

  return {
    enabled: Boolean(existing?.enabled),
    token: viewerToken,
    showTopPerformers: Boolean(existing?.showTopPerformers),
    topPerformersCount:
      Number(existing?.topPerformersCount) > 0
        ? Number(existing?.topPerformersCount)
        : 3,
    customSubtitle: existing?.customSubtitle || '',
    cameraLinkEnabled:
      existing?.cameraLinkEnabled !== undefined
        ? Boolean(existing.cameraLinkEnabled)
        : true,
    cameraToken,
    updatedAt: existing?.updatedAt || Date.now(),
  };
}
