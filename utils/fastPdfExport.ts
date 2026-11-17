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
  const timer = setTimeout(() => controller.abort(), 45000);
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
    link.download = `${sanitizePdfFileName(fileName)}.pdf`;
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

export interface AppendElementPdfOptions {
  pdf: jsPDF;
  element: HTMLElement;
  orientation: 'portrait' | 'landscape';
  renderWidthPx?: number;
  marginMm?: number;
  atomicSelector?: string;
  startOnNewPage?: boolean;
  inlineStyledOnly?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export interface FastElementPdfOptions {
  element: HTMLElement;
  fileName: string;
  orientation: 'portrait' | 'landscape';
  renderWidthPx?: number;
  marginMm?: number;
  atomicSelector?: string;
  inlineStyledOnly?: boolean;
  onProgress?: (current: number, total: number) => void;
}

/**
 * إضافة صفحات عنصر HTML/DOM إلى وثيقة jsPDF قائمة مع عزل الشجرة وتقليص الصفوف خارج النطاق
 */
export async function appendDomElementToJsPdf({
  pdf,
  element,
  orientation,
  renderWidthPx,
  marginMm = 6,
  atomicSelector = 'tbody.pdf-avoid-break, tr, tfoot, .pdf-avoid-break, .grid > div',
  startOnNewPage = false,
  inlineStyledOnly = false,
  onProgress,
}: AppendElementPdfOptions): Promise<number> {
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

    const renderScale =
      pages.length <= 3
        ? 2
        : pages.length <= 12
        ? 1.7
        : pages.length <= 28
        ? 1.5
        : 1.35;

    // 2. تجميع الصفحات في نطاقات (Bands) بحيث تبقى مساحة الـ Canvas تحت 12.5 مليون بكسل لسرعة وأمان المتصفحات والهواتف
    const MAX_CANVAS_PIXELS = 12_500_000;
    const maxBandHeightCss = Math.max(
      2600,
      Math.floor(MAX_CANVAS_PIXELS / Math.max(1, targetWidth * renderScale * renderScale))
    );
    const bands: { startY: number; endY: number; pageIndices: number[] }[] = [];
    let currBand: { startY: number; endY: number; pageIndices: number[] } | null = null;

    pages.forEach((p, idx) => {
      if (!currBand || p.endY - currBand.startY > maxBandHeightCss) {
        currBand = { startY: p.startY, endY: p.endY, pageIndices: [idx] };
        bands.push(currBand);
      } else {
        currBand.endY = p.endY;
        currBand.pageIndices.push(idx);
      }
    });

    // تقليص الصفوف خارج النطاق للجداول الضخمة لمنع بطء O(N²) أثناء التصدير
    interface TrackedTbody {
      tbody: HTMLElement;
      rows: { el: HTMLTableRowElement; topCss: number; bottomCss: number }[];
    }
    const trackedTbodies: TrackedTbody[] = [];
    const allTrsCount = clone.querySelectorAll('tbody > tr').length;
    if (bands.length > 1 && allTrsCount > 50) {
      clone.querySelectorAll('table').forEach(tbl => {
        const headerCells = Array.from(tbl.querySelectorAll('thead th, thead td')) as HTMLElement[];
        headerCells.forEach(cell => {
          const w = cell.getBoundingClientRect().width;
          if (w > 0) cell.style.width = `${w}px`;
        });
        const tRect = tbl.getBoundingClientRect();
        if (tRect.width > 0) {
          (tbl as HTMLElement).style.width = `${tRect.width}px`;
        }
      });

      clone.querySelectorAll('tbody').forEach(tb => {
        const directRows = Array.from(tb.children).filter(
          c => c.tagName === 'TR'
        ) as HTMLTableRowElement[];
        if (directRows.length > 15) {
          trackedTbodies.push({
            tbody: tb as HTMLElement,
            rows: directRows.map(tr => {
              const r = tr.getBoundingClientRect();
              return {
                el: tr,
                topCss: r.top - cloneRect.top,
                bottomCss: r.bottom - cloneRect.top,
              };
            }),
          });
        }
      });
    }

    const ignoreFilter = createIsolatedIgnoreFilter(host);

    await withRtlCanvasText(async () => {
      let exportedPages = 0;

      for (const band of bands) {
        const bandHeightCss = Math.max(1, band.endY - band.startY);

        // عزل صفوف الجدول التي خارج النطاق الحالي مؤقتاً وتسريع html2canvas عدة مرات
        if (trackedTbodies.length > 0) {
          for (const item of trackedTbodies) {
            let aboveStart: number | null = null;
            let aboveEnd = 0;
            const visibleRows: HTMLTableRowElement[] = [];

            for (const row of item.rows) {
              if (row.bottomCss < band.startY - 25) {
                if (aboveStart === null) aboveStart = row.topCss;
                aboveEnd = Math.max(aboveEnd, row.bottomCss);
              } else if (row.topCss > band.endY + 25) {
                continue;
              } else {
                visibleRows.push(row.el);
              }
            }

            const frag = document.createDocumentFragment();
            if (aboveStart !== null && aboveEnd > aboveStart) {
              const spacer = document.createElement('tr');
              spacer.setAttribute('data-pdf-spacer', 'true');
              const td = document.createElement('td');
              td.colSpan = 99;
              td.style.height = `${Math.max(1, aboveEnd - aboveStart)}px`;
              td.style.padding = '0';
              td.style.border = 'none';
              spacer.appendChild(td);
              frag.appendChild(spacer);
            }
            for (const vr of visibleRows) {
              frag.appendChild(vr);
            }
            item.tbody.innerHTML = '';
            item.tbody.appendChild(frag);
          }
        }

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
            if (inlineStyledOnly) {
              clonedDoc.querySelectorAll('style').forEach(s => s.remove());
            }
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
            if (pIdx > 0 || startOnNewPage) {
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

        pageCanvas.width = 0;
        pageCanvas.height = 0;
        bandCanvas.width = 0;
        bandCanvas.height = 0;
        await yieldToMainThread();
      }
    });

    return pages.length;
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

/**
 * تصدير عنصر HTML/DOM إلى PDF متعدد الصفحات بسرعة عالية وجودة طباعة واضحة
 */
export async function exportDomElementToFastPdf({
  element,
  fileName,
  orientation,
  renderWidthPx,
  marginMm = 6,
  atomicSelector = 'tbody.pdf-avoid-break, tr, tfoot, .pdf-avoid-break, .grid > div',
  inlineStyledOnly = false,
  onProgress,
}: FastElementPdfOptions): Promise<void> {
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await appendDomElementToJsPdf({
    pdf,
    element,
    orientation,
    renderWidthPx,
    marginMm,
    atomicSelector,
    startOnNewPage: false,
    inlineStyledOnly,
    onProgress,
  });

  pdf.save(`${sanitizePdfFileName(fileName)}.pdf`);
}

export interface HighResTableColumn {
  header: string;
  widthPx: number;
  align?: 'right' | 'center' | 'left';
  dir?: 'rtl' | 'ltr';
  color?: string;
  bold?: boolean;
  fontSize?: number;
}

export interface HighResArabicTableOptions {
  pdf: jsPDF;
  startOnNewPage?: boolean;
  marginMm?: number;
  sectionTitle: string;
  sectionSubtitle?: string;
  runningHeaderTitle?: string;
  columns: HighResTableColumn[];
  rows: string[][];
  onPageDone?: (pageIndex: number, totalPages: number) => void;
}

function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number
): string[] {
  const clean = (rawText ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  if (ctx.measureText(clean).width <= maxWidth) return [clean];

  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        // كسر الكلمة الطويلة جداً على مستوى الحروف لمنع تداخل الأعمدة
        let slice = '';
        for (const ch of word) {
          if (ctx.measureText(slice + ch).width > maxWidth && slice) {
            lines.push(slice);
            slice = ch;
          } else {
            slice += ch;
          }
        }
        current = slice;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['-'];
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * تصيير كشوفات الجداول الضخمة (500 - 1500+ صف) مباشرة بدقة 2x Retina فائقة الوضوح
 * وبسرعة استثنائية (~1.5 - 3 ثوانٍ لـ 1000 متسابق) مع تكرار الترويسة في كل صفحة
 */
export async function appendHighResArabicTableToPdf({
  pdf,
  startOnNewPage = true,
  marginMm = 6,
  sectionTitle,
  sectionSubtitle = '',
  runningHeaderTitle = '',
  columns,
  rows,
  onPageDone,
}: HighResArabicTableOptions): Promise<number> {
  if (rows.length === 0) return 0;
  await waitFontsBriefly(450);

  const usableWidthMm = pdf.internal.pageSize.getWidth() - marginMm * 2;
  const usableHeightMm = pdf.internal.pageSize.getHeight() - marginMm * 2;

  const logicalWidth = columns.reduce((s, c) => s + c.widthPx, 0);
  const logicalHeight = Math.floor(logicalWidth * (usableHeightMm / usableWidthMm));
  const scale = 2; // دقة طباعة عالية ~240 DPI

  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const fontFamily = "'Tajawal', 'Cairo', 'Amiri', system-ui, sans-serif";
  const outerPadX = 14;
  const outerPadY = 14;
  const tableWidth = logicalWidth - outerPadX * 2;
  const colScale = tableWidth / logicalWidth;
  const scaledCols = columns.map(c => ({
    ...c,
    w: c.widthPx * colScale,
  }));

  // حساب إحداثيات الأعمدة من اليمين إلى اليسار (RTL)
  const colEdges: { rightX: number; leftX: number; w: number; col: HighResTableColumn }[] = [];
  let cursorX = logicalWidth - outerPadX;
  for (const sc of scaledCols) {
    colEdges.push({
      rightX: cursorX,
      leftX: cursorX - sc.w,
      w: sc.w,
      col: sc,
    });
    cursorX -= sc.w;
  }

  const headerRowHeight = 32;
  const footerHeight = 24;
  const lineHeightPx = 15;
  const cellPadX = 7;

  interface PreparedRow {
    wrappedCells: string[][];
    height: number;
  }

  // قياس ارتفاع كل صف بدقة لعدم قص أي اسم أو نص طويل
  const preparedRows: PreparedRow[] = rows.map(row => {
    let maxLines = 1;
    const wrappedCells = row.map((cellText, colIdx) => {
      const edge = colEdges[colIdx];
      const fSize = edge.col.fontSize || 11.5;
      ctx.font = `${edge.col.bold ? '800' : '600'} ${fSize}px ${fontFamily}`;
      const lines = wrapCanvasTextLines(ctx, cellText, Math.max(18, edge.w - cellPadX * 2));
      if (lines.length > maxLines) maxLines = lines.length;
      return lines;
    });
    return {
      wrappedCells,
      height: Math.max(26, maxLines * lineHeightPx + 10),
    };
  });

  // تقسيم الصفوف مسبقاً إلى صفحات دقيقة لمعرفة إجمالي الصفحات قبل الرسم
  const pageSlices: { startIdx: number; endIdx: number }[] = [];
  let idx = 0;
  while (idx < preparedRows.length) {
    const bannerH = pageSlices.length === 0 ? 40 : 32;
    const startY = outerPadY + bannerH + 8 + headerRowHeight;
    const maxY = logicalHeight - outerPadY - footerHeight;
    let y = startY;
    const startIdx = idx;

    while (idx < preparedRows.length) {
      const rh = preparedRows[idx].height;
      if (y + rh > maxY && idx > startIdx) {
        break;
      }
      y += rh;
      idx++;
    }
    pageSlices.push({ startIdx, endIdx: idx });
  }

  const totalPages = pageSlices.length;

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const slice = pageSlices[pIdx];
    const isFirstPage = pIdx === 0;
    const bannerH = isFirstPage ? 40 : 32;

    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // خلفية الصفحة وإطار الوثيقة
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    drawRoundedRectPath(ctx, 4, 4, logicalWidth - 8, logicalHeight - 8, 12);
    ctx.strokeStyle = '#065f46';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // ترويسة القسم أعلى الصفحة
    drawRoundedRectPath(ctx, outerPadX, outerPadY, tableWidth, bannerH, 8);
    ctx.fillStyle = '#064e3b';
    ctx.fill();

    ctx.textBaseline = 'middle';
    const bannerMidY = outerPadY + bannerH / 2;

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${isFirstPage ? 14 : 12.5}px ${fontFamily}`;
    const rightTitle = isFirstPage
      ? sectionTitle
      : `${runningHeaderTitle || sectionTitle} — كشف المتسابقين`;
    ctx.fillText(rightTitle, logicalWidth - outerPadX - 12, bannerMidY);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde68a';
    ctx.font = `800 11.5px ${fontFamily}`;
    const leftLabel = isFirstPage && sectionSubtitle
      ? sectionSubtitle
      : `صفحة ${pIdx + 1} من ${totalPages}`;
    ctx.fillText(leftLabel, outerPadX + 12, bannerMidY);

    // صف عناوين الأعمدة (يتكرر في كل صفحة)
    let currY = outerPadY + bannerH + 8;
    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(outerPadX, currY, tableWidth, headerRowHeight);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(outerPadX, currY, tableWidth, headerRowHeight);

    for (let cIdx = 0; cIdx < colEdges.length; cIdx++) {
      const edge = colEdges[cIdx];
      if (cIdx > 0) {
        ctx.beginPath();
        ctx.moveTo(edge.rightX, currY);
        ctx.lineTo(edge.rightX, currY + headerRowHeight);
        ctx.stroke();
      }
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#064e3b';
      ctx.font = `800 11.5px ${fontFamily}`;
      ctx.fillText(edge.col.header, (edge.leftX + edge.rightX) / 2, currY + headerRowHeight / 2);
    }

    currY += headerRowHeight;

    // رسم صفوف المتسابقين لهذه الصفحة
    for (let rIdx = slice.startIdx; rIdx < slice.endIdx; rIdx++) {
      const prep = preparedRows[rIdx];
      const rh = prep.height;

      ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(outerPadX, currY, tableWidth, rh);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(outerPadX, currY, tableWidth, rh);

      for (let cIdx = 0; cIdx < colEdges.length; cIdx++) {
        const edge = colEdges[cIdx];
        if (cIdx > 0) {
          ctx.beginPath();
          ctx.moveTo(edge.rightX, currY);
          ctx.lineTo(edge.rightX, currY + rh);
          ctx.stroke();
        }

        const lines = prep.wrappedCells[cIdx];
        const fSize = edge.col.fontSize || 11.5;
        ctx.font = `${edge.col.bold ? '800' : '600'} ${fSize}px ${fontFamily}`;
        ctx.fillStyle = edge.col.color || '#0f172a';
        ctx.direction = edge.col.dir === 'ltr' ? 'ltr' : 'rtl';

        const align = edge.col.align || 'right';
        let textX: number;
        if (align === 'center') {
          ctx.textAlign = 'center';
          textX = (edge.leftX + edge.rightX) / 2;
        } else if (align === 'left') {
          ctx.textAlign = 'left';
          textX = edge.leftX + cellPadX;
        } else {
          ctx.textAlign = 'right';
          textX = edge.rightX - cellPadX;
        }

        const blockHeight = lines.length * lineHeightPx;
        const firstLineY = currY + (rh - blockHeight) / 2 + lineHeightPx / 2;
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], textX, firstLineY + li * lineHeightPx);
        }
      }

      currY += rh;
    }

    // تذييل الصفحة
    ctx.direction = 'rtl';
    ctx.fillStyle = '#64748b';
    ctx.font = `700 10.5px ${fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(runningHeaderTitle || sectionTitle, logicalWidth - outerPadX - 4, logicalHeight - outerPadY - 6);
    ctx.textAlign = 'left';
    ctx.fillText(`صفحة ${pIdx + 1} من ${totalPages}`, outerPadX + 4, logicalHeight - outerPadY - 6);

    ctx.restore();

    if (pIdx > 0 || startOnNewPage) {
      pdf.addPage('a4', 'portrait');
    }
    const imgData = canvas.toDataURL('image/jpeg', 0.88);
    pdf.addImage(
      imgData,
      'JPEG',
      marginMm,
      marginMm,
      usableWidthMm,
      usableHeightMm,
      undefined,
      'FAST'
    );

    onPageDone?.(pIdx + 1, totalPages);
    if ((pIdx + 1) % 4 === 0) {
      await yieldToMainThread();
    }
  }

  canvas.width = 0;
  canvas.height = 0;
  return totalPages;
}
