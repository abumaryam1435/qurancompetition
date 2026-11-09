import XLSXStyle from 'xlsx-js-style';

export interface StyledSheetTheme {
  bannerBg?: string;
  bannerFg?: string;
  headerBg?: string;
  headerFg?: string;
}

const LEVEL_THEMES: StyledSheetTheme[] = [
  { bannerBg: '064E3B', bannerFg: 'FFFFFF', headerBg: '047857', headerFg: 'FFFFFF' }, // Emerald
  { bannerBg: '1E3A8A', bannerFg: 'FFFFFF', headerBg: '1D4ED8', headerFg: 'FFFFFF' }, // Royal Blue
  { bannerBg: '4C1D95', bannerFg: 'FFFFFF', headerBg: '6D28D9', headerFg: 'FFFFFF' }, // Purple
  { bannerBg: '78350F', bannerFg: 'FFFFFF', headerBg: 'B45309', headerFg: 'FFFFFF' }, // Amber/Gold
  { bannerBg: '134E4A', bannerFg: 'FFFFFF', headerBg: '0F766E', headerFg: 'FFFFFF' }, // Teal
  { bannerBg: '831843', bannerFg: 'FFFFFF', headerBg: 'BE185D', headerFg: 'FFFFFF' }, // Rose/Burgundy
];

export function getLevelSheetTheme(index: number): StyledSheetTheme {
  return LEVEL_THEMES[index % LEVEL_THEMES.length];
}

export function sanitizeExcelSheetName(rawName: string, fallbackIndex: number): string {
  const cleaned = (rawName || `المستوى ${fallbackIndex}`)
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return `المستوى ${fallbackIndex}`;
  return cleaned.length > 31 ? cleaned.slice(0, 31).trim() : cleaned;
}

export function ensureUniqueSheetName(wb: any, desiredName: string, index: number): string {
  const base = sanitizeExcelSheetName(desiredName, index);
  const existing = new Set<string>(wb.SheetNames || []);
  if (!existing.has(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, Math.max(1, 31 - suffix.length)).trim() + suffix;
    if (!existing.has(candidate)) return candidate;
  }
  return `ورقة_${index}_${Date.now().toString().slice(-4)}`.slice(0, 31);
}

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const HEADER_BORDER = {
  top: { style: 'medium', color: { rgb: '0F172A' } },
  bottom: { style: 'medium', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: 'E2E8F0' } },
  right: { style: 'thin', color: { rgb: 'E2E8F0' } },
};

/**
 * إنشاء ورقة عمل إكسل منسقة بالكامل مع خلايا ملونة وحدود واضحة واتجاه RTL وعنوان علوي اختياري
 */
export function createStyledSheetFromRows(
  rows: Record<string, any>[],
  options: {
    titleBanner?: string;
    subtitleBanner?: string;
    colWidths?: number[];
    theme?: StyledSheetTheme;
  } = {}
) {
  const theme: Required<StyledSheetTheme> = {
    bannerBg: options.theme?.bannerBg || '064E3B',
    bannerFg: options.theme?.bannerFg || 'FFFFFF',
    headerBg: options.theme?.headerBg || '047857',
    headerFg: options.theme?.headerFg || 'FFFFFF',
  };

  const safeRows =
    rows.length > 0
      ? rows
      : [{ الملاحظة: 'لا توجد بيانات مسجلة في هذا القسم حالياً' }];

  const headers = Object.keys(safeRows[0]);
  const colCount = Math.max(1, headers.length);

  const aoa: any[][] = [];
  let headerRowIdx = 0;

  if (options.titleBanner) {
    const bannerRow = new Array(colCount).fill('');
    bannerRow[0] = options.titleBanner;
    aoa.push(bannerRow);
    headerRowIdx++;
  }

  if (options.subtitleBanner) {
    const subRow = new Array(colCount).fill('');
    subRow[0] = options.subtitleBanner;
    aoa.push(subRow);
    headerRowIdx++;
  }

  // صف العناوين
  aoa.push(headers);

  // صفوف البيانات
  for (const rowObj of safeRows) {
    aoa.push(headers.map(h => (rowObj[h] !== undefined && rowObj[h] !== null ? rowObj[h] : '')));
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  (ws as any)['!views'] = [{ rightToLeft: true }];

  // دمج خلايا العنوان العلوي والفرعي
  const merges: any[] = [];
  let currentBannerRow = 0;
  if (options.titleBanner) {
    merges.push({
      s: { r: currentBannerRow, c: 0 },
      e: { r: currentBannerRow, c: colCount - 1 },
    });
    currentBannerRow++;
  }
  if (options.subtitleBanner) {
    merges.push({
      s: { r: currentBannerRow, c: 0 },
      e: { r: currentBannerRow, c: colCount - 1 },
    });
    currentBannerRow++;
  }
  if (merges.length > 0) {
    ws['!merges'] = merges;
  }

  // ضبط ارتفاع الصفوف
  const rowHeights: { hpt: number }[] = [];
  for (let r = 0; r < aoa.length; r++) {
    if (options.titleBanner && r === 0) {
      rowHeights.push({ hpt: 32 });
    } else if (options.subtitleBanner && r === (options.titleBanner ? 1 : 0)) {
      rowHeights.push({ hpt: 24 });
    } else if (r === headerRowIdx) {
      rowHeights.push({ hpt: 28 });
    } else {
      rowHeights.push({ hpt: 22 });
    }
  }
  ws['!rows'] = rowHeights;

  // ضبط عرض الأعمدة تلقائياً أو حسب المحدد
  ws['!cols'] = headers.map((h, cIdx) => {
    if (options.colWidths && options.colWidths[cIdx]) {
      return { wch: options.colWidths[cIdx] };
    }
    let maxLen = h.length + 5;
    for (let r = headerRowIdx + 1; r < aoa.length; r++) {
      const valStr = String(aoa[r][cIdx] ?? '');
      if (valStr.length + 4 > maxLen) {
        maxLen = Math.min(48, valStr.length + 4);
      }
    }
    return { wch: Math.max(12, maxLen) };
  });

  // تنسيق وتلوين الخلايا
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r, c });
      if (!ws[cellRef]) {
        ws[cellRef] = { t: 's', v: '' };
      }
      const cell = ws[cellRef];

      // 1. صف العنوان الرئيسي
      if (options.titleBanner && r === 0) {
        cell.s = {
          fill: { fgColor: { rgb: theme.bannerBg } },
          font: {
            name: 'Arial',
            sz: 13,
            bold: true,
            color: { rgb: theme.bannerFg },
          },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: HEADER_BORDER,
        };
        continue;
      }

      // 2. صف العنوان الفرعي (الإحصائي)
      if (options.subtitleBanner && r === (options.titleBanner ? 1 : 0)) {
        cell.s = {
          fill: { fgColor: { rgb: 'FEF3C7' } },
          font: {
            name: 'Arial',
            sz: 10,
            bold: true,
            color: { rgb: '78350F' },
          },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: THIN_BORDER,
        };
        continue;
      }

      // 3. صف رؤوس الأعمدة
      if (r === headerRowIdx) {
        cell.s = {
          fill: { fgColor: { rgb: theme.headerBg } },
          font: {
            name: 'Arial',
            sz: 11,
            bold: true,
            color: { rgb: theme.headerFg },
          },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: HEADER_BORDER,
        };
        continue;
      }

      // 4. صفوف البيانات
      const dataRowIndex = r - (headerRowIdx + 1);
      const isEven = dataRowIndex % 2 === 0;
      const colName = headers[c] || '';
      const rawVal = cell.v;
      const strVal = String(rawVal ?? '').trim();

      let bgRgb = isEven ? 'FFFFFF' : 'F8FAFC';
      let fgRgb = '0F172A';
      let isBold = false;
      let hAlign: 'center' | 'right' | 'left' = 'center';

      // محاذاة يمين للنصوص الطويلة كالأسماء والمستويات والمقررات
      if (
        colName.includes('الاسم') ||
        colName.includes('المستوى') ||
        colName.includes('المقرر') ||
        colName.includes('الفئة') ||
        colName.includes('المقيمون') ||
        colName.includes('البند')
      ) {
        hAlign = 'right';
      }

      if (colName.includes('الاسم')) {
        isBold = true;
        fgRgb = '0F172A';
      }

      // تلوين عمود المركز والترتيب
      if (colName.includes('المركز') || colName.includes('الترتيب')) {
        isBold = true;
        if (rawVal === 1 || strVal === '1') {
          bgRgb = 'FEF08A'; // ذهبي للمركز الأول
          fgRgb = '713F12';
        } else if (rawVal === 2 || strVal === '2') {
          bgRgb = 'E2E8F0'; // فضي للمركز الثاني
          fgRgb = '1E293B';
        } else if (rawVal === 3 || strVal === '3') {
          bgRgb = 'FED7AA'; // برونزي للمركز الثالث
          fgRgb = '7C2D12';
        } else if (strVal.includes('غير حافظ')) {
          bgRgb = 'FFE4E6';
          fgRgb = '9F1239';
        }
      }

      // تلوين عمود المستوى أو التصنيف
      if (colName === 'مستوى المشاركة' || colName === 'اسم المستوى' || colName === 'التصنيف الإحصائي') {
        bgRgb = isEven ? 'EEF2FF' : 'E0E7FF';
        fgRgb = '312E81';
        isBold = true;
      }

      // تلوين عمود المقرر / الأجزاء
      if (colName.includes('المقرر')) {
        bgRgb = isEven ? 'F0FDF4' : 'DCFCE7';
        fgRgb = '065F46';
        isBold = true;
      }

      // تلوين حالة الحفظ
      if (colName === 'حالة الحفظ') {
        isBold = true;
        if (strVal === 'حافظ') {
          bgRgb = 'D1FAE5';
          fgRgb = '065F46';
        } else if (strVal.includes('غير حافظ')) {
          bgRgb = 'FFE4E6';
          fgRgb = '9F1239';
        } else {
          bgRgb = 'FEF3C7';
          fgRgb = '92400E';
        }
      }

      // تلوين أعمدة تقييمات المقيمين
      if (colName.startsWith('تقييم:')) {
        isBold = true;
        if (strVal.includes('غير حافظ')) {
          bgRgb = 'FFE4E6';
          fgRgb = '9F1239';
        } else if (strVal !== '-' && strVal !== '') {
          bgRgb = 'E0F2FE';
          fgRgb = '075985';
        } else {
          fgRgb = '94A3B8';
        }
      }

      // تلوين المتوسط والدرجة النهائية
      if (
        colName.includes('المتوسط') ||
        colName === 'متوسط الدرجات' ||
        colName === 'النسبة المئوية'
      ) {
        isBold = true;
        if (strVal.includes('غير حافظ')) {
          bgRgb = 'FFE4E6';
          fgRgb = '9F1239';
        } else if (strVal === 'لم يقيم' || strVal === '-') {
          bgRgb = 'FEF3C7';
          fgRgb = '92400E';
        } else {
          bgRgb = 'D1FAE5';
          fgRgb = '065F46';
        }
      }

      // تلوين إجمالي الخصم
      if (colName === 'إجمالي الخصم' && strVal !== '-' && Number(rawVal) > 0) {
        bgRgb = 'FFF1F2';
        fgRgb = 'BE123C';
        isBold = true;
      }

      // تلوين التقدير العام
      if (colName === 'التقدير العام') {
        isBold = true;
        if (strVal.includes('ممتاز')) {
          bgRgb = 'A7F3D0';
          fgRgb = '064E3B';
        } else if (strVal.includes('جيد جداً') || strVal.includes('جيد جدا')) {
          bgRgb = 'BFDBFE';
          fgRgb = '1E3A8A';
        } else if (strVal.includes('جيد')) {
          bgRgb = 'FDE68A';
          fgRgb = '78350F';
        } else if (strVal.includes('مقبول')) {
          bgRgb = 'FED7AA';
          fgRgb = '7C2D12';
        } else if (strVal.includes('غير حافظ') || strVal.includes('ضعيف') || strVal.includes('راسب')) {
          bgRgb = 'FECDD3';
          fgRgb = '881337';
        } else {
          bgRgb = 'F1F5F9';
          fgRgb = '475569';
        }
      }

      cell.s = {
        fill: { fgColor: { rgb: bgRgb } },
        font: {
          name: 'Arial',
          sz: 10,
          bold: isBold,
          color: { rgb: fgRgb },
        },
        alignment: { horizontal: hAlign, vertical: 'center', wrapText: true },
        border: THIN_BORDER,
      };
    }
  }

  return ws;
}

export function createStyledWorkbook() {
  const wb = XLSXStyle.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  return wb;
}

export function appendStyledSheet(wb: any, ws: any, sheetName: string, index = 1) {
  const uniqueName = ensureUniqueSheetName(wb, sheetName, index);
  XLSXStyle.utils.book_append_sheet(wb, ws, uniqueName);
}

export function writeStyledWorkbookFile(wb: any, fileName: string) {
  XLSXStyle.writeFile(wb, fileName);
}
