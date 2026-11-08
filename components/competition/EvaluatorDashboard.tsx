import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../../App';
import { CompetitionEvaluator } from '../../types';
import {
  LogOut,
  CheckCircle,
  Search,
  BookOpen,
  Users,
  Sparkles,
  Award,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import ParticipantEvaluation from './ParticipantEvaluation';
import { Logo, AwqafBadge } from '../Logo';
import { formatJuzsOrSurahsDisplay } from '../../utils/juzUtils';

export default function EvaluatorDashboard({
  evaluatorUser,
  onLogout,
}: {
  evaluatorUser: any;
  onLogout: () => void;
}) {
  const context = useContext(AppContext);
  if (!context) return null;

  const { competitions } = context;

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
    'all' | 'pending' | 'evaluated'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

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

      if (statusFilter === 'evaluated' && !hasMyEval) return false;
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

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-white/15">
                <span className="block text-[10px] text-emerald-200 font-bold truncate">
                  إجمالي طلابك
                </span>
                <span className="text-base sm:text-xl font-black text-white">
                  {myLevelParticipants.length}
                </span>
              </div>
              <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-amber-400/30">
                <span className="block text-[10px] text-amber-200 font-bold truncate">
                  بانتظار تقييمك
                </span>
                <span className="text-base sm:text-xl font-black text-amber-300">
                  {pendingForMeCount}
                </span>
              </div>
              <div className="bg-emerald-500/25 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-2 text-center border border-emerald-400/30">
                <span className="block text-[10px] text-emerald-100 font-bold truncate">
                  تم تقييمهم
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
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
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
                onClick={() => setStatusFilter('pending')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate ${
                  statusFilter === 'pending'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                بانتظارك ({pendingForMeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('evaluated')}
                className={`min-h-[38px] px-2 sm:px-3 py-1 rounded-lg font-black text-[11px] sm:text-xs transition cursor-pointer truncate ${
                  statusFilter === 'evaluated'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                تم تقييمهم ({evaluatedByMeCount})
              </button>
            </div>
          </div>

          {/* شبكة بطاقات المتسابقين */}
          <div className="grid gap-3 sm:grid-cols-2 pt-2">
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

              const isStudentUnmemorized =
                p.isUnmemorized ||
                myEval?.isUnmemorized ||
                allStudentEvals.some(ev => ev.isUnmemorized);

              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedParticipantId(p.id)}
                  className={`min-h-[112px] flex flex-col justify-between text-right p-4 rounded-2xl border-2 transition-all active:scale-[0.98] cursor-pointer ${
                    isStudentUnmemorized
                      ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/60 hover:bg-red-50'
                      : hasEvaluated
                      ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-800 hover:bg-emerald-100/70'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-emerald-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start w-full gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-base sm:text-lg text-slate-900 dark:text-white block">
                          {p.name}
                        </span>
                        {isStudentUnmemorized && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600 text-white text-[11px] font-black shrink-0 shadow-xs">
                            <AlertTriangle size={12} />
                            <span>غير حافظ</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {level?.name || 'مستوى عام'}
                      </span>
                    </div>

                    {hasEvaluated ? (
                      myEval.isUnmemorized ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-600 text-white text-xs font-black shrink-0 shadow-xs">
                          <AlertTriangle size={13} />
                          <span>غير حافظ (0)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-xs font-black shrink-0 shadow-xs">
                          <CheckCircle size={14} />
                          <span>
                            درجتك: {myEval.totalScore} / {level?.maxScore || 100}
                          </span>
                        </span>
                      )
                    ) : (
                      <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-xs font-black shrink-0 border border-amber-300/60 dark:border-amber-800">
                        ابدأ التقييم
                      </span>
                    )}
                  </div>

                  {myEval?.notes && (
                    <div className="w-full mb-2.5 text-xs text-slate-700 dark:text-slate-300 bg-amber-50/80 dark:bg-slate-900/60 border border-amber-200 dark:border-slate-700 p-2 rounded-xl flex items-start gap-1.5 font-bold">
                      <MessageSquare size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span className="truncate">ملاحظتك: {myEval.notes}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 text-[11px] text-slate-600 dark:text-slate-300 w-full">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-black bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-lg">
                        🎯 {level?.segmentsCount || 3} مقاطع ×{' '}
                        {level?.linesPerSegment || 7} أسطر فعلية
                      </span>
                      {(p.juzsOrSurahs || level?.juzsOrSurahs) && (
                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg font-bold truncate max-w-[190px]">
                          📖 {formatJuzsOrSurahsDisplay(p.juzsOrSurahs || level?.juzsOrSurahs)}
                        </span>
                      )}
                    </div>

                    {allStudentEvals.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black"
                        title="عدد المقيمين الذين قاموا بتقييم هذا المتسابق"
                      >
                        <Users size={12} />
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
