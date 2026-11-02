import { quranPageMap, surahNames, surahAyahCounts, juzPagesMap, pageJuzMap } from './quranData';
import { toArabicDigits } from './juzUtils';
import ayahSegmentsData from './mushafAyahSegments.json';
import {
  PassageSelectionMode,
  PassageDifficultyTier,
  ManualPassageRange,
} from '../types';

const allSegments = ayahSegmentsData as unknown as Record<
  string,
  [number, number, number, number, number, number, number][]
>;

export interface PassageHighlight {
  page: number;
  topPercent: number; // Vertical start in percentage (0 - 100)
  heightPercent: number; // Height in percentage
  label: string;
}

export interface SuggestedTestPassage {
  id: string;
  passageNumber: number; // 1, 2, 3, 4, 5, 6
  pages: number[]; // e.g. [120] or [120, 121]
  surahName: string;
  startSurahId: number;
  startAyah: number;
  endSurahId: number;
  endAyah: number;
  startPage: number;
  endPage: number;
  positionType: 'beginning' | 'middle' | 'end' | 'cross-page' | 'full';
  positionLabel: string;
  description: string;
  shortLabel: string;
  highlights: Record<number, PassageHighlight>;
  actualLinesCount?: number;
  juzNumber?: number;
  difficulty?: PassageDifficultyTier;
  difficultyLabel?: string;
  categoryNote?: string;
  sourceMode?: PassageSelectionMode;
}

export const DIFFICULTY_LABELS: Record<PassageDifficultyTier, string> = {
  hard: 'الأكثر صعوبة',
  medium: 'متوسطة',
  easy: 'الأقل صعوبة',
};

/**
 * Format a test passage into a single, concise unified text.
 * Example: "صفحة 581-582 (المرسلات 45 إلى النبأ 7)"
 */
export function formatPassageDescription(
  pages: number[],
  startSurahId: number,
  startAyah: number,
  endSurahId: number,
  endAyah: number
): string {
  const pagesText =
    pages.length > 1
      ? `صفحة ${toArabicDigits(pages[0])}-${toArabicDigits(pages[pages.length - 1])}`
      : `صفحة ${toArabicDigits(pages[0])}`;

  const surahName1 = surahNames[startSurahId] || '';
  const surahName2 = surahNames[endSurahId] || '';

  let ayahsText = '';
  if (startSurahId === endSurahId) {
    ayahsText =
      startAyah === endAyah
        ? `${surahName1} ${toArabicDigits(startAyah)}`
        : `${surahName1} ${toArabicDigits(startAyah)} إلى ${toArabicDigits(endAyah)}`;
  } else {
    ayahsText = `${surahName1} ${toArabicDigits(startAyah)} إلى ${surahName2} ${toArabicDigits(endAyah)}`;
  }

  return `${pagesText} (${ayahsText})`;
}

interface PageVerseInfo {
  page: number;
  surah: number;
  ayah: number;
  firstLine: number;
  lastLine: number;
  linesCount: number;
}

/**
 * استخراج آيات الصفحة مع حساب عدد الأسطر الفعلية الدقيقة لكل آية
 * بناءً على الإحداثيات الفعلية لبيانات مقاطع المصحف (15 سطراً)
 */
export function getPageVerses(page: number): PageVerseInfo[] {
  const segs = allSegments[String(page)] || [];
  if (segs.length === 0) {
    const pageEntries = quranPageMap[page] || [];
    const res: PageVerseInfo[] = [];
    const totalAyahs = pageEntries.reduce((acc, ent) => acc + (ent.end - ent.start + 1), 0);
    const avgLines = Math.max(0.5, 14 / Math.max(1, totalAyahs));
    for (const ent of pageEntries) {
      for (let a = ent.start; a <= ent.end; a++) {
        res.push({
          page,
          surah: ent.surah,
          ayah: a,
          firstLine: 1,
          lastLine: 15,
          linesCount: avgLines,
        });
      }
    }
    return res;
  }

  // حساب عرض النص الإجمالي لكل سطر لحساب الكسر الفعلي الدقيق
  const lineTotals = new Map<number, number>();
  for (const [, , line, minX, maxX] of segs) {
    lineTotals.set(line, (lineTotals.get(line) || 0) + Math.max(0, maxX - minX));
  }

  const verseMap = new Map<string, PageVerseInfo>();
  const orderedKeys: string[] = [];

  for (const [surah, ayah, line, minX, maxX] of segs) {
    const key = `${surah}:${ayah}`;
    const width = Math.max(0, maxX - minX);
    const lineTotal = lineTotals.get(line) || 1;
    const fraction = lineTotal > 0 ? width / lineTotal : 0;

    if (!verseMap.has(key)) {
      verseMap.set(key, {
        page,
        surah,
        ayah,
        firstLine: line,
        lastLine: line,
        linesCount: fraction,
      });
      orderedKeys.push(key);
    } else {
      const v = verseMap.get(key)!;
      v.firstLine = Math.min(v.firstLine, line);
      v.lastLine = Math.max(v.lastLine, line);
      v.linesCount += fraction;
    }
  }

  return orderedKeys.map(k => verseMap.get(k)!);
}

/**
 * إيجاد رقم الصفحة التي تقع فيها آية محددة من سورة محددة
 */
export function findPageForSurahAyah(surahId: number, ayah: number): number {
  for (let p = 1; p <= 604; p++) {
    const entries = quranPageMap[p] || [];
    for (const ent of entries) {
      if (ent.surah === surahId && ayah >= ent.start && ayah <= ent.end) {
        return p;
      }
    }
  }
  return 1;
}

/**
 * بناء مقطع اختبار كامل محسوب بدقة من نقطة بداية (صفحة + ترتيب الآية أو السورة والآية)
 * وبعدد أسطر فعلية محدد من المشرف
 */
export function buildPassageFromPageAnchor(
  startPage: number,
  anchorRatio: number, // 0.0 (بداية الصفحة) إلى 0.85 (نهاية الصفحة/ممتد)
  targetLinesPerSegment: number = 7,
  passageNumber: number = 1,
  extraMeta?: {
    idPrefix?: string;
    juzNumber?: number;
    difficulty?: PassageDifficultyTier;
    categoryNote?: string;
    sourceMode?: PassageSelectionMode;
    preferredStartSurahId?: number;
    preferredStartAyah?: number;
  }
): SuggestedTestPassage {
  const safePage = Math.max(1, Math.min(604, startPage));
  const targetLines = Math.max(1, Math.min(20, Number(targetLinesPerSegment) || 7));

  // جمع الآيات من الصفحة الحالية والصفحتين التاليتين لتغطية أي عدد أسطر (حتى 20 سطراً)
  const combinedVerses: PageVerseInfo[] = [
    ...getPageVerses(safePage),
    ...(safePage < 604 ? getPageVerses(safePage + 1) : []),
    ...(safePage + 1 < 604 ? getPageVerses(safePage + 2) : []),
  ];

  const firstPageVersesCount = getPageVerses(safePage).length;
  if (combinedVerses.length === 0 || firstPageVersesCount === 0) {
    return createFallbackPassage(passageNumber, safePage, targetLines);
  }

  let startIdx = 0;
  if (extraMeta?.preferredStartSurahId && extraMeta?.preferredStartAyah) {
    const exactIdx = combinedVerses.findIndex(
      v =>
        v.surah === extraMeta.preferredStartSurahId &&
        v.ayah === extraMeta.preferredStartAyah
    );
    if (exactIdx !== -1) {
      startIdx = exactIdx;
    } else {
      startIdx = Math.min(
        firstPageVersesCount - 1,
        Math.max(0, Math.floor(anchorRatio * firstPageVersesCount))
      );
    }
  } else {
    startIdx = Math.min(
      firstPageVersesCount - 1,
      Math.max(0, Math.floor(anchorRatio * firstPageVersesCount))
    );
  }

  // إذا كان المقطع لا ينبغي أن يمتد لصفحة تالية وكان قريباً من النهاية، نضبط نقطة البداية
  let bestEndIdx = startIdx;
  let bestLinesSum = 0;
  let minDiff = Infinity;

  let runningSum = 0;
  for (let j = startIdx; j < combinedVerses.length; j++) {
    runningSum += combinedVerses[j].linesCount;
    const diff = Math.abs(runningSum - targetLines);
    if (diff < minDiff) {
      minDiff = diff;
      bestEndIdx = j;
      bestLinesSum = runningSum;
    }
    if (runningSum >= targetLines + 1.5) break;
  }

  const startV = combinedVerses[startIdx];
  const endV = combinedVerses[bestEndIdx];

  const pagesSet = new Set<number>();
  const linesByPage = new Map<number, { firstLine: number; lastLine: number; sum: number; startAyah: number; endAyah: number }>();

  for (let k = startIdx; k <= bestEndIdx; k++) {
    const v = combinedVerses[k];
    pagesSet.add(v.page);
    const existing = linesByPage.get(v.page);
    if (!existing) {
      linesByPage.set(v.page, {
        firstLine: v.firstLine,
        lastLine: v.lastLine,
        sum: v.linesCount,
        startAyah: v.ayah,
        endAyah: v.ayah,
      });
    } else {
      existing.firstLine = Math.min(existing.firstLine, v.firstLine);
      existing.lastLine = Math.max(existing.lastLine, v.lastLine);
      existing.sum += v.linesCount;
      existing.endAyah = v.ayah;
    }
  }

  const pagesList = Array.from(pagesSet).sort((a, b) => a - b);
  const actualStartPage = pagesList[0] || safePage;
  const actualEndPage = pagesList[pagesList.length - 1] || safePage;

  let posType: 'beginning' | 'middle' | 'end' | 'cross-page' = 'middle';
  if (actualEndPage > actualStartPage) {
    posType = 'cross-page';
  } else if (startV.firstLine <= 3) {
    posType = 'beginning';
  } else if (endV.lastLine >= 13) {
    posType = 'end';
  }

  const highlights: Record<number, PassageHighlight> = {};
  for (const p of pagesList) {
    const info = linesByPage.get(p)!;
    const topPercent = Math.max(2, Math.min(88, Math.round(((info.firstLine - 1) / 15) * 100) + 2));
    const heightPercent = Math.min(96 - topPercent, Math.max(14, Math.round((info.sum / 15) * 100)));
    highlights[p] = {
      page: p,
      topPercent,
      heightPercent,
      label:
        pagesList.length === 1
          ? `آية ${toArabicDigits(startV.ayah)} إلى ${toArabicDigits(endV.ayah)}`
          : p === actualStartPage
          ? `من آية ${toArabicDigits(info.startAyah)}`
          : p === actualEndPage
          ? `إلى آية ${toArabicDigits(info.endAyah)}`
          : 'امتداد المقطع',
    };
  }

  const surahName1 = surahNames[startV.surah] || '';
  const surahName2 = surahNames[endV.surah] || '';
  const sameSurah = startV.surah === endV.surah;

  const desc = formatPassageDescription(
    pagesList,
    startV.surah,
    startV.ayah,
    endV.surah,
    endV.ayah
  );

  const positionLabel =
    pagesList.length > 1
      ? `ص ${toArabicDigits(actualStartPage)}-${toArabicDigits(actualEndPage)}`
      : `ص ${toArabicDigits(actualStartPage)}`;

  const resolvedJuz = extraMeta?.juzNumber || pageJuzMap[actualStartPage] || 1;

  return {
    id: `${extraMeta?.idPrefix || 'passage'}-${passageNumber}-${actualStartPage}-${startV.surah}-${startV.ayah}`,
    passageNumber,
    pages: pagesList,
    surahName: sameSurah ? surahName1 : `${surahName1} / ${surahName2}`,
    startSurahId: startV.surah,
    startAyah: startV.ayah,
    endSurahId: endV.surah,
    endAyah: endV.ayah,
    startPage: actualStartPage,
    endPage: actualEndPage,
    positionType: posType,
    positionLabel,
    description: desc,
    shortLabel: positionLabel,
    highlights,
    actualLinesCount: Math.max(0.5, Math.round(bestLinesSum * 10) / 10),
    juzNumber: resolvedJuz,
    difficulty: extraMeta?.difficulty,
    difficultyLabel: extraMeta?.difficulty ? DIFFICULTY_LABELS[extraMeta.difficulty] : undefined,
    categoryNote: extraMeta?.categoryNote,
    sourceMode: extraMeta?.sourceMode || 'random',
  };
}

/**
 * بناء مقطع اختبار كامل من نطاق يدوي يحدده المشرف (من سورة/آية إلى سورة/آية)
 */
export function buildPassageFromManualRange(
  range: ManualPassageRange,
  passageNumber: number = 1
): SuggestedTestPassage {
  let sSurah = Math.max(1, Math.min(114, Number(range.startSurahId) || 1));
  let eSurah = Math.max(1, Math.min(114, Number(range.endSurahId) || sSurah));

  if (eSurah < sSurah) {
    const tmp = sSurah;
    sSurah = eSurah;
    eSurah = tmp;
  }

  const maxStartAyah = surahAyahCounts[sSurah] || 7;
  const maxEndAyah = surahAyahCounts[eSurah] || 7;

  let sAyah = Math.max(1, Math.min(maxStartAyah, Number(range.startAyah) || 1));
  let eAyah = Math.max(1, Math.min(maxEndAyah, Number(range.endAyah) || sAyah));

  if (sSurah === eSurah && eAyah < sAyah) {
    const tmp = sAyah;
    sAyah = eAyah;
    eAyah = tmp;
  }

  const startPage = findPageForSurahAyah(sSurah, sAyah);
  const endPage = Math.max(startPage, findPageForSurahAyah(eSurah, eAyah));

  const pagesList: number[] = [];
  for (let p = startPage; p <= Math.min(endPage, startPage + 15); p++) {
    pagesList.push(p);
  }
  if (pagesList.length === 0) pagesList.push(startPage);

  let totalLines = 0;
  const highlights: Record<number, PassageHighlight> = {};

  for (const p of pagesList) {
    const pVerses = getPageVerses(p).filter(v => {
      const afterStart = v.surah > sSurah || (v.surah === sSurah && v.ayah >= sAyah);
      const beforeEnd = v.surah < eSurah || (v.surah === eSurah && v.ayah <= eAyah);
      return afterStart && beforeEnd;
    });

    if (pVerses.length > 0) {
      const firstLine = Math.min(...pVerses.map(v => v.firstLine));
      const lastLine = Math.max(...pVerses.map(v => v.lastLine));
      const pageLinesSum = pVerses.reduce((acc, v) => acc + v.linesCount, 0);
      totalLines += pageLinesSum;

      const topPercent = Math.max(2, Math.min(88, Math.round(((firstLine - 1) / 15) * 100) + 2));
      const heightPercent = Math.min(
        96 - topPercent,
        Math.max(14, Math.round(((lastLine - firstLine + 1) / 15) * 100))
      );

      highlights[p] = {
        page: p,
        topPercent,
        heightPercent,
        label:
          pagesList.length === 1
            ? `آية ${toArabicDigits(sAyah)} إلى ${toArabicDigits(eAyah)}`
            : p === startPage
            ? `من ${surahNames[sSurah]} ${toArabicDigits(sAyah)}`
            : p === endPage
            ? `إلى ${surahNames[eSurah]} ${toArabicDigits(eAyah)}`
            : 'امتداد المقطع اليدوي',
      };
    } else {
      highlights[p] = {
        page: p,
        topPercent: 4,
        heightPercent: 88,
        label: 'المقطع المحدد',
      };
    }
  }

  const surahName1 = surahNames[sSurah] || '';
  const surahName2 = surahNames[eSurah] || '';
  const sameSurah = sSurah === eSurah;

  const desc = formatPassageDescription(pagesList, sSurah, sAyah, eSurah, eAyah);
  const positionLabel =
    pagesList.length > 1
      ? `ص ${toArabicDigits(startPage)}-${toArabicDigits(endPage)}`
      : `ص ${toArabicDigits(startPage)}`;

  return {
    id: `manual-${range.id || passageNumber}-${startPage}-${sSurah}-${sAyah}`,
    passageNumber,
    pages: pagesList,
    surahName: sameSurah ? surahName1 : `${surahName1} / ${surahName2}`,
    startSurahId: sSurah,
    startAyah: sAyah,
    endSurahId: eSurah,
    endAyah: eAyah,
    startPage,
    endPage,
    positionType: pagesList.length > 1 ? 'cross-page' : 'middle',
    positionLabel,
    description: desc,
    shortLabel: positionLabel,
    highlights,
    actualLinesCount: Math.max(0.5, Math.round(totalLines * 10) / 10),
    juzNumber: range.juzNumber || pageJuzMap[startPage] || 1,
    categoryNote: range.notes || 'نطاق يدوي معتمد من المشرف',
    sourceMode: 'manual',
  };
}

/**
 * ============================================================================
 * التبويب الأول: استعراض خيارات المقاطع العشوائية الحالية لكل جزء (للعرض فقط)
 * ============================================================================
 */
export function getCurrentRandomPassagesForJuz(
  juzNumber: number,
  targetLinesPerSegment: number = 7
): SuggestedTestPassage[] {
  const safeJuz = Math.max(1, Math.min(30, Number(juzNumber) || 1));
  const juzPages = juzPagesMap[safeJuz] || [];
  if (juzPages.length === 0) return [];

  // 8 نقاط قياسية موزعة بتوازن على صفحات الجزء (بداية، وسط، نهاية، وممتد بين صفحتين)
  const sampleSpecs: { pageOffsetRatio: number; anchorRatio: number; labelNote: string }[] = [
    { pageOffsetRatio: 0.0, anchorRatio: 0.0, labelNote: 'مطلع الجزء — بداية الصفحة' },
    { pageOffsetRatio: 0.14, anchorRatio: 0.35, labelNote: 'الربع الأول — وسط الصفحة' },
    { pageOffsetRatio: 0.28, anchorRatio: 0.65, labelNote: 'الربع الأول — أواخر الصفحة / ممتد' },
    { pageOffsetRatio: 0.42, anchorRatio: 0.0, labelNote: 'منتصف الجزء — بداية الصفحة' },
    { pageOffsetRatio: 0.56, anchorRatio: 0.4, labelNote: 'منتصف الجزء — وسط الصفحة' },
    { pageOffsetRatio: 0.70, anchorRatio: 0.65, labelNote: 'الربع الثالث — أواخر الصفحة / ممتد' },
    { pageOffsetRatio: 0.84, anchorRatio: 0.25, labelNote: 'أواخر الجزء — وسط الصفحة' },
    { pageOffsetRatio: 0.94, anchorRatio: 0.0, labelNote: 'خواتيم الجزء — بداية الصفحة' },
  ];

  return sampleSpecs.map((spec, idx) => {
    const pageIdx = Math.min(
      juzPages.length - 1,
      Math.max(0, Math.floor(spec.pageOffsetRatio * juzPages.length))
    );
    const page = juzPages[pageIdx];
    return buildPassageFromPageAnchor(
      page,
      spec.anchorRatio,
      targetLinesPerSegment,
      idx + 1,
      {
        idPrefix: `random-juz-${safeJuz}`,
        juzNumber: safeJuz,
        categoryNote: spec.labelNote,
        sourceMode: 'random',
      }
    );
  });
}

/**
 * ============================================================================
 * التبويب الثاني: تصنيف المسابقات العالمية القرآنية لكل جزء (الأكثر صعوبة، متوسطة، الأقل)
 * ============================================================================
 */
export interface InternationalPassageSpec {
  id: string;
  juzNumber: number;
  difficulty: PassageDifficultyTier;
  pageOffsetRatio: number; // موقع الصفحة داخل الجزء
  anchorRatio: number; // موقع الآية داخل الصفحة
  note: string;
}

const JUZ_INTERNATIONAL_NOTES: Record<
  number,
  { hard: [string, string, string]; medium: [string, string, string]; easy: [string, string, string] }
> = {
  1: {
    hard: [
      'متشابهات خطاب بني إسرائيل وتعدد النعم والعهود',
      'مواضع محاججة أهل الكتاب وتقارب فواصل الآيات',
      'دقة الانتقال في آيات البقرة وأحكام النسخ والابتلاء',
    ],
    medium: [
      'سياق قصص بني إسرائيل مع موسى عليه السلام',
      'آيات خلق السماوات والأرض ومشاهد البعث',
      'بناء الكعبة المشرفة ودعوة إبراهيم وإسماعيل',
    ],
    easy: [
      'مطلع سورة البقرة وصفات المتقين والمؤمنين',
      'قصة خلق آدم عليه السلام وإسكانه الجنة',
      'آيات الصبغة الإلهية وختام الحزب الثاني',
    ],
  },
  2: {
    hard: [
      'متشابهات آيات تحويل القبلة وتكرار (فولوا وجوهكم)',
      'أحكام الحج والعمرة والإحصار والهدي والفدية',
      'تشابه الفواصل في خواتيم آيات الإنفاق والقتال',
    ],
    medium: [
      'أحكام القصاص والوصية والصيام في سورة البقرة',
      'آيات البر والتقوى وأحكام الأهلة والعتق',
      'قصص الابتلاء والملأ من بني إسرائيل بعد موسى',
    ],
    medium_alt: undefined as any,
    easy: [
      'آيات شكر النعم وذكر الله والصبر والصلاة',
      'آيات الدعاء وأحكام الاعتكاف في أواخر رمضان',
      'قصة طالوت وجالوت وثبات الفئة المؤمنة',
    ],
  } as any,
};

function getInternationalNoteForJuz(
  juz: number,
  difficulty: PassageDifficultyTier,
  slotIndex: number
): string {
  const custom = JUZ_INTERNATIONAL_NOTES[juz]?.[difficulty]?.[slotIndex];
  if (custom) return custom;

  if (difficulty === 'hard') {
    const hardReasons = [
      'متشابهات لفظية دقيقة وفواصل آيات متقاربة في المسابقات العالمية',
      'دقة التراكيب والربط بين خواتيم الآيات ومطالع الصفحات',
      'موضع اختبار معياري في المسابقات الدولية لقياس ضبط المتشابهات',
    ];
    return hardReasons[slotIndex % hardReasons.length];
  }

  if (difficulty === 'medium') {
    const mediumReasons = [
      'مقطع متوسط الصعوبة يجمع بين التسلسل الموضوعي وضبط الأداء',
      'سياق قصصي وتشريعي متوازن معتمد في لجان التحكيم الدولية',
      'موضع متوسط لقياس استرسال الحفظ وجودة الوقف والابتداء',
    ];
    return mediumReasons[slotIndex % mediumReasons.length];
  }

  const easyReasons = [
    'مقطع واضح المعالم متميز الفواصل لقياس الطلاقة وحسن التلاوة',
    'سياق قرآني مألوف الإيقاع واضح الترابط الموضوعي',
    'موضع ميسر لقياس جودة الأحكام التجويدية واستقرار الحفظ',
  ];
  return easyReasons[slotIndex % easyReasons.length];
}

/**
 * توليد قائمة المقاطع المصنفة حسب معايير المسابقات العالمية لجزء محدد
 * مع حساب البداية والنهاية الفعلية بناءً على عدد الأسطر الفعلية المحددة من المشرف
 */
export function getInternationalPassagesForJuz(
  juzNumber: number,
  targetLinesPerSegment: number = 7,
  filterDifficulty?: PassageDifficultyTier
): SuggestedTestPassage[] {
  const safeJuz = Math.max(1, Math.min(30, Number(juzNumber) || 1));
  const juzPages = juzPagesMap[safeJuz] || [];
  if (juzPages.length === 0) return [];

  // 9 مواضع معيارية لكل جزء في المسابقات العالمية: 3 الأكثر صعوبة، 3 متوسطة، 3 الأقل صعوبة
  // مرتبة بالتناوب (الأكثر صعوبة -> متوسطة -> الأقل صعوبة)
  const specs: {
    difficulty: PassageDifficultyTier;
    pageIdxOffset: number;
    anchorRatio: number;
    tierSlot: number;
  }[] = [
    // المجموعة التناوبية الأولى في الجزء
    { difficulty: 'hard', pageIdxOffset: 3, anchorRatio: 0.55, tierSlot: 0 },
    { difficulty: 'medium', pageIdxOffset: 1, anchorRatio: 0.25, tierSlot: 0 },
    { difficulty: 'easy', pageIdxOffset: 0, anchorRatio: 0.0, tierSlot: 0 },

    // المجموعة التناوبية الثانية في الجزء
    { difficulty: 'hard', pageIdxOffset: 10, anchorRatio: 0.62, tierSlot: 1 },
    { difficulty: 'medium', pageIdxOffset: 7, anchorRatio: 0.35, tierSlot: 1 },
    { difficulty: 'easy', pageIdxOffset: 5, anchorRatio: 0.0, tierSlot: 1 },

    // المجموعة التناوبية الثالثة في الجزء
    { difficulty: 'hard', pageIdxOffset: 17, anchorRatio: 0.58, tierSlot: 2 },
    { difficulty: 'medium', pageIdxOffset: 14, anchorRatio: 0.3, tierSlot: 2 },
    { difficulty: 'easy', pageIdxOffset: 12, anchorRatio: 0.0, tierSlot: 2 },
  ];

  const filteredSpecs = filterDifficulty
    ? specs.filter(s => s.difficulty === filterDifficulty)
    : specs;

  return filteredSpecs.map((spec, idx) => {
    const safePageIdx = Math.min(juzPages.length - 1, Math.max(0, spec.pageIdxOffset));
    const page = juzPages[safePageIdx];
    const note = getInternationalNoteForJuz(safeJuz, spec.difficulty, spec.tierSlot);

    return buildPassageFromPageAnchor(
      page,
      spec.anchorRatio,
      targetLinesPerSegment,
      idx + 1,
      {
        idPrefix: `intl-juz-${safeJuz}-${spec.difficulty}-${spec.tierSlot}`,
        juzNumber: safeJuz,
        difficulty: spec.difficulty,
        categoryNote: note,
        sourceMode: 'international',
      }
    );
  });
}

// عداد تناوب مستمر في الذاكرة لضمان تنوع المقاطع في كل مرة يتم فيها التقييم أو إعادة الاقتراح
let evaluationRotationCounter = 0;

export interface GeneratePassagesOptions {
  mode?: PassageSelectionMode;
  manualPassages?: ManualPassageRange[];
}

interface CandidatePassage {
  startPage: number;
  endPage: number;
  startSurahId: number;
  startAyah: number;
  endSurahId: number;
  endAyah: number;
  linesCount: number;
  positionType: 'beginning' | 'middle' | 'end' | 'cross-page';
  startLine: number;
  endLine: number;
  p1Lines: number;
  p2Lines: number;
}

/**
 * استخراج كافة المقاطع الممكنة لصفحة محددة بحيث تقع أسطرها الفعلية
 * بدقة وفق عدد الأسطر الفعلية المحدد من المشرف (أو بين 5.0 و 7.5 افتراضياً)
 */
function getCandidatePassagesForPage(
  page: number,
  canCrossPage: boolean,
  targetLinesPerSegment?: number
): CandidatePassage[] {
  const verses = getPageVerses(page);
  if (verses.length === 0) return [];

  const hasCustomTarget =
    typeof targetLinesPerSegment === 'number' &&
    !isNaN(targetLinesPerSegment) &&
    targetLinesPerSegment > 0;
  const targetLines = hasCustomTarget
    ? Math.max(1, Math.min(20, Number(targetLinesPerSegment)))
    : 6.0;

  const collectWithBounds = (minLines: number, maxLines: number): CandidatePassage[] => {
    const list: CandidatePassage[] = [];

    // 1. مقاطع داخل نفس الصفحة (بداية، وسط، نهاية)
    for (let i = 0; i < verses.length; i++) {
      let sum = 0;
      for (let j = i; j < verses.length; j++) {
        sum += verses[j].linesCount;
        if (sum >= minLines && sum <= maxLines) {
          let posType: 'beginning' | 'middle' | 'end' = 'middle';
          if (i === 0 || verses[i].firstLine <= 2) {
            posType = 'beginning';
          } else if (j === verses.length - 1 || verses[j].lastLine >= 14) {
            posType = 'end';
          }

          list.push({
            startPage: page,
            endPage: page,
            startSurahId: verses[i].surah,
            startAyah: verses[i].ayah,
            endSurahId: verses[j].surah,
            endAyah: verses[j].ayah,
            linesCount: Math.round(sum * 10) / 10,
            positionType: posType,
            startLine: verses[i].firstLine,
            endLine: verses[j].lastLine,
            p1Lines: sum,
            p2Lines: 0,
          });
        }
        if (sum > maxLines) break;
      }
    }

    // 2. مقاطع ممتدة بين صفحتين متتاليتين (cross-page)
    if (canCrossPage && page < 604) {
      const nextVerses = getPageVerses(page + 1);
      if (nextVerses.length > 0) {
        const minP1 = hasCustomTarget ? Math.max(1.0, targetLines * 0.25) : 1.5;
        const maxP1 = hasCustomTarget ? Math.min(13.5, targetLines * 0.85) : 5.2;
        const startIdx = targetLines > 9 ? 0 : Math.max(0, Math.floor(verses.length / 2));

        for (let i = startIdx; i < verses.length; i++) {
          let p1Sum = 0;
          for (let k = i; k < verses.length; k++) p1Sum += verses[k].linesCount;

          if (p1Sum >= minP1 && p1Sum <= maxP1) {
            let totalSum = p1Sum;
            for (let j = 0; j < nextVerses.length; j++) {
              totalSum += nextVerses[j].linesCount;
              if (totalSum >= minLines && totalSum <= maxLines) {
                list.push({
                  startPage: page,
                  endPage: page + 1,
                  startSurahId: verses[i].surah,
                  startAyah: verses[i].ayah,
                  endSurahId: nextVerses[j].surah,
                  endAyah: nextVerses[j].ayah,
                  linesCount: Math.round(totalSum * 10) / 10,
                  positionType: 'cross-page',
                  startLine: verses[i].firstLine,
                  endLine: nextVerses[j].lastLine,
                  p1Lines: p1Sum,
                  p2Lines: totalSum - p1Sum,
                });
              }
              if (totalSum > maxLines) break;
            }
          }
        }
      }
    }

    return list;
  };

  let candidates: CandidatePassage[] = [];
  if (hasCustomTarget) {
    candidates = collectWithBounds(
      Math.max(0.5, targetLines - 0.95),
      targetLines + 1.05
    );
    if (candidates.length === 0) {
      candidates = collectWithBounds(
        Math.max(0.5, targetLines - 1.85),
        targetLines + 1.95
      );
    }
  } else {
    candidates = collectWithBounds(4.95, 7.55);
  }

  if (candidates.length === 0) {
    let bestRange = { i: 0, j: 0, diff: Infinity, sum: 0 };
    for (let i = 0; i < verses.length; i++) {
      let sum = 0;
      for (let j = i; j < verses.length; j++) {
        sum += verses[j].linesCount;
        const diff = Math.abs(sum - targetLines);
        if (diff < bestRange.diff) {
          bestRange = { i, j, diff, sum };
        }
      }
    }
    const i = bestRange.i;
    const j = bestRange.j;
    candidates.push({
      startPage: page,
      endPage: page,
      startSurahId: verses[i].surah,
      startAyah: verses[i].ayah,
      endSurahId: verses[j].surah,
      endAyah: verses[j].ayah,
      linesCount: Math.round(bestRange.sum * 10) / 10,
      positionType: 'middle',
      startLine: verses[i].firstLine,
      endLine: verses[j].lastLine,
      p1Lines: bestRange.sum,
      p2Lines: 0,
    });
  }

  return candidates;
}

/**
 * استخراج الأجزاء المضمنة في قائمة الصفحات المسموحة للمتسابق
 */
function extractJuzsFromPages(pages: number[]): number[] {
  const juzSet = new Set<number>();
  for (const p of pages) {
    const j = pageJuzMap[p];
    if (j) juzSet.add(j);
  }
  const list = Array.from(juzSet).sort((a, b) => a - b);
  return list.length > 0 ? list : [30];
}

/**
 * Generate test passages for a participant according to the competition's active passageMode:
 * - 'random': Current balanced random passages across pages
 * - 'international': Alternates across International Competition tiers (Hard -> Medium -> Easy)
 * - 'manual': Rotates through the Supervisor's manually defined ranges per Juz
 */
export function generateSuggestedTestPassages(
  memorizedPages: number[],
  requiredCount: number = 3,
  targetLinesPerSegment?: number,
  options?: GeneratePassagesOptions
): SuggestedTestPassage[] {
  if (!memorizedPages || memorizedPages.length === 0) {
    memorizedPages = [582, 583, 584, 585, 586];
  }

  const mode: PassageSelectionMode = options?.mode || 'random';
  const count = Math.max(1, Math.min(12, requiredCount));
  const hasCustomTarget =
    typeof targetLinesPerSegment === 'number' &&
    !isNaN(targetLinesPerSegment) &&
    targetLinesPerSegment > 0;
  const targetLines = hasCustomTarget
    ? Math.max(1, Math.min(20, Number(targetLinesPerSegment)))
    : 7.0;

  const sortedPages = Array.from(new Set(memorizedPages)).sort((a, b) => a - b);
  const allowedPagesSet = new Set<number>(sortedPages);
  const activeJuzs = extractJuzsFromPages(sortedPages);

  evaluationRotationCounter = (evaluationRotationCounter + 1) % 10000;

  // =========================================================================
  // 1) نمط المسابقات العالمية (التبويب الثاني):
  // المقطع الأول يتناوب من (الأكثر صعوبة)، والثاني من (متوسطة)، والثالث من (الأقل صعوبة) وهكذا
  // =========================================================================
  if (mode === 'international') {
    const tierOrder: PassageDifficultyTier[] = ['hard', 'medium', 'easy'];
    const result: SuggestedTestPassage[] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < count; i++) {
      const passageNumber = i + 1;
      const targetTier = tierOrder[i % tierOrder.length];

      // اختيار الجزء المستهدف لهذا المقطع بالتناوب عبر أجزاء المتسابق
      const juzIdx = (i + evaluationRotationCounter) % activeJuzs.length;
      const targetJuz = activeJuzs[juzIdx];

      // جلب مقاطع هذا الجزء من نفس الفئة (الأكثر صعوبة / متوسطة / الأقل)
      let candidates = getInternationalPassagesForJuz(
        targetJuz,
        targetLines,
        targetTier
      ).filter(p => p.pages.some(pg => allowedPagesSet.has(pg)));

      // إن كان نطاق المتسابق سور محددة داخل الجزء، نبحث في جميع أجزاء المتسابق لنفس الفئة
      if (candidates.length === 0) {
        for (const j of activeJuzs) {
          const jCands = getInternationalPassagesForJuz(j, targetLines, targetTier).filter(
            p => p.pages.some(pg => allowedPagesSet.has(pg))
          );
          candidates.push(...jCands);
        }
      }

      // إن لم تتطابق مع سور قصيرة جداً، نأخذ مقاطع الجزء المستهدف مباشرة
      if (candidates.length === 0) {
        candidates = getInternationalPassagesForJuz(targetJuz, targetLines, targetTier);
      }

      const unused = candidates.filter(c => !usedIds.has(c.id));
      const pool = unused.length > 0 ? unused : candidates;
      const pickIdx = (evaluationRotationCounter + i) % Math.max(1, pool.length);
      const chosen = pool[pickIdx];

      if (chosen) {
        usedIds.add(chosen.id);
        result.push({
          ...chosen,
          id: `${chosen.id}-slot-${passageNumber}-${evaluationRotationCounter}`,
          passageNumber,
          sourceMode: 'international',
        });
      }
    }

    if (result.length === count) {
      return result;
    }
  }

  // =========================================================================
  // 2) نمط التحديد اليدوي للمشرف (التبويب الثالث):
  // يتناوب بين النطاقات التي حددها المشرف لكل جزء من أجزاء المتسابق
  // =========================================================================
  if (mode === 'manual' && options?.manualPassages && options.manualPassages.length > 0) {
    const allManual = options.manualPassages;
    // استخراج المقاطع اليدوية الخاصة بأجزاء المتسابق (أو التي تقع صفحاتها ضمن نطاق المتسابق)
    const manualByJuz = new Map<number, ManualPassageRange[]>();
    for (const mp of allManual) {
      const startPage = findPageForSurahAyah(mp.startSurahId, mp.startAyah);
      const inAllowedJuz = activeJuzs.includes(mp.juzNumber);
      const inAllowedPage = allowedPagesSet.has(startPage);
      if (inAllowedJuz || inAllowedPage) {
        const list = manualByJuz.get(mp.juzNumber) || [];
        list.push(mp);
        manualByJuz.set(mp.juzNumber, list);
      }
    }

    const juzsWithManual = Array.from(manualByJuz.keys()).sort((a, b) => a - b);
    if (juzsWithManual.length > 0) {
      const result: SuggestedTestPassage[] = [];
      const usedRangeIds = new Set<string>();

      for (let i = 0; i < count; i++) {
        const passageNumber = i + 1;
        const targetJuz =
          juzsWithManual[(i + evaluationRotationCounter) % juzsWithManual.length];
        const rangesInJuz = manualByJuz.get(targetJuz) || [];

        const unusedRanges = rangesInJuz.filter(r => !usedRangeIds.has(r.id));
        const pool = unusedRanges.length > 0 ? unusedRanges : rangesInJuz;
        const pickIdx = (evaluationRotationCounter + i) % Math.max(1, pool.length);
        const pickedRange = pool[pickIdx];

        if (pickedRange) {
          usedRangeIds.add(pickedRange.id);
          result.push(buildPassageFromManualRange(pickedRange, passageNumber));
        }
      }

      if (result.length > 0) {
        // إذا كان عدد المقاطع المطلوبة أكبر من النطاقات اليدوية المتاحة، نكمل الباقي تلقائياً
        while (result.length < count) {
          const fallbackPassages = generateRandomPassagesInternal(
            sortedPages,
            1,
            targetLines
          );
          const nextNum = result.length + 1;
          result.push({
            ...fallbackPassages[0],
            passageNumber: nextNum,
          });
        }
        return result;
      }
    }
  }

  // =========================================================================
  // 3) النمط العشوائي الحالي (التبويب الأول - أو الاحتياطي عند عدم وجود يدوي)
  // =========================================================================
  return generateRandomPassagesInternal(sortedPages, count, targetLinesPerSegment);
}

function generateRandomPassagesInternal(
  sortedPages: number[],
  count: number,
  targetLinesPerSegment?: number
): SuggestedTestPassage[] {
  const hasCustomTarget =
    typeof targetLinesPerSegment === 'number' &&
    !isNaN(targetLinesPerSegment) &&
    targetLinesPerSegment > 0;
  const targetLines = hasCustomTarget
    ? Math.max(1, Math.min(20, Number(targetLinesPerSegment)))
    : 6.0;

  const totalPages = sortedPages.length;
  const passages: SuggestedTestPassage[] = [];
  const usedPages = new Set<number>();

  const preferredPositionsBySlot: ('beginning' | 'middle' | 'end' | 'cross-page')[][] = [
    ['beginning', 'middle'],
    ['middle', 'cross-page', 'beginning'],
    ['end', 'cross-page', 'middle'],
    ['beginning', 'middle'],
    ['middle', 'end'],
    ['end', 'cross-page'],
  ];

  for (let i = 0; i < count; i++) {
    const passageNumber = i + 1;
    const binStartIdx = Math.floor((i * totalPages) / count);
    const binEndIdx = Math.min(totalPages - 1, Math.floor(((i + 1) * totalPages) / count) - 1);

    const candidateIndices: number[] = [];
    for (let idx = binStartIdx; idx <= Math.max(binStartIdx, binEndIdx); idx++) {
      if (!usedPages.has(sortedPages[idx])) {
        candidateIndices.push(idx);
      }
    }

    if (candidateIndices.length === 0) {
      for (let idx = binStartIdx; idx <= Math.max(binStartIdx, binEndIdx); idx++) {
        candidateIndices.push(idx);
      }
    }

    const selectedIdx =
      candidateIndices[Math.floor(Math.random() * candidateIndices.length)] || binStartIdx;
    const selectedPage = sortedPages[selectedIdx];
    usedPages.add(selectedPage);

    const canCrossPage = sortedPages.includes(selectedPage + 1) && selectedPage < 604;
    const allCandidates = getCandidatePassagesForPage(
      selectedPage,
      canCrossPage,
      targetLinesPerSegment
    );

    if (allCandidates.length === 0) {
      passages.push(createFallbackPassage(passageNumber, selectedPage, targetLines));
      continue;
    }

    const slotPreferences = preferredPositionsBySlot[i % preferredPositionsBySlot.length];
    let matchingCandidates: CandidatePassage[] = [];

    for (const pref of slotPreferences) {
      const match = allCandidates.filter(c => c.positionType === pref);
      if (match.length > 0) {
        matchingCandidates = match;
        break;
      }
    }

    if (matchingCandidates.length === 0) {
      matchingCandidates = allCandidates;
    }

    matchingCandidates.sort((a, b) => {
      const diffA = Math.abs(a.linesCount - targetLines);
      const diffB = Math.abs(b.linesCount - targetLines);
      return diffA - diffB;
    });

    const topCandidates = matchingCandidates.slice(
      0,
      Math.min(hasCustomTarget ? 3 : 4, matchingCandidates.length)
    );
    const chosen =
      topCandidates[Math.floor(Math.random() * topCandidates.length)] || matchingCandidates[0];

    if (chosen.endPage > chosen.startPage) {
      usedPages.add(chosen.endPage);
    }

    const pagesList =
      chosen.startPage === chosen.endPage
        ? [chosen.startPage]
        : [chosen.startPage, chosen.endPage];
    const surahName1 = surahNames[chosen.startSurahId] || '';
    const surahName2 = surahNames[chosen.endSurahId] || '';
    const sameSurah = chosen.startSurahId === chosen.endSurahId;

    const desc = formatPassageDescription(
      pagesList,
      chosen.startSurahId,
      chosen.startAyah,
      chosen.endSurahId,
      chosen.endAyah
    );

    let positionLabel = `ص ${toArabicDigits(chosen.startPage)}`;
    if (chosen.positionType === 'cross-page') {
      positionLabel = `ص ${toArabicDigits(chosen.startPage)}-${toArabicDigits(chosen.endPage)}`;
    }

    const highlights: Record<number, PassageHighlight> = {};
    if (chosen.startPage === chosen.endPage) {
      const topPercent = Math.max(
        3,
        Math.min(85, Math.round(((chosen.startLine - 1) / 15) * 100) + 2)
      );
      const heightPercent = Math.min(
        95,
        Math.max(15, Math.round((chosen.linesCount / 15) * 100))
      );
      highlights[chosen.startPage] = {
        page: chosen.startPage,
        topPercent,
        heightPercent,
        label: `آية ${toArabicDigits(chosen.startAyah)} إلى ${toArabicDigits(chosen.endAyah)}`,
      };
    } else {
      highlights[chosen.startPage] = {
        page: chosen.startPage,
        topPercent: Math.max(
          3,
          Math.min(85, Math.round(((chosen.startLine - 1) / 15) * 100) + 2)
        ),
        heightPercent: Math.min(95, Math.max(15, Math.round((chosen.p1Lines / 15) * 100))),
        label: `آية ${toArabicDigits(chosen.startAyah)} فصاعداً`,
      };
      highlights[chosen.endPage] = {
        page: chosen.endPage,
        topPercent: 3,
        heightPercent: Math.min(95, Math.max(15, Math.round((chosen.p2Lines / 15) * 100))),
        label: `إلى آية ${toArabicDigits(chosen.endAyah)}`,
      };
    }

    passages.push({
      id: `passage-${passageNumber}-${chosen.startPage}`,
      passageNumber,
      pages: pagesList,
      surahName: sameSurah ? surahName1 : `${surahName1} / ${surahName2}`,
      startSurahId: chosen.startSurahId,
      startAyah: chosen.startAyah,
      endSurahId: chosen.endSurahId,
      endAyah: chosen.endAyah,
      startPage: chosen.startPage,
      endPage: chosen.endPage,
      positionType: chosen.positionType,
      positionLabel,
      description: desc,
      shortLabel: positionLabel,
      highlights,
      actualLinesCount: chosen.linesCount,
      juzNumber: pageJuzMap[chosen.startPage] || 1,
      sourceMode: 'random',
    });
  }

  return passages;
}

function createFallbackPassage(
  passageNum: number,
  page: number,
  targetLines: number = 6.0
): SuggestedTestPassage {
  return {
    id: `passage-${passageNum}-${page}`,
    passageNumber: passageNum,
    pages: [page],
    surahName: 'القرآن الكريم',
    startSurahId: 1,
    startAyah: 1,
    endSurahId: 1,
    endAyah: 7,
    startPage: page,
    endPage: page,
    positionType: 'beginning',
    positionLabel: `ص ${toArabicDigits(page)}`,
    description: `صفحة ${toArabicDigits(page)}`,
    shortLabel: `صفحة ${toArabicDigits(page)}`,
    highlights: {
      [page]: {
        page,
        topPercent: 4,
        heightPercent: Math.min(95, Math.max(20, Math.round((targetLines / 15) * 100))),
        label: 'المقطع المحدد',
      },
    },
    actualLinesCount: targetLines,
  };
}
