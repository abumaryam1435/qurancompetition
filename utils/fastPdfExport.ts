import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const imageDataUrlCache = new Map<string, string>();
let cachedServerPdfAvailable: boolean | null = null;
let cachedCompiledCss: string | null = null;
let cachedStyleCount = -1;

/**
 * إتاحة مهلة قصيرة للمتصفح لتحديث الواجهة ومنع تجمد الصفحة أثناء التصدير متعدد الصفحات
 */
export function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * التحقق السريع (والمخزن مؤقتاً) من توفر خادم الطباعة الخلفي (/api/pdf)
 * على الاستضافات الساكنة مثل Netlify يعود فوراً بـ false لتجنب إهدار الوقت في إرسال طلبات HTML ضخمة
 */
export async function isServerPdfAvailable(): Promise<boolean> {
  if (cachedServerPdfAvailable !== null) {
    return cachedServerPdfAvailable;
  }

  if (typeof window === 'undefined') {
    cachedServerPdfAvailable = false;
    return false;
  }

  const host = (window.location.hostname || '').toLowerCase();
  // Netlify static hosting (مع إعادة توجيه /* إلى index.html) لا يوفر خادم Puppeteer
  if (host.endsWith('.netlify.app') || host.endsWith('.netlify.com')) {
    cachedServerPdfAvailable = false;
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !contentType.includes('application/json')) {
      cachedServerPdfAvailable = false;
      return false;
    }
    const data = await res.json();
    cachedServerPdfAvailable = Boolean(data && data.status === 'ok');
    return cachedServerPdfAvailable;
  } catch {
    cachedServerPdfAvailable = false;
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * محاولة توليد PDF عبر الخادم الخلفي فقط إذا كان متوفراً، مع التحقق الصارم من أن الاستجابة application/pdf فعلية
 */
export async function tryServerPdfDownload(
  html: string,
  orientation: 'portrait' | 'landscape',
  fileName: string
): Promise<boolean> {
  const available = await isServerPdfAvailable();
  if (!available) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, orientation }),
      signal: controller.signal,
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !contentType.includes('application/pdf')) {
      if (contentType.includes('text/html')) {
        cachedServerPdfAvailable = false;
      }
      return false;
    }
    const pdfBlob = await res.blob();
    if (pdfBlob.size <= 500) return false;

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * استخراج قواعد CSS المجمّعة من الذاكرة مع التخزين المؤقت لتسريع التصدير الخادمي
 */
export function getCachedCompiledCss(): string {
  const sheets = Array.from(document.styleSheets);
  if (cachedCompiledCss !== null && cachedStyleCount === sheets.length) {
    return cachedCompiledCss;
  }
  const chunks: string[] = [];
  for (const sheet of sheets) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (let i = 0; i < rules.length; i++) {
        const ruleText = rules[i].cssText || '';
        if (
          ruleText.includes(':not(#root)') ||
          ruleText.includes('netlify')
        ) {
          continue;
        }
        chunks.push(ruleText);
      }
    } catch {
      // ignore cross-origin stylesheets
    }
  }
  cachedStyleCount = sheets.length;
  cachedCompiledCss = `<style>${chunks.join('\n')}</style>`;
  return cachedCompiledCss;
}

/**
 * تحويل الصور داخل العنصر إلى Data URL (Base64) مع التخزين المؤقت وفك التشفير المسبق
 */
export async function inlineAndDecodeImages(rootEl: HTMLElement): Promise<void> {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  if (imgs.length === 0) return;

  await Promise.all(
    imgs.map(async img => {
      try {
        const src = img.getAttribute('src') || '';
        if (!src) return;
        if (!src.startsWith('data:')) {
          const absUrl = src.startsWith('http')
            ? src
            : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
          if (imageDataUrlCache.has(absUrl)) {
            img.setAttribute('src', imageDataUrlCache.get(absUrl)!);
          } else {
            const response = await fetch(absUrl);
            if (response.ok) {
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ''));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              if (dataUrl.startsWith('data:')) {
                imageDataUrlCache.set(absUrl, dataUrl);
                img.setAttribute('src', dataUrl);
              }
            }
          }
        }
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        }
      } catch {
        // ignore individual image errors
      }
    })
  );
}

/**
 * انتظار جاهزية الخطوط بحد أقصى سريع (450ms) حتى لا يتأخر التصدير إذا كانت شبكة الخطوط بطيئة
 */
export async function waitFontsBriefly(timeoutMs = 450): Promise<void> {
  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise(resolve => setTimeout(resolve, timeoutMs)),
      ]);
    }
  } catch {
    // ignore
  }
}

/**
 * تجهيز مرشّح html2canvas الذي يستبعد #root وبقية DOM التطبيق عند التصيير في الحاوية المعزولة
 * مما يضاعف سرعة html2canvas عدة مرات عبر تجنب استنساخ آلاف العناصر غير المرئية
 */
export function createIsolatedIgnoreFilter(targetContainer: HTMLElement) {
  return (node: Element): boolean => {
    if (!node) return false;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'IFRAME') return true;
    if (node.classList && node.classList.contains('no-print')) return true;
    if (
      typeof document !== 'undefined' &&
      node.parentElement === document.body &&
      node !== targetContainer &&
      !node.contains(targetContainer) &&
      !targetContainer.contains(node)
    ) {
      return true;
    }
    if (
      node.id === 'root' &&
      !node.contains(targetContainer) &&
      !targetContainer.contains(node)
    ) {
      return true;
    }
    return false;
  };
}

/**
 * تنظيف اسم ملف الـ PDF من أي رموز غير صالحة للحفظ على جميع الأنظمة والمتصفحات
 */
export function sanitizePdfFileName(fileName: string): string {
  const cleaned = (fileName || 'تقرير')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || 'تقرير';
}

/**
 * تغليف CanvasRenderingContext2D.fillText لضبط اتجاه النصوص العربية بشكل صحيح أثناء التصيير
 */
export function withRtlCanvasText<T>(fn: () => Promise<T>): Promise<T> {
  const origFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (
    text: string,
    x: number,
    y: number,
    maxWidth?: number
  ) {
    this.direction = 'rtl';
    return maxWidth !== undefined
      ? origFillText.call(this, text, x, y, maxWidth)
      : origFillText.call(this, text, x, y);
  };
  return fn().finally(() => {
    CanvasRenderingContext2D.prototype.fillText = origFillText;
  });
}

export interface FastElementPdfOptions {
  element: HTMLElement;
  fileName: string;
  orientation: 'portrait' | 'landscape';
  renderWidthPx?: number;
  marginMm?: number;
  atomicSelector?: string;
  onProgress?: (current: number, total: number) => void;
}

/**
 * تصدير عنصر HTML/DOM إلى PDF متعدد الصفحات بسرعة عالية وجودة طباعة واضحة:
 * - عزل العنصر عن شجرة التطبيق لتسريع html2canvas
 * - تقسيم ذكي على حدود الصفوف والبطاقات دون قص أي صف
 * - تقسيم النطاقات الطويلة إلى شرائح آمنة تتجنب حدود ذاكرة المتصفح والهاتف
 * - ضغط JPEG عالي الجودة (0.93) مع تسريع FAST في jsPDF بدلاً من PNG البطيء
 */
export async function exportDomElementToFastPdf({
  element,
  fileName,
  orientation,
  renderWidthPx,
  marginMm = 6,
  atomicSelector = 'tbody.pdf-avoid-break, tr, tfoot, .pdf-avoid-break, .grid > div',
  onProgress,
}: FastElementPdfOptions): Promise<void> {
  await waitFontsBriefly(450);

  const targetWidth = renderWidthPx || (orientation === 'landscape' ? 1320 : 1040);

  const host = document.createElement('div');
  host.id = 'fast-pdf-render-host';
  host.setAttribute('data-pdf-export-host', 'true');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-20000px';
  host.style.width = `${targetWidth}px`;
  host.style.background = '#ffffff';
  host.style.zIndex = '-9999';
  host.style.visibility = 'visible';
  host.style.opacity = '1';
  host.style.display = 'block';
  host.setAttribute('dir', 'rtl');

  const clone = element.cloneNode(true) as HTMLElement;
  if (clone.id === 'root') {
    clone.removeAttribute('id');
  }
  clone.querySelectorAll('#root').forEach(n => n.removeAttribute('id'));
  clone
    .querySelectorAll('.no-print, script, link[rel="preconnect"], base')
    .forEach(n => n.remove());
  clone.classList.remove('dark:bg-slate-900', 'dark:border-slate-800', 'dark');
  clone.style.width = `${targetWidth}px`;
  clone.style.maxWidth = `${targetWidth}px`;
  clone.style.margin = '0';
  clone.style.backgroundColor = '#ffffff';
  clone.style.color = '#0f172a';
  clone.style.direction = 'rtl';
  clone.style.letterSpacing = '0px';

  await inlineAndDecodeImages(clone);

  const bandWrapper = document.createElement('div');
  bandWrapper.style.width = `${targetWidth}px`;
  bandWrapper.style.background = '#ffffff';
  bandWrapper.style.overflow = 'hidden';
  bandWrapper.appendChild(clone);
  host.appendChild(bandWrapper);
  document.body.appendChild(host);

  try {
    // قياس الكتل الذرية والارتفاع الكلي بعد الاستقرار داخل الحاوية المعزولة
    const cloneRect = clone.getBoundingClientRect();
    const totalCssHeight = Math.max(1, Math.ceil(clone.scrollHeight || cloneRect.height));

    const atomicNodes = Array.from(clone.querySelectorAll(atomicSelector)) as HTMLElement[];
    const domBlocks = atomicNodes
      .map(node => {
        const r = node.getBoundingClientRect();
        return {
          topCss: Math.max(0, r.top - cloneRect.top),
          bottomCss: Math.min(totalCssHeight, r.bottom - cloneRect.top),
        };
      })
      .filter(b => b.bottomCss > b.topCss);

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidthMm = pdfWidth - marginMm * 2;
    const usableHeightMm = pageHeight - marginMm * 2;
    const cssPxPerMm = targetWidth / usableWidthMm;
    const maxPageHeightCss = Math.max(200, Math.floor(usableHeightMm * cssPxPerMm));

    // 1. حساب حدود الصفحات الدقيقة بالبكسل المنطقي (CSS px) قبل التصيير
    const pages: { startY: number; endY: number }[] = [];
    let cursorY = 0;
    while (cursorY < totalCssHeight - 2) {
      let nextY = Math.min(totalCssHeight, cursorY + maxPageHeightCss);
      if (nextY < totalCssHeight) {
        const crossing = domBlocks.filter(
          b =>
            b.topCss > cursorY + 20 &&
            b.topCss < nextY &&
            b.bottomCss > nextY &&
            b.bottomCss - b.topCss <= maxPageHeightCss * 0.9
        );
        if (crossing.length > 0) {
          const safeTop = Math.min(...crossing.map(b => b.topCss));
          if (safeTop > cursorY + 24) {
            nextY = Math.floor(safeTop) - 1;
          }
        }
      }
      if (nextY <= cursorY) {
        nextY = Math.min(totalCssHeight, cursorY + maxPageHeightCss);
      }
      pages.push({ startY: cursorY, endY: nextY });
      cursorY = nextY;
    }

    if (pages.length === 0) {
      pages.push({ startY: 0, endY: totalCssHeight });
    }

    // 2. تجميع الصفحات في نطاقات (Bands) حتى لا يتجاوز Canvas أي حد أقصى للمتصفح أو الهواتف
    const MAX_BAND_HEIGHT_CSS = 3400;
    const bands: { startY: number; endY: number; pageIndices: number[] }[] = [];
    let currBand: { startY: number; endY: number; pageIndices: number[] } | null = null;

    pages.forEach((p, idx) => {
      if (
        !currBand ||
        p.endY - currBand.startY > MAX_BAND_HEIGHT_CSS
      ) {
        currBand = { startY: p.startY, endY: p.endY, pageIndices: [idx] };
        bands.push(currBand);
      } else {
        currBand.endY = p.endY;
        currBand.pageIndices.push(idx);
      }
    });

    // مقياس ذكي: دقة فائقة للتقارير الصغيرة والمتوسطة، وسرعة عالية وآمنة للتقارير الضخمة
    const renderScale =
      pages.length <= 3 ? 2 : pages.length <= 12 ? 1.7 : 1.5;

    const ignoreFilter = createIsolatedIgnoreFilter(host);

    await withRtlCanvasText(async () => {
      let exportedPages = 0;

      for (const band of bands) {
        const bandHeightCss = Math.max(1, band.endY - band.startY);
        bandWrapper.style.height = `${bandHeightCss}px`;
        clone.style.marginTop = band.startY > 0 ? `-${band.startY}px` : '0px';

        const bandCanvas = await html2canvas(bandWrapper, {
          scale: renderScale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: targetWidth,
          scrollX: 0,
          scrollY: 0,
          ignoreElements: ignoreFilter,
          onclone: clonedDoc => {
            clonedDoc.documentElement.setAttribute('dir', 'rtl');
            clonedDoc.documentElement.setAttribute('lang', 'ar');
            clonedDoc.documentElement.classList.remove('dark');
            const clonedHost = clonedDoc.getElementById('fast-pdf-render-host');
            if (clonedHost) {
              clonedHost.style.setProperty('display', 'block', 'important');
              clonedHost.style.setProperty('visibility', 'visible', 'important');
              clonedHost.style.setProperty('opacity', '1', 'important');
              clonedHost.style.setProperty('width', `${targetWidth}px`, 'important');
              clonedHost.style.setProperty('height', 'auto', 'important');
            }
            const fixStyle = clonedDoc.createElement('style');
            fixStyle.textContent = `
              #fast-pdf-render-host, #fast-pdf-render-host * {
                letter-spacing: 0px !important;
                word-spacing: normal !important;
                font-feature-settings: "kern" 1, "liga" 1, "clig" 1, "calt" 1 !important;
                font-variant-ligatures: common-ligatures contextual !important;
                font-family: 'Tajawal', 'Cairo', 'Amiri', system-ui, sans-serif !important;
                transition: none !important;
                animation: none !important;
              }
              #fast-pdf-render-host {
                direction: rtl !important;
              }
              #fast-pdf-render-host [dir="ltr"] {
                direction: ltr !important;
                unicode-bidi: embed;
              }
              .no-print { display: none !important; }
            `;
            clonedDoc.head.appendChild(fixStyle);
          },
        });

        const scaleY = bandCanvas.height / bandHeightCss;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = bandCanvas.width;
        const pageCtx = pageCanvas.getContext('2d');

        for (const pIdx of band.pageIndices) {
          const p = pages[pIdx];
          const relTopPx = Math.max(0, Math.floor((p.startY - band.startY) * scaleY));
          const relBottomPx = Math.min(
            bandCanvas.height,
            Math.ceil((p.endY - band.startY) * scaleY)
          );
          const sliceHeightPx = Math.max(1, relBottomPx - relTopPx);

          pageCanvas.height = sliceHeightPx;
          if (pageCtx) {
            pageCtx.fillStyle = '#ffffff';
            pageCtx.fillRect(0, 0, pageCanvas.width, sliceHeightPx);
            pageCtx.drawImage(
              bandCanvas,
              0,
              relTopPx,
              bandCanvas.width,
              sliceHeightPx,
              0,
              0,
              bandCanvas.width,
              sliceHeightPx
            );

            const sliceImgData = pageCanvas.toDataURL('image/jpeg', 0.93);
            if (pIdx > 0) {
              pdf.addPage('a4', orientation);
            }
            const sliceHeightMm = (p.endY - p.startY) / cssPxPerMm;
            pdf.addImage(
              sliceImgData,
              'JPEG',
              marginMm,
              marginMm,
              usableWidthMm,
              sliceHeightMm,
              undefined,
              'FAST'
            );
          }

          exportedPages++;
          onProgress?.(exportedPages, pages.length);
        }

        // تحرير ذاكرة الـ Canvas فوراً بعد كل نطاق
        pageCanvas.width = 0;
        pageCanvas.height = 0;
        bandCanvas.width = 0;
        bandCanvas.height = 0;
        await yieldToMainThread();
      }
    });

    pdf.save(`${sanitizePdfFileName(fileName)}.pdf`);
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
