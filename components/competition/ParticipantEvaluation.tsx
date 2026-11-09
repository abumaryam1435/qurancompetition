import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { AppContext } from '../../App';
import { commitParticipantEvaluationToCloud } from '../../utils/firebase';
import {
  Competition,
  CompetitionEvaluator,
  CompetitionParticipant,
  CompetitionSegmentEvaluation,
  CompetitionEvaluation,
} from '../../types';
import {
  ChevronRight,
  Save,
  ShieldAlert,
  BookOpen,
  Shuffle,
  Target,
  CheckCircle2,
  Check,
  Circle,
  SlidersHorizontal,
  Users,
  AlertCircle,
  MessageSquare,
  AlertTriangle,
  XCircle,
  Sparkles,
  Lock,
  Unlock,
} from 'lucide-react';
import { MushafReaderModal } from '../MushafReaderModal';
import {
  generateSuggestedTestPassages,
  SuggestedTestPassage,
  formatPassageDescription,
} from '../../utils/testPassageGenerator';
import { surahNames, juzPagesMap, surahPagesMap } from '../../utils/quranData';
import {
  toArabicDigits,
  parseJuzsToNumbers,
  formatJuzsFromNumbers,
  formatJuzsOrSurahsDisplay,
  extractJuzCount,
  isUnspecifiedJuzCount,
  getErrorColorStyle,
  resolveCompetitionErrorCategories,
  resolveCompetitionErrors,
} from '../../utils/juzUtils';
import { preloadMushafPages } from '../../utils/mushafPreload';
import { preloadVerseLinesForPages } from '../../utils/mushafVerseHighlightService';
import { Logo, AwqafBadge } from '../Logo';

interface ResolvedScopeDetails {
  scopeType: 'juzs' | 'surahs';
  juzs: number[];
  pages: number[];
  surahIds: number[];
}

interface LocalEvaluationDraft {
  selectedJuzs: number[];
  segments: CompetitionSegmentEvaluation[];
  completedPassages: number[];
  activeSegmentIndex: number;
  evaluationNotes: string;
  localPassageSeed?: number;
  updatedAt: number;
}

/**
 * استخراج تفاصيل نطاق المتسابق (أجزاء أو سور) وصفحات المصحف المسموحة بدقة
 */
function resolveScopeDetails(scopeStr: string): ResolvedScopeDetails {
  const clean = (scopeStr || '').trim();
  const pages = new Set<number>();
  const all30Juzs = Array.from({ length: 30 }, (_, i) => i + 1);
  const all604Pages = Array.from({ length: 604 }, (_, i) => i + 1);

  if (!clean) {
    return {
      scopeType: 'juzs',
      juzs: all30Juzs,
      pages: all604Pages,
      surahIds: [],
    };
  }

  if (clean.startsWith('الأجزاء:')) {
    const juzs = parseJuzsToNumbers(clean.replace('الأجزاء:', ''));
    juzs.forEach(j => {
      if (juzPagesMap[j]) juzPagesMap[j].forEach(p => pages.add(p));
    });
    const sortedPages = pages.size > 0 ? Array.from(pages).sort((a, b) => a - b) : all604Pages;
    return {
      scopeType: 'juzs',
      juzs: juzs.length > 0 ? juzs : all30Juzs,
      pages: sortedPages,
      surahIds: [],
    };
  }

  if (clean.startsWith('السور:')) {
    const names = clean
      .replace('السور:', '')
      .split(/[،,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const surahIds: number[] = [];
    names.forEach(name => {
      const cleanName = name.replace(/^سورة\s+/, '').trim();
      const sId = surahNames.indexOf(cleanName);
      if (sId > 0 && surahPagesMap[sId]) {
        surahIds.push(sId);
        surahPagesMap[sId].forEach(p => pages.add(p));
      }
    });
    const sortedPages = pages.size > 0 ? Array.from(pages).sort((a, b) => a - b) : all604Pages;
    return {
      scopeType: 'surahs',
      juzs: [],
      pages: sortedPages,
      surahIds,
    };
  }

  // فحص ما إذا كان النص يشير إلى المصحف كاملاً (30 جزءاً)
  if (
    clean.includes('القرآن كاملاً') ||
    clean.includes('القرآن كامل') ||
    clean.includes('المصحف كاملا') ||
    clean.includes('المصحف كاملاً') ||
    extractJuzCount(clean) === 30
  ) {
    return {
      scopeType: 'juzs',
      juzs: all30Juzs,
      pages: all604Pages,
      surahIds: [],
    };
  }

  if (clean.includes('جزء عم') || clean.includes('الجزء 30') || clean === 'عم') {
    return {
      scopeType: 'juzs',
      juzs: [30],
      pages: [...(juzPagesMap[30] || [])],
      surahIds: [],
    };
  }

  if (clean.includes('جزء تبارك') || clean.includes('الجزء 29') || clean === 'تبارك') {
    return {
      scopeType: 'juzs',
      juzs: [29],
      pages: [...(juzPagesMap[29] || [])],
      surahIds: [],
    };
  }

  // فحص أسماء السور ككلمات كاملة فقط لتجنب تطابق حرف (ق) مع كلمة (القرآن)
  const cleanTokens = clean
    .replace(/[()،,\-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
  const matchedSurahIds: number[] = [];
  surahNames.slice(1).forEach((sName, idx) => {
    const sId = idx + 1;
    const isExactMatch =
      clean === sName ||
      clean.includes(`سورة ${sName}`) ||
      (sName.length > 2 && cleanTokens.includes(sName));
    if (isExactMatch && surahPagesMap[sId]) {
      matchedSurahIds.push(sId);
      surahPagesMap[sId].forEach(p => pages.add(p));
    }
  });

  if (matchedSurahIds.length > 0 && pages.size > 0) {
    return {
      scopeType: 'surahs',
      juzs: [],
      pages: Array.from(pages).sort((a, b) => a - b),
      surahIds: matchedSurahIds,
    };
  }

  return {
    scopeType: 'juzs',
    juzs: all30Juzs,
    pages: all604Pages,
    surahIds: [],
  };
}

export default function ParticipantEvaluation({
  comp,
  evaluator,
  participant,
  onBack,
}: {
  comp: Competition;
  evaluator: CompetitionEvaluator;
  participant: CompetitionParticipant;
  onBack: () => void;
  key?: React.Key;
}) {
  const context = useContext(AppContext);
  if (!context) return null;

  const level = (comp.levels || []).find(
    l => Number(l.id) === Number(participant.levelId)
  );
  if (!level) return null;

  const segmentsCount = Math.max(1, Number(level.segmentsCount) || 5);
  const linesPerSegment = Math.max(1, Number(level.linesPerSegment) || 7);

  // قراءة النسخة الحية للمسابقة والمتسابق من السياق
  const currentComp = useMemo(
    () =>
      (context?.competitions || []).find(c => String(c.id) === String(comp.id)) ||
      comp,
    [context?.competitions, comp]
  );

  const liveParticipant = useMemo(
    () =>
      (currentComp.participants || []).find(p => Number(p.id) === Number(participant.id)) ||
      participant,
    [currentComp.participants, participant]
  );

  // التقييم الحالي الخاص بهذا المقيم تحديداً لهذا المتسابق
  const existingEval = (currentComp.evaluations || []).find(
    ev =>
      Number(ev.participantId) === Number(participant.id) &&
      Number(ev.evaluatorId) === Number(evaluator.id)
  );

  // التقييمات المرصودة لهذا المتسابق من مقيمين آخرين في نفس المسابقة
  const otherEvaluations = (currentComp.evaluations || []).filter(
    ev =>
      Number(ev.participantId) === Number(participant.id) &&
      Number(ev.evaluatorId) !== Number(evaluator.id)
  );

  // قراءة بيانات المقيم الحالية من المسابقة للتحقق من أحدث صلاحيات التعديل المسندة من المشرف
  const currentEvaluator = useMemo(
    () =>
      (currentComp.evaluators || []).find(e => Number(e.id) === Number(evaluator.id)) ||
      evaluator,
    [currentComp.evaluators, evaluator]
  );

  // التحقق من صلاحية تعديل التقييم بعد الحفظ:
  // إذا لم يكن هناك تقييم محفوظ مسبقاً فالتقييم متاح، أما إذا كان محفوظاً فلا يمكن التعديل إلا إذا سمح المشرف بذلك لهذا المستوى تحديداً
  const isEditAllowed = useMemo(() => {
    if (!existingEval) return true;
    const allowedLevels = (currentEvaluator.allowedEditLevelIds || []).map(Number);
    return allowedLevels.includes(Number(participant.levelId));
  }, [existingEval, currentEvaluator.allowedEditLevelIds, participant.levelId]);

  const isReadOnly = Boolean(existingEval && !isEditAllowed);

  // مفتاح المسودة المحلية الخاصة بهذا المقيم وهذا المتسابق (حفظ محلي 100% أثناء التقييم لمنع أي تعارض بين المقيمين)
  const draftStorageKey = `quran_eval_draft_${comp.id}_${evaluator.id}_${participant.id}`;

  const savedDraft = useMemo<LocalEvaluationDraft | null>(() => {
    if (isReadOnly) return null;
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as LocalEvaluationDraft;
    } catch {
      // ignore localStorage read errors
    }
    return null;
  }, [draftStorageKey, isReadOnly]);

  // ترتيب المتسابق الموحد داخل نفس المستوى (0 للمتسابق الأول، 1 للثاني، 2 للثالث...)
  // لضمان ظهور نفس المقاطع تماماً لدى جميع المقيمين لنفس المتسابق، مع اختلافها من متسابق لآخر
  const participantOrderIndex = useMemo(() => {
    const sameLevelList = [...(currentComp.participants || [])]
      .filter(p => Number(p.levelId) === Number(level.id))
      .sort((a, b) => Number(a.id) - Number(b.id));
    const idx = sameLevelList.findIndex(p => Number(p.id) === Number(participant.id));
    return idx >= 0 ? idx : 0;
  }, [currentComp.participants, level.id, participant.id]);

  const [localPassageSeed, setLocalPassageSeed] = useState<number>(() => {
    if (savedDraft?.localPassageSeed !== undefined) {
      return Number(savedDraft.localPassageSeed);
    }
    return Number(liveParticipant.passageSeed || 0);
  });

  const currentPassageSeed = localPassageSeed;

  const rawLevelScope = level.juzsOrSurahs || '';
  const rawParticipantScope = liveParticipant.juzsOrSurahs || participant.juzsOrSurahs || '';

  // فحص هل المستوى محدد بعدد أجزاء دون تعيينها بدقة (مثل: 3 أجزاء، 5 أجزاء متتالية، 10 أجزاء)
  const isLevelUnspecified =
    Boolean(level.isUnspecifiedJuzs) || isUnspecifiedJuzCount(rawLevelScope);
  const requiredJuzCount =
    level.juzCount ||
    extractJuzCount(rawLevelScope) ||
    extractJuzCount(level.name) ||
    extractJuzCount(rawParticipantScope) ||
    (isLevelUnspecified ? 5 : 0);
  const isConsecutiveLevel =
    level.isConsecutiveJuzs !== false && !rawLevelScope.includes('متفرقة');

  // استخراج الأجزاء المحددة مسبقاً للمتسابق أو من المسودة المحلية
  const initialJuzs = useMemo(() => {
    if (
      savedDraft &&
      Array.isArray(savedDraft.selectedJuzs) &&
      savedDraft.selectedJuzs.length > 0 &&
      (!isLevelUnspecified || savedDraft.selectedJuzs.length === requiredJuzCount)
    ) {
      return savedDraft.selectedJuzs;
    }
    if (rawParticipantScope.startsWith('الأجزاء:')) {
      const parsed = parseJuzsToNumbers(rawParticipantScope.replace('الأجزاء:', ''));
      if (parsed.length > 0 && (!isLevelUnspecified || parsed.length === requiredJuzCount)) {
        return parsed;
      }
    }
    if (!isLevelUnspecified && rawLevelScope.startsWith('الأجزاء:')) {
      const parsed = parseJuzsToNumbers(rawLevelScope.replace('الأجزاء:', ''));
      if (parsed.length > 0) return parsed;
    }
    if (isLevelUnspecified && requiredJuzCount > 0) {
      // افتراضياً: أول الأجزاء المتتالية بعدد المطلوب (مثلاً 1 إلى 5) حتى ينقر المقيم على الجزء المطلوب
      return Array.from({ length: requiredJuzCount }, (_, idx) => idx + 1);
    }
    return [];
  }, [savedDraft, rawParticipantScope, rawLevelScope, isLevelUnspecified, requiredJuzCount]);

  const [selectedJuzs, setSelectedJuzs] = useState<number[]>(initialJuzs);

  // دالة حفظ الأجزاء التي يختارها المقيم محلياً أثناء التقييم (يتم اعتمادها سحابياً عند الحفظ النهائي فقط)
  const applyEvaluatorJuzSelection = (nextJuzs: number[]) => {
    const sorted = [...new Set(nextJuzs)]
      .filter(n => n >= 1 && n <= 30)
      .sort((a, b) => a - b);
    setSelectedJuzs(sorted);
  };

  // هل اكتمل تحديد عدد الأجزاء المطلوب تماماً؟
  const hasExactJuzsSelected =
    !isLevelUnspecified || (requiredJuzCount > 0 && selectedJuzs.length === requiredJuzCount);

  // إذا كان المستوى غير محدد الأجزاء مسبقاً (مثلاً 5 أجزاء متتالية يحددها المقيم)، نعرض شبكة الأجزاء مباشرة لسهولة النقر على الجزء الأول
  const [showScopeSelector, setShowScopeSelector] = useState<boolean>(isLevelUnspecified);

  // خانة ملاحظات المقيم
  const [evaluationNotes, setEvaluationNotes] = useState<string>(
    savedDraft?.evaluationNotes !== undefined
      ? savedDraft.evaluationNotes
      : existingEval?.notes || ''
  );

  const [segments, setSegments] = useState<CompetitionSegmentEvaluation[]>(() => {
    if (
      savedDraft &&
      Array.isArray(savedDraft.segments) &&
      savedDraft.segments.length === segmentsCount
    ) {
      return savedDraft.segments.map((found, i) => ({
        segmentNumber: i + 1,
        errorsCount: found?.errorsCount ? { ...found.errorsCount } : {},
        score: found?.score || 0,
        isUnmemorized: Boolean(found?.isUnmemorized),
        passageDescription: found?.passageDescription,
      }));
    }
    if (existingEval && Array.isArray(existingEval.segments) && existingEval.segments.length > 0) {
      return Array.from({ length: segmentsCount }).map((_, i) => {
        const found = existingEval.segments[i];
        return {
          segmentNumber: i + 1,
          errorsCount: found?.errorsCount ? { ...found.errorsCount } : {},
          score: found?.score || 0,
          isUnmemorized: Boolean(found?.isUnmemorized),
          passageDescription: found?.passageDescription,
        };
      });
    }
    return Array.from({ length: segmentsCount }).map((_, i) => ({
      segmentNumber: i + 1,
      errorsCount: {},
      score: 0,
      isUnmemorized: false,
    }));
  });

  const [completedPassages, setCompletedPassages] = useState<number[]>(() => {
    if (savedDraft && Array.isArray(savedDraft.completedPassages)) {
      return savedDraft.completedPassages.filter(n => n >= 1 && n <= segmentsCount);
    }
    return existingEval ? Array.from({ length: segmentsCount }, (_, i) => i + 1) : [];
  });

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(() => {
    if (
      savedDraft &&
      typeof savedDraft.activeSegmentIndex === 'number' &&
      savedDraft.activeSegmentIndex >= 0 &&
      savedDraft.activeSegmentIndex < segmentsCount
    ) {
      return savedDraft.activeSegmentIndex;
    }
    return 0;
  });

  // نافذة تأكيد الخروج وحفظ النتيجة النهائية
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);
  const [isSavingFinal, setIsSavingFinal] = useState<boolean>(false);

  // حفظ المسودة محلياً (localStorage) تلقائياً عند أي تعديل في الدرجات أو المقاطع دون إرسال أي طلبات سحابية أثناء التقييم
  useEffect(() => {
    if (isReadOnly) return;
    try {
      const draftPayload: LocalEvaluationDraft = {
        selectedJuzs,
        segments,
        completedPassages,
        activeSegmentIndex,
        evaluationNotes,
        localPassageSeed,
        updatedAt: Date.now(),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
    } catch {
      // ignore storage quota errors
    }
  }, [
    isReadOnly,
    draftStorageKey,
    selectedJuzs,
    segments,
    completedPassages,
    activeSegmentIndex,
    evaluationNotes,
    localPassageSeed,
  ]);

  // تنبيه المتصفح إذا حاول المقيم إغلاق التبويب قبل حفظ النتيجة النهائية
  useEffect(() => {
    if (isReadOnly) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isReadOnly]);

  // التأكد عند فتح صفحة المتسابق من التمرير لأعلى الصفحة
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 40);
    return () => clearTimeout(timer);
  }, [participant.id]);

  const [isMushafOpen, setIsMushafOpen] = useState(false);
  const [activePassageForMushaf, setActivePassageForMushaf] =
    useState<SuggestedTestPassage | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleCloseMushafAndScrollToSave = () => {
    setIsMushafOpen(false);
    setTimeout(() => {
      if (saveButtonRef.current) {
        saveButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      }
    }, 80);
  };

  const effectiveScopeStr = useMemo(() => {
    if (selectedJuzs.length > 0) {
      return `الأجزاء: ${formatJuzsFromNumbers(selectedJuzs)}`;
    }
    return formatJuzsOrSurahsDisplay(rawParticipantScope || rawLevelScope);
  }, [selectedJuzs, rawParticipantScope, rawLevelScope]);

  const scopeDetails = useMemo(
    () => resolveScopeDetails(effectiveScopeStr),
    [effectiveScopeStr]
  );

  const allowedPages = scopeDetails.pages;

  const [suggestedPassages, setSuggestedPassages] = useState<SuggestedTestPassage[]>([]);

  const activePassageMode = comp.passageMode || 'random';
  const activeManualPassages = comp.manualPassages || [];

  const prevSyncedSeedRef = useRef<number>(currentPassageSeed);

  // توليد المقاطع المقترحة المظللة الموحدة لجميع المقيمين في اللجنة لنفس المتسابق
  useEffect(() => {
    if (isLevelUnspecified && !hasExactJuzsSelected) {
      setSuggestedPassages([]);
      return;
    }

    const generated = generateSuggestedTestPassages(
      allowedPages,
      segmentsCount,
      linesPerSegment,
      {
        mode: activePassageMode,
        manualPassages: activeManualPassages,
        scopeType: scopeDetails.scopeType,
        explicitJuzs: scopeDetails.juzs,
        allowedSurahIds: scopeDetails.surahIds,
        participantOrderIndex,
        participantSeed: currentPassageSeed,
      }
    );
    setSuggestedPassages(generated);

    setActivePassageForMushaf(prev => {
      if (!prev) return null;
      return (
        generated.find(p => p.passageNumber === prev.passageNumber) ||
        generated[activeSegmentIndex] ||
        generated[0] ||
        null
      );
    });

    if (prevSyncedSeedRef.current !== currentPassageSeed) {
      prevSyncedSeedRef.current = currentPassageSeed;
    }

    const passagePages = generated.flatMap(p => p.pages);
    if (passagePages.length > 0) {
      preloadMushafPages(passagePages);
      preloadVerseLinesForPages(passagePages);
    }
  }, [
    participant.id,
    participantOrderIndex,
    currentPassageSeed,
    allowedPages,
    scopeDetails,
    segmentsCount,
    linesPerSegment,
    activePassageMode,
    activeManualPassages,
    isLevelUnspecified,
    hasExactJuzsSelected,
    activeSegmentIndex,
  ]);

  const handleRegeneratePassages = () => {
    if (isLevelUnspecified && !hasExactJuzsSelected) {
      context.showToast(
        `يرجى تحديد الأجزاء الـ ${requiredJuzCount} للمتسابق أولاً قبل توليد المقاطع`,
        'info'
      );
      setShowScopeSelector(true);
      return;
    }

    const nextSeed = currentPassageSeed + 1;
    prevSyncedSeedRef.current = nextSeed;
    setLocalPassageSeed(nextSeed);

    const generated = generateSuggestedTestPassages(
      allowedPages,
      segmentsCount,
      linesPerSegment,
      {
        mode: activePassageMode,
        manualPassages: activeManualPassages,
        scopeType: scopeDetails.scopeType,
        explicitJuzs: scopeDetails.juzs,
        allowedSurahIds: scopeDetails.surahIds,
        participantOrderIndex,
        participantSeed: nextSeed,
      }
    );
    setSuggestedPassages(generated);
    setActiveSegmentIndex(0);
    setCompletedPassages([]);
    setActivePassageForMushaf(generated[0] || null);

    const passagePages = generated.flatMap(p => p.pages);
    if (passagePages.length > 0) {
      preloadMushafPages(passagePages);
      preloadVerseLinesForPages(passagePages);
    }
    const modeLabel =
      activePassageMode === 'international'
        ? 'بتناوب تصنيف المسابقات العالمية'
        : activePassageMode === 'manual'
        ? 'بالتناوب من التحديد اليدوي للمشرف'
        : `${linesPerSegment} أسطر فعلية للمقطع`;
    context.showToast(
      `تم اقتراح مقاطع جديدة (${modeLabel}) — ابدأ بتقييم المقطع الأول`,
      'info'
    );
  };

  // التحقق هل المقطع رقم idx (0-indexed) مفتوح للتقييم أم مقفل بانتظار المقطع السابق
  const isSegmentUnlocked = (idx: number): boolean => {
    if (idx === 0 || isReadOnly) return true;
    for (let prev = 1; prev <= idx; prev++) {
      if (!completedPassages.includes(prev)) return false;
    }
    return true;
  };

  const allSegmentsCompleted = useMemo(() => {
    for (let p = 1; p <= segmentsCount; p++) {
      if (!completedPassages.includes(p)) return false;
    }
    return true;
  }, [completedPassages, segmentsCount]);

  const firstIncompleteSegmentNumber = useMemo(() => {
    for (let p = 1; p <= segmentsCount; p++) {
      if (!completedPassages.includes(p)) return p;
    }
    return segmentsCount;
  }, [completedPassages, segmentsCount]);

  const compErrorCategories = useMemo(
    () => resolveCompetitionErrorCategories(comp),
    [comp]
  );

  const levelErrors = useMemo(() => {
    return resolveCompetitionErrors(comp);
  }, [comp]);

  const segmentMaxScore = Number((level.maxScore / segmentsCount).toFixed(2));

  const calculateSegmentDeduction = (seg: CompetitionSegmentEvaluation) => {
    if (seg?.isUnmemorized) {
      return segmentMaxScore;
    }
    let deduction = 0;
    Object.entries(seg?.errorsCount || {}).forEach(([errIdStr, count]) => {
      const err = levelErrors.find(e => Number(e.id) === Number(errIdStr));
      if (err) {
        deduction += Number(count) * Number(err.deduction);
      }
    });
    return Math.min(segmentMaxScore, Number(deduction.toFixed(2)));
  };

  /**
   * إتمام تقييم المقطع الحالي (حفظ درجته محلياً وفتح المقطع التالي تلقائياً)
   * سواء من بطاقة المقطع أو من داخل نافذة المصحف الشريف
   */
  const handleCompleteSegment = (segIdx: number, fromMushaf = false) => {
    if (isReadOnly) return;
    if (!isSegmentUnlocked(segIdx)) {
      context.showToast(
        `يرجى الضغط على «تم التقييم» للمقطع ${toArabicDigits(segIdx)} أولاً قبل الانتقال للمقطع ${toArabicDigits(segIdx + 1)}`,
        'info'
      );
      return;
    }

    const passageNum = segIdx + 1;
    const currentSeg = segments[segIdx] || {
      segmentNumber: passageNum,
      errorsCount: {},
      score: segmentMaxScore,
      isUnmemorized: false,
    };
    const isUnmem = Boolean(currentSeg.isUnmemorized);
    const segDed = isUnmem ? segmentMaxScore : calculateSegmentDeduction(currentSeg);
    const segScore = isUnmem ? 0 : Math.max(0, Number((segmentMaxScore - segDed).toFixed(2)));
    const passage = suggestedPassages[segIdx];

    // حفظ درجة المقطع محلياً في مصفوفة المقاطع
    setSegments(prev => {
      const next = [...prev];
      next[segIdx] = {
        ...currentSeg,
        segmentNumber: passageNum,
        score: segScore,
        passageDescription: passage?.description || currentSeg.passageDescription,
      };
      return next;
    });

    const nextCompleted = completedPassages.includes(passageNum)
      ? completedPassages
      : [...completedPassages, passageNum].sort((a, b) => a - b);
    setCompletedPassages(nextCompleted);

    // إذا كان هناك مقطع تالٍ: يفتح المقطع التالي وينتقل إليه تلقائياً
    if (segIdx + 1 < segmentsCount) {
      const nextIdx = segIdx + 1;
      setActiveSegmentIndex(nextIdx);
      const nextPassage = suggestedPassages[nextIdx] || null;
      if (fromMushaf || isMushafOpen) {
        if (nextPassage) {
          setActivePassageForMushaf(nextPassage);
        }
      } else {
        setTimeout(() => {
          const el = document.getElementById(`segment-card-${nextIdx}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      }
      context.showToast(
        `تم حفظ درجة المقطع ${toArabicDigits(passageNum)} (${segScore} / ${segmentMaxScore}) محلياً وفتح المقطع ${toArabicDigits(nextIdx + 1)} تلقائياً`,
        'success'
      );
    } else {
      // المقطع الأخير: اكتمل تقييم كافة المقاطع
      if (fromMushaf || isMushafOpen) {
        handleCloseMushafAndScrollToSave();
      } else {
        setTimeout(() => {
          if (saveButtonRef.current) {
            saveButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 80);
      }
      context.showToast(
        `اكتمل تقييم جميع المقاطع (${toArabicDigits(segmentsCount)}/${toArabicDigits(segmentsCount)}) — يرجى الضغط على «حفظ واعتماد تقييم المقيم» بالأسفل`,
        'success'
      );
    }
  };

  const togglePassageCompleted = (num: number) => {
    const segIdx = Math.max(0, num - 1);
    handleCompleteSegment(segIdx, false);
  };

  const handleOpenPassageInMushaf = (passage: SuggestedTestPassage, idx: number) => {
    if (!isSegmentUnlocked(idx)) {
      context.showToast(
        `لا يمكن فتح المقطع ${toArabicDigits(idx + 1)} قبل الضغط على «تم التقييم» للمقطع ${toArabicDigits(idx)}`,
        'info'
      );
      return;
    }
    setActiveSegmentIndex(idx);
    setActivePassageForMushaf(passage);
    setIsMushafOpen(true);
  };

  const handleSetSegmentErrorCount = (segIdx: number, errorId: number, newCount: number) => {
    const safeCount = Math.max(0, newCount);
    setSegments(prev => {
      const updated = [...prev];
      const seg = {
        ...(updated[segIdx] || {
          segmentNumber: segIdx + 1,
          errorsCount: {},
          score: 0,
        }),
      };
      seg.errorsCount = { ...(seg.errorsCount || {}), [errorId]: safeCount };
      updated[segIdx] = seg;
      return updated;
    });
  };

  const handleSetErrorCount = (errorId: number, newCount: number) => {
    handleSetSegmentErrorCount(activeSegmentIndex, errorId, newCount);
  };

  const handleToggleSegmentUnmemorized = (segIdx: number, unmem: boolean) => {
    setSegments(prev => {
      const copy = [...prev];
      copy[segIdx] = {
        ...(copy[segIdx] || {
          segmentNumber: segIdx + 1,
          errorsCount: {},
          score: 0,
        }),
        isUnmemorized: unmem,
      };
      return copy;
    });

    if (unmem) {
      context.showToast(
        `تم تسجيل المقطع ${segIdx + 1} كـ «غير حافظ» (خصم ${segmentMaxScore} درجة لهذا المقطع فقط)`,
        'info'
      );
    } else {
      context.showToast(`تم إلغاء حالة «غير حافظ» عن المقطع ${segIdx + 1}`, 'info');
    }
  };

  const handleSegmentErrorIncrement = (segIdx: number, errorId: number) => {
    const currentSeg = segments[segIdx] || {
      segmentNumber: segIdx + 1,
      errorsCount: {},
      score: 0,
    };
    if (currentSeg.isUnmemorized) return;

    const currentDeduction = calculateSegmentDeduction(currentSeg);
    if (currentDeduction >= segmentMaxScore) {
      context.showToast(
        `وصل المقطع ${segIdx + 1} إلى حد الخصم الأقصى (${segmentMaxScore} درجة)`,
        'info'
      );
      return;
    }

    const currentCount = currentSeg.errorsCount?.[errorId] || 0;
    handleSetSegmentErrorCount(segIdx, errorId, currentCount + 1);

    const errObj = levelErrors.find(e => Number(e.id) === Number(errorId));
    const errDeduction = Number(errObj?.deduction || 0);
    if (currentDeduction + errDeduction >= segmentMaxScore) {
      context.showToast(
        `اكتمل الخصم الأقصى للمقطع ${segIdx + 1} (${segmentMaxScore} درجة)`,
        'info'
      );
    }
  };

  const handleSegmentErrorDecrement = (segIdx: number, errorId: number) => {
    const current = segments[segIdx]?.errorsCount?.[errorId] || 0;
    if (current > 0) {
      handleSetSegmentErrorCount(segIdx, errorId, current - 1);
    }
  };

  const calculateTotalScore = () => {
    const total = segments.reduce((sum, seg) => {
      if (seg.isUnmemorized) return sum;
      const segDed = calculateSegmentDeduction(seg);
      return sum + Math.max(0, segmentMaxScore - segDed);
    }, 0);
    return Math.max(0, Number(total.toFixed(2)));
  };

  // محاولة الخروج من صفحة الطالب: إذا لم يكن التقييم محفوظاً ومعتمداً، تظهر رسالة تأكيد الحفظ ولا يخرج إلا بعد حفظ النتيجة النهائية
  const handleAttemptExit = () => {
    if (isReadOnly) {
      onBack();
      return;
    }
    setShowExitConfirmModal(true);
  };

  const handleSave = async () => {
    if (isSavingFinal) return;

    // 1. التحقق من اكتمال تحديد الأجزاء إذا كان المستوى محدد بعدد أجزاء
    if (isLevelUnspecified && requiredJuzCount > 0 && selectedJuzs.length !== requiredJuzCount) {
      context.showToast(
        `يجب تحديد ${requiredJuzCount} أجزاء تماماً للمتسابق "${participant.name}" قبل حفظ التقييم (تم تحديد ${selectedJuzs.length} من ${requiredJuzCount})`,
        'error'
      );
      setShowScopeSelector(true);
      setShowExitConfirmModal(false);
      return;
    }

    // 2. التحقق من الضغط على «تم التقييم» لكل مقطع من مقاطع الاختبار بالترتيب
    if (!allSegmentsCompleted) {
      const targetIdx = Math.max(0, firstIncompleteSegmentNumber - 1);
      setActiveSegmentIndex(targetIdx);
      setShowExitConfirmModal(false);
      context.showToast(
        `لا يمكن حفظ النتيجة المعتمدة إلا بعد الضغط على «تم التقييم» لكل مقطع (المقطع المتبقي حالياً: المقطع ${toArabicDigits(firstIncompleteSegmentNumber)} من ${toArabicDigits(segmentsCount)})`,
        'error'
      );
      setTimeout(() => {
        const el = document.getElementById(`segment-card-${targetIdx}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      return;
    }

    setIsSavingFinal(true);

    try {
      const allSegmentsUnmemorized = segments.length > 0 && segments.every(s => s.isUnmemorized);
      const finalScore = calculateTotalScore();

      const enrichedSegments: CompetitionSegmentEvaluation[] = segments.map((seg, i) => {
        const isUnmem = Boolean(seg.isUnmemorized);
        const segDed = isUnmem ? segmentMaxScore : calculateSegmentDeduction(seg);
        const passage = suggestedPassages[i];
        return {
          ...seg,
          segmentNumber: i + 1,
          isUnmemorized: isUnmem,
          score: isUnmem ? 0 : Math.max(0, Number((segmentMaxScore - segDed).toFixed(2))),
          passageDescription: passage?.description || seg.passageDescription,
        };
      });

      const finalScope =
        selectedJuzs.length > 0
          ? `الأجزاء: ${formatJuzsFromNumbers(selectedJuzs)}`
          : formatJuzsOrSurahsDisplay(participant.juzsOrSurahs || level.juzsOrSurahs);

      const newEval: CompetitionEvaluation = {
        id: existingEval ? existingEval.id : Date.now() + Math.floor(Math.random() * 1000),
        participantId: participant.id,
        evaluatorId: evaluator.id,
        evaluatorName: evaluator.name,
        levelId: level.id,
        segments: enrichedSegments,
        totalScore: finalScore,
        timestamp: Date.now(),
        notes: evaluationNotes.trim() || undefined,
        isUnmemorized: allSegmentsUnmemorized,
      };

      // الحفظ الذرّي النهائي في السحابة مع دمج تقييم هذا المقيم فقط دون التأثير على المقيمين الآخرين في نفس اللحظة
      const updatedComps = await commitParticipantEvaluationToCloud(comp.id, newEval, {
        participantId: participant.id,
        juzsOrSurahs: finalScope || participant.juzsOrSurahs,
        isUnmemorized: allSegmentsUnmemorized,
        passageSeed: currentPassageSeed,
      });

      context.updateCompetitions(updatedComps);

      // مسح المسودة المحلية بعد نجاح الحفظ النهائي
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}

      setShowExitConfirmModal(false);
      context.showToast(
        allSegmentsUnmemorized
          ? `تم حفظ واعتماد التقييم للمتسابق "${participant.name}" كـ «غير حافظ» (${finalScore} / ${level.maxScore})`
          : `تم حفظ واعتماد تقييمك النهائي (${finalScore} / ${level.maxScore}) للمتسابق "${participant.name}" بنجاح!`,
        'success'
      );
      onBack();
    } catch {
      context.showToast('حدث خطأ أثناء حفظ التقييم، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setIsSavingFinal(false);
    }
  };

  const totalScore = calculateTotalScore();
  const hasAnyUnmemorized = segments.some(s => s.isUnmemorized);
  const isOverallUnmemorized = segments.length > 0 && segments.every(s => s.isUnmemorized);

  return (
    <div
      className="bg-slate-50 dark:bg-slate-950 min-h-[100dvh] w-full max-w-full overflow-x-hidden text-slate-800 dark:text-slate-100 pb-12 text-right"
      dir="rtl"
    >
      {/* ترويسة التقييم العلوية: منسقة للهاتف (سطران بعرض كامل للاسم الثلاثي والقبيلة) وللكمبيوتر (سطر واحد) */}
      <header className="bg-white dark:bg-slate-900 px-2.5 sm:px-6 py-2 sm:py-3.5 shadow-sm sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 w-full">
        {/* تخطيط الكمبيوتر والشاشات الكبيرة (سطر واحد كما هو) */}
        <div className="hidden sm:flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={handleAttemptExit}
              className="min-h-[40px] min-w-[40px] p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
              title="رجوع لقائمة المتسابقين"
            >
              <ChevronRight size={20} />
            </button>
            <Logo size="xs" className="flex shrink-0" />
            <AwqafBadge variant="compact" tone="adaptive" />
            <div className="min-w-0 flex-1 text-right">
              <h1 className="text-lg font-black text-slate-900 dark:text-white leading-snug break-words whitespace-normal">
                {participant.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 font-bold leading-tight mt-0.5">
                <span className="leading-tight break-words whitespace-normal text-emerald-800 dark:text-emerald-300">
                  {level.name}
                </span>
                <span>•</span>
                <span className="text-slate-600 dark:text-slate-400 leading-tight break-words whitespace-normal">
                  المقيم: {evaluator.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {existingEval && (
              isReadOnly ? (
                <span
                  className="min-h-[36px] px-3 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 rounded-xl border border-amber-300 dark:border-amber-800 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs"
                  title="هذا التقييم معتمد ومحفوظ، والتعديل مقفل"
                >
                  <Lock size={14} className="text-amber-600 shrink-0" />
                  <span>معتمد ومقفل</span>
                </span>
              ) : (
                <span
                  className="min-h-[36px] px-3 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-300 dark:border-emerald-800 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs"
                  title="مسموح بتعديل هذا التقييم بإذن من المشرف"
                >
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>مسموح بالتعديل</span>
                </span>
              )
            )}
            <div
              className={`flex flex-col items-end px-3 py-1 rounded-xl border ${
                hasAnyUnmemorized
                  ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
              }`}
            >
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-none">
                {hasAnyUnmemorized ? 'غير حافظ' : 'الدرجة الكلية'}
              </span>
              <span className="text-xl font-black leading-tight text-emerald-800 dark:text-emerald-300">
                {totalScore}{' '}
                <span className="text-xs font-bold text-slate-500">
                  / {level.maxScore}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* تخطيط شاشة الهاتف: سطر علوي للأزرار والشعار والدرجة، وسطر ثانٍ بعرض الشاشة الكامل للاسم الثلاثي والقبيلة والمستوى */}
        <div className="flex sm:hidden flex-col gap-2 w-full">
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAttemptExit}
                className="min-h-[36px] min-w-[36px] p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
                title="رجوع لقائمة المتسابقين"
              >
                <ChevronRight size={19} />
              </button>
              <Logo size="xs" className="flex shrink-0" />
              <AwqafBadge variant="compact" tone="adaptive" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {existingEval && (
                isReadOnly ? (
                  <span
                    className="min-h-[34px] px-2 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 rounded-xl border border-amber-300 dark:border-amber-800 text-[11px] font-black flex items-center gap-1 shrink-0 shadow-2xs"
                    title="معتمد ومقفل"
                  >
                    <Lock size={13} className="text-amber-600 shrink-0" />
                    <span>مقفل</span>
                  </span>
                ) : (
                  <span
                    className="min-h-[34px] px-2 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 rounded-xl border border-emerald-300 dark:border-emerald-800 text-[11px] font-black flex items-center gap-1 shrink-0 shadow-2xs"
                    title="مسموح بالتعديل"
                  >
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>مسموح</span>
                  </span>
                )
              )}
              <div
                className={`flex flex-col items-end px-2.5 py-1 rounded-xl border ${
                  hasAnyUnmemorized
                    ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                }`}
              >
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-none">
                  {hasAnyUnmemorized ? 'غير حافظ' : 'الدرجة الكلية'}
                </span>
                <span className="text-sm font-black leading-tight text-emerald-800 dark:text-emerald-300">
                  {totalScore}{' '}
                  <span className="text-[10px] font-bold text-slate-500">
                    / {level.maxScore}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* السطر الثاني في الهاتف: الاسم الكامل للمتسابق (الثلاثي والقبيلة) + المستوى + المقيم بعرض الشاشة بالكامل */}
          <div className="w-full pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-right">
            <h1 className="text-sm xs:text-base font-black text-slate-900 dark:text-white leading-snug break-words whitespace-normal">
              {participant.name}
            </h1>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] font-bold mt-0.5">
              <span className="text-emerald-800 dark:text-emerald-300 break-words whitespace-normal">
                {level.name}
              </span>
              <span className="text-slate-500 dark:text-slate-400 break-words whitespace-normal">
                المقيم: {evaluator.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي للتقييم */}
      <main className="max-w-4xl mx-auto p-2.5 sm:p-5 space-y-4 sm:space-y-5">
        {/* تنبيه مختصر لحالة قفل التعديل أو السماح به */}
        {existingEval && isReadOnly && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 dark:from-amber-950/70 dark:via-orange-950/50 dark:to-rose-950/60 border-2 border-amber-500/90 dark:border-amber-500 shadow-xs flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-amber-500 text-white shadow-2xs shrink-0">
                <Lock size={16} />
              </div>
              <span className="font-black text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                هذا التقييم معتمد ومحفوظ مسبقاً (وضع العرض فقط)
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black shadow-2xs flex items-center gap-1 shrink-0">
              <Lock size={11} />
              <span>التعديل والحذف مقفل</span>
            </span>
          </div>
        )}

        {existingEval && !isReadOnly && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/20 dark:from-emerald-950/70 dark:via-teal-950/50 dark:to-emerald-950/60 border-2 border-emerald-500 shadow-xs flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <span className="font-black text-xs sm:text-sm text-emerald-950 dark:text-emerald-100">
                التعديل مسموح بإذن المشرف لهذا المستوى ({level.name})
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black shadow-2xs flex items-center gap-1 shrink-0">
              <Unlock size={11} />
              <span>صلاحية التعديل مفتوحة</span>
            </span>
          </div>
        )}

        {/* بطاقة معلومات المتسابق وتحديد الأجزاء والمقاطع المقترحة */}
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                المقرر المطلوب للمتسابق:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-300">
                  {effectiveScopeStr || 'مفتوح (كامل المصحف)'}
                </span>
                {requiredJuzCount > 0 && isLevelUnspecified && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 font-extrabold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                    مطلوب {requiredJuzCount} أجزاء بالضبط
                  </span>
                )}
                {!isReadOnly && (
                  <span className="text-[10px] sm:text-[11px] text-teal-800 dark:text-teal-200 font-black bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800">
                    حفظ محلي تلقائي أثناء التقييم ({toArabicDigits(completedPassages.length)}/{toArabicDigits(segmentsCount)} مقاطع مكتملة)
                  </span>
                )}
              </div>
            </div>

            {/* حالة تقييمات المقيمين الآخرين لهذا المتسابق */}
            {otherEvaluations.length > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/60 p-2 rounded-xl border border-blue-200 dark:border-blue-900/60 text-xs">
                <Users className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-bold text-blue-900 dark:text-blue-200">
                  تم تقييمه من {otherEvaluations.length} مقيم آخر:
                </span>
                <span className="font-black text-blue-700 dark:text-blue-300">
                  {otherEvaluations.map(ev => `${ev.totalScore}`).join(' ، ')}
                </span>
              </div>
            )}
          </div>

          {/* ==================== محدد الأجزاء الإلزامي إذا كان المستوى بعدد أجزاء غير محددة ==================== */}
          {isLevelUnspecified && (
            <div
              className={`p-3.5 sm:p-5 rounded-2xl border-2 transition-all space-y-3 ${
                !hasExactJuzsSelected
                  ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-md ring-2 ring-amber-300/40'
                  : 'bg-emerald-50/70 dark:bg-slate-800/80 border-emerald-300 dark:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      hasExactJuzsSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-amber-500 text-white animate-pulse'
                    }`}
                  >
                    {hasExactJuzsSelected ? <CheckCircle2 size={20} /> : <SlidersHorizontal size={20} />}
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                      تحديد أجزاء الاختبار للمتسابق ({requiredJuzCount} أجزاء{' '}
                      {isConsecutiveLevel ? 'متتالية' : 'متفرقة'})
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold mt-0.5">
                      {isConsecutiveLevel ? (
                        <>
                          انقر على <span className="text-emerald-700 dark:text-emerald-400 font-black">رقم الجزء الأول</span>{' '}
                          وسيتحدد معه تلقائياً باقي الـ{' '}
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">
                            {requiredJuzCount} أجزاء متتالية
                          </span>{' '}
                          (مثلاً انقر 6 لتحديد من 6 إلى {Math.min(30, 6 + requiredJuzCount - 1)}).
                        </>
                      ) : (
                        <>
                          انقر لتحديد{' '}
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">
                            {requiredJuzCount} أجزاء
                          </span>{' '}
                          الخاصة بالمتسابق.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <span
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                      hasExactJuzsSelected
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800'
                    }`}
                  >
                    المحدد: {toArabicDigits(selectedJuzs.length)} / {toArabicDigits(requiredJuzCount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowScopeSelector(prev => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    {showScopeSelector ? 'طي التحديد' : 'تغيير الأجزاء'}
                  </button>
                </div>
              </div>

              {/* رسالة حالة التحديد */}
              {!hasExactJuzsSelected ? (
                <div className="p-2.5 rounded-xl bg-amber-100/90 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    يجب تحديد {requiredJuzCount} أجزاء تماماً للبدء بالتقييم وتوليد المقاطع (متبقي{' '}
                    {Math.max(0, requiredJuzCount - selectedJuzs.length)} أجزاء).
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>
                      الأجزاء المحددة حالياً:{' '}
                      <strong className="font-black">({formatJuzsFromNumbers(selectedJuzs)})</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* أزرار اختيار الأجزاء الـ 30 */}
              {showScopeSelector && (
                <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                      {isConsecutiveLevel
                        ? `انقر على رقم بداية الأجزاء (سيتم تحديد ${requiredJuzCount} أجزاء متتالية تلقائياً):`
                        : `اختر الأجزاء الـ ${requiredJuzCount} المطلوبة:`}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {requiredJuzCount > 0 && requiredJuzCount <= 30 && (
                        <>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => {
                              const firstJuzs = Array.from(
                                { length: requiredJuzCount },
                                (_, idx) => idx + 1
                              );
                              applyEvaluatorJuzSelection(firstJuzs);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                          >
                            أول {requiredJuzCount} أجزاء (1 إلى {requiredJuzCount})
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => {
                              const lastJuzs = Array.from(
                                { length: requiredJuzCount },
                                (_, idx) => 30 - requiredJuzCount + 1 + idx
                              );
                              applyEvaluatorJuzSelection(lastJuzs);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                          >
                            آخر {requiredJuzCount} أجزاء ({31 - requiredJuzCount} إلى 30)
                          </button>
                        </>
                      )}
                      {!isConsecutiveLevel && selectedJuzs.length > 0 && (
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setSelectedJuzs([])}
                          className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                        >
                          مسح التحديد
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
                      const isSelected = selectedJuzs.includes(juz);
                      const isFirstSelected = isConsecutiveLevel && selectedJuzs[0] === juz;
                      return (
                        <button
                          key={juz}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => {
                            if (isReadOnly) return;
                            if (isConsecutiveLevel && requiredJuzCount > 0) {
                              const start = Math.min(
                                juz,
                                Math.max(1, 30 - requiredJuzCount + 1)
                              );
                              const consecutiveJuzs = Array.from(
                                { length: requiredJuzCount },
                                (_, idx) => start + idx
                              );
                              applyEvaluatorJuzSelection(consecutiveJuzs);
                              return;
                            }

                            if (isSelected) {
                              setSelectedJuzs(prev => prev.filter(j => j !== juz));
                            } else {
                              if (selectedJuzs.length >= requiredJuzCount) {
                                context.showToast(
                                  `لقد حددت بالفعل ${requiredJuzCount} أجزاء (العدد المطلوب لهذا المستوى). يمكنك إلغاء جزء لتحديد الجزء ${juz}.`,
                                  'info'
                                );
                                return;
                              }
                              const next = [...selectedJuzs, juz].sort((a, b) => a - b);
                              applyEvaluatorJuzSelection(next);
                            }
                          }}
                          className={`min-h-[42px] p-1 text-xs rounded-xl font-black transition active:scale-95 cursor-pointer flex flex-col items-center justify-center disabled:opacity-60 ${
                            isSelected
                              ? isFirstSelected
                                ? 'bg-emerald-800 text-white shadow-sm ring-2 ring-amber-400'
                                : 'bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-500'
                              : !isConsecutiveLevel && selectedJuzs.length >= requiredJuzCount
                              ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 border border-slate-200/60 dark:border-slate-800'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-normal ${
                              isSelected ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            جزء
                          </span>
                          <span>{juz}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* شريط التقدم المرئي */}
          {suggestedPassages.length > 0 && (
            <div className="w-full bg-amber-200/60 dark:bg-slate-700 h-1.5 sm:h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (completedPassages.length / suggestedPassages.length) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          )}

          {/* أزرار إعادة الاقتراح وفتح المصحف المظلل */}
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2 pt-1">
            {!isLevelUnspecified && (
              <button
                type="button"
                onClick={() => setShowScopeSelector(prev => !prev)}
                className="min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">تعديل نطاق المتسابق</span>
              </button>
            )}

            <button
              type="button"
              disabled={isReadOnly}
              onClick={handleRegeneratePassages}
              className={`min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm border ${
                isReadOnly
                  ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                  : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 active:scale-95 cursor-pointer'
              }`}
              title={isReadOnly ? 'التقييم معتمد ومقفل من المشرف' : 'إعادة اقتراح مقاطع جديدة'}
            >
              <Shuffle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">إعادة اقتراح مقاطع</span>
            </button>

            <button
              type="button"
              disabled={isLevelUnspecified && !hasExactJuzsSelected}
              onClick={() => {
                const currentPassage =
                  suggestedPassages[activeSegmentIndex] || suggestedPassages[0] || null;
                setActivePassageForMushaf(currentPassage);
                setIsMushafOpen(true);
              }}
              className="col-span-2 sm:col-span-1 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>فتح المصحف المظلل ورصد الملاحظات</span>
            </button>
          </div>
        </div>

        {/* ==================== بطاقة المقطع المقترح المتسلسل (يظهر المقطع الأول فقط، وعند الضغط على «تم التقييم» يفتح المقطع التالي) ==================== */}
        {isLevelUnspecified && !hasExactJuzsSelected ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-amber-300 dark:border-slate-700 space-y-3">
            <SlidersHorizontal className="w-10 h-10 text-amber-500 mx-auto animate-bounce" />
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
              يرجى تحديد الأجزاء الـ {requiredJuzCount} للمتسابق أولاً
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              بمجرد اختيار {requiredJuzCount} أجزاء من الجدول أعلاه، سيتم تجهيز وتظليل مقاطع الاختبار للمتسابق تلقائياً للبدء برصد الدرجات.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 sm:space-y-4">
            {/* شريط المقاطع المتسلسل: يوضح المقطع الحالي والمقاطع المكتملة والمقاطع المقفلة */}
            <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    تسلسل مقاطع التقييم ({toArabicDigits(completedPassages.length)} من{' '}
                    {toArabicDigits(segmentsCount)} مكتمل):
                  </span>
                </span>
                {!isReadOnly && !allSegmentsCompleted && (
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                    اضغط «تم التقييم» لحفظ درجة المقطع {toArabicDigits(activeSegmentIndex + 1)} وفتح المقطع التالي
                  </span>
                )}
                {!isReadOnly && allSegmentsCompleted && (
                  <span className="text-[11px] font-black text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>اكتمل تقييم جميع المقاطع — جاهز للحفظ النهائي</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {Array.from({ length: segmentsCount }, (_, idx) => {
                  const pNum = idx + 1;
                  const isDone = completedPassages.includes(pNum);
                  const isUnlocked = isSegmentUnlocked(idx);
                  const isSelected = activeSegmentIndex === idx;
                  const segItem = segments[idx];
                  const isSegUnmem = Boolean(segItem?.isUnmemorized);
                  const segDed = segItem ? calculateSegmentDeduction(segItem) : 0;
                  const segScore = isSegUnmem
                    ? 0
                    : Math.max(0, Number((segmentMaxScore - segDed).toFixed(2)));

                  return (
                    <button
                      key={pNum}
                      type="button"
                      disabled={!isUnlocked}
                      onClick={() => {
                        if (!isUnlocked) {
                          context.showToast(
                            `لا يمكن فتح المقطع ${toArabicDigits(pNum)} قبل الضغط على «تم التقييم» للمقطع ${toArabicDigits(idx)}`,
                            'info'
                          );
                          return;
                        }
                        setActiveSegmentIndex(idx);
                      }}
                      title={
                        !isUnlocked
                          ? `مقفل — يجب الضغط على «تم التقييم» للمقطع ${toArabicDigits(idx)} أولاً`
                          : `المقطع ${toArabicDigits(pNum)}`
                      }
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 border ${
                        !isUnlocked
                          ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 opacity-65 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[#0F2347] text-[#F5D77F] border-[#D4AF37] shadow-sm ring-2 ring-[#D4AF37]/50 cursor-pointer active:scale-95'
                          : isSegUnmem
                          ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-200 cursor-pointer active:scale-95'
                          : isDone
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 cursor-pointer active:scale-95'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 cursor-pointer active:scale-95'
                      }`}
                    >
                      <span>المقطع {toArabicDigits(pNum)}</span>
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : isDone ? (
                        <span className="px-1.5 py-0.2 rounded-md bg-emerald-600 text-white text-[10px] font-black flex items-center gap-0.5">
                          <Check className="w-3 h-3 shrink-0" />
                          <span>{segScore}</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* عرض بطاقة المقطع المفتوح حالياً فقط (أو المقطع المختار من المقاطع المفتوحة) */}
            {Array.from({ length: segmentsCount }, (_, idx) => {
              // يظهر فقط المقطع النشط حالياً حتى يتم تقييمه والانتقال للمقطع التالي
              if (idx !== activeSegmentIndex) return null;

              const passage = suggestedPassages[idx];
              const seg = segments[idx] || {
                segmentNumber: idx + 1,
                errorsCount: {},
                score: 0,
                isUnmemorized: false,
              };
              const passageNum = passage?.passageNumber || idx + 1;
              const isDone = completedPassages.includes(passageNum);
              const isCurrentSegment = activeSegmentIndex === idx;
              const isSegUnmem = Boolean(seg.isUnmemorized);
              const segDeduction = calculateSegmentDeduction(seg);
              const segRemainingScore = isSegUnmem
                ? 0
                : Math.max(0, Number((segmentMaxScore - segDeduction).toFixed(2)));
              const isSegCapReached = segDeduction >= segmentMaxScore;

              const singlePassageText = passage
                ? passage.description && passage.description.startsWith('صفحة')
                  ? passage.description
                  : formatPassageDescription(
                      passage.pages,
                      passage.startSurahId,
                      passage.startAyah,
                      passage.endSurahId,
                      passage.endAyah
                    )
                : seg.passageDescription || `المقطع ${toArabicDigits(idx + 1)}`;

              return (
                <div
                  key={passage?.id || `seg-${idx}`}
                  id={`segment-card-${idx}`}
                  className={`p-3.5 sm:p-5 rounded-2xl border-2 transition-all space-y-3.5 ${
                    isSegUnmem
                      ? 'border-rose-400 bg-rose-50/30 dark:bg-rose-950/20 dark:border-rose-800 shadow-sm'
                      : isCurrentSegment
                      ? 'border-emerald-600 bg-white dark:bg-slate-900 shadow-md ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* 1. رأس بطاقة المقطع: رقم المقطع + النطاق المخصص له من المستوى + درجة المقطع المستقلة */}
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl bg-[#0F2347] text-[#F5D77F] font-black text-xs sm:text-sm shadow-2xs">
                        المقطع {toArabicDigits(idx + 1)} من {toArabicDigits(segmentsCount)}
                      </span>

                      {passage?.allocatedRangeLabel && (
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 font-black text-[11px] sm:text-xs">
                          نطاق المقطع: {passage.allocatedRangeLabel}
                        </span>
                      )}

                      {isSegUnmem ? (
                        <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-600 text-white shadow-2xs flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>غير حافظ (0 / {segmentMaxScore})</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                            الدرجة: {segRemainingScore} / {segmentMaxScore}
                          </span>
                          {segDeduction > 0 && (
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              خصم -{segDeduction}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {isDone && (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>تم تقييم المقطع {toArabicDigits(idx + 1)}</span>
                      </span>
                    )}
                  </div>

                  {/* 2. بيانات المقطع المقترح وزر فتحه مظللاً في المصحف */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-amber-50/80 dark:bg-slate-800/80 p-2.5 rounded-xl border border-amber-200/80 dark:border-slate-700">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 leading-snug">
                        {singlePassageText}
                      </span>
                    </div>

                    {passage && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenPassageInMushaf(passage, idx);
                        }}
                        className={`min-h-[38px] px-3 py-1.5 text-xs font-black rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-2xs ${
                          isDone
                            ? 'bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-800'
                            : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:from-amber-600 hover:to-amber-700 text-white border-amber-600'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>فتح وتظليل المقطع {toArabicDigits(idx + 1)} بالمصحف</span>
                      </button>
                    )}
                  </div>

                  {/* 3. أزرار الخصم المستقلة الخاصة بهذا المقطع فقط */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>بنود الخصم الخاصة بالمقطع {toArabicDigits(idx + 1)}:</span>
                      </span>

                      {/* زر تم التقييم بجانب زر غير حافظ المستقل في شاشة الهاتف والكمبيوتر */}
                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={e => {
                            e.stopPropagation();
                            if (isReadOnly) return;
                            handleCompleteSegment(idx, false);
                          }}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1.5 border ${
                            isReadOnly
                              ? isDone
                                ? 'bg-emerald-600 text-white border-emerald-700 opacity-90 cursor-default'
                                : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 cursor-default'
                              : isDone
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs cursor-pointer active:scale-95'
                              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-400/50 cursor-pointer active:scale-95'
                          }`}
                        >
                          <Check className="w-4 h-4 shrink-0" />
                          <span>
                            {isDone
                              ? idx + 1 < segmentsCount
                                ? `تم التقييم (فتح م${toArabicDigits(idx + 2)})`
                                : 'تم التقييم'
                              : idx + 1 < segmentsCount
                              ? `تم التقييم (فتح م${toArabicDigits(idx + 2)})`
                              : 'تم التقييم (الأخير)'}
                          </span>
                        </button>

                        {/* زر غير حافظ المستقل الخاص بهذا المقطع */}
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={e => {
                            e.stopPropagation();
                            if (isReadOnly) return;
                            handleToggleSegmentUnmemorized(idx, !isSegUnmem);
                          }}
                          className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl font-black text-[11px] sm:text-xs transition flex items-center justify-center gap-1.5 border ${
                            isReadOnly
                              ? isSegUnmem
                                ? 'bg-rose-600 text-white border-rose-700 opacity-90 cursor-default'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                              : isSegUnmem
                              ? 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-400/50 cursor-pointer active:scale-95'
                              : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 cursor-pointer active:scale-95'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {isSegUnmem
                              ? `إلغاء «غير حافظ» م${toArabicDigits(idx + 1)}`
                              : `غير حافظ (-${segmentMaxScore})`}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* شبكة أزرار الخصم */}
                    <div
                      className={`grid gap-2 w-full ${
                        levelErrors.length === 1
                          ? 'grid-cols-1'
                          : levelErrors.length === 2
                          ? 'grid-cols-2'
                          : levelErrors.length === 3
                          ? 'grid-cols-2 sm:grid-cols-3'
                          : levelErrors.length === 4
                          ? 'grid-cols-2 sm:grid-cols-4'
                          : levelErrors.length === 5
                          ? 'grid-cols-3 sm:grid-cols-5'
                          : levelErrors.length === 6
                          ? 'grid-cols-3 sm:grid-cols-6'
                          : levelErrors.length === 7
                          ? 'grid-cols-4 sm:grid-cols-7'
                          : 'grid-cols-4 sm:grid-cols-8'
                      }`}
                    >
                      {levelErrors.map((err, errIdx) => {
                        const count = seg.errorsCount?.[err.id] || 0;
                        const isPlusDisabled = isSegUnmem || isSegCapReached || isReadOnly;
                        const st = getErrorColorStyle(err, compErrorCategories);
                        const spanClass =
                          levelErrors.length === 3 && errIdx === 2
                            ? 'col-span-2 sm:col-span-1'
                            : '';

                        return (
                          <div
                            key={err.id}
                            onClick={e => e.stopPropagation()}
                            className={`min-w-0 w-full p-2.5 rounded-xl border-2 flex flex-col justify-between gap-2 transition ${
                              isSegUnmem
                                ? 'opacity-40 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pointer-events-none'
                                : count > 0
                                ? st.activeCard
                                : st.card
                            } ${spanClass}`}
                          >
                            <div className="flex items-center justify-between gap-1 min-w-0">
                              <span className={`font-black text-xs sm:text-sm truncate ${st.title}`}>
                                {err.name}
                              </span>
                              <span className={`text-[10px] sm:text-xs font-extrabold shrink-0 ${st.sub}`}>
                                (-{err.deduction})
                              </span>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 w-full">
                              <button
                                type="button"
                                disabled={isPlusDisabled}
                                onClick={() => handleSegmentErrorIncrement(idx, err.id)}
                                className={`w-full min-h-[40px] rounded-xl font-black text-lg flex items-center justify-center shadow-2xs transition ${
                                  isPlusDisabled
                                    ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                                    : `${st.plusBtn} active:scale-95 cursor-pointer`
                                }`}
                                aria-label={`زيادة ${err.name} للمقطع ${idx + 1}`}
                              >
                                +
                              </button>

                              <span
                                className={`min-w-[34px] h-[40px] px-1.5 rounded-xl bg-white dark:bg-slate-900 border-2 font-black text-base flex items-center justify-center shrink-0 ${st.countBox}`}
                              >
                                {count}
                              </span>

                              <button
                                type="button"
                                disabled={count === 0 || isSegUnmem || isReadOnly}
                                onClick={() => handleSegmentErrorDecrement(idx, err.id)}
                                className={`w-full min-h-[40px] rounded-xl font-black text-lg flex items-center justify-center shrink-0 transition ${
                                  count > 0 && !isSegUnmem && !isReadOnly
                                    ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white hover:bg-slate-100 active:scale-95 cursor-pointer'
                                    : 'bg-slate-100/80 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 cursor-not-allowed border border-slate-200/60 dark:border-slate-800'
                                }`}
                                aria-label={`إنقاص ${err.name} للمقطع ${idx + 1}`}
                              >
                                -
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {isSegCapReached && !isSegUnmem && (
                      <div className="text-[11px] font-black text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 text-center">
                        وصل المقطع {toArabicDigits(idx + 1)} إلى الحد الأقصى للخصم (-{segmentMaxScore} درجة)
                      </div>
                    )}

                    {/* زر إتمام تقييم المقطع الحالي وحفظ درجته محلياً والانتقال للمقطع التالي */}
                    {!isReadOnly && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleCompleteSegment(idx, false)}
                          className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            {idx + 1 < segmentsCount
                              ? `تم التقييم — حفظ درجة المقطع ${toArabicDigits(idx + 1)} (${segRemainingScore} / ${segmentMaxScore}) وفتح المقطع ${toArabicDigits(idx + 2)}`
                              : `تم التقييم — حفظ درجة المقطع الأخير ${toArabicDigits(idx + 1)} (${segRemainingScore} / ${segmentMaxScore})`}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== خانة ملاحظات المقيم قبل حفظ التقييم ==================== */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-2">
          <label className="block text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <MessageSquare size={17} className="text-amber-500 shrink-0" />
            <span>ملاحظات وتوجيهات المقيم للمتسابق {isReadOnly && '(مقفل)'}</span>
          </label>
          <textarea
            value={evaluationNotes}
            readOnly={isReadOnly}
            onChange={e => {
              if (!isReadOnly) setEvaluationNotes(e.target.value);
            }}
            rows={3}
            placeholder={
              isReadOnly
                ? 'لا توجد ملاحظات مسجلة (التقييم مقفل)'
                : 'اكتب هنا أي ملاحظات أو توجيهات للمتسابق حول جودة التلاوة، الوقف والابتداء، أحكام التجويد، أو مستوى إتقان الحفظ...'
            }
            className={`w-full p-3 rounded-xl border text-xs sm:text-sm font-medium focus:outline-none resize-y ${
              isReadOnly
                ? 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-default'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-600'
            }`}
          />
        </div>

        {/* أزرار الحفظ والاعتماد (لا يمكن حفظ النتيجة المعتمدة إلا بعد الضغط على تم التقييم لكل مقطع) */}
        <div className="space-y-2.5">
          {isReadOnly ? (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 dark:from-amber-950/60 dark:via-orange-950/40 dark:to-amber-950/60 border-2 border-amber-400 dark:border-amber-600 text-center shadow-xs">
              <div className="flex items-center justify-center gap-2 font-black text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                <span className="p-1.5 rounded-xl bg-amber-500 text-white shadow-2xs shrink-0">
                  <Lock size={15} />
                </span>
                <span>التقييم محفوظ ومعتمد ({totalScore} / {level.maxScore}) — التعديل مقفل</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!allSegmentsCompleted && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 text-xs font-extrabold flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      لتفعيل حفظ النتيجة النهائية: يجب الضغط على «تم التقييم» لكل مقطع بالترتيب (اكتمل{' '}
                      {toArabicDigits(completedPassages.length)} من {toArabicDigits(segmentsCount)} مقاطع).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCompleteSegment(activeSegmentIndex, false)}
                    className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition active:scale-95 cursor-pointer shrink-0"
                  >
                    تم التقييم للمقطع {toArabicDigits(activeSegmentIndex + 1)}
                  </button>
                </div>
              )}

              <button
                ref={saveButtonRef}
                type="button"
                disabled={isSavingFinal}
                onClick={handleSave}
                className={`w-full min-h-[54px] py-4 text-base sm:text-lg font-black rounded-2xl shadow-lg transition-all flex justify-center items-center gap-2 ${
                  allSegmentsCompleted
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/25 active:scale-95 cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-2 border-dashed border-slate-400 dark:border-slate-700 cursor-pointer'
                }`}
              >
                <Save size={22} />
                <span>
                  {isSavingFinal
                    ? 'جاري حفظ واعتماد النتيجة النهائية...'
                    : !allSegmentsCompleted
                    ? `أكمل تقييم المقاطع (${toArabicDigits(completedPassages.length)}/${toArabicDigits(segmentsCount)}) لتفعيل الحفظ النهائي`
                    : existingEval
                    ? `حفظ وتحديث التقييم المعدل (${totalScore} / ${level.maxScore})`
                    : isOverallUnmemorized
                    ? `حفظ واعتماد التقييم كـ «غير حافظ» (0 / ${level.maxScore})`
                    : `حفظ واعتماد تقييم المقيم (${totalScore} / ${level.maxScore})`}
                </span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* نافذة تأكيد الخروج وحفظ النتيجة النهائية (لا يمكن الخروج من صفحة الطالب إلا بعد إتمام التقييم وحفظ النتيجة النهائية) */}
      {showExitConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fadeIn"
          dir="rtl"
          onClick={() => setShowExitConfirmModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border-2 border-amber-500/80 dark:border-amber-500/60 shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4 text-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {allSegmentsCompleted
                    ? 'هل تريد حفظ واعتماد النتيجة النهائية قبل الخروج؟'
                    : 'لم يكتمل تقييم وحفظ النتيجة النهائية للمتسابق'}
                </h3>
                <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                  {allSegmentsCompleted ? (
                    <>
                      لقد أتممت تقييم جميع المقاطع للمتسابق{' '}
                      <strong className="text-slate-900 dark:text-white">«{participant.name}»</strong> بدرجة{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        ({totalScore} / {level.maxScore})
                      </strong>
                      ، ولكن لم يتم حفظها واعتمادها نهائياً بعد. لا يمكن الخروج من صفحة المتسابق إلا بعد حفظ النتيجة النهائية.
                    </>
                  ) : (
                    <>
                      تم تقييم{' '}
                      <strong className="text-amber-700 dark:text-amber-400">
                        {toArabicDigits(completedPassages.length)} من {toArabicDigits(segmentsCount)} مقاطع
                      </strong>{' '}
                      للمتسابق <strong className="text-slate-900 dark:text-white">«{participant.name}»</strong>.
                      يجب الضغط على <strong>«تم التقييم»</strong> لكل مقطع بالترتيب ثم حفظ النتيجة النهائية قبل الخروج من صفحة المتسابق.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {allSegmentsCompleted ? (
                <>
                  <button
                    type="button"
                    disabled={isSavingFinal}
                    onClick={handleSave}
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>
                      {isSavingFinal
                        ? 'جاري الحفظ...'
                        : `نعم، حفظ واعتماد النتيجة النهائية (${totalScore} / ${level.maxScore}) والخروج`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExitConfirmModal(false)}
                    className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black text-xs sm:text-sm transition active:scale-95 cursor-pointer"
                  >
                    البقاء في صفحة التقييم للمراجعة
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = Math.max(0, firstIncompleteSegmentNumber - 1);
                    setActiveSegmentIndex(nextIdx);
                    setShowExitConfirmModal(false);
                  }}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    متابعة التقييم (الانتقال للمقطع {toArabicDigits(firstIncompleteSegmentNumber)})
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة المصحف الشريف مع تظليل المقطع المقترح ورصد الأخطاء المباشر لكل مقطع باستقلالية */}
      {isMushafOpen && (
        <MushafReaderModal
          isOpen={isMushafOpen}
          onClose={handleCloseMushafAndScrollToSave}
          newPages={allowedPages}
          previousWeekPages={[]}
          studentName={participant.name}
          isTestMode={true}
          testScore={level.maxScore}
          testPassagesCount={segmentsCount}
          completedPassages={completedPassages}
          onTogglePassage={isReadOnly ? undefined : togglePassageCompleted}
          onCompleteSegmentInMushaf={
            isReadOnly ? undefined : segNum => handleCompleteSegment(segNum - 1, true)
          }
          activePassage={
            activePassageForMushaf ||
            suggestedPassages[activeSegmentIndex] ||
            suggestedPassages[0] ||
            null
          }
          allPassages={suggestedPassages}
          onSelectPassage={passage => {
            const idx = Math.max(0, (passage.passageNumber || 1) - 1);
            if (!isSegmentUnlocked(idx)) {
              context.showToast(
                `لا يمكن الانتقال للمقطع ${toArabicDigits(idx + 1)} قبل الضغط على «تم التقييم» للمقطع ${toArabicDigits(idx)}`,
                'info'
              );
              return;
            }
            setActivePassageForMushaf(passage);
            if (idx < segments.length) {
              setActiveSegmentIndex(idx);
            }
          }}
          onClearActivePassage={() => setActivePassageForMushaf(null)}
          competitionErrors={levelErrors}
          competitionErrorCategories={compErrorCategories}
          competitionErrorCounts={segments[activeSegmentIndex]?.errorsCount || {}}
          onCompetitionErrorChange={
            isReadOnly ? undefined : (errorId, newCount) => handleSetErrorCount(errorId, newCount)
          }
          competitionSegments={segments}
          activeSegmentIndex={activeSegmentIndex}
          onSelectSegmentIndex={idx => {
            if (!isSegmentUnlocked(idx)) {
              context.showToast(
                `لا يمكن الانتقال للمقطع ${toArabicDigits(idx + 1)} قبل الضغط على «تم التقييم» للمقطع ${toArabicDigits(idx)}`,
                'info'
              );
              return;
            }
            setActiveSegmentIndex(idx);
            if (suggestedPassages[idx]) {
              setActivePassageForMushaf(suggestedPassages[idx]);
            }
          }}
          onCompetitionSegmentErrorChange={
            isReadOnly
              ? undefined
              : (segIdx, errorId, newCount) => handleSetSegmentErrorCount(segIdx, errorId, newCount)
          }
          onToggleSegmentUnmemorized={
            isReadOnly
              ? undefined
              : (segIdx, unmem) => handleToggleSegmentUnmemorized(segIdx, unmem)
          }
          segmentMaxScore={segmentMaxScore}
          competitionCurrentScore={totalScore}
          competitionMaxScore={level.maxScore}
        />
      )}
    </div>
  );
}
