import {
  CompetitionErrorCategory,
  CompetitionErrorType,
  ErrorCategoryColorKey,
} from '../types';

export const toArabicDigits = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val);
  // تحويل أي أرقام مشرقية/هندية (٠-٩) إلى أرقام عربية قياسية (0-9)
  return str.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());
};

export const toEnglishDigits = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val);
  return str.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());
};

/**
 * دالة لتنسيق نطاقات الأرقام والأرقام المفردة باتجاه اليمين إلى اليسار (RTL)
 * تضمن ظهور البداية في اليمين والنهاية في اليسار (مثل: 1 - 2 أو 100 - 107)
 * حتى وإن لم يسبقها نص عربي، وتستخدم الأرقام العربية 1 2 3
 */
export const formatRtlRange = (val: any): string => {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'number') return toArabicDigits(val);
  const strVal = String(val);
  const cleaned = strVal.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  const withArabic = toArabicDigits(cleaned);
  // تنسيق النطاقات مع علامة RTL لضمان ترتيب البداية على اليمين والنهاية على اليسار
  let formatted = withArabic.replace(/(\d+)\s*[-–—]\s*(\d+)/g, '\u200F$1 - $2\u200F');
  formatted = formatted.replace(/(\d+)\s*[,،]\s*(\d+)/g, '$1، $2');
  return formatted;
};

export function parseJuzsToNumbers(input: string | string[]): number[] {
  const parts = Array.isArray(input) ? input : input.split(/،|,/);
  const nums = new Set<number>();

  for (let part of parts) {
    part = part.trim().replace(/[\u200E\u200F\u202A-\u202E]/g, '');
    if (!part) continue;

    // Convert arabic numerals to english
    part = toEnglishDigits(part);

    const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) {
        if (i <= 30 && i >= 1) {
          nums.add(i);
        }
      }
    } else {
      const val = parseInt(part, 10);
      if (!isNaN(val) && val >= 1 && val <= 30) {
        nums.add(val);
      }
    }
  }

  return Array.from(nums).sort((a, b) => a - b);
}

export function formatJuzsFromNumbers(nums: number[]): string {
  if (!nums || nums.length === 0) return "";

  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const ranges: string[] = [];

  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      if (start === prev) {
        ranges.push(toArabicDigits(start));
      } else if (prev === start + 1) {
        ranges.push(toArabicDigits(start) + "، " + toArabicDigits(prev));
      } else {
        ranges.push(formatRtlRange(`${start} - ${prev}`));
      }
      start = current;
      prev = current;
    }
  }

  return ranges.join("، ");
}

export function formatAndCountJuzs(input: string[] | string | undefined): {
  formatted: string;
  count: number;
  nums: number[];
} {
  if (!input || (Array.isArray(input) && input.length === 0))
    return { formatted: "", count: 0, nums: [] };
  const nums = parseJuzsToNumbers(input);
  return {
    formatted: formatJuzsFromNumbers(nums),
    count: nums.length,
    nums,
  };
}

export function extractJuzCount(str: string | undefined): number {
  if (!str) return 0;
  const s = String(str).trim();
  if (s.startsWith('السور:')) return 0;
  if (s.startsWith('الأجزاء:')) {
    return parseJuzsToNumbers(s.replace('الأجزاء:', '')).length;
  }
  if (s.includes('القرآن كاملاً') || s.includes('القرآن كامل') || s.includes('المصحف كاملا') || s.includes('المصحف كاملاً') || s.includes('30 جزء')) return 30;
  if (s.includes('جزء واحد') || s === '1' || s === 'جزء') return 1;
  if (s.includes('جزآن') || s.includes('جزئين') || s === '2') return 2;
  const eng = toEnglishDigits(s);
  const m = eng.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 30) return n;
  }
  if (s.includes('ثلاثة') || s.includes('3')) return 3;
  if (s.includes('أربعة') || s.includes('اربعة') || s.includes('4')) return 4;
  if (s.includes('خمسة') || s.includes('5')) return 5;
  if (s.includes('ستة') || s.includes('6')) return 6;
  if (s.includes('سبعة') || s.includes('7')) return 7;
  if (s.includes('ثمانية') || s.includes('8')) return 8;
  if (s.includes('تسعة') || s.includes('9')) return 9;
  if (s.includes('عشرة') || s.includes('10')) return 10;
  if (s.includes('خمسة عشر') || s.includes('15')) return 15;
  if (s.includes('عشرون') || s.includes('عشرين') || s.includes('20')) return 20;
  return 0;
}

export function isUnspecifiedJuzCount(scope: string | undefined): boolean {
  if (!scope) return false;
  const s = scope.trim();
  if (s.startsWith('الأجزاء:') || s.startsWith('السور:')) return false;
  const count = extractJuzCount(s);
  return count > 0 && count < 30;
}

/**
 * الأصناف الافتراضية لأزرار خصم الأخطاء:
 * - (التنبيه، والفتح، والتشكيل) في صنف: حفظ
 * - (التجويد) في صنف: التجويد
 */
export const DEFAULT_ERROR_CATEGORIES: CompetitionErrorCategory[] = [
  { id: 'cat-hifz', name: 'حفظ', color: 'rose' },
  { id: 'cat-tajweed', name: 'التجويد', color: 'teal' },
];

export const ERROR_CATEGORY_COLOR_OPTIONS: {
  key: ErrorCategoryColorKey;
  label: string;
  swatchClass: string;
}[] = [
  { key: 'rose', label: 'أحمر ياقوتي', swatchClass: 'bg-rose-600' },
  { key: 'teal', label: 'تركواز فيروزي', swatchClass: 'bg-teal-600' },
  { key: 'amber', label: 'ذهبي كهرماني', swatchClass: 'bg-amber-500' },
  { key: 'purple', label: 'بنفسجي ملكي', swatchClass: 'bg-purple-600' },
  { key: 'blue', label: 'أزرق سماوي', swatchClass: 'bg-blue-600' },
  { key: 'emerald', label: 'أخضر زمردي', swatchClass: 'bg-emerald-600' },
  { key: 'indigo', label: 'نيلي داكن', swatchClass: 'bg-indigo-600' },
  { key: 'orange', label: 'برتقالي دافئ', swatchClass: 'bg-orange-600' },
];

export interface ErrorCategoryColorStyle {
  key: ErrorCategoryColorKey;
  label: string;
  card: string;
  activeCard: string;
  title: string;
  sub: string;
  plusBtn: string;
  countBox: string;
  mushafBox: string;
  mushafText: string;
  mushafSub: string;
  mushafPlus: string;
  mushafBadge: string;
  chip: string;
  dot: string;
}

export const ERROR_CATEGORY_COLOR_STYLES: Record<ErrorCategoryColorKey, ErrorCategoryColorStyle> = {
  rose: {
    key: 'rose',
    label: 'أحمر ياقوتي',
    card: 'bg-rose-50/85 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70',
    activeCard: 'bg-rose-100/95 dark:bg-rose-950/65 border-rose-400 dark:border-rose-500',
    title: 'text-rose-950 dark:text-rose-200',
    sub: 'text-rose-700 dark:text-rose-400',
    plusBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    countBox: 'border-rose-400 text-rose-900 dark:text-rose-200',
    mushafBox: 'bg-rose-50/95 dark:bg-rose-950/60 border-rose-300 dark:border-rose-500/50',
    mushafText: 'text-rose-900 dark:text-rose-200',
    mushafSub: 'text-rose-600 dark:text-rose-400',
    mushafPlus: 'bg-rose-600 hover:bg-rose-700 text-white',
    mushafBadge: 'border-rose-500 text-rose-800 dark:text-rose-200',
    chip: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700',
    dot: 'bg-rose-600',
  },
  teal: {
    key: 'teal',
    label: 'تركواز فيروزي',
    card: 'bg-teal-50/85 dark:bg-teal-950/35 border-teal-200 dark:border-teal-800/70',
    activeCard: 'bg-teal-100/95 dark:bg-teal-950/65 border-teal-400 dark:border-teal-500',
    title: 'text-teal-950 dark:text-teal-200',
    sub: 'text-teal-700 dark:text-teal-400',
    plusBtn: 'bg-teal-600 hover:bg-teal-700 text-white',
    countBox: 'border-teal-400 text-teal-900 dark:text-teal-200',
    mushafBox: 'bg-teal-50/95 dark:bg-teal-950/60 border-teal-300 dark:border-teal-500/50',
    mushafText: 'text-teal-900 dark:text-teal-200',
    mushafSub: 'text-teal-600 dark:text-teal-400',
    mushafPlus: 'bg-teal-600 hover:bg-teal-700 text-white',
    mushafBadge: 'border-teal-500 text-teal-800 dark:text-teal-200',
    chip: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-700',
    dot: 'bg-teal-600',
  },
  amber: {
    key: 'amber',
    label: 'ذهبي كهرماني',
    card: 'bg-amber-50/85 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70',
    activeCard: 'bg-amber-100/95 dark:bg-amber-950/65 border-amber-400 dark:border-amber-500',
    title: 'text-amber-950 dark:text-amber-200',
    sub: 'text-amber-700 dark:text-amber-400',
    plusBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    countBox: 'border-amber-400 text-amber-900 dark:text-amber-200',
    mushafBox: 'bg-amber-50/95 dark:bg-amber-950/60 border-amber-300 dark:border-amber-500/50',
    mushafText: 'text-amber-900 dark:text-amber-200',
    mushafSub: 'text-amber-600 dark:text-amber-400',
    mushafPlus: 'bg-amber-600 hover:bg-amber-700 text-white',
    mushafBadge: 'border-amber-500 text-amber-800 dark:text-amber-200',
    chip: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700',
    dot: 'bg-amber-500',
  },
  purple: {
    key: 'purple',
    label: 'بنفسجي ملكي',
    card: 'bg-purple-50/85 dark:bg-purple-950/35 border-purple-200 dark:border-purple-800/70',
    activeCard: 'bg-purple-100/95 dark:bg-purple-950/65 border-purple-400 dark:border-purple-500',
    title: 'text-purple-950 dark:text-purple-200',
    sub: 'text-purple-700 dark:text-purple-400',
    plusBtn: 'bg-purple-600 hover:bg-purple-700 text-white',
    countBox: 'border-purple-400 text-purple-900 dark:text-purple-200',
    mushafBox: 'bg-purple-50/95 dark:bg-purple-950/60 border-purple-300 dark:border-purple-500/50',
    mushafText: 'text-purple-900 dark:text-purple-200',
    mushafSub: 'text-purple-600 dark:text-purple-400',
    mushafPlus: 'bg-purple-600 hover:bg-purple-700 text-white',
    mushafBadge: 'border-purple-500 text-purple-800 dark:text-purple-200',
    chip: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-700',
    dot: 'bg-purple-600',
  },
  blue: {
    key: 'blue',
    label: 'أزرق سماوي',
    card: 'bg-blue-50/85 dark:bg-blue-950/35 border-blue-200 dark:border-blue-800/70',
    activeCard: 'bg-blue-100/95 dark:bg-blue-950/65 border-blue-400 dark:border-blue-500',
    title: 'text-blue-950 dark:text-blue-200',
    sub: 'text-blue-700 dark:text-blue-400',
    plusBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    countBox: 'border-blue-400 text-blue-900 dark:text-blue-200',
    mushafBox: 'bg-blue-50/95 dark:bg-blue-950/60 border-blue-300 dark:border-blue-500/50',
    mushafText: 'text-blue-900 dark:text-blue-200',
    mushafSub: 'text-blue-600 dark:text-blue-400',
    mushafPlus: 'bg-blue-600 hover:bg-blue-700 text-white',
    mushafBadge: 'border-blue-500 text-blue-800 dark:text-blue-200',
    chip: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-700',
    dot: 'bg-blue-600',
  },
  emerald: {
    key: 'emerald',
    label: 'أخضر زمردي',
    card: 'bg-emerald-50/85 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/70',
    activeCard: 'bg-emerald-100/95 dark:bg-emerald-950/65 border-emerald-400 dark:border-emerald-500',
    title: 'text-emerald-950 dark:text-emerald-200',
    sub: 'text-emerald-700 dark:text-emerald-400',
    plusBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    countBox: 'border-emerald-400 text-emerald-900 dark:text-emerald-200',
    mushafBox: 'bg-emerald-50/95 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-500/50',
    mushafText: 'text-emerald-900 dark:text-emerald-200',
    mushafSub: 'text-emerald-600 dark:text-emerald-400',
    mushafPlus: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    mushafBadge: 'border-emerald-500 text-emerald-800 dark:text-emerald-200',
    chip: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700',
    dot: 'bg-emerald-600',
  },
  indigo: {
    key: 'indigo',
    label: 'نيلي داكن',
    card: 'bg-indigo-50/85 dark:bg-indigo-950/35 border-indigo-200 dark:border-indigo-800/70',
    activeCard: 'bg-indigo-100/95 dark:bg-indigo-950/65 border-indigo-400 dark:border-indigo-500',
    title: 'text-indigo-950 dark:text-indigo-200',
    sub: 'text-indigo-700 dark:text-indigo-400',
    plusBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    countBox: 'border-indigo-400 text-indigo-900 dark:text-indigo-200',
    mushafBox: 'bg-indigo-50/95 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-500/50',
    mushafText: 'text-indigo-900 dark:text-indigo-200',
    mushafSub: 'text-indigo-600 dark:text-indigo-400',
    mushafPlus: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    mushafBadge: 'border-indigo-500 text-indigo-800 dark:text-indigo-200',
    chip: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-700',
    dot: 'bg-indigo-600',
  },
  orange: {
    key: 'orange',
    label: 'برتقالي دافئ',
    card: 'bg-orange-50/85 dark:bg-orange-950/35 border-orange-200 dark:border-orange-800/70',
    activeCard: 'bg-orange-100/95 dark:bg-orange-950/65 border-orange-400 dark:border-orange-500',
    title: 'text-orange-950 dark:text-orange-200',
    sub: 'text-orange-700 dark:text-orange-400',
    plusBtn: 'bg-orange-600 hover:bg-orange-700 text-white',
    countBox: 'border-orange-400 text-orange-900 dark:text-orange-200',
    mushafBox: 'bg-orange-50/95 dark:bg-orange-950/60 border-orange-300 dark:border-orange-500/50',
    mushafText: 'text-orange-900 dark:text-orange-200',
    mushafSub: 'text-orange-600 dark:text-orange-400',
    mushafPlus: 'bg-orange-600 hover:bg-orange-700 text-white',
    mushafBadge: 'border-orange-500 text-orange-800 dark:text-orange-200',
    chip: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/70 dark:text-orange-200 dark:border-orange-700',
    dot: 'bg-orange-600',
  },
};

export const DEFAULT_COMPETITION_ERRORS: CompetitionErrorType[] = [
  { id: 1, name: 'التنبيه', deduction: 0.5, category: 'حفظ', color: 'rose' },
  { id: 2, name: 'الفتح', deduction: 1, category: 'حفظ', color: 'rose' },
  { id: 3, name: 'التشكيل', deduction: 1, category: 'حفظ', color: 'rose' },
  { id: 4, name: 'التجويد', deduction: 0.5, category: 'التجويد', color: 'teal' },
];

export function resolveLevelErrorCategories(
  categories?: CompetitionErrorCategory[]
): CompetitionErrorCategory[] {
  if (categories && categories.length > 0) {
    return categories;
  }
  return DEFAULT_ERROR_CATEGORIES;
}

export function resolveCompetitionErrorCategories(comp?: {
  errorCategories?: CompetitionErrorCategory[];
  levels?: { errorCategories?: CompetitionErrorCategory[] }[];
} | null): CompetitionErrorCategory[] {
  if (comp?.errorCategories && comp.errorCategories.length > 0) {
    return comp.errorCategories.map(c => ({ ...c }));
  }
  const firstLevelWithCats = (comp?.levels || []).find(
    l => l.errorCategories && l.errorCategories.length > 0
  );
  if (firstLevelWithCats?.errorCategories) {
    return firstLevelWithCats.errorCategories.map(c => ({ ...c }));
  }
  return DEFAULT_ERROR_CATEGORIES.map(c => ({ ...c }));
}

export function resolveCompetitionErrors(comp?: {
  errors?: CompetitionErrorType[];
  errorCategories?: CompetitionErrorCategory[];
  levels?: { errors?: CompetitionErrorType[]; errorCategories?: CompetitionErrorCategory[] }[];
} | null): CompetitionErrorType[] {
  const categories = resolveCompetitionErrorCategories(comp);
  let sourceErrors: CompetitionErrorType[] | undefined;

  if (comp?.errors && comp.errors.length > 0) {
    sourceErrors = comp.errors;
  } else {
    const firstLevelWithErrors = (comp?.levels || []).find(
      l => l.errors && l.errors.length > 0
    );
    if (firstLevelWithErrors?.errors && firstLevelWithErrors.errors.length > 0) {
      sourceErrors = firstLevelWithErrors.errors;
    }
  }

  const base =
    sourceErrors && sourceErrors.length > 0
      ? sourceErrors
      : DEFAULT_COMPETITION_ERRORS;

  return base.map((err, idx) => {
    const catName = resolveErrorCategoryName(err);
    const colorKey = resolveErrorColorKey({ ...err, category: catName }, categories);
    return {
      ...err,
      id: err.id || idx + 1,
      category: catName,
      color: colorKey,
    };
  });
}

export function resolveErrorCategoryName(
  err: Pick<CompetitionErrorType, 'name' | 'category'>
): string {
  if (err.category && err.category.trim()) {
    return err.category.trim();
  }
  const n = (err.name || '').trim();
  if (n.includes('تجويد') || n.includes('التجويد')) {
    return 'التجويد';
  }
  return 'حفظ';
}

export function resolveErrorColorKey(
  err: Pick<CompetitionErrorType, 'name' | 'category' | 'color'>,
  categories?: CompetitionErrorCategory[]
): ErrorCategoryColorKey {
  const catList = resolveLevelErrorCategories(categories);
  const catName = resolveErrorCategoryName(err);
  const matchedCat = catList.find(
    c =>
      c.name.trim() === catName ||
      (catName === 'حفظ' && (c.name.trim() === 'الحفظ' || c.name.trim() === 'حفظ')) ||
      (catName === 'التجويد' && (c.name.trim() === 'تجويد' || c.name.trim() === 'التجويد'))
  );
  if (matchedCat && ERROR_CATEGORY_COLOR_STYLES[matchedCat.color]) {
    return matchedCat.color;
  }
  if (err.color && ERROR_CATEGORY_COLOR_STYLES[err.color]) {
    return err.color;
  }
  if (catName.includes('تجويد') || catName.includes('التجويد')) {
    return 'teal';
  }
  return 'rose';
}

export function getErrorColorStyle(
  err: Pick<CompetitionErrorType, 'name' | 'category' | 'color'>,
  categories?: CompetitionErrorCategory[]
): ErrorCategoryColorStyle {
  const key = resolveErrorColorKey(err, categories);
  return ERROR_CATEGORY_COLOR_STYLES[key] || ERROR_CATEGORY_COLOR_STYLES.rose;
}


