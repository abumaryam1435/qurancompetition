/**
 * Mushaf Page Preloader & In-Memory / Browser Cache Manager
 * يضمن تحميل واستبقاء صفحات المصحف في ذاكرة المتصفح مسبقاً
 * لفتح المصحف وتصفح الصفحات فوراً بدون أي انتظار أو رسالة تحميل.
 */

// قائمة روابط الصفحات (الأساسي والاحتياطي لمصحف المدينة النبوية عالي الدقة)
export const getMushafImageSources = (page: number): string[] => {
  if (page < 1 || page > 604) return [];
  const paddedPage = String(page).padStart(3, '0');
  return [
    `https://android.quran.com/data/width_1260/page${paddedPage}.png`,
    `https://android.quran.com/data/width_1024/page${paddedPage}.png`,
    `https://everyayah.com/data/quranpages_png/${paddedPage}.png`,
    `https://static.quran.com/images/pages/page${paddedPage}.png`
  ];
};

// مخزن الذاكرة لتتبع الصفحات والروابط المحملة بنجاح
const preloadedPages = new Set<number>();
const preloadedUrls = new Set<string>();
const inFlightRequests = new Map<number, Promise<string>>();

/**
 * التحقق مما إذا كانت الصفحة محملة مسبقاً في ذاكرة التخزين المؤقت
 */
export const isPagePreloaded = (page: number): boolean => {
  return preloadedPages.has(page);
};

/**
 * التحقق مما إذا كان رابط صورة معين محمل مسبقاً
 */
export const isUrlPreloaded = (url: string): boolean => {
  if (!url) return false;
  return preloadedUrls.has(url);
};

/**
 * تحميل صفحة واحدة مسبقاً في الخلفية مع محاولة الرابط الاحتياطي إن لزم الأمر
 */
export const preloadMushafPage = (page: number): Promise<string> => {
  if (page < 1 || page > 604) {
    return Promise.reject(new Error(`Invalid Quran page number: ${page}`));
  }

  // إذا كانت محملة مسبقاً، نرجع الرابط فوراً
  if (preloadedPages.has(page)) {
    const sources = getMushafImageSources(page);
    return Promise.resolve(sources[0]);
  }

  // إذا كان جاري تحميلها حالياً، نعيد نفس الوعد لتجنب تكرار الطلب
  if (inFlightRequests.has(page)) {
    return inFlightRequests.get(page)!;
  }

  const sources = getMushafImageSources(page);

  const loadSource = (srcIndex: number): Promise<string> => {
    if (srcIndex >= sources.length) {
      return Promise.reject(new Error(`Failed to load page ${page} from all sources`));
    }

    const url = sources[srcIndex];

    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';

      img.onload = () => {
        preloadedPages.add(page);
        preloadedUrls.add(url);
        resolve(url);
      };

      img.onerror = () => {
        // تجربة المصدر التالي
        loadSource(srcIndex + 1).then(resolve).catch(reject);
      };

      img.src = url;
    });
  };

  const promise = loadSource(0)
    .finally(() => {
      inFlightRequests.delete(page);
    });

  inFlightRequests.set(page, promise);
  return promise;
};

/**
 * تحميل مجموعة صفحات دفعة واحدة في الخلفية بشكل متوازٍ وسريع
 */
export const preloadMushafPages = (pages: (number | undefined | null)[]): void => {
  if (!pages || !Array.isArray(pages)) return;

  // استبعاد التكرارات والقيم غير الصحيحة
  const uniquePages = Array.from(
    new Set(pages.filter((p): p is number => typeof p === 'number' && p >= 1 && p <= 604))
  );

  if (uniquePages.length === 0) return;

  // التحميل المتزامن للصفحات غير المحملة
  uniquePages.forEach(p => {
    if (!preloadedPages.has(p)) {
      preloadMushafPage(p).catch(() => {
        // تجاهل أخطاء التحميل في الخلفية بصمت
      });
    }
  });
};

/**
 * تحميل الصفحات المحيطة بالصفحة الحالية (السابقة واللاحقة)
 * لضمان سلاسة التنقل الفوري عند السحب أو الضغط على التالي/السابق
 */
export const preloadSurroundingPages = (currentPage: number, radius = 3): void => {
  if (!currentPage || currentPage < 1 || currentPage > 604) return;

  const pagesToLoad: number[] = [];
  for (let i = 1; i <= radius; i++) {
    if (currentPage + i <= 604) pagesToLoad.push(currentPage + i);
    if (currentPage - i >= 1) pagesToLoad.push(currentPage - i);
  }

  preloadMushafPages(pagesToLoad);
};

/**
 * تحميل ذكي في وقت خمول المتصفح (Idle Time) حتى لا يؤثر على سلاسة الواجهة
 */
export const preloadPagesOnIdle = (pages: number[]): void => {
  if (typeof window === 'undefined') return;

  const doPreload = () => {
    preloadMushafPages(pages);
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(doPreload, { timeout: 2000 });
  } else {
    setTimeout(doPreload, 300);
  }
};
