import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { AppContext } from '../../App';
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
}) {
  const context = useContext(AppContext);
  if (!context) return null;

  const level = (comp.levels || []).find(
    l => Number(l.id) === Number(participant.levelId)
  );
  if (!level) return null;

  const segmentsCount = Math.max(1, Number(level.segmentsCount) || 5);
  const linesPerSegment = Math.max(1, Number(level.linesPerSegment) || 7);

  // التقييم الحالي الخاص بهذا المقيم تحديداً لهذا المتسابق
  const existingEval = (comp.evaluations || []).find(
    ev =>
      Number(ev.participantId) === Number(participant.id) &&
      Number(ev.evaluatorId) === Number(evaluator.id)
  );

  // التقييمات المرصودة لهذا المتسابق من مقيمين آخرين في نفس المسابقة
  const otherEvaluations = (comp.evaluations || []).filter(
    ev =>
      Number(ev.participantId) === Number(participant.id) &&
      Number(ev.evaluatorId) !== Number(evaluator.id)
  );

  // قراءة النسخة الحية للمتسابق من المسابقة لضمان المزامنة الفورية بين جميع المقيمين في اللجنة
  const liveParticipant = useMemo(
    () =>
      (comp.participants || []).find(p => Number(p.id) === Number(participant.id)) ||
      participant,
    [comp.participants, participant]
  );

  // ترتيب المتسابق الموحد داخل نفس المستوى (0 للمتسابق الأول، 1 للثاني، 2 للثالث...)
  // لضمان ظهور نفس المقاطع تماماً لدى جميع المقيمين لنفس المتسابق، مع اختلافها من متسابق لآخر
  const participantOrderIndex = useMemo(() => {
    const sameLevelList = [...(comp.participants || [])]
      .filter(p => Number(p.levelId) === Number(level.id))
      .sort((a, b) => Number(a.id) - Number(b.id));
    const idx = sameLevelList.findIndex(p => Number(p.id) === Number(participant.id));
    return idx >= 0 ? idx : 0;
  }, [comp.participants, level.id, participant.id]);

  const currentPassageSeed = Number(liveParticipant.passageSeed || 0);

  const rawLevelScope = level.juzsOrSurahs || '';
  const rawParticipantScope = liveParticipant.juzsOrSurahs || participant.juzsOrSurahs || '';

  // فحص هل المستوى محدد بعدد أجزاء دون تعيينها بدقة (مثل: 3 أجزاء، 5 أجزاء، 10 أجزاء)
  const isLevelUnspecified = isUnspecifiedJuzCount(rawLevelScope);
  const requiredJuzCount =
    extractJuzCount(rawParticipantScope) ||
    extractJuzCount(rawLevelScope) ||
    (isLevelUnspecified ? 3 : 0);

  // استخراج الأجزاء المحددة مسبقاً للمتسابق إن وجدت
  const initialJuzs = useMemo(() => {
    if (rawParticipantScope.startsWith('الأجزاء:')) {
      return parseJuzsToNumbers(rawParticipantScope.replace('الأجزاء:', ''));
    }
    if (rawLevelScope.startsWith('الأجزاء:')) {
      return parseJuzsToNumbers(rawLevelScope.replace('الأجزاء:', ''));
    }
    return [];
  }, [rawParticipantScope, rawLevelScope]);

  const [selectedJuzs, setSelectedJuzs] = useState<number[]>(initialJuzs);

  // مزامنة الأجزاء المحددة تلقائياً إذا قام أحد المقيمين في اللجنة بتحديدها للمتسابق
  useEffect(() => {
    if (rawParticipantScope.startsWith('الأجزاء:')) {
      const parsed = parseJuzsToNumbers(rawParticipantScope.replace('الأجزاء:', ''));
      if (parsed.length > 0 && parsed.join(',') !== selectedJuzs.join(',')) {
        setSelectedJuzs(parsed);
      }
    }
  }, [rawParticipantScope]);

  // حفظ الأجزاء المعتمدة للمتسابق مباشرة ليظهر نفس النطاق ونفس المقاطع لبقية المقيمين في اللجنة
  useEffect(() => {
    if (isLevelUnspecified && requiredJuzCount > 0 && selectedJuzs.length === requiredJuzCount) {
      const formattedScope = `الأجزاء: ${formatJuzsFromNumbers(selectedJuzs)}`;
      if (liveParticipant.juzsOrSurahs !== formattedScope) {
        const updatedParticipants = (comp.participants || []).map(p =>
          Number(p.id) === Number(participant.id)
            ? { ...p, juzsOrSurahs: formattedScope }
            : p
        );
        context.updateCompetitions(
          context.competitions.map(c =>
            String(c.id) === String(comp.id)
              ? { ...c, participants: updatedParticipants }
              : c
          )
        );
      }
    }
  }, [
    isLevelUnspecified,
    requiredJuzCount,
    selectedJuzs,
    liveParticipant.juzsOrSurahs,
    comp.id,
    comp.participants,
    participant.id,
    context,
  ]);

  // هل اكتمل تحديد عدد الأجزاء المطلوب تماماً؟
  const hasExactJuzsSelected =
    !isLevelUnspecified || (requiredJuzCount > 0 && selectedJuzs.length === requiredJuzCount);

  // فتح محدد الأجزاء تلقائياً إذا كان المستوى يتطلب اختيار أجزاء ولم تكتمل بعد
  const [showScopeSelector, setShowScopeSelector] = useState<boolean>(() => !hasExactJuzsSelected);

  // خانة ملاحظات المقيم
  const [evaluationNotes, setEvaluationNotes] = useState<string>(existingEval?.notes || '');

  const [segments, setSegments] = useState<CompetitionSegmentEvaluation[]>(() => {
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

  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [completedPassages, setCompletedPassages] = useState<number[]>(() =>
    existingEval ? Array.from({ length: segmentsCount }, (_, i) => i + 1) : []
  );
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

    // تحديث المقطع المفتوح داخل المصحف تلقائياً وفورياً إذا كان المقيم الثاني فاتحاً لصفحة المصحف
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
    setActivePassageForMushaf(prev => {
      if (!prev) return null;
      return (
        generated.find(p => p.passageNumber === prev.passageNumber) ||
        generated[activeSegmentIndex] ||
        generated[0] ||
        null
      );
    });

    // مزامنة بذرة التوليد الجديدة للمتسابق حتى تظهر نفس المقاطع الجديدة لدى بقية المقيمين في اللجنة
    const updatedParticipants = (comp.participants || []).map(p =>
      Number(p.id) === Number(participant.id)
        ? { ...p, passageSeed: nextSeed }
        : p
    );
    context.updateCompetitions(
      context.competitions.map(c =>
        String(c.id) === String(comp.id)
          ? { ...c, participants: updatedParticipants }
          : c
      )
    );

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
      `تم اقتراح ${generated.length} مقاطع جديدة ومزامنتها لجميع مقيمي اللجنة (${modeLabel})`,
      'info'
    );
  };

  const togglePassageCompleted = (num: number) => {
    setCompletedPassages(prev =>
      prev.includes(num) ? prev.filter(p => p !== num) : [...prev, num]
    );
  };

  const handleOpenPassageInMushaf = (passage: SuggestedTestPassage, idx: number) => {
    setActiveSegmentIndex(idx);
    setActivePassageForMushaf(passage);
    setIsMushafOpen(true);
  };

  const compErrorCategories = useMemo(
    () => resolveCompetitionErrorCategories(comp),
    [comp]
  );

  const levelErrors = useMemo(() => {
    return resolveCompetitionErrors(comp);
  }, [comp]);

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

  const handleSave = () => {
    // التحقق من اكتمال تحديد الأجزاء إذا كان المستوى محدد بعدد أجزاء
    if (isLevelUnspecified && requiredJuzCount > 0 && selectedJuzs.length !== requiredJuzCount) {
      context.showToast(
        `يجب تحديد ${requiredJuzCount} أجزاء تماماً للمتسابق "${participant.name}" قبل حفظ التقييم (تم تحديد ${selectedJuzs.length} من ${requiredJuzCount})`,
        'error'
      );
      setShowScopeSelector(true);
      return;
    }

    const allSegmentsUnmemorized = segments.length > 0 && segments.every(s => s.isUnmemorized);
    const finalScore = calculateTotalScore();
    const segmentMaxScore = level.maxScore / segmentsCount;

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

    const currentEvals = comp.evaluations || [];
    const hasExistingForThisEvaluator = currentEvals.some(
      ev =>
        Number(ev.participantId) === Number(participant.id) &&
        Number(ev.evaluatorId) === Number(evaluator.id)
    );

    const updatedEvals = hasExistingForThisEvaluator
      ? currentEvals.map(ev =>
          Number(ev.participantId) === Number(participant.id) &&
          Number(ev.evaluatorId) === Number(evaluator.id)
            ? newEval
            : ev
        )
      : [...currentEvals, newEval];

    // حفظ النطاق المحدث وحالة غير الحافظ للمتسابق
    const updatedParticipants = (comp.participants || []).map(p =>
      Number(p.id) === Number(participant.id)
        ? {
            ...p,
            juzsOrSurahs: finalScope || p.juzsOrSurahs,
            isUnmemorized: allSegmentsUnmemorized,
          }
        : p
    );

    context.updateCompetitions(
      context.competitions.map(c =>
        String(c.id) === String(comp.id)
          ? { ...c, evaluations: updatedEvals, participants: updatedParticipants }
          : c
      )
    );

    context.showToast(
      allSegmentsUnmemorized
        ? `تم حفظ التقييم للمتسابق "${participant.name}" وتصنيفه كـ «غير حافظ» (${finalScore} / ${level.maxScore})`
        : `تم حفظ تقييمك (${finalScore} / ${level.maxScore}) للمتسابق "${participant.name}" بنجاح!`,
      'success'
    );
    onBack();
  };

  const totalScore = calculateTotalScore();
  const hasAnyUnmemorized = segments.some(s => s.isUnmemorized);
  const isOverallUnmemorized = segments.length > 0 && segments.every(s => s.isUnmemorized);

  return (
    <div
      className="bg-slate-50 dark:bg-slate-950 min-h-[100dvh] w-full max-w-full overflow-x-hidden text-slate-800 dark:text-slate-100 pb-12 text-right"
      dir="rtl"
    >
      {/* ترويسة التقييم العلوية المتجاوبة للهواتف */}
      <header className="bg-white dark:bg-slate-900 px-2 sm:px-6 py-2 sm:py-3.5 shadow-sm sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] p-1.5 sm:p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            title="رجوع لقائمة المتسابقين"
          >
            <ChevronRight size={20} />
          </button>
          <Logo size="xs" className="flex shrink-0" />
          <AwqafBadge variant="compact" tone="adaptive" />
          <div className="min-w-0 flex-1 text-right">
            <h1 className="text-xs xs:text-sm sm:text-lg font-black text-slate-900 dark:text-white leading-tight line-clamp-2 break-words whitespace-normal">
              {participant.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] xs:text-[11px] sm:text-xs text-slate-500 font-bold leading-tight mt-0.5">
              <span className="leading-tight break-words whitespace-normal">{level.name}</span>
              <span>•</span>
              <span className="text-emerald-700 dark:text-emerald-400 leading-tight break-words whitespace-normal">
                المقيم: {evaluator.name}
              </span>
            </div>
          </div>
        </div>

        {/* الدرجة الإجمالية اللحظية الحية */}
        <div className="flex items-center gap-2 shrink-0">
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
            <span className="text-base sm:text-xl font-black leading-tight text-emerald-800 dark:text-emerald-300">
              {totalScore}{' '}
              <span className="text-xs font-bold text-slate-500">
                / {level.maxScore}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي للتقييم */}
      <main className="max-w-4xl mx-auto p-2.5 sm:p-5 space-y-4 sm:space-y-5">
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
                      تحديد أجزاء الاختبار للطالب قبل التقييم
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-bold mt-0.5">
                      مستوى الطالب محدد بـ{' '}
                      <span className="text-emerald-700 dark:text-emerald-400 font-black">
                        «{requiredJuzCount} أجزاء»
                      </span>
                      ؛ يجب تحديد الأجزاء المسجلة للطالب بالضبط.
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
                    {showScopeSelector ? 'طي التحديد' : 'تعديل الأجزاء'}
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
                      تم اعتماد الأجزاء بنجاح:{' '}
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
                      اختر الأجزاء الـ {requiredJuzCount} المطلوبة:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {requiredJuzCount > 0 && requiredJuzCount <= 30 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const lastJuzs = Array.from(
                                { length: requiredJuzCount },
                                (_, idx) => 30 - requiredJuzCount + 1 + idx
                              );
                              setSelectedJuzs(lastJuzs);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                          >
                            آخر {requiredJuzCount} أجزاء ({31 - requiredJuzCount} إلى 30)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const firstJuzs = Array.from(
                                { length: requiredJuzCount },
                                (_, idx) => idx + 1
                              );
                              setSelectedJuzs(firstJuzs);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold transition active:scale-95 cursor-pointer"
                          >
                            أول {requiredJuzCount} أجزاء (1 إلى {requiredJuzCount})
                          </button>
                        </>
                      )}
                      {selectedJuzs.length > 0 && (
                        <button
                          type="button"
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
                      return (
                        <button
                          key={juz}
                          type="button"
                          onClick={() => {
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
                              setSelectedJuzs(prev => [...prev, juz].sort((a, b) => a - b));
                            }
                          }}
                          className={`min-h-[42px] p-1 text-xs rounded-xl font-black transition active:scale-95 cursor-pointer flex flex-col items-center justify-center ${
                            isSelected
                              ? 'bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-500'
                              : selectedJuzs.length >= requiredJuzCount
                              ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 border border-slate-200/60 dark:border-slate-800'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
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
              onClick={handleRegeneratePassages}
              className="min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-[11px] sm:text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
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

        {/* ==================== بطاقات المقاطع المقترحة المستقلة (لكل مقطع أزرار الخصم الخاصة به) ==================== */}
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
            {Array.from({ length: segmentsCount }, (_, idx) => {
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
                  onClick={() => setActiveSegmentIndex(idx)}
                  className={`p-3 sm:p-4 rounded-2xl border-2 transition-all space-y-3 ${
                    isSegUnmem
                      ? 'border-rose-400 bg-rose-50/30 dark:bg-rose-950/20 dark:border-rose-800 shadow-sm'
                      : isCurrentSegment
                      ? 'border-emerald-600 bg-white dark:bg-slate-900 shadow-md ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* 1. رأس بطاقة المقطع: رقم المقطع + النطاق المخصص له من المستوى + درجة المقطع المستقلة + حالة التسميع */}
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-1 rounded-xl bg-[#0F2347] text-[#F5D77F] font-black text-xs sm:text-sm shadow-2xs">
                        المقطع {toArabicDigits(idx + 1)}
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

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        togglePassageCompleted(passageNum);
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 border shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-amber-100/90 text-amber-950 border-amber-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>تم التسميع</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-3 h-3" />
                          <span>تحديد كمسموع</span>
                        </>
                      )}
                    </button>
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

                  {/* 3. أزرار الخصم المستقلة الخاصة بهذا المقطع فقط (يظهر للمقيم لون الزر فقط حسب الصنف) */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>بنود الخصم الخاصة بالمقطع {toArabicDigits(idx + 1)}:</span>
                      </span>

                      {/* زر غير حافظ المستقل الخاص بهذا المقطع */}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleToggleSegmentUnmemorized(idx, !isSegUnmem);
                        }}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border shrink-0 ${
                          isSegUnmem
                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-400/50'
                            : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isSegUnmem
                            ? `إلغاء «غير حافظ» للمقطع ${toArabicDigits(idx + 1)}`
                            : `غير حافظ للمقطع ${toArabicDigits(idx + 1)} (-${segmentMaxScore})`}
                        </span>
                      </button>
                    </div>

                    {/* شبكة أزرار الخصم (يظهر للمقيم لون الزر فقط حسب الصنف المحدد من المشرف) */}
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
                        const isPlusDisabled = isSegUnmem || isSegCapReached;
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
                                className={`w-full min-h-[40px] rounded-xl font-black text-lg flex items-center justify-center shadow-2xs active:scale-95 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${st.plusBtn}`}
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
                                disabled={count === 0 || isSegUnmem}
                                onClick={() => handleSegmentErrorDecrement(idx, err.id)}
                                className={`w-full min-h-[40px] rounded-xl font-black text-lg flex items-center justify-center shrink-0 transition ${
                                  count > 0 && !isSegUnmem
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
            <span>ملاحظات وتوجيهات المقيم للمتسابق (اختياري)</span>
          </label>
          <textarea
            value={evaluationNotes}
            onChange={e => setEvaluationNotes(e.target.value)}
            rows={3}
            placeholder="اكتب هنا أي ملاحظات أو توجيهات للمتسابق حول جودة التلاوة، الوقف والابتداء، أحكام التجويد، أو مستوى إتقان الحفظ..."
            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none resize-y"
          />
        </div>

        {/* زر الحفظ والاعتماد */}
        <button
          ref={saveButtonRef}
          type="button"
          onClick={handleSave}
          className="w-full min-h-[54px] py-4 bg-emerald-700 hover:bg-emerald-800 text-white text-base sm:text-lg font-black rounded-2xl shadow-lg shadow-emerald-700/25 active:scale-95 transition-all flex justify-center items-center gap-2 cursor-pointer"
        >
          <Save size={22} />
          <span>
            {isOverallUnmemorized
              ? `حفظ واعتماد التقييم كـ «غير حافظ» (0 / ${level.maxScore})`
              : `حفظ واعتماد تقييم المقيم (${totalScore} / ${level.maxScore})`}
          </span>
        </button>
      </main>

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
          onTogglePassage={togglePassageCompleted}
          activePassage={
            activePassageForMushaf ||
            suggestedPassages[activeSegmentIndex] ||
            suggestedPassages[0] ||
            null
          }
          allPassages={suggestedPassages}
          onSelectPassage={passage => {
            setActivePassageForMushaf(passage);
            const idx = Math.max(0, (passage.passageNumber || 1) - 1);
            if (idx < segments.length) {
              setActiveSegmentIndex(idx);
            }
          }}
          onClearActivePassage={() => setActivePassageForMushaf(null)}
          competitionErrors={levelErrors}
          competitionErrorCategories={compErrorCategories}
          competitionErrorCounts={segments[activeSegmentIndex]?.errorsCount || {}}
          onCompetitionErrorChange={(errorId, newCount) =>
            handleSetErrorCount(errorId, newCount)
          }
          competitionSegments={segments}
          activeSegmentIndex={activeSegmentIndex}
          onSelectSegmentIndex={idx => {
            setActiveSegmentIndex(idx);
            if (suggestedPassages[idx]) {
              setActivePassageForMushaf(suggestedPassages[idx]);
            }
          }}
          onCompetitionSegmentErrorChange={(segIdx, errorId, newCount) =>
            handleSetSegmentErrorCount(segIdx, errorId, newCount)
          }
          onToggleSegmentUnmemorized={(segIdx, unmem) =>
            handleToggleSegmentUnmemorized(segIdx, unmem)
          }
          segmentMaxScore={segmentMaxScore}
          competitionCurrentScore={totalScore}
          competitionMaxScore={level.maxScore}
        />
      )}
    </div>
  );
}
