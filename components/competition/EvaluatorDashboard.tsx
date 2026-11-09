import React, { useContext, useState, useMemo, useEffect } from 'react';
import { AppContext } from '../../App';
import { CompetitionEvaluator } from '../../types';
import {
  LogOut,
  CheckCircle,
  Search,
  BookOpen,
  Users,
  Sparkles,
  AlertTriangle,
  MessageSquare,
  Lock,
  Unlock,
  WifiOff,
  RefreshCw,
  Clock,
} from 'lucide-react';
import ParticipantEvaluation from './ParticipantEvaluation';
import { Logo, AwqafBadge } from '../Logo';
import { formatJuzsOrSurahsDisplay } from '../../utils/juzUtils';
import {
  getParticipantLocalDraftStatus,
  getPendingCloudEvaluationsForEvaluator,
  flushPendingEvaluationsToCloud,
} from '../../utils/firebase';

export default function EvaluatorDashboard({
  evaluatorUser,
  onLogout,
}: {
  evaluatorUser: any;
  onLogout: () => void;
}) {
  const context = useContext(AppContext);
  if (!context) return null;

  const { competitions, setCompetitionsLocally, showToast } = context;

  // البحث عن المسابقة الخاصة بالمقيم (مع دعم التطابق النصي أو الرقمي أو البحث التلقائي)
  const comp =
    competitions.find(
      c => String(c.id) === String(evaluatorUser?.competitionId)
    ) ||
    competitions.find(
      c =>
        c.isActive &&
        (c.evaluators || []).some(
          e => Number(e.id) === Number(evaluatorUser?.id)
        )
    ) ||
    competitions.find(c =>
      (c.evaluators || []).some(
        e => Number(e.id) === Number(evaluatorUser?.id)
      )
    );

  const [selectedParticipantId, setSelectedParticipantId] = useState<
    number | null
  >(null);
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'evaluated'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncTick(t => t + 1);
      const res = await flushPendingEvaluationsToCloud();
      if (res.synced > 0) {
        showToast(
          `عاد الاتصال بالإنترنت وتم رفع (${res.synced}) تقييم معتمد تلقائياً إلى السحابة!`,
          'success'
        );
      }
      setSyncTick(t => t + 1);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncTick(t => t + 1);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  if (!comp) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-950"
        dir="rtl"
      >
        <Logo size="lg" className="mb-4" />
        <p className="text-red-600 dark:text-red-400 font-black text-lg mb-4">
          لا توجد مسابقة نشطة حالياً أو جاري تحميل بيانات المسابقة...
        </p>
        <button
          onClick={onLogout}
          className="min-h-[48px] px-6 py-3 bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-md active:scale-95 cursor-pointer"
        >
          <LogOut size={18} />
          <span>العودة لشاشة الدخول</span>
        </button>
      </div>
    );
  }

  const evaluator: CompetitionEvaluator | undefined =
    (comp.evaluators || []).find(
      e => Number(e.id) === Number(evaluatorUser?.id)
    ) ||
    (evaluatorUser?.name
      ? {
          id: Number(evaluatorUser.id),
          name: evaluatorUser.name,
          levelIds: evaluatorUser.levelIds || [],
        }
      : undefined);

  if (!evaluator) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-950"
        dir="rtl"
      >
        <Logo size="lg" className="mb-4" />
        <p className="text-red-600 dark:text-red-400 font-black text-lg mb-4">
          حساب المقيم غير موجود في هذه المسابقة.
        </p>
        <button
          onClick={onLogout}
          className="min-h-[48px] px-6 py-3 bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-md active:scale-95 cursor-pointer"
        >
          <LogOut size={18} />
          <span>العودة لشاشة الدخول</span>
        </button>
      </div>
    );
  }

  const pendingCloudEvals = useMemo(() => {
    void syncTick;
    void selectedParticipantId;
    return getPendingCloudEvaluationsForEvaluator(comp.id, evaluator.id);
  }, [comp.id, evaluator.id, syncTick, selectedParticipantId, comp.evaluations]);

  const handleManualFlushPending = async () => {
    if (isSyncingPending) return;
    setIsSyncingPending(true);
    try {
      const res = await flushPendingEvaluationsToCloud();
      if (res.synced > 0) {
        showToast(
          `تم رفع (${res.synced}) تقييم معتمد إلى قاعدة البيانات بنجاح!`,
          'success'
        );
      } else if (res.remaining > 0) {
        showToast(
          'تعذر الاتصال بالإنترنت حالياً؛ سيتم الرفع تلقائياً فور توفر الشبكة.',
          'info'
        );
      }
      setSyncTick(t => t + 1);
    } finally {
      setIsSyncingPending(false);
    }
  };

  // المستويات المسندة لهذا المقيم
  const assignedLevels = useMemo(() => {
    const allLevels = comp.levels || [];
    if (!evaluator.levelIds || evaluator.levelIds.length === 0) {
      return allLevels;
    }
    const allowedSet = new Set(evaluator.levelIds.map(id => Number(id)));
    return allLevels.filter(l => allowedSet.has(Number(l.id)));
  }, [comp.levels, evaluator.levelIds]);

  const allParticipants = comp.participants || [];

  // جميع الطلاب الذين يقعون ضمن مستويات هذا المقيم
  const myLevelParticipants = useMemo(() => {
    const allowedSet =
      evaluator.levelIds && evaluator.levelIds.length > 0
        ? new Set(evaluator.levelIds.map(id => Number(id)))
        : null;

    return allParticipants.filter(
      p => !allowedSet || allowedSet.has(Number(p.levelId))
    );
  }, [allParticipants, evaluator.levelIds]);

  // خريطة حالة التقييم المحفوظ محلياً (غير المعتمد بعد) لكل متسابق
  const participantDraftMap = useMemo(() => {
    void selectedParticipantId;
    void syncTick;
    const map: Record<
      number,
      ReturnType<typeof getParticipantLocalDraftStatus>
    > = {};
    for (const p of myLevelParticipants) {
      const lvl = (comp.levels || []).find(
        l => Number(l.id) === Number(p.levelId)
      );
      const segmentsCount = lvl?.segmentsCount || 3;
      map[Number(p.id)] = getParticipantLocalDraftStatus(
        comp.id,
        evaluator.id,
        p.id,
        segmentsCount
      );
    }
    return map;
  }, [
    myLevelParticipants,
    comp.levels,
    comp.id,
    evaluator.id,
    selectedParticipantId,
    syncTick,
  ]);

  // إحصائيات تقييم هذا المقيم
  const evaluatedByMeCount = useMemo(() => {
    return myLevelParticipants.filter(p =>
      (comp.evaluations || []).some(
        ev =>
          Number(ev.participantId) === Number(p.id) &&
          Number(ev.evaluatorId) === Number(evaluator.id)
      )
    ).length;
  }, [myLevelParticipants, comp.evaluations, evaluator.id]);

  // عدد الطلاب الذين تم تقييم بعض مقاطعهم أو كلها محلياً ولم يتم اعتماد التقييم بعد
  const inProgressForMeCount = useMemo(() => {
    return myLevelParticipants.filter(p => {
      const hasMyEval = (comp.evaluations || []).some(
        ev =>
          Number(ev.participantId) === Number(p.id) &&
          Number(ev.evaluatorId) === Number(evaluator.id)
      );
      if (hasMyEval) return false;
      const draft = participantDraftMap[Number(p.id)];
      return Boolean(draft?.hasDraft);
    }).length;
  }, [myLevelParticipants, comp.evaluations, evaluator.id, participantDraftMap]);

  const pendingForMeCount = myLevelParticipants.length - evaluatedByMeCount;

  // تصفية قائمة الطلاب حسب المستوى والبحث وحالة التقييم
  const filteredParticipants = useMemo(() => {
    return myLevelParticipants.filter(p => {
      if (
        selectedLevelId !== 'all' &&
        Number(p.levelId) !== Number(selectedLevelId)
      ) {
        return false;
      }

      if (
        searchQuery.trim() &&
        !p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }

      const hasMyEval = (comp.evaluations || []).some(
        ev =>
          Number(ev.participantId) === Number(p.id) &&
          Number(ev.evaluatorId) === Number(evaluator.id)
      );
      const hasLocalDraft =
        !hasMyEval && Boolean(participantDraftMap[Number(p.id)]?.hasDraft);

      if (statusFilter === 'evaluated' && !hasMyEval) return false;
      if (statusFilter === 'in_progress' && !hasLocalDraft) return false;
      if (statusFilter === 'pending' && hasMyEval) return false;

      return true;
    });
  }, [
    myLevelParticipants,
    selectedLevelId,
    searchQuery,
    statusFilter,
    comp.evaluations,
    evaluator.id,
    participantDraftMap,
  ]);

  // إذا كانت المسابقة غير مفعّلة من قِبل المشرف: لا تظهر أسماء المشاركين للمعلمين/المقيمين
  if (!comp.isActive) {
    return (
      <div
        className="bg-slate-50 dark:bg-slate-950 min-h-[100dvh] w-full max-w-full overflow-x-hidden text-slate-800 dark:text-slate-100 text-right flex flex-col"
        dir="rtl"
      >
        <header className="bg-emerald-900 dark:bg-slate-900 text-white px-2.5 sm:px-6 py-2 sm:py-2.5 shadow-md sticky top-0 z-20 flex flex-row justify-between items-center gap-2 border-b border-amber-500/30 w-full">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
            <Logo size="sm" />
            <AwqafBadge variant="compact" />
            <div className="min-w-0 flex-1 text-right">
              <h1 className="text-[11px] xs:text-xs sm:text-lg font-black text-amber-300 leading-tight line-clamp-2 break-words whitespace-normal">
                {comp.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] xs:text-[11px] sm:text-xs text-emerald-100 leading-tight mt-0.5">
                <span className="font-bold leading-tight line-clamp-2 break-words whitespace-normal">
                  المقيم: {evaluator.name}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-4 py-1.5 sm:py-2 bg-red-600/90 hover:bg-red-700 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-black shrink-0 shadow-sm cursor-pointer"
            title="تسجيل الخروج"
          >
            <LogOut size={16} />
            <span>خروج</span>
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-lg mx-auto text-center">
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-lg border-2 border-amber-300 dark:border-amber-800/60 space-y-4 w-full">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle size={34} />
            </div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white">
              المسابقة غير مفعّلة حالياً
            </h2>
            <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
              تم إيقاف تفعيل مسابقة «{comp.name}» حالياً من قِبل المشرف. لن تظهر أسماء المشاركين ولن يتاح رصد التقييمات حتى يقوم المشرف بتفعيل المسابقة.
            </p>
            <button
              onClick={onLogout}
              className="w-full min-h-[48px] px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer transition"
            >
              <LogOut size={18} />
              <span>تسجيل الخروج والعودة لشاشة الدخول</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (selectedParticipantId !== null) {
    const participant = allParticipants.find(
      p => Number(p.id) === Number(selectedParticipantId)
    );
    if (participant) {
      return (
        <ParticipantEvaluation
          key={participant.id}
          comp={comp}
          evaluator={evaluator}
          participant={participant}
          onBack={() => setSelectedParticipantId(null)}
        />
      );
    }
  }

  return (
    <div
      className="bg-slate-50 dark:bg-slate-950 min-h-[100dvh] w-full max-w-full overflow-x-hidden text-slate-800 dark:text-slate-100 text-right"
      dir="rtl"
    >
      {/* شريط علوي نظيف ومباشر للمقيم بدون أي إعدادات ربط */}
      <header className="bg-emerald-900 dark:bg-slate-900 text-white px-2.5 sm:px-6 py-2 sm:py-2.5 shadow-md sticky top-0 z-20 flex flex-row justify-between items-center gap-2 border-b border-amber-500/30 w-full">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
          <Logo size="sm" />
          <AwqafBadge variant="compact" />
          <div className="min-w-0 flex-1 text-right">
            <h1 className="text-[11px] xs:text-xs sm:text-lg font-black text-amber-300 leading-tight line-clamp-2 break-words whitespace-normal">
              {comp.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] xs:text-[11px] sm:text-xs text-emerald-100 leading-tight mt-0.5">
              <span className="font-bold leading-tight line-clamp-2 break-words whitespace-normal">
                المقيم: {evaluator.name}
              </span>
              {assignedLevels.length > 0 && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-800/80 text-amber-200 font-bold text-[10px]">
                  {assignedLevels.map(l => l.name).join(' ، ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-4 py-1.5 sm:py-2 bg-red-600/90 hover:bg-red-700 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-black shrink-0 shadow-sm cursor-pointer"
          title="تسجيل الخروج"
        >
          <LogOut size={16} />
          <span>خروج</span>
        </button>
      </header>

      <main className="p-2.5 sm:p-6 max-w-5xl mx-auto space-y-3.5 sm:space-y-5 w-full">
        {/* تنبيه التقييمات المعتمدة المحفوظة بانتظار عودة الإنترنت */}
        {pendingCloudEvals.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 dark:border-amber-700 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                <WifiOff size={18} />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                  يوجد ({pendingCloudEvals.length}) تقييم معتمد محفوظ في جهازك بانتظار الرفع للسحابة
                </p>
                <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
                  {isOnline
                    ? 'الاتصال متوفر حالياً — يتم الرفع تلقائياً أو يمكنك الضغط على زر الرفع الآن.'
                    : 'الاتصال بالإنترنت منقطع حالياً — جميع التقييمات المعتمدة محفوظة بأمان وسيتم رفعها تلقائياً فور عودة الإنترنت.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleManualFlushPending}
              disabled={isSyncingPending}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-black text-xs flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition active:scale-95"
            >
              <RefreshCw
                size={14}
                className={isSyncingPending ? 'animate-spin' : ''}
              />
              <span>
                {isSyncingPending ? 'جاري الرفع...' : 'رفع التقييمات المعلقة الآن'}
              </span>
            </button>
          </div>
        )}

        {/* ملخص سريع للمستويات المسندة وإعدادات الأسطر والمقاطع المعتمدة من المشرف */}
        <div className="bg-gradient-to-l from-emerald-900 via-emerald-800 to-teal-900 text-white p-3.5 sm:p-5 rounded-2xl shadow-md border border-emerald-700/60 text-right">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5 text-right flex flex-col items-start">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[11px] font-black">
                <Sparkles size={13} className="shrink-0" />
                <span>تحكيم مباشر بالمقاطع القرآنية المظللة</span>
              </div>
              <h2 className="text-base sm:text-xl font-black text-white">
                مرحبا بك {evaluator.name}
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-white/15">
                <span className="block text-[10px] text-emerald-200 font-bold truncate">
                  إجمالي طلابك
                </span>
                <span className="text-base sm:text-xl font-black text-white">
                  {myLevelParticipants.length}
                </span>
              </div>
              <div className="bg-amber-500/25 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-amber-400/40">
                <span className="block text-[10px] text-amber-200 font-bold truncate">
                  قيد التقييم (محلي)
                </span>
                <span className="text-base sm:text-xl font-black text-amber-300">
                  {inProgressForMeCount}
                </span>
              </div>
              <div className="bg-slate-500/25 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-slate-300/25">
                <span className="block text-[10px] text-slate-200 font-bold truncate">
                  بانتظار الاعتماد
                </span>
                <span className="text-base sm:text-xl font-black text-slate-100">
                  {pendingForMeCount}
                </span>
              </div>
              <div className="bg-emerald-500/25 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-emerald-400/30">
                <span className="block text-[10px] text-emerald-100 font-bold truncate">
                  مكتمل ومعتمد
                </span>
                <span className="text-base sm:text-xl font-black text-emerald-300">
                  {evaluatedByMeCount}
                </span>
              </div>
            </div>
          </div>

          {/* عرض المستويات المسندة مع تفاصيل الأسطر الفعلية المحددة من المشرف */}
          {assignedLevels.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/15 flex flex-wrap items-center justify-start gap-1.5 sm:gap-2 text-right">
              <span className="text-[11px] font-black text-amber-300">
                إعدادات مستوياتك المعتمدة من المشرف:
              </span>
              {assignedLevels.map(lvl => (
                <span
                  key={lvl.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 text-white text-[11px] font-bold border border-white/15"
                >
                  <BookOpen size={12} className="text-amber-300 shrink-0" />
                  <span>{lvl.name}:</span>
                  <strong className="text-amber-300">
                    {lvl.segmentsCount} مقاطع × {lvl.linesPerSegment} أسطر فعلية
                  </strong>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* شريط البحث والفلترة */}
        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
          {/* فلترة المستويات إذا كان للمقيم أكثر من مستوى */}
          {assignedLevels.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedLevelId('all')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                  selectedLevelId === 'all'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                جميع مستوياتي ({myLevelParticipants.length})
              </button>
              {assignedLevels.map(lvl => {
                const count = myLevelParticipants.filter(
                  p => Number(p.levelId) === Number(lvl.id)
                ).length;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setSelectedLevelId(lvl.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                      Number(selectedLevelId) === Number(lvl.id)
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {lvl.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* حقل البحث عن طالب */}
            <div className="relative flex-1">
              <Search
                size={17}
                className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن اسم المتسابق..."
                className="w-full min-h-[44px] pr-10 pl-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* أزرار تصفية حالة التقييم */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate ${
                  statusFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                الكل ({myLevelParticipants.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('in_progress')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate flex items-center justify-center gap-1.5 ${
                  statusFilter === 'in_progress'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span>قيد التقييم ({inProgressForMeCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate ${
                  statusFilter === 'pending'
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                غير معتمد ({pendingForMeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('evaluated')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate flex items-center justify-center gap-1.5 ${
                  statusFilter === 'evaluated'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>معتمد ({evaluatedByMeCount})</span>
              </button>
            </div>
          </div>

          {/* دليل الألوان للدوائر التوضيحية */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span className="font-black text-slate-500 dark:text-slate-400">
              دليل حالة المتسابق:
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30 shrink-0" />
              <span>مكتمل ومعتمد نهائياً</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-500/30 shrink-0" />
              <span>تم تقييم بعض/كل المقاطع محلياً ولم يُعتمد بعد</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-slate-300/30 shrink-0" />
              <span>لم يبدأ التقييم بعد</span>
            </span>
          </div>

          {/* شبكة بطاقات المتسابقين */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 w-full">
            {filteredParticipants.map(p => {
              const level = (comp.levels || []).find(
                l => Number(l.id) === Number(p.levelId)
              );

              // تقييم هذا المقيم تحديداً لهذا الطالب
              const myEval = (comp.evaluations || []).find(
                ev =>
                  Number(ev.participantId) === Number(p.id) &&
                  Number(ev.evaluatorId) === Number(evaluator.id)
              );

              // جميع التقييمات المرصودة لهذا الطالب من كافة المقيمين
              const allStudentEvals = (comp.evaluations || []).filter(
                ev => Number(ev.participantId) === Number(p.id)
              );

              const hasEvaluated = !!myEval;
              const draftStatus = participantDraftMap[Number(p.id)];
              const hasLocalDraft =
                !hasEvaluated && Boolean(draftStatus?.hasDraft);
              const isQueuedOffline = pendingCloudEvals.some(
                item => Number(item.evaluation?.participantId) === Number(p.id)
              );

              const isStudentUnmemorized =
                p.isUnmemorized ||
                myEval?.isUnmemorized ||
                allStudentEvals.some(ev => ev.isUnmemorized);

              const isEditAllowed = (evaluator.allowedEditLevelIds || [])
                .map(Number)
                .includes(Number(p.levelId));

              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedParticipantId(p.id)}
                  className={`w-full max-w-full min-w-0 overflow-hidden flex flex-col justify-between gap-2.5 text-right p-3.5 sm:p-4 rounded-2xl border-2 transition-all active:scale-[0.99] cursor-pointer ${
                    isStudentUnmemorized
                      ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/60 hover:bg-red-50'
                      : hasEvaluated
                      ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-800 hover:bg-emerald-100/70'
                      : hasLocalDraft
                      ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-700 hover:bg-amber-100/60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-emerald-500 hover:shadow-md'
                  }`}
                >
                  {/* 1. الدائرة الملونة + الاسم الكامل للمتسابق + اسم المستوى */}
                  <div className="w-full min-w-0 text-right space-y-1">
                    <div className="flex items-start justify-between gap-2 w-full min-w-0">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {/* الدائرة التوضيحية لحالة التقييم: خضراء للمعتمد، برتقالية للمحفوظ محلياً غير المعتمد، رمادية لغير المبدوء */}
                        <span
                          className={`w-3.5 h-3.5 rounded-full shrink-0 transition-all ${
                            hasEvaluated
                              ? 'bg-emerald-500 ring-4 ring-emerald-500/25 shadow-xs'
                              : hasLocalDraft
                              ? 'bg-amber-500 ring-4 ring-amber-500/25 shadow-xs animate-pulse'
                              : 'bg-slate-300 dark:bg-slate-600 ring-4 ring-slate-300/20 dark:ring-slate-700/30'
                          }`}
                          title={
                            hasEvaluated
                              ? 'تم إكمال التقييم واعتماده نهائياً'
                              : hasLocalDraft
                              ? `تم تقييم (${draftStatus?.completedSegmentsCount || 0}/${draftStatus?.totalSegmentsCount || level?.segmentsCount || 3}) مقاطع محلياً ولم يُعتمد بعد`
                              : 'لم يبدأ التقييم بعد'
                          }
                        />
                        <span className="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-snug break-words whitespace-normal flex-1 min-w-0">
                          {p.name}
                        </span>
                      </div>
                      {isStudentUnmemorized && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600 text-white text-[11px] font-black shrink-0 shadow-xs">
                          <AlertTriangle size={12} />
                          <span>غير حافظ</span>
                        </span>
                      )}
                    </div>

                    <span className="block text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 leading-snug break-words whitespace-normal pr-6">
                      {level?.name || 'مستوى عام'}
                    </span>
                  </div>

                  {/* 2. شريط النتيجة وحالة الاعتماد في سطر مستقل مريح بعرض البطاقة */}
                  {hasEvaluated ? (
                    <div className="w-full flex flex-wrap items-center justify-between gap-1.5 bg-white/85 dark:bg-slate-900/60 px-2.5 py-2 rounded-xl border border-emerald-200/80 dark:border-slate-700/80">
                      {myEval.isUnmemorized ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-600 text-white text-xs font-black shadow-xs">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>غير حافظ (0 / {level?.maxScore || 100})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-xs">
                          <CheckCircle size={14} className="shrink-0" />
                          <span>
                            درجتك: {myEval.totalScore} / {level?.maxScore || 100}
                          </span>
                        </span>
                      )}

                      <div className="flex flex-wrap items-center gap-1">
                        {isQueuedOffline && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/80 px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700">
                            <WifiOff size={10} className="shrink-0" />
                            <span>بانتظار الإنترنت للرفع</span>
                          </span>
                        )}
                        {isEditAllowed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-900 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 shadow-2xs">
                            <Unlock size={11} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                            <span>التعديل مأذون</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-800">
                            <Lock size={11} className="text-amber-700 dark:text-amber-400 shrink-0" />
                            <span>معتمد ومقفل</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : hasLocalDraft ? (
                    <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-amber-100/80 dark:bg-amber-950/60 px-2.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700">
                      <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-black text-amber-900 dark:text-amber-200">
                        <Clock size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>
                          {draftStatus?.isAllSegmentsCompleted
                            ? `اكتملت المقاطع (${draftStatus.completedSegmentsCount}/${draftStatus.totalSegmentsCount}) — بانتظار الاعتماد النهائي`
                            : `تم تقييم (${draftStatus?.completedSegmentsCount || 0} من ${draftStatus?.totalSegmentsCount || level?.segmentsCount || 3}) مقاطع — غير معتمد`}
                        </span>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-black shrink-0 shadow-2xs">
                        متابعة التقييم ←
                      </span>
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        بانتظار رصد التقييم
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black shrink-0 shadow-2xs">
                        ابدأ التقييم ←
                      </span>
                    </div>
                  )}

                  {myEval?.notes && (
                    <div className="w-full min-w-0 text-xs text-slate-700 dark:text-slate-300 bg-amber-50/80 dark:bg-slate-900/60 border border-amber-200 dark:border-slate-700 p-2 rounded-xl flex items-start gap-1.5 font-bold overflow-hidden">
                      <MessageSquare size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span className="break-words whitespace-normal min-w-0 flex-1">
                        ملاحظتك: {myEval.notes}
                      </span>
                    </div>
                  )}

                  {/* 3. تفاصيل المقاطع والأجزاء وعدد المقيمين */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-[11px] text-slate-600 dark:text-slate-300 w-full min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-black bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-lg">
                        🎯 {level?.segmentsCount || 3} مقاطع ×{' '}
                        {level?.linesPerSegment || 7} أسطر فعلية
                      </span>
                      {(p.juzsOrSurahs || level?.juzsOrSurahs) && (
                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg font-bold break-words">
                          📖 {formatJuzsOrSurahsDisplay(p.juzsOrSurahs || level?.juzsOrSurahs)}
                        </span>
                      )}
                    </div>

                    {allStudentEvals.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black shrink-0"
                        title="عدد المقيمين الذين قاموا بتقييم هذا المتسابق"
                      >
                        <Users size={12} className="shrink-0" />
                        <span>قيّمه {allStudentEvals.length} مقيم</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {filteredParticipants.length === 0 && (
              <div className="col-span-full p-8 text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm">
                لا يوجد متسابقون مطابقون للبحث أو الفلتر المحدد حالياً.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

