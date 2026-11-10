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

/**
 * إنشاء ورقة عمل إكسل للجدول الشامل المدمج:
 * - كل متسابق يمثل سجلاً واحداً:
 *   1. خلايا بيانات المتسابق الأساسية مدمجة عمودياً (rowSpan) بعدد المقيمين الذين قيموه.
 *   2. خلايا التقييم مقسمة أفقياً وعمودياً بحيث يكون كل مقيم في صف مستقل أمام نفس المتسابق (اسم المقيم، درجات المقاطع م1..مN، خصم المقيم، درجة المقيم، ملاحظاته).
 *   3. خلايا المتوسطات (متوسط كل مقطع، أعلى/أدنى تقييم، الفارق، متوسط الخصم، الدرجة النهائية المعتمدة، النسبة، التقدير) مدمجة عمودياً (rowSpan) لكل متسابق.
 */
export function createComprehensiveMergedSheet(
  results: any[],
  options: {
    compName: string;
    titleBanner?: string;
    subtitleBanner?: string;
    maxSegmentsCount?: number;
    getEvaluatorName: (evaluatorId: number, fallbackName?: string) => string;
    formatJuzsDisplay: (raw?: string) => string;
  }
) {
  const maxSegments = Math.max(
    1,
    options.maxSegmentsCount || 3,
    ...results.map(r => Number(r.segmentsCount || 3))
  );

  // المجموعة 1: بيانات المتسابق (مدمجة عمودياً لكل متسابق)
  const studentHeaders = [
    'م',
    'المركز بالمستوى',
    'الترتيب العام',
    'رقم الطلب',
    'الاسم الكامل',
    'الرقم المدني',
    'رقم الهاتف',
    'الجنس',
    'الولاية',
    'مستوى المشاركة',
    'المقرر / الأجزاء',
    'تاريخ التسجيل',
    'الدرجة العظمى',
  ];

  // المجموعة 2: بيانات التقييم التفصيلية لكل مقيم (خلايا مقسمة - كل مقيم في صف)
  const evaluatorSegmentHeaders = Array.from(
    { length: maxSegments },
    (_, idx) => `م${idx + 1} (المقيم)`
  );
  const evaluatorHeaders = [
    'المقيم المعتمد',
    ...evaluatorSegmentHeaders,
    'خصم المقيم',
    'درجة المقيم',
    'ملاحظات المقيم',
  ];

  // المجموعة 3: خلاصة المتوسطات والدرجة النهائية المعتمدة (مدمجة عمودياً لكل متسابق)
  const avgSegmentHeaders = Array.from(
    { length: maxSegments },
    (_, idx) => `متوسط م${idx + 1}`
  );
  const summaryHeaders = [
    ...avgSegmentHeaders,
    'عدد المقيمين',
    'أعلى تقييم',
    'أدنى تقييم',
    'فارق التقييمين',
    'متوسط الخصم',
    'الدرجة النهائية المعتمدة',
    'النسبة المئوية',
    'التقدير العام',
  ];

  const allHeaders = [...studentHeaders, ...evaluatorHeaders, ...summaryHeaders];
  const colCount = allHeaders.length;

  const studentColStart = 0;
  const studentColEnd = studentHeaders.length - 1;
  const evalColStart = studentHeaders.length;
  const evalColEnd = evalColStart + evaluatorHeaders.length - 1;
  const summaryColStart = evalColEnd + 1;
  const summaryColEnd = colCount - 1;

  const aoa: any[][] = [];
  const merges: any[] = [];
  const rowHeights: { hpt: number }[] = [];

  // 1. صف العنوان الرئيسي
  const titleText =
    options.titleBanner ||
    `${options.compName} — الجدول الشامل المدمج لبيانات المتسابقين وتفاصيل تقييمات المقيمين والمتوسطات`;
  const titleRow = new Array(colCount).fill('');
  titleRow[0] = titleText;
  aoa.push(titleRow);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });
  rowHeights.push({ hpt: 34 });

  // 2. صف العنوان الفرعي
  const subText =
    options.subtitleBanner ||
    `إجمالي المتسابقين: ${results.length} | كل متسابق في سجل موحد (بيانات المتسابق مدمجة + تقييم كل مقيم في صف مستقل + المتوسطات والدرجة النهائية مدمجة)`;
  const subRow = new Array(colCount).fill('');
  subRow[0] = subText;
  aoa.push(subRow);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });
  rowHeights.push({ hpt: 24 });

  // 3. صف عناوين المجموعات الثلاث الرئيسية
  const groupHeaderRowIdx = 2;
  const groupRow = new Array(colCount).fill('');
  groupRow[studentColStart] = 'أولاً: بيانات المتسابق الأساسية والمستوى (خلايا مدمجة لكل متسابق)';
  groupRow[evalColStart] = 'ثانياً: بيانات التقييم التفصيلية لكل مقيم (خلايا مقسمة — كل مقيم في صف مستقل)';
  groupRow[summaryColStart] = 'ثالثاً: خلاصة المتوسطات والدرجة النهائية المعتمدة (خلايا مدمجة لكل متسابق)';
  aoa.push(groupRow);
  merges.push(
    { s: { r: groupHeaderRowIdx, c: studentColStart }, e: { r: groupHeaderRowIdx, c: studentColEnd } },
    { s: { r: groupHeaderRowIdx, c: evalColStart }, e: { r: groupHeaderRowIdx, c: evalColEnd } },
    { s: { r: groupHeaderRowIdx, c: summaryColStart }, e: { r: groupHeaderRowIdx, c: summaryColEnd } }
  );
  rowHeights.push({ hpt: 26 });

  // 4. صف عناوين الأعمدة الفرعية
  const subHeaderRowIdx = 3;
  aoa.push(allHeaders);
  rowHeights.push({ hpt: 28 });

  // تتبع نطاق صفوف كل متسابق لتلوينها ورسم الحدود الفاصلة بين كل متسابق والذي يليه
  interface StudentRowBlockMeta {
    startRow: number;
    endRow: number;
    studentIndex: number;
    isTop3: boolean;
    isUnmemorized: boolean;
    hasEvaluations: boolean;
  }
  const studentBlocks: StudentRowBlockMeta[] = [];

  if (results.length === 0) {
    const emptyRow = new Array(colCount).fill('-');
    emptyRow[4] = 'لا يوجد متسابقون مطابقون للتصفية الحالية';
    aoa.push(emptyRow);
    rowHeights.push({ hpt: 26 });
  } else {
    results.forEach((r, sIdx) => {
      const evals = Array.isArray(r.evaluations) ? r.evaluations : [];
      const spanCount = Math.max(1, evals.length);
      const startRow = aoa.length;
      const endRow = startRow + spanCount - 1;

      const studentCommonValues = [
        sIdx + 1,
        r.isUnmemorized
          ? 'غير حافظ'
          : r.rankInLevel !== null
          ? r.rankInLevel
          : '-',
        r.isUnmemorized
          ? 'غير حافظ'
          : r.overallRank !== null
          ? r.overallRank
          : '-',
        r.participant?.requestNumber || '-',
        r.participant?.name || '-',
        r.participant?.civilId || '-',
        r.participant?.phone || '-',
        r.participant?.gender || '-',
        r.participant?.wilayat || '-',
        r.level?.name || '-',
        options.formatJuzsDisplay(
          r.participant?.juzsOrSurahs || r.level?.juzsOrSurahs || ''
        ),
        r.participant?.registrationDate || '-',
        r.maxScore ?? 100,
      ];

      const summaryCommonValues = [
        ...Array.from({ length: maxSegments }, (_, segIdx) => {
          if (segIdx >= (r.segmentsCount || maxSegments)) return '—';
          if (r.isUnmemorized) return 0;
          const val = r.segmentAverages?.[segIdx];
          return val !== null && val !== undefined ? val : '-';
        }),
        r.evaluationsCount ?? 0,
        r.highestEvalScore !== null && r.highestEvalScore !== undefined
          ? r.highestEvalScore
          : '-',
        r.lowestEvalScore !== null && r.lowestEvalScore !== undefined
          ? r.lowestEvalScore
          : '-',
        r.evaluationsCount > 1 ? r.evalSpread : '-',
        r.isUnmemorized
          ? r.maxScore
          : r.totalDeductions !== null && r.totalDeductions !== undefined
          ? r.totalDeductions
          : '-',
        r.isUnmemorized
          ? 'غير حافظ (0)'
          : r.averageScore !== null && r.averageScore !== undefined
          ? r.averageScore
          : 'لم يقيم',
        r.percentage !== null && r.percentage !== undefined && !r.isUnmemorized
          ? `${r.percentage}%`
          : '-',
        r.gradeInfo?.label || '-',
      ];

      for (let k = 0; k < spanCount; k++) {
        const ev = evals[k];
        let evaluatorValues: any[];

        if (ev) {
          const evName = options.getEvaluatorName(
            ev.evaluatorId,
            ev.evaluatorName
          );
          const segCells = Array.from({ length: maxSegments }, (_, segIdx) => {
            if (segIdx >= (r.segmentsCount || maxSegments)) return '—';
            if (ev.isUnmemorized) return '0 (غير حافظ)';
            const foundSeg = (ev.segments || []).find(
              (s: any, i: number) =>
                Number(s.segmentNumber || i + 1) === segIdx + 1
            );
            if (!foundSeg) return '-';
            return foundSeg.isUnmemorized ? 0 : Number(foundSeg.score ?? 0);
          });
          const evScore = ev.isUnmemorized ? 0 : Number(ev.totalScore ?? 0);
          const evDeduction = ev.isUnmemorized
            ? r.maxScore
            : Math.max(0, Number(((r.maxScore || 100) - evScore).toFixed(2)));
          evaluatorValues = [
            evName,
            ...segCells,
            evDeduction,
            ev.isUnmemorized ? 'غير حافظ (0)' : evScore,
            ev.notes ? String(ev.notes).trim() : '-',
          ];
        } else {
          evaluatorValues = [
            'بانتظار التقييم',
            ...Array.from({ length: maxSegments }, () => '-'),
            '-',
            'لم يقيم',
            '-',
          ];
        }

        const rowCells = [
          ...(k === 0
            ? studentCommonValues
            : new Array(studentHeaders.length).fill('')),
          ...evaluatorValues,
          ...(k === 0
            ? summaryCommonValues
            : new Array(summaryHeaders.length).fill('')),
        ];

        aoa.push(rowCells);
        rowHeights.push({ hpt: 24 });
      }

      // دمج خلايا بيانات المتسابق وخلايا المتوسطات والنتيجة النهائية عمودياً إذا كان للمتسابق أكثر من مقيم
      if (spanCount > 1) {
        for (let c = studentColStart; c <= studentColEnd; c++) {
          merges.push({
            s: { r: startRow, c },
            e: { r: endRow, c },
          });
        }
        for (let c = summaryColStart; c <= summaryColEnd; c++) {
          merges.push({
            s: { r: startRow, c },
            e: { r: endRow, c },
          });
        }
      }

      studentBlocks.push({
        startRow,
        endRow,
        studentIndex: sIdx,
        isTop3: r.rankInLevel !== null && r.rankInLevel <= 3 && !r.isUnmemorized,
        isUnmemorized: Boolean(r.isUnmemorized),
        hasEvaluations: evals.length > 0,
      });
    });
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  (ws as any)['!views'] = [{ rightToLeft: true }];
  ws['!merges'] = merges;
  ws['!rows'] = rowHeights;

  // ضبط عرض الأعمدة بعناية
  ws['!cols'] = allHeaders.map((h, cIdx) => {
    if (cIdx === 0) return { wch: 6 }; // م
    if (cIdx === 1 || cIdx === 2) return { wch: 13 }; // المركز والترتيب
    if (cIdx === 3) return { wch: 14 }; // رقم الطلب
    if (cIdx === 4) return { wch: 30 }; // الاسم الكامل
    if (cIdx === 5 || cIdx === 6) return { wch: 15 }; // الرقم المدني والهاتف
    if (cIdx === 7) return { wch: 10 }; // الجنس
    if (cIdx === 8) return { wch: 16 }; // الولاية
    if (cIdx === 9) return { wch: 24 }; // مستوى المشاركة
    if (cIdx === 10) return { wch: 26 }; // المقرر / الأجزاء
    if (cIdx === 11) return { wch: 18 }; // تاريخ التسجيل
    if (cIdx === 12) return { wch: 12 }; // الدرجة العظمى
    if (cIdx === evalColStart) return { wch: 24 }; // المقيم المعتمد
    if (cIdx === evalColEnd) return { wch: 26 }; // ملاحظات المقيم
    if (h.includes('الدرجة النهائية')) return { wch: 20 };
    if (h.includes('التقدير')) return { wch: 22 };
    return { wch: Math.max(12, h.length + 4) };
  });

  // خريطة لمعرفة ब्लॉक كل صف
  const rowToBlockMap = new Map<number, StudentRowBlockMeta>();
  studentBlocks.forEach(b => {
    for (let r = b.startRow; r <= b.endRow; r++) {
      rowToBlockMap.set(r, b);
    }
  });

  // تنسيق كافة الخلايا بألوان واضحة وحدود فاصلة سميكة بين كل متسابق وآخر
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSXStyle.utils.encode_cell({ r, c });
      if (!ws[cellRef]) {
        ws[cellRef] = { t: 's', v: '' };
      }
      const cell = ws[cellRef];

      // 1. العنوان الرئيسي
      if (r === 0) {
        cell.s = {
          fill: { fgColor: { rgb: '09152C' } },
          font: { name: 'Arial', sz: 13, bold: true, color: { rgb: 'FDE68A' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: HEADER_BORDER,
        };
        continue;
      }

      // 2. العنوان الفرعي
      if (r === 1) {
        cell.s = {
          fill: { fgColor: { rgb: 'FEF3C7' } },
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '78350F' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: THIN_BORDER,
        };
        continue;
      }

      // 3. صف المجموعات الثلاث
      if (r === groupHeaderRowIdx) {
        const groupBg =
          c <= studentColEnd
            ? '0F172A'
            : c <= evalColEnd
            ? '1E3A8A'
            : '064E3B';
        cell.s = {
          fill: { fgColor: { rgb: groupBg } },
          font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: HEADER_BORDER,
        };
        continue;
      }

      // 4. صف عناوين الأعمدة
      if (r === subHeaderRowIdx) {
        const subHeaderBg =
          c <= studentColEnd
            ? '1E293B'
            : c <= evalColEnd
            ? '1D4ED8'
            : '047857';
        cell.s = {
          fill: { fgColor: { rgb: subHeaderBg } },
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: HEADER_BORDER,
        };
        continue;
      }

      // 5. صفوف بيانات المتسابقين
      const block = rowToBlockMap.get(r);
      const isStudentEven = block ? block.studentIndex % 2 === 0 : r % 2 === 0;
      const evalSubRowIdx = block ? r - block.startRow : 0;
      const isBlockTop = block ? r === block.startRow : true;
      const isBlockBottom = block ? r === block.endRow : true;

      const colName = allHeaders[c] || '';
      const masterRow = block ? block.startRow : r;
      const effectiveVal =
        c <= studentColEnd || c >= summaryColStart
          ? aoa[masterRow]?.[c]
          : cell.v;
      const strVal = String(effectiveVal ?? '').trim();

      let bgRgb = isStudentEven ? 'FFFFFF' : 'F8FAFC';
      let fgRgb = '0F172A';
      let isBold = false;
      let hAlign: 'center' | 'right' | 'left' = 'center';

      if (c <= studentColEnd) {
        // تنسيق خلايا بيانات المتسابق المدمجة
        if (block?.isUnmemorized) {
          bgRgb = 'FFF1F2';
        } else if (block?.isTop3) {
          bgRgb = 'FFFBEB';
        }
        if (
          colName === 'الاسم الكامل' ||
          colName === 'مستوى المشاركة' ||
          colName === 'المقرر / الأجزاء'
        ) {
          hAlign = 'right';
          isBold = true;
        }
        if (colName === 'المركز بالمستوى' || colName === 'الترتيب العام') {
          isBold = true;
          if (effectiveVal === 1 || strVal === '1') {
            bgRgb = 'FEF08A';
            fgRgb = '713F12';
          } else if (effectiveVal === 2 || strVal === '2') {
            bgRgb = 'E2E8F0';
            fgRgb = '1E293B';
          } else if (effectiveVal === 3 || strVal === '3') {
            bgRgb = 'FED7AA';
            fgRgb = '7C2D12';
          }
        }
      } else if (c >= evalColStart && c <= evalColEnd) {
        // تنسيق خلايا المقيمين المقسمة (كل مقيم بلون متناوب واضح داخل سجل الطالب)
        bgRgb = evalSubRowIdx % 2 === 0 ? 'EFF6FF' : 'DBEAFE';
        fgRgb = '1E3A8A';
        if (colName === 'المقيم المعتمد' || colName === 'ملاحظات المقيم') {
          hAlign = 'right';
          isBold = colName === 'المقيم المعتمد';
        }
        if (colName === 'درجة المقيم') {
          isBold = true;
          bgRgb = evalSubRowIdx % 2 === 0 ? 'E0F2FE' : 'BAE6FD';
          fgRgb = '0C4A6E';
        }
        if (colName === 'خصم المقيم' && strVal !== '-' && Number(effectiveVal) > 0) {
          fgRgb = 'BE123C';
          isBold = true;
        }
      } else {
        // تنسيق خلايا المتوسطات والدرجة النهائية المدمجة
        bgRgb = isStudentEven ? 'F0FDF4' : 'DCFCE7';
        fgRgb = '065F46';
        isBold = true;
        if (colName === 'الدرجة النهائية المعتمدة') {
          bgRgb = block?.isUnmemorized ? 'FFE4E6' : 'FEF3C7';
          fgRgb = block?.isUnmemorized ? '9F1239' : '78350F';
        } else if (colName === 'متوسط الخصم' && strVal !== '-' && Number(effectiveVal) > 0) {
          bgRgb = 'FFF1F2';
          fgRgb = 'BE123C';
        } else if (colName === 'التقدير العام') {
          if (strVal.includes('ممتاز')) {
            bgRgb = 'A7F3D0';
            fgRgb = '064E3B';
          } else if (strVal.includes('جيد جداً') || strVal.includes('جيد جدا')) {
            bgRgb = 'BFDBFE';
            fgRgb = '1E3A8A';
          } else if (strVal.includes('جيد')) {
            bgRgb = 'FDE68A';
            fgRgb = '78350F';
          } else if (strVal.includes('غير حافظ')) {
            bgRgb = 'FECDD3';
            fgRgb = '881337';
          }
        }
      }

      // حدود فاصلة سميكة أعلى وأسفل كل متسابق لتمييز سجله المدمج بوضوح
      const cellBorder = {
        top: isBlockTop
          ? { style: 'medium', color: { rgb: '334155' } }
          : { style: 'thin', color: { rgb: '93C5FD' } },
        bottom: isBlockBottom
          ? { style: 'medium', color: { rgb: '0F172A' } }
          : { style: 'thin', color: { rgb: '93C5FD' } },
        left:
          c === studentColStart || c === evalColStart || c === summaryColStart
            ? { style: 'medium', color: { rgb: '334155' } }
            : { style: 'thin', color: { rgb: 'CBD5E1' } },
        right:
          c === studentColEnd || c === evalColEnd || c === summaryColEnd
            ? { style: 'medium', color: { rgb: '334155' } }
            : { style: 'thin', color: { rgb: 'CBD5E1' } },
      };

      cell.s = {
        fill: { fgColor: { rgb: bgRgb } },
        font: {
          name: 'Arial',
          sz: colName === 'الدرجة النهائية المعتمدة' ? 11 : 10,
          bold: isBold,
          color: { rgb: fgRgb },
        },
        alignment: { horizontal: hAlign, vertical: 'center', wrapText: true },
        border: cellBorder,
      };
    }
  }

  return ws;
}

