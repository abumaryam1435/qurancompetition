import { quranPageMap } from './quranData';
import juz30Data from './juz30LineData.json';
import ayahSegmentsData from './mushafAyahSegments.json';

// Bounding coordinates per ayah line segment across all 604 pages: [sura, ayah, line, minX, maxX, minY, maxY]
const allSegments = ayahSegmentsData as unknown as Record<string, [number, number, number, number, number, number, number][]>;

export interface WordLineEntry {
  s: number; // surah
  a: number; // ayah
  p: number; // position in verse
}

export interface PageVerseData {
  wordsByLine: Record<number, WordLineEntry[]>;
}

export interface LineHighlightRect {
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  startFraction: number;
  endFraction: number;
  isFirstLine: boolean;
  isLastLine: boolean;
}

/**
 * Geometric bounds for the 15-line Madinah Mushaf within native 1260x2038 coordinate space.
 */
export const MUSHAF_SVG_BOUNDS = {
  viewWidth: 1260,
  viewHeight: 2038,
  xMin: 45,
  width: 1175,
  yTop: 100,
  lineStep: 125,
  lineHeight: 110,
};

// In-memory cache for page verse layouts
const memoryCache = new Map<number, PageVerseData>();

// Initialize in-memory cache with bundled Juz 30 data (pages 582-604)
try {
  const j30 = juz30Data as Record<string, Record<string, WordLineEntry[]>>;
  Object.entries(j30).forEach(([pgStr, linesMap]) => {
    const pageNum = parseInt(pgStr, 10);
    const convertedLines: Record<number, WordLineEntry[]> = {};
    Object.entries(linesMap).forEach(([lnStr, words]) => {
      convertedLines[parseInt(lnStr, 10)] = words;
    });
    memoryCache.set(pageNum, { wordsByLine: convertedLines });
  });
} catch (err) {
  console.warn('Failed to load bundled Juz 30 line data', err);
}

/**
 * Synchronous lookup from memory cache or localStorage
 */
export function getPageVerseDataSync(pageNumber: number): PageVerseData | null {
  if (pageNumber < 1 || pageNumber > 604) return null;
  if (memoryCache.has(pageNumber)) {
    return memoryCache.get(pageNumber)!;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem(`mushaf_page_verses_v1_${pageNumber}`);
      if (cached) {
        const parsed = JSON.parse(cached) as PageVerseData;
        memoryCache.set(pageNumber, parsed);
        return parsed;
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

/**
 * Retrieve page verse line data from cache or network
 */
export async function getPageVerseData(pageNumber: number): Promise<PageVerseData | null> {
  if (pageNumber < 1 || pageNumber > 604) return null;

  // 1. In-memory cache
  if (memoryCache.has(pageNumber)) {
    return memoryCache.get(pageNumber)!;
  }

  // 2. LocalStorage cache
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem(`mushaf_page_verses_v1_${pageNumber}`);
      if (cached) {
        const parsed = JSON.parse(cached) as PageVerseData;
        memoryCache.set(pageNumber, parsed);
        return parsed;
      }
    } catch {
      // Ignore localStorage error
    }
  }

  // 3. Fetch from Quran.com API v4
  try {
    const res = await fetch(`https://api.quran.com/api/v4/verses/by_page/${pageNumber}?words=true&per_page=50`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const wordsByLine: Record<number, WordLineEntry[]> = {};
    if (Array.isArray(data.verses)) {
      data.verses.forEach((v: any) => {
        const [surah, ayah] = (v.verse_key || '').split(':').map(Number);
        if (Array.isArray(v.words)) {
          v.words.forEach((w: any) => {
            const lineNum = w.line_number;
            if (!wordsByLine[lineNum]) wordsByLine[lineNum] = [];
            wordsByLine[lineNum].push({
              s: surah,
              a: ayah,
              p: w.position || 1,
            });
          });
        }
      });
    }

    const result: PageVerseData = { wordsByLine };
    memoryCache.set(pageNumber, result);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`mushaf_page_verses_v1_${pageNumber}`, JSON.stringify(result));
      } catch {
        // quota exceeded or private mode
      }
    }

    return result;
  } catch (e) {
    console.warn(`Could not fetch verse line data for page ${pageNumber}`, e);
    return null;
  }
}

/**
 * Preload verse line data for target pages in the background
 */
export function preloadVerseLinesForPages(pages: number[]): void {
  pages.forEach(p => {
    if (!memoryCache.has(p)) {
      getPageVerseData(p).catch(() => {});
    }
  });
}

/**
 * Calculate precise per-line highlight rectangles for a given page and passage range.
 *
 * Rules:
 * 1. Borderless rectangles ('stroke="none"') for each line.
 * 2. First line starts at the exact beginning of the first ayah (RTL start fraction).
 * 3. Middle lines are fully highlighted from edge to edge (startFraction = 0, endFraction = 1).
 * 4. Last line is highlighted from line start up to the end of the last ayah in the range.
 * 5. If the passage starts and ends on the same line, only the span of that ayah is highlighted.
 */
export function calculateLineHighlights(
  pageNumber: number,
  startSurahId: number,
  startAyah: number,
  endSurahId: number,
  endAyah: number,
  pageData?: PageVerseData | null
): LineHighlightRect[] {
  // 1. Precise glyph/word bounding segments across all 604 pages from Madinah Mushaf database
  const pageSegments = allSegments[String(pageNumber)];
  if (pageSegments && pageSegments.length > 0) {
    const matching = pageSegments.filter(([s, a]) => {
      const afterOrAtStart = s > startSurahId || (s === startSurahId && a >= startAyah);
      const beforeOrAtEnd = s < endSurahId || (s === endSurahId && a <= endAyah);
      return afterOrAtStart && beforeOrAtEnd;
    });

    if (matching.length > 0) {
      const linesMap = new Map<number, { minX: number; maxX: number; minY: number; maxY: number }>();
      for (const [, , l, x1, x2, y1, y2] of matching) {
        if (!linesMap.has(l)) {
          linesMap.set(l, { minX: x1, maxX: x2, minY: y1, maxY: y2 });
        } else {
          const cur = linesMap.get(l)!;
          cur.minX = Math.min(cur.minX, x1);
          cur.maxX = Math.max(cur.maxX, x2);
          cur.minY = Math.min(cur.minY, y1);
          cur.maxY = Math.max(cur.maxY, y2);
        }
      }

      const sortedLines = Array.from(linesMap.keys()).sort((a, b) => a - b);
      const totalLines = sortedLines.length;

      return sortedLines.map((lineNum, idx) => {
        const b = linesMap.get(lineNum)!;
        const isFirst = idx === 0;
        const isLast = idx === totalLines - 1;

        // وسادة مريحة (padding) لإحاطة الكلمات والتشكيل بمظهر قلم التظليل المكتبي الأنيق
        const padY = 5;
        const padX = 6;

        const rawX = Math.max(25, b.minX - padX);
        const rawY = Math.max(0, b.minY - padY);
        const rawWidth = Math.max(16, (b.maxX - b.minX) + 2 * padX);
        const rawHeight = Math.max(24, (b.maxY - b.minY) + 2 * padY);

        return {
          line: lineNum,
          x: Math.round(rawX),
          y: Math.round(rawY),
          width: Math.round(rawWidth),
          height: Math.round(rawHeight),
          startFraction: 0,
          endFraction: 1,
          isFirstLine: isFirst,
          isLastLine: isLast,
        };
      });
    }
  }

  // If we have precise word-by-line data (bundled Juz 30 or fetched/cached)
  if (pageData && pageData.wordsByLine && Object.keys(pageData.wordsByLine).length > 0) {
    const lineNumbers = Object.keys(pageData.wordsByLine).map(Number).sort((a, b) => a - b);
    const matchingLines: {
      lineNum: number;
      firstMatchIdx: number;
      lastMatchIdx: number;
      totalWords: number;
    }[] = [];

    for (const lineNum of lineNumbers) {
      const lineWords = pageData.wordsByLine[lineNum] || [];
      const totalWords = lineWords.length;
      if (totalWords === 0) continue;

      let firstMatch = -1;
      let lastMatch = -1;

      lineWords.forEach((w, idx) => {
        // Check if word falls in the passage range [startSurah:startAyah, endSurah:endAyah]
        const afterOrAtStart = w.s > startSurahId || (w.s === startSurahId && w.a >= startAyah);
        const beforeOrAtEnd = w.s < endSurahId || (w.s === endSurahId && w.a <= endAyah);

        if (afterOrAtStart && beforeOrAtEnd) {
          if (firstMatch === -1) firstMatch = idx;
          lastMatch = idx;
        }
      });

      if (firstMatch !== -1) {
        matchingLines.push({
          lineNum,
          firstMatchIdx: firstMatch,
          lastMatchIdx: lastMatch,
          totalWords,
        });
      }
    }

    if (matchingLines.length === 0) return [];

    const result: LineHighlightRect[] = [];
    const firstMatchingLine = matchingLines[0];
    const lastMatchingLine = matchingLines[matchingLines.length - 1];

    matchingLines.forEach((item, index) => {
      const isFirst = index === 0;
      const isLast = index === matchingLines.length - 1;

      let startFraction = 0;
      let endFraction = 1;

      if (isFirst && isLast) {
        // Passage begins and ends on this single line
        startFraction = item.firstMatchIdx === 0 ? 0 : item.firstMatchIdx / item.totalWords;
        endFraction = item.lastMatchIdx === item.totalWords - 1 ? 1 : (item.lastMatchIdx + 1) / item.totalWords;
      } else if (isFirst) {
        // First line: starts at the beginning of the first ayah (RTL from right) and continues to line end
        startFraction = item.firstMatchIdx === 0 ? 0 : item.firstMatchIdx / item.totalWords;
        endFraction = 1;
      } else if (isLast) {
        // Last line: starts from the right edge and continues until the end of the last ayah
        startFraction = 0;
        endFraction = item.lastMatchIdx === item.totalWords - 1 ? 1 : (item.lastMatchIdx + 1) / item.totalWords;
      } else {
        // Middle lines: fully highlighted
        startFraction = 0;
        endFraction = 1;
      }

      // Convert fractions into SVG coordinates
      const width = MUSHAF_SVG_BOUNDS.width;
      const xMin = MUSHAF_SVG_BOUNDS.xMin;
      const rectWidth = Math.max(12, (endFraction - startFraction) * width);
      // In Arabic RTL: text flows from Right (xMin + width) to Left (xMin)
      // Left coordinate of rect = xMin + (1 - endFraction) * width
      const rectX = xMin + (1 - endFraction) * width;
      const rectY = MUSHAF_SVG_BOUNDS.yTop + (item.lineNum - 1) * MUSHAF_SVG_BOUNDS.lineStep;
      const rectHeight = MUSHAF_SVG_BOUNDS.lineHeight;

      result.push({
        line: item.lineNum,
        x: Math.round(rectX),
        y: Math.round(rectY),
        width: Math.round(rectWidth),
        height: Math.round(rectHeight),
        startFraction,
        endFraction,
        isFirstLine: isFirst,
        isLastLine: isLast,
      });
    });

    return result;
  }

  // Fallback estimation using quranPageMap metadata if word data is not yet loaded
  return calculateFallbackLineHighlights(pageNumber, startSurahId, startAyah, endSurahId, endAyah);
}

/**
 * Fallback estimation based on page metadata in quranPageMap
 */
function calculateFallbackLineHighlights(
  pageNumber: number,
  startSurahId: number,
  startAyah: number,
  endSurahId: number,
  endAyah: number
): LineHighlightRect[] {
  const pageEntries = quranPageMap[pageNumber] || [];
  if (pageEntries.length === 0) return [];

  // Count total verses on this page
  let totalVersesOnPage = 0;
  pageEntries.forEach(entry => {
    totalVersesOnPage += (entry.end - entry.start + 1);
  });
  if (totalVersesOnPage === 0) totalVersesOnPage = 15;

  // Find relative verse index on this page
  let startVerseOffset = 0;
  let endVerseOffset = 0;
  let currentOffset = 0;
  let foundStart = false;
  let foundEnd = false;

  for (const entry of pageEntries) {
    for (let a = entry.start; a <= entry.end; a++) {
      if (!foundStart && (entry.surah > startSurahId || (entry.surah === startSurahId && a >= startAyah))) {
        startVerseOffset = currentOffset;
        foundStart = true;
      }
      if (entry.surah < endSurahId || (entry.surah === endSurahId && a <= endAyah)) {
        endVerseOffset = currentOffset + 1;
        foundEnd = true;
      }
      currentOffset++;
    }
  }

  if (!foundStart) startVerseOffset = 0;
  if (!foundEnd) endVerseOffset = currentOffset;

  // Distribute over 15 lines
  const startLine = Math.max(1, Math.min(15, Math.floor((startVerseOffset / totalVersesOnPage) * 15) + 1));
  const endLine = Math.max(startLine, Math.min(15, Math.ceil((endVerseOffset / totalVersesOnPage) * 15)));

  const result: LineHighlightRect[] = [];
  for (let l = startLine; l <= endLine; l++) {
    const isFirst = l === startLine;
    const isLast = l === endLine;

    const startFraction = isFirst ? (startLine === endLine ? 0.2 : 0.3) : 0;
    const endFraction = isLast ? (startLine === endLine ? 0.8 : 0.7) : 1;

    const width = MUSHAF_SVG_BOUNDS.width;
    const xMin = MUSHAF_SVG_BOUNDS.xMin;
    const rectWidth = (endFraction - startFraction) * width;
    const rectX = xMin + (1 - endFraction) * width;
    const rectY = MUSHAF_SVG_BOUNDS.yTop + (l - 1) * MUSHAF_SVG_BOUNDS.lineStep;

    result.push({
      line: l,
      x: Math.round(rectX),
      y: Math.round(rectY),
      width: Math.round(rectWidth),
      height: Math.round(MUSHAF_SVG_BOUNDS.lineHeight),
      startFraction,
      endFraction,
      isFirstLine: isFirst,
      isLastLine: isLast,
    });
  }

  return result;
}
