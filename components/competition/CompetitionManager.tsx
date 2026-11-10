import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../../App';
import {
  Competition,
  CompetitionLevel,
  CompetitionEvaluator,
  CompetitionParticipant,
  CompetitionErrorCategory,
  CompetitionErrorType,
  ErrorCategoryColorKey,
} from '../../types';
import {
  Plus,
  Trash2,
  Award,
  Users,
  FileText,
  Settings,
  UserCheck,
  ChevronRight,
  Save,
  Upload,
  Download,
  Sliders,
  Check,
  UserPlus,
  FileSpreadsheet,
  Copy,
  BookOpen,
  Edit,
  KeyRound,
  AlertTriangle,
  Sparkles,
  BarChart3,
  Printer,
  Trophy,
  Medal,
  ShieldCheck,
  Filter,
  ArrowUpDown,
  Search,
  RefreshCw,
  FileCheck,
  Lock,
  Unlock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { surahNames } from '../../utils/quranData';
import {
  DEFAULT_ERROR_CATEGORIES,
  DEFAULT_COMPETITION_ERRORS,
  ERROR_CATEGORY_COLOR_OPTIONS,
  ERROR_CATEGORY_COLOR_STYLES,
  resolveLevelErrorCategories,
  resolveCompetitionErrorCategories,
  resolveCompetitionErrors,
  resolveErrorCategoryName,
  getErrorColorStyle,
  parseJuzsToNumbers,
  formatJuzsFromNumbers,
  formatJuzsOrSurahsDisplay,
  isUnspecifiedJuzCount,
  extractJuzCount,
} from '../../utils/juzUtils';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import {
  createStyledWorkbook,
  createStyledSheetFromRows,
  createComprehensiveMergedSheet,
  appendStyledSheet,
  writeStyledWorkbookFile,
  getLevelSheetTheme,
} from '../../utils/excelStyledExport';

const inlinedImageCache = new Map<string, string>();
import MultiSelectFilterDropdown from './MultiSelectFilterDropdown';

/**
 * تنظيف اسم المتسابق عند اللصق من قوائم مرقمة (مثل واتساب أو وورد: "1- أحمد" أو "١. محمد")
 */
const cleanParticipantLine = (line: string): string => {
  return line
    .trim()
    .replace(/^[\d٠-٩]+[\s\-.)،:]+/, '')
    .replace(/^[•\-*]+[\s]*/, '')
    .trim();
};

/**
 * نسخ عميق للمستويات وجميع إعداداتها وبنود الخصم لضمان عدم تأثر المسابقة الأصلية عند التعديل
 */
const deepCloneLevels = (sourceLevels: CompetitionLevel[]): CompetitionLevel[] => {
  return (sourceLevels || []).map((lvl, idx) => ({
    ...lvl,
    id: lvl.id || idx + 1,
    errorCategories: lvl.errorCategories
      ? lvl.errorCategories.map(cat => ({ ...cat }))
      : DEFAULT_ERROR_CATEGORIES.map(cat => ({ ...cat })),
    errors: (lvl.errors || []).map((err, eIdx) => ({
      ...err,
      id: err.id || eIdx + 1,
      category: resolveErrorCategoryName(err),
    })),
  }));
};

export interface CreateCompetitionOptions {
  sourceCompetitionId?: string;
  copyEvaluators?: boolean;
  copyParticipants?: boolean;
}

/**
 * حقول قالب الإكسل المعتمدة بالترتيب (الأصل من اليمين إلى اليسار):
 * رقم الطلب ، الاسم الكامل ، الرقم المدني ، رقم الهاتف ، الجنس ، الولاية ، مستوى المشاركة ، وقت وتاريخ التسجيل
 */
export const EXCEL_TEMPLATE_HEADERS = [
  'رقم الطلب',
  'الاسم الكامل',
  'الرقم المدني',
  'رقم الهاتف',
  'الجنس',
  'الولاية',
  'مستوى المشاركة',
  'وقت وتاريخ التسجيل',
] as const;

const normalizeArabicText = (str: string): string => {
  return String(str || '')
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
};

const inferInitialScopeFromLevelName = (levelName: string): string => {
  const norm = normalizeArabicText(levelName);
  if (norm.includes('30') || norm.includes('ثلاثين') || norm.includes('ثلاثون') || norm.includes('كاملا') || norm.includes('كامل')) {
    return 'الأجزاء: من 1 إلى 30';
  }
  if (norm.includes('25') || norm.includes('خمسه وعشرين') || norm.includes('خمس وعشرين')) {
    return 'الأجزاء: من 1 إلى 25';
  }
  if (norm.includes('20') || norm.includes('عشرين') || norm.includes('عشرون')) {
    return 'الأجزاء: من 1 إلى 20';
  }
  if (norm.includes('15') || norm.includes('خمسه عشر') || norm.includes('خمس عشر')) {
    return 'الأجزاء: من 1 إلى 15';
  }
  if (norm.includes('10') || norm.includes('عشره') || norm.includes('عشر اجزاء')) {
    return 'الأجزاء: من 1 إلى 10';
  }
  if (norm.includes('5') || norm.includes('خمسه') || norm.includes('خمس اجزاء')) {
    return 'الأجزاء: من 1 إلى 5';
  }
  if (norm.includes('3') || norm.includes('ثلاثه') || norm.includes('ثلاث اجزاء')) {
    return 'الأجزاء: من 28 إلى 30';
  }
  if (norm.includes('جزءين') || norm.includes('جزئين') || norm.includes('2')) {
    return 'الأجزاء: من 29 إلى 30';
  }
  if (norm.includes('عم') || norm.includes('جزء واحد')) {
    return 'الأجزاء: 30';
  }
  if (norm.includes('تبارك')) {
    return 'الأجزاء: من 29 إلى 30';
  }
  return 'الأجزاء: من 1 إلى 5';
};

type ExcelFieldKey =
  | 'requestNumber'
  | 'name'
  | 'civilId'
  | 'phone'
  | 'gender'
  | 'wilayat'
  | 'levelName'
  | 'registrationDate'
  | 'scope';

const detectHeaderFieldKey = (rawHeader: string): ExcelFieldKey | null => {
  const h = normalizeArabicText(rawHeader);
  if (!h) return null;
  if (h.includes('رقم الطلب') || h === 'الطلب' || h === 'رقم التسجيل' || h === 'تسلسل' || h === 'م') {
    return 'requestNumber';
  }
  if (
    h.includes('الاسم الكامل') ||
    h.includes('الاسم بالكامل') ||
    h.includes('اسم المتسابق') ||
    h.includes('اسم المشارك') ||
    h === 'الاسم' ||
    h === 'المتسابق' ||
    h === 'المشارك' ||
    h.includes('الاسم الثلاثي') ||
    h.includes('الاسم الرباعي')
  ) {
    return 'name';
  }
  if (h.includes('الرقم المدني') || h.includes('المدني') || h.includes('رقم الهويه') || h === 'الهويه') {
    return 'civilId';
  }
  if (h.includes('رقم الهاتف') || h.includes('الهاتف') || h.includes('الجوال') || h.includes('النقال')) {
    return 'phone';
  }
  if (h === 'الجنس' || h.includes('الجنس') || h === 'النوع') {
    return 'gender';
  }
  if (h === 'الولايه' || h.includes('الولايه') || h.includes('المحافظه') || h.includes('المنطقه')) {
    return 'wilayat';
  }
  if (
    h.includes('مستوي المشاركه') ||
    h === 'المستوي' ||
    h.includes('اسم المستوي') ||
    h.includes('فرع المسابقه') ||
    h === 'الفرع' ||
    h === 'الفئه'
  ) {
    return 'levelName';
  }
  if (
    h.includes('وقت وتاريخ التسجيل') ||
    h.includes('تاريخ التسجيل') ||
    h.includes('وقت التسجيل') ||
    h.includes('تاريخ الطلب') ||
    h === 'التاريخ'
  ) {
    return 'registrationDate';
  }
  if (h.includes('الاجزاء او السور') || h === 'النطاق' || h === 'الاجزاء' || h === 'السور') {
    return 'scope';
  }
  return null;
};

/**
 * تحميل قالب الإكسل المعتمد بالحقول الـ 8 مرتبة من اليمين إلى اليسار
 */
const downloadCompetitionExcelTemplate = (
  comp: Competition,
  customLevels?: CompetitionLevel[]
) => {
  const activeLevels =
    customLevels && customLevels.length > 0
      ? customLevels
      : comp.levels && comp.levels.length > 0
      ? comp.levels
      : [];

  const sampleWilayats = ['عبري', 'ينقل', 'ضنك'];
  const sampleNames = [
    'عبدالرحمن بن محمد بن سالم الغافري',
    'فاطمة بنت عبدالله بن سعيد الهنائية',
    'أحمد بن خالد بن علي المعمري',
  ];

  const rows =
    activeLevels.length > 0
      ? activeLevels.map((lvl, idx) => ({
          'رقم الطلب': `${1001 + idx}`,
          'الاسم الكامل': sampleNames[idx % sampleNames.length],
          'الرقم المدني': `${10203040 + idx}`,
          'رقم الهاتف': `9911223${idx}`,
          'الجنس': idx % 2 === 1 ? 'أنثى' : 'ذكر',
          'الولاية': sampleWilayats[idx % sampleWilayats.length],
          'مستوى المشاركة': lvl.name,
          'وقت وتاريخ التسجيل': '2026-11-03 08:30:00',
        }))
      : [
          {
            'رقم الطلب': '1001',
            'الاسم الكامل': 'عبدالرحمن بن محمد بن سالم الغافري',
            'الرقم المدني': '10203040',
            'رقم الهاتف': '99112233',
            'الجنس': 'ذكر',
            'الولاية': 'عبري',
            'مستوى المشاركة': 'المستوى الأول (خمسة أجزاء)',
            'وقت وتاريخ التسجيل': '2026-11-03 08:30:00',
          },
          {
            'رقم الطلب': '1002',
            'الاسم الكامل': 'فاطمة بنت عبدالله بن سعيد الهنائية',
            'الرقم المدني': '10203041',
            'رقم الهاتف': '99112234',
            'الجنس': 'أنثى',
            'الولاية': 'ينقل',
            'مستوى المشاركة': 'المستوى الثاني (ثلاثة أجزاء)',
            'وقت وتاريخ التسجيل': '2026-11-03 09:15:00',
          },
        ];

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [...EXCEL_TEMPLATE_HEADERS],
  });

  // جعل اتجاه ورقة الإكسل من اليمين إلى اليسار كأصل معتمد
  ws['!views'] = [{ rightToLeft: true }];
  ws['!cols'] = [
    { wch: 14 }, // رقم الطلب
    { wch: 32 }, // الاسم الكامل
    { wch: 16 }, // الرقم المدني
    { wch: 16 }, // رقم الهاتف
    { wch: 12 }, // الجنس
    { wch: 16 }, // الولاية
    { wch: 30 }, // مستوى المشاركة
    { wch: 24 }, // وقت وتاريخ التسجيل
  ];

  const wb = XLSX.utils.book_new();
  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Views) wb.Workbook.Views = [{}];
  wb.Workbook.Views[0].RTL = true;

  XLSX.utils.book_append_sheet(wb, ws, 'المشاركين_والمستويات');
  XLSX.writeFile(wb, `قالب_متسابقي_${comp.name || 'المسابقة'}.xlsx`);
};

/**
 * قراءة واستيراد ملف الإكسل بذكاء (يقبل الترتيب من اليمين إلى اليسار أو من اليسار إلى اليمين)
 * ويقوم بتفعيل المستويات وإضافة مستويات جديدة تلقائياً إذا لم تكن موجودة
 */
const parseAndImportCompetitionExcel = (
  ws: XLSX.WorkSheet,
  comp: Competition,
  currentLevels: CompetitionLevel[],
  targetLevelId?: number | null
): {
  updatedLevels: CompetitionLevel[];
  newParticipants: CompetitionParticipant[];
  addedLevelsCount: number;
} => {
  const rawMatrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as any[][];

  const compErrorCategories = resolveCompetitionErrorCategories(comp);
  const compErrors = resolveCompetitionErrors(comp);

  // البحث عن صف العناوين في أول 10 صفوف
  let headerRowIndex = -1;
  const colMap: Record<number, ExcelFieldKey> = {};

  for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
    const row = rawMatrix[r] || [];
    const tempMap: Record<number, ExcelFieldKey> = {};
    let matchedCount = 0;

    row.forEach((cell, colIdx) => {
      const detected = detectHeaderFieldKey(String(cell || ''));
      if (detected) {
        tempMap[colIdx] = detected;
        matchedCount++;
      }
    });

    if (matchedCount >= 2 || (matchedCount === 1 && Object.values(tempMap).includes('name'))) {
      headerRowIndex = r;
      Object.assign(colMap, tempMap);
      break;
    }
  }

  // إذا لم يكن هناك صف عناوين صريح، نستنتج ترتيب الأعمدة (من اليمين أو من اليسار)
  const standardOrder: ExcelFieldKey[] = [
    'requestNumber',
    'name',
    'civilId',
    'phone',
    'gender',
    'wilayat',
    'levelName',
    'registrationDate',
  ];

  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  if (headerRowIndex === -1 && rawMatrix.length > 0) {
    const firstNonEmpty = rawMatrix.find(
      row => Array.isArray(row) && row.some(c => String(c || '').trim() !== '')
    );
    if (firstNonEmpty) {
      const nonEmptyCols = firstNonEmpty.length;
      if (nonEmptyCols >= 7) {
        const col0 = String(firstNonEmpty[0] || '').trim();
        const col1 = String(firstNonEmpty[1] || '').trim();
        const colLast = String(firstNonEmpty[nonEmptyCols - 1] || '').trim();
        const colBeforeLast = String(firstNonEmpty[nonEmptyCols - 2] || '').trim();

        const looksLikeDate = (v: string) =>
          /(\d{4}[-/]\d{1,2}|\d{1,2}[-/]\d{4}|\d{1,2}:\d{2})/.test(v);
        const looksLikeArabicName = (v: string) =>
          /[\u0600-\u06FF]{2,}\s+[\u0600-\u06FF]{2,}/.test(v);

        const isReversedLTR =
          (looksLikeDate(col0) && !looksLikeDate(colLast)) ||
          (!looksLikeArabicName(col1) && looksLikeArabicName(colBeforeLast));

        if (isReversedLTR) {
          const reversed = [...standardOrder].reverse();
          reversed.forEach((key, idx) => {
            colMap[idx] = key;
          });
        } else {
          standardOrder.forEach((key, idx) => {
            colMap[idx] = key;
          });
        }
      } else {
        colMap[0] = 'name';
        if (nonEmptyCols >= 2) colMap[1] = 'levelName';
        if (nonEmptyCols >= 3) colMap[2] = 'scope';
      }
    }
  }

  let updatedLevels = [...currentLevels];
  const initialLevelsCount = updatedLevels.length;

  // هل المسابقة تحتوي فقط على المستوى الافتراضي الأولي الفارغ بدون أي مشاركين سابقين؟
  const hadOnlyDefaultEmptyLevel =
    updatedLevels.length === 1 &&
    (comp.participants || []).length === 0 &&
    updatedLevels[0].name === 'المستوى الأول (خمسة أجزاء)';
  let defaultLevelWasMatched = false;

  const newParticipants: CompetitionParticipant[] = [];
  const baseId = Date.now();
  let addedLevelsCount = 0;

  for (let r = dataStartRow; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row) || row.every(c => String(c || '').trim() === '')) {
      continue;
    }

    const extracted: Partial<Record<ExcelFieldKey, string>> = {};
    Object.entries(colMap).forEach(([colIdxStr, fieldKey]) => {
      const val = String(row[Number(colIdxStr)] ?? '').trim();
      if (val && !extracted[fieldKey]) {
        extracted[fieldKey] = val;
      }
    });

    // إذا لم يُلتقط الاسم من colMap، نبحث عن أول خلية نصية مناسبة
    const rawName = extracted.name || '';
    const pName = cleanParticipantLine(rawName);

    // تخطي صفوف العناوين المكررة أو الفارغة
    if (
      !pName ||
      detectHeaderFieldKey(pName) === 'name' ||
      pName === 'الاسم الكامل' ||
      pName === 'الاسم بالكامل' ||
      pName === 'اسم المتسابق'
    ) {
      continue;
    }

    const rawLevelName = (extracted.levelName || '').trim();
    const rawScope = (extracted.scope || '').trim();

    let matchedLevel: CompetitionLevel | undefined;

    if (targetLevelId && !rawLevelName) {
      matchedLevel = updatedLevels.find(l => Number(l.id) === Number(targetLevelId));
    }

    if (!matchedLevel && rawLevelName) {
      const normTarget = normalizeArabicText(rawLevelName);
      matchedLevel = updatedLevels.find(l => {
        const normExisting = normalizeArabicText(l.name);
        return (
          normExisting === normTarget ||
          (normExisting.length > 4 &&
            normTarget.length > 4 &&
            (normExisting.includes(normTarget) || normTarget.includes(normExisting)))
        );
      });

      if (matchedLevel && hadOnlyDefaultEmptyLevel && matchedLevel.id === updatedLevels[0]?.id) {
        defaultLevelWasMatched = true;
      }

      // إذا لم يكن المستوى موجوداً في المسابقة، ننشئ مستوى جديداً تلقائياً
      if (!matchedLevel) {
        const newLvId =
          updatedLevels.length > 0
            ? Math.max(...updatedLevels.map(l => Number(l.id) || 0)) + 1
            : 1;
        matchedLevel = {
          id: newLvId,
          name: rawLevelName,
          juzsOrSurahs: rawScope || inferInitialScopeFromLevelName(rawLevelName),
          segmentsCount: 5,
          linesPerSegment: 7,
          maxScore: 100,
          errorCategories: compErrorCategories.map(c => ({ ...c })),
          errors: compErrors.map(e => ({ ...e })),
        };
        updatedLevels.push(matchedLevel);
        addedLevelsCount++;
      }
    }

    if (!matchedLevel) {
      matchedLevel =
        (targetLevelId
          ? updatedLevels.find(l => Number(l.id) === Number(targetLevelId))
          : undefined) || updatedLevels[0];

      if (!matchedLevel) {
        matchedLevel = {
          id: 1,
          name: 'المستوى الأول',
          juzsOrSurahs: 'الأجزاء: من 1 إلى 5',
          segmentsCount: 5,
          linesPerSegment: 7,
          maxScore: 100,
          errorCategories: compErrorCategories.map(c => ({ ...c })),
          errors: compErrors.map(e => ({ ...e })),
        };
        updatedLevels.push(matchedLevel);
        addedLevelsCount++;
      } else if (hadOnlyDefaultEmptyLevel && matchedLevel.id === updatedLevels[0]?.id) {
        defaultLevelWasMatched = true;
      }
    }

    newParticipants.push({
      id: baseId + r,
      name: pName,
      levelId: matchedLevel.id,
      juzsOrSurahs: rawScope || matchedLevel.juzsOrSurahs,
      requestNumber: extracted.requestNumber || undefined,
      civilId: extracted.civilId || undefined,
      phone: extracted.phone || undefined,
      gender: extracted.gender || undefined,
      wilayat: extracted.wilayat || undefined,
      registrationDate: extracted.registrationDate || undefined,
    });
  }

  // إذا كانت المسابقة تحتوي فقط على المستوى الافتراضي الأولي الفارغ وتم استيراد مستويات جديدة من ملف الإكسل، نحذف المستوى الافتراضي الفارغ غير المستخدم
  if (
    hadOnlyDefaultEmptyLevel &&
    !defaultLevelWasMatched &&
    updatedLevels.length > initialLevelsCount
  ) {
    const unusedDefaultId = currentLevels[0].id;
    updatedLevels = updatedLevels.filter(l => l.id !== unusedDefaultId);
  }

  return {
    updatedLevels,
    newParticipants,
    addedLevelsCount,
  };
};

/**
 * استخراج المستويات المسندة لكل مقيم بوضوح (مثل: المستوى الأول، المستوى الثاني...)
 */
function getEvaluatorAssignedLevelsInfo(
  ev: CompetitionEvaluator,
  levels: CompetitionLevel[],
  participants: CompetitionParticipant[] = []
) {
  const safeLevels = levels || [];
  const rawIds = Array.isArray(ev.levelIds) ? ev.levelIds.map(Number) : [];
  const assignedLevels =
    rawIds.length > 0
      ? safeLevels.filter(l => rawIds.includes(Number(l.id)))
      : safeLevels;

  const assignedLevelNames = assignedLevels.map(l => l.name);
  const isAllLevels =
    safeLevels.length > 0 && assignedLevels.length === safeLevels.length;

  const formattedLabel =
    assignedLevelNames.length > 0
      ? assignedLevelNames.join(' ، ')
      : 'جميع المستويات';

  const assignedLevelIdsSet = new Set(assignedLevels.map(l => Number(l.id)));
  const participantsCount = (participants || []).filter(p =>
    assignedLevelIdsSet.has(Number(p.levelId))
  ).length;

  return {
    assignedLevels,
    assignedLevelNames,
    formattedLabel,
    isAllLevels,
    participantsCount,
  };
}

/**
 * تصدير كافة بيانات إعداد المسابقة وتوزيع المقيمين على المستويات بصيغة إكسل (Excel) منسقة من اليمين لليسار
 */
function exportCompetitionSetupExcel(
  comp: Competition,
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
) {
  const levels = comp.levels || [];
  const evaluators = comp.evaluators || [];
  const participants = comp.participants || [];
  const compCategories = resolveCompetitionErrorCategories(comp);
  const compErrors = resolveCompetitionErrors(comp);

  // الورقة 1: بيانات المقيمين والمستويات المسندة لكل مقيم
  const evaluatorsSheetData =
    evaluators.length > 0
      ? evaluators.map((ev, idx) => {
          const info = getEvaluatorAssignedLevelsInfo(ev, levels, participants);
          const allowedEditNames = (ev.allowedEditLevelIds || [])
            .map(lvlId => levels.find(l => Number(l.id) === Number(lvlId))?.name)
            .filter(Boolean);
          const editPermissionText =
            allowedEditNames.length > 0
              ? `مسموح بالتعديل في (${allowedEditNames.join(' ، ')})`
              : 'مقفل بعد الاعتماد (الافتراضي)';

          return {
            'م': idx + 1,
            'اسم المقيم': ev.name,
            'رمز الدخول (PIN)': ev.pin || '',
            'المستويات المسندة للمقيم': info.formattedLabel,
            'نطاق الإسناد': info.isAllLevels
              ? `جميع المستويات (${info.assignedLevels.length})`
              : `${info.assignedLevels.length} من ${levels.length} مستويات`,
            'صلاحية تعديل التقييمات بعد الحفظ': editPermissionText,
            'عدد المتسابقين المشمولين بتحكيمه': info.participantsCount,
          };
        })
      : [
          {
            'م': 1,
            'اسم المقيم': 'لم يتم إضافة مقيمين بعد',
            'رمز الدخول (PIN)': '-',
            'المستويات المسندة للمقيم': '-',
            'نطاق الإسناد': '-',
            'صلاحية تعديل التقييمات بعد الحفظ': '-',
            'عدد المتسابقين المشمولين بتحكيمه': 0,
          },
        ];

  // الورقة 2: تقسيم اللجان وإعدادات كل مستوى
  const levelsSheetData = levels.map((lvl, idx) => {
    const levelEvaluators = evaluators.filter(ev => {
      const ids = Array.isArray(ev.levelIds) ? ev.levelIds.map(Number) : [];
      return ids.length === 0 || ids.includes(Number(lvl.id));
    });
    const levelParticipants = participants.filter(
      p => Number(p.levelId) === Number(lvl.id)
    );
    return {
      'م': idx + 1,
      'اسم المستوى': lvl.name,
      'المقرر (الأجزاء أو السور)': formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs),
      'عدد المقاطع': lvl.segmentsCount,
      'عدد الأسطر لكل مقطع': lvl.linesPerSegment,
      'الدرجة النهائية': lvl.maxScore,
      'عدد المقيمين في هذا المستوى': levelEvaluators.length,
      'أسماء مقيمي هذا المستوى':
        levelEvaluators.length > 0
          ? levelEvaluators.map(e => e.name).join(' ، ')
          : 'لم يسند مقيمون بعد',
      'عدد المتسابقين المسجلين': levelParticipants.length,
    };
  });

  // الورقة 3: الإعدادات العامة للمسابقة وأزرار خصم الأخطاء
  const passageModeLabel =
    comp.passageMode === 'international'
      ? 'تصنيف المسابقات العالمية (الأكثر صعوبة / متوسطة / الأقل)'
      : comp.passageMode === 'manual'
      ? `التحديد اليدوي للمشرف (${(comp.manualPassages || []).length} نطاق)`
      : 'المقاطع العشوائية المتوازنة';

  const generalAndErrorsData: Record<string, any>[] = [
    {
      'البند': 'اسم المسابقة',
      'القيمة / التفاصيل': comp.name,
      'ملاحظات إضافية': comp.seasonText || '',
    },
    {
      'البند': 'حالة تفعيل المسابقة للمقيمين',
      'القيمة / التفاصيل': comp.isActive ? 'مفعّلة (متاحة للدخول والتقييم)' : 'غير مفعّلة (محجوبة)',
      'ملاحظات إضافية': `نظام المقاطع: ${passageModeLabel}`,
    },
    {
      'البند': 'إحصائية الإعدادات',
      'القيمة / التفاصيل': `المستويات: ${levels.length} | المقيمون: ${evaluators.length} | المشاركون: ${participants.length}`,
      'ملاحظات إضافية': `بنود الخصم: ${compErrors.length} أزرار في ${compCategories.length} أصناف`,
    },
    ...compErrors.map((err, i) => {
      const cat = compCategories.find(
        c => c.id === err.category || c.name === err.category
      );
      return {
        'البند': `زر خصم (${i + 1}): ${err.name}`,
        'القيمة / التفاصيل': `خصم (-${err.deduction}) درجة`,
        'ملاحظات إضافية': `الصنف: ${cat?.name || err.category || 'حفظ'}`,
      };
    }),
  ];

  // الورقة 4: كشف المشاركين المسجلين في المسابقة
  const participantsSheetData =
    participants.length > 0
      ? participants.map((p, idx) => {
          const lvl = levels.find(l => Number(l.id) === Number(p.levelId));
          return {
            'رقم الطلب': p.requestNumber || String(idx + 1),
            'الاسم الكامل': p.name,
            'الرقم المدني': p.civilId || '',
            'رقم الهاتف': p.phone || '',
            'الجنس': p.gender || '',
            'الولاية': p.wilayat || '',
            'مستوى المشاركة': lvl?.name || 'غير محدد',
            'المقرر المعتمد': formatJuzsOrSurahsDisplay(
              p.juzsOrSurahs || lvl?.juzsOrSurahs || ''
            ),
            'وقت وتاريخ التسجيل': p.registrationDate || '',
          };
        })
      : [
          {
            'رقم الطلب': '-',
            'الاسم الكامل': 'لا يوجد مشاركون مسجلون بعد',
            'الرقم المدني': '',
            'رقم الهاتف': '',
            'الجنس': '',
            'الولاية': '',
            'مستوى المشاركة': '',
            'المقرر المعتمد': '',
            'وقت وتاريخ التسجيل': '',
          },
        ];

  const wb = createStyledWorkbook();

  const wsEvals = createStyledSheetFromRows(evaluatorsSheetData, {
    titleBanner: `${comp.name} — كشف المقيمين والمستويات المسندة إليهم`,
    colWidths: [8, 28, 18, 45, 22, 26, 18],
    theme: getLevelSheetTheme(0),
  });
  appendStyledSheet(wb, wsEvals, 'المقيمون ومستوياتهم', 1);

  const wsLevels = createStyledSheetFromRows(levelsSheetData, {
    titleBanner: `${comp.name} — إعدادات المستويات وتقسيم لجان المقيمين`,
    colWidths: [8, 26, 32, 16, 18, 15, 20, 45, 20],
    theme: getLevelSheetTheme(1),
  });
  appendStyledSheet(wb, wsLevels, 'المستويات وتقسيم اللجان', 2);

  const wsGeneral = createStyledSheetFromRows(generalAndErrorsData, {
    titleBanner: `${comp.name} — الإعدادات العامة وبنود خصم الأخطاء`,
    colWidths: [30, 42, 42],
    theme: getLevelSheetTheme(3),
  });
  appendStyledSheet(wb, wsGeneral, 'الإعدادات وبنود الخصم', 3);

  const wsParticipants = createStyledSheetFromRows(participantsSheetData, {
    titleBanner: `${comp.name} — كشف المتسابقين المسجلين (${participants.length} متسابق)`,
    colWidths: [14, 32, 16, 16, 12, 16, 26, 28, 22],
    theme: getLevelSheetTheme(4),
  });
  appendStyledSheet(wb, wsParticipants, 'كشف المشاركين الشامل', 4);

  // إضافة ورقة مستقلة لكل مستوى تحتوي على متسابقي ذلك المستوى
  levels.forEach((lvl, idx) => {
    const lvlParts = participants.filter(p => Number(p.levelId) === Number(lvl.id));
    const lvlRows =
      lvlParts.length > 0
        ? lvlParts.map((p, pIdx) => ({
            'رقم الطلب': p.requestNumber || pIdx + 1,
            'الاسم الكامل': p.name || '',
            'الرقم المدني': p.civilId || '',
            'رقم الهاتف': p.phone || '',
            'الجنس': p.gender || '',
            'الولاية': p.wilayat || '',
            'مستوى المشاركة': lvl.name || '',
            'المقرر المعتمد': formatJuzsOrSurahsDisplay(p.juzsOrSurahs || lvl.juzsOrSurahs || ''),
            'وقت وتاريخ التسجيل': p.registrationDate || '',
          }))
        : [
            {
              'رقم الطلب': '-',
              'الاسم الكامل': 'لا يوجد متسابقون مسجلون في هذا المستوى حالياً',
              'الرقم المدني': '-',
              'رقم الهاتف': '-',
              'الجنس': '-',
              'الولاية': '-',
              'مستوى المشاركة': lvl.name,
              'المقرر المعتمد': formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs),
              'وقت وتاريخ التسجيل': '-',
            },
          ];

    const wsLvl = createStyledSheetFromRows(lvlRows, {
      titleBanner: `${comp.name} — متسابقو ${lvl.name}`,
      subtitleBanner: `المقرر: ${formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)} | عدد المتسابقين: ${lvlParts.length}`,
      colWidths: [14, 32, 16, 16, 12, 16, 26, 28, 22],
      theme: getLevelSheetTheme(idx),
    });
    appendStyledSheet(wb, wsLvl, lvl.name || `المستوى ${idx + 1}`, idx + 5);
  });

  const safeName = (comp.name || 'المسابقة').replace(/[\\/:*?"<>|]/g, '_');
  writeStyledWorkbookFile(wb, `إعدادات_ومراجعة_${safeName}.xlsx`);
  showToast?.(
    'تم تصدير ملف إكسل المنسق والملون لإعدادات المسابقة وأوراق المستويات بنجاح!',
    'success'
  );
}

/**
 * تصدير وطباعة بيانات إعداد المسابقة وتقسيم المقيمين والمستويات بصيغة PDF رسمية منسقة
 */
async function exportCompetitionSetupPDF(
  comp: Competition,
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
) {
  const levels = comp.levels || [];
  const evaluators = comp.evaluators || [];
  const participants = comp.participants || [];
  const compCategories = resolveCompetitionErrorCategories(comp);
  const compErrors = resolveCompetitionErrors(comp);

  showToast?.('جارِ تجهيز وثيقة إعدادات المسابقة وتقسيم اللجان بصيغة PDF...', 'info');

  const passageModeLabel =
    comp.passageMode === 'international'
      ? 'تصنيف المسابقات العالمية (الأكثر صعوبة / متوسطة / الأقل)'
      : comp.passageMode === 'manual'
      ? `التحديد اليدوي للمشرف (${(comp.manualPassages || []).length} نطاق)`
      : 'المقاطع العشوائية المتوازنة';

  const dateStr = new Date().toLocaleDateString('ar-OM', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const evaluatorsRowsHtml =
    evaluators.length > 0
      ? evaluators
          .map((ev, idx) => {
            const info = getEvaluatorAssignedLevelsInfo(ev, levels, participants);
            const badgesHtml = info.assignedLevels
              .map(
                l =>
                  `<span style="display:inline-block;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:6px;padding:2px 8px;margin:2px;font-size:11px;font-weight:800;">${l.name}</span>`
              )
              .join(' ');
            const allowedEditCount = (ev.allowedEditLevelIds || []).length;
            const editPermHtml =
              allowedEditCount > 0
                ? `<span style="color:#047857;font-weight:800;font-size:10px;background:#ecfdf5;padding:2px 6px;border-radius:4px;border:1px solid #a7f3d0;">🔓 مسموح (${allowedEditCount})</span>`
                : `<span style="color:#64748b;font-weight:700;font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:4px;border:1px solid #cbd5e1;">🔒 مقفل بعد الحفظ</span>`;

            return `
              <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">${idx + 1}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;font-weight:800;color:#0f172a;">${ev.name}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;font-weight:900;color:#b45309;background:#fffbeb;">${ev.pin || '-'}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;">${badgesHtml || 'جميع المستويات'}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">${info.assignedLevels.length} من ${levels.length}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;">${editPermHtml}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;color:#047857;">${info.participantsCount}</td>
              </tr>
            `;
          })
          .join('')
      : `<tr><td colspan="7" style="padding:14px;border:1px solid #cbd5e1;text-align:center;color:#64748b;font-weight:700;">لا يوجد مقيمون مضافون لهذه المسابقة حالياً</td></tr>`;

  const levelsRowsHtml =
    levels.length > 0
      ? levels
          .map((lvl, idx) => {
            const levelEvaluators = evaluators.filter(ev => {
              const ids = Array.isArray(ev.levelIds) ? ev.levelIds.map(Number) : [];
              return ids.length === 0 || ids.includes(Number(lvl.id));
            });
            const levelParticipantsCount = participants.filter(
              p => Number(p.levelId) === Number(lvl.id)
            ).length;
            const evalBadges =
              levelEvaluators.length > 0
                ? levelEvaluators
                    .map(
                      e =>
                        `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;padding:2px 8px;margin:2px;font-size:11px;font-weight:800;">${e.name}</span>`
                    )
                    .join(' ')
                : `<span style="color:#dc2626;font-size:11px;font-weight:700;">لم يسند مقيمون بعد</span>`;

            return `
              <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">${idx + 1}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;font-weight:800;color:#064e3b;">${lvl.name}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;font-weight:700;">${formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">${lvl.segmentsCount} مقاطع × ${lvl.linesPerSegment} أسطر</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">${lvl.maxScore}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;color:#047857;">${levelParticipantsCount}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;">${evalBadges}</td>
              </tr>
            `;
          })
          .join('')
      : '';

  const errorsBadgesHtml = compErrors
    .map(err => {
      const cat = compCategories.find(
        c => c.id === err.category || c.name === err.category
      );
      return `<div style="display:inline-flex;align-items:center;gap:6px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:5px 10px;margin:3px;">
        <span style="font-weight:900;color:#881337;font-size:12px;">${err.name}</span>
        <span style="font-weight:800;color:#be123c;font-size:11px;">(-${err.deduction})</span>
        <span style="background:#ffe4e6;color:#9f1239;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;">صنف: ${cat?.name || err.category || 'حفظ'}</span>
      </div>`;
    })
    .join('');

  const participantsRowsHtml =
    participants.length > 0
      ? participants
          .map((p, idx) => {
            const lvl = levels.find(l => Number(l.id) === Number(p.levelId));
            return `
              <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:700;">${p.requestNumber || idx + 1}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:800;">${p.name}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">${p.civilId || '-'}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">${p.phone || '-'}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">${p.gender || '-'}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">${p.wilayat || '-'}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:800;color:#065f46;">${lvl?.name || '-'}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;">${formatJuzsOrSurahsDisplay(p.juzsOrSurahs || lvl?.juzsOrSurahs || '')}</td>
              </tr>
            `;
          })
          .join('')
      : '';

  const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <base href="${window.location.origin}/" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      margin: 0; padding: 0;
      font-family: 'Tajawal', 'Cairo', sans-serif;
      direction: rtl; text-align: right;
      color: #0f172a; background: #ffffff;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    .section-title {
      background: #064e3b; color: #ffffff;
      padding: 8px 14px; border-radius: 8px;
      font-size: 14px; font-weight: 900;
      margin: 16px 0 8px 0;
      display: flex; align-items: center; justify-content: space-between;
    }
  </style>
</head>
<body dir="rtl">
  <div id="root" style="border: 2px solid #065f46; border-radius: 14px; padding: 16px; background: #ffffff;">
    <!-- الترويسة الرسمية -->
    <div style="background: linear-gradient(135deg, #064e3b, #0f2347); color: #ffffff; padding: 16px 20px; border-radius: 12px; border-bottom: 4px solid #d4af37; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 12px; color: #fcd34d; font-weight: 800;">سلطنة عُمان • وزارة الأوقاف والشؤون الدينية</div>
        <div style="font-size: 12px; color: #e2e8f0; font-weight: 700; margin-bottom: 6px;">إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة</div>
        <div style="font-size: 20px; font-weight: 900; color: #ffffff;">وثيقة إعدادات ومراجعة المسابقة وتوزيع اللجان</div>
        <div style="font-size: 14px; font-weight: 800; color: #fde68a; margin-top: 2px;">${comp.name} ${comp.seasonText ? `— ${comp.seasonText}` : ''}</div>
      </div>
      <div style="text-align: left; font-size: 11px; color: #e2e8f0; line-height: 1.7;">
        <div><strong>تاريخ الإصدار:</strong> ${dateStr}</div>
        <div><strong>حالة المسابقة:</strong> ${comp.isActive ? 'مفعّلة للمقيمين' : 'غير مفعّلة'}</div>
        <div><strong>نظام المقاطع:</strong> ${passageModeLabel}</div>
      </div>
    </div>

    <!-- ملخص الإحصائيات السريع -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px;">
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px; text-align: center;">
        <div style="font-size: 11px; color: #166534; font-weight: 800;">إجمالي المستويات</div>
        <div style="font-size: 20px; color: #14532d; font-weight: 900;">${levels.length}</div>
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px; text-align: center;">
        <div style="font-size: 11px; color: #1e40af; font-weight: 800;">إجمالي المقيمين</div>
        <div style="font-size: 20px; color: #1e3a8a; font-weight: 900;">${evaluators.length}</div>
      </div>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 10px; text-align: center;">
        <div style="font-size: 11px; color: #92400e; font-weight: 800;">إجمالي المتسابقين</div>
        <div style="font-size: 20px; color: #78350f; font-weight: 900;">${participants.length}</div>
      </div>
      <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 10px; text-align: center;">
        <div style="font-size: 11px; color: #9f1239; font-weight: 800;">بنود خصم الأخطاء</div>
        <div style="font-size: 20px; color: #881337; font-weight: 900;">${compErrors.length}</div>
      </div>
    </div>

    <!-- أولاً: جدول المقيمين والمستويات المسندة لكل مقيم -->
    <div class="section-title">
      <span>أولاً: بيانات المقيمين وتوزيع المستويات المسندة لكل مقيم</span>
      <span style="font-size: 11px; color: #fde68a;">إجمالي المقيمين: ${evaluators.length}</span>
    </div>
    <table>
      <thead>
        <tr style="background: #ecfdf5; color: #064e3b;">
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 38px; text-align: center;">م</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">اسم المقيم</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 100px; text-align: center;">رمز الدخول</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">المستويات المسندة إليه (في أي المستويات هو)</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 85px; text-align: center;">عدد المستويات</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 110px; text-align: center;">صلاحية التعديل</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 85px; text-align: center;">عدد الطلاب</th>
        </tr>
      </thead>
      <tbody>
        ${evaluatorsRowsHtml}
      </tbody>
    </table>

    <!-- ثانياً: جدول المستويات وتقسيم لجان التقييم -->
    <div class="section-title">
      <span>ثانياً: إعدادات المستويات وتقسيم لجان المقيمين حسب كل مستوى</span>
      <span style="font-size: 11px; color: #fde68a;">إجمالي المستويات: ${levels.length}</span>
    </div>
    <table>
      <thead>
        <tr style="background: #ecfdf5; color: #064e3b;">
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 38px; text-align: center;">م</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 140px;">اسم المستوى</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 150px;">المقرر (الأجزاء / السور)</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 115px; text-align: center;">المقاطع والأسطر</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 65px; text-align: center;">الدرجة</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 65px; text-align: center;">المشاركون</th>
          <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">المقيمون المسندون لهذا المستوى</th>
        </tr>
      </thead>
      <tbody>
        ${levelsRowsHtml}
      </tbody>
    </table>

    <!-- ثالثاً: بنود خصم الأخطاء المعتمدة -->
    <div class="section-title">
      <span>ثالثاً: إعدادات أزرار وأصناف خصم الأخطاء في المسابقة</span>
      <span style="font-size: 11px; color: #fde68a;">موحدة لجميع مستويات المسابقة</span>
    </div>
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc;">
      ${errorsBadgesHtml}
    </div>

    ${
      participants.length > 0
        ? `
    <!-- رابعاً: كشف المشاركين المسجلين في المسابقة -->
    <div class="section-title" style="page-break-before: auto;">
      <span>رابعاً: كشف المتسابقين المسجلين في المسابقة</span>
      <span style="font-size: 11px; color: #fde68a;">إجمالي المتسابقين: ${participants.length}</span>
    </div>
    <table>
      <thead>
        <tr style="background: #ecfdf5; color: #064e3b;">
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 55px; text-align: center;">رقم الطلب</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1;">الاسم الكامل</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 90px; text-align: center;">الرقم المدني</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 85px; text-align: center;">الهاتف</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 55px; text-align: center;">الجنس</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 80px; text-align: center;">الولاية</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1; width: 120px;">المستوى</th>
          <th style="padding: 6px 8px; border: 1px solid #cbd5e1;">المقرر</th>
        </tr>
      </thead>
      <tbody>
        ${participantsRowsHtml}
      </tbody>
    </table>
    `
        : ''
    }
  </div>
</body>
</html>`;

  const safeName = (comp.name || 'المسابقة').replace(/[\\/:*?"<>|]/g, '_');
  const fileName = `إعدادات_ومراجعة_${safeName}`;

  try {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHtml, orientation: 'portrait' }),
    });
    if (res.ok) {
      const pdfBlob = await res.blob();
      if (pdfBlob.size > 500) {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast?.('تم تصدير وثيقة إعدادات المسابقة بصيغة PDF بنجاح!', 'success');
        return;
      }
    }
  } catch (err) {
    console.warn('Server PDF fallback to client canvas:', err);
  }

  // Fallback via html2canvas + jsPDF if /api/pdf is unavailable (e.g. static hosting)
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.top = '-10000px';
  tempContainer.style.left = '0';
  tempContainer.style.width = '960px';
  tempContainer.style.background = '#ffffff';
  tempContainer.style.zIndex = '-1';
  tempContainer.setAttribute('dir', 'rtl');
  tempContainer.innerHTML = fullHtml;
  document.body.appendChild(tempContainer);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 960,
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    const pageHeight = pdf.internal.pageSize.getHeight();
    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`${fileName}.pdf`);
    showToast?.('تم تصدير وثيقة إعدادات المسابقة بصيغة PDF بنجاح!', 'success');
  } catch (e) {
    console.error('Setup PDF fallback error:', e);
    showToast?.('تعذر تصدير PDF، يرجى المحاولة مرة أخرى', 'error');
  } finally {
    document.body.removeChild(tempContainer);
  }
}

export default function CompetitionManager({
  onOpenPassagesPage,
  onOpenEvaluatorsPage,
  resetToListTrigger,
}: {
  onOpenPassagesPage?: () => void;
  onOpenEvaluatorsPage?: () => void;
  resetToListTrigger?: number;
} = {}) {
  const context = useContext(AppContext);
  if (!context) return null;

  const {
    competitions,
    updateCompetitions,
    activeCompetitionId,
    setActiveCompetitionId,
    showToast,
  } = context;

  // عند فتح صفحة تبويب المسابقات القرآنية، نظهر أولاً قائمة المسابقات المسجلة، وعند النقر على أي مسابقة أو قلم التعديل تظهر تفاصيلها
  const [isViewingDetails, setIsViewingDetails] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<
    'general' | 'settings' | 'evaluators' | 'participants' | 'reports'
  >('settings');

  React.useEffect(() => {
    if (resetToListTrigger !== undefined && resetToListTrigger > 0) {
      setIsViewingDetails(false);
    }
  }, [resetToListTrigger]);

  const activeCompetition = competitions.find(c => c.id === activeCompetitionId);

  const handleCreateCompetition = (
    name: string,
    options?: CreateCompetitionOptions,
    openDetailsImmediately: boolean = false
  ) => {
    const sourceComp = options?.sourceCompetitionId
      ? competitions.find(c => c.id === options.sourceCompetitionId)
      : undefined;

    const baseTime = Date.now();

    const compErrorCategories: CompetitionErrorCategory[] = sourceComp
      ? resolveCompetitionErrorCategories(sourceComp).map(c => ({ ...c }))
      : DEFAULT_ERROR_CATEGORIES.map(c => ({ ...c }));

    const compErrors: CompetitionErrorType[] = sourceComp
      ? resolveCompetitionErrors(sourceComp).map(e => ({ ...e }))
      : DEFAULT_COMPETITION_ERRORS.map(e => ({ ...e }));

    const defaultLevels: CompetitionLevel[] = [
      {
        id: 1,
        name: 'المستوى الأول (خمسة أجزاء)',
        juzsOrSurahs: 'الأجزاء: من 1 إلى 5',
        segmentsCount: 5,
        linesPerSegment: 7,
        maxScore: 100,
        errorCategories: compErrorCategories.map(c => ({ ...c })),
        errors: compErrors.map(e => ({ ...e })),
      },
    ];

    const clonedLevels =
      sourceComp && (sourceComp.levels || []).length > 0
        ? deepCloneLevels(sourceComp.levels).map(lvl => ({
            ...lvl,
            errorCategories: compErrorCategories.map(c => ({ ...c })),
            errors: compErrors.map(e => ({ ...e })),
          }))
        : defaultLevels;

    const clonedEvaluators: CompetitionEvaluator[] =
      sourceComp && options?.copyEvaluators
        ? (sourceComp.evaluators || []).map((ev, idx) => ({
            ...ev,
            id: baseTime + idx + 1,
            levelIds: [...(ev.levelIds || [])],
          }))
        : [];

    const clonedParticipants: CompetitionParticipant[] =
      sourceComp && options?.copyParticipants
        ? (sourceComp.participants || []).map((p, idx) => ({
            ...p,
            id: baseTime + 1000 + idx,
          }))
        : [];

    const newComp: Competition = {
      id: baseTime.toString(),
      name,
      seasonText: sourceComp?.seasonText || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م',
      isActive: true,
      passageMode: sourceComp?.passageMode || 'random',
      previewLinesPerSegment: sourceComp?.previewLinesPerSegment,
      manualPassages: sourceComp?.manualPassages
        ? sourceComp.manualPassages.map((mp, idx) => ({
            ...mp,
            id: `mp-${mp.juzNumber}-${idx}-${baseTime}`,
          }))
        : [],
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: clonedLevels,
      evaluators: clonedEvaluators,
      participants: clonedParticipants,
      evaluations: [],
    };

    // وضع أحدث مسابقة في أعلى القائمة
    updateCompetitions([newComp, ...competitions]);
    setActiveCompetitionId(newComp.id);
    setActiveTab('settings');

    if (openDetailsImmediately) {
      setIsViewingDetails(true);
    }

    if (sourceComp) {
      showToast(
        `تم نسخ إعدادات ومستويات "${sourceComp.name}" إلى "${name}" بنجاح!`,
        'success'
      );
    } else {
      showToast('تمت إضافة المسابقة الجديدة أعلى القائمة بنجاح! انقر عليها لتعديل تفاصيلها.', 'success');
    }
  };

  const handleUpdateActiveComp = (updatedComp: Competition) => {
    updateCompetitions(
      competitions.map(c => (c.id === updatedComp.id ? updatedComp : c))
    );
  };

  const handleToggleCompetitionActive = (compId: string, targetState?: boolean) => {
    const targetComp = competitions.find(c => c.id === compId);
    if (!targetComp) return;
    const nextActive = targetState !== undefined ? targetState : !targetComp.isActive;
    updateCompetitions(
      competitions.map(c =>
        c.id === compId ? { ...c, isActive: nextActive } : c
      )
    );
    showToast(
      nextActive
        ? `تم تفعيل المسابقة "${targetComp.name}"! يمكن للمقيمين الآن تسجيل الدخول والاطلاع على أسماء المشاركين.`
        : `تم إيقاف تفعيل المسابقة "${targetComp.name}". لن يتمكن المقيمون من الدخول أو رؤية أسماء المشاركين.`,
      nextActive ? 'success' : 'info'
    );
  };

  if (!isViewingDetails || !activeCompetition) {
    return (
      <CompetitionGeneralSettings
        competitions={competitions}
        onCreate={handleCreateCompetition}
        onSelect={id => {
          setActiveCompetitionId(id);
          setIsViewingDetails(true);
        }}
        onToggleActive={id => handleToggleCompetitionActive(id)}
        onDelete={id => {
          updateCompetitions(competitions.filter(c => c.id !== id));
          if (activeCompetitionId === id) {
            setActiveCompetitionId(null);
            setIsViewingDetails(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-3.5 sm:p-6 min-h-[560px] text-slate-800 dark:text-slate-100 border border-emerald-100/80 dark:border-slate-800"
      dir="rtl"
    >
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-4 sm:mb-6 gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Award size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400">
                المسابقة المفتوحة للتعديل والإدارة:
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeCompetition.isActive
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800'
                }`}
              >
                {activeCompetition.isActive
                  ? '● مفعّلة للمقيمين'
                  : '○ غير مفعّلة (محجوبة عن المقيمين)'}
              </span>
            </div>
            <h2 className="text-base sm:text-2xl font-black text-emerald-950 dark:text-emerald-300 truncate mt-0.5">
              {activeCompetition.name}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportCompetitionSetupExcel(activeCompetition, showToast)}
            className="flex-1 sm:flex-initial min-h-[42px] text-xs font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 transition active:scale-95 cursor-pointer"
            title="تصدير كافة بيانات إعداد المسابقة وتوزيع المقيمين بصيغة إكسل"
          >
            <FileSpreadsheet size={15} />
            <span>تصدير الإعدادات Excel</span>
          </button>

          <button
            type="button"
            onClick={() => exportCompetitionSetupPDF(activeCompetition, showToast)}
            className="flex-1 sm:flex-initial min-h-[42px] text-xs font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 transition active:scale-95 cursor-pointer"
            title="تصدير وطباعة بيانات إعداد المسابقة وتوزيع المقيمين بصيغة PDF"
          >
            <Printer size={15} />
            <span>تصدير الإعدادات PDF</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleCompetitionActive(activeCompetition.id)}
            className={`flex-1 sm:flex-initial min-h-[42px] text-xs sm:text-sm font-black py-2 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer border ${
              activeCompetition.isActive
                ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 shadow-xs'
            }`}
          >
            <Check size={16} />
            <span>
              {activeCompetition.isActive
                ? 'إيقاف تفعيل المسابقة'
                : 'تفعيل المسابقة للمقيمين'}
            </span>
          </button>

          <button
            onClick={() => setIsViewingDetails(false)}
            className="flex-1 sm:flex-initial min-h-[42px] text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <span>العودة لقائمة المسابقات</span>
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </div>
      </div>

      {/* أزرار التنقل بين صفحات المشرف داخل المسابقة — مصممة لشاشة الهاتف مع إظهار اسم كل زر بوضوح */}
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 mb-5 sm:mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
        <TabButton
          active={activeTab === 'general'}
          onClick={() => setActiveTab('general')}
          icon={<Sliders size={17} />}
          label="إعدادات عامة"
        />
        <TabButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<Settings size={17} />}
          label={`المستويات (${(activeCompetition.levels || []).length})`}
        />
        {onOpenPassagesPage && (
          <TabButton
            active={false}
            onClick={onOpenPassagesPage}
            icon={<BookOpen size={17} />}
            label="المقاطع المقترحة"
          />
        )}
        <TabButton
          active={activeTab === 'evaluators'}
          onClick={() => setActiveTab('evaluators')}
          icon={<UserCheck size={17} />}
          label={`المقيمين (${(activeCompetition.evaluators || []).length})`}
        />
        <TabButton
          active={activeTab === 'participants'}
          onClick={() => setActiveTab('participants')}
          icon={<Users size={17} />}
          label={`المشاركين (${(activeCompetition.participants || []).length})`}
        />
        <div className={!onOpenPassagesPage ? 'col-span-2 sm:col-span-1' : ''}>
          <TabButton
            active={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
            icon={<FileText size={17} />}
            label="التقارير والنتائج"
            fullWidthMobile={!onOpenPassagesPage}
          />
        </div>
      </div>

      {/* Content */}
      <div className="mt-2 sm:mt-4">
        {activeTab === 'general' && (
          <CompetitionSettings
            comp={activeCompetition}
            onUpdate={handleUpdateActiveComp}
            onOpenPassagesPage={onOpenPassagesPage}
            onCloneCompetition={(newName, opts) =>
              handleCreateCompetition(
                newName,
                {
                  sourceCompetitionId: activeCompetition.id,
                  ...opts,
                },
                true
              )
            }
          />
        )}
        {activeTab === 'settings' && (
          <LevelEditor
            comp={activeCompetition}
            allCompetitions={competitions}
            onUpdate={handleUpdateActiveComp}
          />
        )}
        {activeTab === 'evaluators' && (
          <CompetitionEvaluators
            comp={activeCompetition}
            onUpdate={handleUpdateActiveComp}
            onOpenEvaluatorsPage={onOpenEvaluatorsPage}
          />
        )}
        {activeTab === 'participants' && (
          <CompetitionParticipants
            comp={activeCompetition}
            onUpdate={handleUpdateActiveComp}
          />
        )}
        {activeTab === 'reports' && (
          <CompetitionReports
            comp={activeCompetition}
            onUpdate={handleUpdateActiveComp}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  fullWidthMobile,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  fullWidthMobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        fullWidthMobile ? 'w-full' : 'w-full sm:w-auto'
      } min-h-[54px] sm:min-h-[46px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-sm transition-all active:scale-95 cursor-pointer text-center leading-tight ${
        active
          ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="block whitespace-normal sm:whitespace-nowrap">{label}</span>
    </button>
  );
}

function CompetitionGeneralSettings({
  competitions,
  onCreate,
  onSelect,
  onToggleActive,
  onDelete,
}: {
  competitions: Competition[];
  onCreate: (
    n: string,
    options?: CreateCompetitionOptions,
    openDetailsImmediately?: boolean
  ) => void;
  onSelect: (id: string) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showAddForm, setShowAddForm] = useState<boolean>(competitions.length === 0);
  const [newName, setNewName] = useState('');
  const [sourceCompetitionId, setSourceCompetitionId] = useState<string>('');
  const [copyEvaluators, setCopyEvaluators] = useState<boolean>(true);
  const [copyParticipants, setCopyParticipants] = useState<boolean>(false);

  // حالة النسخ السريع المباشر من بطاقة أي مسابقة مسجلة
  const [cloningCompId, setCloningCompId] = useState<string | null>(null);
  const [cloneNewName, setCloneNewName] = useState<string>('');
  const [cloneCopyEvaluators, setCloneCopyEvaluators] = useState<boolean>(true);
  const [cloneCopyParticipants, setCloneCopyParticipants] = useState<boolean>(false);
  const [deleteTargetComp, setDeleteTargetComp] = useState<Competition | null>(null);

  const selectedSourceComp = competitions.find(c => c.id === sourceCompetitionId);

  // ترتيب المسابقات بحيث تظهر أحدث مسابقة في الأعلى دائماً
  const sortedCompetitions = React.useMemo(() => {
    return [...competitions].sort((a, b) => {
      const numA = Number(a.id) || 0;
      const numB = Number(b.id) || 0;
      if (numB !== numA) return numB - numA;
      return competitions.indexOf(b) - competitions.indexOf(a);
    });
  }, [competitions]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-4 sm:p-6 max-w-3xl mx-auto mt-2 sm:mt-4 text-slate-800 dark:text-slate-100 border border-emerald-100 dark:border-slate-800 space-y-5"
      dir="rtl"
    >
      {/* الرأس وزر إضافة مسابقة جديدة أعلى القائمة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-black flex items-center gap-2 text-emerald-950 dark:text-emerald-300">
            <Award className="text-emerald-600 shrink-0" />
            <span>المسابقات القرآنية المسجلة ({competitions.length})</span>
          </h2>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            تظهر أحدث مسابقة في الأعلى — انقر على أي مسابقة أو على قلم التعديل لفتح تفاصيلها والتعديل عليها
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(prev => !prev)}
          className={`min-h-[48px] px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer shrink-0 ${
            showAddForm
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
          }`}
        >
          <Plus size={19} className={showAddForm ? 'rotate-45 transition-transform' : 'transition-transform'} />
          <span>{showAddForm ? 'إغلاق نموذج الإضافة' : 'إضافة مسابقة جديدة'}</span>
        </button>
      </div>

      {/* نموذج إضافة مسابقة جديدة يظهر أعلى القائمة عند النقر على زر "إضافة مسابقة جديدة" */}
      {showAddForm && (
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/70 dark:bg-slate-800/70 border-2 border-emerald-300 dark:border-emerald-800/70 space-y-3.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <label className="block text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
              إضافة مسابقة قرآنية جديدة
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="مثال: المسابقة الرمضانية لحفظ القرآن الكريم..."
              className="flex-1 min-h-[48px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl focus:ring-2 focus:ring-emerald-600 bg-white dark:bg-slate-900 font-bold text-sm sm:text-base"
            />
            <button
              type="button"
              onClick={() => {
                if (newName.trim()) {
                  onCreate(
                    newName.trim(),
                    {
                      sourceCompetitionId: sourceCompetitionId || undefined,
                      copyEvaluators,
                      copyParticipants,
                    },
                    false
                  );
                  setNewName('');
                  setSourceCompetitionId('');
                  setShowAddForm(false);
                }
              }}
              className="w-full sm:w-auto min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
            >
              <Plus size={20} />
              <span>
                {sourceCompetitionId ? 'إضافة بنسخ الإعدادات' : 'إضافة المسابقة'}
              </span>
            </button>
          </div>

          {/* خيار نسخ الإعدادات والمستويات من مسابقة سابقة عند الإنشاء */}
          {competitions.length > 0 && (
            <div className="pt-2 border-t border-emerald-200/60 dark:border-slate-700 space-y-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Copy size={14} className="text-emerald-700 dark:text-emerald-400" />
                  <span>نسخ إعدادات ومستويات مسابقة سابقة (اختياري):</span>
                </label>
                <select
                  value={sourceCompetitionId}
                  onChange={e => setSourceCompetitionId(e.target.value)}
                  className="w-full min-h-[44px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs sm:text-sm"
                >
                  <option value="">
                    -- بدون نسخ (إنشاء مسابقة بإعدادات افتراضية جديدة) --
                  </option>
                  {sortedCompetitions.map(c => (
                    <option key={c.id} value={c.id}>
                      نسخ من: {c.name} ({(c.levels || []).length} مستويات)
                    </option>
                  ))}
                </select>
              </div>

              {selectedSourceComp && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 space-y-2">
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    سيتم نسخ جميع المستويات ({(selectedSourceComp.levels || []).length}{' '}
                    مستويات) بنطاقاتها ودرجاتها وبنود الخصم لتتمكن من التعديل عليها في المسابقة الجديدة.
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={copyEvaluators}
                        onChange={e => setCopyEvaluators(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span>
                        نسخ المقيمين أيضاً ({(selectedSourceComp.evaluators || []).length})
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={copyParticipants}
                        onChange={e => setCopyParticipants(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span>
                        نسخ المتسابقين أيضاً ({(selectedSourceComp.participants || []).length})
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* قائمة المسابقات المسجلة (الأحدث في الأعلى) */}
      {sortedCompetitions.length > 0 ? (
        <div className="space-y-3">
          {sortedCompetitions.map((comp, idx) => {
            const isCloningThis = cloningCompId === comp.id;
            const isNewest = idx === 0;
            return (
              <div
                key={comp.id}
                onClick={() => onSelect(comp.id)}
                className="group p-4 sm:p-5 border-2 border-slate-200 hover:border-emerald-500 dark:border-slate-700 dark:hover:border-emerald-500 rounded-2xl bg-slate-50/70 hover:bg-emerald-50/30 dark:bg-slate-800/60 dark:hover:bg-slate-800 transition-all cursor-pointer space-y-3 shadow-2xs hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-base sm:text-lg text-emerald-950 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                        {comp.name}
                      </span>
                      {isNewest && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          الأحدث
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                          comp.isActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800'
                        }`}
                      >
                        {comp.isActive
                          ? '● مفعّلة للمقيمين'
                          : '○ غير مفعّلة (محجوبة عن المقيمين)'}
                      </span>
                    </div>
                    {comp.seasonText && (
                      <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-1">
                        {comp.seasonText}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <span>المستويات: {(comp.levels || []).length}</span>
                      <span>•</span>
                      <span>المقيمين: {(comp.evaluators || []).length}</span>
                      <span>•</span>
                      <span>المشاركين: {(comp.participants || []).length}</span>
                    </div>
                  </div>

                  {/* أزرار الإجراءات: قلم التعديل + زر الحذف + التفعيل + النسخ */}
                  <div
                    className="flex flex-wrap items-center gap-2 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* قلم التعديل لفتح تفاصيل المسابقة والتعديل عليها */}
                    <button
                      type="button"
                      onClick={() => onSelect(comp.id)}
                      className="flex-1 sm:flex-initial min-h-[44px] bg-emerald-700 text-white hover:bg-emerald-800 px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      title="فتح وتعديل تفاصيل المسابقة"
                    >
                      <Edit size={16} />
                      <span>تعديل</span>
                    </button>

                    {/* زر التفعيل / الإيقاف */}
                    <button
                      type="button"
                      onClick={() => onToggleActive(comp.id)}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl font-extrabold text-xs transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer border ${
                        comp.isActive
                          ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                      }`}
                      title={
                        comp.isActive
                          ? 'إيقاف تفعيل المسابقة'
                          : 'تفعيل المسابقة'
                      }
                    >
                      <Check size={15} />
                      <span>{comp.isActive ? 'إيقاف' : 'تفعيل'}</span>
                    </button>

                    {/* زر نسخ لمسابقة جديدة */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isCloningThis) {
                          setCloningCompId(null);
                        } else {
                          setCloningCompId(comp.id);
                          setCloneNewName(`${comp.name} (نسخة جديدة)`);
                          setCloneCopyEvaluators(true);
                          setCloneCopyParticipants(false);
                        }
                      }}
                      className={`min-h-[44px] px-3 py-2.5 rounded-xl font-extrabold text-xs transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer border ${
                        isCloningThis
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/60'
                      }`}
                      title="نسخ إعدادات هذه المسابقة لمسابقة جديدة"
                    >
                      <Copy size={15} />
                      <span>نسخ</span>
                    </button>

                    {/* زر الحذف */}
                    <button
                      type="button"
                      onClick={() => setDeleteTargetComp(comp)}
                      className="min-h-[44px] px-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/50 py-2.5 rounded-xl transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer font-extrabold text-xs"
                      title="حذف المسابقة"
                    >
                      <Trash2 size={17} />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>

                {/* نافذة النسخ السريع المضمنة لنسخ المسابقة بجميع مستوياتها والتعديل عليها */}
                {isCloningThis && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-slate-900 border border-amber-300 dark:border-amber-800/70 space-y-3"
                  >
                    <div className="text-xs font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                      <Copy size={15} />
                      <span>
                        نسخ إعدادات ومستويات "{comp.name}" ({(comp.levels || []).length}{' '}
                        مستويات) إلى مسابقة جديدة:
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={cloneNewName}
                        onChange={e => setCloneNewName(e.target.value)}
                        placeholder="اسم المسابقة الجديدة..."
                        className="flex-1 min-h-[44px] border border-amber-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!cloneNewName.trim()) return;
                          onCreate(
                            cloneNewName.trim(),
                            {
                              sourceCompetitionId: comp.id,
                              copyEvaluators: cloneCopyEvaluators,
                              copyParticipants: cloneCopyParticipants,
                            },
                            true
                          );
                          setCloningCompId(null);
                        }}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                      >
                        <Check size={16} />
                        <span>إنشاء النسخة والانتقال للتعديل</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cloneCopyEvaluators}
                          onChange={e => setCloneCopyEvaluators(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>
                          نسخ المقيمين أيضاً ({(comp.evaluators || []).length})
                        </span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cloneCopyParticipants}
                          onChange={e => setCloneCopyParticipants(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>
                          نسخ المتسابقين أيضاً ({(comp.participants || []).length})
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm">
          لا توجد مسابقات مسجلة حالياً. اضغط على زر "إضافة مسابقة جديدة" بالأعلى لإضافة أول مسابقة.
        </div>
      )}

      {/* نافذة التأكيد المميزة لحذف المسابقة */}
      <ConfirmDeleteModal
        isOpen={!!deleteTargetComp}
        title="تأكيد حذف المسابقة نهائياً"
        message="هل أنت متأكد من حذف هذه المسابقة؟ سيتم حذف جميع المستويات وبنود الخصومات والمقيمين والمشاركين وكافة التقييمات المرتبطة بها."
        itemTitle={deleteTargetComp?.name}
        confirmLabel="نعم، حذف المسابقة"
        cancelLabel="إلغاء التراجع"
        onConfirm={() => {
          if (deleteTargetComp) {
            onDelete(deleteTargetComp.id);
            setDeleteTargetComp(null);
          }
        }}
        onClose={() => setDeleteTargetComp(null)}
      />
    </div>
  );
}

function CompetitionSettings({
  comp,
  onUpdate,
  onOpenPassagesPage,
  onCloneCompetition,
}: {
  comp: Competition;
  onUpdate: (c: Competition) => void;
  onOpenPassagesPage?: () => void;
  onCloneCompetition: (
    newName: string,
    options: { copyEvaluators?: boolean; copyParticipants?: boolean }
  ) => void;
}) {
  const [name, setName] = useState(comp.name);
  const [seasonText, setSeasonText] = useState(comp.seasonText || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م');
  const [cloneName, setCloneName] = useState(`${comp.name} (نسخة جديدة)`);
  const [copyEvaluators, setCopyEvaluators] = useState(true);
  const [copyParticipants, setCopyParticipants] = useState(false);
  const context = useContext(AppContext);

  const handleSave = () => {
    if (!name.trim()) return;
    onUpdate({ ...comp, name: name.trim(), seasonText: seasonText.trim() });
    context?.showToast('تم حفظ الإعدادات العامة ونص الموسم!', 'success');
  };

  const handleCloneNow = () => {
    if (!cloneName.trim()) {
      context?.showToast('يرجى كتابة اسم للمسابقة الجديدة', 'error');
      return;
    }
    onCloneCompetition(cloneName.trim(), {
      copyEvaluators,
      copyParticipants,
    });
  };

  const currentPassageMode = comp.passageMode || 'random';

  return (
    <div className="max-w-4xl space-y-6">
      {/* بطاقة تصدير ومراجعة بيانات إعداد المسابقة وتقسيم المقيمين على المستويات */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-br from-emerald-50/90 via-white to-amber-50/40 dark:from-slate-800/90 dark:via-slate-900 dark:to-slate-800/80 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/80 dark:border-slate-700 pb-3.5">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-black text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
              <Printer size={19} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>مراجعة وتصدير بيانات إعداد المسابقة وتقسيم المقيمين على المستويات</span>
            </h3>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
              تصدير شامل ومنسق لإعدادات المسابقة، المستويات، توزيع المقيمين ولجان التحكيم، بنود الخصم، وكشف المتسابقين بصيغتي Excel و PDF للطباعة أو المراجعة والاحتفاظ بها.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportCompetitionSetupExcel(comp, context?.showToast)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer"
            >
              <FileSpreadsheet size={17} />
              <span>تصدير إعداد المسابقة (Excel)</span>
            </button>
            <button
              type="button"
              onClick={() => exportCompetitionSetupPDF(comp, context?.showToast)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer"
            >
              <Printer size={17} />
              <span>تصدير / طباعة الإعدادات (PDF)</span>
            </button>
          </div>
        </div>

        {/* ملخص مراجعة تقسيم المقيمين حسب المستويات للمشرف */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <UserCheck size={16} className="text-emerald-700 dark:text-emerald-400" />
              <span>بيانات المقيمين وتوزيعهم على المستويات ({(comp.evaluators || []).length} مقيم)</span>
            </h4>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              يظهر لكل مقيم المستويات المسندة إليه بالتفصيل
            </span>
          </div>

          {(comp.evaluators || []).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(comp.evaluators || []).map((ev, idx) => {
                const info = getEvaluatorAssignedLevelsInfo(
                  ev,
                  comp.levels || [],
                  comp.participants || []
                );
                return (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-slate-700 flex flex-col justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-black flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {ev.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 font-mono text-[11px] font-black border border-amber-200 dark:border-amber-800">
                          الرمز: {ev.pin}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold">
                          {info.participantsCount} متسابق
                        </span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        المستويات المسندة للمقيم ({info.assignedLevels.length} من {(comp.levels || []).length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {info.assignedLevels.length > 0 ? (
                          info.assignedLevels.map(lvl => (
                            <span
                              key={lvl.id}
                              className="px-2 py-0.5 rounded-lg bg-emerald-100/90 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 text-[11px] font-black border border-emerald-300/60 dark:border-emerald-800"
                            >
                              {lvl.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs font-bold text-slate-400">
                            لا توجد مستويات مضافة بعد
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs font-bold text-slate-500">
              لم يتم اختيار مقيمين لهذه المسابقة بعد. يمكنك إسنادهم وتحديد مستويات كل مقيم من تبويب "المقيمين".
            </div>
          )}
        </div>
      </div>

      <div className="max-w-xl space-y-6">
      {/* خيار تفعيل المسابقة أو عدم التفعيل للمقيمين والمعلمين */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border-2 space-y-3.5 transition ${
          comp.isActive
            ? 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck
                size={19}
                className={comp.isActive ? 'text-emerald-600' : 'text-red-600'}
              />
              <span>حالة تفعيل المسابقة للمقيمين والمعلمين</span>
            </h3>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
              إذا لم يتم تفعيل المسابقة: لن يتمكن المقيمون من تسجيل الدخول للتطبيق، ولن تظهر أسماء المشاركين للمعلمين/المقيمين حتى يتم تفعيلها.
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${
              comp.isActive
                ? 'bg-emerald-700 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {comp.isActive ? 'مفعّلة حالياً ✓' : 'غير مفعّلة ✕'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              if (!comp.isActive) {
                onUpdate({ ...comp, isActive: true });
                context?.showToast(
                  'تم تفعيل المسابقة! يمكن للمقيمين الآن تسجيل الدخول والاطلاع على أسماء المشاركين.',
                  'success'
                );
              }
            }}
            className={`min-h-[46px] px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border-2 ${
              comp.isActive
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
            }`}
          >
            <Check size={17} />
            <span>تفعيل المسابقة (إتاحة الدخول والأسماء)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (comp.isActive) {
                onUpdate({ ...comp, isActive: false });
                context?.showToast(
                  'تم إيقاف تفعيل المسابقة. لن يتمكن المقيمون من الدخول أو رؤية أسماء المشاركين.',
                  'info'
                );
              }
            }}
            className={`min-h-[46px] px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer border-2 ${
              !comp.isActive
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-400'
            }`}
          >
            <AlertTriangle size={17} />
            <span>عدم التفعيل (حجب الدخول والأسماء)</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 space-y-4">
        <div>
          <label className="block text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 mb-2">
            اسم المسابقة القرآنية الحالية
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full min-h-[48px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-600 font-bold text-sm sm:text-base"
          />
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300 mb-2">
            نص الموسم (يتم طباعته أعلى التقارير الرسمية تحت الديباجة)
          </label>
          <input
            type="text"
            value={seasonText}
            onChange={e => setSeasonText(e.target.value)}
            placeholder="مثال: الموسم الثالث عشر - لعام 1447 هـ / 2026 م"
            className="w-full min-h-[48px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-600 font-bold text-sm sm:text-base"
          />
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1 block">
            هذا النص يظهر أسفل الديباجة الرسمية في كافة التقارير الشاملة والشهادات والرسوم البيانية عند التصدير للـ PDF
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full sm:w-auto min-h-[48px] bg-emerald-700 text-white px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-emerald-800 transition active:scale-95 shadow-md cursor-pointer"
        >
          <Save size={18} />
          <span>حفظ التعديلات</span>
        </button>
      </div>

      {/* قسم اختيار تصنيف المقاطع المقترحة التي تظهر عند التقييم لهذه المسابقة */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-slate-800/60 space-y-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-emerald-950 dark:text-emerald-300">
              تصنيف المقاطع المقترحة المعتمدة للتقييم في هذه المسابقة
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              اختر التبويب المعتمد لتوليد المقاطع التي تظهر للمقيمين أثناء التقييم، أو افتح صفحة المقاطع المقترحة لاستعراض الأجزاء وتخصيص النطاقات اليدوية.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {[
            {
              id: 'random' as const,
              title: '١. المقاطع العشوائية الحالية (الافتراضي)',
              desc: 'توزيع عشوائي متوازن لكل جزء وفق عدد الأسطر الفعلية المحددة.',
            },
            {
              id: 'international' as const,
              title: '٢. تصنيف المسابقات العالمية (الأكثر صعوبة / متوسطة / الأقل)',
              desc: 'تتناوب المقاطع تلقائياً من الفئات الثلاث في كل تقييم لضمان التنوع والعدالة.',
            },
            {
              id: 'manual' as const,
              title: `٣. التحديد اليدوي للمشرف (${(comp.manualPassages || []).length} نطاق مضاف)`,
              desc: 'تظهر المقاطع بالتناوب من النطاقات اليدوية التي يحددها المشرف لكل جزء.',
            },
          ].map(opt => {
            const isSelected = currentPassageMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdate({ ...comp, passageMode: opt.id });
                  context?.showToast(`تم اعتماد "${opt.title}" للتقييم في المسابقة!`, 'success');
                }}
                className={`w-full text-right p-3 rounded-xl border-2 transition flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'border-emerald-700 bg-white dark:bg-slate-900 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/50 hover:border-emerald-300'
                }`}
              >
                <div>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block">
                    {opt.title}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
                    {opt.desc}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 ${
                    isSelected
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isSelected ? 'معتمد ✓' : 'اختيار'}
                </span>
              </button>
            );
          })}
        </div>

        {onOpenPassagesPage && (
          <button
            type="button"
            onClick={onOpenPassagesPage}
            className="w-full min-h-[46px] bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer"
          >
            <BookOpen size={17} />
            <span>فتح صفحة إدارة المقاطع المقترحة (التبويبات الثلاثة)</span>
          </button>
        )}
      </div>

      {/* قسم نسخ إعدادات هذه المسابقة بجميع مستوياتها لمسابقة جديدة */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-slate-800/70 space-y-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
            <Copy size={18} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-amber-950 dark:text-amber-300">
              نسخ إعدادات هذه المسابقة بجميع مستوياتها لمسابقة جديدة
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              ينشئ مسابقة جديدة تحتوي على نسخة كاملة من المستويات ({(comp.levels || []).length}{' '}
              مستويات) مع الأجزاء والمقاطع وبنود الخصم، وينقلك إليها مباشرة للتعديل عليها.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            اسم المسابقة الجديدة
          </label>
          <input
            type="text"
            value={cloneName}
            onChange={e => setCloneName(e.target.value)}
            placeholder="أدخل اسم المسابقة الجديدة..."
            className="w-full min-h-[46px] border border-amber-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={copyEvaluators}
              onChange={e => setCopyEvaluators(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <span>نسخ المقيمين أيضاً ({(comp.evaluators || []).length})</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={copyParticipants}
              onChange={e => setCopyParticipants(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <span>نسخ المتسابقين أيضاً ({(comp.participants || []).length})</span>
          </label>
        </div>

        <button
          type="button"
          onClick={handleCloneNow}
          className="w-full sm:w-auto min-h-[48px] bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
        >
          <Copy size={18} />
          <span>نسخ لمسابقة جديدة والانتقال لتعديلها</span>
        </button>
      </div>
      </div>
    </div>
  );
}

function LevelEditor({
  comp,
  allCompetitions,
  onUpdate,
}: {
  comp: Competition;
  allCompetitions: Competition[];
  onUpdate: (c: Competition) => void;
}) {
  const [levels, setLevels] = useState<CompetitionLevel[]>(comp.levels || []);
  // إعدادات أزرار الخصم وأصنافها خاصة بالمسابقة كلها لجميع مستوياتها
  const [compErrorCategories, setCompErrorCategories] = useState<CompetitionErrorCategory[]>(() =>
    resolveCompetitionErrorCategories(comp)
  );
  const [compErrors, setCompErrors] = useState<CompetitionErrorType[]>(() =>
    resolveCompetitionErrors(comp)
  );
  // نص الأسماء المتعددة الأسطر لكل مستوى على حدة
  const [bulkNamesByLevel, setBulkNamesByLevel] = useState<Record<number, string>>({});
  const [targetImportLevelId, setTargetImportLevelId] = useState<number | null>(null);
  const [importFromCompId, setImportFromCompId] = useState<string>('');
  const [deleteConfirmLevel, setDeleteConfirmLevel] = useState<CompetitionLevel | null>(null);
  const [deleteConfirmError, setDeleteConfirmError] = useState<CompetitionErrorType | null>(null);
  const [deleteConfirmLevelParticipant, setDeleteConfirmLevelParticipant] = useState<{ id: number; name: string } | null>(null);
  const [editingLevelParticipant, setEditingLevelParticipant] = useState<CompetitionParticipant | null>(null);
  const [editingDeductions, setEditingDeductions] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryColor, setNewCategoryColor] = useState<ErrorCategoryColorKey>('amber');
  const excelInputRef = useRef<HTMLInputElement>(null);
  const context = useContext(AppContext);

  const otherCompetitions = (allCompetitions || []).filter(c => c.id !== comp.id);

  // تحديث المستويات وإعدادات أزرار الخصم عند تبديل المسابقة النشطة
  React.useEffect(() => {
    setLevels(comp.levels || []);
    setCompErrorCategories(resolveCompetitionErrorCategories(comp));
    setCompErrors(resolveCompetitionErrors(comp));
    setEditingDeductions({});
  }, [comp.id]);

  // مزامنة إعدادات أزرار الخصم الموحدة للمسابقة مع جميع مستوياتها
  const buildSyncedLevels = (
    targetLevels: CompetitionLevel[],
    targetErrors: CompetitionErrorType[],
    targetCategories: CompetitionErrorCategory[]
  ): CompetitionLevel[] => {
    return targetLevels.map(lvl => ({
      ...lvl,
      errors: targetErrors.map(e => ({ ...e })),
      errorCategories: targetCategories.map(c => ({ ...c })),
    }));
  };

  const updateCompetitionErrorsAndCategories = (
    nextErrors: CompetitionErrorType[],
    nextCategories: CompetitionErrorCategory[]
  ) => {
    setCompErrors(nextErrors);
    setCompErrorCategories(nextCategories);
    const syncedLevels = buildSyncedLevels(levels, nextErrors, nextCategories);
    setLevels(syncedLevels);
  };

  const handleSave = () => {
    const syncedLevels = buildSyncedLevels(levels, compErrors, compErrorCategories).map(lvl => ({
      ...lvl,
      juzsOrSurahs: lvl.juzsOrSurahs.startsWith('الأجزاء:')
        ? formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)
        : lvl.juzsOrSurahs,
    }));
    const syncedParticipants = (comp.participants || []).map(p => {
      const matchedLvl = syncedLevels.find(l => Number(l.id) === Number(p.levelId));
      if (!matchedLvl) return p;
      const lvlUnspecified = Boolean(matchedLvl.isUnspecifiedJuzs) || isUnspecifiedJuzCount(matchedLvl.juzsOrSurahs);
      if (lvlUnspecified && p.juzsOrSurahs && p.juzsOrSurahs.startsWith('الأجزاء:')) {
        const pJuzs = parseJuzsToNumbers(p.juzsOrSurahs.replace('الأجزاء:', ''));
        if (!matchedLvl.juzCount || pJuzs.length === matchedLvl.juzCount) {
          return p;
        }
      }
      return { ...p, juzsOrSurahs: matchedLvl.juzsOrSurahs };
    });
    setLevels(syncedLevels);
    onUpdate({
      ...comp,
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: syncedLevels,
      participants: syncedParticipants,
    });
    context?.showToast('تم حفظ إعدادات المستويات وأزرار الخصم للمسابقة بنجاح!', 'success');
  };

  const handleCancel = () => {
    setLevels(comp.levels || []);
    setCompErrorCategories(resolveCompetitionErrorCategories(comp));
    setCompErrors(resolveCompetitionErrors(comp));
    setEditingDeductions({});
    context?.showToast('تم إلغاء التعديلات غير المحفوظة', 'info');
  };

  // نسخ/استيراد المستويات من مسابقة سابقة إلى هذه المسابقة
  const handleCopyLevelsFromCompetition = (mode: 'replace' | 'append') => {
    const sourceComp = otherCompetitions.find(c => c.id === importFromCompId);
    if (!sourceComp || !(sourceComp.levels || []).length) {
      context?.showToast('يرجى اختيار مسابقة سابقة تحتوي على مستويات أولاً', 'error');
      return;
    }

    const cloned = deepCloneLevels(sourceComp.levels);
    const nextCategories =
      mode === 'replace'
        ? resolveCompetitionErrorCategories(sourceComp)
        : compErrorCategories;
    const nextErrors =
      mode === 'replace' ? resolveCompetitionErrors(sourceComp) : compErrors;

    let nextLevels: CompetitionLevel[];

    if (mode === 'replace') {
      nextLevels = buildSyncedLevels(
        cloned.map((lvl, idx) => ({
          ...lvl,
          id: idx + 1,
        })),
        nextErrors,
        nextCategories
      );
      setCompErrorCategories(nextCategories);
      setCompErrors(nextErrors);
    } else {
      const maxExistingId =
        levels.length > 0 ? Math.max(...levels.map(l => l.id)) : 0;
      nextLevels = buildSyncedLevels(
        [
          ...levels,
          ...cloned.map((lvl, idx) => ({
            ...lvl,
            id: maxExistingId + idx + 1,
          })),
        ],
        nextErrors,
        nextCategories
      );
    }

    setLevels(nextLevels);
    onUpdate({
      ...comp,
      errors: nextErrors,
      errorCategories: nextCategories,
      levels: nextLevels,
    });
    context?.showToast(
      mode === 'replace'
        ? `تم نسخ واستبدال المستويات (${cloned.length}) من "${sourceComp.name}" بنجاح! يمكنك التعديل عليها الآن.`
        : `تمت إضافة ${cloned.length} مستويات من "${sourceComp.name}" بنجاح!`,
      'success'
    );
  };

  // تكرار مستوى واحد داخل نفس المسابقة للتعديل السريع عليه
  const duplicateSingleLevel = (levelToCopy: CompetitionLevel) => {
    const newId =
      levels.length > 0 ? Math.max(...levels.map(l => l.id)) + 1 : 1;
    const duplicated: CompetitionLevel = {
      ...levelToCopy,
      id: newId,
      name: `${levelToCopy.name} (نسخة)`,
      errorCategories: compErrorCategories.map(c => ({ ...c })),
      errors: compErrors.map(e => ({ ...e })),
    };
    const nextLevels = [...levels, duplicated];
    setLevels(nextLevels);
    onUpdate({
      ...comp,
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: nextLevels,
    });
    context?.showToast(`تم نسخ "${levelToCopy.name}" للمستوى الجديد`, 'success');
  };

  const addLevel = () => {
    const newId =
      levels.length > 0 ? Math.max(...levels.map(l => l.id)) + 1 : 1;
    const nextLevels: CompetitionLevel[] = [
      ...levels,
      {
        id: newId,
        name: `المستوى ${newId}`,
        juzsOrSurahs: 'الأجزاء: من 28 إلى 30',
        segmentsCount: 5,
        linesPerSegment: 7,
        maxScore: 100,
        errorCategories: compErrorCategories.map(c => ({ ...c })),
        errors: compErrors.map(e => ({ ...e })),
      },
    ];
    setLevels(nextLevels);
    onUpdate({
      ...comp,
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: nextLevels,
    });
  };

  const updateLevel = (id: number, updated: Partial<CompetitionLevel>) => {
    setLevels(levels.map(l => (l.id === id ? { ...l, ...updated } : l)));
  };

  const removeLevel = (id: number) => {
    const nextLevels = levels.filter(l => l.id !== id);
    setLevels(nextLevels);
    onUpdate({
      ...comp,
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: nextLevels,
    });
  };

  // إضافة متسابقين دفعة واحدة (لصق أو كتابة متعددة الأسطر) لمستوى محدد
  const handleAddBulkParticipantsToLevel = (level: CompetitionLevel) => {
    const rawText = bulkNamesByLevel[level.id] || '';
    const lines = rawText
      .split(/\r?\n/)
      .map(cleanParticipantLine)
      .filter(Boolean);

    if (lines.length === 0) {
      context?.showToast('يرجى كتابة أو لصق اسم متسابق واحد على الأقل', 'error');
      return;
    }

    const baseTime = Date.now();
    const newParticipants: CompetitionParticipant[] = lines.map((pName, idx) => ({
      id: baseTime + idx,
      name: pName,
      levelId: level.id,
      juzsOrSurahs: level.juzsOrSurahs,
    }));

    const updatedParticipants = [...(comp.participants || []), ...newParticipants];
    onUpdate({
      ...comp,
      levels,
      participants: updatedParticipants,
    });

    setBulkNamesByLevel(prev => ({ ...prev, [level.id]: '' }));
    context?.showToast(
      `تمت إضافة ${newParticipants.length} متسابق إلى "${level.name}" بنجاح!`,
      'success'
    );
  };

  const handleRemoveParticipantFromLevel = (participantId: number) => {
    onUpdate({
      ...comp,
      levels,
      participants: (comp.participants || []).filter(p => p.id !== participantId),
    });
  };

  // تحميل قالب إكسل بالحقول المعتمدة (رقم الطلب، الاسم الكامل، الرقم المدني، رقم الهاتف، الجنس، الولاية، مستوى المشاركة، وقت وتاريخ التسجيل)
  const handleDownloadLevelExcelTemplate = () => {
    downloadCompetitionExcelTemplate(comp, levels);
  };

  // استيراد ملف إكسل وتفعيل المستويات وأسماء المشاركين في كل مستوى
  const handleExcelImportForLevels = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fallbackLevelId = targetImportLevelId;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const { updatedLevels, newParticipants, addedLevelsCount } =
          parseAndImportCompetitionExcel(ws, comp, levels, fallbackLevelId);

        if (newParticipants.length > 0) {
          setLevels(updatedLevels);
          onUpdate({
            ...comp,
            isActive: true,
            levels: updatedLevels,
            participants: [...(comp.participants || []), ...newParticipants],
          });
          context?.showToast(
            addedLevelsCount > 0
              ? `تم استيراد ${newParticipants.length} متسابق وتفعيل المستويات وإضافة (${addedLevelsCount}) مستويات جديدة من ملف الإكسل! يمكنك تعديل أجزائها الآن.`
              : `تم استيراد ${newParticipants.length} متسابق وتوزيعهم على المستويات الموافقة في الاسم بنجاح!`,
            'success'
          );
        } else {
          context?.showToast('لم يتم العثور على أسماء متسابقين صالحة في ملف الإكسل', 'error');
        }
      } catch {
        context?.showToast('حدث خطأ أثناء قراءة ملف الإكسل', 'error');
      }
      setTargetImportLevelId(null);
      if (excelInputRef.current) excelInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Input خفي لاستيراد ملف الإكسل */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx, .xls"
        onChange={handleExcelImportForLevels}
        className="hidden"
      />

      {/* شريط علوي لإعداد المستويات واستيراد إكسل الشامل */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-emerald-50/60 dark:bg-slate-800/60 p-3.5 sm:p-4 rounded-2xl border border-emerald-200/70 dark:border-slate-700">
        <div>
          <h3 className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-300">
            إعداد المستويات وإدراج المتسابقين
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            استورد ملف الإكسل المعتمد (رقم الطلب، الاسم الكامل، الرقم المدني، رقم الهاتف، الجنس، الولاية، مستوى المشاركة، وقت وتاريخ التسجيل) لتفعيل المستويات وإدراج المتسابقين تلقائياً
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadLevelExcelTemplate}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            title="تحميل قالب إكسل المعتمد (من اليمين: رقم الطلب، الاسم الكامل، الرقم المدني، رقم الهاتف، الجنس، الولاية، مستوى المشاركة، وقت وتاريخ التسجيل)"
          >
            <Download size={16} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
            <span>تحميل قالب الإكسل المعتمد</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTargetImportLevelId(null);
              excelInputRef.current?.click();
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs cursor-pointer"
          >
            <Upload size={16} className="shrink-0" />
            <span>استيراد إكسل وتفعيل المستويات</span>
          </button>

          <button
            type="button"
            onClick={addLevel}
            className="col-span-2 sm:col-span-1 min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm cursor-pointer"
          >
            <Plus size={18} />
            <span>إضافة مستوى جديد</span>
          </button>
        </div>
      </div>

      {/* شريط نسخ المستويات وإعداداتها من أي مسابقة سابقة للتعديل عليها */}
      {otherCompetitions.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/70 dark:bg-slate-800/70 border border-amber-200 dark:border-slate-700 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Copy size={18} />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-300">
                نسخ إعدادات المستويات من مسابقة سابقة والتعديل عليها
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                اختر أي مسابقة سابقة لنسخ مستوياتها (الأجزاء، المقاطع، الدرجات، وبنود الخصم) إلى هذه المسابقة
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={importFromCompId}
              onChange={e => setImportFromCompId(e.target.value)}
              className="min-h-[44px] border border-amber-300 dark:border-slate-600 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs sm:text-sm"
            >
              <option value="">-- اختر المسابقة السابقة --</option>
              {otherCompetitions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({(c.levels || []).length} مستويات)
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 sm:flex gap-2">
              <button
                type="button"
                disabled={!importFromCompId}
                onClick={() => handleCopyLevelsFromCompetition('replace')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Copy size={15} />
                <span>نسخ واستبدال المستويات</span>
              </button>
              <button
                type="button"
                disabled={!importFromCompId}
                onClick={() => handleCopyLevelsFromCompetition('append')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-600 disabled:opacity-40 text-amber-900 dark:text-amber-300 hover:bg-amber-100/60 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <Plus size={15} />
                <span>إضافة للمستويات الحالية</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== إعدادات أزرار خصم الأخطاء وأصنافها للمسابقة كاملة (لجميع المستويات) ==================== */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border-2 border-indigo-200 dark:border-slate-700 space-y-4 shadow-xs">
        {(() => {
          const handleAddCategory = () => {
            const trimmed = newCategoryName.trim();
            if (!trimmed) {
              context?.showToast('يرجى كتابة اسم الصنف الجديد أولاً', 'error');
              return;
            }
            if (compErrorCategories.some(c => c.name.trim() === trimmed)) {
              context?.showToast('هذا الصنف موجود بالفعل في هذه المسابقة', 'info');
              return;
            }
            const nextCategories: CompetitionErrorCategory[] = [
              ...compErrorCategories,
              {
                id: `cat-${Date.now()}`,
                name: trimmed,
                color: newCategoryColor,
              },
            ];
            updateCompetitionErrorsAndCategories(compErrors, nextCategories);
            setNewCategoryName('');
            const nextUnusedColor =
              ERROR_CATEGORY_COLOR_OPTIONS.find(
                opt => !nextCategories.some(c => c.color === opt.key)
              )?.key || 'purple';
            setNewCategoryColor(nextUnusedColor);
            context?.showToast(`تمت إضافة صنف «${trimmed}» لهذه المسابقة بنجاح`, 'success');
          };

          const handleChangeCategoryColor = (
            catName: string,
            newColor: ErrorCategoryColorKey
          ) => {
            const nextCategories = compErrorCategories.map(c =>
              c.name === catName ? { ...c, color: newColor } : c
            );
            const nextErrors = compErrors.map(er =>
              resolveErrorCategoryName(er) === catName
                ? { ...er, category: catName, color: newColor }
                : er
            );
            updateCompetitionErrorsAndCategories(nextErrors, nextCategories);
          };

          const handleDeleteCategory = (catName: string) => {
            if (compErrorCategories.length <= 1) {
              context?.showToast('يجب الإبقاء على صنف واحد على الأقل', 'error');
              return;
            }
            const remaining = compErrorCategories.filter(c => c.name !== catName);
            const fallbackCat = remaining[0];
            const nextErrors = compErrors.map(er =>
              resolveErrorCategoryName(er) === catName
                ? {
                    ...er,
                    category: fallbackCat.name,
                    color: fallbackCat.color,
                  }
                : er
            );
            updateCompetitionErrorsAndCategories(nextErrors, remaining);
            context?.showToast(`تم حذف الصنف «${catName}» من المسابقة`, 'info');
          };

          return (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm sm:text-base font-black text-indigo-950 dark:text-indigo-300 flex items-center gap-2">
                    <Sliders size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>
                      إعدادات أزرار خصم الأخطاء وأصنافها لهذه المسابقة (تُطبّق موحدة على جميع المستويات)
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    إعدادات أزرار الخصم هنا خاصة بمسابقة «{comp.name}» بجميع مستوياتها، ومستقلة عن أي مسابقة أخرى.
                  </p>
                </div>
              </div>

              {/* 1. إدارة أصناف الأخطاء وألوانها للمسابقة */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-3">
                <div>
                  <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100 block">
                    أصناف أزرار الخصم وألوانها (افتراضياً: التنبيه والفتح والتشكيل في صنف «حفظ»، والتجويد في صنف «التجويد»)
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    حدد لكل صنف لوناً مميزاً؛ يظهر للمقيم أثناء التقييم لون الزر فقط حسب صنفه دون إظهار اسم الصنف.
                  </span>
                </div>

                {/* قائمة الأصناف الحالية مع إمكانية تغيير لون كل صنف */}
                <div className="flex flex-wrap gap-2">
                  {compErrorCategories.map(cat => {
                    const st =
                      ERROR_CATEGORY_COLOR_STYLES[cat.color] ||
                      ERROR_CATEGORY_COLOR_STYLES.rose;
                    return (
                      <div
                        key={cat.id || cat.name}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-black ${st.chip}`}
                      >
                        <span className={`w-3 h-3 rounded-full shrink-0 ${st.dot}`} />
                        <span>صنف: {cat.name}</span>
                        <select
                          value={cat.color}
                          onChange={e =>
                            handleChangeCategoryColor(
                              cat.name,
                              e.target.value as ErrorCategoryColorKey
                            )
                          }
                          className="bg-white/90 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-0.5 text-[11px] font-bold cursor-pointer"
                          title="تغيير لون هذا الصنف"
                        >
                          {ERROR_CATEGORY_COLOR_OPTIONS.map(opt => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {compErrorCategories.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.name)}
                            className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center text-current cursor-pointer"
                            title={`حذف صنف ${cat.name}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* إضافة صنف جديد للمسابقة */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="اسم صنف جديد (مثال: الوقف والابتداء، الأداء...)"
                    className="flex-1 min-h-[38px] border border-slate-300 dark:border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={newCategoryColor}
                      onChange={e =>
                        setNewCategoryColor(e.target.value as ErrorCategoryColorKey)
                      }
                      className="min-h-[38px] border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 cursor-pointer"
                    >
                      {ERROR_CATEGORY_COLOR_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>
                          لون: {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer shrink-0"
                    >
                      <Plus size={14} />
                      <span>إضافة صنف</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. أزرار خصم الأخطاء وتعيين الصنف لكل زر في المسابقة */}
              <div className="flex flex-col xs:flex-row justify-between items-stretch xs:items-center gap-2 pt-1">
                <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200">
                  أزرار خصم الأخطاء المعتمدة لجميع مستويات المسابقة (الافتراضي: التنبيه، الفتح، التشكيل، التجويد)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newErrId =
                      compErrors.length > 0
                        ? Math.max(...compErrors.map(e => e.id)) + 1
                        : 1;
                    const defaultCat = compErrorCategories[0] || DEFAULT_ERROR_CATEGORIES[0];
                    const nextErrors: CompetitionErrorType[] = [
                      ...compErrors,
                      {
                        id: newErrId,
                        name: 'خطأ جديد',
                        deduction: 1,
                        category: defaultCat.name,
                        color: defaultCat.color,
                      },
                    ];
                    updateCompetitionErrorsAndCategories(nextErrors, compErrorCategories);
                  }}
                  className="min-h-[40px] text-xs bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-2 rounded-xl hover:bg-emerald-100 font-extrabold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Plus size={15} />
                  <span>إضافة زر خطأ</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {compErrors.map(err => {
                  const currentCatName = resolveErrorCategoryName(err);
                  const errStyle = getErrorColorStyle(err, compErrorCategories);

                  return (
                    <div
                      key={err.id}
                      className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl border-2 transition ${errStyle.card}`}
                    >
                      <div className="flex-1 min-w-[110px]">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full inline-block ${errStyle.dot}`}
                          />
                          <span>اسم زر الخطأ</span>
                        </span>
                        <input
                          type="text"
                          value={err.name}
                          onChange={e => {
                            const updatedErrs = compErrors.map(er =>
                              er.id === err.id
                                ? { ...er, name: e.target.value }
                                : er
                            );
                            updateCompetitionErrorsAndCategories(
                              updatedErrs,
                              compErrorCategories
                            );
                          }}
                          className="w-full min-h-[40px] border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-900"
                          placeholder="اسم الخطأ"
                        />
                      </div>

                      <div className="w-32 sm:w-36 shrink-0">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
                          الصنف (لون الزر)
                        </span>
                        <select
                          value={currentCatName}
                          onChange={e => {
                            const chosenCatName = e.target.value;
                            const matchedCat = compErrorCategories.find(
                              c => c.name === chosenCatName
                            );
                            const updatedErrs = compErrors.map(er =>
                              er.id === err.id
                                ? {
                                    ...er,
                                    category: chosenCatName,
                                    color: matchedCat?.color || er.color,
                                  }
                                : er
                            );
                            updateCompetitionErrorsAndCategories(
                              updatedErrs,
                              compErrorCategories
                            );
                          }}
                          className="w-full min-h-[40px] border border-slate-300 dark:border-slate-600 px-2 py-1.5 rounded-lg text-xs font-black bg-white dark:bg-slate-900 cursor-pointer"
                        >
                          {compErrorCategories.map(cat => (
                            <option key={cat.id || cat.name} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-20 sm:w-24 shrink-0">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
                          مقدار الخصم
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          value={
                            editingDeductions[`comp_${err.id}`] !== undefined
                              ? editingDeductions[`comp_${err.id}`]
                              : String(err.deduction ?? 0)
                          }
                          onChange={e => {
                            const normalized = e.target.value
                              .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                              .replace(',', '.');
                            if (!/^\d*\.?\d*$/.test(normalized)) return;
                            const key = `comp_${err.id}`;
                            setEditingDeductions(prev => ({ ...prev, [key]: normalized }));
                            const parsed =
                              normalized === '' || normalized === '.'
                                ? 0
                                : Number(normalized);
                            if (!Number.isNaN(parsed)) {
                              const updatedErrs = compErrors.map(er =>
                                er.id === err.id
                                  ? { ...er, deduction: parsed }
                                  : er
                              );
                              updateCompetitionErrorsAndCategories(
                                updatedErrs,
                                compErrorCategories
                              );
                            }
                          }}
                          onBlur={() => {
                            const key = `comp_${err.id}`;
                            setEditingDeductions(prev => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          }}
                          className="w-full min-h-[40px] border border-slate-300 dark:border-slate-600 px-2 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-center bg-white dark:bg-slate-900"
                          placeholder="الخصم"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmError(err)}
                        className="min-h-[40px] min-w-[38px] mt-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg flex items-center justify-center transition active:scale-95 shrink-0 cursor-pointer"
                        title="حذف نوع الخطأ"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      <div className="grid gap-5 sm:gap-6">
        {levels.map(level => {
          const levelParticipants = (comp.participants || []).filter(
            p => Number(p.levelId) === Number(level.id)
          );
          const rawBulkText = bulkNamesByLevel[level.id] || '';
          const detectedLinesCount = rawBulkText
            .split(/\r?\n/)
            .map(cleanParticipantLine)
            .filter(Boolean).length;

          return (
            <div
              key={level.id}
              className="border-2 border-slate-200 dark:border-slate-700 p-3 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 space-y-4 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                <div className="flex-1 min-w-0">
                  <label className="text-xs text-slate-600 dark:text-slate-300 font-bold mb-1 block">
                    اسم المستوى
                  </label>
                  <input
                    type="text"
                    value={level.name}
                    onChange={e => updateLevel(level.id, { name: e.target.value })}
                    className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-900 font-black text-sm sm:text-base"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => duplicateSingleLevel(level)}
                    className="flex-1 sm:flex-initial min-h-[44px] px-3.5 text-amber-800 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer text-xs font-extrabold"
                    title="نسخ إعدادات هذا المستوى إلى مستوى جديد للتعديل عليه"
                  >
                    <Copy size={16} />
                    <span>نسخ المستوى</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmLevel(level)}
                    className="min-h-[44px] min-w-[44px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/50 p-2.5 rounded-xl transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
                    title="حذف المستوى"
                  >
                    <Trash2 size={19} />
                  </button>
                </div>
              </div>

              <div className="space-y-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <label className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-black block">
                      تحديد الأجزاء أو السور داخل هذا المستوى
                    </label>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-black">
                      <span>المقرر المحدد للمستوى:</span>
                      <strong>{formatJuzsOrSurahsDisplay(level.juzsOrSurahs) || 'غير محدد'}</strong>
                    </span>
                  </div>

                  {(() => {
                    const isSpecificSurahs = level.juzsOrSurahs.startsWith('السور:');
                    const isUnspecified =
                      !isSpecificSurahs &&
                      (Boolean(level.isUnspecifiedJuzs) || isUnspecifiedJuzCount(level.juzsOrSurahs));
                    const isSpecificFixedJuzs = !isSpecificSurahs && !isUnspecified;

                    const currentJuzNums: number[] = (() => {
                      if (isUnspecified) return [];
                      if (level.juzsOrSurahs.startsWith('الأجزاء:')) {
                        return parseJuzsToNumbers(level.juzsOrSurahs.replace('الأجزاء:', ''));
                      }
                      const raw = level.juzsOrSurahs.trim();
                      if (
                        raw.includes('القرآن كاملاً') ||
                        raw.includes('المصحف كاملاً') ||
                        raw.includes('30 جزء')
                      ) {
                        return Array.from({ length: 30 }, (_, i) => i + 1);
                      }
                      return [];
                    })();

                    const inferredJuzCount =
                      level.juzCount ||
                      extractJuzCount(level.name) ||
                      extractJuzCount(level.juzsOrSurahs) ||
                      (currentJuzNums.length > 0 ? currentJuzNums.length : 5);
                    const levelJuzCount = Math.min(30, Math.max(1, inferredJuzCount));
                    const isLessThan30 = levelJuzCount < 30;
                    const isConsecutive = level.isConsecutiveJuzs !== false; // الافتراضي: متتالية

                    const formattedJuzSummary = formatJuzsFromNumbers(currentJuzNums);
                    const all30Selected = !isUnspecified && currentJuzNums.length === 30;

                    const buildUnspecifiedScopeLabel = (count: number, consecutive: boolean) => {
                      if (count === 1) return 'جزء واحد (يحدده المقيم لكل متسابق)';
                      if (count === 2)
                        return `جزآن ${consecutive ? 'متتاليان' : 'غير متتاليين (متفرقان)'} (يحددهما المقيم)`;
                      const unit = count >= 3 && count <= 10 ? 'أجزاء' : 'جزءاً';
                      return `${count} ${unit} ${
                        consecutive ? 'متتالية' : 'غير متتالية (متفرقة)'
                      } (يحددها المقيم لكل متسابق)`;
                    };

                    const applyJuzSelection = (
                      nums: number[],
                      overrides?: Partial<CompetitionLevel>
                    ) => {
                      const sortedUnique = [...new Set(nums)]
                        .filter(n => n >= 1 && n <= 30)
                        .sort((a, b) => a - b);
                      const nextCount = overrides?.juzCount ?? levelJuzCount;
                      const nextConsecutive = overrides?.isConsecutiveJuzs ?? isConsecutive;

                      if (sortedUnique.length === 0) {
                        const effectiveCount = nextCount < 30 ? nextCount : 5;
                        updateLevel(level.id, {
                          juzCount: effectiveCount,
                          isConsecutiveJuzs: nextConsecutive,
                          isUnspecifiedJuzs: true,
                          juzsOrSurahs: buildUnspecifiedScopeLabel(effectiveCount, nextConsecutive),
                          ...overrides,
                        });
                        return;
                      }

                      const nextScope = `الأجزاء: ${formatJuzsFromNumbers(sortedUnique)}`;
                      updateLevel(level.id, {
                        juzCount: sortedUnique.length === 30 ? 30 : nextCount,
                        isConsecutiveJuzs: nextConsecutive,
                        isUnspecifiedJuzs: false,
                        juzsOrSurahs: nextScope,
                        ...overrides,
                      });
                    };

                    const handleSetLevelJuzCount = (newCount: number) => {
                      const clamped = Math.min(30, Math.max(1, newCount));
                      if (clamped === 30 && !isUnspecified) {
                        applyJuzSelection(
                          Array.from({ length: 30 }, (_, i) => i + 1),
                          {
                            juzCount: 30,
                            isConsecutiveJuzs: true,
                            isUnspecifiedJuzs: false,
                          }
                        );
                        return;
                      }

                      if (isUnspecified) {
                        const effectiveCount = Math.min(29, Math.max(1, clamped));
                        updateLevel(level.id, {
                          juzCount: effectiveCount,
                          isConsecutiveJuzs: isConsecutive,
                          isUnspecifiedJuzs: true,
                          juzsOrSurahs: buildUnspecifiedScopeLabel(effectiveCount, isConsecutive),
                        });
                        return;
                      }

                      if (isConsecutive) {
                        const firstSelected = currentJuzNums[0] || 1;
                        const start = Math.min(firstSelected, Math.max(1, 30 - clamped + 1));
                        const nextNums = Array.from({ length: clamped }, (_, i) => start + i);
                        applyJuzSelection(nextNums, {
                          juzCount: clamped,
                          isConsecutiveJuzs: true,
                        });
                      } else {
                        const trimmed = currentJuzNums.slice(0, clamped);
                        if (trimmed.length > 0) {
                          applyJuzSelection(trimmed, {
                            juzCount: clamped,
                            isConsecutiveJuzs: false,
                          });
                        } else {
                          updateLevel(level.id, {
                            juzCount: clamped,
                            isConsecutiveJuzs: false,
                            isUnspecifiedJuzs: true,
                            juzsOrSurahs: buildUnspecifiedScopeLabel(clamped, false),
                          });
                        }
                      }
                    };

                    const handleToggleConsecutive = (checked: boolean) => {
                      if (isUnspecified) {
                        const effectiveCount = levelJuzCount < 30 ? levelJuzCount : 5;
                        updateLevel(level.id, {
                          juzCount: effectiveCount,
                          isConsecutiveJuzs: checked,
                          isUnspecifiedJuzs: true,
                          juzsOrSurahs: buildUnspecifiedScopeLabel(effectiveCount, checked),
                        });
                        return;
                      }
                      if (checked && isLessThan30 && currentJuzNums.length > 0) {
                        const start = Math.min(
                          currentJuzNums[0],
                          Math.max(1, 30 - levelJuzCount + 1)
                        );
                        const consecutiveNums = Array.from(
                          { length: levelJuzCount },
                          (_, i) => start + i
                        );
                        applyJuzSelection(consecutiveNums, {
                          juzCount: levelJuzCount,
                          isConsecutiveJuzs: true,
                        });
                      } else {
                        updateLevel(level.id, {
                          juzCount: levelJuzCount,
                          isConsecutiveJuzs: checked,
                        });
                      }
                    };

                    return (
                      <>
                        {/* الخيارات الثلاثة الرئيسية لتحديد نوع مقرر المستوى */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                          {/* الخيار 1: أجزاء محددة وموحدة للمستوى */}
                          <label
                            className={`min-h-[48px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-start sm:items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isSpecificFixedJuzs
                                ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isSpecificFixedJuzs}
                              onChange={() => {
                                if (currentJuzNums.length > 0) {
                                  applyJuzSelection(currentJuzNums, { isUnspecifiedJuzs: false });
                                } else {
                                  const countToUse = levelJuzCount || 5;
                                  const start = Math.max(1, 30 - countToUse + 1);
                                  applyJuzSelection(
                                    Array.from({ length: countToUse }, (_, i) => start + i),
                                    {
                                      juzCount: countToUse,
                                      isConsecutiveJuzs: isConsecutive,
                                      isUnspecifiedJuzs: false,
                                    }
                                  );
                                }
                              }}
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0 mt-0.5 sm:mt-0"
                            />
                            <div className="leading-snug">
                              <span className="block font-black">1. أجزاء محددة وموحدة للمستوى</span>
                              <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                نفس الأجزاء لجميع متسابقي هذا المستوى
                              </span>
                            </div>
                          </label>

                          {/* الخيار 2: أجزاء خاصة لكل متسابق يحددها المقيم عند التقييم */}
                          <label
                            className={`min-h-[48px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-start sm:items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isUnspecified
                                ? 'bg-amber-50 border-2 border-amber-500 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-500 shadow-2xs ring-2 ring-amber-400/30'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isUnspecified}
                              onChange={() => {
                                const defaultUnspecifiedCount =
                                  levelJuzCount < 30 ? levelJuzCount : 5;
                                updateLevel(level.id, {
                                  juzCount: defaultUnspecifiedCount,
                                  isConsecutiveJuzs: isConsecutive,
                                  isUnspecifiedJuzs: true,
                                  juzsOrSurahs: buildUnspecifiedScopeLabel(
                                    defaultUnspecifiedCount,
                                    isConsecutive
                                  ),
                                });
                              }}
                              className="text-amber-600 focus:ring-amber-500 w-4 h-4 shrink-0 mt-0.5 sm:mt-0"
                            />
                            <div className="leading-snug">
                              <span className="block font-black">
                                2. أجزاء خاصة لكل متسابق (يحددها المقيم)
                              </span>
                              <span className="block text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                مثل: 5 أجزاء متتالية أو غير متتالية يختارها المقيم للطالب
                              </span>
                            </div>
                          </label>

                          {/* الخيار 3: سور معينة محددة لهذا المستوى */}
                          <label
                            className={`min-h-[48px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-start sm:items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isSpecificSurahs
                                ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isSpecificSurahs}
                              onChange={() =>
                                updateLevel(level.id, {
                                  juzsOrSurahs: 'السور: البقرة',
                                  isUnspecifiedJuzs: false,
                                })
                              }
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0 mt-0.5 sm:mt-0"
                            />
                            <div className="leading-snug">
                              <span className="block font-black">3. سور معينة لهذا المستوى</span>
                              <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                تحديد سورة أو عدة سور محددة
                              </span>
                            </div>
                          </label>
                        </div>

                        {/* ==================== اللوحة الخاصة بالخيار الثاني: أجزاء خاصة لكل متسابق يحددها المقيم أثناء التقييم ==================== */}
                        {isUnspecified && (
                          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border-2 border-amber-400 dark:border-amber-600 space-y-4 shadow-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 dark:border-amber-800/60 pb-3">
                              <div>
                                <h4 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-100">
                                  إعداد مستوى بأجزاء خاصة لكل متسابق (يحددها المقيم عند الدخول لصفحة الطالب)
                                </h4>
                                <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                                  حدد عدد الأجزاء المطلوبة من المتسابق، وهل يشترط أن تكون متتالية أم غير متتالية (متفرقة).
                                </p>
                              </div>
                              <span className="px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shrink-0 self-start sm:self-center">
                                {buildUnspecifiedScopeLabel(levelJuzCount, isConsecutive)}
                              </span>
                            </div>

                            {/* 1. اختيار عدد الأجزاء المطلوبة لكل متسابق */}
                            <div className="space-y-2">
                              <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                                أ) عدد الأجزاء المطلوبة من كل متسابق في هذا المستوى:
                              </label>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25].map(cnt => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    onClick={() => handleSetLevelJuzCount(cnt)}
                                    className={`min-w-[40px] h-9 px-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer border ${
                                      levelJuzCount === cnt
                                        ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs ring-2 ring-emerald-400/50'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                                    }`}
                                  >
                                    {cnt} {cnt === 1 ? 'جزء' : cnt === 2 ? 'جزآن' : cnt <= 10 ? 'أجزاء' : 'جزءاً'}
                                  </button>
                                ))}
                                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700">
                                  <span className="text-[11px] font-bold text-slate-500">عدد آخر:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={29}
                                    value={levelJuzCount}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val)) handleSetLevelJuzCount(val);
                                    }}
                                    className="w-14 h-7 px-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center text-xs font-black text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* 2. اختيار هل الأجزاء متتالية أم غير متتالية (متفرقة) */}
                            <div className="space-y-2">
                              <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                                ب) هل يشترط أن تكون الـ ({levelJuzCount}) أجزاء متتالية أم غير متتالية؟
                              </label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleConsecutive(true)}
                                  className={`p-3 rounded-xl border-2 text-right transition active:scale-95 cursor-pointer flex items-start gap-2.5 ${
                                    isConsecutive
                                      ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-600 text-emerald-950 dark:text-emerald-100 shadow-xs'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isConsecutive}
                                    readOnly
                                    className="w-4 h-4 mt-0.5 rounded accent-emerald-600 pointer-events-none shrink-0"
                                  />
                                  <div className="space-y-0.5">
                                    <div className="text-xs sm:text-sm font-black">
                                      متتالية (الافتراضي) — {levelJuzCount} أجزاء متتالية
                                    </div>
                                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                      عندما يدخل المقيم لتقييم الطالب ينقر فقط على رقم الجزء الأول (مثلاً 6) فتتحدد تلقائياً الأجزاء ({levelJuzCount} أجزاء متتالية: من 6 إلى {Math.min(30, 6 + levelJuzCount - 1)}).
                                    </div>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleConsecutive(false)}
                                  className={`p-3 rounded-xl border-2 text-right transition active:scale-95 cursor-pointer flex items-start gap-2.5 ${
                                    !isConsecutive
                                      ? 'bg-amber-100/90 dark:bg-amber-950/70 border-amber-600 text-amber-950 dark:text-amber-100 shadow-xs'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!isConsecutive}
                                    readOnly
                                    className="w-4 h-4 mt-0.5 rounded accent-amber-600 pointer-events-none shrink-0"
                                  />
                                  <div className="space-y-0.5">
                                    <div className="text-xs sm:text-sm font-black">
                                      غير متتالية (متفرقة) — {levelJuzCount} أجزاء متفرقة
                                    </div>
                                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                      عندما يدخل المقيم لتقييم الطالب يختار أي {levelJuzCount} أجزاء متفرقة خاصة بالطالب يدوياً من المصحف.
                                    </div>
                                  </div>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ==================== اللوحة الخاصة بالخيار الأول: أجزاء محددة وموحدة للمستوى ==================== */}
                        {isSpecificFixedJuzs && (
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                            {/* شريط عدد أجزاء المستوى + خيار متتالية (يظهر للمستويات الأقل من 30 جزءاً) */}
                            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                                    عدد أجزاء المستوى:
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1">
                                    {[1, 2, 3, 5, 10, 15, 20, 25, 30].map(cnt => (
                                      <button
                                        key={cnt}
                                        type="button"
                                        onClick={() => handleSetLevelJuzCount(cnt)}
                                        className={`min-w-[34px] h-8 px-2 rounded-lg text-xs font-black transition active:scale-95 cursor-pointer border ${
                                          levelJuzCount === cnt
                                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                                        }`}
                                      >
                                        {cnt === 30 ? '30 (كامل)' : cnt}
                                      </button>
                                    ))}
                                    <input
                                      type="number"
                                      min={1}
                                      max={30}
                                      value={levelJuzCount}
                                      onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        if (!isNaN(val)) handleSetLevelJuzCount(val);
                                      }}
                                      className="w-16 h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-xs font-black text-slate-900 dark:text-white"
                                      title="عدد أجزاء المستوى"
                                    />
                                  </div>
                                </div>

                                {/* مربع علامة صح "متتالية" للمستويات الأقل من 30 جزءاً */}
                                {isLessThan30 && (
                                  <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-200 font-black text-xs sm:text-sm cursor-pointer select-none shadow-2xs transition active:scale-95">
                                    <input
                                      type="checkbox"
                                      checked={isConsecutive}
                                      onChange={e => handleToggleConsecutive(e.target.checked)}
                                      className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                                    />
                                    <span>متتالية</span>
                                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                      ({isConsecutive ? 'تلقائياً عند اختيار جزء' : 'أجزاء متفرقة'})
                                    </span>
                                  </label>
                                )}
                              </div>

                              {isLessThan30 && (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                  <span>
                                    {isConsecutive
                                      ? `عند النقر على أي جزء بالأسفل، سيتم تحديده مع ${
                                          levelJuzCount - 1
                                        } أجزاء تليه تلقائياً (${levelJuzCount} أجزاء متتالية).`
                                      : `يمكنك النقر على أرقام الأجزاء لتحديد ${levelJuzCount} أجزاء متفرقة يدوياً.`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => applyJuzSelection([])}
                                    className="px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer border shrink-0 flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700"
                                  >
                                    <span>
                                      تحويل إلى: أجزاء خاصة لكل متسابق (يحددها المقيم)
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* شريط عرض النطاق المتتالي + أزرار تحديد الكل وإلغاء التحديد */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                              <div className="space-y-0.5">
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                                  الأجزاء المختارة في هذا المستوى ({currentJuzNums.length} جزء):
                                </span>
                                <div className="text-sm sm:text-base font-black text-emerald-800 dark:text-emerald-300">
                                  {formattedJuzSummary
                                    ? formattedJuzSummary
                                    : 'لم يتم تحديد أي جزء بعد (اختر من الأجزاء بالأسفل)'}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyJuzSelection(
                                      Array.from({ length: 30 }, (_, i) => i + 1),
                                      {
                                        juzCount: 30,
                                        isConsecutiveJuzs: true,
                                        isUnspecifiedJuzs: false,
                                      }
                                    )
                                  }
                                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer border ${
                                    all30Selected
                                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                                  }`}
                                >
                                  <Check size={15} />
                                  <span>تحديد الكل (من 1 إلى 30)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => applyJuzSelection([])}
                                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/60 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                                >
                                  <span>جعلها يحددها المقيم لكل طالب</span>
                                </button>
                              </div>
                            </div>

                            {/* اختصارات سريعة للنطاقات المتتالية الشائعة */}
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                                اختصارات سريعة للأجزاء المتتالية أو اضغط على رقم الجزء الأول بالأسفل:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  {
                                    label: 'من 1 إلى 30 (كامل)',
                                    nums: Array.from({ length: 30 }, (_, i) => i + 1),
                                  },
                                  {
                                    label: 'من 1 إلى 20',
                                    nums: Array.from({ length: 20 }, (_, i) => i + 1),
                                  },
                                  {
                                    label: 'من 1 إلى 15',
                                    nums: Array.from({ length: 15 }, (_, i) => i + 1),
                                  },
                                  {
                                    label: 'من 1 إلى 10',
                                    nums: Array.from({ length: 10 }, (_, i) => i + 1),
                                  },
                                  {
                                    label: 'من 1 إلى 5',
                                    nums: [1, 2, 3, 4, 5],
                                  },
                                  {
                                    label: 'من 6 إلى 10',
                                    nums: [6, 7, 8, 9, 10],
                                  },
                                  {
                                    label: 'من 26 إلى 30',
                                    nums: [26, 27, 28, 29, 30],
                                  },
                                  {
                                    label: 'من 28 إلى 30',
                                    nums: [28, 29, 30],
                                  },
                                  {
                                    label: 'من 29 إلى 30',
                                    nums: [29, 30],
                                  },
                                  {
                                    label: 'الجزء 30 (عم)',
                                    nums: [30],
                                  },
                                ].map((preset, idx) => {
                                  const presetFormatted = formatJuzsFromNumbers(preset.nums);
                                  const isPresetActive =
                                    !isUnspecified &&
                                    formattedJuzSummary === presetFormatted &&
                                    currentJuzNums.length === preset.nums.length;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() =>
                                        applyJuzSelection(preset.nums, {
                                          juzCount: preset.nums.length,
                                          isConsecutiveJuzs: true,
                                          isUnspecifiedJuzs: false,
                                        })
                                      }
                                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-black transition active:scale-95 cursor-pointer ${
                                        isPresetActive
                                          ? 'bg-amber-500 text-slate-950 shadow-2xs'
                                          : 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700 hover:bg-emerald-50'
                                      }`}
                                    >
                                      {preset.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* شبكة الأجزاء من 1 إلى 30 */}
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                              {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
                                const isSelected = !isUnspecified && currentJuzNums.includes(juz);
                                const isFirstOfConsecutive =
                                  isSelected &&
                                  isLessThan30 &&
                                  isConsecutive &&
                                  currentJuzNums[0] === juz;
                                return (
                                  <button
                                    key={juz}
                                    type="button"
                                    onClick={() => {
                                      if (isLessThan30 && isConsecutive) {
                                        const start = Math.min(
                                          juz,
                                          Math.max(1, 30 - levelJuzCount + 1)
                                        );
                                        const consecutiveNums = Array.from(
                                          { length: levelJuzCount },
                                          (_, idx) => start + idx
                                        );
                                        applyJuzSelection(consecutiveNums, {
                                          juzCount: levelJuzCount,
                                          isConsecutiveJuzs: true,
                                          isUnspecifiedJuzs: false,
                                        });
                                        return;
                                      }

                                      const nextNums = isSelected
                                        ? currentJuzNums.filter(j => j !== juz)
                                        : [...currentJuzNums, juz].sort((a, b) => a - b);
                                      applyJuzSelection(nextNums, {
                                        juzCount:
                                          nextNums.length > 0 ? nextNums.length : levelJuzCount,
                                        isConsecutiveJuzs: false,
                                      });
                                    }}
                                    className={`min-h-[40px] p-1.5 text-xs sm:text-sm rounded-xl font-black transition active:scale-95 cursor-pointer relative ${
                                      isSelected
                                        ? isFirstOfConsecutive
                                          ? 'bg-emerald-800 text-white shadow-xs ring-2 ring-amber-400'
                                          : 'bg-emerald-700 text-white shadow-xs'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                                    }`}
                                  >
                                    {juz}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* الخيار الثاني: سور معينة محددة (مع تحديد الكل وإلغاء الكل) */}
                        {isSpecificSurahs && (
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                            {(() => {
                              const allSurahList = surahNames.slice(1);
                              const currentSurahs = level.juzsOrSurahs
                                .replace('السور:', '')
                                .split('،')
                                .map(s => s.trim())
                                .filter(Boolean);
                              const allSurahsSelected =
                                currentSurahs.length === allSurahList.length;

                              return (
                                <>
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700">
                                    <div className="text-xs font-black text-slate-700 dark:text-slate-200">
                                      اضغط لتحديد السور المطلوبة في هذا المستوى ({currentSurahs.length} سورة محددة):
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateLevel(level.id, {
                                            juzsOrSurahs: `السور: ${allSurahList.join('، ')}`,
                                          })
                                        }
                                        className={`min-h-[34px] px-3 py-1 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer border ${
                                          allSurahsSelected
                                            ? 'bg-emerald-700 text-white border-emerald-700'
                                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
                                        }`}
                                      >
                                        تحديد الكل
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateLevel(level.id, { juzsOrSurahs: 'السور: ' })
                                        }
                                        disabled={currentSurahs.length === 0}
                                        className="min-h-[34px] px-3 py-1 rounded-xl bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/60 font-black text-xs transition active:scale-95 cursor-pointer"
                                      >
                                        إلغاء الكل
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-1">
                                    {allSurahList.map((surah, idx) => {
                                      const isSelected = currentSurahs.includes(surah);
                                      return (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={() => {
                                            const next = isSelected
                                              ? currentSurahs.filter(s => s !== surah)
                                              : [...currentSurahs, surah];
                                            updateLevel(level.id, {
                                              juzsOrSurahs: `السور: ${next.join('، ')}`,
                                            });
                                          }}
                                          className={`min-h-[38px] px-3 py-1.5 text-xs rounded-xl font-bold transition active:scale-95 cursor-pointer ${
                                            isSelected
                                              ? 'bg-emerald-700 text-white shadow-xs'
                                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                                          }`}
                                        >
                                          {surah}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <div>
                      <label className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold mb-1 block">
                        عدد المقاطع للاختبار (الافتراضي 5 مقاطع)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={level.segmentsCount}
                        onFocus={e => e.target.select()}
                        onChange={e =>
                          updateLevel(level.id, {
                            segmentsCount: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 font-black text-center text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold mb-1 block">
                        الدرجة النهائية العظمى
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={level.maxScore}
                        onFocus={e => e.target.select()}
                        onChange={e =>
                          updateLevel(level.id, {
                            maxScore: Math.max(1, Number(e.target.value) || 100),
                          })
                        }
                        className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 font-black text-center text-sm"
                      />
                    </div>
                  </div>

                  {/* اختيار عدد الأسطر الفعلي للمقطع مصمم خصيصاً لشاشة الهاتف */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50/50 dark:bg-slate-800/70 border border-emerald-200/70 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-black text-emerald-950 dark:text-emerald-300">
                        عدد الأسطر الفعلي للمقطع:
                      </span>
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() =>
                            updateLevel(level.id, {
                              linesPerSegment: Math.max(1, (level.linesPerSegment || 7) - 1),
                            })
                          }
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-black text-sm text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={level.linesPerSegment}
                          onChange={e =>
                            updateLevel(level.id, {
                              linesPerSegment: Math.max(
                                1,
                                Math.min(20, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-12 text-center font-black text-xs sm:text-sm bg-transparent text-emerald-900 dark:text-emerald-300 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateLevel(level.id, {
                              linesPerSegment: Math.min(20, (level.linesPerSegment || 7) + 1),
                            })
                          }
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-black text-sm text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {[4, 5, 6, 7, 8, 10, 12, 15].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            updateLevel(level.id, { linesPerSegment: preset })
                          }
                          className={`min-h-[34px] py-1 px-1 rounded-lg text-[11px] font-black transition active:scale-95 cursor-pointer border ${
                            level.linesPerSegment === preset
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {preset} أسطر
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ==================== قسم إضافة متسابقي هذا المستوى (لصق متعدد الأسطر أو استيراد إكسل) ==================== */}
              <div className="bg-emerald-50/70 dark:bg-slate-900/90 p-3.5 sm:p-4 rounded-xl border-2 border-emerald-200/80 dark:border-emerald-900/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
                        إضافة المتسابقين في «{level.name}» (كل سطر اسم أو عبر إكسل)
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        الصق قائمة الأسماء مباشرة (كل اسم في سطر مستقل) أو استورد ملف إكسل لهذا المستوى
                      </p>
                    </div>
                  </div>

                  {detectedLinesCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-black self-start sm:self-auto">
                      جاهز للإضافة: {detectedLinesCount} متسابق
                    </span>
                  )}
                </div>

                <textarea
                  rows={4}
                  value={rawBulkText}
                  onChange={e =>
                    setBulkNamesByLevel(prev => ({
                      ...prev,
                      [level.id]: e.target.value,
                    }))
                  }
                  placeholder={`الصق أو اكتب أسماء المتسابقين هنا (كل سطر اسم متسابق)...\nمثال:\nعبدالرحمن محمد أحمد\nعبدالله خالد سعيد\nأسامة علي حسن`}
                  className="w-full p-3 rounded-xl border border-emerald-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 leading-relaxed"
                />

                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddBulkParticipantsToLevel(level)}
                    className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <Plus size={18} />
                    <span>
                      إضافة الأسماء لهذا المستوى
                      {detectedLinesCount > 0 ? ` (${detectedLinesCount})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetImportLevelId(level.id);
                      excelInputRef.current?.click();
                    }}
                    className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <FileSpreadsheet size={17} />
                    <span>استيراد إكسل لهذا المستوى</span>
                  </button>
                </div>

                {/* عرض المتسابقين المسجلين حالياً في هذا المستوى */}
                {levelParticipants.length > 0 && (
                  <div className="pt-2.5 border-t border-emerald-200/70 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-emerald-900 dark:text-emerald-300">
                        المتسابقون المسجلون في هذا المستوى ({levelParticipants.length}):
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                      {levelParticipants.map((p, idx) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs"
                        >
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">
                            {idx + 1}.
                          </span>
                          <span>{p.name}</span>
                          <button
                            type="button"
                            onClick={() => setEditingLevelParticipant({ ...p })}
                            className="w-5 h-5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center transition cursor-pointer"
                            title="تعديل بيانات المتسابق ومستواه"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirmLevelParticipant({
                                id: p.id,
                                name: p.name,
                              })
                            }
                            className="w-5 h-5 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center transition cursor-pointer"
                            title="حذف المتسابق"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save / Cancel Bar */}
      <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={handleCancel}
          className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-black transition active:scale-95 flex items-center justify-center cursor-pointer"
        >
          إلغاء التعديلات
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="min-h-[48px] px-6 py-3 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
        >
          <Save size={18} />
          <span>حفظ إعدادات المستويات</span>
        </button>
      </div>

      {/* تأكيد حذف المستوى */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmLevel}
        title="تأكيد حذف المستوى"
        message="هل أنت متأكد من حذف هذا المستوى؟ سيتم مسح جميع معاييره وبنود الخصم المرتبطة به."
        itemTitle={deleteConfirmLevel?.name}
        confirmLabel="نعم، حذف المستوى"
        onConfirm={() => {
          if (deleteConfirmLevel) {
            removeLevel(deleteConfirmLevel.id);
            setDeleteConfirmLevel(null);
          }
        }}
        onClose={() => setDeleteConfirmLevel(null)}
      />

      {/* تأكيد حذف بند الخصم */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmError}
        title="تأكيد حذف بند الخصم"
        message="هل أنت متأكد من حذف هذا البند من بنود الخصم والأخطاء في هذه المسابقة؟"
        itemTitle={deleteConfirmError?.name}
        confirmLabel="نعم، حذف البند"
        onConfirm={() => {
          if (deleteConfirmError) {
            const nextErrors = compErrors.filter(
              er => er.id !== deleteConfirmError.id
            );
            updateCompetitionErrorsAndCategories(nextErrors, compErrorCategories);
            setDeleteConfirmError(null);
          }
        }}
        onClose={() => setDeleteConfirmError(null)}
      />

      {/* تأكيد حذف المتسابق من المستوى */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmLevelParticipant}
        title="تأكيد حذف المتسابق من هذا المستوى"
        message="هل أنت متأكد من إزالة هذا المتسابق؟"
        itemTitle={deleteConfirmLevelParticipant?.name}
        confirmLabel="نعم، إزالة المتسابق"
        onConfirm={() => {
          if (deleteConfirmLevelParticipant) {
            handleRemoveParticipantFromLevel(deleteConfirmLevelParticipant.id);
            setDeleteConfirmLevelParticipant(null);
          }
        }}
        onClose={() => setDeleteConfirmLevelParticipant(null)}
      />

      {/* نافذة تعديل بيانات المتسابق من داخل المستوى (اختيار المستوى من قائمة مستويات المسابقة) */}
      {editingLevelParticipant && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setEditingLevelParticipant(null)}
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!editingLevelParticipant.name.trim()) {
                context?.showToast('يرجى إدخال اسم المتسابق', 'error');
                return;
              }
              const targetLvl = levels.find(
                l => Number(l.id) === Number(editingLevelParticipant.levelId)
              );
              const updatedParticipant: CompetitionParticipant = {
                ...editingLevelParticipant,
                name: editingLevelParticipant.name.trim(),
                levelId: Number(editingLevelParticipant.levelId),
                juzsOrSurahs: targetLvl?.juzsOrSurahs || editingLevelParticipant.juzsOrSurahs,
              };
              const updatedParticipants = (comp.participants || []).map(p =>
                Number(p.id) === Number(updatedParticipant.id) ? updatedParticipant : p
              );
              const updatedEvaluations = (comp.evaluations || []).map(ev =>
                Number(ev.participantId) === Number(updatedParticipant.id)
                  ? { ...ev, levelId: Number(updatedParticipant.levelId) }
                  : ev
              );
              onUpdate({
                ...comp,
                levels,
                participants: updatedParticipants,
                evaluations: updatedEvaluations,
              });
              setEditingLevelParticipant(null);
              context?.showToast(`تم تحديث بيانات المتسابق «${updatedParticipant.name}» بنجاح!`, 'success');
            }}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl text-right"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <Edit size={18} />
                </div>
                <div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white">
                    تعديل بيانات المتسابق
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    اختر مستوى المتسابق من قائمة المستويات المدرجة في هذه المسابقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLevelParticipant(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم المتسابق
                </label>
                <input
                  type="text"
                  value={editingLevelParticipant.name}
                  onChange={e =>
                    setEditingLevelParticipant({
                      ...editingLevelParticipant,
                      name: e.target.value,
                    })
                  }
                  className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                  تحديد المستوى (من قائمة المستويات المدرجة في المسابقة)
                </label>
                <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                  {levels.map(lvl => {
                    const isSelected =
                      Number(editingLevelParticipant.levelId) === Number(lvl.id);
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() =>
                          setEditingLevelParticipant({
                            ...editingLevelParticipant,
                            levelId: lvl.id,
                            juzsOrSurahs: lvl.juzsOrSurahs,
                          })
                        }
                        className={`w-full p-3 rounded-xl border-2 text-right transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs sm:text-sm">{lvl.name}</div>
                          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            {formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {isSelected ? 'محدد ✓' : 'اختيار'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                className="min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <Save size={16} />
                <span>حفظ التعديلات</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingLevelParticipant(null)}
                className="min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CompetitionEvaluators({
  comp,
  onUpdate,
  onOpenEvaluatorsPage,
}: {
  comp: Competition;
  onUpdate: (c: Competition) => void;
  onOpenEvaluatorsPage?: () => void;
}) {
  const context = useContext(AppContext);
  const globalEvaluators = context?.globalEvaluators || [];

  const [selectedGlobalId, setSelectedGlobalId] = useState<string>('');
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [deleteConfirmEval, setDeleteConfirmEval] = useState<CompetitionEvaluator | null>(null);
  const [editingEval, setEditingEval] = useState<CompetitionEvaluator | null>(null);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [selectedGlobalIds, setSelectedGlobalIds] = useState<number[]>([]);

  const selectedGlobalEvaluator = globalEvaluators.find(
    g => String(g.id) === selectedGlobalId
  );

  const isSelectedAlreadyInComp = selectedGlobalEvaluator
    ? (comp.evaluators || []).some(
        e => e.name.trim().toLowerCase() === selectedGlobalEvaluator.name.trim().toLowerCase()
      )
    : false;

  // عند اختيار مقيم معتمد من القائمة المنسدلة
  const handleSelectGlobalEvaluator = (idStr: string) => {
    setSelectedGlobalId(idStr);
    if (!idStr) {
      setSelectedLevels([]);
      return;
    }

    const found = globalEvaluators.find(g => String(g.id) === idStr);
    if (found) {
      // للتحقق مما إذا كان المقيم مضافاً سابقاً للتعرف على مستوياته المسندة
      const existingInComp = (comp.evaluators || []).find(
        e => e.name.trim().toLowerCase() === found.name.trim().toLowerCase()
      );

      if (existingInComp && existingInComp.levelIds && existingInComp.levelIds.length > 0) {
        setSelectedLevels(existingInComp.levelIds);
      } else {
        // بالافتراضي تحديد كافة المستويات
        setSelectedLevels((comp.levels || []).map(l => l.id));
      }
    }
  };

  const handleAssignFromDropdown = () => {
    if (!selectedGlobalEvaluator) {
      context?.showToast('الرجاء اختيار مقيم من القائمة المنسدلة أولاً', 'error');
      return;
    }

    const assignedLevelIds =
      selectedLevels.length > 0
        ? selectedLevels
        : (comp.levels || []).map(l => l.id);

    const existingIndex = (comp.evaluators || []).findIndex(
      e =>
        e.name.trim().toLowerCase() ===
        selectedGlobalEvaluator.name.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      // تحديث المستويات المسندة للمقيم في المسابقة
      const updated = [...(comp.evaluators || [])];
      updated[existingIndex] = {
        ...updated[existingIndex],
        pin: selectedGlobalEvaluator.pin,
        levelIds: assignedLevelIds,
      };
      onUpdate({ ...comp, evaluators: updated });
      context?.showToast(
        `تم تحديث المستويات المسندة للمقيم (${selectedGlobalEvaluator.name}) في المسابقة بنجاح!`,
        'success'
      );
    } else {
      // اختيار وإسناد المقيم للمسابقة من القائمة
      const newEval: CompetitionEvaluator = {
        id: Date.now(),
        name: selectedGlobalEvaluator.name.trim(),
        pin: selectedGlobalEvaluator.pin,
        levelIds: assignedLevelIds,
      };
      onUpdate({ ...comp, evaluators: [...(comp.evaluators || []), newEval] });
      context?.showToast(
        `تم اختيار المقيم (${selectedGlobalEvaluator.name}) وإدراجه في المسابقة بالمستويات المحددة!`,
        'success'
      );
    }

    // إعادة ضبط الاختيار
    setSelectedGlobalId('');
    setSelectedLevels([]);
  };

  // استيراد المحددين من القائمة العامة للمسابقة الحالية
  const handleImportFromGlobal = () => {
    if (selectedGlobalIds.length === 0) {
      context?.showToast('يرجى تحديد مقيم واحد على الأقل من القائمة', 'error');
      return;
    }

    const currentList = comp.evaluators || [];
    const defaultLevelIds = (comp.levels || []).map(l => l.id);

    let addedCount = 0;
    const nextList = [...currentList];

    selectedGlobalIds.forEach(id => {
      const gEval = globalEvaluators.find(g => g.id === id);
      if (!gEval) return;
      if (!nextList.some(e => e.name.trim().toLowerCase() === gEval.name.trim().toLowerCase())) {
        nextList.push({
          id: Date.now() + Math.floor(Math.random() * 10000),
          name: gEval.name,
          pin: gEval.pin,
          levelIds: defaultLevelIds,
        });
        addedCount++;
      }
    });

    onUpdate({ ...comp, evaluators: nextList });
    setShowGlobalModal(false);
    setSelectedGlobalIds([]);
    context?.showToast(`تم اختيار وإدراج (${addedCount}) مقيم من القائمة إلى هذه المسابقة!`, 'success');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEval) return;

    const updated = (comp.evaluators || []).map(ev =>
      ev.id === editingEval.id ? editingEval : ev
    );
    onUpdate({ ...comp, evaluators: updated });
    setEditingEval(null);
    context?.showToast('تم تحديث المستويات المسندة للمقيم بنجاح!', 'success');
  };

  const handleQuickToggleEditAllowedLevel = (ev: CompetitionEvaluator, lvlId: number) => {
    const currentAllowed = ev.allowedEditLevelIds || [];
    const isAllowed = currentAllowed.includes(lvlId);
    const nextAllowed = isAllowed
      ? currentAllowed.filter(id => id !== lvlId)
      : [...currentAllowed, lvlId];

    const updated = (comp.evaluators || []).map(item =>
      item.id === ev.id ? { ...item, allowedEditLevelIds: nextAllowed } : item
    );
    onUpdate({ ...comp, evaluators: updated });
    const lvlName = (comp.levels || []).find(l => l.id === lvlId)?.name || `المستوى ${lvlId}`;
    context?.showToast(
      isAllowed
        ? `تم قفل تعديل التقييمات للمقيم (${ev.name}) في (${lvlName})`
        : `تم السماح للمقيم (${ev.name}) بتعديل التقييمات بعد الحفظ في (${lvlName})!`,
      isAllowed ? 'info' : 'success'
    );
  };

  const handleToggleAllEditAllowed = (ev: CompetitionEvaluator, allowAll: boolean) => {
    const assigned = ev.levelIds && ev.levelIds.length > 0 ? ev.levelIds : (comp.levels || []).map(l => l.id);
    const nextAllowed = allowAll ? [...assigned] : [];
    const updated = (comp.evaluators || []).map(item =>
      item.id === ev.id ? { ...item, allowedEditLevelIds: nextAllowed } : item
    );
    onUpdate({ ...comp, evaluators: updated });
    context?.showToast(
      allowAll
        ? `تم فتح صلاحية تعديل التقييمات للمقيم (${ev.name}) في كافة المستويات المسندة إليه!`
        : `تم قفل تعديل التقييمات للمقيم (${ev.name}) في جميع المستويات (مقفل بعد الحفظ).`,
      allowAll ? 'success' : 'info'
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* بطاقة اختيار المقيمين للمسابقة من القائمة فقط */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-black text-sm sm:text-base text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span>اختيار المقيمين للمسابقة وتحديد المستويات المسندة لهم</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              اختر المقيم من قائمة المقيمين المعتمدين فقط ثم حدد المستويات التي سيحكّمها (إضافة مقيمين جدد تتم من صفحة المقيمين فقط).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedGlobalIds([]);
                setShowGlobalModal(true);
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs sm:text-sm font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Users size={16} />
              <span>اختيار متعدد من القائمة ({globalEvaluators.length})</span>
            </button>

            {onOpenEvaluatorsPage && (
              <button
                type="button"
                onClick={onOpenEvaluatorsPage}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                title="الانتقال إلى صفحة المقيمين المعتمدين لإضافة مقيمين جدد"
              >
                <UserPlus size={15} />
                <span>إدارة وإضافة المقيمين (صفحة المقيمين)</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. القائمة المنسدلة لاختيار المقيمين المعتمدين فقط */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50/60 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700 space-y-3">
          <label className="block text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
            اختر المقيم من قائمة المقيمين المعتمدين:
          </label>
          <select
            value={selectedGlobalId}
            onChange={e => handleSelectGlobalEvaluator(e.target.value)}
            className="w-full min-h-[48px] border-2 border-emerald-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">-- اختر مقيماً من القائمة المنسدلة --</option>
            {globalEvaluators.map(ge => {
              const existingEv = (comp.evaluators || []).find(
                e => e.name.trim().toLowerCase() === ge.name.trim().toLowerCase()
              );
              const existingLevelsInfo = existingEv
                ? getEvaluatorAssignedLevelsInfo(
                    existingEv,
                    comp.levels || [],
                    comp.participants || []
                  )
                : null;
              return (
                <option key={ge.id} value={ge.id}>
                  {ge.name} (رمز الدخول: {ge.pin})
                  {existingLevelsInfo
                    ? ` - [مشارك في: ${existingLevelsInfo.assignedLevelNames.join('، ') || 'كافة المستويات'}]`
                    : ''}
                </option>
              );
            })}
          </select>

          {selectedGlobalEvaluator && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  المقيم المختار:
                </span>
                <span className="text-sm font-black text-emerald-950 dark:text-white">
                  {selectedGlobalEvaluator.name}
                </span>
                {isSelectedAlreadyInComp && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-black">
                    مضاف مسبقاً (سيتم تحديث مستوياته)
                  </span>
                )}
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-xs font-mono font-black border border-amber-300/70">
                رمز الدخول: {selectedGlobalEvaluator.pin}
              </span>
            </div>
          )}

          {globalEvaluators.length === 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
              <p className="text-xs text-amber-900 dark:text-amber-300 font-bold">
                لا يوجد مقيمون مسجلون في القائمة حالياً. يرجى إضافتهم أولاً من صفحة "المقيمون المعتمدون".
              </p>
              {onOpenEvaluatorsPage && (
                <button
                  type="button"
                  onClick={onOpenEvaluatorsPage}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition cursor-pointer shrink-0"
                >
                  الانتقال لصفحة المقيمين
                </button>
              )}
            </div>
          )}
        </div>

        {/* 2. تحديد المستويات المسندة للمقيم المختار */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
              تحديد المستوى أو المستويات التي سيقوم بتحكيمها ({selectedLevels.length} محدد):
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedLevels((comp.levels || []).map(l => l.id))}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer"
              >
                تحديد كافة المستويات
              </button>
              <button
                type="button"
                onClick={() => setSelectedLevels([])}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {(comp.levels || []).map(l => {
              const checked = selectedLevels.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    if (checked) {
                      setSelectedLevels(selectedLevels.filter(id => id !== l.id));
                    } else {
                      setSelectedLevels([...selectedLevels, l.id]);
                    }
                  }}
                  className={`min-h-[46px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between transition active:scale-95 cursor-pointer ${
                    checked
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Check
                      size={16}
                      className={checked ? 'opacity-100' : 'opacity-30'}
                    />
                    <span className="truncate">{l.name}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold shrink-0 ${
                    checked ? 'bg-emerald-800 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {l.juzsOrSurahs}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedLevels.length === 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold pt-1">
              ⚠️ تنبيه: عند عدم تحديد أي مستوى، سيتم إسناد كافة المستويات تلقائياً للمقيم المختار.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!selectedGlobalEvaluator}
          onClick={handleAssignFromDropdown}
          className="w-full sm:w-auto min-h-[48px] bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
        >
          <Check size={18} />
          <span>
            {isSelectedAlreadyInComp
              ? 'تحديث مستويات المقيم المختار في المسابقة'
              : 'اعتماد المقيم المختار في هذه المسابقة'}
          </span>
        </button>
      </div>

      {/* عرض قائمة مقيمي المسابقة المسجلين حالياً مع تقسيم المستويات وأزرار التصدير */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-emerald-50/70 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-emerald-200/80 dark:border-slate-700">
          <div>
            <h4 className="font-black text-sm sm:text-base text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>بيانات مقيمي المسابقة وتوزيع مستوياتهم ({(comp.evaluators || []).length})</span>
            </h4>
            <p className="text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              يظهر أمام كل مقيم المستويات المسندة إليه، ويمكنك الضغط على أي مستوى لتفعيله أو إلغائه مباشرة أو تصدير التقسيم.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportCompetitionSetupExcel(comp, context?.showToast)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>تصدير الإعدادات Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportCompetitionSetupPDF(comp, context?.showToast)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs cursor-pointer"
            >
              <Printer size={15} />
              <span>تصدير / طباعة PDF</span>
            </button>
          </div>
        </div>

        {/* Mobile Cards for Evaluators */}
        <div className="md:hidden space-y-2.5">
          {(comp.evaluators || []).map((ev, idx) => {
            const info = getEvaluatorAssignedLevelsInfo(
              ev,
              comp.levels || [],
              comp.participants || []
            );

            const handleQuickToggleLevel = (lvlId: number) => {
              const allIds = (comp.levels || []).map(l => l.id);
              const currentIds =
                ev.levelIds && ev.levelIds.length > 0 ? ev.levelIds : allIds;
              const isAssigned = currentIds.includes(lvlId);
              const nextIds = isAssigned
                ? currentIds.filter(id => id !== lvlId)
                : [...currentIds, lvlId];

              if (nextIds.length === 0) {
                context?.showToast('يجب أن يكون للمقيم مستوى واحد على الأقل مسنداً إليه', 'error');
                return;
              }
              const updated = (comp.evaluators || []).map(item =>
                item.id === ev.id ? { ...item, levelIds: nextIds } : item
              );
              onUpdate({ ...comp, evaluators: updated });
            };

            return (
              <div
                key={ev.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate">
                        {ev.name}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                        رمز الدخول: {ev.pin}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 text-[11px] font-black border border-amber-200 dark:border-amber-800">
                        {info.assignedLevels.length} مستويات ({info.participantsCount} متسابق)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingEval(ev)}
                      className="min-h-[38px] px-2.5 text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40 rounded-xl flex items-center justify-center gap-1 transition active:scale-95 font-bold cursor-pointer"
                      title="تعديل المقيم والمستويات المسندة له"
                    >
                      <Edit size={14} />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmEval(ev)}
                      className="min-h-[38px] min-w-[38px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                      title="حذف المقيم"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-emerald-900 dark:text-emerald-300">
                      المستويات المسندة ({info.assignedLevelNames.join(' ، ') || 'لا يوجد'}):
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(comp.levels || []).map(lvl => {
                      const isAssigned = info.assignedLevels.some(al => al.id === lvl.id);
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleQuickToggleLevel(lvl.id)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                            isAssigned
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                          title="اضغط لتفعيل أو إلغاء هذا المستوى للمقيم"
                        >
                          <Check size={13} className={isAssigned ? 'opacity-100' : 'opacity-25'} />
                          <span>{lvl.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* بطاقة التحكم بصلاحية تعديل التقييمات بعد الحفظ على الهاتف (ملونة ومميزة) */}
                <div className="bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-amber-50/50 dark:from-indigo-950/60 dark:via-purple-950/30 dark:to-amber-950/20 border-2 border-indigo-200 dark:border-indigo-800/80 p-3 rounded-2xl shadow-xs space-y-2.5 mt-2">
                  <div className="flex items-center justify-between gap-2 border-b border-indigo-100 dark:border-indigo-900/60 pb-2">
                    <span className="text-[11px] font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <span className="p-1 rounded-lg bg-indigo-600 text-white shrink-0">
                        <Lock size={12} />
                      </span>
                      <span>صلاحية تعديل التقييمات بعد الحفظ:</span>
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleToggleAllEditAllowed(ev, true)}
                        className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-2xs flex items-center gap-1 cursor-pointer transition active:scale-95"
                      >
                        <Unlock size={10} />
                        <span>السماح للكل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAllEditAllowed(ev, false)}
                        className="px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 font-black shadow-2xs flex items-center gap-1 cursor-pointer transition active:scale-95"
                      >
                        <Lock size={10} />
                        <span>قفل الكل</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {info.assignedLevels.map(lvl => {
                      const isAllowed = (ev.allowedEditLevelIds || []).includes(lvl.id);
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleQuickToggleEditAllowedLevel(ev, lvl.id)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition active:scale-95 cursor-pointer border-2 shadow-2xs ${
                            isAllowed
                              ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 dark:from-emerald-950 dark:to-emerald-900/80 text-emerald-950 dark:text-emerald-100 border-emerald-500 font-black'
                              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                          title={isAllowed ? 'مسموح بالتعديل بعد الحفظ (اضغط للقفل)' : 'مقفل بعد الحفظ (اضغط للسماح بالتعديل)'}
                        >
                          {isAllowed ? (
                            <Unlock size={11} className="text-emerald-600 shrink-0" />
                          ) : (
                            <Lock size={11} className="text-slate-400 shrink-0" />
                          )}
                          <span>{lvl.name}</span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                              isAllowed
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isAllowed ? 'مسموح' : 'مقفل'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {(comp.evaluators || []).length === 0 && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold">
              لا يوجد مقيمون مضافون لهذه المسابقة حالياً. اختر من القائمة المنسدلة بالأعلى لإضافتهم.
            </div>
          )}
        </div>

        {/* Desktop Table for Evaluators */}
        <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">
              <tr>
                <th className="p-3.5 border-b dark:border-slate-700 w-12 text-center">#</th>
                <th className="p-3.5 border-b dark:border-slate-700">اسم المقيم</th>
                <th className="p-3.5 border-b dark:border-slate-700">رمز الدخول</th>
                <th className="p-3.5 border-b dark:border-slate-700">المستويات المسندة للمقيم (اضغط للتبديل السريع)</th>
                <th className="p-3.5 border-b dark:border-slate-700">صلاحية التعديل بعد الحفظ (بإذن المشرف)</th>
                <th className="p-3.5 border-b dark:border-slate-700 text-center">المتسابقون</th>
                <th className="p-3.5 border-b dark:border-slate-700 w-36 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(comp.evaluators || []).map((ev, idx) => {
                const info = getEvaluatorAssignedLevelsInfo(
                  ev,
                  comp.levels || [],
                  comp.participants || []
                );

                const handleQuickToggleLevel = (lvlId: number) => {
                  const allIds = (comp.levels || []).map(l => l.id);
                  const currentIds =
                    ev.levelIds && ev.levelIds.length > 0 ? ev.levelIds : allIds;
                  const isAssigned = currentIds.includes(lvlId);
                  const nextIds = isAssigned
                    ? currentIds.filter(id => id !== lvlId)
                    : [...currentIds, lvlId];

                  if (nextIds.length === 0) {
                    context?.showToast('يجب أن يكون للمقيم مستوى واحد على الأقل مسنداً إليه', 'error');
                    return;
                  }
                  const updated = (comp.evaluators || []).map(item =>
                    item.id === ev.id ? { ...item, levelIds: nextIds } : item
                  );
                  onUpdate({ ...comp, evaluators: updated });
                };

                return (
                  <tr key={ev.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 text-center font-black text-slate-500">{idx + 1}</td>
                    <td className="p-3.5">
                      <span className="font-black text-slate-900 dark:text-white block">{ev.name}</span>
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        {info.assignedLevelNames.join(' ، ') || 'غير محدد'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-emerald-800 dark:text-emerald-300 font-black">
                      {ev.pin}
                    </td>
                    <td className="p-3.5 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex flex-wrap gap-1.5">
                        {(comp.levels || []).map(lvl => {
                          const isAssigned = info.assignedLevels.some(al => al.id === lvl.id);
                          return (
                            <button
                              key={lvl.id}
                              type="button"
                              onClick={() => handleQuickToggleLevel(lvl.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition active:scale-95 cursor-pointer border ${
                                isAssigned
                                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                                  : 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                              }`}
                              title="اضغط لتفعيل أو إلغاء هذا المستوى للمقيم"
                            >
                              <Check size={12} className={isAssigned ? 'opacity-100' : 'opacity-25'} />
                              <span>{lvl.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3 bg-gradient-to-br from-indigo-50/40 via-purple-50/20 to-amber-50/30 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-amber-950/20 border-r border-l border-indigo-100 dark:border-indigo-900/40 text-sm">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {info.assignedLevels.map(lvl => {
                            const isAllowed = (ev.allowedEditLevelIds || []).includes(lvl.id);
                            return (
                              <button
                                key={lvl.id}
                                type="button"
                                onClick={() => handleQuickToggleEditAllowedLevel(ev, lvl.id)}
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-black flex items-center gap-1 transition active:scale-95 cursor-pointer border-2 shadow-2xs ${
                                  isAllowed
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                                }`}
                                title={
                                  isAllowed
                                    ? 'مسموح بالتعديل بعد الحفظ (اضغط للقفل)'
                                    : 'مقفل بعد الحفظ (اضغط للسماح بالتعديل)'
                                }
                              >
                                {isAllowed ? (
                                  <Unlock size={11} className="text-white shrink-0" />
                                ) : (
                                  <Lock size={11} className="text-slate-400 shrink-0" />
                                )}
                                <span>{lvl.name}</span>
                                <span
                                  className={`text-[9px] font-black px-1 rounded ${
                                    isAllowed
                                      ? 'bg-emerald-800/80 text-white'
                                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {isAllowed ? 'مسموح' : 'مقفل'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => handleToggleAllEditAllowed(ev, true)}
                            className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black cursor-pointer transition"
                          >
                            السماح للكل
                          </button>
                          <span className="text-slate-300 dark:text-slate-600">•</span>
                          <button
                            type="button"
                            onClick={() => handleToggleAllEditAllowed(ev, false)}
                            className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 font-black cursor-pointer transition"
                          >
                            قفل الكل
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 text-xs font-black border border-amber-200 dark:border-amber-800">
                        {info.participantsCount} متسابق
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingEval(ev)}
                          className="min-h-[36px] px-2.5 py-1 inline-flex items-center gap-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl transition cursor-pointer text-xs font-bold"
                          title="تعديل المقيم والمستويات المسندة له"
                        >
                          <Edit size={16} />
                          <span>تعديل المستويات</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmEval(ev)}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                          title="حذف المقيم"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(comp.evaluators || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد مقيمون مضافون لهذه المسابقة حالياً. اختر من القائمة المنسدلة بالأعلى لإضافتهم وتحديد مستوياتهم.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* قسم مراجعة تقسيم اللجان حسب المستويات للمشرف (مناسب للهاتف والكمبيوتر) */}
        {(comp.levels || []).length > 0 && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="font-black text-xs sm:text-sm text-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                <Award size={16} className="text-amber-600 shrink-0" />
                <span>مراجعة تقسيم لجان المقيمين حسب المستويات ({(comp.levels || []).length} مستويات)</span>
              </h5>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                يوضح للمشرف أعضاء لجنة التحكيم في كل مستوى
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(comp.levels || []).map(lvl => {
                const levelEvaluators = (comp.evaluators || []).filter(ev => {
                  const info = getEvaluatorAssignedLevelsInfo(
                    ev,
                    comp.levels || [],
                    comp.participants || []
                  );
                  return info.assignedLevels.some(al => al.id === lvl.id);
                });
                const levelParticipantsCount = (comp.participants || []).filter(
                  p => p.levelId === lvl.id
                ).length;

                return (
                  <div
                    key={lvl.id}
                    className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <div>
                        <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white block">
                          {lvl.name}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          النطاق: {lvl.juzsOrSurahs}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black shrink-0">
                        {levelParticipantsCount} متسابق
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        لجنة المقيمين في هذا المستوى ({levelEvaluators.length}):
                      </span>
                      {levelEvaluators.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {levelEvaluators.map(ev => (
                            <span
                              key={ev.id}
                              className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 text-[11px] font-black border border-emerald-200 dark:border-emerald-800"
                            >
                              {ev.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          ⚠️ لم يتم إسناد مقيم لهذا المستوى بعد
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* نافذة تعديل المستويات المسندة للمقيم في المسابقة فقط */}
      {editingEval && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setEditingEval(null)}
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="font-black text-base sm:text-lg text-emerald-950 dark:text-emerald-300">
                تحديد المستويات المسندة للمقيم في المسابقة
              </h4>
              <button
                type="button"
                onClick={() => setEditingEval(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-right">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                    المقيم المختار:
                  </span>
                  <span className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                    {editingEval.name}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-mono text-xs font-black border border-amber-300/70">
                  🔑 {editingEval.pin}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  المستويات المسندة لهذا المقيم في هذه المسابقة:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1.5 border rounded-2xl dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  {(comp.levels || []).map(lvl => {
                    const checked = (editingEval.levelIds || []).includes(lvl.id);
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => {
                          const current = editingEval.levelIds || [];
                          const next = checked
                            ? current.filter(id => id !== lvl.id)
                            : [...current, lvl.id];
                          setEditingEval({ ...editingEval, levelIds: next });
                        }}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-between cursor-pointer ${
                          checked
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span className="truncate">{lvl.name}</span>
                        <Check size={15} className={checked ? 'opacity-100' : 'opacity-30'} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* بطاقة صلاحية تعديل التقييمات بعد الحفظ (ملونة ومميزة مع تمييز كل جزئية بلون خاص) */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-amber-50/60 dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-amber-950/20 border-2 border-indigo-300 dark:border-indigo-700 shadow-md space-y-3.5">
                {/* 1. رأس البطاقة: عنوان مميز بأيقونة مع عداد الصلاحيات وأزرار التحكم السريع */}
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-indigo-100 dark:border-indigo-900/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                      <Lock size={16} />
                    </div>
                    <div>
                      <span className="font-black text-xs sm:text-sm text-indigo-950 dark:text-indigo-200 block">
                        صلاحية تعديل التقييمات بعد الحفظ
                      </span>
                      <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-400">
                        مسموح بالتعديل في ({(editingEval.allowedEditLevelIds || []).length}) مستويات
                      </span>
                    </div>
                  </div>

                  {/* أزرار السماح والقفل السريع الملونة */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allAssigned =
                          editingEval.levelIds && editingEval.levelIds.length > 0
                            ? editingEval.levelIds
                            : (comp.levels || []).map(l => l.id);
                        setEditingEval({ ...editingEval, allowedEditLevelIds: [...allAssigned] });
                      }}
                      className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition active:scale-95 shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Unlock size={12} />
                      <span>السماح للكل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEval({ ...editingEval, allowedEditLevelIds: [] });
                      }}
                      className="px-2.5 py-1 rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800 text-[11px] font-black transition active:scale-95 shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Lock size={12} />
                      <span>قفل الكل</span>
                    </button>
                  </div>
                </div>

                {/* 2. شريط التوجيه والإيضاح بلون أزرق تنبيهي مميز */}
                <div className="p-2.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-blue-950 dark:text-blue-200 text-[11px] font-bold flex items-start gap-2 leading-relaxed">
                  <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>
                    الوضع الافتراضي هو <strong>«مقفل بعد الحفظ»</strong> لحماية الدرجات. اضغط على أي مستوى لفتح إمكانية إعادة التقييم للمقيم فيه.
                  </span>
                </div>

                {/* 3. شبكة المستويات مع تمييز لوني واضح بين المسموح (أخضر) والمقفل (رمادي/أحمر) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 border-2 rounded-2xl dark:border-slate-700 bg-white dark:bg-slate-900 shadow-inner">
                  {(comp.levels || []).map(lvl => {
                    const isAssigned =
                      (editingEval.levelIds || []).length === 0 ||
                      (editingEval.levelIds || []).includes(lvl.id);
                    const isAllowedEdit = (editingEval.allowedEditLevelIds || []).includes(lvl.id);
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        disabled={!isAssigned}
                        onClick={() => {
                          const current = editingEval.allowedEditLevelIds || [];
                          const next = isAllowedEdit
                            ? current.filter(id => id !== lvl.id)
                            : [...current, lvl.id];
                          setEditingEval({ ...editingEval, allowedEditLevelIds: next });
                        }}
                        className={`p-2.5 rounded-xl text-xs font-bold border-2 transition flex items-center justify-between gap-1.5 cursor-pointer ${
                          !isAssigned
                            ? 'opacity-40 bg-slate-100 dark:bg-slate-800/40 text-slate-400 cursor-not-allowed border-dashed border-slate-300 dark:border-slate-700'
                            : isAllowedEdit
                            ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 dark:from-emerald-950/80 dark:to-emerald-900/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 font-black shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <span className="truncate">{lvl.name}</span>
                        {isAllowedEdit ? (
                          <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-md font-black text-[10px] flex items-center gap-1 shrink-0 shadow-2xs">
                            <Unlock size={11} />
                            <span>مسموح بالتعديل</span>
                          </span>
                        ) : (
                          <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-bold text-[10px] flex items-center gap-1 shrink-0">
                            <Lock size={11} />
                            <span>مقفل</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                className="min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-xs"
              >
                حفظ الإعدادات والصلاحيات
              </button>
              <button
                type="button"
                onClick={() => setEditingEval(null)}
                className="min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* نافذة تأكيد حذف المقيم */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmEval}
        title="تأكيد حذف المقيم"
        message="هل أنت متأكد من حذف هذا المقيم من المسابقة؟ لن يتمكن من تسجيل الدخول أو التقييم بعد حذفه."
        itemTitle={deleteConfirmEval?.name}
        confirmLabel="نعم، حذف المقيم"
        onConfirm={() => {
          if (deleteConfirmEval) {
            onUpdate({
              ...comp,
              evaluators: (comp.evaluators || []).filter(
                x => x.id !== deleteConfirmEval.id
              ),
            });
            setDeleteConfirmEval(null);
          }
        }}
        onClose={() => setDeleteConfirmEval(null)}
      />

      {/* نافذة استيراد جملة من المقيمين من السجل العام */}
      {showGlobalModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setShowGlobalModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl text-right"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-black text-base sm:text-lg text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
                  <Users size={18} className="text-amber-500" />
                  <span>تحديد جملة من السجل العام للمقيمين المعتمدين</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  حدد المقيمين الذين ترغب بإضافتهم دفعة واحدة لمسابقة "{comp.name}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGlobalModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 p-1">
              {globalEvaluators.map(gEval => {
                const isAlreadyInComp = (comp.evaluators || []).some(
                  e => e.name.trim().toLowerCase() === gEval.name.trim().toLowerCase()
                );
                const isChecked = selectedGlobalIds.includes(gEval.id);

                return (
                  <div
                    key={gEval.id}
                    onClick={() => {
                      if (isAlreadyInComp) return;
                      if (isChecked) {
                        setSelectedGlobalIds(selectedGlobalIds.filter(id => id !== gEval.id));
                      } else {
                        setSelectedGlobalIds([...selectedGlobalIds, gEval.id]);
                      }
                    }}
                    className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isAlreadyInComp
                        ? 'opacity-50 border-slate-200 bg-slate-100 dark:bg-slate-800/40 cursor-not-allowed'
                        : isChecked
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        disabled={isAlreadyInComp}
                        checked={isChecked || isAlreadyInComp}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                      />
                      <div>
                        <span className="font-black text-sm text-slate-900 dark:text-white block">
                          {gEval.name}
                        </span>
                        {gEval.notes && (
                          <span className="text-[11px] text-slate-500 font-medium block">
                            {gEval.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-xs font-mono font-bold">
                      🔑 {gEval.pin}
                    </span>
                  </div>
                );
              })}

              {globalEvaluators.length === 0 && (
                <div className="p-8 text-center text-slate-400 font-bold text-sm">
                  لا يوجد مقيمون في السجل العام حالياً. يمكنك إضافتهم أولاً من تبويب "المقيمون المعتمدون".
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                تم تحديد ({selectedGlobalIds.length}) مقيم
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGlobalModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  onClick={handleImportFromGlobal}
                  disabled={selectedGlobalIds.length === 0}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-sm active:scale-95 disabled:opacity-40"
                >
                  إدراج المحددين للمسابقة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitionParticipants({
  comp,
  onUpdate,
}: {
  comp: Competition;
  onUpdate: (c: Competition) => void;
}) {
  const [namesText, setNamesText] = useState('');
  const [levelId, setLevelId] = useState<number>(comp.levels[0]?.id || 0);
  const [deleteConfirmParticipant, setDeleteConfirmParticipant] = useState<CompetitionParticipant | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<CompetitionParticipant | null>(null);

  // فلاتر التصفية المتعددة لحقول المشاركين
  const [selectedLevelsFilter, setSelectedLevelsFilter] = useState<string[]>([]);
  const [selectedWilayatsFilter, setSelectedWilayatsFilter] = useState<string[]>([]);
  const [selectedGendersFilter, setSelectedGendersFilter] = useState<string[]>([]);
  const [selectedNamesFilter, setSelectedNamesFilter] = useState<string[]>([]);
  const [selectedReqNumsFilter, setSelectedReqNumsFilter] = useState<string[]>([]);
  const [selectedCivilIdsFilter, setSelectedCivilIdsFilter] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const context = useContext(AppContext);

  const handleSaveParticipantEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant || !editingParticipant.name.trim()) {
      context?.showToast('يرجى إدخال اسم المشارك', 'error');
      return;
    }

    const chosenLevel = (comp.levels || []).find(
      l => Number(l.id) === Number(editingParticipant.levelId)
    );

    const updatedParticipant: CompetitionParticipant = {
      ...editingParticipant,
      name: editingParticipant.name.trim(),
      levelId: Number(editingParticipant.levelId),
      juzsOrSurahs: chosenLevel?.juzsOrSurahs || editingParticipant.juzsOrSurahs?.trim() || undefined,
      requestNumber: editingParticipant.requestNumber?.trim() || undefined,
      civilId: editingParticipant.civilId?.trim() || undefined,
      phone: editingParticipant.phone?.trim() || undefined,
      gender: editingParticipant.gender?.trim() || undefined,
      wilayat: editingParticipant.wilayat?.trim() || undefined,
      registrationDate: editingParticipant.registrationDate?.trim() || undefined,
    };

    const updatedParticipants = (comp.participants || []).map(p =>
      Number(p.id) === Number(updatedParticipant.id) ? updatedParticipant : p
    );

    const updatedEvaluations = (comp.evaluations || []).map(ev =>
      Number(ev.participantId) === Number(updatedParticipant.id)
        ? { ...ev, levelId: Number(updatedParticipant.levelId) }
        : ev
    );

    onUpdate({
      ...comp,
      participants: updatedParticipants,
      evaluations: updatedEvaluations,
    });
    setEditingParticipant(null);
    context?.showToast(`تم حفظ تعديلات المشارك «${updatedParticipant.name}» بنجاح!`, 'success');
  };

  const selectedLevel = (comp.levels || []).find(l => l.id === Number(levelId));

  const parsedLines = namesText
    .split(/\r?\n/)
    .map(cleanParticipantLine)
    .filter(Boolean);

  const handleAdd = () => {
    if (parsedLines.length === 0 || !levelId) {
      context?.showToast('يرجى كتابة أو لصق اسم متسابق واحد على الأقل', 'error');
      return;
    }

    const baseId = Date.now();
    const newParts: CompetitionParticipant[] = parsedLines.map((pName, idx) => ({
      id: baseId + idx,
      name: pName,
      levelId: Number(levelId),
      juzsOrSurahs: selectedLevel?.juzsOrSurahs,
    }));

    onUpdate({
      ...comp,
      participants: [...(comp.participants || []), ...newParts],
    });
    setNamesText('');
    context?.showToast(
      `تمت إضافة ${newParts.length} متسابق بنجاح`,
      'success'
    );
  };

  const handleExportTemplate = () => {
    downloadCompetitionExcelTemplate(comp);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const { updatedLevels, newParticipants, addedLevelsCount } =
          parseAndImportCompetitionExcel(ws, comp, comp.levels || []);

        if (newParticipants.length > 0) {
          onUpdate({
            ...comp,
            isActive: true,
            levels: updatedLevels,
            participants: [...(comp.participants || []), ...newParticipants],
          });
          context?.showToast(
            addedLevelsCount > 0
              ? `تم استيراد ${newParticipants.length} متسابق وتفعيل المستويات وإضافة (${addedLevelsCount}) مستويات جديدة من ملف الإكسل!`
              : `تم استيراد ${newParticipants.length} متسابق وتوزيعهم على المستويات الموافقة في الاسم بنجاح!`,
            'success'
          );
        } else {
          context?.showToast(
            'لم يتم العثور على بيانات صحيحة في الملف.',
            'error'
          );
        }
      } catch {
        context?.showToast('حدث خطأ أثناء قراءة ملف الإكسل', 'error');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const allParticipants = comp.participants || [];

  // خيارات الفلاتر المتعددة للمشاركين
  const levelOptions = React.useMemo(
    () =>
      (comp.levels || []).map(l => ({
        value: String(l.id),
        label: l.name,
        count: allParticipants.filter(p => Number(p.levelId) === Number(l.id)).length,
      })),
    [comp.levels, allParticipants]
  );

  const wilayatOptions = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allParticipants.forEach(p => {
      const w = (p.wilayat || '').trim();
      if (w) counts[w] = (counts[w] || 0) + 1;
    });
    return Object.entries(counts).map(([val, cnt]) => ({
      value: val,
      label: val,
      count: cnt,
    }));
  }, [allParticipants]);

  const genderOptions = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allParticipants.forEach(p => {
      const g = (p.gender || '').trim();
      if (g) counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([val, cnt]) => ({
      value: val,
      label: val,
      count: cnt,
    }));
  }, [allParticipants]);

  const nameOptions = React.useMemo(
    () =>
      allParticipants.map(p => ({
        value: p.name,
        label: p.name,
      })),
    [allParticipants]
  );

  const reqNumOptions = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allParticipants.forEach(p => {
      const rn = (p.requestNumber || '').trim();
      if (rn) counts[rn] = (counts[rn] || 0) + 1;
    });
    return Object.entries(counts).map(([val, cnt]) => ({
      value: val,
      label: val,
      count: cnt,
    }));
  }, [allParticipants]);

  const civilIdOptions = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allParticipants.forEach(p => {
      const cid = (p.civilId || '').trim();
      if (cid) counts[cid] = (counts[cid] || 0) + 1;
    });
    return Object.entries(counts).map(([val, cnt]) => ({
      value: val,
      label: val,
      count: cnt,
    }));
  }, [allParticipants]);

  const filteredParticipantsList = React.useMemo(() => {
    return allParticipants.filter(p => {
      if (
        selectedLevelsFilter.length > 0 &&
        !selectedLevelsFilter.includes(String(p.levelId))
      ) {
        return false;
      }
      if (
        selectedWilayatsFilter.length > 0 &&
        !selectedWilayatsFilter.includes((p.wilayat || '').trim())
      ) {
        return false;
      }
      if (
        selectedGendersFilter.length > 0 &&
        !selectedGendersFilter.includes((p.gender || '').trim())
      ) {
        return false;
      }
      if (
        selectedNamesFilter.length > 0 &&
        !selectedNamesFilter.includes(p.name)
      ) {
        return false;
      }
      if (
        selectedReqNumsFilter.length > 0 &&
        !selectedReqNumsFilter.includes((p.requestNumber || '').trim())
      ) {
        return false;
      }
      if (
        selectedCivilIdsFilter.length > 0 &&
        !selectedCivilIdsFilter.includes((p.civilId || '').trim())
      ) {
        return false;
      }
      return true;
    });
  }, [
    allParticipants,
    selectedLevelsFilter,
    selectedWilayatsFilter,
    selectedGendersFilter,
    selectedNamesFilter,
    selectedReqNumsFilter,
    selectedCivilIdsFilter,
  ]);

  const hasActiveParticipantFilters =
    selectedLevelsFilter.length > 0 ||
    selectedWilayatsFilter.length > 0 ||
    selectedGendersFilter.length > 0 ||
    selectedNamesFilter.length > 0 ||
    selectedReqNumsFilter.length > 0 ||
    selectedCivilIdsFilter.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                أسماء المتسابقين (يقبل كتابة أو لصق عدة أسماء - كل سطر اسم)
              </label>
              {parsedLines.length > 0 && (
                <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                  العدد: {parsedLines.length}
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={namesText}
              onChange={e => setNamesText(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs sm:text-sm leading-relaxed focus:ring-2 focus:ring-emerald-600"
              placeholder={`اكتب اسم متسابق أو الصق قائمة أسماء (كل سطر اسم)...`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
              المستوى المشارك فيه (من قائمة المستويات المدرجة في المسابقة)
            </label>
            <select
              value={levelId}
              onChange={e => {
                setLevelId(Number(e.target.value));
              }}
              className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-sm"
            >
              {(comp.levels || []).map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} — ({formatJuzsOrSurahsDisplay(l.juzsOrSurahs)})
                </option>
              ))}
            </select>
            {selectedLevel && (
              <div className="px-3 py-2 rounded-xl bg-emerald-50/80 dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                مقرر المستوى المحدد تلقائياً: <strong>{formatJuzsOrSurahsDisplay(selectedLevel.juzsOrSurahs)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleAdd}
            className="w-full sm:w-auto min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
          >
            <Plus size={18} />
            <span>
              إضافة المتسابقين
              {parsedLines.length > 0 ? ` (${parsedLines.length})` : ''}
            </span>
          </button>

          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              onClick={handleExportTemplate}
              className="min-h-[46px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 text-xs sm:text-sm transition active:scale-95 cursor-pointer"
              title="تحميل قالب إكسل المعتمد بالحقول الـ 8 مرتبة من اليمين إلى اليسار"
            >
              <Download size={16} className="shrink-0" />
              <span>تحميل قالب الإكسل المعتمد</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[46px] bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs sm:text-sm transition active:scale-95 shadow-xs cursor-pointer"
            >
              <Upload size={16} className="shrink-0" />
              <span>استيراد إكسل وتفعيل المستويات</span>
            </button>
            <input
              type="file"
              accept=".xlsx, .xls"
              ref={fileInputRef}
              onChange={handleImportExcel}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* شريط التصفية المتعدد الحقول للمشاركين */}
      {allParticipants.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-emerald-700 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                أدوات التصفية المتعددة للمشاركين ({filteredParticipantsList.length} من {allParticipants.length})
              </span>
            </div>
            {hasActiveParticipantFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedLevelsFilter([]);
                  setSelectedWilayatsFilter([]);
                  setSelectedGendersFilter([]);
                  setSelectedNamesFilter([]);
                  setSelectedReqNumsFilter([]);
                  setSelectedCivilIdsFilter([]);
                }}
                className="px-3 py-1 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-black cursor-pointer"
              >
                إلغاء جميع الفلاتر (عرض الكل)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
            <MultiSelectFilterDropdown
              label="مستوى المشاركة"
              options={levelOptions}
              selectedValues={selectedLevelsFilter}
              onChange={setSelectedLevelsFilter}
              placeholder="بحث في المستويات..."
            />
            <MultiSelectFilterDropdown
              label="الاسم الكامل"
              options={nameOptions}
              selectedValues={selectedNamesFilter}
              onChange={setSelectedNamesFilter}
              placeholder="بحث باسم المشارك..."
            />
            <MultiSelectFilterDropdown
              label="الولاية"
              options={wilayatOptions}
              selectedValues={selectedWilayatsFilter}
              onChange={setSelectedWilayatsFilter}
              placeholder="بحث في الولايات..."
            />
            <MultiSelectFilterDropdown
              label="الجنس"
              options={genderOptions}
              selectedValues={selectedGendersFilter}
              onChange={setSelectedGendersFilter}
              placeholder="بحث في الجنس..."
            />
            <MultiSelectFilterDropdown
              label="رقم الطلب"
              options={reqNumOptions}
              selectedValues={selectedReqNumsFilter}
              onChange={setSelectedReqNumsFilter}
              placeholder="بحث برقم الطلب..."
            />
            <MultiSelectFilterDropdown
              label="الرقم المدني"
              options={civilIdOptions}
              selectedValues={selectedCivilIdsFilter}
              onChange={setSelectedCivilIdsFilter}
              placeholder="بحث بالرقم المدني..."
            />
          </div>
        </div>
      )}

      {/* Mobile Cards for Participants */}
      <div className="md:hidden space-y-2.5">
        {filteredParticipantsList.map(p => {
          const levelObj = (comp.levels || []).find(l => l.id === p.levelId);
          const displayScope = formatJuzsOrSurahsDisplay(
            levelObj?.juzsOrSurahs || p.juzsOrSurahs
          );
          return (
            <div
              key={p.id}
              className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.requestNumber && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-black">
                      طلب #{p.requestNumber}
                    </span>
                  )}
                  <span className="font-black text-base text-slate-900 dark:text-white">
                    {p.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200/70 dark:border-emerald-800">
                    {levelObj?.name}
                  </span>
                  {displayScope && (
                    <span className="text-slate-500 dark:text-slate-400 font-semibold truncate">
                      ({displayScope})
                    </span>
                  )}
                  {p.wilayat && (
                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                      📍 {p.wilayat}
                    </span>
                  )}
                  {p.gender && (
                    <span className="px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-bold">
                      {p.gender}
                    </span>
                  )}
                  {p.phone && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      📞 {p.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingParticipant({ ...p })}
                  className="min-h-[42px] min-w-[42px] text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                  title="تعديل بيانات المشارك"
                >
                  <Edit size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmParticipant(p)}
                  className="min-h-[42px] min-w-[42px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                  title="حذف المشارك"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
        {filteredParticipantsList.length === 0 && (
          <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold">
            لا يوجد مشاركون مطابقون حالياً
          </div>
        )}
      </div>

      {/* Desktop Table for Participants */}
      <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#09152C] text-amber-300 font-black">
              <tr>
                <th className="p-3 border-b border-white/15">رقم الطلب</th>
                <th className="p-3 border-b border-white/15">الاسم الكامل</th>
                <th className="p-3 border-b border-white/15">الرقم المدني</th>
                <th className="p-3 border-b border-white/15">رقم الهاتف</th>
                <th className="p-3 border-b border-white/15">الجنس</th>
                <th className="p-3 border-b border-white/15">الولاية</th>
                <th className="p-3 border-b border-white/15">مستوى المشاركة</th>
                <th className="p-3 border-b border-white/15">المقرر / الأجزاء</th>
                <th className="p-3 border-b border-white/15">وقت وتاريخ التسجيل</th>
                <th className="p-3 border-b border-white/15 w-28 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
              {filteredParticipantsList.map(p => {
                const levelObj = (comp.levels || []).find(l => l.id === p.levelId);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {p.requestNumber || '-'}
                    </td>
                    <td className="p-3 font-black text-slate-900 dark:text-white text-sm">
                      {p.name}
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {p.civilId || '-'}
                    </td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                      {p.phone || '-'}
                    </td>
                    <td className="p-3">
                      {p.gender ? (
                        <span className="px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 text-xs font-black">
                          {p.gender}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3">
                      {p.wilayat ? (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-xs font-black">
                          {p.wilayat}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400 font-black">
                      {levelObj?.name}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {formatJuzsOrSurahsDisplay(levelObj?.juzsOrSurahs || p.juzsOrSurahs) || '-'}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {p.registrationDate || '-'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingParticipant({ ...p })}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 rounded-xl transition cursor-pointer"
                          title="تعديل بيانات المشارك"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmParticipant(p)}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200/80 dark:border-red-900/40 rounded-xl transition cursor-pointer"
                          title="حذف المشارك"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredParticipantsList.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد مشاركون مطابقون حالياً
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة تعديل بيانات المشارك (تضم جميع حقول قالب الإكسل + اختيار المستوى من قائمة المستويات المدرجة في المسابقة) */}
      {editingParticipant && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setEditingParticipant(null)}
        >
          <form
            onSubmit={handleSaveParticipantEdit}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl text-right max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  <Edit size={18} />
                </div>
                <div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white">
                    تعديل بيانات المشارك
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    تعديل البيانات الأساسية وتحديد المستوى من قائمة المستويات المدرجة في المسابقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingParticipant(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.name}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        name: e.target.value,
                      })
                    }
                    className="w-full min-h-[44px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-sm focus:ring-2 focus:ring-emerald-600"
                    placeholder="أدخل الاسم الكامل..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    رقم الطلب
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.requestNumber || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        requestNumber: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="رقم الطلب..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    الرقم المدني
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.civilId || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        civilId: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="الرقم المدني..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    رقم الهاتف
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.phone || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        phone: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="رقم الهاتف..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    الجنس
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.gender || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        gender: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="ذكر / أنثى..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    الولاية
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.wilayat || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        wilayat: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="الولاية..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                    وقت وتاريخ التسجيل
                  </label>
                  <input
                    type="text"
                    value={editingParticipant.registrationDate || ''}
                    onChange={e =>
                      setEditingParticipant({
                        ...editingParticipant,
                        registrationDate: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs"
                    placeholder="وقت وتاريخ التسجيل..."
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                  تحديد مستوى المشاركة (من قائمة المستويات المدرجة في المسابقة)
                </label>
                <select
                  value={editingParticipant.levelId}
                  onChange={e => {
                    const nextLevelId = Number(e.target.value);
                    const nextLevel = (comp.levels || []).find(
                      l => Number(l.id) === nextLevelId
                    );
                    setEditingParticipant({
                      ...editingParticipant,
                      levelId: nextLevelId,
                      juzsOrSurahs: nextLevel?.juzsOrSurahs,
                    });
                  }}
                  className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-sm"
                >
                  {(comp.levels || []).map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} — ({formatJuzsOrSurahsDisplay(l.juzsOrSurahs)})
                    </option>
                  ))}
                </select>

                {/* قائمة بطاقات المستويات المدرجة في المسابقة للاختيار السريع والواضح */}
                <div className="space-y-2 max-h-48 overflow-y-auto pt-1">
                  {(comp.levels || []).map(lvl => {
                    const isSelected =
                      Number(editingParticipant.levelId) === Number(lvl.id);
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() =>
                          setEditingParticipant({
                            ...editingParticipant,
                            levelId: lvl.id,
                            juzsOrSurahs: lvl.juzsOrSurahs,
                          })
                        }
                        className={`w-full p-3 rounded-xl border-2 text-right transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs sm:text-sm">{lvl.name}</div>
                          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            {formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black shrink-0 ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {isSelected ? 'المستوى المحدد ✓' : 'اختيار'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                className="min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <Save size={16} />
                <span>حفظ التعديلات</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingParticipant(null)}
                className="min-h-[46px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* نافذة تأكيد حذف المتسابق */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmParticipant}
        title="تأكيد حذف المتسابق"
        message="هل أنت متأكد من حذف هذا المتسابق من المسابقة؟ سيتم حذف بياناته وأي تقييمات مرصودة له."
        itemTitle={deleteConfirmParticipant?.name}
        confirmLabel="نعم، حذف المتسابق"
        onConfirm={() => {
          if (deleteConfirmParticipant) {
            onUpdate({
              ...comp,
              participants: (comp.participants || []).filter(
                x => x.id !== deleteConfirmParticipant.id
              ),
              evaluations: (comp.evaluations || []).filter(
                e => Number(e.participantId) !== Number(deleteConfirmParticipant.id)
              ),
            });
            setDeleteConfirmParticipant(null);
          }
        }}
        onClose={() => setDeleteConfirmParticipant(null)}
      />
    </div>
  );
}

export function OfficialReportHeader({
  seasonText,
  compName,
  reportTitle,
  reportSubtitle,
  metaStats,
}: {
  seasonText?: string;
  compName?: string;
  reportTitle?: string;
  reportSubtitle?: string;
  metaStats?: { label: string; value: string | number }[];
}) {
  const issueDateStr = new Date().toLocaleDateString('ar-OM', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      dir="rtl"
      style={{
        letterSpacing: '0px',
        wordSpacing: 'normal',
        fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
      }}
      className="w-full bg-white text-slate-900 rounded-3xl overflow-hidden border-2 border-amber-400/90 shadow-lg mb-6 print:shadow-none print:mb-4"
    >
      {/* الشريط الزخرفي الملكي العلوي */}
      <div className="h-3.5 w-full bg-gradient-to-r from-[#09152C] via-[#D4AF37] to-[#09152C] flex items-center justify-between overflow-hidden px-2">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 bg-amber-100/80 rotate-45 shrink-0"
          />
        ))}
      </div>

      {/* صورة الديباجة الرسمية المعتمدة */}
      <div className="relative w-full bg-[#f6f9f6] px-3 py-3 sm:px-6 sm:py-4 flex items-center justify-center border-b-2 border-amber-300/80">
        <img
          src="/assets/aistudio/Screenshot_____-__-__-__-__-__-___6012fa4d4ddec268fc5c7112cbb265e7_a7e4dd59.jpg"
          alt="ديباجة مسابقة محافظة الظاهرة للقرآن الكريم"
          crossOrigin="anonymous"
          className="w-full max-w-4xl h-auto max-h-40 sm:max-h-52 object-contain"
        />
      </div>

      {/* شريط نص الموسم واسم المسابقة تحت الديباجة مباشرة */}
      <div className="bg-gradient-to-l from-[#09152C] via-[#132A52] to-[#09152C] text-white py-3 px-4 sm:px-6 border-b border-amber-400/50">
        <div className="flex flex-col items-center justify-center text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2 text-amber-300 font-black text-sm sm:text-base md:text-lg">
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            <span>
              {seasonText || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م'}
            </span>
            <Sparkles size={16} className="text-amber-400 shrink-0" />
          </div>
          {compName && (
            <div className="text-xs sm:text-sm font-extrabold text-amber-100/95">
              {compName}
            </div>
          )}
        </div>
      </div>

      {/* شريط عنوان التقرير الرسمي والملخص الإحصائي */}
      {(reportTitle || (metaStats && metaStats.length > 0)) && (
        <div className="bg-gradient-to-b from-amber-50/90 to-white px-4 py-3.5 sm:px-6 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-3 border-t border-amber-200/70">
          <div className="text-center md:text-right">
            {reportTitle && (
              <h3 className="text-base sm:text-xl font-black text-[#09152C] flex items-center justify-center md:justify-start gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span>{reportTitle}</span>
              </h3>
            )}
            {reportSubtitle && (
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                {reportSubtitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {metaStats &&
              metaStats.map((st, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-white border border-amber-300/80 shadow-2xs text-center min-w-[92px]"
                >
                  <span className="block text-[10px] font-bold text-slate-500">
                    {st.label}
                  </span>
                  <span className="block text-xs sm:text-sm font-black text-[#09152C]">
                    {st.value}
                  </span>
                </div>
              ))}
            <div className="px-3 py-1.5 rounded-xl bg-[#09152C] text-amber-300 text-center min-w-[110px]">
              <span className="block text-[10px] font-bold text-amber-100/80">
                تاريخ التقرير
              </span>
              <span className="block text-xs font-black">{issueDateStr}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * تحديد التقدير اللفظي وألوان الشارات الرسمية بناءً على النسبة المئوية
 */
function getOfficialGradeInfo(
  percentage: number | null,
  isUnmemorized: boolean,
  hasEvaluation: boolean
) {
  if (isUnmemorized) {
    return {
      label: 'غير حافظ',
      badgeClass:
        'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800',
      barClass: 'bg-red-500',
    };
  }
  if (!hasEvaluation || percentage === null) {
    return {
      label: 'بانتظار التقييم',
      badgeClass:
        'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      barClass: 'bg-slate-300',
    };
  }
  if (percentage >= 97) {
    return {
      label: 'ممتاز مع مرتبة الشرف',
      badgeClass:
        'bg-amber-100 text-amber-950 border-amber-400 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700',
      barClass: 'bg-gradient-to-l from-amber-500 to-emerald-700',
    };
  }
  if (percentage >= 90) {
    return {
      label: 'ممتاز',
      badgeClass:
        'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700',
      barClass: 'bg-emerald-700',
    };
  }
  if (percentage >= 80) {
    return {
      label: 'جيد جداً',
      badgeClass:
        'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/80 dark:text-sky-200 dark:border-sky-700',
      barClass: 'bg-sky-600',
    };
  }
  if (percentage >= 70) {
    return {
      label: 'جيد',
      badgeClass:
        'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200 dark:border-indigo-700',
      barClass: 'bg-indigo-600',
    };
  }
  return {
    label: 'مقبول',
    badgeClass:
      'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/80 dark:text-orange-200 dark:border-orange-700',
    barClass: 'bg-orange-500',
  };
}

function CompetitionReports({
  comp,
  onUpdate,
}: {
  comp: Competition;
  onUpdate?: (updated: Competition) => void;
}) {
  const [reportSubTab, setReportSubTab] = useState<
    'rankings' | 'evaluator_averages' | 'table' | 'analytics' | 'certificate'
  >('rankings');
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<number | 'all'>(
    'all'
  );

  // فلاتر التصفية متعددة الاختيارات مع البحث وتحديد/إلغاء الكل (إذا لم يتم تحديد شيء يعني الكل)
  const [filterLevels, setFilterLevels] = useState<string[]>([]);
  const [filterWilayats, setFilterWilayats] = useState<string[]>([]);
  const [filterGenders, setFilterGenders] = useState<string[]>([]);
  const [filterNames, setFilterNames] = useState<string[]>([]);
  const [filterRequestNumbers, setFilterRequestNumbers] = useState<string[]>([]);
  const [filterCivilIds, setFilterCivilIds] = useState<string[]>([]);
  const [filterPhones, setFilterPhones] = useState<string[]>([]);
  const [filterRegDates, setFilterRegDates] = useState<string[]>([]);
  const [filterEvaluators, setFilterEvaluators] = useState<string[]>([]);
  const [filterGrades, setFilterGrades] = useState<string[]>([]);

  // خيار إظهار النتائج المتوفرة فقط أو إظهار جميع المسجلين شاملاً بانتظار التقييم
  const [showOnlyAvailableInRankings, setShowOnlyAvailableInRankings] =
    useState<boolean>(true);
  const [evalAvgFilterMode, setEvalAvgFilterMode] = useState<
    'available' | 'multi_only' | 'all'
  >('available');
  const [evalStatusFilter, setEvalStatusFilter] = useState<
    | 'available'
    | 'all'
    | 'memorized'
    | 'unmemorized'
    | 'not_evaluated'
    | 'multi_evaluated'
  >('available');
  const [sortOrder, setSortOrder] = useState<
    'score_desc' | 'score_asc' | 'name' | 'level' | 'wilayat' | 'request_num'
  >('score_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailParticipantId, setDetailParticipantId] = useState<number | null>(
    null
  );
  const [selectedParticipantForCert, setSelectedParticipantForCert] = useState<
    number | null
  >(null);
  const [deleteConfirmEvalId, setDeleteConfirmEvalId] = useState<string | null>(
    null
  );
  // إدارة وحذف التقييمات (المحددة أو الكل أو الفردية)
  const [selectedEvalIds, setSelectedEvalIds] = useState<Set<string>>(new Set());
  const [showDeleteAllEvalsModal, setShowDeleteAllEvalsModal] = useState(false);
  const [showDeleteSelectedEvalsModal, setShowDeleteSelectedEvalsModal] = useState(false);
  const [showManageEvalsModal, setShowManageEvalsModal] = useState(false);
  const [manageEvalsSearchQuery, setManageEvalsSearchQuery] = useState('');
  const [deleteConfirmParticipantId, setDeleteConfirmParticipantId] = useState<number | null>(null);
  const [excludeParticipantTarget, setExcludeParticipantTarget] = useState<
    CompetitionParticipant | 'all' | null
  >(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const context = useContext(AppContext);

  // دالة مساعدة للحصول على اسم المقيم
  const getEvaluatorName = (evaluatorId: number, fallbackName?: string) => {
    const found = (comp.evaluators || []).find(
      e => Number(e.id) === Number(evaluatorId)
    );
    return found?.name || fallbackName || `مقيم #${evaluatorId}`;
  };

  // قائمة المقيمين الشاملة (المسجلين + أي مقيم وردت له تقييمات مرصودة)
  const activeEvaluatorsList = React.useMemo(() => {
    const list: { id: number; name: string }[] = (comp.evaluators || []).map(
      e => ({
        id: Number(e.id),
        name: e.name,
      })
    );
    const seenIds = new Set(list.map(e => Number(e.id)));
    (comp.evaluations || []).forEach(ev => {
      const evId = Number(ev.evaluatorId);
      if (evId && !seenIds.has(evId)) {
        seenIds.add(evId);
        list.push({
          id: evId,
          name: ev.evaluatorName || `مقيم #${evId}`,
        });
      }
    });
    return list;
  }, [comp.evaluators, comp.evaluations]);

  // تجميع كافة المشاركين + استرجاع أي تقييمات متوفرة حتى لو اختلف معرف المشارك أو المستوى لضمان ظهور جميع النتائج المتوفرة
  const mergedParticipantsList: CompetitionParticipant[] = React.useMemo(() => {
    const baseList = [...(comp.participants || [])];
    const existingIds = new Set(baseList.map(p => String(p.id)));
    (comp.evaluations || []).forEach((ev, idx) => {
      const pIdStr = String(ev.participantId);
      if (pIdStr && !existingIds.has(pIdStr)) {
        existingIds.add(pIdStr);
        baseList.push({
          id: Number(ev.participantId) || Date.now() + idx,
          name: (ev as any).participantName || `متسابق #${idx + 1}`,
          levelId: Number(ev.levelId) || comp.levels?.[0]?.id || 1,
          isUnmemorized: Boolean(ev.isUnmemorized),
        });
      }
    });
    return baseList;
  }, [comp.participants, comp.evaluations, comp.levels]);

  // حساب نتائج كل طالب (جميع التقييمات المتوفرة من كل مقيم + المتوسط + متوسط كل مقطع + الترتيب على المستوى والترتيب العام)
  const rawResults = React.useMemo(() => {
    return mergedParticipantsList.map(p => {
      const pEvals = (comp.evaluations || []).filter(
        ev =>
          Number(ev.participantId) === Number(p.id) ||
          String(ev.participantId) === String(p.id)
      );

      const level =
        (comp.levels || []).find(
          l =>
            Number(l.id) === Number(p.levelId) ||
            String(l.id) === String(p.levelId)
        ) ||
        (pEvals[0]?.levelId
          ? (comp.levels || []).find(
              l => Number(l.id) === Number(pEvals[0].levelId)
            )
          : undefined) ||
        (comp.levels || [])[0];

      const maxScore = level?.maxScore || 100;
      const segmentsCount = Math.max(1, Number(level?.segmentsCount || 5));

      const isUnmemorized =
        Boolean(p.isUnmemorized) ||
        pEvals.some(
          ev =>
            Boolean(ev.isUnmemorized) ||
            ((ev.segments || []).length > 0 &&
              (ev.segments || []).every((s: any) => Boolean(s.isUnmemorized)))
        );

      const numericScores = pEvals.map(ev =>
        ev.isUnmemorized ? 0 : Number(ev.totalScore || 0)
      );

      const avgScore =
        pEvals.length > 0
          ? numericScores.reduce((sum, val) => sum + val, 0) / pEvals.length
          : null;

      const highestEvalScore =
        numericScores.length > 0 ? Math.max(...numericScores) : null;
      const lowestEvalScore =
        numericScores.length > 0 ? Math.min(...numericScores) : null;
      const evalSpread =
        highestEvalScore !== null &&
        lowestEvalScore !== null &&
        numericScores.length > 1
          ? Number((highestEvalScore - lowestEvalScore).toFixed(2))
          : 0;

      const roundedAvg =
        avgScore !== null ? Number(avgScore.toFixed(2)) : null;
      const percentage =
        roundedAvg !== null && maxScore > 0
          ? Number(((roundedAvg / maxScore) * 100).toFixed(1))
          : null;

      const totalDeductions =
        roundedAvg !== null
          ? Math.max(0, Number((maxScore - roundedAvg).toFixed(2)))
          : null;

      // حساب متوسط كل مقطع (م1..مN) عبر جميع المقيمين الذين رصدوا درجات للمتسابق
      const segmentAverages: (number | null)[] = Array.from(
        { length: segmentsCount },
        (_, segIdx) => {
          const validSegScores: number[] = [];
          pEvals.forEach(ev => {
            if (ev.isUnmemorized) {
              validSegScores.push(0);
              return;
            }
            const foundSeg = (ev.segments || []).find(
              (s, i) => Number(s.segmentNumber || i + 1) === segIdx + 1
            );
            if (foundSeg) {
              validSegScores.push(
                foundSeg.isUnmemorized ? 0 : Number(foundSeg.score || 0)
              );
            }
          });
          if (validSegScores.length === 0) return null;
          const avgSeg =
            validSegScores.reduce((a, b) => a + b, 0) / validSegScores.length;
          return Number(avgSeg.toFixed(1));
        }
      );

      const gradeInfo = getOfficialGradeInfo(
        percentage,
        isUnmemorized,
        pEvals.length > 0
      );

      return {
        participant: p,
        level,
        effectiveLevelId: level?.id ?? p.levelId,
        maxScore,
        segmentsCount,
        segmentAverages,
        evaluationsCount: pEvals.length,
        averageScore: roundedAvg,
        highestEvalScore:
          highestEvalScore !== null ? Number(highestEvalScore.toFixed(2)) : null,
        lowestEvalScore:
          lowestEvalScore !== null ? Number(lowestEvalScore.toFixed(2)) : null,
        evalSpread,
        percentage,
        totalDeductions,
        evaluations: pEvals,
        isUnmemorized,
        gradeInfo,
        rankInLevel: null as number | null,
        overallRank: null as number | null,
      };
    });
  }, [mergedParticipantsList, comp.levels, comp.evaluations]);

  // حساب الترتيب على مستوى كل فرع والترتيب العام على مستوى المسابقة للنتائج المتوفرة
  const allResults = React.useMemo(() => {
    const cloned = rawResults.map(r => ({ ...r }));

    // الترتيب العام حسب النسبة المئوية ثم الدرجة
    const overallMemorized = cloned
      .filter(
        r =>
          r.evaluationsCount > 0 && r.averageScore !== null && !r.isUnmemorized
      )
      .sort(
        (a, b) =>
          (b.percentage || 0) - (a.percentage || 0) ||
          (b.averageScore || 0) - (a.averageScore || 0)
      );
    overallMemorized.forEach((item, idx) => {
      item.overallRank = idx + 1;
    });

    // الترتيب داخل كل مستوى
    const levelIds = new Set(cloned.map(r => Number(r.effectiveLevelId)));
    levelIds.forEach(lvlId => {
      const lvlMemorized = cloned
        .filter(
          r =>
            Number(r.effectiveLevelId) === Number(lvlId) &&
            r.evaluationsCount > 0 &&
            r.averageScore !== null &&
            !r.isUnmemorized
        )
        .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

      lvlMemorized.forEach((item, idx) => {
        item.rankInLevel = idx + 1;
      });
    });

    return cloned;
  }, [rawResults]);

  // خيارات التصفية متعددة الاختيارات لكافة الحقول (مع عدد المتسابقين في كل خيار)
  const filterOptionsMap = React.useMemo(() => {
    const countMap = (extractor: (r: (typeof allResults)[0]) => string) => {
      const m = new Map<string, number>();
      allResults.forEach(r => {
        const val = extractor(r).trim();
        if (val) m.set(val, (m.get(val) || 0) + 1);
      });
      return Array.from(m.entries()).map(([value, count]) => ({
        value,
        label: value,
        count,
      }));
    };

    const levelOptions = (comp.levels || []).map(lvl => ({
      value: String(lvl.id),
      label: lvl.name,
      count: allResults.filter(
        r => Number(r.effectiveLevelId) === Number(lvl.id)
      ).length,
    }));

    const evaluatorOptions = activeEvaluatorsList.map(ev => ({
      value: String(ev.id),
      label: ev.name,
      count: allResults.filter(r =>
        r.evaluations.some(e => Number(e.evaluatorId) === Number(ev.id))
      ).length,
    }));

    return {
      levels: levelOptions,
      wilayats: countMap(r => r.participant.wilayat || 'غير محدد'),
      genders: countMap(r => r.participant.gender || 'غير محدد'),
      names: countMap(r => r.participant.name || ''),
      requestNumbers: countMap(r => r.participant.requestNumber || ''),
      civilIds: countMap(r => r.participant.civilId || ''),
      phones: countMap(r => r.participant.phone || ''),
      regDates: countMap(r =>
        r.participant.registrationDate
          ? r.participant.registrationDate.split(' ')[0]
          : ''
      ),
      evaluators: evaluatorOptions,
      grades: countMap(r => r.gradeInfo.label),
    };
  }, [allResults, comp.levels, activeEvaluatorsList]);

  const hasActiveMultiFilters =
    filterLevels.length > 0 ||
    filterWilayats.length > 0 ||
    filterGenders.length > 0 ||
    filterNames.length > 0 ||
    filterRequestNumbers.length > 0 ||
    filterCivilIds.length > 0 ||
    filterPhones.length > 0 ||
    filterRegDates.length > 0 ||
    filterEvaluators.length > 0 ||
    filterGrades.length > 0 ||
    selectedLevelId !== 'all' ||
    selectedEvaluatorId !== 'all' ||
    searchQuery.trim() !== '';

  const resetAllFilters = () => {
    setFilterLevels([]);
    setFilterWilayats([]);
    setFilterGenders([]);
    setFilterNames([]);
    setFilterRequestNumbers([]);
    setFilterCivilIds([]);
    setFilterPhones([]);
    setFilterRegDates([]);
    setFilterEvaluators([]);
    setFilterGrades([]);
    setSelectedLevelId('all');
    setSelectedEvaluatorId('all');
    setSearchQuery('');
  };

  // النتائج المصفاة حسب الفلاتر متعددة الاختيارات (تطبق على جميع التبويبات والرسوم البيانية والتصدير)
  const baseFilteredResults = React.useMemo(() => {
    return allResults.filter(r => {
      if (
        selectedLevelId !== 'all' &&
        Number(r.effectiveLevelId) !== Number(selectedLevelId)
      ) {
        return false;
      }
      if (
        filterLevels.length > 0 &&
        !filterLevels.includes(String(r.effectiveLevelId))
      ) {
        return false;
      }
      if (
        selectedEvaluatorId !== 'all' &&
        !r.evaluations.some(
          ev => Number(ev.evaluatorId) === Number(selectedEvaluatorId)
        )
      ) {
        return false;
      }
      if (
        filterEvaluators.length > 0 &&
        !r.evaluations.some(ev =>
          filterEvaluators.includes(String(ev.evaluatorId))
        )
      ) {
        return false;
      }
      if (filterWilayats.length > 0) {
        const w = (r.participant.wilayat || 'غير محدد').trim();
        if (!filterWilayats.includes(w)) return false;
      }
      if (filterGenders.length > 0) {
        const g = (r.participant.gender || 'غير محدد').trim();
        if (!filterGenders.includes(g)) return false;
      }
      if (filterNames.length > 0 && !filterNames.includes(r.participant.name.trim())) {
        return false;
      }
      if (
        filterRequestNumbers.length > 0 &&
        !filterRequestNumbers.includes((r.participant.requestNumber || '').trim())
      ) {
        return false;
      }
      if (
        filterCivilIds.length > 0 &&
        !filterCivilIds.includes((r.participant.civilId || '').trim())
      ) {
        return false;
      }
      if (
        filterPhones.length > 0 &&
        !filterPhones.includes((r.participant.phone || '').trim())
      ) {
        return false;
      }
      if (filterRegDates.length > 0) {
        const d = r.participant.registrationDate
          ? r.participant.registrationDate.split(' ')[0].trim()
          : '';
        if (!filterRegDates.includes(d)) return false;
      }
      if (
        filterGrades.length > 0 &&
        !filterGrades.includes(r.gradeInfo.label)
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesAny =
          r.participant.name.toLowerCase().includes(q) ||
          (r.participant.requestNumber || '').toLowerCase().includes(q) ||
          (r.participant.civilId || '').toLowerCase().includes(q) ||
          (r.participant.phone || '').toLowerCase().includes(q) ||
          (r.participant.wilayat || '').toLowerCase().includes(q) ||
          (r.participant.gender || '').toLowerCase().includes(q) ||
          (r.level?.name || '').toLowerCase().includes(q);
        if (!matchesAny) return false;
      }
      return true;
    });
  }, [
    allResults,
    selectedLevelId,
    filterLevels,
    selectedEvaluatorId,
    filterEvaluators,
    filterWilayats,
    filterGenders,
    filterNames,
    filterRequestNumbers,
    filterCivilIds,
    filterPhones,
    filterRegDates,
    filterGrades,
    searchQuery,
  ]);

  // إحصائيات عامة للنتائج المتوفرة (حسب التصفية النشطة)
  const totalStudentsCount = baseFilteredResults.length;
  const availableResultsList = baseFilteredResults.filter(
    r => r.evaluationsCount > 0
  );
  const evaluatedStudentsCount = availableResultsList.length;
  const unmemorizedStudentsCount = baseFilteredResults.filter(
    r => r.isUnmemorized
  ).length;
  const memorizedStudentsCount = baseFilteredResults.filter(
    r => r.evaluationsCount > 0 && !r.isUnmemorized
  ).length;
  const multiEvaluatedCount = baseFilteredResults.filter(
    r => r.evaluationsCount > 1
  ).length;

  const overallAverage =
    memorizedStudentsCount > 0
      ? Number(
          (
            baseFilteredResults
              .filter(r => r.averageScore !== null && !r.isUnmemorized)
              .reduce((sum, r) => sum + (r.averageScore || 0), 0) /
            memorizedStudentsCount
          ).toFixed(2)
        )
      : null;

  const topScorerResult = React.useMemo(() => {
    const valid = baseFilteredResults
      .filter(r => r.averageScore !== null && !r.isUnmemorized)
      .sort(
        (a, b) =>
          (b.percentage || 0) - (a.percentage || 0) ||
          (b.averageScore || 0) - (a.averageScore || 0)
      );
    return valid[0] || null;
  }, [baseFilteredResults]);

  // إذا لم يكن هناك أي نتائج مرصودة بعد، نعرض تلقائياً جميع المسجلين حتى لا يظهر الجدول فارغاً
  const effectiveStatusFilter =
    evalStatusFilter === 'available' && evaluatedStudentsCount === 0
      ? 'all'
      : evalStatusFilter;

  // فرز وتصفية النتائج
  const filteredResults = baseFilteredResults
    .filter(r => {
      if (effectiveStatusFilter === 'available' && r.evaluationsCount === 0) {
        return false;
      }
      if (effectiveStatusFilter === 'not_evaluated' && r.evaluationsCount > 0) {
        return false;
      }
      if (effectiveStatusFilter === 'multi_evaluated' && r.evaluationsCount < 2) {
        return false;
      }
      if (
        effectiveStatusFilter === 'memorized' &&
        (r.isUnmemorized || r.evaluationsCount === 0)
      ) {
        return false;
      }
      if (effectiveStatusFilter === 'unmemorized' && !r.isUnmemorized) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'name') {
        return a.participant.name.localeCompare(b.participant.name, 'ar');
      }
      if (sortOrder === 'level') {
        return (a.level?.name || '').localeCompare(b.level?.name || '', 'ar');
      }
      if (sortOrder === 'wilayat') {
        return (a.participant.wilayat || '').localeCompare(
          b.participant.wilayat || '',
          'ar'
        );
      }
      if (sortOrder === 'request_num') {
        return (a.participant.requestNumber || '').localeCompare(
          b.participant.requestNumber || '',
          'ar',
          { numeric: true }
        );
      }
      if (sortOrder === 'score_asc') {
        if (a.isUnmemorized && !b.isUnmemorized) return -1;
        if (!a.isUnmemorized && b.isUnmemorized) return 1;
        if (a.averageScore === null) return 1;
        if (b.averageScore === null) return -1;
        return (a.averageScore || 0) - (b.averageScore || 0);
      }
      // الافتراضي score_desc: النتائج المتوفرة للحافظين بالأعلى مرتبة تنازلياً، ثم غير الحافظين، ثم من لم يُقيّم
      if (a.evaluationsCount > 0 && b.evaluationsCount === 0) return -1;
      if (a.evaluationsCount === 0 && b.evaluationsCount > 0) return 1;
      if (a.isUnmemorized && !b.isUnmemorized) return 1;
      if (!a.isUnmemorized && b.isUnmemorized) return -1;
      if (a.averageScore === null && b.averageScore === null) {
        return a.participant.name.localeCompare(b.participant.name, 'ar');
      }
      if (a.averageScore === null) return 1;
      if (b.averageScore === null) return -1;
      return (b.averageScore || 0) - (a.averageScore || 0);
    });

  // نتائج تبويب "ملخص متوسطات المقيمين"
  const evaluatorAverageRows = React.useMemo(() => {
    const effectiveMode =
      evalAvgFilterMode === 'available' && evaluatedStudentsCount === 0
        ? 'all'
        : evalAvgFilterMode;

    return baseFilteredResults
      .filter(r => {
        if (effectiveMode === 'available' && r.evaluationsCount === 0) {
          return false;
        }
        if (effectiveMode === 'multi_only' && r.evaluationsCount < 2) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.evaluationsCount > 0 && b.evaluationsCount === 0) return -1;
        if (a.evaluationsCount === 0 && b.evaluationsCount > 0) return 1;
        if (a.isUnmemorized && !b.isUnmemorized) return 1;
        if (!a.isUnmemorized && b.isUnmemorized) return -1;
        return (
          (b.percentage || 0) - (a.percentage || 0) ||
          (b.averageScore || 0) - (a.averageScore || 0)
        );
      });
  }, [baseFilteredResults, evalAvgFilterMode, evaluatedStudentsCount]);

  /**
   * تحويل الصور داخل عنصر التقرير إلى Data URL (Base64) مع التخزين المؤقت الفوري لضمان سرعة تصدير الـ PDF
   */
  const inlineImagesInClone = async (rootEl: HTMLElement) => {
    const imgs = Array.from(rootEl.querySelectorAll('img'));
    await Promise.all(
      imgs.map(async img => {
        try {
          const src = img.getAttribute('src') || '';
          if (!src || src.startsWith('data:')) return;
          const absUrl = src.startsWith('http')
            ? src
            : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
          if (inlinedImageCache.has(absUrl)) {
            img.setAttribute('src', inlinedImageCache.get(absUrl)!);
            return;
          }
          const response = await fetch(absUrl);
          if (!response.ok) return;
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          if (dataUrl.startsWith('data:')) {
            inlinedImageCache.set(absUrl, dataUrl);
            img.setAttribute('src', dataUrl);
          }
        } catch {
          // ignore individual image inline error
        }
      })
    );
  };

  /**
   * تصدير التقرير الرسمي إلى PDF بسرعة فائقة وجودة عالية جداً وبخط عربي متصل وسليم 100%
   * يتم تضمين قواعد CSS المجمّعة مباشرة داخل HTML لتفادي أي طلبات شبكة بطيئة داخل الخادم
   */
  const exportToPdf = async (
    elementId: string,
    fileName: string,
    isLandscape = false
  ) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    setIsExportingPdf(true);
    context?.showToast(
      'جاري تصدير التقرير الرسمي بملف PDF عالي الدقة...',
      'info'
    );

    try {
      // 1. تجهيز نسخة نظيفة من التقرير مع تضمين الصور المخبأة
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.no-print').forEach(n => n.remove());
      clone.classList.remove('dark:bg-slate-900', 'dark:border-slate-800');
      clone.style.backgroundColor = '#ffffff';
      clone.style.color = '#0f172a';
      clone.style.direction = 'rtl';
      clone.style.letterSpacing = '0px';

      await inlineImagesInClone(clone);

      // 2. استخراج كافة قواعد الأنماط المجمعة مباشرة من الذاكرة (مع استبعاد قاعدة إخفاء العناصر خارج #root)
      const compiledCssChunks: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules;
          if (rules) {
            for (let i = 0; i < rules.length; i++) {
              const ruleText = rules[i].cssText || '';
              if (
                ruleText.includes(':not(#root)') ||
                ruleText.includes('netlify')
              ) {
                continue;
              }
              compiledCssChunks.push(ruleText);
            }
          }
        } catch {
          // تخطي ملفات الأنماط الخارجية المحمية بـ CORS
        }
      }
      const inlineCompiledCss = `<style>${compiledCssChunks.join('\n')}</style>`;

      const orientation = isLandscape ? 'landscape' : 'portrait';
      const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
  ${inlineCompiledCss}
  <style>
    @page {
      size: A4 ${orientation};
      margin: 7mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      letter-spacing: 0px !important;
      word-spacing: normal !important;
      font-feature-settings: "kern" 1, "liga" 1, "clig" 1, "calt" 1 !important;
      font-variant-ligatures: common-ligatures contextual !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Tajawal', 'Cairo', 'Amiri', sans-serif !important;
      direction: rtl !important;
      text-align: right !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    #root, body > div {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    .no-print {
      display: none !important;
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group !important;
    }
    tfoot {
      display: table-footer-group !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    tr, tbody.pdf-avoid-break, .pdf-avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    h1, h2, h3, h4, h5 {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }
  </style>
</head>
<body dir="rtl">
  <div id="root" style="width: 100%; padding: 4px; background: #ffffff; direction: rtl;">
    ${clone.outerHTML}
  </div>
</body>
</html>`;

      // المحاولة الأولى: التصدير المتجهي السريع عبر خادم الطباعة الرسمي (/api/pdf)
      try {
        const res = await fetch('/api/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: fullHtml, orientation }),
        });

        if (res.ok) {
          const pdfBlob = await res.blob();
          if (pdfBlob.size > 500) {
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            context?.showToast(
              'تم تصدير التقرير الرسمي بملف PDF عالي الدقة بنجاح!',
              'success'
            );
            return;
          }
        }
      } catch (serverPdfErr) {
        console.warn('Server PDF endpoint fallback to client canvas:', serverPdfErr);
      }

      // المحرك الاحتياطي: html2canvas مع التقطيع الذكي لصفحات PDF بحيث لا تنقطع أي خلية أو صف أو بطاقة بين صفحتين
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // حساب إحداثيات كافة الكتل الذرية (الصفوف، سجلات المتسابقين المدمجة، البطاقات، التوقيعات) لمنع قطعها بين صفحتين
      const rootRect = el.getBoundingClientRect();
      const domHeight = Math.max(1, el.offsetHeight || rootRect.height);
      const atomicNodes = Array.from(
        el.querySelectorAll(
          'tbody.pdf-avoid-break, tr, tfoot, .pdf-avoid-break, .grid > div'
        )
      ) as HTMLElement[];
      const domBlocks = atomicNodes
        .map(node => {
          const r = node.getBoundingClientRect();
          return {
            topRatio: Math.max(0, (r.top - rootRect.top) / domHeight),
            bottomRatio: Math.min(1, (r.bottom - rootRect.top) / domHeight),
          };
        })
        .filter(b => b.bottomRatio > b.topRatio);

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

      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: isLandscape ? 1320 : 1080,
          onclone: clonedDoc => {
            clonedDoc.documentElement.setAttribute('dir', 'rtl');
            clonedDoc.documentElement.setAttribute('lang', 'ar');
            clonedDoc.documentElement.classList.remove('dark');
            const fixStyle = clonedDoc.createElement('style');
            fixStyle.textContent = `
              *, *::before, *::after {
                letter-spacing: 0px !important;
                word-spacing: 0px !important;
                font-feature-settings: "kern" 1, "liga" 1, "clig" 1, "calt" 1 !important;
                font-variant-ligatures: common-ligatures contextual !important;
                font-family: 'Tajawal', 'Cairo', sans-serif !important;
                direction: rtl !important;
              }
              .no-print { display: none !important; }
            `;
            clonedDoc.head.appendChild(fixStyle);
          },
        });
      } finally {
        CanvasRenderingContext2D.prototype.fillText = origFillText;
      }

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginMm = 6;
      const usableWidthMm = pdfWidth - marginMm * 2;
      const usableHeightMm = pageHeight - marginMm * 2;
      const pxPerMm = canvas.width / usableWidthMm;
      const maxSliceHeightPx = Math.floor(usableHeightMm * pxPerMm);

      const canvasBlocks = domBlocks.map(b => ({
        topPx: Math.floor(b.topRatio * canvas.height),
        bottomPx: Math.ceil(b.bottomRatio * canvas.height),
      }));

      let currentY = 0;
      let pageIndex = 0;

      while (currentY < canvas.height - 4) {
        let nextY = Math.min(canvas.height, currentY + maxSliceHeightPx);

        if (nextY < canvas.height) {
          // البحث عن أي صف أو سجل متسابق أو بطاقة يتقاطع مع خط القطع المقترح (nextY)
          const crossingBlocks = canvasBlocks.filter(
            b =>
              b.topPx > currentY + 30 &&
              b.topPx < nextY &&
              b.bottomPx > nextY &&
              b.bottomPx - b.topPx <= maxSliceHeightPx * 0.9
          );

          if (crossingBlocks.length > 0) {
            const safeTopPx = Math.min(...crossingBlocks.map(b => b.topPx));
            if (safeTopPx > currentY + 40) {
              nextY = safeTopPx - 2;
            }
          }
        }

        const sliceHeightPx = Math.max(1, nextY - currentY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const pageCtx = pageCanvas.getContext('2d');
        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            canvas,
            0,
            currentY,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
          const sliceImgData = pageCanvas.toDataURL('image/png');
          if (pageIndex > 0) {
            pdf.addPage();
          }
          const sliceHeightMm = sliceHeightPx / pxPerMm;
          pdf.addImage(
            sliceImgData,
            'PNG',
            marginMm,
            marginMm,
            usableWidthMm,
            sliceHeightMm
          );
          pageIndex++;
        }

        currentY = nextY;
      }

      pdf.save(`${fileName}.pdf`);
      context?.showToast('تم تصدير ملف الـ PDF الرسمي المنسق بنجاح!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      context?.showToast('جارِ فتح نافذة الطباعة الرسمية...', 'info');
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // تصدير ملف إكسل خاص بالجدول الشامل المدمج (صف مدمج لبيانات المتسابق + صفوف مقسمة للمقيمين + خلايا مدمجة للمتوسطات والدرجة النهائية)
  const exportComprehensiveMergedExcel = () => {
    const wb = createStyledWorkbook();
    let sheetCounter = 1;

    // 1. الورقة الرئيسية: الجدول الشامل المدمج لجميع المتسابقين
    const wsMasterMerged = createComprehensiveMergedSheet(filteredResults, {
      compName: comp.name,
      titleBanner: `${comp.name} — الجدول الشامل المدمج لجميع المتسابقين وتفاصيل التقييمات والمتوسطات`,
      subtitleBanner: `إجمالي المتسابقين: ${filteredResults.length} | كل متسابق في سجل موحد (خلايا مدمجة لبيانات المتسابق + صفوف مقسمة لكل مقيم + خلايا مدمجة للمتوسطات والدرجة النهائية)`,
      getEvaluatorName,
      formatJuzsDisplay: formatJuzsOrSurahsDisplay,
    });
    appendStyledSheet(
      wb,
      wsMasterMerged,
      'الجدول الشامل المدمج (الكل)',
      sheetCounter++
    );

    // 2. ورقة مدمجة مستقلة لكل مستوى من مستويات المسابقة
    (comp.levels || []).forEach((lvl, lvlIdx) => {
      const levelResults = allResults
        .filter(r => Number(r.effectiveLevelId) === Number(lvl.id))
        .sort((a, b) => {
          if (a.rankInLevel !== null && b.rankInLevel !== null) {
            return a.rankInLevel - b.rankInLevel;
          }
          if (a.rankInLevel !== null) return -1;
          if (b.rankInLevel !== null) return 1;
          if (a.isUnmemorized && !b.isUnmemorized) return 1;
          if (!a.isUnmemorized && b.isUnmemorized) return -1;
          return (a.participant.name || '').localeCompare(
            b.participant.name || '',
            'ar'
          );
        });

      const wsLvlMerged = createComprehensiveMergedSheet(levelResults, {
        compName: comp.name,
        titleBanner: `${comp.name} — الجدول الشامل المدمج لـ ${lvl.name} (${formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)})`,
        subtitleBanner: `عدد المتسابقين في المستوى: ${levelResults.length} | عدد المقاطع: ${lvl.segmentsCount} | الدرجة العظمى: ${lvl.maxScore}`,
        maxSegmentsCount: Number(lvl.segmentsCount || 3),
        getEvaluatorName,
        formatJuzsDisplay: formatJuzsOrSurahsDisplay,
      });

      appendStyledSheet(
        wb,
        wsLvlMerged,
        lvl.name || `المستوى ${lvlIdx + 1}`,
        sheetCounter++
      );
    });

    writeStyledWorkbookFile(wb, `الجدول_الشامل_المدمج_${comp.name}.xlsx`);
    context?.showToast(
      'تم تصدير ملف الإكسل للجدول الشامل المدمج (بخلايا مدمجة للمتسابق ومقسمة للمقيمين) بنجاح!',
      'success'
    );
  };

  // تصدير النتائج لملف إكسل احترافي ملون ومنسق بالكامل (RTL) مع تخصيص ورقة مستقلة لكل مستوى من مستويات المسابقة
  const exportExcel = () => {
    const evaluatorsList = activeEvaluatorsList;

    const buildParticipantResultRow = (
      r: (typeof filteredResults)[number],
      evalsForColumns: CompetitionEvaluator[]
    ) => {
      const row: Record<string, any> = {
        'المركز في المستوى':
          r.rankInLevel !== null
            ? r.rankInLevel
            : r.isUnmemorized
            ? 'غير حافظ'
            : '-',
        'الترتيب العام':
          r.overallRank !== null
            ? r.overallRank
            : r.isUnmemorized
            ? 'غير حافظ'
            : '-',
        'رقم الطلب': r.participant.requestNumber || '-',
        'الاسم الكامل': r.participant.name,
        'الرقم المدني': r.participant.civilId || '-',
        'رقم الهاتف': r.participant.phone || '-',
        الجنس: r.participant.gender || '-',
        الولاية: r.participant.wilayat || '-',
        'مستوى المشاركة': r.level?.name || '',
        'المقرر / الأجزاء': formatJuzsOrSurahsDisplay(
          r.participant.juzsOrSurahs || r.level?.juzsOrSurahs || ''
        ),
        'حالة الحفظ': r.isUnmemorized
          ? 'غير حافظ'
          : r.evaluationsCount > 0
          ? 'حافظ'
          : 'بانتظار التقييم',
        'الدرجة العظمى': r.maxScore,
        'عدد المقيمين': r.evaluationsCount,
      };

      evalsForColumns.forEach(evaluatorItem => {
        const evRecord = r.evaluations.find(
          e => Number(e.evaluatorId) === Number(evaluatorItem.id)
        );
        row[`تقييم: ${evaluatorItem.name}`] = evRecord
          ? evRecord.isUnmemorized
            ? 'غير حافظ (0)'
            : evRecord.totalScore
          : '-';
      });

      row['أعلى تقييم'] = r.highestEvalScore !== null ? r.highestEvalScore : '-';
      row['أدنى تقييم'] = r.lowestEvalScore !== null ? r.lowestEvalScore : '-';
      row['فارق التقييمين'] = r.evaluationsCount > 1 ? r.evalSpread : '-';
      row['إجمالي الخصم'] =
        r.totalDeductions !== null && !r.isUnmemorized ? r.totalDeductions : '-';
      row['المتوسط بين المقيمين'] =
        r.averageScore !== null
          ? r.isUnmemorized
            ? 'غير حافظ (0)'
            : r.averageScore
          : 'لم يقيم';
      row['النسبة المئوية'] =
        r.percentage !== null && !r.isUnmemorized ? `${r.percentage}%` : '-';
      row['التقدير العام'] = r.gradeInfo.label;
      row['وقت وتاريخ التسجيل'] = r.participant.registrationDate || '-';

      return row;
    };

    const wb = createStyledWorkbook();
    let sheetCounter = 1;

    // 0. ورقة الجدول الشامل المدمج (بيانات المتسابق مدمجة + صفوف مقسمة للمقيمين + خلايا مدمجة للمتوسطات والدرجة النهائية)
    const wsComprehensiveMerged = createComprehensiveMergedSheet(filteredResults, {
      compName: comp.name,
      titleBanner: `${comp.name} — الجدول الشامل المدمج لجميع المتسابقين وتفاصيل التقييمات والمتوسطات`,
      subtitleBanner: `إجمالي المتسابقين: ${filteredResults.length} | كل متسابق في سجل موحد (خلايا مدمجة لبيانات المتسابق + صفوف مقسمة لكل مقيم + خلايا مدمجة للمتوسطات والدرجة النهائية)`,
      getEvaluatorName,
      formatJuzsDisplay: formatJuzsOrSurahsDisplay,
    });
    appendStyledSheet(
      wb,
      wsComprehensiveMerged,
      'الجدول الشامل المدمج',
      sheetCounter++
    );

    // 1. إنشاء ورقة مستقلة وملونة لكل مستوى من مستويات المسابقة (بحسب طلب المستخدم: بيانات كل مستوى في ورقة من ورقات أكسل)
    const levelsToExport = comp.levels || [];
    levelsToExport.forEach((lvl, lvlIdx) => {
      // جلب نتائج هذا المستوى مرتبة حسب المركز في المستوى
      const levelResults = allResults
        .filter(r => Number(r.effectiveLevelId) === Number(lvl.id))
        .sort((a, b) => {
          if (a.rankInLevel !== null && b.rankInLevel !== null) {
            return a.rankInLevel - b.rankInLevel;
          }
          if (a.rankInLevel !== null) return -1;
          if (b.rankInLevel !== null) return 1;
          if (a.isUnmemorized && !b.isUnmemorized) return 1;
          if (!a.isUnmemorized && b.isUnmemorized) return -1;
          return (a.participant.name || '').localeCompare(b.participant.name || '', 'ar');
        });

      // تحديد المقيمين المسندين لهذا المستوى لعرض أعمدتهم في ورقة المستوى
      const levelEvaluators = (comp.evaluators || []).filter(ev => {
        const assignedIds = Array.isArray(ev.levelIds) ? ev.levelIds.map(Number) : [];
        const hasEvaluatedInLevel = levelResults.some(r =>
          r.evaluations.some(e => Number(e.evaluatorId) === Number(ev.id))
        );
        return (
          assignedIds.length === 0 ||
          assignedIds.includes(Number(lvl.id)) ||
          hasEvaluatedInLevel
        );
      });

      const lvlMemorizedCount = levelResults.filter(
        r => r.averageScore !== null && !r.isUnmemorized
      ).length;
      const lvlUnmemorizedCount = levelResults.filter(r => r.isUnmemorized).length;
      const lvlPendingCount = levelResults.filter(r => r.evaluationsCount === 0).length;

      const levelRows =
        levelResults.length > 0
          ? levelResults.map(r => buildParticipantResultRow(r, levelEvaluators))
          : [
              {
                'المركز في المستوى': '-',
                'الاسم الكامل': 'لا يوجد متسابقون مسجلون في هذا المستوى حالياً',
                'مستوى المشاركة': lvl.name,
                'المقرر / الأجزاء': formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs),
                'حالة الحفظ': '-',
                'المتوسط بين المقيمين': '-',
                'التقدير العام': '-',
              },
            ];

      const wsLevel = createStyledSheetFromRows(levelRows, {
        titleBanner: `${comp.name} — نتائج ${lvl.name} (${formatJuzsOrSurahsDisplay(lvl.juzsOrSurahs)})`,
        subtitleBanner: `إجمالي المسجلين بالمستوى: ${levelResults.length} | الحافظون المقيمون: ${lvlMemorizedCount} | غير حافظين: ${lvlUnmemorizedCount} | بانتظار التقييم: ${lvlPendingCount} | الدرجة العظمى: ${lvl.maxScore}`,
        theme: getLevelSheetTheme(lvlIdx),
      });

      appendStyledSheet(wb, wsLevel, lvl.name || `المستوى ${lvlIdx + 1}`, sheetCounter++);
    });

    // 2. ورقة النتائج التفصيلية الشاملة (جميع المستويات معاً)
    const detailedData = filteredResults.map(r =>
      buildParticipantResultRow(r, evaluatorsList)
    );
    const wsAll = createStyledSheetFromRows(detailedData, {
      titleBanner: `${comp.name} — كشف النتائج التفصيلي الشامل (جميع المستويات)`,
      subtitleBanner: `إجمالي المتسابقين بالكشف: ${filteredResults.length} | تاريخ التصدير: ${new Date().toLocaleDateString('ar-OM')}`,
      theme: {
        bannerBg: '09152C',
        bannerFg: 'FFFFFF',
        headerBg: '065F46',
        headerFg: 'FFFFFF',
      },
    });
    appendStyledSheet(wb, wsAll, 'النتائج الشاملة للمسابقة', sheetCounter++);

    // 3. ورقة الإحصائيات التفصيلية مصنفة حسب المستوى والولاية والجنس
    const summaryRows: Record<string, any>[] = [];

    (comp.levels || []).forEach(lvl => {
      const lvlItems = baseFilteredResults.filter(
        r => Number(r.effectiveLevelId) === Number(lvl.id)
      );
      const lvlEval = lvlItems.filter(
        r => r.averageScore !== null && !r.isUnmemorized
      );
      const avg =
        lvlEval.length > 0
          ? Number(
              (
                lvlEval.reduce((s, x) => s + (x.averageScore || 0), 0) /
                lvlEval.length
              ).toFixed(2)
            )
          : '-';
      summaryRows.push({
        'التصنيف الإحصائي': 'حسب مستوى المشاركة',
        الفئة: lvl.name,
        'إجمالي المسجلين': lvlItems.length,
        'تم تقييمهم (حافظون)': lvlEval.length,
        'غير حافظين': lvlItems.filter(x => x.isUnmemorized).length,
        'بانتظار التقييم': lvlItems.filter(x => x.evaluationsCount === 0).length,
        'متوسط الدرجات': avg,
      });
    });

    filterOptionsMap.wilayats.forEach(wOpt => {
      const wItems = baseFilteredResults.filter(
        r => (r.participant.wilayat || 'غير محدد').trim() === wOpt.value
      );
      const wEval = wItems.filter(
        r => r.averageScore !== null && !r.isUnmemorized
      );
      const avg =
        wEval.length > 0
          ? Number(
              (
                wEval.reduce((s, x) => s + (x.averageScore || 0), 0) /
                wEval.length
              ).toFixed(2)
            )
          : '-';
      summaryRows.push({
        'التصنيف الإحصائي': 'حسب الولاية',
        الفئة: wOpt.label,
        'إجمالي المسجلين': wItems.length,
        'تم تقييمهم (حافظون)': wEval.length,
        'غير حافظين': wItems.filter(x => x.isUnmemorized).length,
        'بانتظار التقييم': wItems.filter(x => x.evaluationsCount === 0).length,
        'متوسط الدرجات': avg,
      });
    });

    filterOptionsMap.genders.forEach(gOpt => {
      const gItems = baseFilteredResults.filter(
        r => (r.participant.gender || 'غير محدد').trim() === gOpt.value
      );
      const gEval = gItems.filter(
        r => r.averageScore !== null && !r.isUnmemorized
      );
      const avg =
        gEval.length > 0
          ? Number(
              (
                gEval.reduce((s, x) => s + (x.averageScore || 0), 0) /
                gEval.length
              ).toFixed(2)
            )
          : '-';
      summaryRows.push({
        'التصنيف الإحصائي': 'حسب الجنس',
        الفئة: gOpt.label,
        'إجمالي المسجلين': gItems.length,
        'تم تقييمهم (حافظون)': gEval.length,
        'غير حافظين': gItems.filter(x => x.isUnmemorized).length,
        'بانتظار التقييم': gItems.filter(x => x.evaluationsCount === 0).length,
        'متوسط الدرجات': avg,
      });
    });

    const wsSummary = createStyledSheetFromRows(summaryRows, {
      titleBanner: `${comp.name} — الإحصائيات التفصيلية للمستويات والولايات والجنس`,
      colWidths: [24, 28, 18, 20, 16, 18, 18],
      theme: getLevelSheetTheme(2),
    });
    appendStyledSheet(wb, wsSummary, 'إحصائيات المستويات والولايات', sheetCounter++);

    // 4. ورقة بيانات المشاركين مطابقة لترتيب القالب الرسمي (8 أعمدة)
    const templateFormatRows = baseFilteredResults.map(r => ({
      'رقم الطلب': r.participant.requestNumber || '',
      'الاسم الكامل': r.participant.name || '',
      'الرقم المدني': r.participant.civilId || '',
      'رقم الهاتف': r.participant.phone || '',
      الجنس: r.participant.gender || '',
      الولاية: r.participant.wilayat || '',
      'مستوى المشاركة': r.level?.name || '',
      'وقت وتاريخ التسجيل': r.participant.registrationDate || '',
    }));

    const wsTemplate = createStyledSheetFromRows(templateFormatRows, {
      titleBanner: `${comp.name} — بيانات المشاركين حسب القالب الرسمي`,
      colWidths: [15, 30, 18, 16, 12, 18, 26, 22],
      theme: getLevelSheetTheme(3),
    });
    appendStyledSheet(wb, wsTemplate, 'بيانات المشاركين حسب القالب', sheetCounter++);

    writeStyledWorkbookFile(wb, `تقرير_نتائج_ومستويات_${comp.name}.xlsx`);
    context?.showToast(
      `تم تصدير ملف الإكسل الملون والمنسق بنجاح (الجدول الشامل المدمج + ورقة خاصة لكل مستوى + الإحصائيات)!`,
      'success'
    );
  };

  // حذف تقييم فردي
  const handleDeleteEvaluation = (evaluationId: string) => {
    if (!onUpdate) return;
    const targetEval = (comp.evaluations || []).find(
      ev => String(ev.id) === String(evaluationId)
    );
    const updatedEvals = (comp.evaluations || []).filter(
      ev => String(ev.id) !== String(evaluationId)
    );
    const targetPId = targetEval?.participantId;
    let updatedParticipants = comp.participants || [];
    if (targetPId) {
      const remainingForPart = updatedEvals.filter(
        e => Number(e.participantId) === Number(targetPId)
      );
      const stillUnmemorized =
        remainingForPart.length > 0 && remainingForPart.every(e => e.isUnmemorized);
      updatedParticipants = updatedParticipants.map(p =>
        Number(p.id) === Number(targetPId)
          ? { ...p, isUnmemorized: stillUnmemorized }
          : p
      );
    }
    onUpdate({
      ...comp,
      evaluations: updatedEvals,
      participants: updatedParticipants,
    });
    setDeleteConfirmEvalId(null);
    setSelectedEvalIds(prev => {
      const copy = new Set(prev);
      copy.delete(String(evaluationId));
      return copy;
    });
    context?.showToast('تم حذف التقييم بنجاح', 'success');
  };

  // حذف جميع التقييمات في المسابقة بالكامل
  const handleDeleteAllEvaluations = () => {
    if (!onUpdate) return;
    const totalCount = (comp.evaluations || []).length;
    const updatedParticipants = (comp.participants || []).map(p => ({
      ...p,
      isUnmemorized: false,
    }));
    onUpdate({
      ...comp,
      evaluations: [],
      participants: updatedParticipants,
    });
    setSelectedEvalIds(new Set());
    setShowDeleteAllEvalsModal(false);
    setShowManageEvalsModal(false);
    context?.showToast(`تم حذف جميع التقييمات (${totalCount} تقييم) بنجاح`, 'success');
  };

  // حذف التقييمات المحددة فقط
  const handleDeleteSelectedEvaluations = () => {
    if (!onUpdate || selectedEvalIds.size === 0) return;
    const countToDelete = selectedEvalIds.size;
    const updatedEvals = (comp.evaluations || []).filter(
      ev => !selectedEvalIds.has(String(ev.id))
    );
    const affectedParticipantIds = new Set(
      (comp.evaluations || [])
        .filter(ev => selectedEvalIds.has(String(ev.id)))
        .map(ev => Number(ev.participantId))
    );
    const updatedParticipants = (comp.participants || []).map(p => {
      if (affectedParticipantIds.has(Number(p.id))) {
        const remaining = updatedEvals.filter(
          e => Number(e.participantId) === Number(p.id)
        );
        const stillUnmemorized =
          remaining.length > 0 && remaining.every(e => e.isUnmemorized);
        return { ...p, isUnmemorized: stillUnmemorized };
      }
      return p;
    });

    onUpdate({
      ...comp,
      evaluations: updatedEvals,
      participants: updatedParticipants,
    });
    setSelectedEvalIds(new Set());
    setShowDeleteSelectedEvalsModal(false);
    context?.showToast(`تم حذف التقييمات المحددة (${countToDelete} تقييم) بنجاح`, 'success');
  };

  // حذف كافة تقييمات متسابق محدد وإعادته لحالة بانتظار التقييم
  const handleDeleteParticipantEvaluations = (pId: number) => {
    if (!onUpdate) return;
    const updatedEvals = (comp.evaluations || []).filter(
      ev => Number(ev.participantId) !== Number(pId)
    );
    const updatedParticipants = (comp.participants || []).map(p =>
      Number(p.id) === Number(pId) ? { ...p, isUnmemorized: false } : p
    );
    onUpdate({
      ...comp,
      evaluations: updatedEvals,
      participants: updatedParticipants,
    });
    setSelectedEvalIds(prev => {
      const copy = new Set(prev);
      (comp.evaluations || [])
        .filter(ev => Number(ev.participantId) === Number(pId))
        .forEach(ev => copy.delete(String(ev.id)));
      return copy;
    });
    setDeleteConfirmParticipantId(null);
    context?.showToast('تم حذف تقييمات المتسابق بنجاح وإعادته لحالة «بانتظار التقييم»', 'success');
  };

  // استبعاد غير الحافظين
  const handleExcludeUnmemorizedConfirm = () => {
    if (!onUpdate || !excludeParticipantTarget) return;

    if (excludeParticipantTarget === 'all') {
      const unmemorizedIds = new Set(
        allResults
          .filter(r => r.isUnmemorized)
          .map(r => Number(r.participant.id))
      );
      onUpdate({
        ...comp,
        participants: (comp.participants || []).filter(
          p => !unmemorizedIds.has(Number(p.id))
        ),
        evaluations: (comp.evaluations || []).filter(
          e => !unmemorizedIds.has(Number(e.participantId))
        ),
      });
      context?.showToast(
        `تم استبعاد جميع المتسابقين غير الحافظين (${unmemorizedIds.size}) بنجاح!`,
        'success'
      );
    } else {
      const pId = Number(excludeParticipantTarget.id);
      onUpdate({
        ...comp,
        participants: (comp.participants || []).filter(
          p => Number(p.id) !== pId
        ),
        evaluations: (comp.evaluations || []).filter(
          e => Number(e.participantId) !== pId
        ),
      });
      context?.showToast(
        `تم استبعاد المتسابق "${excludeParticipantTarget.name}" بنجاح!`,
        'success'
      );
    }
    setExcludeParticipantTarget(null);
  };

  const detailResult =
    detailParticipantId !== null
      ? allResults.find(
          r => Number(r.participant.id) === Number(detailParticipantId)
        )
      : null;

  const certCandidates =
    availableResultsList.length > 0 ? availableResultsList : baseFilteredResults;

  const certParticipant =
    selectedParticipantForCert !== null
      ? allResults.find(
          r => Number(r.participant.id) === Number(selectedParticipantForCert)
        ) || certCandidates[0]
      : certCandidates[0];

  const reportHeaderStats = [
    {
      label: 'النتائج المتوفرة',
      value: `${evaluatedStudentsCount} من ${totalStudentsCount}`,
    },
    {
      label: 'الحافظون المتقنون',
      value: memorizedStudentsCount,
    },
    {
      label: 'المتوسط العام',
      value: overallAverage !== null ? `${overallAverage}` : '-',
    },
  ];

  return (
    <div
      className="space-y-5"
      dir="rtl"
      style={{
        letterSpacing: '0px',
        wordSpacing: 'normal',
        fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
      }}
    >
      {/* شريط إحصائيات النتائج المتوفرة السريع أعلى صفحة التقارير */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 no-print">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#09152C] to-[#163363] text-white border border-amber-400/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-amber-200 block">
              النتائج المتوفرة (المرصودة)
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-300 mt-0.5 block">
              {evaluatedStudentsCount}{' '}
              <span className="text-xs font-bold text-blue-100">
                / {totalStudentsCount}
              </span>
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300 shrink-0">
            <FileCheck size={20} />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-emerald-200 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              الحافظون المتقنون
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-white mt-0.5 block">
              {memorizedStudentsCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-slate-700 flex items-center justify-center text-emerald-800 dark:text-amber-300 shrink-0">
            <Trophy size={20} />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-amber-200 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              أعلى نتيجة متوفرة
            </span>
            <span className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-300 mt-0.5 block truncate">
              {topScorerResult
                ? `${topScorerResult.percentage}% (${topScorerResult.averageScore})`
                : 'بانتظار الرصد'}
            </span>
            {topScorerResult && (
              <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-300 block truncate">
                {topScorerResult.participant.name}
              </span>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-slate-700 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
            <Medal size={20} />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border-2 border-sky-200 dark:border-slate-700 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              المتوسط العام بين المقيمين
            </span>
            <span className="text-xl sm:text-2xl font-black text-sky-900 dark:text-sky-300 mt-0.5 block">
              {overallAverage !== null ? overallAverage : '-'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-slate-700 flex items-center justify-center text-sky-700 dark:text-sky-300 shrink-0">
            <BarChart3 size={20} />
          </div>
        </div>
      </div>

      {/* شريط اختيار نوع التقرير المطلوب وأزرار التصدير الاحترافية */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 no-print">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 w-full xl:w-auto">
          <button
            type="button"
            onClick={() => setReportSubTab('rankings')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'rankings'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Trophy size={16} className="text-amber-400 shrink-0" />
            <span>تقرير النتائج والأوائل</span>
          </button>

          <button
            type="button"
            onClick={() => setReportSubTab('comprehensive_merged')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'comprehensive_merged'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'bg-amber-50/80 dark:bg-slate-700/70 text-[#09152C] dark:text-amber-300 border border-amber-300/60 hover:bg-amber-100 dark:hover:bg-slate-700'
            }`}
          >
            <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
            <span>الجدول الشامل المدمج</span>
          </button>

          <button
            type="button"
            onClick={() => setReportSubTab('evaluator_averages')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'evaluator_averages'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <UserCheck size={16} className="text-amber-400 shrink-0" />
            <span>ملخص متوسطات المقيمين</span>
          </button>

          <button
            type="button"
            onClick={() => setReportSubTab('table')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'table'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FileText size={16} className="text-amber-400 shrink-0" />
            <span>كشف الدرجات والفرز</span>
          </button>

          <button
            type="button"
            onClick={() => setReportSubTab('analytics')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'analytics'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BarChart3 size={16} className="text-amber-400 shrink-0" />
            <span>الرسوم البيانية التحليلية</span>
          </button>

          <button
            type="button"
            onClick={() => setReportSubTab('certificate')}
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer ${
              reportSubTab === 'certificate'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Medal size={16} className="text-amber-400 shrink-0" />
            <span>بطاقات التقييم الرسمية</span>
          </button>
        </div>

        {/* أزرار التصدير والطباعة السريعة وإدارة التقييمات */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          {/* زر إدارة وحذف التقييمات */}
          <button
            type="button"
            onClick={() => setShowManageEvalsModal(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="إدارة وحذف التقييمات المسجلة"
          >
            <Sliders size={16} />
            <span>إدارة وحذف التقييمات</span>
            <span className="px-2 py-0.5 rounded-full bg-[#09152C] text-amber-300 text-[11px] font-black">
              {(comp.evaluations || []).length}
            </span>
          </button>

          {(comp.evaluations || []).length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAllEvalsModal(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              title="حذف جميع تقييمات المسابقة"
            >
              <Trash2 size={16} />
              <span>حذف التقييمات كلها</span>
            </button>
          )}

          <button
            type="button"
            onClick={
              reportSubTab === 'comprehensive_merged'
                ? exportComprehensiveMergedExcel
                : exportExcel
            }
            className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <FileSpreadsheet size={16} />
            <span>
              {reportSubTab === 'comprehensive_merged'
                ? 'تصدير الجدول المدمج Excel'
                : 'تصدير Excel الشامل'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Printer size={16} />
            <span>طباعة مباشرة</span>
          </button>

          <button
            type="button"
            disabled={isExportingPdf}
            onClick={() => {
              if (reportSubTab === 'rankings') {
                exportToPdf(
                  'official-report-rankings-container',
                  `تقرير_نتائج_وأوائل_${comp.name}`,
                  true
                );
              } else if (reportSubTab === 'comprehensive_merged') {
                exportToPdf(
                  'official-report-comprehensive-merged-container',
                  `الجدول_الشامل_المدمج_${comp.name}`,
                  true
                );
              } else if (reportSubTab === 'evaluator_averages') {
                exportToPdf(
                  'official-report-evaluator-avg-container',
                  `ملخص_متوسطات_المقيمين_${comp.name}`,
                  true
                );
              } else if (reportSubTab === 'analytics') {
                exportToPdf(
                  'official-report-analytics-container',
                  `تقرير_تحليلي_${comp.name}`,
                  true
                );
              } else if (reportSubTab === 'certificate') {
                exportToPdf(
                  'official-report-cert-container',
                  `بطاقة_نتيجة_${certParticipant?.participant.name || 'المتسابق'}`
                );
              } else {
                exportToPdf(
                  'official-report-table-container',
                  `كشف_درجات_${comp.name}`,
                  true
                );
              }
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-60"
          >
            <Download size={16} />
            <span>
              {isExportingPdf
                ? 'جاري تجهيز الـ PDF...'
                : 'تصدير التقرير PDF بجودة عالية'}
            </span>
          </button>
        </div>
      </div>

      {/* شريط الإجراءات السريعة عند تحديد تقييمات معينة */}
      {selectedEvalIds.size > 0 && (
        <div className="sticky top-2 z-30 p-3 sm:p-4 rounded-2xl bg-[#09152C] text-white border-2 border-amber-400 shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 no-print">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-400 text-[#09152C] flex items-center justify-center font-black text-sm shrink-0">
              {selectedEvalIds.size}
            </span>
            <div>
              <span className="font-black text-xs sm:text-sm text-amber-300">
                تم تحديد {selectedEvalIds.size} تقييم
              </span>
              <p className="text-[11px] text-slate-300">
                يمكنك حذف التقييمات المحددة فقط أو إلغاء التحديد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteSelectedEvalsModal(true)}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Trash2 size={16} />
              <span>حذف التقييمات المحددة فقط ({selectedEvalIds.size})</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedEvalIds(new Set())}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* شريط أدوات التصفية المتقدمة متعددة الاختيارات (حسب حقول ملف الإكسل الـ 8 + المقيم + التقدير) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#09152C]/15 dark:border-slate-800 shadow-sm space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#09152C] text-amber-300 flex items-center justify-center font-black text-xs">
              🔍
            </span>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                أدوات التصفية الشاملة حسب الحقول (اختيار متعدد مع بحث وتحديد/إلغاء الكل)
              </h4>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                إذا لم يتم تحديد أي خيار في القائمة يعني ذلك «الكل» تلقائياً • تنعكس التصفية فوراً على جميع التقارير والرسوم البيانية والتصدير
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 text-xs font-black text-[#09152C] dark:text-amber-300">
              المطابق للتصفية: {baseFilteredResults.length} من {allResults.length}
            </span>
            {hasActiveMultiFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-black transition cursor-pointer"
              >
                إعادة تعيين كافة الفلاتر ✕
              </button>
            )}
          </div>
        </div>

        {/* صف القوائم المنسدلة متعددة الاختيارات مع خانة البحث داخل كل زر تصفية */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          <MultiSelectFilterDropdown
            label="مستوى المشاركة"
            options={filterOptionsMap.levels}
            selectedValues={filterLevels}
            onChange={setFilterLevels}
            placeholder="الكل (جميع المستويات)"
          />
          <MultiSelectFilterDropdown
            label="الولاية"
            options={filterOptionsMap.wilayats}
            selectedValues={filterWilayats}
            onChange={setFilterWilayats}
            placeholder="الكل (جميع الولايات)"
          />
          <MultiSelectFilterDropdown
            label="الجنس"
            options={filterOptionsMap.genders}
            selectedValues={filterGenders}
            onChange={setFilterGenders}
            placeholder="الكل (الذكور والإناث)"
          />
          <MultiSelectFilterDropdown
            label="التقدير العام"
            options={filterOptionsMap.grades}
            selectedValues={filterGrades}
            onChange={setFilterGrades}
            placeholder="الكل (جميع التقديرات)"
          />
          <MultiSelectFilterDropdown
            label="المقيم المعتمد"
            options={filterOptionsMap.evaluators}
            selectedValues={filterEvaluators}
            onChange={setFilterEvaluators}
            placeholder="الكل (جميع المقيمين)"
          />
          <MultiSelectFilterDropdown
            label="رقم الطلب"
            options={filterOptionsMap.requestNumbers}
            selectedValues={filterRequestNumbers}
            onChange={setFilterRequestNumbers}
            placeholder="الكل (جميع أرقام الطلبات)"
          />
          <MultiSelectFilterDropdown
            label="الاسم الكامل"
            options={filterOptionsMap.names}
            selectedValues={filterNames}
            onChange={setFilterNames}
            placeholder="الكل (جميع الأسماء)"
          />
          <MultiSelectFilterDropdown
            label="الرقم المدني"
            options={filterOptionsMap.civilIds}
            selectedValues={filterCivilIds}
            onChange={setFilterCivilIds}
            placeholder="الكل (جميع الأرقام المدنية)"
          />
          <MultiSelectFilterDropdown
            label="رقم الهاتف"
            options={filterOptionsMap.phones}
            selectedValues={filterPhones}
            onChange={setFilterPhones}
            placeholder="الكل (جميع الهواتف)"
          />
          <MultiSelectFilterDropdown
            label="تاريخ التسجيل"
            options={filterOptionsMap.regDates}
            selectedValues={filterRegDates}
            onChange={setFilterRegDates}
            placeholder="الكل (جميع التواريخ)"
          />
        </div>
      </div>

      {/* ================ 1. تبويب تقرير النتائج المتوفرة وترتيب الأوائل ================ */}
      {reportSubTab === 'rankings' && (
        <div
          id="official-report-rankings-container"
          dir="rtl"
          style={{
            letterSpacing: '0px',
            fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
          }}
          className="bg-white dark:bg-slate-900 p-4 sm:p-7 rounded-3xl border-2 border-amber-300/80 dark:border-slate-800 shadow-xl space-y-6"
        >
          {/* الديباجة الرسمية ونص الموسم */}
          <OfficialReportHeader
            seasonText={comp.seasonText}
            compName={comp.name}
            reportTitle="التقرير الرسمي للنتائج المتوفرة وترتيب الأوائل"
            reportSubtitle="بيان رسمي بنتائج المتسابقين المرصودة وتفصيل درجات المقاطع ومراكز التفوق المعتمدة"
            metaStats={reportHeaderStats}
          />

          {/* شريط التحكم في المستوى وإظهار النتائج المتوفرة (لا يظهر في الطباعة) */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                نطاق العرض في التقرير:
              </span>
              <button
                type="button"
                onClick={() => setShowOnlyAvailableInRankings(true)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  showOnlyAvailableInRankings
                    ? 'bg-[#09152C] text-amber-300 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                }`}
              >
                <Check size={14} />
                <span>النتائج المتوفرة المرصودة ({evaluatedStudentsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setShowOnlyAvailableInRankings(false)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  !showOnlyAvailableInRankings
                    ? 'bg-[#09152C] text-amber-300 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                }`}
              >
                <Users size={14} />
                <span>جميع المسجلين بالمستويات ({totalStudentsCount})</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={14} />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() =>
                  exportToPdf(
                    'official-report-rankings-container',
                    `تقرير_نتائج_وأوائل_${comp.name}`,
                    true
                  )
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#09152C] hover:bg-[#163363] text-amber-300 font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>تصدير PDF</span>
              </button>
            </div>
          </div>

          {/* أولاً: ملخص النتائج المتوفرة حسب كل مستوى (منصة التتويج + جدول المستوى ذي الحقول المتعددة) */}
          <div className="space-y-7">
            {(() => {
              const targetLevels = (comp.levels || []).filter(l => {
                if (
                  selectedLevelId !== 'all' &&
                  Number(l.id) !== Number(selectedLevelId)
                ) {
                  return false;
                }
                if (
                  filterLevels.length > 0 &&
                  !filterLevels.includes(String(l.id))
                ) {
                  return false;
                }
                return true;
              });

              const levelsWithEvaluations = targetLevels.filter(lvl =>
                baseFilteredResults.some(
                  r =>
                    Number(r.effectiveLevelId) === Number(lvl.id) &&
                    r.evaluationsCount > 0
                )
              );

              const levelsToRender =
                showOnlyAvailableInRankings && levelsWithEvaluations.length > 0
                  ? levelsWithEvaluations
                  : targetLevels;

              if (levelsToRender.length === 0) {
                return (
                  <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center space-y-2">
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                      لا يوجد متسابقون مطابقون للتصفية الحالية في هذا المستوى
                    </p>
                  </div>
                );
              }

              return levelsToRender.map(lvl => {
                const levelSegmentsCount = Math.max(
                  1,
                  Number(lvl.segmentsCount || 5)
                );
                const levelAllParticipants = baseFilteredResults.filter(
                  r => Number(r.effectiveLevelId) === Number(lvl.id)
                );
                const levelAvailableResults = levelAllParticipants
                  .filter(r => r.evaluationsCount > 0)
                  .sort((a, b) => {
                    if (a.isUnmemorized && !b.isUnmemorized) return 1;
                    if (!a.isUnmemorized && b.isUnmemorized) return -1;
                    return (b.averageScore || 0) - (a.averageScore || 0);
                  });

                const levelWinners = levelAvailableResults.filter(
                  r => r.averageScore !== null && !r.isUnmemorized
                );

                const rowsToShow =
                  showOnlyAvailableInRankings && levelAvailableResults.length > 0
                    ? levelAvailableResults
                    : levelAllParticipants.sort((a, b) => {
                        if (a.evaluationsCount > 0 && b.evaluationsCount === 0)
                          return -1;
                        if (a.evaluationsCount === 0 && b.evaluationsCount > 0)
                          return 1;
                        if (a.isUnmemorized && !b.isUnmemorized) return 1;
                        if (!a.isUnmemorized && b.isUnmemorized) return -1;
                        return (b.averageScore || 0) - (a.averageScore || 0);
                      });

                const avgLevelScore =
                  levelWinners.length > 0
                    ? Number(
                        (
                          levelWinners.reduce(
                            (sum, r) => sum + (r.averageScore || 0),
                            0
                          ) / levelWinners.length
                        ).toFixed(2)
                      )
                    : null;

                const avgLevelPercent =
                  levelWinners.length > 0
                    ? Number(
                        (
                          levelWinners.reduce(
                            (sum, r) => sum + (r.percentage || 0),
                            0
                          ) / levelWinners.length
                        ).toFixed(1)
                      )
                    : null;

                return (
                  <div
                    key={lvl.id}
                    className="rounded-3xl overflow-hidden border-2 border-[#163363]/30 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-md"
                  >
                    {/* رأس بطاقة المستوى الرسمي */}
                    <div className="bg-gradient-to-l from-[#09152C] via-[#163363] to-[#09152C] text-white px-4 py-3.5 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-400">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shrink-0">
                          <Medal size={20} />
                        </div>
                        <div>
                          <h4 className="font-black text-base sm:text-lg text-amber-300">
                            {lvl.name}
                          </h4>
                          <p className="text-[11px] sm:text-xs font-bold text-blue-100/90">
                            المقرر المعتمد: {lvl.juzsOrSurahs} • عدد المقاطع:{' '}
                            {levelSegmentsCount} • الدرجة العظمى: {lvl.maxScore}{' '}
                            درجة
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/20 text-xs font-black text-amber-200">
                          النتائج المتوفرة: {levelAvailableResults.length} من{' '}
                          {levelAllParticipants.length}
                        </span>
                        {avgLevelScore !== null && (
                          <span className="px-3 py-1 rounded-xl bg-amber-400 text-[#09152C] text-xs font-black">
                            متوسط المستوى: {avgLevelScore} / {lvl.maxScore} (
                            {avgLevelPercent}%)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 space-y-5">
                      {/* منصة تتويج المراكز الثلاثة الأولى في المستوى (إن توفرت نتائج) */}
                      {levelWinners.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Trophy size={16} className="text-amber-500" />
                            <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                              لوحة شرف المراكز الأولى في {lvl.name}
                            </h5>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                            {levelWinners.slice(0, 3).map((w, wIdx) => {
                              const cardStyles =
                                wIdx === 0
                                  ? 'bg-gradient-to-br from-amber-50 via-amber-100/70 to-amber-50 border-amber-400 text-slate-900 shadow-sm'
                                  : wIdx === 1
                                  ? 'bg-gradient-to-br from-slate-50 via-slate-100 to-white border-slate-300 text-slate-900'
                                  : 'bg-gradient-to-br from-orange-50/70 via-amber-50/50 to-white border-amber-700/40 text-slate-900';

                              const rankBadgeStyles =
                                wIdx === 0
                                  ? 'bg-[#09152C] text-amber-300 border border-amber-400'
                                  : wIdx === 1
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-amber-800 text-amber-100';

                              const medalTitle =
                                wIdx === 0
                                  ? 'المركز الأول 🥇'
                                  : wIdx === 1
                                  ? 'المركز الثاني 🥈'
                                  : 'المركز الثالث 🥉';

                              return (
                                <div
                                  key={w.participant.id}
                                  className={`p-4 rounded-2xl border-2 ${cardStyles} flex flex-col justify-between space-y-3`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`px-3 py-1 rounded-xl font-black text-xs ${rankBadgeStyles}`}
                                    >
                                      {medalTitle}
                                    </span>
                                    <span
                                      className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-black ${w.gradeInfo.badgeClass}`}
                                    >
                                      {w.gradeInfo.label}
                                    </span>
                                  </div>

                                  <div>
                                    <div className="font-black text-base sm:text-lg text-[#09152C]">
                                      {w.participant.name}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] font-bold text-slate-600">
                                      {w.participant.wilayat && (
                                        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200">
                                          الولاية: {w.participant.wilayat}
                                        </span>
                                      )}
                                      {w.participant.gender && (
                                        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200">
                                          {w.participant.gender}
                                        </span>
                                      )}
                                      {w.participant.requestNumber && (
                                        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200">
                                          طلب #{w.participant.requestNumber}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs font-bold text-slate-600 mt-1">
                                      المقرر:{' '}
                                      {w.participant.juzsOrSurahs ||
                                        lvl.juzsOrSurahs}
                                    </div>
                                  </div>

                                  <div className="pt-2.5 border-t border-amber-900/15 flex items-center justify-between">
                                    <div>
                                      <span className="text-[11px] font-bold text-slate-500 block">
                                        المتوسط النهائي
                                      </span>
                                      <span className="text-sm sm:text-base font-black text-[#09152C]">
                                        {w.averageScore} من {w.maxScore}
                                      </span>
                                    </div>
                                    <div className="text-left">
                                      <span className="text-[11px] font-bold text-slate-500 block">
                                        النسبة المئوية
                                      </span>
                                      <span className="text-base sm:text-lg font-black text-amber-700">
                                        {w.percentage}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* جدول المستوى الرسمي ذو الحقول والعناوين المتعددة */}
                      {rowsToShow.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <FileText size={15} className="text-emerald-700" />
                              <span>
                                جدول النتائج الرسمي التفصيلي - {lvl.name} (
                                {rowsToShow.length} متسابق)
                              </span>
                            </h5>
                          </div>

                          <div className="overflow-x-auto border-2 border-[#09152C]/25 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 shadow-2xs">
                            <table className="w-full text-right text-xs border-collapse">
                              <thead>
                                {/* الصف الأول من عناوين الحقول المجمعة */}
                                <tr className="bg-[#09152C] text-amber-300 font-black border-b border-amber-400/50 text-[11px] sm:text-xs">
                                  <th
                                    rowSpan={2}
                                    className="p-2.5 w-16 text-center border-l border-white/15 bg-[#071022]"
                                  >
                                    المركز
                                  </th>
                                  <th
                                    colSpan={5}
                                    className="p-2 text-center border-l border-white/15"
                                  >
                                    بيانات المتسابق والمقرر القرآني
                                  </th>
                                  <th
                                    colSpan={levelSegmentsCount + 1}
                                    className="p-2 text-center border-l border-white/15 bg-[#12264A]"
                                  >
                                    تفصيل درجات المقاطع ورصد المقيمين
                                  </th>
                                  <th
                                    colSpan={5}
                                    className="p-2 text-center bg-[#09152C]"
                                  >
                                    خلاصة النتيجة النهائية والتقدير العام
                                  </th>
                                </tr>
                                {/* الصف الثاني من عناوين الحقول التفصيلية */}
                                <tr className="bg-[#163363] text-white font-black border-b-2 border-amber-400 text-[11px]">
                                  <th className="p-2 text-center border-l border-white/15 w-20">
                                    رقم الطلب
                                  </th>
                                  <th className="p-2.5 border-l border-white/15 min-w-[140px]">
                                    الاسم الكامل
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-20">
                                    الولاية
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-16">
                                    الجنس
                                  </th>
                                  <th className="p-2.5 border-l border-white/15 min-w-[100px]">
                                    المقرر / الأجزاء
                                  </th>
                                  {Array.from(
                                    { length: levelSegmentsCount },
                                    (_, sIdx) => (
                                      <th
                                        key={sIdx}
                                        className="p-2 text-center border-l border-white/15 w-12 bg-[#1D3F7A]"
                                      >
                                        م{sIdx + 1}
                                      </th>
                                    )
                                  )}
                                  <th className="p-2.5 border-l border-white/15 min-w-[155px] bg-[#1D3F7A]">
                                    درجات المقيمين
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-16">
                                    العظمى
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-16">
                                    الخصم
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-24 bg-amber-500/20 text-amber-200">
                                    المتوسط النهائي
                                  </th>
                                  <th className="p-2 text-center border-l border-white/15 w-20">
                                    النسبة
                                  </th>
                                  <th className="p-2 text-center w-32">
                                    التقدير العام
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold">
                                {rowsToShow.map((w, rIdx) => {
                                  const isTop3 =
                                    w.rankInLevel !== null && w.rankInLevel <= 3;
                                  return (
                                    <tr
                                      key={w.participant.id}
                                      className={
                                        isTop3
                                          ? 'bg-amber-50/45 dark:bg-amber-950/15'
                                          : rIdx % 2 === 1
                                          ? 'bg-slate-50/80 dark:bg-slate-800/30'
                                          : 'bg-white dark:bg-slate-900'
                                      }
                                    >
                                      <td className="p-2.5 text-center font-black border-l border-slate-200 dark:border-slate-800">
                                        {w.isUnmemorized ? (
                                          <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[10px]">
                                            غير حافظ
                                          </span>
                                        ) : w.rankInLevel !== null ? (
                                          <span
                                            className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-xl text-xs font-black ${
                                              w.rankInLevel === 1
                                                ? 'bg-amber-400 text-[#09152C] shadow-2xs'
                                                : w.rankInLevel === 2
                                                ? 'bg-slate-300 text-slate-900'
                                                : w.rankInLevel === 3
                                                ? 'bg-amber-700 text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                            }`}
                                          >
                                            {w.rankInLevel === 1
                                              ? 'الأول 🥇'
                                              : w.rankInLevel === 2
                                              ? 'الثاني 🥈'
                                              : w.rankInLevel === 3
                                              ? 'الثالث 🥉'
                                              : w.rankInLevel}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>

                                      <td className="p-2 text-center font-mono text-[11px] text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                                        {w.participant.requestNumber || '-'}
                                      </td>

                                      <td className="p-2.5 font-black text-slate-900 dark:text-white text-xs sm:text-sm border-l border-slate-200 dark:border-slate-800">
                                        <div>{w.participant.name}</div>
                                        {(w.participant.civilId || w.participant.phone) && (
                                          <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                                            {w.participant.civilId && `مدني: ${w.participant.civilId}`}
                                            {w.participant.civilId && w.participant.phone && ' • '}
                                            {w.participant.phone && `هاتف: ${w.participant.phone}`}
                                          </div>
                                        )}
                                      </td>

                                      <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                                        {w.participant.wilayat || '-'}
                                      </td>

                                      <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                                        {w.participant.gender || '-'}
                                      </td>

                                      <td className="p-2.5 text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                                        {w.participant.juzsOrSurahs ||
                                          lvl.juzsOrSurahs}
                                      </td>

                                      {/* أعمدة درجات المقاطع م1 .. مN */}
                                      {Array.from(
                                        { length: levelSegmentsCount },
                                        (_, sIdx) => {
                                          const segVal =
                                            w.segmentAverages[sIdx] ?? null;
                                          return (
                                            <td
                                              key={sIdx}
                                              className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-xs text-slate-800 dark:text-slate-200 bg-slate-50/40 dark:bg-slate-800/20"
                                            >
                                              {w.isUnmemorized ? (
                                                <span className="text-red-600 text-[10px]">
                                                  0
                                                </span>
                                              ) : segVal !== null ? (
                                                segVal
                                              ) : (
                                                <span className="text-slate-300">
                                                  -
                                                </span>
                                              )}
                                            </td>
                                          );
                                        }
                                      )}

                                      {/* عمود رصد المقيمين */}
                                      <td className="p-2 border-l border-slate-200 dark:border-slate-800">
                                        {w.evaluations.length > 0 ? (
                                          <div className="space-y-1">
                                            {w.evaluations.map((ev, evIdx) => (
                                              <div
                                                key={ev.id || evIdx}
                                                className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] flex items-center justify-between gap-1.5"
                                              >
                                                <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                                                  {getEvaluatorName(
                                                    ev.evaluatorId,
                                                    ev.evaluatorName
                                                  )}
                                                </span>
                                                <strong className="text-emerald-800 dark:text-amber-300 font-black shrink-0">
                                                  {ev.isUnmemorized
                                                    ? '0 (غير حافظ)'
                                                    : ev.totalScore}
                                                </strong>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 text-[11px]">
                                            بانتظار التقييم
                                          </span>
                                        )}
                                      </td>

                                      <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 text-xs font-black text-slate-600 dark:text-slate-400">
                                        {w.maxScore}
                                      </td>

                                      <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 text-xs font-black text-red-600 dark:text-red-400">
                                        {w.isUnmemorized
                                          ? w.maxScore
                                          : w.totalDeductions !== null
                                          ? w.totalDeductions
                                          : '-'}
                                      </td>

                                      <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/35 dark:bg-amber-950/10">
                                        {w.isUnmemorized ? (
                                          <span className="text-red-600 font-black text-xs">
                                            0
                                          </span>
                                        ) : w.averageScore !== null ? (
                                          <span className="font-black text-sm sm:text-base text-[#09152C] dark:text-amber-300">
                                            {w.averageScore}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>

                                      <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-emerald-800 dark:text-emerald-300">
                                        {w.percentage !== null && !w.isUnmemorized
                                          ? `${w.percentage}%`
                                          : '-'}
                                      </td>

                                      <td className="p-2 text-center">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded-xl border text-[11px] font-black ${w.gradeInfo.badgeClass}`}
                                        >
                                          {w.gradeInfo.label}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              {levelWinners.length > 0 && (
                                <tfoot>
                                  <tr className="bg-slate-100 dark:bg-slate-800/90 border-t-2 border-[#09152C]/30 font-black text-xs text-slate-900 dark:text-amber-200">
                                    <td
                                      colSpan={6 + levelSegmentsCount + 1}
                                      className="p-2.5 text-left border-l border-slate-300 dark:border-slate-700"
                                    >
                                      خلاصة متوسط أداء الحافظين في {lvl.name} (
                                      {levelWinners.length} متسابق):
                                    </td>
                                    <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700">
                                      {lvl.maxScore}
                                    </td>
                                    <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700 text-red-700 dark:text-red-400">
                                      {avgLevelScore !== null
                                        ? Number(
                                            (lvl.maxScore - avgLevelScore).toFixed(
                                              2
                                            )
                                          )
                                        : '-'}
                                    </td>
                                    <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700 bg-amber-100/70 dark:bg-amber-950/30 text-[#09152C] dark:text-amber-300 text-sm">
                                      {avgLevelScore}
                                    </td>
                                    <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700 text-emerald-800 dark:text-emerald-300">
                                      {avgLevelPercent}%
                                    </td>
                                    <td className="p-2.5 text-center">
                                      متوسط المستوى
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-center text-xs font-bold text-slate-500">
                          لا يوجد متسابقون مقيمون في {lvl.name} حتى الآن.
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* خانة الاعتماد والتوقيعات الرسمية في أسفل التقرير */}
          <div className="pdf-avoid-break pt-8 mt-8 border-t-2 border-amber-400/60 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p className="text-[#09152C] dark:text-amber-300">
                لجنة التحكيم والتقييم
              </p>
              <p className="mt-8 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p className="text-[#09152C] dark:text-amber-300">
                رئيس لجنة المسابقة
              </p>
              <p className="mt-8 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p className="text-[#09152C] dark:text-amber-300">
                مدير إدارة الأوقاف والشؤون الدينية
              </p>
              <p className="mt-8 text-slate-400 font-bold">
                التوقيع والختم: ..........................
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================ 1-ب. تبويب الجدول الشامل المدمج (جميع بيانات المتسابق مدمجة + صفوف مقسمة للمقيمين + خلايا مدمجة للمتوسطات والدرجة النهائية) ================ */}
      {reportSubTab === 'comprehensive_merged' && (
        <div
          id="official-report-comprehensive-merged-container"
          dir="rtl"
          style={{
            letterSpacing: '0px',
            fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
          }}
          className="bg-white dark:bg-slate-900 p-4 sm:p-7 rounded-3xl border-2 border-amber-300/80 dark:border-slate-800 shadow-xl space-y-5"
        >
          <OfficialReportHeader
            seasonText={comp.seasonText}
            compName={comp.name}
            reportTitle="التقرير الجدولي الشامل المدمج لجميع المتسابقين والتقييمات"
            reportSubtitle="سجل شامل موحد لكل متسابق: بيانات المتسابق (خلايا مدمجة) • تقييمات كل مقيم (خلايا مقسمة: كل مقيم في صف) • المتوسطات والدرجة النهائية المعتمدة (خلايا مدمجة)"
            metaStats={reportHeaderStats}
          />

          {/* شريط التحكم والتصدير الخاص بالجدول الشامل المدمج */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 no-print">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 ml-1">
                نطاق العرض:
              </span>
              {[
                {
                  id: 'available',
                  label: `النتائج المتوفرة المرصودة (${evaluatedStudentsCount})`,
                },
                {
                  id: 'all',
                  label: `جميع المتسابقين (${baseFilteredResults.length})`,
                },
                {
                  id: 'multi_evaluated',
                  label: `تقييم مشترك أكثر من مقيم (${multiEvaluatedCount})`,
                },
                {
                  id: 'memorized',
                  label: `الحافظون المتقنون (${memorizedStudentsCount})`,
                },
              ].map(btn => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setEvalStatusFilter(btn.id as any)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                    effectiveStatusFilter === btn.id
                      ? 'bg-[#09152C] text-amber-300 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as any)}
                className="min-h-[38px] px-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
              >
                <option value="score_desc">ترتيب: الدرجة (من الأعلى للأقل)</option>
                <option value="score_asc">ترتيب: الدرجة (من الأقل للأعلى)</option>
                <option value="name">ترتيب: الاسم الكامل (أبجدي)</option>
                <option value="level">ترتيب: مستوى المشاركة</option>
                <option value="wilayat">ترتيب: الولاية</option>
                <option value="request_num">ترتيب: رقم الطلب</option>
              </select>

              <button
                type="button"
                onClick={exportComprehensiveMergedExcel}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet size={15} />
                <span>تصدير الجدول الشامل المدمج (Excel)</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() =>
                  exportToPdf(
                    'official-report-comprehensive-merged-container',
                    `الجدول_الشامل_المدمج_${comp.name}`,
                    true
                  )
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#09152C] hover:bg-[#163363] text-amber-300 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download size={15} />
                <span>تصدير الجدول الشامل المدمج (PDF)</span>
              </button>
            </div>
          </div>

          {/* دليل الألوان وتقسيم الخانات في الجدول المدمج */}
          <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <span className="font-black text-slate-700 dark:text-slate-200">
              هيكل السجل الواحد لكل متسابق:
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#09152C] text-amber-300 text-[11px] font-black">
              1. بيانات المتسابق الكاملة (خلايا مدمجة عمودياً)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-black">
              2. بيانات التقييم لكل مقيم (خلايا مقسمة — كل مقيم في صف مستقل)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black">
              3. المتوسطات والدرجة النهائية والتقدير (خلايا مدمجة عمودياً)
            </span>
          </div>

          {/* الجدول الشامل المدمج */}
          {(() => {
            const maxSegs = Math.max(
              1,
              ...(comp.levels || []).map(l => Number(l.segmentsCount || 3)),
              ...filteredResults.map(r => Number(r.segmentsCount || 3))
            );

            return (
              <div className="border-2 border-[#09152C]/40 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[11px] border-collapse">
                    <thead>
                      {/* الصف الأول: المجموعات الثلاث */}
                      <tr className="text-white font-black text-xs border-b border-amber-400">
                        <th
                          colSpan={13}
                          className="p-2.5 text-center bg-[#09152C] text-amber-300 border-l-2 border-amber-400"
                        >
                          أولاً: بيانات المتسابق الأساسية والمقرر القرآني (خلايا مدمجة لكل متسابق)
                        </th>
                        <th
                          colSpan={4 + maxSegs}
                          className="p-2.5 text-center bg-[#1D4ED8] text-white border-l-2 border-amber-400"
                        >
                          ثانياً: بيانات التقييم التفصيلية لكل مقيم (خلايا مقسمة — كل مقيم في صف مستقل)
                        </th>
                        <th
                          colSpan={7 + maxSegs}
                          className="p-2.5 text-center bg-[#064E3B] text-amber-200"
                        >
                          ثالثاً: خلاصة المتوسطات والدرجة النهائية المعتمدة (خلايا مدمجة لكل متسابق)
                        </th>
                      </tr>

                      {/* الصف الثاني: أسماء الأعمدة */}
                      <tr className="font-black text-[10px] sm:text-[11px] text-white border-b-2 border-[#09152C]">
                        {/* أعمدة بيانات المتسابق (13 عموداً) */}
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-9">
                          م
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-14">
                          المركز
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-12">
                          العام
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-16">
                          رقم الطلب
                        </th>
                        <th className="p-2 text-right bg-[#1E293B] border-l border-white/15 min-w-[140px]">
                          الاسم الكامل
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-20">
                          الرقم المدني
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-20">
                          رقم الهاتف
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-12">
                          الجنس
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-16">
                          الولاية
                        </th>
                        <th className="p-2 text-right bg-[#1E293B] border-l border-white/15 min-w-[105px]">
                          مستوى المشاركة
                        </th>
                        <th className="p-2 text-right bg-[#1E293B] border-l border-white/15 min-w-[110px]">
                          المقرر / الأجزاء
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l border-white/15 w-20">
                          تاريخ التسجيل
                        </th>
                        <th className="p-2 text-center bg-[#1E293B] border-l-2 border-amber-400 w-12">
                          العظمى
                        </th>

                        {/* أعمدة تقييمات كل مقيم المقسمة */}
                        <th className="p-2 text-right bg-[#1E40AF] border-l border-white/15 min-w-[125px] text-amber-200">
                          المقيم المعتمد
                        </th>
                        {Array.from({ length: maxSegs }, (_, sIdx) => (
                          <th
                            key={`ev-seg-h-${sIdx}`}
                            className="p-1.5 text-center bg-[#1E40AF] border-l border-white/15 w-11"
                          >
                            م{sIdx + 1}
                          </th>
                        ))}
                        <th className="p-2 text-center bg-[#1E40AF] border-l border-white/15 w-14">
                          خصم المقيم
                        </th>
                        <th className="p-2 text-center bg-[#1E3A8A] border-l border-white/15 w-16 text-amber-200">
                          درجة المقيم
                        </th>
                        <th className="p-2 text-right bg-[#1E40AF] border-l-2 border-amber-400 min-w-[110px]">
                          ملاحظات المقيم
                        </th>

                        {/* أعمدة المتوسطات والدرجة النهائية المدمجة */}
                        {Array.from({ length: maxSegs }, (_, sIdx) => (
                          <th
                            key={`avg-seg-h-${sIdx}`}
                            className="p-1.5 text-center bg-[#047857] border-l border-white/15 w-12"
                          >
                            متوسط م{sIdx + 1}
                          </th>
                        ))}
                        <th className="p-2 text-center bg-[#047857] border-l border-white/15 w-14">
                          أعلى/أدنى
                        </th>
                        <th className="p-2 text-center bg-[#047857] border-l border-white/15 w-12">
                          الفارق
                        </th>
                        <th className="p-2 text-center bg-[#047857] border-l border-white/15 w-14">
                          متوسط الخصم
                        </th>
                        <th className="p-2 text-center bg-[#065F46] border-l border-white/15 w-20 text-amber-300">
                          الدرجة النهائية
                        </th>
                        <th className="p-2 text-center bg-[#047857] border-l border-white/15 w-16">
                          النسبة
                        </th>
                        <th className="p-2 text-center bg-[#047857] w-28">
                          التقدير العام
                        </th>
                      </tr>
                    </thead>

                    {filteredResults.map((r, sIdx) => {
                      const evals = r.evaluations.length > 0 ? r.evaluations : [null];
                      const spanCount = evals.length;
                      const isTop3 =
                        r.rankInLevel !== null &&
                        r.rankInLevel <= 3 &&
                        !r.isUnmemorized;

                      const studentMergedBg = r.isUnmemorized
                        ? 'bg-rose-50/70 dark:bg-rose-950/20'
                        : isTop3
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : sIdx % 2 === 0
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/90 dark:bg-slate-800/40';

                      const summaryMergedBg = r.isUnmemorized
                        ? 'bg-rose-50/80 dark:bg-rose-950/30'
                        : sIdx % 2 === 0
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                        : 'bg-emerald-100/40 dark:bg-emerald-950/30';

                      return (
                        <tbody
                          key={r.participant.id}
                          className="pdf-avoid-break border-b-2 border-[#09152C] dark:border-slate-600 font-bold"
                          style={{
                            pageBreakInside: 'avoid',
                            breakInside: 'avoid',
                          }}
                        >
                          {evals.map((ev, evIdx) => {
                            const evRowBg =
                              evIdx % 2 === 0
                                ? 'bg-sky-50/80 dark:bg-sky-950/25'
                                : 'bg-blue-100/60 dark:bg-blue-950/40';

                            const evScore = ev
                              ? ev.isUnmemorized
                                ? 0
                                : Number(ev.totalScore ?? 0)
                              : null;
                            const evDeduction =
                              ev && evScore !== null
                                ? ev.isUnmemorized
                                  ? r.maxScore
                                  : Math.max(
                                      0,
                                      Number((r.maxScore - evScore).toFixed(2))
                                    )
                                : null;

                            return (
                              <tr
                                key={`${r.participant.id}-ev-${evIdx}`}
                                className="border-b border-sky-200 dark:border-slate-700"
                              >
                                {/* 1. خلايا بيانات المتسابق المدمجة (تظهر في الصف الأول للمتسابق وتمتد بعدد المقيمين) */}
                                {evIdx === 0 && (
                                  <>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-black text-slate-500 ${studentMergedBg}`}
                                    >
                                      {sIdx + 1}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-black ${studentMergedBg}`}
                                    >
                                      {r.isUnmemorized ? (
                                        <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">
                                          غير حافظ
                                        </span>
                                      ) : r.rankInLevel !== null ? (
                                        <span
                                          className={`inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-[11px] font-black ${
                                            r.rankInLevel === 1
                                              ? 'bg-amber-400 text-[#09152C]'
                                              : r.rankInLevel === 2
                                              ? 'bg-slate-300 text-slate-900'
                                              : r.rankInLevel === 3
                                              ? 'bg-amber-700 text-white'
                                              : 'bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                                          }`}
                                        >
                                          {r.rankInLevel === 1
                                            ? '1 🥇'
                                            : r.rankInLevel === 2
                                            ? '2 🥈'
                                            : r.rankInLevel === 3
                                            ? '3 🥉'
                                            : r.rankInLevel}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-black text-slate-600 dark:text-slate-400 ${studentMergedBg}`}
                                    >
                                      {r.overallRank !== null && !r.isUnmemorized
                                        ? r.overallRank
                                        : '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.participant.requestNumber || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2.5 text-right align-middle border-l border-slate-300 dark:border-slate-700 font-black text-slate-900 dark:text-white text-xs ${studentMergedBg}`}
                                    >
                                      {r.participant.name}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.participant.civilId || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 font-mono text-[10px] text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.participant.phone || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.participant.gender || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.participant.wilayat || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-right align-middle border-l border-slate-300 dark:border-slate-700 font-black text-indigo-950 dark:text-indigo-200 ${studentMergedBg}`}
                                    >
                                      {r.level?.name || '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-right align-middle border-l border-slate-300 dark:border-slate-700 font-bold text-emerald-800 dark:text-emerald-300 text-[10px] ${studentMergedBg}`}
                                    >
                                      {formatJuzsOrSurahsDisplay(
                                        r.participant.juzsOrSurahs ||
                                          r.level?.juzsOrSurahs ||
                                          ''
                                      )}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-slate-300 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400 ${studentMergedBg}`}
                                    >
                                      {r.participant.registrationDate
                                        ? r.participant.registrationDate.split(' ')[0]
                                        : '-'}
                                    </td>
                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l-2 border-[#09152C] font-black text-slate-700 dark:text-slate-300 ${studentMergedBg}`}
                                    >
                                      {r.maxScore}
                                    </td>
                                  </>
                                )}

                                {/* 2. خلايا التقييم المقسمة لكل مقيم (كل مقيم في صف مستقل) */}
                                <td
                                  className={`p-2 text-right align-middle border-l border-sky-200 dark:border-slate-700 font-black text-blue-950 dark:text-sky-200 ${evRowBg}`}
                                >
                                  {ev ? (
                                    <div className="flex items-center justify-between gap-1">
                                      <span>
                                        {getEvaluatorName(
                                          ev.evaluatorId,
                                          ev.evaluatorName
                                        )}
                                      </span>
                                      {spanCount > 1 && (
                                        <span className="px-1.5 py-0.2 rounded bg-blue-900/10 text-[9px] text-blue-900 dark:text-sky-300">
                                          مقيم {evIdx + 1}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">
                                      بانتظار التقييم
                                    </span>
                                  )}
                                </td>

                                {Array.from({ length: maxSegs }, (_, segIdx) => {
                                  if (segIdx >= (r.segmentsCount || maxSegs)) {
                                    return (
                                      <td
                                        key={`ev-seg-${segIdx}`}
                                        className={`p-1.5 text-center align-middle border-l border-sky-200 dark:border-slate-700 text-slate-300 ${evRowBg}`}
                                      >
                                        —
                                      </td>
                                    );
                                  }
                                  const foundSeg = ev
                                    ? (ev.segments || []).find(
                                        (s: any, i: number) =>
                                          Number(s.segmentNumber || i + 1) ===
                                          segIdx + 1
                                      )
                                    : null;
                                  return (
                                    <td
                                      key={`ev-seg-${segIdx}`}
                                      className={`p-1.5 text-center align-middle border-l border-sky-200 dark:border-slate-700 font-black text-slate-800 dark:text-slate-100 ${evRowBg}`}
                                    >
                                      {ev ? (
                                        ev.isUnmemorized ||
                                        foundSeg?.isUnmemorized ? (
                                          <span className="text-red-600 text-[10px]">
                                            0
                                          </span>
                                        ) : foundSeg ? (
                                          foundSeg.score
                                        ) : (
                                          '-'
                                        )
                                      ) : (
                                        '-'
                                      )}
                                    </td>
                                  );
                                })}

                                <td
                                  className={`p-2 text-center align-middle border-l border-sky-200 dark:border-slate-700 font-black text-rose-700 dark:text-rose-400 ${evRowBg}`}
                                >
                                  {evDeduction !== null ? evDeduction : '-'}
                                </td>

                                <td
                                  className={`p-2 text-center align-middle border-l border-sky-200 dark:border-slate-700 font-black text-xs bg-sky-200/50 dark:bg-sky-900/40 text-[#09152C] dark:text-amber-300`}
                                >
                                  {ev ? (
                                    ev.isUnmemorized ? (
                                      <span className="text-red-600 text-[10px]">
                                        غير حافظ (0)
                                      </span>
                                    ) : (
                                      ev.totalScore
                                    )
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>

                                <td
                                  className={`p-2 text-right align-middle border-l-2 border-[#09152C] text-[10px] text-slate-600 dark:text-slate-300 ${evRowBg}`}
                                >
                                  {ev?.notes ? ev.notes : '-'}
                                </td>

                                {/* 3. خلايا المتوسطات والدرجة النهائية المدمجة (تظهر في الصف الأول للمتسابق وتمتد بعدد المقيمين) */}
                                {evIdx === 0 && (
                                  <>
                                    {Array.from(
                                      { length: maxSegs },
                                      (_, segIdx) => {
                                        if (
                                          segIdx >= (r.segmentsCount || maxSegs)
                                        ) {
                                          return (
                                            <td
                                              key={`avg-seg-${segIdx}`}
                                              rowSpan={spanCount}
                                              className={`p-1.5 text-center align-middle border-l border-emerald-200 dark:border-slate-700 text-slate-300 ${summaryMergedBg}`}
                                            >
                                              —
                                            </td>
                                          );
                                        }
                                        const avgVal = r.segmentAverages[segIdx];
                                        return (
                                          <td
                                            key={`avg-seg-${segIdx}`}
                                            rowSpan={spanCount}
                                            className={`p-1.5 text-center align-middle border-l border-emerald-200 dark:border-slate-700 font-black text-emerald-950 dark:text-emerald-200 ${summaryMergedBg}`}
                                          >
                                            {r.isUnmemorized
                                              ? 0
                                              : avgVal !== null &&
                                                avgVal !== undefined
                                              ? avgVal
                                              : '-'}
                                          </td>
                                        );
                                      }
                                    )}

                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-emerald-200 dark:border-slate-700 text-[10px] font-black ${summaryMergedBg}`}
                                    >
                                      {r.highestEvalScore !== null &&
                                      r.lowestEvalScore !== null ? (
                                        <div>
                                          <span className="text-emerald-700 dark:text-emerald-300">
                                            {r.highestEvalScore}
                                          </span>
                                          <span className="text-slate-400 mx-0.5">
                                            /
                                          </span>
                                          <span className="text-amber-700 dark:text-amber-300">
                                            {r.lowestEvalScore}
                                          </span>
                                        </div>
                                      ) : (
                                        '-'
                                      )}
                                    </td>

                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-emerald-200 dark:border-slate-700 font-black ${summaryMergedBg}`}
                                    >
                                      {r.evaluationsCount > 1 ? (
                                        <span
                                          className={
                                            r.evalSpread > 5
                                              ? 'text-red-600'
                                              : 'text-slate-700 dark:text-slate-300'
                                          }
                                        >
                                          {r.evalSpread}
                                        </span>
                                      ) : (
                                        '-'
                                      )}
                                    </td>

                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-emerald-200 dark:border-slate-700 font-black text-rose-700 dark:text-rose-400 ${summaryMergedBg}`}
                                    >
                                      {r.isUnmemorized
                                        ? r.maxScore
                                        : r.totalDeductions !== null
                                        ? r.totalDeductions
                                        : '-'}
                                    </td>

                                    <td
                                      rowSpan={spanCount}
                                      className="p-2.5 text-center align-middle border-l border-emerald-300 dark:border-slate-700 bg-amber-100/80 dark:bg-amber-950/40 font-black text-sm text-[#09152C] dark:text-amber-300"
                                    >
                                      {r.isUnmemorized ? (
                                        <span className="text-red-600 text-xs">
                                          0
                                        </span>
                                      ) : r.averageScore !== null ? (
                                        r.averageScore
                                      ) : (
                                        '-'
                                      )}
                                    </td>

                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle border-l border-emerald-200 dark:border-slate-700 font-black text-emerald-900 dark:text-emerald-300 ${summaryMergedBg}`}
                                    >
                                      {r.percentage !== null && !r.isUnmemorized
                                        ? `${r.percentage}%`
                                        : '-'}
                                    </td>

                                    <td
                                      rowSpan={spanCount}
                                      className={`p-2 text-center align-middle ${summaryMergedBg}`}
                                    >
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-xl border text-[10px] font-black ${r.gradeInfo.badgeClass}`}
                                      >
                                        {r.gradeInfo.label}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    })}

                    {filteredResults.length === 0 && (
                      <tbody>
                        <tr>
                          <td
                            colSpan={24 + maxSegs * 2}
                            className="p-8 text-center text-slate-500 font-black text-sm"
                          >
                            لا توجد بيانات مطابقة للبحث أو الفلترة الحالية
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </div>
            );
          })()}

          {/* التوقيعات الرسمية */}
          <div className="pdf-avoid-break pt-8 mt-6 border-t-2 border-amber-400/60 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>لجنة التقييم والتحكيم</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>رئيس لجنة المسابقة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>يعتمد / مدير الإدارة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع والختم: ..........................
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================ 2. تبويب ملخص التقارير ومتوسط كل متسابق بين المقيمين ================ */}
      {reportSubTab === 'evaluator_averages' && (
        <div
          id="official-report-evaluator-avg-container"
          dir="rtl"
          style={{
            letterSpacing: '0px',
            fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
          }}
          className="bg-white dark:bg-slate-900 p-4 sm:p-7 rounded-3xl border-2 border-amber-300/80 dark:border-slate-800 shadow-xl space-y-6"
        >
          {/* الديباجة الرسمية ونص الموسم */}
          <OfficialReportHeader
            seasonText={comp.seasonText}
            compName={comp.name}
            reportTitle="ملخص التقارير ومتوسط درجات المتسابقين بين المقيمين"
            reportSubtitle="جدول رسمي مقارن لدرجات كل متسابق لدى جميع المقيمين وحساب المتوسط النهائي المعتمد وفارق التقييم"
            metaStats={reportHeaderStats}
          />

          {/* ملخص سريع لمتوسطات المقيمين */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-slate-800 border-2 border-amber-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 block">
                عدد المقيمين في الجدول
              </span>
              <span className="text-xl font-black text-[#09152C] dark:text-white mt-0.5 block">
                {activeEvaluatorsList.length} مقيم
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-slate-800 border-2 border-emerald-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 block">
                متسابقون تم تقييمهم
              </span>
              <span className="text-xl font-black text-emerald-950 dark:text-white mt-0.5 block">
                {evaluatedStudentsCount} من {totalStudentsCount}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50/80 dark:bg-slate-800 border-2 border-sky-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-sky-900 dark:text-sky-300 block">
                تقييم مشترك (أكثر من مقيم)
              </span>
              <span className="text-xl font-black text-sky-950 dark:text-sky-300 mt-0.5 block">
                {multiEvaluatedCount} متسابق
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-slate-800 border-2 border-indigo-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300 block">
                متوسط الدرجات العام بين المقيمين
              </span>
              <span className="text-xl font-black text-indigo-950 dark:text-indigo-300 mt-0.5 block">
                {overallAverage !== null ? overallAverage : '-'}
              </span>
            </div>
          </div>

          {/* شريط الفلترة والبحث الخاص بملخص متوسطات المقيمين */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 no-print">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 ml-1">
                نطاق العرض:
              </span>
              {[
                {
                  id: 'available',
                  label: `النتائج المتوفرة (${evaluatedStudentsCount})`,
                },
                {
                  id: 'multi_only',
                  label: `المقيمون من أكثر من مقيم (${multiEvaluatedCount})`,
                },
                {
                  id: 'all',
                  label: `جميع المتسابقين (${totalStudentsCount})`,
                },
              ].map(btn => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setEvalAvgFilterMode(btn.id as any)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                    evalAvgFilterMode === btn.id
                      ? 'bg-[#09152C] text-amber-300 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم المتسابق أو الولاية..."
                  className="w-full min-h-[38px] pr-8 pl-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                />
                <Search
                  className="absolute right-2.5 top-2.5 text-slate-400"
                  size={15}
                />
              </div>

              <button
                type="button"
                onClick={exportExcel}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={14} />
                <span>تصدير Excel</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() =>
                  exportToPdf(
                    'official-report-evaluator-avg-container',
                    `ملخص_متوسطات_المقيمين_${comp.name}`,
                    true
                  )
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#09152C] hover:bg-[#163363] text-amber-300 font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>تصدير PDF</span>
              </button>
            </div>
          </div>

          {/* جدول مصفوفة متوسطات المقيمين ذو العناوين المتعددة */}
          <div className="border-2 border-[#09152C]/25 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  {/* الصف الأول: عناوين المجموعات الرئيسية */}
                  <tr className="bg-[#09152C] text-amber-300 font-black border-b border-amber-400/50 text-xs">
                    <th
                      colSpan={2}
                      className="p-2.5 text-center border-l border-white/15 bg-[#071022]"
                    >
                      المركز والترتيب
                    </th>
                    <th
                      colSpan={6}
                      className="p-2.5 text-center border-l border-white/15"
                    >
                      البيانات الأساسية للمتسابق والمستوى
                    </th>
                    <th
                      colSpan={Math.max(1, activeEvaluatorsList.length)}
                      className="p-2.5 text-center border-l border-white/15 bg-[#12264A]"
                    >
                      درجات المقيمين المرصودة لكل متسابق (مرتبة حسب كل مقيم)
                    </th>
                    <th
                      colSpan={6}
                      className="p-2.5 text-center bg-[#09152C]"
                    >
                      حساب المتوسط لكل متسابق بين المقيمين والتقدير النهائي
                    </th>
                  </tr>

                  {/* الصف الثاني: عناوين الحقول الفرعية */}
                  <tr className="bg-[#163363] text-white font-black border-b-2 border-amber-400 text-[11px]">
                    <th className="p-2.5 text-center border-l border-white/15 w-14">
                      بالمستوى
                    </th>
                    <th className="p-2.5 text-center border-l border-white/15 w-14">
                      العام
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-20">
                      رقم الطلب
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[150px]">
                      الاسم الكامل
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-20">
                      الولاية
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      الجنس
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[120px]">
                      المستوى والمقرر
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      العظمى
                    </th>

                    {activeEvaluatorsList.length > 0 ? (
                      activeEvaluatorsList.map(evItem => (
                        <th
                          key={evItem.id}
                          className="p-2.5 text-center border-l border-white/15 min-w-[120px] bg-[#1D3F7A] text-amber-200"
                        >
                          <div className="text-[10px] text-blue-200 font-bold">
                            المقيم المعتمد
                          </div>
                          <div className="truncate">{evItem.name}</div>
                        </th>
                      ))
                    ) : (
                      <th className="p-2.5 text-center border-l border-white/15 min-w-[120px] bg-[#1D3F7A]">
                        درجات المقيمين
                      </th>
                    )}

                    <th className="p-2 text-center border-l border-white/15 w-16">
                      عدد المقيمين
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      أعلى درجة
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      أدنى درجة
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      الفارق
                    </th>
                    <th className="p-2.5 text-center border-l border-white/15 w-28 bg-amber-500/25 text-amber-200">
                      المتوسط بين المقيمين
                    </th>
                    <th className="p-2.5 text-center w-36">
                      النسبة والتقدير
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold">
                  {evaluatorAverageRows.map((r, idx) => {
                    const isTop3 =
                      r.rankInLevel !== null && r.rankInLevel <= 3;
                    return (
                      <tr
                        key={r.participant.id}
                        className={
                          isTop3
                            ? 'bg-amber-50/40 dark:bg-amber-950/15'
                            : idx % 2 === 1
                            ? 'bg-slate-50/70 dark:bg-slate-800/30'
                            : 'bg-white dark:bg-slate-900'
                        }
                      >
                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 font-black">
                          {r.isUnmemorized ? (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">
                              غير حافظ
                            </span>
                          ) : r.rankInLevel !== null ? (
                            <span
                              className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-black ${
                                r.rankInLevel === 1
                                  ? 'bg-amber-400 text-[#09152C]'
                                  : r.rankInLevel === 2
                                  ? 'bg-slate-300 text-slate-900'
                                  : r.rankInLevel === 3
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {r.rankInLevel}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 font-black text-slate-600 dark:text-slate-400">
                          {r.overallRank !== null && !r.isUnmemorized
                            ? r.overallRank
                            : '-'}
                        </td>

                        <td className="p-2 text-center font-mono text-[11px] text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.requestNumber || '-'}
                        </td>

                        <td className="p-2.5 border-l border-slate-200 dark:border-slate-800 font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                          <div>{r.participant.name}</div>
                          {(r.participant.civilId || r.participant.phone) && (
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                              {r.participant.civilId && `مدني: ${r.participant.civilId}`}
                              {r.participant.civilId && r.participant.phone && ' • '}
                              {r.participant.phone && `هاتف: ${r.participant.phone}`}
                            </div>
                          )}
                        </td>

                        <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.wilayat || '-'}
                        </td>

                        <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.gender || '-'}
                        </td>

                        <td className="p-2.5 border-l border-slate-200 dark:border-slate-800">
                          <div className="font-black text-slate-800 dark:text-slate-200 text-xs">
                            {r.level?.name}
                          </div>
                          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            {r.participant.juzsOrSurahs || r.level?.juzsOrSurahs}
                          </div>
                        </td>

                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-slate-600 dark:text-slate-400">
                          {r.maxScore}
                        </td>

                        {/* أعمدة درجات كل مقيم على حدة */}
                        {activeEvaluatorsList.length > 0 ? (
                          activeEvaluatorsList.map(evItem => {
                            const evRecord = r.evaluations.find(
                              e => Number(e.evaluatorId) === Number(evItem.id)
                            );
                            return (
                              <td
                                key={evItem.id}
                                className="p-2 text-center border-l border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20"
                              >
                                {evRecord ? (
                                  evRecord.isUnmemorized ? (
                                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-black text-[10px]">
                                      غير حافظ (0)
                                    </span>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="font-black text-sm text-[#09152C] dark:text-amber-300">
                                        {evRecord.totalScore}
                                        <span className="text-[10px] text-slate-400 font-bold">
                                          /{r.maxScore}
                                        </span>
                                      </div>
                                      {Array.isArray(evRecord.segments) &&
                                        evRecord.segments.length > 0 && (
                                          <div className="flex flex-wrap justify-center gap-0.5">
                                            {evRecord.segments.map(
                                              (seg, sIdx) => (
                                                <span
                                                  key={sIdx}
                                                  className="px-1 py-0.2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[9px] text-slate-600 dark:text-slate-300"
                                                >
                                                  م
                                                  {seg.segmentNumber ||
                                                    sIdx + 1}
                                                  :
                                                  {seg.isUnmemorized
                                                    ? '0'
                                                    : seg.score}
                                                </span>
                                              )
                                            )}
                                          </div>
                                        )}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })
                        ) : (
                          <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 text-slate-400">
                            —
                          </td>
                        )}

                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] ${
                              r.evaluationsCount > 1
                                ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300'
                                : r.evaluationsCount === 1
                                ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {r.evaluationsCount}
                          </span>
                        </td>

                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-emerald-700 dark:text-emerald-400">
                          {r.highestEvalScore !== null
                            ? r.highestEvalScore
                            : '-'}
                        </td>

                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-amber-800 dark:text-amber-400">
                          {r.lowestEvalScore !== null ? r.lowestEvalScore : '-'}
                        </td>

                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-slate-700 dark:text-slate-300">
                          {r.evaluationsCount > 1 ? (
                            <span
                              className={
                                r.evalSpread > 5
                                  ? 'text-red-600 font-black'
                                  : 'text-slate-600 dark:text-slate-300'
                              }
                            >
                              {r.evalSpread}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* عمود المتوسط النهائي لكل متسابق بين المقيمين */}
                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
                          {r.isUnmemorized ? (
                            <span className="text-red-600 font-black text-xs">
                              0 (غير حافظ)
                            </span>
                          ) : r.averageScore !== null ? (
                            <div>
                              <span className="text-base font-black text-[#09152C] dark:text-amber-300">
                                {r.averageScore}
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold block">
                                من {r.maxScore}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="p-2.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {r.percentage !== null && !r.isUnmemorized && (
                              <span className="font-black text-xs text-emerald-800 dark:text-emerald-300">
                                {r.percentage}%
                              </span>
                            )}
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black ${r.gradeInfo.badgeClass}`}
                            >
                              {r.gradeInfo.label}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {evaluatorAverageRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={14 + Math.max(1, activeEvaluatorsList.length)}
                        className="p-8 text-center text-slate-500 font-black text-sm"
                      >
                        لا توجد بيانات مطابقة لنطاق الفلترة المختار حالياً
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* صف تذييل الجدول: متوسط درجات كل مقيم على حدة + المتوسط العام */}
                {evaluatorAverageRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-[#09152C]/40 font-black text-xs text-[#09152C] dark:text-amber-200">
                      <td
                        colSpan={8}
                        className="p-3 text-left border-l border-slate-300 dark:border-slate-700"
                      >
                        متوسط الدرجات الممنوحة من كل مقيم (ولجميع المتسابقين):
                      </td>

                      {activeEvaluatorsList.length > 0 ? (
                        activeEvaluatorsList.map(evItem => {
                          const evScores = evaluatorAverageRows
                            .map(r =>
                              r.evaluations.find(
                                e =>
                                  Number(e.evaluatorId) === Number(evItem.id) &&
                                  !e.isUnmemorized
                              )
                            )
                            .filter(Boolean)
                            .map(e => Number(e!.totalScore || 0));

                          const evAvg =
                            evScores.length > 0
                              ? Number(
                                  (
                                    evScores.reduce((a, b) => a + b, 0) /
                                    evScores.length
                                  ).toFixed(2)
                                )
                              : null;

                          return (
                            <td
                              key={evItem.id}
                              className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700 bg-slate-200/60 dark:bg-slate-700/50"
                            >
                              {evAvg !== null ? (
                                <div>
                                  <span className="text-sm font-black text-[#09152C] dark:text-amber-300">
                                    {evAvg}
                                  </span>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-300">
                                    ({evScores.length} متسابق)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          );
                        })
                      ) : (
                        <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700">
                          -
                        </td>
                      )}

                      <td
                        colSpan={4}
                        className="p-2.5 text-left border-l border-slate-300 dark:border-slate-700"
                      >
                        المتوسط العام المعتمد:
                      </td>
                      <td className="p-2.5 text-center border-l border-slate-300 dark:border-slate-700 bg-amber-200/70 dark:bg-amber-950/40 text-sm sm:text-base font-black text-[#09152C] dark:text-amber-300">
                        {overallAverage !== null ? overallAverage : '-'}
                      </td>
                      <td className="p-2.5 text-center">معتمد</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* خانة الاعتماد والتوقيعات الرسمية */}
          <div className="pt-8 mt-6 border-t-2 border-amber-400/60 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>أعضاء لجنة التقييم والتحكيم</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>رئيس لجنة المسابقة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>يعتمد / مدير الإدارة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع والختم: ..........................
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================ 3. تبويب كشف الدرجات الشامل والفرز المتقدم ================ */}
      {reportSubTab === 'table' && (
        <div
          id="official-report-table-container"
          dir="rtl"
          style={{
            letterSpacing: '0px',
            fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
          }}
          className="bg-white dark:bg-slate-900 p-4 sm:p-7 rounded-3xl border-2 border-amber-300/80 dark:border-slate-800 shadow-xl space-y-5"
        >
          {/* الديباجة الرسمية ونص الموسم */}
          <OfficialReportHeader
            seasonText={comp.seasonText}
            compName={comp.name}
            reportTitle="كشف الدرجات والنتائج التفصيلي العام"
            reportSubtitle="سجل شامل متعدد الحقول لنتائج المتسابقين ودرجات المقيمين والمقاطع والنسب المئوية"
            metaStats={reportHeaderStats}
          />

          {/* تنبيه وعرض إمكانية استبعاد غير الحافظين */}
          {unmemorizedStudentsCount > 0 && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs no-print">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="text-red-600 shrink-0" size={20} />
                <div>
                  <div className="text-xs sm:text-sm font-black text-red-950 dark:text-red-200">
                    يوجد ({unmemorizedStudentsCount}) متسابق مصنف «غير حافظ»
                  </div>
                  <p className="text-[11px] text-red-800 dark:text-red-300 font-bold">
                    يمكنك فرزهم في الكشف أدناه أو إخراجهم واستبعادهم من المسابقة
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExcludeParticipantTarget('all')}
                className="min-h-[38px] px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>
                  استبعاد جميع غير الحافظين ({unmemorizedStudentsCount})
                </span>
              </button>
            </div>
          )}

          {/* أدوات البحث والفلترة والفرز المتقدم */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3.5 no-print">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                  بحث سريع (بالاسم، الطلب، الرقم المدني، الهاتف، الولاية)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="اكتب للبحث السريع..."
                    className="w-full min-h-[40px] pr-8 pl-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                  <Search
                    className="absolute right-2.5 top-2.5 text-slate-400"
                    size={16}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                  طريقة الفرز والترتيب
                </label>
                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                >
                  <option value="score_desc">
                    الدرجة والترتيب (من الأعلى للأقل)
                  </option>
                  <option value="score_asc">الدرجة (من الأقل للأعلى)</option>
                  <option value="name">الاسم الكامل (أبجدي)</option>
                  <option value="level">مستوى المشاركة</option>
                  <option value="wilayat">الولاية</option>
                  <option value="request_num">رقم الطلب</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={exportExcel}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  <span>تصدير الكشف Excel</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() =>
                    exportToPdf(
                      'official-report-table-container',
                      `كشف_درجات_${comp.name}`,
                      true
                    )
                  }
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#09152C] hover:bg-[#163363] text-amber-300 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download size={15} />
                  <span>تصدير الكشف PDF</span>
                </button>
              </div>
            </div>

            {/* أزرار الحالات السريعة مع إبراز خيار النتائج المتوفرة */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                {
                  id: 'available',
                  label: `النتائج المتوفرة المرصودة (${evaluatedStudentsCount})`,
                },
                {
                  id: 'all',
                  label: `جميع المسجلين (${baseFilteredResults.length})`,
                },
                {
                  id: 'memorized',
                  label: `الحافظون المتقنون (${memorizedStudentsCount})`,
                },
                {
                  id: 'multi_evaluated',
                  label: `تقييم مشترك أكثر من مقيم (${multiEvaluatedCount})`,
                },
                {
                  id: 'unmemorized',
                  label: `غير الحافظين (${unmemorizedStudentsCount})`,
                },
                {
                  id: 'not_evaluated',
                  label: `بانتظار التقييم (${totalStudentsCount - evaluatedStudentsCount})`,
                },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEvalStatusFilter(tab.id as any)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                    effectiveStatusFilter === tab.id
                      ? 'bg-[#09152C] text-amber-300 shadow-xs border border-amber-400/50'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* الجدول الشامل ذو العناوين المتعددة والتنسيق الرسمي الفاخر */}
          <div className="border-2 border-[#09152C]/25 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  {/* الصف الأول: عناوين المجموعات الرئيسية */}
                  <tr className="bg-[#09152C] text-amber-300 font-black border-b border-amber-400/50 text-xs">
                    <th
                      rowSpan={2}
                      className="p-2 text-center border-l border-white/15 w-10 bg-[#071022] no-print"
                    >
                      <input
                        type="checkbox"
                        checked={
                          filteredResults.some(r => r.evaluations.length > 0) &&
                          filteredResults
                            .filter(r => r.evaluations.length > 0)
                            .every(r =>
                              r.evaluations.every(ev => selectedEvalIds.has(String(ev.id)))
                            )
                        }
                        onChange={e => {
                          const checked = e.target.checked;
                          setSelectedEvalIds(prev => {
                            const next = new Set(prev);
                            filteredResults.forEach(r => {
                              r.evaluations.forEach(ev => {
                                if (checked) next.add(String(ev.id));
                                else next.delete(String(ev.id));
                              });
                            });
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        title="تحديد أو إلغاء تحديد كافة التقييمات الظاهرة في الكشف"
                      />
                    </th>
                    <th
                      colSpan={2}
                      className="p-2.5 text-center border-l border-white/15 bg-[#071022]"
                    >
                      المركز والترتيب
                    </th>
                    <th
                      colSpan={6}
                      className="p-2.5 text-center border-l border-white/15"
                    >
                      بيانات المتسابق الكاملة والمستوى القرآني
                    </th>
                    <th
                      colSpan={3}
                      className="p-2.5 text-center border-l border-white/15 bg-[#12264A]"
                    >
                      تفصيل درجات المقيمين ومتوسطات المقاطع
                    </th>
                    <th
                      colSpan={5}
                      className="p-2.5 text-center border-l border-white/15 bg-[#09152C]"
                    >
                      الدرجة النهائية المعتمدة والتقدير العام
                    </th>
                    <th
                      rowSpan={2}
                      className="p-2.5 text-center w-24 no-print bg-[#071022]"
                    >
                      إجراءات
                    </th>
                  </tr>

                  {/* الصف الثاني: عناوين الحقول الفرعية المتعددة */}
                  <tr className="bg-[#163363] text-white font-black border-b-2 border-amber-400 text-[11px]">
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      بالمستوى
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-14">
                      العام
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-20">
                      رقم الطلب
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[145px]">
                      الاسم الكامل
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-20">
                      الولاية
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      الجنس
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[110px]">
                      مستوى المشاركة
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[115px]">
                      المقرر / الأجزاء
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16 bg-[#1D3F7A]">
                      المقيمون
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[165px] bg-[#1D3F7A]">
                      درجات المقيمين
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[155px] bg-[#1D3F7A]">
                      متوسطات المقاطع
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      العظمى
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-16">
                      الخصم
                    </th>
                    <th className="p-2.5 text-center border-l border-white/15 w-24 bg-amber-500/20 text-amber-200">
                      المتوسط النهائي
                    </th>
                    <th className="p-2 text-center border-l border-white/15 w-20">
                      النسبة المئوية
                    </th>
                    <th className="p-2.5 text-center border-l border-white/15 w-32">
                      التقدير العام
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold">
                  {filteredResults.map((r, idx) => {
                    const displayRank =
                      selectedLevelId !== 'all' || filterLevels.length === 1
                        ? r.rankInLevel
                        : r.overallRank;
                    return (
                      <tr
                        key={r.participant.id}
                        className={
                          displayRank !== null && displayRank <= 3
                            ? 'bg-amber-50/45 dark:bg-amber-950/15 hover:bg-amber-50/70'
                            : idx % 2 === 1
                            ? 'bg-slate-50/60 dark:bg-slate-800/30 hover:bg-slate-100/70'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        {/* خانة تحديد التقييم للحذف المجمع */}
                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 no-print">
                          {r.evaluations.length > 0 ? (
                            <input
                              type="checkbox"
                              checked={r.evaluations.every(ev =>
                                selectedEvalIds.has(String(ev.id))
                              )}
                              onChange={e => {
                                const checked = e.target.checked;
                                setSelectedEvalIds(prev => {
                                  const next = new Set(prev);
                                  r.evaluations.forEach(ev => {
                                    if (checked) next.add(String(ev.id));
                                    else next.delete(String(ev.id));
                                  });
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              title="تحديد تقييمات هذا المتسابق"
                            />
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>
                          )}
                        </td>

                        {/* المركز في المستوى */}
                        <td className="p-2.5 text-center font-black border-l border-slate-200 dark:border-slate-800">
                          {r.isUnmemorized ? (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">
                              غير حافظ
                            </span>
                          ) : r.rankInLevel !== null ? (
                            <span
                              className={`inline-flex items-center justify-center min-w-[30px] px-2 py-0.5 rounded-xl text-xs font-black ${
                                r.rankInLevel === 1
                                  ? 'bg-amber-400 text-[#09152C] shadow-2xs'
                                  : r.rankInLevel === 2
                                  ? 'bg-slate-300 text-slate-900'
                                  : r.rankInLevel === 3
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {r.rankInLevel === 1
                                ? '1 🥇'
                                : r.rankInLevel === 2
                                ? '2 🥈'
                                : r.rankInLevel === 3
                                ? '3 🥉'
                                : r.rankInLevel}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* الترتيب العام */}
                        <td className="p-2.5 text-center font-black text-slate-600 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800">
                          {r.overallRank !== null && !r.isUnmemorized
                            ? r.overallRank
                            : '-'}
                        </td>

                        {/* رقم الطلب */}
                        <td className="p-2 text-center font-mono text-[11px] text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.requestNumber || '-'}
                        </td>

                        {/* الاسم الكامل + الرقم المدني والهاتف وتاريخ التسجيل */}
                        <td className="p-2.5 font-black text-slate-900 dark:text-white text-xs sm:text-sm border-l border-slate-200 dark:border-slate-800">
                          <div>{r.participant.name}</div>
                          {(r.participant.civilId ||
                            r.participant.phone ||
                            r.participant.registrationDate) && (
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5 flex flex-wrap gap-1.5">
                              {r.participant.civilId && (
                                <span>مدني: {r.participant.civilId}</span>
                              )}
                              {r.participant.phone && (
                                <span>هاتف: {r.participant.phone}</span>
                              )}
                              {r.participant.registrationDate && (
                                <span>تسجيل: {r.participant.registrationDate}</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* الولاية */}
                        <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.wilayat || '-'}
                        </td>

                        {/* الجنس */}
                        <td className="p-2 text-center text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.gender || '-'}
                        </td>

                        {/* المستوى */}
                        <td className="p-2.5 font-black text-slate-800 dark:text-slate-200 text-xs border-l border-slate-200 dark:border-slate-800">
                          {r.level?.name}
                        </td>

                        {/* المقرر والأجزاء */}
                        <td className="p-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 border-l border-slate-200 dark:border-slate-800">
                          {r.participant.juzsOrSurahs || r.level?.juzsOrSurahs}
                        </td>

                        {/* عدد المقيمين */}
                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] ${
                              r.evaluationsCount > 1
                                ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300'
                                : r.evaluationsCount === 1
                                ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                                : 'text-slate-400'
                            }`}
                          >
                            {r.evaluationsCount}
                          </span>
                        </td>

                        {/* درجات المقيمين */}
                        <td className="p-2 border-l border-slate-200 dark:border-slate-800">
                          {r.evaluations.length > 0 ? (
                            <div className="space-y-1">
                              {r.evaluations.map((ev, evIdx) => (
                                <div
                                  key={ev.id || evIdx}
                                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                                >
                                  <span className="truncate text-slate-700 dark:text-slate-300">
                                    {getEvaluatorName(
                                      ev.evaluatorId,
                                      ev.evaluatorName
                                    )}
                                  </span>
                                  <strong className="text-emerald-800 dark:text-amber-300 font-black shrink-0">
                                    {ev.isUnmemorized
                                      ? '0 (غير حافظ)'
                                      : `${ev.totalScore} / ${r.maxScore}`}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-bold text-xs">
                              بانتظار التقييم
                            </span>
                          )}
                        </td>

                        {/* متوسطات المقاطع */}
                        <td className="p-2 border-l border-slate-200 dark:border-slate-800">
                          {r.evaluations.length > 0 && !r.isUnmemorized ? (
                            <div className="flex flex-wrap gap-1">
                              {r.segmentAverages.map((segAvg, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-700 dark:text-slate-200"
                                >
                                  م{sIdx + 1}: {segAvg !== null ? segAvg : '-'}
                                </span>
                              ))}
                            </div>
                          ) : r.isUnmemorized ? (
                            <span className="text-red-600 text-[11px] font-black">
                              غير حافظ للمقرر
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* الدرجة العظمى */}
                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-slate-600 dark:text-slate-400">
                          {r.maxScore}
                        </td>

                        {/* إجمالي الخصم */}
                        <td className="p-2 text-center border-l border-slate-200 dark:border-slate-800 font-black text-red-600 dark:text-red-400">
                          {r.isUnmemorized
                            ? r.maxScore
                            : r.totalDeductions !== null
                            ? r.totalDeductions
                            : '-'}
                        </td>

                        {/* المتوسط النهائي */}
                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/15">
                          {r.isUnmemorized ? (
                            <span className="text-red-600 font-black text-xs">
                              0
                            </span>
                          ) : r.averageScore !== null ? (
                            <div>
                              <span className="text-[#09152C] dark:text-amber-300 font-black text-sm sm:text-base">
                                {r.averageScore}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* النسبة المئوية */}
                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800">
                          {r.percentage !== null && !r.isUnmemorized ? (
                            <div className="space-y-1">
                              <span className="font-black text-emerald-800 dark:text-emerald-300 text-xs block">
                                {r.percentage}%
                              </span>
                              <div className="w-14 mx-auto h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${r.gradeInfo.barClass}`}
                                  style={{
                                    width: `${Math.min(100, r.percentage)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* التقدير العام */}
                        <td className="p-2.5 text-center border-l border-slate-200 dark:border-slate-800">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-xl border text-[11px] font-black ${r.gradeInfo.badgeClass}`}
                          >
                            {r.gradeInfo.label}
                          </span>
                        </td>

                        {/* إجراءات */}
                        <td className="p-2 text-center no-print">
                          <div className="flex items-center justify-center gap-1">
                            {r.evaluations.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailParticipantId(r.participant.id)
                                }
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 font-black text-[10px] rounded-lg transition cursor-pointer border border-emerald-200 dark:border-slate-700"
                              >
                                التفاصيل
                              </button>
                            )}
                            {r.evaluations.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmParticipantId(r.participant.id)
                                }
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-black text-[10px] rounded-lg transition cursor-pointer border border-rose-200 dark:border-rose-900 flex items-center gap-1"
                                title="حذف تقييمات هذا المتسابق"
                              >
                                <Trash2 size={11} />
                                <span>حذف</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedParticipantForCert(r.participant.id);
                                setReportSubTab('certificate');
                              }}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black text-[10px] rounded-lg transition cursor-pointer border border-amber-200"
                              title="عرض بطاقة النتيجة الرسمية"
                            >
                              البطاقة
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td
                        colSpan={18}
                        className="p-8 text-center text-slate-500 font-black text-sm"
                      >
                        لا توجد نتائج مطابقة للبحث أو التصفية الحالية
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* التوقيعات الرسمية */}
          <div className="pt-8 mt-6 border-t-2 border-amber-400/60 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>لجنة التقييم والتحكيم</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>مشرف المسابقة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع: ..........................
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <p>يعتمد / مدير الإدارة</p>
              <p className="mt-7 text-slate-400 font-bold">
                التوقيع والختم: ..........................
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================ 4. تبويب الرسوم البيانية التحليلية ================ */}
      {reportSubTab === 'analytics' && (
        <div
          id="official-report-analytics-container"
          dir="rtl"
          style={{
            letterSpacing: '0px',
            fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
          }}
          className="bg-white dark:bg-slate-900 p-4 sm:p-7 rounded-3xl border-2 border-amber-300/80 dark:border-slate-800 shadow-xl space-y-6"
        >
          {/* الديباجة الرسمية ونص الموسم */}
          <OfficialReportHeader
            seasonText={comp.seasonText}
            compName={comp.name}
            reportTitle="التقرير الإحصائي الشامل والرسوم البيانية التحليلية"
            reportSubtitle="تحليل فني وإحصائي مفصل حسب المستويات والولايات والجنس والتقديرات وتاريخ التسجيل وإنجاز لجان التحكيم"
            metaStats={reportHeaderStats}
          />

          {/* شريط أزرار التصدير السريع للتقرير التحليلي */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 no-print">
            <span className="text-xs font-black text-slate-700 dark:text-slate-200">
              إحصائيات ورسوم بيانية تفاعلية مصنفة حسب تنوع حقول المتسابقين ({baseFilteredResults.length} متسابق ضمن نطاق التصفية)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet size={14} />
                <span>تصدير الإحصائيات Excel</span>
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() =>
                  exportToPdf(
                    'official-report-analytics-container',
                    `تقرير_تحليلي_${comp.name}`,
                    true
                  )
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#09152C] hover:bg-[#163363] text-amber-300 font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>تصدير التقرير التحليلي PDF</span>
              </button>
            </div>
          </div>

          {/* البطاقات الإحصائية الرئيسية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-slate-800 border-2 border-emerald-200 dark:border-slate-700">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                نسبة إنجاز التقييم
              </span>
              <span className="text-2xl font-black text-emerald-950 dark:text-white mt-1 block">
                {totalStudentsCount > 0
                  ? `${Math.round(
                      (evaluatedStudentsCount / totalStudentsCount) * 100
                    )}%`
                  : '0%'}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
                ({evaluatedStudentsCount} من {totalStudentsCount} متسابق)
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-slate-800 border-2 border-amber-200 dark:border-slate-700">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-300 block">
                متوسط درجات الحافظين
              </span>
              <span className="text-2xl font-black text-amber-950 dark:text-amber-200 mt-1 block">
                {overallAverage !== null ? `${overallAverage}` : '-'}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
                المعدل العام للمسابقة
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-sky-50 dark:bg-slate-800 border-2 border-sky-200 dark:border-slate-700">
              <span className="text-xs font-bold text-sky-900 dark:text-sky-300 block">
                عدد الولايات المشاركة
              </span>
              <span className="text-2xl font-black text-sky-950 dark:text-sky-300 mt-1 block">
                {
                  new Set(
                    baseFilteredResults
                      .map(r => (r.participant.wilayat || '').trim())
                      .filter(Boolean)
                  ).size
                }
              </span>
              <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
                ولاية مسجلة في البيانات
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-red-50 dark:bg-slate-800 border-2 border-red-200 dark:border-slate-700">
              <span className="text-xs font-bold text-red-800 dark:text-red-300 block">
                غير حافظ للمقرر
              </span>
              <span className="text-2xl font-black text-red-700 dark:text-red-400 mt-1 block">
                {unmemorizedStudentsCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
                متسابق غير متقن للمقرر
              </span>
            </div>
          </div>

          {/* شبكة مزدوجة: 1. التوزيع حسب الجنس + 2. التوزيع حسب التقديرات */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* الرسم البياني: التوزيع والمقارنة حسب الجنس (الذكور والإناث) */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={18} className="text-amber-500" />
                <span>التحليل الإحصائي حسب الجنس (الذكور / الإناث)</span>
              </h4>

              {(() => {
                const genderMap = new Map<
                  string,
                  {
                    total: number;
                    evaluated: number;
                    memorized: number;
                    scores: number[];
                  }
                >();
                baseFilteredResults.forEach(r => {
                  const g = (r.participant.gender || 'غير محدد').trim() || 'غير محدد';
                  const entry = genderMap.get(g) || {
                    total: 0,
                    evaluated: 0,
                    memorized: 0,
                    scores: [],
                  };
                  entry.total += 1;
                  if (r.evaluationsCount > 0) entry.evaluated += 1;
                  if (r.averageScore !== null && !r.isUnmemorized) {
                    entry.memorized += 1;
                    entry.scores.push(r.averageScore);
                  }
                  genderMap.set(g, entry);
                });

                const genderEntries = Array.from(genderMap.entries());
                const totalAll = baseFilteredResults.length || 1;

                return (
                  <div className="space-y-3.5">
                    {genderEntries.map(([gLabel, stats], idx) => {
                      const pctOfTotal = Math.round(
                        (stats.total / totalAll) * 100
                      );
                      const avgScore =
                        stats.scores.length > 0
                          ? Number(
                              (
                                stats.scores.reduce((a, b) => a + b, 0) /
                                stats.scores.length
                              ).toFixed(2)
                            )
                          : null;
                      const barColors = [
                        'from-[#09152C] to-sky-600',
                        'from-amber-600 to-amber-400',
                        'from-emerald-700 to-emerald-500',
                      ];
                      return (
                        <div
                          key={gLabel}
                          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-black text-sm text-[#09152C] dark:text-amber-300">
                              {gLabel}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                العدد: {stats.total} ({pctOfTotal}%)
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                                الحافظون: {stats.memorized}
                              </span>
                              {avgScore !== null && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                                  المتوسط: {avgScore}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-4 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-l ${
                                barColors[idx % barColors.length]
                              } transition-all duration-500`}
                              style={{ width: `${pctOfTotal}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* الرسم البياني: توزيع التقديرات */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                <span>توزيع النتائج المتوفرة للمتسابقين الحافظين حسب التقدير</span>
              </h4>

              {(() => {
                const memorizedEvals = baseFilteredResults.filter(
                  r => r.averageScore !== null && !r.isUnmemorized
                );
                const countHonors = memorizedEvals.filter(
                  r => (r.percentage || 0) >= 97
                ).length;
                const countExcellence = memorizedEvals.filter(
                  r => (r.percentage || 0) >= 90 && (r.percentage || 0) < 97
                ).length;
                const countVeryGood = memorizedEvals.filter(
                  r => (r.percentage || 0) >= 80 && (r.percentage || 0) < 90
                ).length;
                const countGood = memorizedEvals.filter(
                  r => (r.percentage || 0) >= 70 && (r.percentage || 0) < 80
                ).length;
                const countBelow70 = memorizedEvals.filter(
                  r => (r.percentage || 0) < 70
                ).length;

                const totalMem = memorizedEvals.length || 1;

                const brackets = [
                  {
                    label: 'ممتاز مع مرتبة الشرف (97% - 100%)',
                    count: countHonors,
                    color: 'bg-amber-500',
                  },
                  {
                    label: 'ممتاز (90% - 96.9%)',
                    count: countExcellence,
                    color: 'bg-emerald-700',
                  },
                  {
                    label: 'جيد جداً (80% - 89.9%)',
                    count: countVeryGood,
                    color: 'bg-sky-600',
                  },
                  {
                    label: 'جيد (70% - 79.9%)',
                    count: countGood,
                    color: 'bg-indigo-600',
                  },
                  {
                    label: 'مقبول (أقل من 70%)',
                    count: countBelow70,
                    color: 'bg-orange-500',
                  },
                ];

                return (
                  <div className="space-y-3">
                    {brackets.map((b, i) => {
                      const percent =
                        memorizedEvals.length > 0
                          ? Math.round((b.count / totalMem) * 100)
                          : 0;
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                            <span>{b.label}</span>
                            <span>
                              {b.count} متسابق ({percent}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-4 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${b.color} transition-all duration-500`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* الرسم البياني والجدول التحليلي: التصنيف حسب الولاية */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-amber-500" />
              <span>التوزيع الإحصائي ومتوسط الأداء حسب الولاية</span>
            </h4>

            {(() => {
              const wilayatStats = filterOptionsMap.wilayats.map(wOpt => {
                const items = baseFilteredResults.filter(
                  r => (r.participant.wilayat || 'غير محدد').trim() === wOpt.value
                );
                const memorized = items.filter(
                  r => r.averageScore !== null && !r.isUnmemorized
                );
                const avg =
                  memorized.length > 0
                    ? Number(
                        (
                          memorized.reduce(
                            (s, x) => s + (x.averageScore || 0),
                            0
                          ) / memorized.length
                        ).toFixed(2)
                      )
                    : null;
                const maleCount = items.filter(x =>
                  (x.participant.gender || '').includes('ذكر')
                ).length;
                const femaleCount = items.filter(x =>
                  (x.participant.gender || '').includes('أنثى')
                ).length;
                return {
                  wilayat: wOpt.label,
                  total: items.length,
                  evaluated: items.filter(x => x.evaluationsCount > 0).length,
                  memorized: memorized.length,
                  unmemorized: items.filter(x => x.isUnmemorized).length,
                  maleCount,
                  femaleCount,
                  avg,
                };
              });

              const maxWilayatTotal = Math.max(
                1,
                ...wilayatStats.map(w => w.total)
              );

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {wilayatStats.map(w => {
                      const pct = Math.round((w.total / maxWilayatTotal) * 100);
                      return (
                        <div
                          key={w.wilayat}
                          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                        >
                          <div className="flex flex-wrap justify-between items-center gap-2 text-xs font-black">
                            <span className="text-sm text-[#09152C] dark:text-amber-300">
                              ولاية: {w.wilayat}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                المسجلون: {w.total}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                تم تقييمهم: {w.evaluated}
                              </span>
                              {w.avg !== null && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                  المتوسط: {w.avg}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-3.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-l from-emerald-600 to-[#09152C] rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
                            <span>ذكور: {w.maleCount}</span>
                            <span>إناث: {w.femaleCount}</span>
                            <span>حافظون: {w.memorized}</span>
                            {w.unmemorized > 0 && (
                              <span className="text-red-600">
                                غير حافظ: {w.unmemorized}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* الرسم البياني: مقارنة متوسطات المستويات وتفصيل الولايات والجنس داخل كل مستوى */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Award size={18} className="text-amber-500" />
              <span>مقارنة الأداء التفصيلي ونسب الإنجاز حسب مستوى المشاركة</span>
            </h4>

            <div className="space-y-4">
              {(comp.levels || []).map(lvl => {
                const lvlAll = baseFilteredResults.filter(
                  r => Number(r.effectiveLevelId) === Number(lvl.id)
                );
                if (lvlAll.length === 0 && filterLevels.length > 0) return null;
                const lvlResults = lvlAll.filter(
                  r => r.averageScore !== null && !r.isUnmemorized
                );
                const avgLvlScore =
                  lvlResults.length > 0
                    ? Number(
                        (
                          lvlResults.reduce(
                            (s, r) => s + (r.averageScore || 0),
                            0
                          ) / lvlResults.length
                        ).toFixed(1)
                      )
                    : 0;
                const percentLvl = Math.round(
                  (avgLvlScore / (lvl.maxScore || 100)) * 100
                );
                const maleInLvl = lvlAll.filter(x =>
                  (x.participant.gender || '').includes('ذكر')
                ).length;
                const femaleInLvl = lvlAll.filter(x =>
                  (x.participant.gender || '').includes('أنثى')
                ).length;

                return (
                  <div
                    key={lvl.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex flex-wrap justify-between items-center text-xs font-black text-slate-800 dark:text-slate-200 gap-2">
                      <div>
                        <span className="text-sm text-[#09152C] dark:text-amber-300">
                          {lvl.name}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500 mr-2">
                          (المسجلون: {lvlAll.length} • ذكور: {maleInLvl} • إناث:{' '}
                          {femaleInLvl} • المقيمون: {lvlResults.length})
                        </span>
                      </div>
                      <span className="text-emerald-800 dark:text-amber-300">
                        متوسط المستوى: {avgLvlScore} من {lvl.maxScore} (
                        {percentLvl}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-4 rounded-xl overflow-hidden p-0.5">
                      <div
                        className="h-full bg-gradient-to-l from-amber-500 to-[#09152C] rounded-lg transition-all duration-500"
                        style={{ width: `${percentLvl}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* شبكة مزدوجة: إحصائيات التسجيل حسب التاريخ + نشاط المقيمين */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* توزيع التسجيلات حسب التاريخ */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-amber-500" />
                <span>توزيع المشاركين حسب تاريخ التسجيل</span>
              </h4>
              {filterOptionsMap.regDates.length > 0 ? (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {filterOptionsMap.regDates.map(dOpt => {
                    const countInFiltered = baseFilteredResults.filter(r =>
                      (r.participant.registrationDate || '').startsWith(
                        dOpt.value
                      )
                    ).length;
                    if (countInFiltered === 0) return null;
                    const pct = Math.round(
                      (countInFiltered / (baseFilteredResults.length || 1)) *
                        100
                    );
                    return (
                      <div
                        key={dOpt.value}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs font-black"
                      >
                        <span className="font-mono text-slate-800 dark:text-slate-200">
                          📅 {dOpt.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900">
                            {countInFiltered} مشارك ({pct}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-500">
                  لا توجد تواريخ تسجيل محددة في بيانات المشاركين الحالية.
                </p>
              )}
            </div>

            {/* نشاط وإنجاز المقيمين */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck size={18} className="text-amber-500" />
                <span>إحصائية رصد وإنجاز المقيمين المعتمدين</span>
              </h4>

              <div className="grid grid-cols-1 gap-2.5">
                {activeEvaluatorsList.map(ev => {
                  const evEvals = baseFilteredResults.flatMap(r =>
                    r.evaluations.filter(
                      e => Number(e.evaluatorId) === Number(ev.id)
                    )
                  );
                  const evAvg =
                    evEvals.length > 0
                      ? Number(
                          (
                            evEvals.reduce(
                              (s, e) =>
                                s + (e.isUnmemorized ? 0 : Number(e.totalScore || 0)),
                              0
                            ) / evEvals.length
                          ).toFixed(2)
                        )
                      : null;

                  return (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-black text-sm text-slate-900 dark:text-white block">
                          {ev.name}
                        </span>
                        <span className="text-[11px] text-slate-500 font-bold">
                          {evAvg !== null
                            ? `متوسط الدرجات الممنوحة: ${evAvg}`
                            : 'مقيم معتمد بالمسابقة'}
                        </span>
                      </div>
                      <span className="px-3 py-1 bg-[#09152C] text-amber-300 font-black text-xs rounded-xl">
                        {evEvals.length} تقييم مرصود
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================ 5. تبويب بطاقات وشهادات التقييم الرسمية ================ */}
      {reportSubTab === 'certificate' && (
        <div className="space-y-6">
          {/* اختيار المتسابق no-print */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <label className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                اختر المتسابق لعرض بطاقة النتيجة الرسمية ({baseFilteredResults.length} متسابق):
              </label>
              <select
                value={
                  selectedParticipantForCert || certParticipant?.participant.id
                }
                onChange={e =>
                  setSelectedParticipantForCert(Number(e.target.value))
                }
                className="min-h-[42px] px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 font-black text-xs sm:text-sm flex-1 max-w-md"
              >
                {baseFilteredResults.map(r => (
                  <option key={r.participant.id} value={r.participant.id}>
                    {r.participant.name}{' '}
                    {r.participant.wilayat ? `(${r.participant.wilayat})` : ''} —{' '}
                    {r.level?.name}{' '}
                    {r.averageScore !== null
                      ? `(${r.averageScore} / ${r.maxScore})`
                      : '(بانتظار التقييم)'}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={() =>
                exportToPdf(
                  'official-report-cert-container',
                  `بطاقة_نتيجة_${certParticipant?.participant.name || 'المتسابق'}`
                )
              }
              className="min-h-[42px] px-5 py-2 bg-[#09152C] hover:bg-[#163363] text-amber-300 border border-amber-400/50 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Download size={16} />
              <span>تحميل البطاقة الرسمية PDF</span>
            </button>
          </div>

          {/* حاوية بطاقة الشهادة الرسمية */}
          {certParticipant ? (
            <div
              id="official-report-cert-container"
              dir="rtl"
              style={{
                letterSpacing: '0px',
                fontFamily: "'Tajawal', 'Cairo', 'Amiri', sans-serif",
              }}
              className="bg-white text-slate-900 p-6 sm:p-10 rounded-3xl border-4 border-amber-400 shadow-2xl max-w-4xl mx-auto space-y-6"
            >
              <OfficialReportHeader
                seasonText={comp.seasonText}
                compName={comp.name}
                reportTitle="بطاقة نتيجة متسابق رسمية معتمدة"
                reportSubtitle="وثيقة رسمية صادرة عن لجنة التحكيم والتقييم بالمسابقة"
              />

              {/* بيانات المتسابق الأساسية الشاملة (جميع حقول القالب) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-amber-50/60 border-2 border-amber-200 text-xs font-bold">
                <div className="col-span-2">
                  <span className="text-slate-500 block">الاسم الكامل للمتسابق:</span>
                  <span className="text-base sm:text-lg font-black text-[#09152C] mt-0.5 block">
                    {certParticipant.participant.name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">رقم الطلب:</span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-0.5 block">
                    {certParticipant.participant.requestNumber || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">الولاية / الجنس:</span>
                  <span className="text-sm font-black text-slate-900 mt-0.5 block">
                    {[
                      certParticipant.participant.wilayat,
                      certParticipant.participant.gender,
                    ]
                      .filter(Boolean)
                      .join(' • ') || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">الرقم المدني:</span>
                  <span className="text-xs font-black font-mono text-slate-800 mt-0.5 block">
                    {certParticipant.participant.civilId || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">رقم الهاتف:</span>
                  <span className="text-xs font-black font-mono text-slate-800 mt-0.5 block">
                    {certParticipant.participant.phone || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">مستوى المشاركة:</span>
                  <span className="text-sm font-black text-emerald-900 mt-0.5 block">
                    {certParticipant.level?.name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">المركز والتقدير:</span>
                  <span className="text-sm font-black text-amber-800 mt-0.5 block">
                    {certParticipant.rankInLevel !== null
                      ? `المركز (${certParticipant.rankInLevel}) — ${certParticipant.gradeInfo.label}`
                      : certParticipant.gradeInfo.label}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-4 pt-2 border-t border-amber-200/70 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-500">المقرر والأجزاء المختارة: </span>
                    <span className="font-black text-slate-900">
                      {certParticipant.participant.juzsOrSurahs ||
                        certParticipant.level?.juzsOrSurahs}
                    </span>
                  </div>
                  {certParticipant.participant.registrationDate && (
                    <div>
                      <span className="text-slate-500">وقت وتاريخ التسجيل: </span>
                      <span className="font-black font-mono text-slate-800">
                        {certParticipant.participant.registrationDate}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ملخص النتيجة النهائية */}
              <div className="p-5 rounded-2xl bg-gradient-to-l from-[#09152C] via-[#163363] to-[#09152C] text-white flex flex-wrap items-center justify-between gap-4 shadow-md border-2 border-amber-400">
                <div>
                  <span className="text-xs font-bold text-amber-200 block">
                    المعدل والنتيجة النهائية المعتمدة:
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-amber-300 mt-1">
                    {certParticipant.isUnmemorized ? (
                      <span className="text-red-400 text-xl">
                        غير حافظ للمقرر
                      </span>
                    ) : certParticipant.averageScore !== null ? (
                      <>
                        {certParticipant.averageScore} من{' '}
                        {certParticipant.maxScore}
                        <span className="text-sm text-amber-100 font-bold mr-3">
                          (النسبة المئوية: {certParticipant.percentage}%)
                        </span>
                      </>
                    ) : (
                      'بانتظار رصد التقييم'
                    )}
                  </div>
                </div>

                <div className="text-left bg-white/10 px-4 py-2.5 rounded-xl border border-amber-300/40">
                  <span className="text-[11px] text-amber-100 block">
                    التقدير العام المعتمد:
                  </span>
                  <span className="text-base sm:text-lg font-black text-amber-300">
                    {certParticipant.gradeInfo.label}
                  </span>
                </div>
              </div>

              {/* تفاصيل تقييم كل مقيم ودرجات المقاطع */}
              <div className="space-y-3">
                <h4 className="font-black text-sm text-[#09152C] border-b-2 border-amber-200 pb-1.5">
                  تفصيل الدرجات المرصودة من لجنة التقييم:
                </h4>

                {certParticipant.evaluations.length > 0 ? (
                  <div className="space-y-2.5">
                    {certParticipant.evaluations.map((ev, evIdx) => (
                      <div
                        key={ev.id || evIdx}
                        className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-[#09152C]">
                            المقيم:{' '}
                            {getEvaluatorName(ev.evaluatorId, ev.evaluatorName)}
                          </span>
                          <span className="px-3 py-1 bg-[#09152C] text-amber-300 font-black text-xs rounded-xl">
                            الدرجة الكلية:{' '}
                            {ev.isUnmemorized
                              ? '0 (غير حافظ)'
                              : `${ev.totalScore} / ${certParticipant.maxScore}`}
                          </span>
                        </div>

                        {Array.isArray(ev.segments) &&
                          ev.segments.length > 0 &&
                          !ev.isUnmemorized && (
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                              {ev.segments.map((seg, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="p-2 rounded-xl bg-white border border-slate-200 text-center"
                                >
                                  <span className="block text-[10px] text-slate-500">
                                    المقطع {seg.segmentNumber || sIdx + 1}
                                  </span>
                                  <span className="block text-xs font-black text-emerald-900 mt-0.5">
                                    {seg.isUnmemorized
                                      ? 'غير حافظ (0)'
                                      : seg.score}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                        {ev.notes && (
                          <div className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-xl border border-amber-200">
                            ملاحظة المقيم: {ev.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-bold">
                    لم يتم رصد تقييمات لهذا المتسابق بعد.
                  </p>
                )}
              </div>

              {/* التوقيعات الرسمية */}
              <div className="pt-8 border-t-2 border-amber-400/60 grid grid-cols-2 gap-6 text-center text-xs sm:text-sm font-black text-slate-900">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[#09152C]">لجنة التقييم والتحكيم</p>
                  <p className="mt-8 text-slate-400 font-bold">
                    التوقيع: ..........................
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[#09152C]">
                    اعتماد إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة
                  </p>
                  <p className="mt-8 text-slate-400 font-bold">
                    التوقيع والختم الرسمي: ..........................
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border">
              يرجى اختيار متسابق لاستعراض بطاقة نتيجته الرسمية
            </div>
          )}
        </div>
      )}

      {/* نافذة تفاصيل التقييم للمتسابق */}
      {detailResult && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 no-print"
          onClick={() => setDetailParticipantId(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 bg-[#09152C] text-white">
              <div>
                <h4 className="font-black text-base text-amber-300">
                  تفاصيل تقييم المتسابق: {detailResult.participant.name}
                </h4>
                <p className="text-[11px] font-bold text-blue-100 mt-0.5">
                  {detailResult.level?.name} • المعدل:{' '}
                  {detailResult.averageScore} من {detailResult.maxScore} (
                  {detailResult.percentage}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailParticipantId(null)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 font-bold text-xs">
              {detailResult.evaluations.map((ev, idx) => (
                <div
                  key={ev.id || idx}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5"
                >
                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">
                      المقيم: {getEvaluatorName(ev.evaluatorId, ev.evaluatorName)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-[#09152C] text-amber-300 rounded-lg font-black">
                        الدرجة:{' '}
                        {ev.isUnmemorized
                          ? '0 (غير حافظ)'
                          : `${ev.totalScore} / ${detailResult.maxScore}`}
                      </span>
                      {onUpdate && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmEvalId(String(ev.id))}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="حذف هذا التقييم"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {Array.isArray(ev.segments) && ev.segments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {ev.segments.map((seg, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center"
                        >
                          <span className="block text-[10px] text-slate-500">
                            المقطع {seg.segmentNumber || sIdx + 1}
                          </span>
                          <span className="block text-xs font-black text-emerald-800 dark:text-amber-300 mt-0.5">
                            {seg.isUnmemorized ? 'غير حافظ (0)' : seg.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {ev.notes && (
                    <p className="text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50">
                      ملاحظات المقيم: {ev.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف تقييم فردي */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmEvalId}
        title="تأكيد حذف التقييم"
        message="هل أنت متأكد من حذف رصد تقييم هذا المقيم؟"
        confirmLabel="نعم، حذف التقييم"
        onConfirm={() => {
          if (deleteConfirmEvalId) handleDeleteEvaluation(deleteConfirmEvalId);
        }}
        onClose={() => setDeleteConfirmEvalId(null)}
      />

      {/* نافذة تأكيد حذف تقييمات متسابق محدد */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmParticipantId}
        title="تأكيد حذف تقييمات المتسابق"
        message={`هل أنت متأكد من حذف تقييمات المتسابق "${
          (comp.participants || []).find(
            p => Number(p.id) === Number(deleteConfirmParticipantId)
          )?.name || ''
        }"؟ ستتم إعادة حالة المتسابق إلى «بانتظار التقييم» وتصفير درجاته.`}
        confirmLabel="نعم، حذف تقييمات المتسابق"
        onConfirm={() => {
          if (deleteConfirmParticipantId)
            handleDeleteParticipantEvaluations(deleteConfirmParticipantId);
        }}
        onClose={() => setDeleteConfirmParticipantId(null)}
      />

      {/* نافذة تأكيد حذف التقييمات المحددة فقط */}
      <ConfirmDeleteModal
        isOpen={showDeleteSelectedEvalsModal}
        title="تأكيد حذف التقييمات المحددة"
        message={`هل أنت متأكد من حذف التقييمات المحددة (عددها: ${selectedEvalIds.size} تقييم)؟ ستتم إعادة المتسابقين المتأثرين إلى حالة «بانتظار التقييم» وتصفير درجاتهم.`}
        confirmLabel={`نعم، حذف (${selectedEvalIds.size}) تقييم`}
        onConfirm={handleDeleteSelectedEvaluations}
        onClose={() => setShowDeleteSelectedEvalsModal(false)}
      />

      {/* نافذة تأكيد حذف جميع التقييمات بالكامل */}
      <ConfirmDeleteModal
        isOpen={showDeleteAllEvalsModal}
        title="تأكيد حذف جميع تقييمات المسابقة"
        message={`⚠️ تحذير شديد الأهمية: هل أنت متأكد تماماً من حذف جميع التقييمات المسجلة في المسابقة بالكامل (إجمالي التقييمات: ${
          (comp.evaluations || []).length
        })؟ سيتم تصفير نتائج كافة المتسابقين وإعادتهم جميعاً إلى حالة «بانتظار التقييم».`}
        confirmLabel="نعم، تأكيد حذف جميع التقييمات"
        onConfirm={handleDeleteAllEvaluations}
        onClose={() => setShowDeleteAllEvalsModal(false)}
      />

      {/* نافذة تأكيد استبعاد متسابق */}
      <ConfirmDeleteModal
        isOpen={!!excludeParticipantTarget}
        title="تأكيد استبعاد المتسابق"
        message="هل أنت متأكد من إخراج واستبعاد المتسابق من المسابقة؟"
        confirmLabel="نعم، تأكيد الاستبعاد"
        onConfirm={handleExcludeUnmemorizedConfirm}
        onClose={() => setExcludeParticipantTarget(null)}
      />

      {/* نافذة إدارة وحذف التقييمات الشاملة */}
      {showManageEvalsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 no-print animate-in fade-in duration-150"
          onClick={() => setShowManageEvalsModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 bg-[#09152C] text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shrink-0">
                  <Sliders size={20} />
                </div>
                <div>
                  <h4 className="font-black text-base text-amber-300">
                    إدارة وحذف التقييمات المسجلة
                  </h4>
                  <p className="text-[11px] font-bold text-slate-300 mt-0.5">
                    إجمالي التقييمات: {(comp.evaluations || []).length} • يمكنك تحديد تقييمات معينة لحذفها أو حذف كافة التقييمات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManageEvalsModal(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black cursor-pointer"
              >
                إغلاق ✕
              </button>
            </div>

            {/* شريط الإجراءات والبحث السريع داخل النافذة */}
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={manageEvalsSearchQuery}
                  onChange={e => setManageEvalsSearchQuery(e.target.value)}
                  placeholder="ابحث باسم المتسابق أو المقيم أو المستوى..."
                  className="w-full pr-9 pl-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={selectedEvalIds.size === 0}
                  onClick={() => setShowDeleteSelectedEvalsModal(true)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Trash2 size={15} />
                  <span>حذف التقييمات المحددة ({selectedEvalIds.size})</span>
                </button>

                {(comp.evaluations || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteAllEvalsModal(true)}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 text-xs font-black transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={15} />
                    <span>حذف التقييمات كلها</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const allIds = (comp.evaluations || []).map(e => String(e.id));
                    if (selectedEvalIds.size === allIds.length && allIds.length > 0) {
                      setSelectedEvalIds(new Set());
                    } else {
                      setSelectedEvalIds(new Set(allIds));
                    }
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  {selectedEvalIds.size === (comp.evaluations || []).length && (comp.evaluations || []).length > 0
                    ? 'إلغاء تحديد الكل'
                    : 'تحديد الكل'}
                </button>
              </div>
            </div>

            {/* قائمة التقييمات */}
            <div className="p-3 sm:p-4 overflow-y-auto max-h-[60vh] space-y-2.5">
              {(() => {
                const searchClean = manageEvalsSearchQuery.trim().toLowerCase();
                const filteredEvals = (comp.evaluations || []).filter(ev => {
                  if (!searchClean) return true;
                  const part = (comp.participants || []).find(p => Number(p.id) === Number(ev.participantId));
                  const lvl = (comp.levels || []).find(l => Number(l.id) === Number(ev.levelId || part?.levelId));
                  const evName = getEvaluatorName(ev.evaluatorId, ev.evaluatorName).toLowerCase();
                  const pName = (part?.name || '').toLowerCase();
                  const lName = (lvl?.name || '').toLowerCase();
                  return pName.includes(searchClean) || evName.includes(searchClean) || lName.includes(searchClean);
                });

                if (filteredEvals.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                      {manageEvalsSearchQuery ? 'لا توجد تقييمات مطابقة لبحثك' : 'لا توجد أي تقييمات مسجلة في هذه المسابقة حتى الآن.'}
                    </div>
                  );
                }

                return filteredEvals.map((ev, idx) => {
                  const part = (comp.participants || []).find(p => Number(p.id) === Number(ev.participantId));
                  const lvl = (comp.levels || []).find(l => Number(l.id) === Number(ev.levelId || part?.levelId));
                  const maxScore = lvl?.maxScore || 100;
                  const isChecked = selectedEvalIds.has(String(ev.id));

                  return (
                    <div
                      key={ev.id || idx}
                      className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
                        isChecked
                          ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400 shadow-2xs'
                          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const checked = e.target.checked;
                            setSelectedEvalIds(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(String(ev.id));
                              else next.delete(String(ev.id));
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {part?.name || `متسابق #${ev.participantId}`}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                              {lvl?.name || 'مستوى المسابقة'}
                            </span>
                            {part?.wilayat && (
                              <span className="text-[10px] text-slate-500 font-bold">
                                • {part.wilayat}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5 flex-wrap">
                            <span>المقيم: <strong className="text-slate-700 dark:text-slate-200">{getEvaluatorName(ev.evaluatorId, ev.evaluatorName)}</strong></span>
                            {ev.timestamp && (
                              <span>• {new Date(ev.timestamp).toLocaleDateString('ar-OM', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700">
                        <div className="text-right sm:text-left">
                          <span className="px-2.5 py-1 rounded-xl bg-[#09152C] text-amber-300 font-black text-xs">
                            {ev.isUnmemorized ? '0 (غير حافظ)' : `${ev.totalScore} / ${maxScore}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmEvalId(String(ev.id))}
                          className="min-h-[32px] px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900 font-black text-xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
                          title="حذف هذا التقييم"
                        >
                          <Trash2 size={14} />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


