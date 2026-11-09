import React, { useState, useContext, useMemo, useEffect } from 'react';
import { AppContext } from '../../App';
import {
  Competition,
  PassageSelectionMode,
  PassageDifficultyTier,
  ManualPassageRange,
} from '../../types';
import {
  BookOpen,
  Shuffle,
  Award,
  Sliders,
  Plus,
  Trash2,
  Check,
  Lock,
  Sparkles,
  Edit3,
  ArrowUp,
  ArrowDown,
  Eye,
  Layers,
  CheckCircle2,
  Info,
  Copy,
} from 'lucide-react';
import {
  surahNames,
  surahAyahCounts,
  juzPagesMap,
  getJuzSurahAyahBounds,
} from '../../utils/quranData';
import { toArabicDigits } from '../../utils/juzUtils';
import {
  SuggestedTestPassage,
  getCurrentRandomPassagesForJuz,
  getInternationalPassagesForJuz,
  buildPassageFromManualRange,
  DIFFICULTY_LABELS,
} from '../../utils/testPassageGenerator';
import { MushafReaderModal } from '../MushafReaderModal';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { preloadMushafPages } from '../../utils/mushafPreload';
import { preloadVerseLinesForPages } from '../../utils/mushafVerseHighlightService';

const LINE_COUNT_PRESETS = [4, 5, 6, 7, 8, 10, 12, 15];

export const SuggestedPassagesPage: React.FC = () => {
  const context = useContext(AppContext);
  if (!context) return null;

  const {
    competitions,
    updateCompetitions,
    activeCompetitionId,
    setActiveCompetitionId,
    showToast,
  } = context;

  const activeCompetition: Competition | undefined = useMemo(() => {
    return (
      competitions.find(c => c.id === activeCompetitionId) || competitions[0]
    );
  }, [competitions, activeCompetitionId]);

  // التبويب المفتوح حالياً للمعاينة والإعداد
  const [selectedTab, setSelectedTab] = useState<PassageSelectionMode>(() => {
    return activeCompetition?.passageMode || 'random';
  });

  // مزامنة التبويب المبدئي عند تبديل المسابقة
  useEffect(() => {
    if (activeCompetition?.passageMode) {
      setSelectedTab(activeCompetition.passageMode);
    }
  }, [activeCompetition?.id]);

  // عدد الأسطر الفعلية المراد ظهورها في كل مقطع مقترح (للتبويب الأول والثاني)
  const defaultLinesFromComp = useMemo(() => {
    if (activeCompetition?.previewLinesPerSegment) {
      return activeCompetition.previewLinesPerSegment;
    }
    const firstLevelLines = activeCompetition?.levels?.[0]?.linesPerSegment;
    return firstLevelLines && firstLevelLines > 0 ? firstLevelLines : 7;
  }, [activeCompetition]);

  const [linesPerSegment, setLinesPerSegment] = useState<number>(defaultLinesFromComp);

  useEffect(() => {
    setLinesPerSegment(defaultLinesFromComp);
  }, [defaultLinesFromComp]);

  // الجزء المحدد حالياً (1 إلى 30) أو 0 لعرض ملخص جميع الأجزاء
  const [selectedJuz, setSelectedJuz] = useState<number>(1);

  // فلتر مستوى الصعوبة في التبويب الثاني (المسابقات العالمية)
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | PassageDifficultyTier>('all');

  // حالة فتح المصحف لمعاينة أي مقطع مقترح مظللاً
  const [previewPassage, setPreviewPassage] = useState<SuggestedTestPassage | null>(null);
  const [previewAllPassages, setPreviewAllPassages] = useState<SuggestedTestPassage[]>([]);
  const [isMushafOpen, setIsMushafOpen] = useState(false);

  // ============================================================================
  // حالات التبويب الثالث (التحديد اليدوي للمشرف لكل جزء)
  // ============================================================================
  const [manualStartSurahId, setManualStartSurahId] = useState<number>(2);
  const [manualStartAyah, setManualStartAyah] = useState<number>(1);
  const [manualEndSurahId, setManualEndSurahId] = useState<number>(2);
  const [manualEndAyah, setManualEndAyah] = useState<number>(10);
  const [manualNotes, setManualNotes] = useState<string>('');
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [copyFromCompId, setCopyFromCompId] = useState<string>('');
  const [deleteRangeConfirmId, setDeleteRangeConfirmId] = useState<string | null>(null);
  const [clearJuzConfirmNum, setClearJuzConfirmNum] = useState<number | null>(null);

  // السور والآيات الواقعة ضمن الجزء المحدد حالياً
  const currentJuzSurahBounds = useMemo(() => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    return getJuzSurahAyahBounds(safeJuz);
  }, [selectedJuz]);

  // حدود سورة البداية وسورة النهاية داخل الجزء المحدد
  const startSurahJuzBound = useMemo(() => {
    return (
      currentJuzSurahBounds.find(b => b.surahId === manualStartSurahId) ||
      currentJuzSurahBounds[0]
    );
  }, [currentJuzSurahBounds, manualStartSurahId]);

  const endSurahJuzBound = useMemo(() => {
    return (
      currentJuzSurahBounds.find(b => b.surahId === manualEndSurahId) ||
      startSurahJuzBound ||
      currentJuzSurahBounds[0]
    );
  }, [currentJuzSurahBounds, manualEndSurahId, startSurahJuzBound]);

  // التحقق الفوري من وقوع الآيات المكتوبة ضمن نطاق الجزء المحدد
  const manualRangeValidationError = useMemo((): string | null => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    const sBound = currentJuzSurahBounds.find(b => b.surahId === manualStartSurahId);
    if (!sBound) {
      return `سورة البداية المختارة لا تقع ضمن نطاق الجزء (${toArabicDigits(safeJuz)}).`;
    }
    const eBound = currentJuzSurahBounds.find(b => b.surahId === manualEndSurahId);
    if (!eBound) {
      return `سورة النهاية المختارة لا تقع ضمن نطاق الجزء (${toArabicDigits(safeJuz)}).`;
    }
    if (
      !Number.isFinite(manualStartAyah) ||
      manualStartAyah < sBound.minAyahInJuz ||
      manualStartAyah > sBound.maxAyahInJuz
    ) {
      return `آية البداية (${toArabicDigits(manualStartAyah || 0)}) في سورة ${sBound.surahName} خارج نطاق الجزء (${toArabicDigits(safeJuz)})! الآيات المتاحة في هذا الجزء هي من آية (${toArabicDigits(sBound.minAyahInJuz)}) إلى آية (${toArabicDigits(sBound.maxAyahInJuz)}).`;
    }
    if (
      !Number.isFinite(manualEndAyah) ||
      manualEndAyah < eBound.minAyahInJuz ||
      manualEndAyah > eBound.maxAyahInJuz
    ) {
      return `آية النهاية (${toArabicDigits(manualEndAyah || 0)}) في سورة ${eBound.surahName} خارج نطاق الجزء (${toArabicDigits(safeJuz)})! الآيات المتاحة في هذا الجزء هي من آية (${toArabicDigits(eBound.minAyahInJuz)}) إلى آية (${toArabicDigits(eBound.maxAyahInJuz)}).`;
    }
    if (manualEndSurahId < manualStartSurahId) {
      return 'يجب أن تكون سورة النهاية هي نفس سورة البداية أو سورة تليها في نفس الجزء.';
    }
    if (manualEndSurahId === manualStartSurahId && manualEndAyah < manualStartAyah) {
      return `يجب أن تكون آية النهاية (${toArabicDigits(manualEndAyah)}) أكبر من أو تساوي آية البداية (${toArabicDigits(manualStartAyah)}) في سورة ${sBound.surahName}.`;
    }
    return null;
  }, [
    selectedJuz,
    currentJuzSurahBounds,
    manualStartSurahId,
    manualStartAyah,
    manualEndSurahId,
    manualEndAyah,
  ]);

  // عند تغيير الجزء في التبويب اليدوي، نضبط السورة والآية الافتراضية على أول سورة في ذلك الجزء
  useEffect(() => {
    if (editingRangeId) return; // لا نغير الحقول إذا كان المشرف يعدل نطاقاً قائماً
    if (currentJuzSurahBounds.length > 0) {
      // نختار السورة الرئيسية في الجزء (أول سورة أو السورة الثانية في الجزء الأول كالبقرة)
      const defaultBound =
        selectedJuz === 1 && currentJuzSurahBounds.length > 1
          ? currentJuzSurahBounds[1]
          : currentJuzSurahBounds[0];
      setManualStartSurahId(defaultBound.surahId);
      setManualStartAyah(defaultBound.minAyahInJuz);
      setManualEndSurahId(defaultBound.surahId);
      setManualEndAyah(
        Math.min(defaultBound.maxAyahInJuz, defaultBound.minAyahInJuz + 7)
      );
    }
  }, [selectedJuz, currentJuzSurahBounds, editingRangeId]);

  const handleUpdateCompetition = (updated: Competition) => {
    updateCompetitions(
      competitions.map(c => (c.id === updated.id ? updated : c))
    );
  };

  // اعتماد أحد التبويبات الثلاثة ليكون المصدر الفعلي للمقاطع المقترحة عند التقييم في المسابقة
  const handleSetCompetitionPassageMode = (mode: PassageSelectionMode) => {
    if (!activeCompetition) return;
    const updated: Competition = {
      ...activeCompetition,
      passageMode: mode,
      previewLinesPerSegment: linesPerSegment,
    };
    handleUpdateCompetition(updated);
    const modeTitle =
      mode === 'random'
        ? 'المقاطع العشوائية الحالية'
        : mode === 'international'
        ? 'تصنيف المسابقات العالمية (الأكثر صعوبة / متوسطة / الأقل)'
        : 'التحديد اليدوي للمشرف';
    showToast(`تم اعتماد "${modeTitle}" للظهور في تقييم المسابقة بنجاح!`, 'success');
  };

  // تحديث عدد الأسطر الفعلية محلياً للمعاينة، وعدم الرفع لقاعدة البيانات إلا عند ضغط زر التعميم أو الاعتماد
  const handleLinesChange = (newLines: number, applyToLevels: boolean = false) => {
    const clamped = Math.max(1, Math.min(20, newLines));
    setLinesPerSegment(clamped);
    if (!activeCompetition) return;

    if (applyToLevels) {
      const updatedLevels = (activeCompetition.levels || []).map(lvl => ({
        ...lvl,
        linesPerSegment: clamped,
      }));
      handleUpdateCompetition({
        ...activeCompetition,
        previewLinesPerSegment: clamped,
        levels: updatedLevels,
      });
      showToast(
        `تم تعميم (${toArabicDigits(clamped)} أسطر فعلية للمقطع) على جميع مستويات المسابقة!`,
        'success'
      );
    }
  };

  const handleOpenPreviewInMushaf = (
    passage: SuggestedTestPassage,
    contextList: SuggestedTestPassage[]
  ) => {
    setPreviewPassage(passage);
    setPreviewAllPassages(contextList);
    setIsMushafOpen(true);
    if (passage.pages?.length) {
      preloadMushafPages(passage.pages);
      preloadVerseLinesForPages(passage.pages);
    }
  };

  // المقاطع المحسوبة للتبويب الأول (العشوائية الحالية لكل جزء)
  const randomPassagesForSelectedJuz = useMemo(() => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    return getCurrentRandomPassagesForJuz(safeJuz, linesPerSegment);
  }, [selectedJuz, linesPerSegment]);

  // المقاطع المحسوبة للتبويب الثاني (تصنيف المسابقات العالمية لكل جزء)
  const internationalPassagesForSelectedJuz = useMemo(() => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    return getInternationalPassagesForJuz(
      safeJuz,
      linesPerSegment,
      difficultyFilter === 'all' ? undefined : difficultyFilter
    );
  }, [selectedJuz, linesPerSegment, difficultyFilter]);

  // المقاطع اليدوية المحفوظة في المسابقة النشطة
  const allManualPassages: ManualPassageRange[] = useMemo(() => {
    return activeCompetition?.manualPassages || [];
  }, [activeCompetition?.manualPassages]);

  const manualPassagesByJuzCount = useMemo(() => {
    const map: Record<number, number> = {};
    for (const mp of allManualPassages) {
      map[mp.juzNumber] = (map[mp.juzNumber] || 0) + 1;
    }
    return map;
  }, [allManualPassages]);

  const currentJuzManualRanges = useMemo(() => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    return allManualPassages.filter(mp => Number(mp.juzNumber) === safeJuz);
  }, [allManualPassages, selectedJuz]);

  const currentJuzManualBuiltPassages = useMemo(() => {
    return currentJuzManualRanges.map((range, idx) =>
      buildPassageFromManualRange(range, idx + 1)
    );
  }, [currentJuzManualRanges]);

  // معاينة حية للنطاق اليدوي قيد الإدخال قبل إضافته
  const liveDraftManualPassage = useMemo(() => {
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    return buildPassageFromManualRange(
      {
        id: 'draft',
        juzNumber: safeJuz,
        startSurahId: manualStartSurahId,
        startAyah: manualStartAyah,
        endSurahId: manualEndSurahId,
        endAyah: manualEndAyah,
        notes: manualNotes.trim() || undefined,
      },
      currentJuzManualRanges.length + 1
    );
  }, [
    selectedJuz,
    manualStartSurahId,
    manualStartAyah,
    manualEndSurahId,
    manualEndAyah,
    manualNotes,
    currentJuzManualRanges.length,
  ]);

  // إضافة أو تحديث نطاق يدوي في الجزء المحدد (مع رفض الحفظ إذا كانت الآية خارج نطاق الجزء)
  const handleSaveManualRange = () => {
    if (!activeCompetition) return;
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;

    if (manualRangeValidationError) {
      showToast(manualRangeValidationError, 'error');
      return;
    }

    const newRange: ManualPassageRange = {
      id: editingRangeId || `mp-${safeJuz}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      juzNumber: safeJuz,
      startSurahId: manualStartSurahId,
      startAyah: manualStartAyah,
      endSurahId: manualEndSurahId,
      endAyah: manualEndAyah,
      notes: manualNotes.trim() || undefined,
    };

    const nextManualPassages = editingRangeId
      ? allManualPassages.map(mp => (mp.id === editingRangeId ? newRange : mp))
      : [...allManualPassages, newRange];

    handleUpdateCompetition({
      ...activeCompetition,
      manualPassages: nextManualPassages,
    });

    if (editingRangeId) {
      showToast(`تم تحديث النطاق اليدوي في الجزء (${toArabicDigits(safeJuz)}) بنجاح!`, 'success');
      setEditingRangeId(null);
    } else {
      showToast(`تمت إضافة النطاق اليدوي إلى الجزء (${toArabicDigits(safeJuz)}) بنجاح!`, 'success');
    }
    setManualNotes('');
  };

  const handleEditManualRange = (range: ManualPassageRange) => {
    setSelectedJuz(range.juzNumber);
    setEditingRangeId(range.id);
    setManualStartSurahId(range.startSurahId);
    setManualStartAyah(range.startAyah);
    setManualEndSurahId(range.endSurahId);
    setManualEndAyah(range.endAyah);
    setManualNotes(range.notes || '');
  };

  const handleDeleteManualRange = (id: string) => {
    if (!activeCompetition) return;
    const next = allManualPassages.filter(mp => mp.id !== id);
    handleUpdateCompetition({
      ...activeCompetition,
      manualPassages: next,
    });
    if (editingRangeId === id) setEditingRangeId(null);
    showToast('تم حذف النطاق اليدوي بنجاح', 'info');
  };

  const handleClearJuzManualRanges = (juzNum: number) => {
    if (!activeCompetition) return;
    const next = allManualPassages.filter(mp => Number(mp.juzNumber) !== juzNum);
    handleUpdateCompetition({
      ...activeCompetition,
      manualPassages: next,
    });
    setEditingRangeId(null);
    showToast(`تم مسح جميع النطاقات اليدوية للجزء (${toArabicDigits(juzNum)})`, 'info');
  };

  // تغيير ترتيب التناوب للمقاطع اليدوية داخل الجزء
  const handleMoveManualRange = (rangeId: string, direction: 'up' | 'down') => {
    if (!activeCompetition) return;
    const safeJuz = selectedJuz >= 1 && selectedJuz <= 30 ? selectedJuz : 1;
    const juzList = allManualPassages.filter(mp => Number(mp.juzNumber) === safeJuz);
    const idx = juzList.findIndex(mp => mp.id === rangeId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= juzList.length) return;

    const swapped = [...juzList];
    const temp = swapped[idx];
    swapped[idx] = swapped[targetIdx];
    swapped[targetIdx] = temp;

    // إعادة بناء المصفوفة الكلية مع الحفاظ على ترتيب الجزء المحدث
    let juzCursor = 0;
    const nextAll = allManualPassages.map(mp => {
      if (Number(mp.juzNumber) === safeJuz) {
        return swapped[juzCursor++];
      }
      return mp;
    });

    handleUpdateCompetition({
      ...activeCompetition,
      manualPassages: nextAll,
    });
  };

  // نسخ المقاطع اليدوية من مسابقة أخرى
  const handleCopyManualFromCompetition = () => {
    if (!activeCompetition || !copyFromCompId) return;
    const sourceComp = competitions.find(c => c.id === copyFromCompId);
    if (!sourceComp || !(sourceComp.manualPassages || []).length) {
      showToast('المسابقة المختارة لا تحتوي على نطاقات يدوية مسجلة', 'error');
      return;
    }
    const cloned = (sourceComp.manualPassages || []).map((mp, idx) => ({
      ...mp,
      id: `mp-copy-${mp.juzNumber}-${idx}-${Date.now()}`,
    }));
    handleUpdateCompetition({
      ...activeCompetition,
      manualPassages: [...allManualPassages, ...cloned],
    });
    setCopyFromCompId('');
    showToast(
      `تم استيراد (${toArabicDigits(cloned.length)}) مقطع يدوي من "${sourceComp.name}" بنجاح!`,
      'success'
    );
  };

  if (!activeCompetition) {
    return (
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 text-center border border-emerald-100 dark:border-slate-800 space-y-3"
        dir="rtl"
      >
        <BookOpen className="w-12 h-12 text-emerald-600 mx-auto" />
        <h3 className="text-lg font-black text-slate-800 dark:text-white">
          لا توجد مسابقة نشطة حالياً
        </h3>
        <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
          يرجى إنشاء مسابقة قرآنية أولاً من تبويب "المسابقات القرآنية" لتخصيص المقاطع المقترحة للتقييم.
        </p>
      </div>
    );
  }

  const activeModeForCompetition: PassageSelectionMode =
    activeCompetition.passageMode || 'random';

  return (
    <div className="space-y-4 sm:space-y-6 pb-8" dir="rtl">
      {/* ==================== الترويسة العليا: اختيار المسابقة والتصنيف المعتمد للتقييم ==================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-emerald-100/90 dark:border-slate-800 p-3.5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 text-amber-300 flex items-center justify-center shrink-0 shadow-sm">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-black text-emerald-950 dark:text-emerald-300">
                  إدارة المقاطع المقترحة للتقييم
                </h2>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800">
                  للأجزاء (١ - ٣٠)
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                تحكم كامل في آلية اقتراح مقاطع الاختبار التي تظهر للمقيمين أثناء تقييم المتسابقين
              </p>
            </div>
          </div>

          {/* اختيار المسابقة النشطة */}
          {competitions.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-black text-slate-600 dark:text-slate-300 shrink-0">
                المسابقة:
              </span>
              <select
                value={activeCompetition.id}
                onChange={e => setActiveCompetitionId(e.target.value)}
                className="min-h-[40px] flex-1 sm:w-56 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300"
              >
                {competitions.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* شريط اختيار واعتماد التبويب الفعال للتقييم في المسابقة الحالية */}
        <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-white to-amber-50/50 dark:from-slate-800/90 dark:via-slate-900 dark:to-slate-800/60 border-2 border-emerald-200/80 dark:border-slate-700 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                التصنيف المعتمد للظهور في التقييم لمسابقة ({activeCompetition.name}):
              </span>
            </div>
            <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-300/60 dark:border-emerald-800 self-start sm:self-auto">
              المعتمد حالياً:{' '}
              {activeModeForCompetition === 'random'
                ? '١. المقاطع العشوائية الحالية'
                : activeModeForCompetition === 'international'
                ? '٢. تصنيف المسابقات العالمية (تناوب الصعوبة)'
                : '٣. التحديد اليدوي للمشرف'}
            </span>
          </div>

          {/* بطاقات التبويبات الثلاثة المتجاوبة للهواتف */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
            {/* التبويب الأول: المقاطع العشوائية الحالية */}
            <div
              onClick={() => setSelectedTab('random')}
              className={`rounded-2xl p-3 sm:p-4 border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                selectedTab === 'random'
                  ? 'border-emerald-700 bg-white dark:bg-slate-900 ring-2 ring-emerald-600/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-emerald-300'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-black text-xs">
                      <Shuffle className="w-4 h-4" />
                    </span>
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                      ١. المقاطع العشوائية الحالية
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1 shrink-0">
                    <Lock className="w-3 h-3" />
                    للعرض فقط
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                  توزيع عشوائي متوازن لكل جزء (بداية، وسط، نهاية، وممتد) بناءً على عدد الأسطر الفعلية المحددة.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
                  {selectedTab === 'random' ? '● التبويب المعروض حالياً' : 'اضغط لاستعراض المقاطع'}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleSetCompetitionPassageMode('random');
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-[11px] font-black transition active:scale-95 flex items-center gap-1 cursor-pointer ${
                    activeModeForCompetition === 'random'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {activeModeForCompetition === 'random' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>معتمد للتقييم</span>
                    </>
                  ) : (
                    <span>اعتماد للتقييم</span>
                  )}
                </button>
              </div>
            </div>

            {/* التبويب الثاني: تصنيف المسابقات العالمية */}
            <div
              onClick={() => setSelectedTab('international')}
              className={`rounded-2xl p-3 sm:p-4 border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                selectedTab === 'international'
                  ? 'border-amber-600 bg-white dark:bg-slate-900 ring-2 ring-amber-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-amber-300'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center font-black text-xs">
                      <Award className="w-4 h-4" />
                    </span>
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                      ٢. تصنيف المسابقات العالمية
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/90 text-amber-900 dark:text-amber-300 shrink-0">
                    ٣ فئات متناوبة
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                  مصنفة لكل جزء (الأكثر صعوبة، متوسطة، الأقل) بحيث يتناوب المقطع ١ من الأكثر صعوبة، و٢ من المتوسطة، و٣ من الأقل.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-400">
                  {selectedTab === 'international' ? '● التبويب المعروض حالياً' : 'اضغط لاستعراض التصنيف'}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleSetCompetitionPassageMode('international');
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-[11px] font-black transition active:scale-95 flex items-center gap-1 cursor-pointer ${
                    activeModeForCompetition === 'international'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {activeModeForCompetition === 'international' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>معتمد للتقييم</span>
                    </>
                  ) : (
                    <span>اعتماد للتقييم</span>
                  )}
                </button>
              </div>
            </div>

            {/* التبويب الثالث: التحديد اليدوي للمشرف */}
            <div
              onClick={() => setSelectedTab('manual')}
              className={`rounded-2xl p-3 sm:p-4 border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                selectedTab === 'manual'
                  ? 'border-indigo-600 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-indigo-300'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 flex items-center justify-center font-black text-xs">
                      <Sliders className="w-4 h-4" />
                    </span>
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white">
                      ٣. التحديد اليدوي للمشرف
                    </span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/90 text-indigo-900 dark:text-indigo-300 shrink-0">
                    {toArabicDigits(allManualPassages.length)} نطاق مضاف
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                  يحدد المشرف يدوياً لكل جزء المقاطع التي تظهر بالتناوب (من آية... إلى آية... في سورة أو بين سورتين).
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-extrabold text-indigo-700 dark:text-indigo-400">
                  {selectedTab === 'manual' ? '● التبويب المعروض حالياً' : 'اضغط للإضافة والتعديل'}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleSetCompetitionPassageMode('manual');
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-[11px] font-black transition active:scale-95 flex items-center gap-1 cursor-pointer ${
                    activeModeForCompetition === 'manual'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {activeModeForCompetition === 'manual' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>معتمد للتقييم</span>
                    </>
                  ) : (
                    <span>اعتماد للتقييم</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== محدد عدد الأسطر الفعلية المتجاوب مع شاشة الهاتف (للتبويب الأول والثاني) ==================== */}
      {(selectedTab === 'random' || selectedTab === 'international') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 p-3 sm:p-5 space-y-3">
          {/* الصف العلوي: العنوان + عداد الأسطر السريع + زر التعميم */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h3 className="text-xs sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>عدد الأسطر الفعلية لكل مقطع مقترح:</span>
              </h3>
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                يُحسب طول المقطع آلياً بدقة وفق أسطر مصحف المدينة النبوية (١٥ سطراً للصفحة)
              </p>
            </div>

            {/* شريط التحكم في الهاتف: زر (-) والعداد وزر (+) وبجانبه زر التعميم */}
            <div className="flex items-center justify-between sm:justify-end gap-2 bg-emerald-50/70 dark:bg-slate-800/80 p-1.5 rounded-xl border border-emerald-200/70 dark:border-slate-700">
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleLinesChange(linesPerSegment - 1)}
                  disabled={linesPerSegment <= 1}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-black text-base text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 disabled:opacity-40 cursor-pointer"
                  aria-label="إنقاص سطر"
                >
                  -
                </button>
                <span className="px-2 sm:px-3 font-black text-xs sm:text-sm text-emerald-900 dark:text-emerald-300 min-w-[72px] sm:min-w-[88px] text-center whitespace-nowrap">
                  {toArabicDigits(linesPerSegment)} أسطر
                </span>
                <button
                  type="button"
                  onClick={() => handleLinesChange(linesPerSegment + 1)}
                  disabled={linesPerSegment >= 20}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-black text-base text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 disabled:opacity-40 cursor-pointer"
                  aria-label="زيادة سطر"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleLinesChange(linesPerSegment, true)}
                className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] sm:text-xs font-black transition active:scale-95 flex items-center justify-center gap-1 shadow-xs cursor-pointer shrink-0"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>تعميم للمستويات</span>
              </button>
            </div>
          </div>

          {/* شبكة أزرار الأسطر السريعة: 4 أعمدة متساوية في الهاتف و8 في الكمبيوتر */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {LINE_COUNT_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => handleLinesChange(preset)}
                className={`min-h-[38px] py-1.5 px-1 rounded-xl text-[11px] sm:text-xs font-black transition active:scale-95 cursor-pointer border text-center ${
                  linesPerSegment === preset
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-emerald-50'
                }`}
              >
                {toArabicDigits(preset)} أسطر
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ==================== شريط اختيار الأجزاء (١ إلى ٣٠) المتجاوب للهواتف ==================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 p-3.5 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
              اختر الجزء القرآني (١ - ٣٠):
            </span>
            <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
              الجزء المحدد: الجزء {toArabicDigits(selectedJuz)} (ص{' '}
              {toArabicDigits(juzPagesMap[selectedJuz]?.[0] || 1)} -{' '}
              {toArabicDigits(
                juzPagesMap[selectedJuz]?.[juzPagesMap[selectedJuz].length - 1] || 20
              )}
              )
            </span>
          </div>

          {selectedTab === 'manual' && (
            <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">
              الأجزاء الملونة تحتوي على مقاطع يدوية مضافة
            </span>
          )}
        </div>

        {/* شبكة الأجزاء الـ 30: مصممة بـ 6 أعمدة على الهاتف و10-15 عموداً على الشاشات الأكبر */}
        <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-15 gap-1.5">
          {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
            const isSelected = selectedJuz === juz;
            const manualCount = manualPassagesByJuzCount[juz] || 0;
            const hasManual = selectedTab === 'manual' && manualCount > 0;

            return (
              <button
                key={juz}
                type="button"
                onClick={() => {
                  setSelectedJuz(juz);
                  setEditingRangeId(null);
                }}
                className={`relative min-h-[42px] py-1.5 px-1 rounded-xl font-black text-xs transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer border ${
                  isSelected
                    ? selectedTab === 'manual'
                      ? 'bg-indigo-700 text-white border-indigo-800 shadow-sm ring-2 ring-indigo-500/30'
                      : selectedTab === 'international'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-500/30'
                      : 'bg-emerald-700 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-500/30'
                    : hasManual
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>ج {toArabicDigits(juz)}</span>
                {selectedTab === 'manual' && manualCount > 0 && (
                  <span
                    className={`text-[9px] font-black px-1 rounded-full leading-tight mt-0.5 ${
                      isSelected
                        ? 'bg-white text-indigo-800'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {toArabicDigits(manualCount)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================================
          محتوى التبويب الأول: المقاطع العشوائية الحالية لكل جزء (للعرض فقط)
         ============================================================================ */}
      {selectedTab === 'random' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-emerald-100 dark:border-slate-800 p-3.5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-black text-emerald-950 dark:text-emerald-300">
                  خيارات المقاطع العشوائية الحالية — الجزء ({toArabicDigits(selectedJuz)})
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-500" />
                  <span>للعرض فقط — لا يمكن التعديل عليها</span>
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                تظهر هذه الخيارات المحسوبة آلياً للجزء ({toArabicDigits(selectedJuz)}) بناءً على تحديد ({toArabicDigits(linesPerSegment)} أسطر فعلية) لكل مقطع مقترح.
              </p>
            </div>

            {activeModeForCompetition !== 'random' && (
              <button
                type="button"
                onClick={() => handleSetCompetitionPassageMode('random')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد هذا التبويب للتقييم</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {randomPassagesForSelectedJuz.map((passage, idx) => (
              <div
                key={passage.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 p-3.5 flex flex-col justify-between gap-3 hover:border-emerald-300 dark:hover:border-emerald-700 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white text-xs font-black">
                        خيار {toArabicDigits(idx + 1)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 text-[11px] font-black border border-amber-300/60 dark:border-amber-800">
                        {passage.categoryNote}
                      </span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      {toArabicDigits(passage.actualLinesCount || linesPerSegment)} سطر فعلي
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                      {passage.description}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleOpenPreviewInMushaf(passage, randomPassagesForSelectedJuz)
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700/10 hover:bg-emerald-700/20 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300/70 dark:border-emerald-800 text-xs font-black transition active:scale-95 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    <span>معاينة وتظليل المقطع في المصحف</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-bold">
                    {passage.shortLabel}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================================
          محتوى التبويب الثاني: المقاطع المصنفة حسب التقييمات في المسابقات العالمية
         ============================================================================ */}
      {selectedTab === 'international' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-amber-200/80 dark:border-slate-800 p-3.5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-black text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>
                    تصنيف المسابقات العالمية القرآنية — الجزء ({toArabicDigits(selectedJuz)})
                  </span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                  {toArabicDigits(linesPerSegment)} أسطر فعلية للمقطع
                </span>
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
                عند التقييم تتنوع المقاطع تلقائياً بالتناوب: <strong>المقطع الأول</strong> من فئة (الأكثر صعوبة)، و<strong>المقطع الثاني</strong> من فئة (المتوسطة)، و<strong>المقطع الثالث</strong> من فئة (الأقل صعوبة)، وهكذا مع التبديل المستمر بين المتسابقين.
              </p>
            </div>

            {activeModeForCompetition !== 'international' && (
              <button
                type="button"
                onClick={() => handleSetCompetitionPassageMode('international')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد تصنيف المسابقات العالمية للتقييم</span>
              </button>
            )}
          </div>

          {/* أزرار تصفية الفئات الثلاث (الكل بالتناوب / الأكثر صعوبة / متوسطة / الأقل) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDifficultyFilter('all')}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer border ${
                difficultyFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              جميع الفئات بالتناوب (٩ مقاطع)
            </button>
            <button
              type="button"
              onClick={() => setDifficultyFilter('hard')}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer border flex items-center justify-center gap-1.5 ${
                difficultyFilter === 'hard'
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800/70'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>الأكثر صعوبة — للمقطع ١ (٣)</span>
            </button>
            <button
              type="button"
              onClick={() => setDifficultyFilter('medium')}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer border flex items-center justify-center gap-1.5 ${
                difficultyFilter === 'medium'
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/70'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>متوسطة — للمقطع ٢ (٣)</span>
            </button>
            <button
              type="button"
              onClick={() => setDifficultyFilter('easy')}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer border flex items-center justify-center gap-1.5 ${
                difficultyFilter === 'easy'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/70'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>الأقل صعوبة — للمقطع ٣ (٣)</span>
            </button>
          </div>

          {/* شبكة بطاقات المقاطع المصنفة حسب المسابقات العالمية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {internationalPassagesForSelectedJuz.map((passage, idx) => {
              const tier = passage.difficulty || 'medium';
              const tierBadgeStyle =
                tier === 'hard'
                  ? 'bg-rose-600 text-white border-rose-700'
                  : tier === 'medium'
                  ? 'bg-amber-500 text-amber-950 border-amber-600'
                  : 'bg-emerald-600 text-white border-emerald-700';

              const cardBorderStyle =
                tier === 'hard'
                  ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15'
                  : tier === 'medium'
                  ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/15'
                  : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/15';

              const targetSegmentSlot =
                tier === 'hard'
                  ? 'يتناوب في المقطع ١'
                  : tier === 'medium'
                  ? 'يتناوب في المقطع ٢'
                  : 'يتناوب في المقطع ٣';

              return (
                <div
                  key={passage.id}
                  className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-3 transition ${cardBorderStyle}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-black border ${tierBadgeStyle}`}
                      >
                        {DIFFICULTY_LABELS[tier]}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {targetSegmentSlot}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                          الجزء {toArabicDigits(selectedJuz)} • {passage.shortLabel}
                        </span>
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">
                          {toArabicDigits(passage.actualLinesCount || linesPerSegment)} سطر فعلي
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                        {passage.description}
                      </p>
                    </div>

                    {passage.categoryNote && (
                      <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 leading-relaxed flex items-start gap-1">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{passage.categoryNote}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleOpenPreviewInMushaf(
                        passage,
                        internationalPassagesForSelectedJuz
                      )
                    }
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 text-xs font-black transition active:scale-95 flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-amber-600" />
                      <span>معاينة وتظليل في المصحف</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                      مجموعة #{toArabicDigits(Math.floor(idx / 3) + 1)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================================
          محتوى التبويب الثالث: التحديد اليدوي للمشرف لكل جزء (إضافة وحذف بحرية تامة)
         ============================================================================ */}
      {selectedTab === 'manual' && (
        <div className="space-y-4">
          {/* نموذج إضافة أو تعديل نطاق يدوي في الجزء المحدد */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border-2 border-indigo-200 dark:border-indigo-900/60 p-3.5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-lg font-black text-indigo-950 dark:text-indigo-300">
                    {editingRangeId
                      ? `تعديل النطاق اليدوي في الجزء (${toArabicDigits(selectedJuz)})`
                      : `إضافة نطاق يدوي جديد للجزء (${toArabicDigits(selectedJuz)})`}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200">
                    نطاقات الجزء الحالي: {toArabicDigits(currentJuzManualRanges.length)}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  اختر الآيات (من... إلى...) ضمن سور وآيات الجزء ({toArabicDigits(selectedJuz)}) فقط؛ ستظهر هذه النطاقات بالتناوب عند تقييم هذا الجزء.
                </p>
              </div>

              {activeModeForCompetition !== 'manual' && (
                <button
                  type="button"
                  onClick={() => handleSetCompetitionPassageMode('manual')}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد التحديد اليدوي للتقييم</span>
                </button>
              )}
            </div>

            {/* السور الواقعة في الجزء الحالي مع نطاق آياتها الدقيق */}
            <div className="flex items-center gap-1.5 flex-wrap bg-indigo-50/70 dark:bg-slate-800/70 p-2.5 rounded-xl border border-indigo-100 dark:border-slate-700">
              <span className="text-[11px] font-black text-indigo-900 dark:text-indigo-300">
                سور وآيات الجزء ({toArabicDigits(selectedJuz)}) المتاحة:
              </span>
              {currentJuzSurahBounds.map(b => (
                <button
                  key={b.surahId}
                  type="button"
                  onClick={() => {
                    setManualStartSurahId(b.surahId);
                    setManualStartAyah(b.minAyahInJuz);
                    setManualEndSurahId(b.surahId);
                    setManualEndAyah(Math.min(b.maxAyahInJuz, b.minAyahInJuz + 7));
                  }}
                  className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                    manualStartSurahId === b.surahId
                      ? 'bg-indigo-700 text-white border-indigo-800 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-indigo-200 dark:border-slate-600 hover:border-indigo-500'
                  }`}
                >
                  سورة {b.surahName} (آية {toArabicDigits(b.minAyahInJuz)} إلى{' '}
                  {toArabicDigits(b.maxAyahInJuz)})
                </button>
              ))}
            </div>

            {/* حقول اختيار: من سورة / من آية  -->  إلى سورة / إلى آية (مقيدة بنطاق الجزء المحدد) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* صندوق بداية المقطع (من...) */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-slate-800/60 border border-emerald-200 dark:border-slate-700 space-y-3">
                <div className="text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center justify-between gap-2 flex-wrap">
                  <span>بداية المقطع (مِن):</span>
                  {startSurahJuzBound && (
                    <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md">
                      المتاح في الجزء ({toArabicDigits(selectedJuz)}): آية{' '}
                      {toArabicDigits(startSurahJuzBound.minAyahInJuz)} -{' '}
                      {toArabicDigits(startSurahJuzBound.maxAyahInJuz)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                      من سورة (ضمن الجزء {toArabicDigits(selectedJuz)}):
                    </label>
                    <select
                      value={manualStartSurahId}
                      onChange={e => {
                        const newStartSurah = Number(e.target.value);
                        setManualStartSurahId(newStartSurah);
                        const bound = currentJuzSurahBounds.find(
                          b => b.surahId === newStartSurah
                        );
                        const firstAyah = bound ? bound.minAyahInJuz : 1;
                        const maxInJuz = bound
                          ? bound.maxAyahInJuz
                          : surahAyahCounts[newStartSurah] || 7;
                        setManualStartAyah(firstAyah);
                        if (manualEndSurahId < newStartSurah) {
                          setManualEndSurahId(newStartSurah);
                          setManualEndAyah(Math.min(maxInJuz, firstAyah + 6));
                        } else if (manualEndSurahId === newStartSurah) {
                          setManualEndAyah(
                            Math.min(
                              maxInJuz,
                              Math.max(manualEndAyah, firstAyah + 4)
                            )
                          );
                        }
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-xs sm:text-sm"
                    >
                      {currentJuzSurahBounds.map(b => (
                        <option key={b.surahId} value={b.surahId}>
                          سورة {b.surahName} (آية {toArabicDigits(b.minAyahInJuz)} -{' '}
                          {toArabicDigits(b.maxAyahInJuz)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                      من الآية رقم (قائمة آيات الجزء أو كتابة):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={
                          startSurahJuzBound &&
                          manualStartAyah >= startSurahJuzBound.minAyahInJuz &&
                          manualStartAyah <= startSurahJuzBound.maxAyahInJuz
                            ? manualStartAyah
                            : ''
                        }
                        onChange={e => {
                          const val = Number(e.target.value);
                          if (!val) return;
                          setManualStartAyah(val);
                          if (
                            manualEndSurahId === manualStartSurahId &&
                            manualEndAyah < val
                          ) {
                            const maxInJuz =
                              startSurahJuzBound?.maxAyahInJuz ||
                              surahAyahCounts[manualStartSurahId] ||
                              val;
                            setManualEndAyah(Math.min(maxInJuz, val + 5));
                          }
                        }}
                        className="flex-1 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-xs sm:text-sm"
                      >
                        {startSurahJuzBound &&
                          (manualStartAyah < startSurahJuzBound.minAyahInJuz ||
                            manualStartAyah > startSurahJuzBound.maxAyahInJuz) && (
                            <option value="" disabled>
                              -- خارج نطاق الجزء ({toArabicDigits(manualStartAyah || 0)}) --
                            </option>
                          )}
                        {startSurahJuzBound &&
                          Array.from(
                            {
                              length:
                                startSurahJuzBound.maxAyahInJuz -
                                startSurahJuzBound.minAyahInJuz +
                                1,
                            },
                            (_, i) => startSurahJuzBound.minAyahInJuz + i
                          ).map(a => (
                            <option key={a} value={a}>
                              آية {toArabicDigits(a)}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        min={startSurahJuzBound?.minAyahInJuz || 1}
                        max={startSurahJuzBound?.maxAyahInJuz || 286}
                        value={manualStartAyah || ''}
                        onChange={e => {
                          const raw = e.target.value;
                          const val = raw === '' ? 0 : parseInt(raw, 10);
                          setManualStartAyah(Number.isNaN(val) ? 0 : val);
                        }}
                        className={`w-16 min-h-[44px] px-2 py-2 rounded-xl border font-black text-center text-xs sm:text-sm ${
                          startSurahJuzBound &&
                          (manualStartAyah < startSurahJuzBound.minAyahInJuz ||
                            manualStartAyah > startSurahJuzBound.maxAyahInJuz)
                            ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 ring-2 ring-red-500/20'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                        }`}
                        title="كتابة رقم الآية مباشرة ضمن نطاق الجزء"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* صندوق نهاية المقطع (إلى...) — يدعم نفس السورة أو سورة أخرى ضمن الجزء */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-slate-800/60 border border-indigo-200 dark:border-slate-700 space-y-3">
                <div className="text-xs font-black text-indigo-900 dark:text-indigo-300 flex items-center justify-between gap-2 flex-wrap">
                  <span>نهاية المقطع (إِلَى):</span>
                  {endSurahJuzBound && (
                    <span className="text-[11px] font-extrabold text-indigo-800 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md">
                      المتاح في الجزء ({toArabicDigits(selectedJuz)}): آية{' '}
                      {toArabicDigits(
                        manualEndSurahId === manualStartSurahId
                          ? Math.max(
                              endSurahJuzBound.minAyahInJuz,
                              Math.min(manualStartAyah, endSurahJuzBound.maxAyahInJuz)
                            )
                          : endSurahJuzBound.minAyahInJuz
                      )}{' '}
                      - {toArabicDigits(endSurahJuzBound.maxAyahInJuz)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                      إلى سورة (ضمن الجزء {toArabicDigits(selectedJuz)}):
                    </label>
                    <select
                      value={manualEndSurahId}
                      onChange={e => {
                        const newEndSurah = Number(e.target.value);
                        setManualEndSurahId(newEndSurah);
                        const bound = currentJuzSurahBounds.find(
                          b => b.surahId === newEndSurah
                        );
                        if (newEndSurah === manualStartSurahId) {
                          const maxInJuz =
                            bound?.maxAyahInJuz ||
                            surahAyahCounts[newEndSurah] ||
                            manualStartAyah;
                          setManualEndAyah(Math.min(maxInJuz, manualStartAyah + 6));
                        } else {
                          setManualEndAyah(
                            bound
                              ? Math.min(bound.maxAyahInJuz, bound.minAyahInJuz + 6)
                              : 5
                          );
                        }
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-xs sm:text-sm"
                    >
                      {currentJuzSurahBounds
                        .filter(b => b.surahId >= manualStartSurahId)
                        .map(b => (
                          <option key={b.surahId} value={b.surahId}>
                            سورة {b.surahName} (آية {toArabicDigits(b.minAyahInJuz)} -{' '}
                            {toArabicDigits(b.maxAyahInJuz)}){' '}
                            {b.surahId === manualStartSurahId
                              ? '• نفس السورة'
                              : '• امتداد لسورة تالية'}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                      إلى الآية رقم (قائمة آيات الجزء أو كتابة):
                    </label>
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const minEndInJuz = endSurahJuzBound
                          ? manualEndSurahId === manualStartSurahId
                            ? Math.max(
                                endSurahJuzBound.minAyahInJuz,
                                Math.min(manualStartAyah, endSurahJuzBound.maxAyahInJuz)
                              )
                            : endSurahJuzBound.minAyahInJuz
                          : 1;
                        const maxEndInJuz = endSurahJuzBound
                          ? endSurahJuzBound.maxAyahInJuz
                          : surahAyahCounts[manualEndSurahId] || 7;
                        const isEndAyahValidInJuz =
                          manualEndAyah >= minEndInJuz && manualEndAyah <= maxEndInJuz;

                        return (
                          <>
                            <select
                              value={isEndAyahValidInJuz ? manualEndAyah : ''}
                              onChange={e => {
                                const val = Number(e.target.value);
                                if (val) setManualEndAyah(val);
                              }}
                              className="flex-1 min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-black text-xs sm:text-sm"
                            >
                              {!isEndAyahValidInJuz && (
                                <option value="" disabled>
                                  -- خارج نطاق الجزء ({toArabicDigits(manualEndAyah || 0)}) --
                                </option>
                              )}
                              {Array.from(
                                {
                                  length: Math.max(0, maxEndInJuz - minEndInJuz + 1),
                                },
                                (_, i) => minEndInJuz + i
                              ).map(a => (
                                <option key={a} value={a}>
                                  آية {toArabicDigits(a)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={minEndInJuz}
                              max={maxEndInJuz}
                              value={manualEndAyah || ''}
                              onChange={e => {
                                const raw = e.target.value;
                                const val = raw === '' ? 0 : parseInt(raw, 10);
                                setManualEndAyah(Number.isNaN(val) ? 0 : val);
                              }}
                              className={`w-16 min-h-[44px] px-2 py-2 rounded-xl border font-black text-center text-xs sm:text-sm ${
                                !isEndAyahValidInJuz
                                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 ring-2 ring-red-500/20'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                              title="كتابة رقم آية النهاية مباشرة ضمن نطاق الجزء"
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* تنبيه واضح في حال كتابة آية خارج نطاق الجزء المحدد مع منع الحفظ */}
            {manualRangeValidationError && (
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2 text-red-800 dark:text-red-200 text-xs font-black leading-relaxed">
                  <Info className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <span>{manualRangeValidationError}</span>
                </div>
                {startSurahJuzBound && endSurahJuzBound && (
                  <button
                    type="button"
                    onClick={() => {
                      const fixedStart = Math.max(
                        startSurahJuzBound.minAyahInJuz,
                        Math.min(
                          startSurahJuzBound.maxAyahInJuz,
                          manualStartAyah || startSurahJuzBound.minAyahInJuz
                        )
                      );
                      setManualStartAyah(fixedStart);
                      const minEnd =
                        manualEndSurahId === manualStartSurahId
                          ? fixedStart
                          : endSurahJuzBound.minAyahInJuz;
                      const fixedEnd = Math.max(
                        minEnd,
                        Math.min(
                          endSurahJuzBound.maxAyahInJuz,
                          manualEndAyah || Math.min(endSurahJuzBound.maxAyahInJuz, minEnd + 6)
                        )
                      );
                      setManualEndAyah(fixedEnd);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-black shrink-0 cursor-pointer transition active:scale-95"
                  >
                    تصحيح تلقائي لنطاق الجزء ({toArabicDigits(selectedJuz)})
                  </button>
                )}
              </div>
            )}

            {/* شريط المعاينة الفورية للنطاق قبل الحفظ */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                    معاينة النطاق اليدوي المحدد الآن:
                  </span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    {manualRangeValidationError
                      ? 'يرجى اختيار آية ضمن نطاق الجزء المحدد لتفعيل المعاينة والحفظ'
                      : `${liveDraftManualPassage.description} • (≈ ${toArabicDigits(
                          liveDraftManualPassage.actualLinesCount || 6
                        )} سطر فعلي)`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  disabled={Boolean(manualRangeValidationError)}
                  onClick={() =>
                    handleOpenPreviewInMushaf(liveDraftManualPassage, [
                      liveDraftManualPassage,
                    ])
                  }
                  className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 text-xs font-black transition active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>معاينة بالمصحف</span>
                </button>

                {editingRangeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRangeId(null);
                      setManualNotes('');
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black transition active:scale-95 cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveManualRange}
                  className={`flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-black transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${
                    manualRangeValidationError
                      ? 'bg-slate-400 dark:bg-slate-700 hover:bg-red-600'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {editingRangeId
                      ? 'حفظ تعديل النطاق'
                      : `إضافة النطاق للجزء (${toArabicDigits(selectedJuz)})`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* قائمة النطاقات اليدوية المضافة للجزء المحدد (تظهر بالتناوب) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 p-3.5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  المقاطع اليدوية المعتمدة بالتناوب في الجزء ({toArabicDigits(selectedJuz)})
                </h4>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  تظهر هذه المقاطع بالتناوب التلقائي للمقيمين عند اختبار أي متسابق في الجزء ({toArabicDigits(selectedJuz)})
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {competitions.filter(c => c.id !== activeCompetition.id && (c.manualPassages || []).length > 0).length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={copyFromCompId}
                      onChange={e => setCopyFromCompId(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                    >
                      <option value="">استيراد نطاقات من مسابقة أخرى...</option>
                      {competitions
                        .filter(
                          c =>
                            c.id !== activeCompetition.id &&
                            (c.manualPassages || []).length > 0
                        )
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({toArabicDigits((c.manualPassages || []).length)} مقطع)
                          </option>
                        ))}
                    </select>
                    {copyFromCompId && (
                      <button
                        type="button"
                        onClick={handleCopyManualFromCompetition}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>استيراد</span>
                      </button>
                    )}
                  </div>
                )}

                {currentJuzManualRanges.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setClearJuzConfirmNum(selectedJuz)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 text-xs font-black flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف جميع مقاطع الجزء ({toArabicDigits(selectedJuz)})</span>
                  </button>
                )}
              </div>
            </div>

            {currentJuzManualBuiltPassages.length === 0 ? (
              <div className="p-6 sm:p-8 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
                <Sliders className="w-9 h-9 text-slate-400 mx-auto" />
                <p className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200">
                  لم يتم تحديد نطاقات يدوية للجزء ({toArabicDigits(selectedJuz)}) بعد
                </p>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  استخدم النموذج أعلاه لاختيار السورة والآيات (من... إلى...) ثم اضغط على زر "إضافة النطاق"؛ يمكنك إضافة أي عدد من النطاقات بحرية تامة.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentJuzManualBuiltPassages.map((builtPassage, idx) => {
                  const rawRange = currentJuzManualRanges[idx];
                  const isEditingThis = editingRangeId === rawRange.id;
                  const isCrossSurah =
                    rawRange.startSurahId !== rawRange.endSurahId;

                  return (
                    <div
                      key={rawRange.id}
                      className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-3 transition ${
                        isEditingThis
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-700 text-white text-xs font-black">
                              التناوب #{toArabicDigits(idx + 1)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                isCrossSurah
                                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-amber-300'
                                  : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border-emerald-300'
                              }`}
                            >
                              {isCrossSurah ? 'ممتد بين سورتين' : 'في نفس السورة'}
                            </span>
                          </div>

                          <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                            ≈ {toArabicDigits(builtPassage.actualLinesCount || 6)} سطر فعلي
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-snug">
                            {builtPassage.description}
                          </span>
                        </div>
                      </div>

                      {/* أزرار التحكم الكامل: معاينة، ترتيب التناوب، تعديل، حذف */}
                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenPreviewInMushaf(
                              builtPassage,
                              currentJuzManualBuiltPassages
                            )
                          }
                          className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border border-indigo-300/70 dark:border-indigo-800 text-xs font-black transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>معاينة بالمصحف</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveManualRange(rawRange.id, 'up')}
                            disabled={idx === 0}
                            className="min-w-[38px] min-h-[40px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-35 hover:bg-slate-100 cursor-pointer"
                            title="تقديم في التناوب"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveManualRange(rawRange.id, 'down')}
                            disabled={idx === currentJuzManualBuiltPassages.length - 1}
                            className="min-w-[38px] min-h-[40px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-35 hover:bg-slate-100 cursor-pointer"
                            title="تأخير في التناوب"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditManualRange(rawRange)}
                            className="min-w-[38px] min-h-[40px] rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex items-center justify-center cursor-pointer"
                            title="تعديل النطاق"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteRangeConfirmId(rawRange.id)}
                            className="min-w-[38px] min-h-[40px] rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 flex items-center justify-center cursor-pointer"
                            title="حذف النطاق"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* نافذة المصحف الشريف لمعاينة أي مقطع مقترح وتظليله */}
      {isMushafOpen && previewPassage && (
        <MushafReaderModal
          hideEvaluation={true}
          isOpen={isMushafOpen}
          onClose={() => setIsMushafOpen(false)}
          newPages={
            juzPagesMap[selectedJuz] && juzPagesMap[selectedJuz].length > 0
              ? juzPagesMap[selectedJuz]
              : previewPassage.pages
          }
          previousWeekPages={[]}
          studentName={`معاينة مقاطع الجزء ${toArabicDigits(selectedJuz)}`}
          isTestMode={true}
          testPassagesCount={previewAllPassages.length}
          activePassage={previewPassage}
          allPassages={previewAllPassages}
          onSelectPassage={p => setPreviewPassage(p)}
          onClearActivePassage={() => setPreviewPassage(null)}
        />
      )}

      {/* نافذة تأكيد حذف نطاق يدوي فردي */}
      {deleteRangeConfirmId && (
        <ConfirmDeleteModal
          isOpen={true}
          title="حذف النطاق اليدوي"
          message="هل أنت متأكد من رغبتك في حذف هذا النطاق اليدوي للمقطع المقترح؟"
          itemTitle={
            allManualPassages.find(mp => mp.id === deleteRangeConfirmId)
              ? `المقطع ${buildPassageFromManualRange(
                  allManualPassages.find(mp => mp.id === deleteRangeConfirmId)!,
                  1
                ).description}`
              : undefined
          }
          onConfirm={() => {
            const targetId = deleteRangeConfirmId;
            setDeleteRangeConfirmId(null);
            handleDeleteManualRange(targetId);
          }}
          onClose={() => setDeleteRangeConfirmId(null)}
        />
      )}

      {/* نافذة تأكيد حذف جميع النطاقات اليدوية للجزء */}
      {clearJuzConfirmNum !== null && (
        <ConfirmDeleteModal
          isOpen={true}
          title={`حذف جميع مقاطع الجزء (${toArabicDigits(clearJuzConfirmNum)})`}
          message={`هل أنت متأكد من مسح كافة النطاقات اليدوية المضافة للجزء (${toArabicDigits(clearJuzConfirmNum)})؟`}
          onConfirm={() => {
            const targetJuz = clearJuzConfirmNum;
            setClearJuzConfirmNum(null);
            handleClearJuzManualRanges(targetJuz);
          }}
          onClose={() => setClearJuzConfirmNum(null)}
        />
      )}
    </div>
  );
};

export default SuggestedPassagesPage;
