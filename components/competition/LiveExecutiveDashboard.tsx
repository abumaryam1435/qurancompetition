import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Crown,
  Filter,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Pause,
  PieChart,
  Play,
  RefreshCw,
  ShieldAlert,
  Sun,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Competition, CompetitionLevel } from '../../types';
import { OfficialBannerCrestsBand } from './EvaluatorReportHeader';
import {
  formatJuzsOrSurahsDisplay,
  resolveLevelCommittees,
  resolveParticipantCommitteeId,
} from '../../utils/juzUtils';
import {
  LiveBroadcastRoomDoc,
  isBroadcastRoomCurrentlyLive,
  subscribeToBroadcastRoom,
} from '../../utils/liveBroadcastWebRTC';
import LiveBroadcastViewerStage from './LiveBroadcastViewerStage';

interface LiveExecutiveDashboardProps {
  competitionId: string;
  token: string;
  competitions: Competition[];
  isLoadingFirebase: boolean;
  firebaseConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'offline';
  darkMode: boolean;
  onToggleDarkMode: () => void;
  /** عند فتح المعاينة من داخل لوحة المشرف */
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
}

interface ComputedParticipantResult {
  id: number;
  name: string;
  levelId: number;
  levelName: string;
  committeeId?: number;
  wilayat: string;
  gender: string;
  maxScore: number;
  evaluationsCount: number;
  averageScore: number | null;
  percentage: number | null;
  isUnmemorized: boolean;
  latestEvalTimestamp: number;
  gradeKey:
    | 'honor'
    | 'excellent'
    | 'very_good'
    | 'good'
    | 'acceptable'
    | 'unmemorized'
    | 'pending';
  gradeLabel: string;
  rankInLevel: number | null;
}

interface LevelAnalytics {
  level: CompetitionLevel;
  levelIndex: number;
  totalParticipants: number;
  evaluatedCount: number;
  memorizedEvaluatedCount: number;
  unmemorizedCount: number;
  pendingCount: number;
  completionRate: number;
  averageScore: number | null;
  averagePercentage: number | null;
  highestScore: number | null;
  totalSubmissions: number;
  maleCount: number;
  femaleCount: number;
  committees: {
    id: number;
    name: string;
    total: number;
    evaluated: number;
    rate: number;
  }[];
  topPerformers: ComputedParticipantResult[];
}

interface DemographicSegment {
  name: string;
  total: number;
  sharePct: number;
  evaluated: number;
  pending: number;
  unmemorized: number;
  completionRate: number;
  averagePct: number | null;
  color: string;
  darkColor: string;
}

const LEVEL_ACCENT_HEX = [
  '#065F46', // Emerald 800
  '#1D4ED8', // Blue 700
  '#B45309', // Amber 700
  '#6D28D9', // Violet 700
  '#0F766E', // Teal 700
  '#BE123C', // Rose 700
  '#3730A3', // Indigo 800
  '#0369A1', // Sky 700
];

const WILAYAT_BAR_COLORS = [
  '#0F766E',
  '#1D4ED8',
  '#B45309',
  '#6D28D9',
  '#047857',
  '#0369A1',
  '#BE123C',
  '#4338CA',
];

const GRADE_META: {
  key: 'honor' | 'excellent' | 'very_good' | 'good' | 'acceptable' | 'unmemorized';
  label: string;
  color: string;
  darkColor: string;
}[] = [
  { key: 'honor', label: 'ممتاز مع مرتبة الشرف', color: '#D97706', darkColor: '#F59E0B' },
  { key: 'excellent', label: 'ممتاز', color: '#059669', darkColor: '#10B981' },
  { key: 'very_good', label: 'جيد جداً', color: '#0284C7', darkColor: '#38BDF8' },
  { key: 'good', label: 'جيد', color: '#4F46E5', darkColor: '#818CF8' },
  { key: 'acceptable', label: 'مقبول', color: '#EA580C', darkColor: '#FB923C' },
  { key: 'unmemorized', label: 'غير حافظ', color: '#DC2626', darkColor: '#F87171' },
];

function classifyGrade(
  percentage: number | null,
  isUnmemorized: boolean,
  hasEval: boolean
): { key: ComputedParticipantResult['gradeKey']; label: string } {
  if (isUnmemorized) return { key: 'unmemorized', label: 'غير حافظ' };
  if (!hasEval || percentage === null) return { key: 'pending', label: 'بانتظار التقييم' };
  if (percentage >= 97) return { key: 'honor', label: 'ممتاز مع مرتبة الشرف' };
  if (percentage >= 90) return { key: 'excellent', label: 'ممتاز' };
  if (percentage >= 80) return { key: 'very_good', label: 'جيد جداً' };
  if (percentage >= 70) return { key: 'good', label: 'جيد' };
  return { key: 'acceptable', label: 'مقبول' };
}

function normalizeGenderCategory(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'غير محدد';
  if (s.includes('أنث') || s.includes('انث') || s.includes('بنات') || s.includes('إناث') || s.includes('اناث')) {
    return 'إناث';
  }
  if (s.includes('ذكر') || s.includes('ذكور') || s.includes('بنين') || s.includes('أولاد')) {
    return 'ذكور';
  }
  return s;
}

function formatArabicClock(date: Date): string {
  try {
    return date.toLocaleTimeString('ar-OM', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toTimeString().slice(0, 8);
  }
}

function formatArabicDate(date: Date): string {
  try {
    return date.toLocaleDateString('ar-OM', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return date.toLocaleDateString();
  }
}

function formatRelativeArabicTime(timestamp: number, nowMs: number): string {
  if (!timestamp || timestamp <= 0) return '—';
  const diffSec = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  return new Date(timestamp).toLocaleDateString('ar-OM', {
    month: 'short',
    day: 'numeric',
  });
}

export const LiveExecutiveDashboard: React.FC<LiveExecutiveDashboardProps> = ({
  competitionId,
  token,
  competitions,
  isLoadingFirebase,
  firebaseConnectionStatus,
  darkMode,
  onToggleDarkMode,
  isPreviewMode = false,
  onExitPreview,
}) => {
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all');
  const [selectedWilayat, setSelectedWilayat] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [isTvMode, setIsTvMode] = useState<boolean>(false);
  const [autoCycleLevels, setAutoCycleLevels] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  const [justUpdatedFlash, setJustUpdatedFlash] = useState<boolean>(false);
  const [broadcastRoom, setBroadcastRoom] = useState<LiveBroadcastRoomDoc | null>(null);
  const prevEvalCountRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // الاستماع اللحظي لحالة البث المباشر (صوت وصورة) لهذه المسابقة
  useEffect(() => {
    if (!competitionId) return;
    const unsub = subscribeToBroadcastRoom(competitionId, room => {
      setBroadcastRoom(room);
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [competitionId]);

  // تحديث الساعة الحقيقية كل ثانية لشاشات العرض الرسمية
  useEffect(() => {
    const timer = window.setInterval(() => setNowClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // متابعة حالة ملء الشاشة
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const target = rootRef.current || document.documentElement;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      setIsTvMode(prev => !prev);
    }
  };

  // البحث عن المسابقة المطابقة للرابط
  const comp = useMemo(
    () => competitions.find(c => String(c.id) === String(competitionId)) || null,
    [competitions, competitionId]
  );

  // تحديث عنوان المتصفح باسم المسابقة عند الفتح المستقل
  useEffect(() => {
    if (!isPreviewMode && comp?.name) {
      document.title = `المتابعة المباشرة — ${comp.name}`;
    }
  }, [comp?.name, isPreviewMode]);

  // وميض ذهبي خفيف عند وصول تقييم جديد لحظياً من المقيمين
  const totalRawEvals = comp?.evaluations?.length ?? 0;
  useEffect(() => {
    if (prevEvalCountRef.current !== null && totalRawEvals !== prevEvalCountRef.current) {
      setJustUpdatedFlash(true);
      const t = window.setTimeout(() => setJustUpdatedFlash(false), 2600);
      prevEvalCountRef.current = totalRawEvals;
      return () => window.clearTimeout(t);
    }
    prevEvalCountRef.current = totalRawEvals;
  }, [totalRawEvals]);

  // التبديل التلقائي بين المستويات في وضع شاشة العرض الكبيرة
  useEffect(() => {
    if (!autoCycleLevels || !comp || (comp.levels || []).length === 0) return;
    const sequence: (number | 'all')[] = ['all', ...(comp.levels || []).map(l => l.id)];
    const interval = window.setInterval(() => {
      setSelectedLevelId(prev => {
        const idx = sequence.indexOf(prev);
        return sequence[(idx + 1) % sequence.length];
      });
    }, 12000);
    return () => window.clearInterval(interval);
  }, [autoCycleLevels, comp]);

  // حساب التحليلات والنتائج وبيانات المتسابقين الديموغرافية (الجنس، الولاية، المستويات، اللجان)
  const analytics = useMemo(() => {
    if (!comp) return null;

    const levels = comp.levels || [];
    const evaluations = comp.evaluations || [];

    const baseParticipants = [...(comp.participants || [])];
    const seenIds = new Set(baseParticipants.map(p => String(p.id)));
    evaluations.forEach((ev, idx) => {
      const pIdStr = String(ev.participantId);
      if (pIdStr && !seenIds.has(pIdStr)) {
        seenIds.add(pIdStr);
        baseParticipants.push({
          id: Number(ev.participantId) || Date.now() + idx,
          name: (ev as any).participantName || `متسابق #${idx + 1}`,
          levelId: Number(ev.levelId) || levels[0]?.id || 1,
          isUnmemorized: Boolean(ev.isUnmemorized),
        });
      }
    });

    const evalsByParticipant = new Map<string, typeof evaluations>();
    let latestTimestamp = 0;
    evaluations.forEach(ev => {
      const key = String(ev.participantId);
      const arr = evalsByParticipant.get(key) || [];
      arr.push(ev);
      evalsByParticipant.set(key, arr);
      if (Number(ev.timestamp) > latestTimestamp) {
        latestTimestamp = Number(ev.timestamp);
      }
    });

    const levelsMap = new Map<number, CompetitionLevel>();
    const committeesByLevelId = new Map<number, ReturnType<typeof resolveLevelCommittees>>();
    levels.forEach(l => {
      levelsMap.set(Number(l.id), l);
      committeesByLevelId.set(
        Number(l.id),
        resolveLevelCommittees(l, comp.evaluators || [])
      );
    });

    const allResults: ComputedParticipantResult[] = baseParticipants.map(p => {
      const pEvals = evalsByParticipant.get(String(p.id)) || [];
      const level =
        levelsMap.get(Number(p.levelId)) ||
        (pEvals[0]?.levelId ? levelsMap.get(Number(pEvals[0].levelId)) : undefined) ||
        levels[0];
      const maxScore = Number(level?.maxScore || 100);

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
          ? Number(
              (
                numericScores.reduce((sum, val) => sum + val, 0) / pEvals.length
              ).toFixed(2)
            )
          : null;
      const percentage =
        avgScore !== null && maxScore > 0
          ? Number(((avgScore / maxScore) * 100).toFixed(1))
          : null;

      const latestEvalTimestamp = pEvals.reduce(
        (max, ev) => Math.max(max, Number(ev.timestamp || 0)),
        0
      );

      const grade = classifyGrade(percentage, isUnmemorized, pEvals.length > 0);
      const effectiveLevelId = level?.id ?? p.levelId;
      const levelCommittees = committeesByLevelId.get(Number(effectiveLevelId)) || [];
      const resolvedCommId =
        levelCommittees.length > 0
          ? resolveParticipantCommitteeId(p, levelCommittees)
          : p.committeeId;

      return {
        id: p.id,
        name: p.name,
        levelId: Number(effectiveLevelId),
        levelName: level?.name || 'غير مصنف',
        committeeId: resolvedCommId,
        wilayat: (p.wilayat || '').trim(),
        gender: normalizeGenderCategory(p.gender || ''),
        maxScore,
        evaluationsCount: pEvals.length,
        averageScore: avgScore,
        percentage,
        isUnmemorized,
        latestEvalTimestamp,
        gradeKey: grade.key,
        gradeLabel: grade.label,
        rankInLevel: null,
      };
    });

    // استخراج قوائم الفلاتر المتاحة للولايات والجنس
    const availableWilayats = Array.from(
      new Set(allResults.map(r => r.wilayat).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ar'));
    const availableGenders = Array.from(
      new Set(allResults.map(r => r.gender).filter(g => g && g !== 'غير محدد'))
    );

    // تطبيق فلاتر الولاية والجنس على المجموعة (لتنعكس على المستويات والأوائل والرسوم)
    const demographicFiltered = allResults.filter(r => {
      if (selectedWilayat !== 'all' && r.wilayat !== selectedWilayat) return false;
      if (selectedGender !== 'all' && r.gender !== selectedGender) return false;
      return true;
    });

    const topCount = Math.max(1, Math.min(20, Number(comp.liveShare?.topPerformersCount || 3)));

    // حساب إحصائيات كل مستوى + ترتيب الأوائل لكل مستوى + اللجان + أعداد الذكور والإناث
    const levelStats: LevelAnalytics[] = levels.map((lvl, idx) => {
      const lvlResults = demographicFiltered.filter(
        r => Number(r.levelId) === Number(lvl.id)
      );
      const evaluated = lvlResults.filter(r => r.evaluationsCount > 0 || r.isUnmemorized);
      const unmemorized = lvlResults.filter(r => r.isUnmemorized);
      const memorizedEvaluated = lvlResults
        .filter(r => r.evaluationsCount > 0 && r.averageScore !== null && !r.isUnmemorized)
        .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

      memorizedEvaluated.forEach((item, rankIdx) => {
        item.rankInLevel = rankIdx + 1;
      });

      const pendingCount = Math.max(0, lvlResults.length - evaluated.length);
      const completionRate =
        lvlResults.length > 0
          ? Number(((evaluated.length / lvlResults.length) * 100).toFixed(1))
          : 0;

      const avgScore =
        memorizedEvaluated.length > 0
          ? Number(
              (
                memorizedEvaluated.reduce((s, r) => s + (r.averageScore || 0), 0) /
                memorizedEvaluated.length
              ).toFixed(2)
            )
          : null;
      const avgPct =
        memorizedEvaluated.length > 0
          ? Number(
              (
                memorizedEvaluated.reduce((s, r) => s + (r.percentage || 0), 0) /
                memorizedEvaluated.length
              ).toFixed(1)
            )
          : null;

      const highestScore =
        memorizedEvaluated.length > 0 ? memorizedEvaluated[0].averageScore : null;
      const totalSubmissions = lvlResults.reduce((s, r) => s + r.evaluationsCount, 0);

      const maleCount = lvlResults.filter(r => r.gender === 'ذكور').length;
      const femaleCount = lvlResults.filter(r => r.gender === 'إناث').length;

      const resolvedCommittees = committeesByLevelId.get(Number(lvl.id)) || [];
      const committees =
        resolvedCommittees.length > 1
          ? resolvedCommittees.map(cm => {
              const cmParticipants = lvlResults.filter(
                r => Number(r.committeeId) === Number(cm.id)
              );
              const cmEvaluated = cmParticipants.filter(
                r => r.evaluationsCount > 0 || r.isUnmemorized
              );
              return {
                id: cm.id,
                name: cm.name,
                total: cmParticipants.length,
                evaluated: cmEvaluated.length,
                rate:
                  cmParticipants.length > 0
                    ? Number(((cmEvaluated.length / cmParticipants.length) * 100).toFixed(1))
                    : 0,
              };
            })
          : [];

      return {
        level: lvl,
        levelIndex: idx,
        totalParticipants: lvlResults.length,
        evaluatedCount: evaluated.length,
        memorizedEvaluatedCount: memorizedEvaluated.length,
        unmemorizedCount: unmemorized.length,
        pendingCount,
        completionRate,
        averageScore: avgScore,
        averagePercentage: avgPct,
        highestScore,
        totalSubmissions,
        maleCount,
        femaleCount,
        committees,
        topPerformers: memorizedEvaluated.slice(0, topCount),
      };
    });

    // تطبيق فلتر المستوى بالإضافة لفلاتر الولاية والجنس
    const scopedResults =
      selectedLevelId === 'all'
        ? demographicFiltered
        : demographicFiltered.filter(r => Number(r.levelId) === Number(selectedLevelId));

    const totalParticipants = scopedResults.length;
    const evaluatedParticipants = scopedResults.filter(
      r => r.evaluationsCount > 0 || r.isUnmemorized
    ).length;
    const unmemorizedParticipants = scopedResults.filter(r => r.isUnmemorized).length;
    const pendingParticipants = Math.max(0, totalParticipants - evaluatedParticipants);
    const overallCompletionRate =
      totalParticipants > 0
        ? Number(((evaluatedParticipants / totalParticipants) * 100).toFixed(1))
        : 0;

    const memorizedScored = scopedResults.filter(
      r => r.evaluationsCount > 0 && r.averageScore !== null && !r.isUnmemorized
    );
    const overallAveragePct =
      memorizedScored.length > 0
        ? Number(
            (
              memorizedScored.reduce((s, r) => s + (r.percentage || 0), 0) /
              memorizedScored.length
            ).toFixed(1)
          )
        : null;

    const totalEvaluationsSubmissions = scopedResults.reduce(
      (s, r) => s + r.evaluationsCount,
      0
    );

    const activeEvaluatorIds = new Set(evaluations.map(e => Number(e.evaluatorId)));
    const totalEvaluators = (comp.evaluators || []).length;
    const totalCommittees = levels.reduce((acc, lvl) => {
      const comms = committeesByLevelId.get(Number(lvl.id)) || [];
      return acc + Math.max(1, comms.length);
    }, 0);

    // توزيع التقديرات
    const gradeCounts: Record<string, number> = {
      honor: 0,
      excellent: 0,
      very_good: 0,
      good: 0,
      acceptable: 0,
      unmemorized: 0,
    };
    scopedResults.forEach(r => {
      if (r.gradeKey !== 'pending') {
        gradeCounts[r.gradeKey] = (gradeCounts[r.gradeKey] || 0) + 1;
      }
    });
    const gradedTotal = Object.values(gradeCounts).reduce((a, b) => a + b, 0);

    // بناء تحليلات ديموغرافية شاملة (الولاية والجنس)
    const buildDemographicSegments = (
      items: ComputedParticipantResult[],
      extractor: (r: ComputedParticipantResult) => string,
      colorFn: (label: string, idx: number) => { color: string; darkColor: string }
    ): DemographicSegment[] => {
      const map = new Map<
        string,
        { total: number; evaluated: number; unmemorized: number; pctSum: number; pctCount: number }
      >();
      items.forEach(r => {
        const key = extractor(r) || 'غير محدد';
        const cur = map.get(key) || {
          total: 0,
          evaluated: 0,
          unmemorized: 0,
          pctSum: 0,
          pctCount: 0,
        };
        cur.total += 1;
        if (r.evaluationsCount > 0 || r.isUnmemorized) cur.evaluated += 1;
        if (r.isUnmemorized) cur.unmemorized += 1;
        if (r.evaluationsCount > 0 && r.percentage !== null && !r.isUnmemorized) {
          cur.pctSum += r.percentage;
          cur.pctCount += 1;
        }
        map.set(key, cur);
      });

      const grandTotal = items.length || 1;
      return Array.from(map.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, st], idx) => {
          const palette = colorFn(name, idx);
          return {
            name,
            total: st.total,
            sharePct: Number(((st.total / grandTotal) * 100).toFixed(1)),
            evaluated: st.evaluated,
            pending: Math.max(0, st.total - st.evaluated),
            unmemorized: st.unmemorized,
            completionRate:
              st.total > 0 ? Number(((st.evaluated / st.total) * 100).toFixed(1)) : 0,
            averagePct:
              st.pctCount > 0 ? Number((st.pctSum / st.pctCount).toFixed(1)) : null,
            color: palette.color,
            darkColor: palette.darkColor,
          };
        });
    };

    // لإظهار مقارنة الولايات والجنس دائماً بوضوح حتى عند تصفية أحدهما:
    const levelScopedForDemographics =
      selectedLevelId === 'all'
        ? allResults
        : allResults.filter(r => Number(r.levelId) === Number(selectedLevelId));

    const wilayatBreakdown = buildDemographicSegments(
      selectedGender === 'all'
        ? levelScopedForDemographics
        : levelScopedForDemographics.filter(r => r.gender === selectedGender),
      r => r.wilayat || 'غير محدد',
      (_label, idx) => ({
        color: WILAYAT_BAR_COLORS[idx % WILAYAT_BAR_COLORS.length],
        darkColor: WILAYAT_BAR_COLORS[idx % WILAYAT_BAR_COLORS.length],
      })
    );

    const genderBreakdown = buildDemographicSegments(
      selectedWilayat === 'all'
        ? levelScopedForDemographics
        : levelScopedForDemographics.filter(r => r.wilayat === selectedWilayat),
      r => r.gender,
      (label, idx) => {
        if (label === 'ذكور') return { color: '#1D4ED8', darkColor: '#38BDF8' };
        if (label === 'إناث') return { color: '#059669', darkColor: '#34D399' };
        return {
          color: WILAYAT_BAR_COLORS[(idx + 2) % WILAYAT_BAR_COLORS.length],
          darkColor: '#94A3B8',
        };
      }
    );

    // أحدث التقييمات المرصودة
    const recentEvaluations = [...evaluations]
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      .slice(0, 6)
      .map(ev => {
        const lvl = levelsMap.get(Number(ev.levelId));
        const participant = baseParticipants.find(
          p => String(p.id) === String(ev.participantId)
        );
        return {
          id: `${ev.id}-${ev.timestamp}`,
          levelName: lvl?.name || 'مستوى',
          participantName: participant?.name || 'متسابق',
          wilayat: participant?.wilayat || '',
          score: ev.isUnmemorized ? null : Number(ev.totalScore || 0),
          maxScore: Number(lvl?.maxScore || 100),
          isUnmemorized: Boolean(ev.isUnmemorized),
          timestamp: Number(ev.timestamp || 0),
        };
      });

    return {
      levelStats,
      availableWilayats,
      availableGenders,
      totalParticipants,
      evaluatedParticipants,
      unmemorizedParticipants,
      pendingParticipants,
      overallCompletionRate,
      overallAveragePct,
      totalEvaluationsSubmissions,
      totalEvaluators,
      activeEvaluatorsCount: activeEvaluatorIds.size,
      totalCommittees,
      gradeCounts,
      gradedTotal,
      wilayatBreakdown,
      genderBreakdown,
      recentEvaluations,
      latestTimestamp,
      topCount,
    };
  }, [comp, selectedLevelId, selectedWilayat, selectedGender]);

  const isAuthorized = Boolean(
    comp &&
      (isPreviewMode ||
        (comp.liveShare?.enabled && comp.liveShare?.token === token))
  );

  const showTopPerformers = Boolean(comp?.liveShare?.showTopPerformers);

  // حالة التحميل الأولى من السحابة
  if (!comp && isLoadingFirebase) {
    return (
      <div
        ref={rootRef}
        dir="rtl"
        className={`min-h-screen flex flex-col ${
          darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
        }`}
      >
        <OfficialBannerCrestsBand compactMobile={true} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#09152C] text-[#D4AF37] flex items-center justify-center shadow-lg">
            <RefreshCw size={28} className="animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg sm:text-xl font-black">
              جارٍ الاتصال المباشر ببيانات المسابقة...
            </h1>
            <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
              يتم الآن تحميل إحصائيات سير لجان التحكيم والتقييم لحظياً
            </p>
          </div>
        </div>
      </div>
    );
  }

  // حالة إيقاف الرابط من قِبل المشرف أو عدم صلاحية الرمز
  if (!isAuthorized || !comp || !analytics) {
    return (
      <div
        ref={rootRef}
        dir="rtl"
        className={`min-h-screen flex flex-col ${
          darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
        }`}
      >
        <div className="h-2.5 w-full bg-gradient-to-r from-[#09152C] via-[#1C3B70] to-[#09152C] border-b border-[#D4AF37]/70" />
        <OfficialBannerCrestsBand compactMobile={true} />

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div
            className={`max-w-lg w-full rounded-3xl border p-6 sm:p-8 text-center space-y-5 shadow-xl ${
              darkMode
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-white border-amber-200/80'
            }`}
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              {comp && !comp.liveShare?.enabled ? (
                <Lock size={30} />
              ) : (
                <ShieldAlert size={30} />
              )}
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#09152C] dark:text-white">
                {comp && !comp.liveShare?.enabled
                  ? 'تم إيقاف رابط المتابعة المباشرة مؤقتاً'
                  : 'رابط المتابعة غير متاح حالياً'}
              </h1>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                {comp && !comp.liveShare?.enabled
                  ? `قام مشرف المسابقة بإيقاف العرض المباشر لمسابقة «${comp.name}» مؤقتاً. عند إعادة التفعيل ستظهر شاشة المتابعة تلقائياً.`
                  : 'هذا الرابط إما غير مفعّل أو تم تجديد رمزه الأمني من قِبل مشرف المسابقة. يُرجى طلب الرابط المحدّث من المشرف.'}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة</span>
              <span>·</span>
              <span>مسابقة محافظة الظاهرة للقرآن الكريم</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const resolvedSeason =
    comp.seasonText?.trim() || 'الموسم الثالث عشر - لعام 1447 هـ / 2026 م';
  const customSubtitle = comp.liveShare?.customSubtitle?.trim();

  const containerWidth = isTvMode ? 'max-w-[1800px]' : 'max-w-[1440px]';
  const visibleLevels =
    selectedLevelId === 'all'
      ? analytics.levelStats
      : analytics.levelStats.filter(l => Number(l.level.id) === Number(selectedLevelId));

  // دائرة التقدم SVG
  const gaugeRadius = isTvMode ? 62 : 52;
  const gaugeStroke = isTvMode ? 12 : 10;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset =
    gaugeCircumference - (analytics.overallCompletionRate / 100) * gaugeCircumference;

  // مخطط Donut للتقديرات
  const donutRadius = 50;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let cumulativeDonutRatio = 0;
  const donutSegments = GRADE_META.map(g => {
    const count = analytics.gradeCounts[g.key] || 0;
    const ratio = analytics.gradedTotal > 0 ? count / analytics.gradedTotal : 0;
    const startRatio = cumulativeDonutRatio;
    cumulativeDonutRatio += ratio;
    return {
      ...g,
      count,
      pct: analytics.gradedTotal > 0 ? Number((ratio * 100).toFixed(1)) : 0,
      dashArray: `${ratio * donutCircumference} ${donutCircumference}`,
      dashOffset: -startRatio * donutCircumference,
    };
  });

  // مخطط Donut لتوزيع الجنس
  const genderTotal = analytics.genderBreakdown.reduce((s, g) => s + g.total, 0);
  const genderDonutRadius = 46;
  const genderDonutCirc = 2 * Math.PI * genderDonutRadius;
  let genderCum = 0;
  const genderDonutSegments = analytics.genderBreakdown.map(g => {
    const ratio = genderTotal > 0 ? g.total / genderTotal : 0;
    const start = genderCum;
    genderCum += ratio;
    return {
      ...g,
      dashArray: `${ratio * genderDonutCirc} ${genderDonutCirc}`,
      dashOffset: -start * genderDonutCirc,
    };
  });

  const maxWilayatTotal = Math.max(
    1,
    ...analytics.wilayatBreakdown.map(w => w.total)
  );
  const hasActiveFilters =
    selectedLevelId !== 'all' || selectedWilayat !== 'all' || selectedGender !== 'all';

  // هل المشرف فاتح كاميرا البث المباشر حالياً؟ (يعاد تقييمها مع نبض الساعة كل ثانية)
  const isLiveBroadcastActive = Boolean(
    nowClock && broadcastRoom && isBroadcastRoomCurrentlyLive(broadcastRoom)
  );

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        darkMode ? 'bg-[#070E1C] text-slate-100' : 'bg-[#FAF8F5] text-slate-900'
      }`}
    >
      {/* شريط المعاينة للمشرف فقط */}
      {isPreviewMode && (
        <div className="bg-amber-500 text-[#09152C] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-black z-40">
          <div className="flex items-center gap-2">
            <Monitor size={16} />
            <span>
              وضع المعاينة المباشرة (كما يراها مدير الأوقاف والمسؤولون عبر الرابط)
              {!comp.liveShare?.enabled && ' — تنبيه: الرابط متوقف حالياً للزوار الخارجيين'}
            </span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-[#09152C] text-white hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
            >
              <X size={15} />
              <span>إغلاق المعاينة</span>
            </button>
          )}
        </div>
      )}

      {/* الترويسة الرسمية الثلاثية الكاملة */}
      <header className="w-full border-b-2 border-[#D4AF37]/75 shadow-[0_8px_30px_-12px_rgba(9,21,44,0.3)]">
        <div
          aria-hidden="true"
          className="h-2.5 sm:h-3 w-full bg-gradient-to-r from-[#09152C] via-[#1C3B70] to-[#09152C] border-b border-[#D4AF37]/70 flex items-center justify-between overflow-hidden px-3 sm:px-6"
        >
          {Array.from({ length: 38 }).map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-[#F3E5AB]/85 rotate-45 shrink-0"
            />
          ))}
        </div>

        <OfficialBannerCrestsBand compactMobile={true} />

        {/* شريط عنوان المسابقة والموسم والاتصال المباشر */}
        <div className="relative bg-gradient-to-l from-[#09152C] via-[#12284E] to-[#09152C] text-white overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.2),transparent_68%)]"
          />
          <div
            className={`relative ${containerWidth} mx-auto px-3 sm:px-6 lg:px-8 ${
              isTvMode ? 'py-4 sm:py-5' : 'py-3 sm:py-4'
            } flex flex-col lg:flex-row lg:items-center justify-between gap-3`}
          >
            <div className="text-center lg:text-right space-y-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-[#F3E5AB] text-xs sm:text-sm font-black">
                <Award size={16} className="text-[#D4AF37] shrink-0" />
                <span>{resolvedSeason}</span>
                <span aria-hidden="true" className="text-[#D4AF37]/60">
                  ·
                </span>
                <span className="text-emerald-300">
                  لوحة المتابعة المباشرة لسير التقييم
                </span>
              </div>
              <h1
                className={`font-black text-white leading-tight break-words ${
                  isTvMode
                    ? 'text-2xl sm:text-3xl lg:text-4xl'
                    : 'text-lg sm:text-2xl lg:text-[26px]'
                }`}
              >
                {comp.name}
              </h1>
              {customSubtitle && (
                <p className="text-xs sm:text-sm font-bold text-slate-200/90">
                  {customSubtitle}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 shrink-0">
              <div
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2.5 transition-colors ${
                  justUpdatedFlash
                    ? 'bg-[#D4AF37]/25 border-[#D4AF37] text-[#F3E5AB]'
                    : 'bg-white/8 border-white/15 text-slate-100'
                }`}
              >
                {firebaseConnectionStatus === 'connected' ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300 font-black">
                    <Wifi size={14} />
                    <span>تحديث مباشر</span>
                  </span>
                ) : firebaseConnectionStatus === 'connecting' ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-300 font-black">
                    <RefreshCw size={13} className="animate-spin" />
                    <span>جارٍ الاتصال</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-rose-300 font-black">
                    <WifiOff size={14} />
                    <span>غير متصل</span>
                  </span>
                )}
                <span aria-hidden="true" className="text-white/25">
                  |
                </span>
                <span className="font-mono tabular-nums text-white/95">
                  {formatArabicClock(nowClock)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsTvMode(prev => !prev)}
                className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  isTvMode
                    ? 'bg-[#D4AF37] text-[#09152C] border-[#F3E5AB]'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                }`}
                title="تكبير الخطوط والرسوم البيانية لتناسب شاشات العرض الكبيرة"
              >
                <Monitor size={15} />
                <span>{isTvMode ? 'إنهاء وضع الشاشة الكبيرة' : 'وضع شاشة العرض'}</span>
              </button>

              {analytics.levelStats.length > 1 && (
                <button
                  type="button"
                  onClick={() => setAutoCycleLevels(prev => !prev)}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                    autoCycleLevels
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                  }`}
                  title="تبديل تلقائي بين مستويات المسابقة كل 12 ثانية لشاشات العرض"
                >
                  {autoCycleLevels ? <Pause size={14} /> : <Play size={14} />}
                  <span className="hidden sm:inline">
                    {autoCycleLevels ? 'إيقاف العرض التلقائي' : 'عرض تلقائي'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                className="min-h-[40px] min-w-[40px] px-2.5 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white transition flex items-center justify-center cursor-pointer"
                title={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
                aria-label={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              <button
                type="button"
                onClick={onToggleDarkMode}
                className="min-h-[40px] min-w-[40px] px-2.5 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-[#F3E5AB] transition flex items-center justify-center cursor-pointer"
                title={darkMode ? 'التبديل للوضع النهاري' : 'التبديل للوضع الليلي'}
                aria-label={darkMode ? 'التبديل للوضع النهاري' : 'التبديل للوضع الليلي'}
              >
                {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي: إما البث المباشر (صوت وصورة) عند تشغيل المشرف للكاميرا، أو لوحة المؤشرات والرسوم البيانية */}
      <main
        className={`flex-1 w-full ${containerWidth} mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 sm:space-y-6`}
      >
        {isLiveBroadcastActive && broadcastRoom ? (
          <LiveBroadcastViewerStage
            competitionId={comp.id}
            competitionName={comp.name}
            broadcastRoom={broadcastRoom}
            darkMode={darkMode}
            isTvMode={isTvMode}
            summaryStats={{
              completionRate: analytics.overallCompletionRate,
              evaluated: analytics.evaluatedParticipants,
              total: analytics.totalParticipants,
              pending: analytics.pendingParticipants,
            }}
          />
        ) : (
          <>
        {/* شريط التصفية التفاعلي: المستويات + الولاية + الجنس + التاريخ وآخر تحديث */}
        <section className="space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setAutoCycleLevels(false);
                  setSelectedLevelId('all');
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition cursor-pointer border ${
                  selectedLevelId === 'all'
                    ? 'bg-[#09152C] text-[#F3E5AB] border-[#D4AF37]/70 dark:bg-[#D4AF37] dark:text-[#09152C]'
                    : darkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                جميع المستويات ({analytics.levelStats.length})
              </button>

              {analytics.levelStats.map(ls => {
                const active = Number(selectedLevelId) === Number(ls.level.id);
                return (
                  <button
                    key={ls.level.id}
                    type="button"
                    onClick={() => {
                      setAutoCycleLevels(false);
                      setSelectedLevelId(ls.level.id);
                    }}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition cursor-pointer border ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-600'
                        : darkMode
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span>{ls.level.name}</span>
                    <span className="mr-1.5 opacity-80 font-mono tabular-nums">
                      {ls.completionRate}%
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {analytics.availableWilayats.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-slate-400 shrink-0" />
                  <select
                    value={selectedWilayat}
                    onChange={e => setSelectedWilayat(e.target.value)}
                    aria-label="تصفية حسب الولاية"
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-black cursor-pointer ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="all">كل الولايات ({analytics.availableWilayats.length})</option>
                    {analytics.availableWilayats.map(w => (
                      <option key={w} value={w}>
                        ولاية {w}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {analytics.availableGenders.length > 0 && (
                <select
                  value={selectedGender}
                  onChange={e => setSelectedGender(e.target.value)}
                  aria-label="تصفية حسب الجنس"
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-black cursor-pointer ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-100'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="all">الجنس: الكل</option>
                  {analytics.availableGenders.map(g => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLevelId('all');
                    setSelectedWilayat('all');
                    setSelectedGender('all');
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 cursor-pointer"
                >
                  إعادة الضبط
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>{formatArabicDate(nowClock)}</span>
              {analytics.latestTimestamp > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                    آخر تقييم مرصود:{' '}
                    {formatRelativeArabicTime(analytics.latestTimestamp, nowClock.getTime())}
                  </span>
                </>
              )}
            </div>
            {hasActiveFilters && (
              <span className="text-amber-700 dark:text-amber-300 font-extrabold">
                عرض مخصص حسب التصفية المختارة
              </span>
            )}
          </div>
        </section>

        {/* الصف الأول: مؤشر الإنجاز الدائري + بطاقات المؤشرات الرئيسية KPI */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className={`lg:col-span-4 rounded-2xl border p-5 flex items-center justify-between gap-4 transition-all ${
              justUpdatedFlash
                ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30'
                : darkMode
                ? 'bg-slate-900/85 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="space-y-2 min-w-0">
              <div className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                {selectedLevelId === 'all'
                  ? 'نسبة إنجاز التقييم الكلية'
                  : 'نسبة إنجاز النطاق المحدد'}
              </div>
              <div
                className={`font-black tabular-nums leading-none text-[#09152C] dark:text-white ${
                  isTvMode ? 'text-5xl' : 'text-4xl'
                }`}
              >
                {analytics.overallCompletionRate}%
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                تم تقييم{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {analytics.evaluatedParticipants.toLocaleString('ar-OM')}
                </strong>{' '}
                من أصل{' '}
                <strong>{analytics.totalParticipants.toLocaleString('ar-OM')}</strong> متسابق
              </div>
              {analytics.unmemorizedParticipants > 0 && (
                <div className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  منهم {analytics.unmemorizedParticipants.toLocaleString('ar-OM')} حالة غير حافظ
                </div>
              )}
            </div>

            <div className="relative shrink-0 flex items-center justify-center">
              <svg
                width={(gaugeRadius + gaugeStroke) * 2}
                height={(gaugeRadius + gaugeStroke) * 2}
                className="-rotate-90"
                aria-label={`نسبة الإنجاز ${analytics.overallCompletionRate}%`}
              >
                <circle
                  cx={gaugeRadius + gaugeStroke}
                  cy={gaugeRadius + gaugeStroke}
                  r={gaugeRadius}
                  fill="none"
                  stroke={darkMode ? '#1E293B' : '#E2E8F0'}
                  strokeWidth={gaugeStroke}
                />
                <circle
                  cx={gaugeRadius + gaugeStroke}
                  cy={gaugeRadius + gaugeStroke}
                  r={gaugeRadius}
                  fill="none"
                  stroke="url(#liveGaugeGradient)"
                  strokeWidth={gaugeStroke}
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeOffset}
                  className="transition-all duration-700 ease-out"
                />
                <defs>
                  <linearGradient id="liveGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#D4AF37" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <CheckCircle2
                  size={isTvMode ? 24 : 20}
                  className="text-emerald-600 dark:text-emerald-400"
                />
                <span className="text-[11px] font-black tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                  {analytics.evaluatedParticipants}/{analytics.totalParticipants}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <ExecutiveKpiCard
              label="بانتظار التقييم"
              value={analytics.pendingParticipants.toLocaleString('ar-OM')}
              subtext={`المتبقي ${(100 - analytics.overallCompletionRate).toFixed(1)}%`}
              icon={<Clock size={20} />}
              accent="amber"
              darkMode={darkMode}
              isTvMode={isTvMode}
            />
            <ExecutiveKpiCard
              label="متوسط الأداء العام"
              value={
                analytics.overallAveragePct !== null
                  ? `${analytics.overallAveragePct}%`
                  : '—'
              }
              subtext="للمتسابقين المُقيّمين"
              icon={<Award size={20} />}
              accent="emerald"
              darkMode={darkMode}
              isTvMode={isTvMode}
            />
            <ExecutiveKpiCard
              label="استمارات التقييم"
              value={analytics.totalEvaluationsSubmissions.toLocaleString('ar-OM')}
              subtext="إجمالي الرصدات المسجلة"
              icon={<BarChart3 size={20} />}
              accent="blue"
              darkMode={darkMode}
              isTvMode={isTvMode}
            />
            <ExecutiveKpiCard
              label="اللجان والمقيّمون"
              value={`${analytics.totalCommittees.toLocaleString('ar-OM')} لجنة`}
              subtext={`${analytics.activeEvaluatorsCount} مقيّم نشط من ${analytics.totalEvaluators}`}
              icon={<Users size={20} />}
              accent="navy"
              darkMode={darkMode}
              isTvMode={isTvMode}
            />
          </div>
        </section>

        {/* الصف الثاني: الرسوم البيانية لبيانات المتسابقين (الجنس + الولاية + التقديرات) */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
          {/* 1) توزيع المتسابقين حسب الجنس مع رسم دائري SVG وتفصيل التقييم */}
          <div
            className={`xl:col-span-4 rounded-2xl border p-4 sm:p-5 space-y-4 ${
              darkMode
                ? 'bg-slate-900/85 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-[#09152C] dark:text-white flex items-center gap-1.5">
                  <PieChart size={18} className="text-sky-600 dark:text-sky-400" />
                  <span>توزيع المتسابقين حسب الجنس</span>
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  الأعداد، النسب المئوية، ونسبة إنجاز التقييم لكل فئة
                </p>
              </div>
            </div>

            {analytics.genderBreakdown.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-5">
                  <div className="relative shrink-0">
                    <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r={genderDonutRadius}
                        fill="none"
                        stroke={darkMode ? '#1E293B' : '#F1F5F9'}
                        strokeWidth="16"
                      />
                      {genderDonutSegments.map(seg => (
                        <circle
                          key={seg.name}
                          cx="64"
                          cy="64"
                          r={genderDonutRadius}
                          fill="none"
                          stroke={darkMode ? seg.darkColor : seg.color}
                          strokeWidth="16"
                          strokeDasharray={seg.dashArray}
                          strokeDashoffset={seg.dashOffset}
                          className="transition-all duration-700"
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-lg font-black tabular-nums text-[#09152C] dark:text-white">
                        {genderTotal.toLocaleString('ar-OM')}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        متسابق
                      </span>
                    </div>
                  </div>

                  {/* شريط مقارنة سريع للذكور والإناث */}
                  <div className="flex-1 space-y-2.5 min-w-0">
                    {analytics.genderBreakdown.map(g => {
                      const isSelected = selectedGender === g.name;
                      return (
                        <button
                          key={g.name}
                          type="button"
                          onClick={() =>
                            setSelectedGender(prev => (prev === g.name ? 'all' : g.name))
                          }
                          className={`w-full text-right p-2.5 rounded-xl border transition cursor-pointer ${
                            isSelected
                              ? 'border-[#D4AF37] bg-amber-50/70 dark:bg-amber-950/30'
                              : darkMode
                              ? 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                              : 'border-slate-200/80 bg-slate-50/70 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-black">
                            <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                              <span
                                style={{
                                  backgroundColor: darkMode ? g.darkColor : g.color,
                                }}
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                              />
                              {g.name}
                            </span>
                            <span className="tabular-nums text-slate-900 dark:text-white">
                              {g.total.toLocaleString('ar-OM')} ({g.sharePct}%)
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              style={{
                                width: `${g.completionRate}%`,
                                backgroundColor: darkMode ? g.darkColor : g.color,
                              }}
                              className="h-full transition-all duration-700"
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>
                              تم تقييمهم: {g.evaluated} ({g.completionRate}%)
                            </span>
                            {g.averagePct !== null && (
                              <span className="text-emerald-700 dark:text-emerald-400 font-black">
                                المتوسط {g.averagePct}%
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs font-bold text-slate-400">
                لا توجد بيانات جنس مسجلة للمتسابقين بعد.
              </div>
            )}
          </div>

          {/* 2) توزيع المتسابقين حسب الولاية (رسم بياني أفقي شامل بالأعداد ونسب الإنجاز) */}
          <div
            className={`xl:col-span-4 rounded-2xl border p-4 sm:p-5 space-y-4 ${
              darkMode
                ? 'bg-slate-900/85 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-[#09152C] dark:text-white flex items-center gap-1.5">
                  <MapPin size={18} className="text-[#D4AF37]" />
                  <span>توزيع المتسابقين حسب الولاية</span>
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  إجمالي المسجلين ونسبة الإنجاز ومتوسط الأداء لكل ولاية
                </p>
              </div>
              <span className="text-xs font-black tabular-nums text-slate-500 dark:text-slate-400">
                {analytics.wilayatBreakdown.length} ولاية
              </span>
            </div>

            {analytics.wilayatBreakdown.length > 0 ? (
              <div className="space-y-3 max-h-[290px] overflow-y-auto pl-1">
                {analytics.wilayatBreakdown.map(w => {
                  const barWidth = Math.max(8, (w.total / maxWilayatTotal) * 100);
                  const isSelected = selectedWilayat === w.name;
                  return (
                    <button
                      key={w.name}
                      type="button"
                      onClick={() =>
                        w.name !== 'غير محدد' &&
                        setSelectedWilayat(prev => (prev === w.name ? 'all' : w.name))
                      }
                      className={`w-full text-right p-2.5 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'border-[#D4AF37] bg-amber-50/70 dark:bg-amber-950/30'
                          : darkMode
                          ? 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700'
                          : 'border-slate-200/70 bg-[#FCFBF8] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-black tabular-nums mb-1.5">
                        <span className="text-slate-900 dark:text-white truncate">
                          {w.name}
                        </span>
                        <span className="text-slate-700 dark:text-slate-200 shrink-0">
                          {w.total.toLocaleString('ar-OM')} متسابق ({w.sharePct}%)
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${barWidth}%` }}
                          className="h-full bg-slate-400/50 dark:bg-slate-600 rounded-full overflow-hidden"
                        >
                          <div
                            style={{
                              width: `${w.completionRate}%`,
                              backgroundColor: w.color,
                            }}
                            className="h-full transition-all duration-700"
                          />
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>
                          تم تقييمهم: {w.evaluated} · متبقي: {w.pending} ({w.completionRate}%)
                        </span>
                        {w.averagePct !== null && (
                          <span className="text-emerald-700 dark:text-emerald-400 font-black">
                            المتوسط {w.averagePct}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs font-bold text-slate-400">
                لا توجد بيانات ولايات مسجلة للمتسابقين بعد.
              </div>
            )}
          </div>

          {/* 3) توزيع التقديرات اللفظية (Donut SVG) */}
          <div
            className={`md:col-span-2 xl:col-span-4 rounded-2xl border p-4 sm:p-5 space-y-4 ${
              darkMode
                ? 'bg-slate-900/85 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-black text-[#09152C] dark:text-white flex items-center gap-1.5">
                <Award size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span>توزيع التقديرات اللفظية</span>
              </h2>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                تصنيف مستويات الأداء للنتائج المرصودة حتى الآن
              </p>
            </div>

            {analytics.gradedTotal > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative shrink-0">
                  <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
                    <circle
                      cx="66"
                      cy="66"
                      r={donutRadius}
                      fill="none"
                      stroke={darkMode ? '#1E293B' : '#F1F5F9'}
                      strokeWidth="16"
                    />
                    {donutSegments.map(
                      seg =>
                        seg.count > 0 && (
                          <circle
                            key={seg.key}
                            cx="66"
                            cy="66"
                            r={donutRadius}
                            fill="none"
                            stroke={darkMode ? seg.darkColor : seg.color}
                            strokeWidth="16"
                            strokeDasharray={seg.dashArray}
                            strokeDashoffset={seg.dashOffset}
                            className="transition-all duration-700"
                          />
                        )
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-black tabular-nums text-[#09152C] dark:text-white">
                      {analytics.gradedTotal}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      نتيجة مرصودة
                    </span>
                  </div>
                </div>

                <div className="w-full space-y-2">
                  {donutSegments.map(seg => (
                    <div
                      key={seg.key}
                      className="flex items-center justify-between gap-2 text-xs font-bold"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          style={{
                            backgroundColor: darkMode ? seg.darkColor : seg.color,
                          }}
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                        />
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {seg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums shrink-0">
                        <span className="font-black text-slate-900 dark:text-white">
                          {seg.count}
                        </span>
                        <span className="text-slate-400 w-10 text-left">
                          {seg.pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs font-bold text-slate-400">
                لم تُرصد نتائج تقييم بعد؛ سيتحدث الرسم البياني تلقائياً فور رصد أول تقييم.
              </div>
            )}
          </div>
        </section>

        {/* الصف الثالث: تقدم التقييمات والرسوم البيانية لكل مستوى + أحدث حركة التقييم */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div
            className={`xl:col-span-8 rounded-2xl border p-4 sm:p-6 space-y-5 ${
              darkMode
                ? 'bg-slate-900/85 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <div>
                <h2
                  className={`font-black text-[#09152C] dark:text-white flex items-center gap-2 ${
                    isTvMode ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
                  }`}
                >
                  <BarChart3 size={20} className="text-emerald-600 dark:text-emerald-400" />
                  <span>تقدم التقييمات وإحصائيات المستويات</span>
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  نسب الإنجاز، أعداد الذكور والإناث، متوسط الدرجات، وتقدم لجان التحكيم في كل مستوى
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                  تم تقييمهم
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                  غير حافظ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 dark:bg-slate-700" />
                  بانتظار التقييم
                </span>
              </div>
            </div>

            {analytics.levelStats.length > 1 && selectedLevelId === 'all' && (
              <div
                className={`rounded-xl border p-3.5 sm:p-4 ${
                  darkMode
                    ? 'bg-slate-950/60 border-slate-800'
                    : 'bg-slate-50/70 border-slate-200/70'
                }`}
              >
                <div className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
                  <span>مقارنة بصرية لنسب الإنجاز بين المستويات (%)</span>
                  <span className="text-[11px] font-bold text-slate-400">
                    انقر على أي مستوى للتركيز عليه
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 items-end pt-2">
                  {analytics.levelStats.map(ls => {
                    const barColor =
                      LEVEL_ACCENT_HEX[ls.levelIndex % LEVEL_ACCENT_HEX.length];
                    const heightPct = Math.max(8, ls.completionRate);
                    return (
                      <button
                        key={ls.level.id}
                        type="button"
                        onClick={() => setSelectedLevelId(ls.level.id)}
                        className="group flex flex-col items-center gap-1.5 text-center cursor-pointer"
                      >
                        <span className="text-xs sm:text-sm font-black tabular-nums text-slate-800 dark:text-slate-100">
                          {ls.completionRate}%
                        </span>
                        <div className="w-full max-w-[54px] h-28 sm:h-32 rounded-t-xl bg-slate-200/80 dark:bg-slate-800 relative overflow-hidden flex items-end">
                          <div
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: barColor,
                            }}
                            className="w-full rounded-t-lg transition-all duration-700 ease-out group-hover:opacity-90"
                          />
                        </div>
                        <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 line-clamp-2 leading-tight min-h-[28px]">
                          {ls.level.name}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                          {ls.evaluatedCount}/{ls.totalParticipants}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3.5">
              {visibleLevels.map(ls => {
                const barColor =
                  LEVEL_ACCENT_HEX[ls.levelIndex % LEVEL_ACCENT_HEX.length];
                const memorizedPct =
                  ls.totalParticipants > 0
                    ? (ls.memorizedEvaluatedCount / ls.totalParticipants) * 100
                    : 0;
                const unmemorizedPct =
                  ls.totalParticipants > 0
                    ? (ls.unmemorizedCount / ls.totalParticipants) * 100
                    : 0;

                return (
                  <div
                    key={ls.level.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      darkMode
                        ? 'bg-slate-950/50 border-slate-800'
                        : 'bg-[#FCFBF8] border-slate-200/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            style={{ backgroundColor: barColor }}
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                          />
                          <h3
                            className={`font-black text-slate-900 dark:text-white ${
                              isTvMode ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                            }`}
                          >
                            {ls.level.name}
                          </h3>
                          {ls.level.juzsOrSurahs && (
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              · {formatJuzsOrSurahsDisplay(ls.level.juzsOrSurahs)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-bold tabular-nums">
                        <span className="text-emerald-700 dark:text-emerald-400 font-black">
                          الإنجاز {ls.completionRate}%
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <span className="text-slate-700 dark:text-slate-200">
                          {ls.evaluatedCount} / {ls.totalParticipants} متسابق
                        </span>
                        {ls.averageScore !== null && (
                          <>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <span className="text-amber-700 dark:text-amber-400 font-black">
                              المتوسط: {ls.averageScore} / {ls.level.maxScore}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="h-3.5 w-full rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden flex">
                      {memorizedPct > 0 && (
                        <div
                          style={{ width: `${memorizedPct}%` }}
                          className="h-full bg-emerald-600 transition-all duration-700"
                          title={`تم تقييمهم: ${ls.memorizedEvaluatedCount}`}
                        />
                      )}
                      {unmemorizedPct > 0 && (
                        <div
                          style={{ width: `${unmemorizedPct}%` }}
                          className="h-full bg-rose-500 transition-all duration-700"
                          title={`غير حافظ: ${ls.unmemorizedCount}`}
                        />
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>المُقيّمون: {ls.memorizedEvaluatedCount}</span>
                        <span>·</span>
                        <span>بانتظار التقييم: {ls.pendingCount}</span>
                        {(ls.maleCount > 0 || ls.femaleCount > 0) && (
                          <>
                            <span>·</span>
                            <span className="text-sky-700 dark:text-sky-400">
                              ذكور: {ls.maleCount}
                            </span>
                            <span>·</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              إناث: {ls.femaleCount}
                            </span>
                          </>
                        )}
                        {ls.unmemorizedCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-rose-600 dark:text-rose-400">
                              غير حافظ: {ls.unmemorizedCount}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {ls.highestScore !== null && (
                          <span>
                            أعلى درجة:{' '}
                            <strong className="text-slate-900 dark:text-white">
                              {ls.highestScore}
                            </strong>
                          </span>
                        )}
                        <span>·</span>
                        <span>الرصدات: {ls.totalSubmissions}</span>
                      </div>
                    </div>

                    {ls.committees.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ls.committees.map(cm => (
                          <div
                            key={cm.id}
                            className={`px-3 py-2 rounded-lg border text-xs ${
                              darkMode
                                ? 'bg-slate-900 border-slate-800'
                                : 'bg-white border-slate-200/80'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 font-black mb-1">
                              <span className="truncate text-slate-800 dark:text-slate-200">
                                {cm.name}
                              </span>
                              <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                                {cm.rate}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${cm.rate}%` }}
                                className="h-full bg-emerald-600 transition-all duration-700"
                              />
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                              {cm.evaluated} من {cm.total} متسابق
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleLevels.length === 0 && (
                <div className="p-8 text-center text-sm font-bold text-slate-400">
                  لا توجد مستويات مضافة لهذه المسابقة بعد.
                </div>
              )}
            </div>
          </div>

          {/* العمود الجانبي: أحدث حركة التقييم اللحظية */}
          <div className="xl:col-span-4 space-y-5">
            <div
              className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                darkMode
                  ? 'bg-slate-900/85 border-slate-800'
                  : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h2 className="text-sm sm:text-base font-black text-[#09152C] dark:text-white">
                  أحدث حركة التقييم المباشرة
                </h2>
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                  تحديث تلقائي
                </span>
              </div>

              {analytics.recentEvaluations.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analytics.recentEvaluations.map(ev => (
                    <div
                      key={ev.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-black text-slate-800 dark:text-slate-100 truncate">
                          {showTopPerformers
                            ? ev.participantName
                            : `تقييم مكتمل · ${ev.levelName}`}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                          {showTopPerformers ? ev.levelName : 'لجنة التحكيم'}
                          {ev.wilayat ? ` · ${ev.wilayat}` : ''}
                        </div>
                      </div>
                      <div className="text-left shrink-0 tabular-nums">
                        {ev.isUnmemorized ? (
                          <div className="font-black text-rose-600 dark:text-rose-400">
                            غير حافظ
                          </div>
                        ) : (
                          <div className="font-black text-emerald-700 dark:text-emerald-400">
                            {ev.score !== null ? `${ev.score} / ${ev.maxScore}` : '—'}
                          </div>
                        )}
                        <div className="text-[10px] font-bold text-slate-400">
                          {formatRelativeArabicTime(ev.timestamp, nowClock.getTime())}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs font-bold text-slate-400">
                  بانتظار رصد أول تقييم من اللجان...
                </p>
              )}
            </div>

            {/* ملخص عددي سريع للمتسابقين */}
            <div
              className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                darkMode
                  ? 'bg-slate-900/85 border-slate-800'
                  : 'bg-white border-slate-200/90'
              }`}
            >
              <h2 className="text-sm sm:text-base font-black text-[#09152C] dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2.5">
                ملخص بيانات المسجلين
              </h2>
              <div className="grid grid-cols-2 gap-2.5 text-center tabular-nums">
                <div
                  className={`p-3 rounded-xl border ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200/70'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    إجمالي المسجلين
                  </div>
                  <div className="text-xl font-black text-[#09152C] dark:text-white mt-0.5">
                    {analytics.totalParticipants.toLocaleString('ar-OM')}
                  </div>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200/70'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    الولايات المشاركة
                  </div>
                  <div className="text-xl font-black text-[#09152C] dark:text-white mt-0.5">
                    {analytics.availableWilayats.length.toLocaleString('ar-OM')}
                  </div>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200/70'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    عدد المستويات
                  </div>
                  <div className="text-xl font-black text-[#09152C] dark:text-white mt-0.5">
                    {analytics.levelStats.length.toLocaleString('ar-OM')}
                  </div>
                </div>
                <div
                  className={`p-3 rounded-xl border ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200/70'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    أُكمل تقييمهم
                  </div>
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {analytics.evaluatedParticipants.toLocaleString('ar-OM')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* الصف الرابع (اختياري حسب إعداد المشرف): لوحة الأوائل لكل مستوى */}
        {showTopPerformers && (
          <section
            className={`rounded-2xl border p-4 sm:p-6 space-y-5 ${
              darkMode
                ? 'bg-gradient-to-b from-slate-900 to-[#0B172E] border-[#D4AF37]/35'
                : 'bg-gradient-to-b from-white to-amber-50/35 border-[#D4AF37]/50'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 dark:border-slate-800 pb-3.5">
              <div>
                <h2
                  className={`font-black text-[#09152C] dark:text-[#F3E5AB] flex items-center gap-2 ${
                    isTvMode ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
                  }`}
                >
                  <Trophy size={21} className="text-[#D4AF37]" />
                  <span>
                    لوحة الأوائل المباشرة (أعلى {analytics.topCount} في كل مستوى)
                  </span>
                </h2>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  ترتيب مبدئي مباشر يتحدث تلقائياً فور اعتماد أي تقييم جديد من لجان التحكيم
                </p>
              </div>
              <span className="text-xs font-extrabold text-amber-800 dark:text-amber-300">
                نتائج أولية لحين اكتمال جميع التقييمات
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleLevels.map(ls => (
                <div
                  key={ls.level.id}
                  className={`rounded-2xl border overflow-hidden flex flex-col ${
                    darkMode
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-white border-slate-200/90'
                  }`}
                >
                  <div className="px-4 py-3 bg-[#09152C] text-white flex items-center justify-between gap-2 border-b border-[#D4AF37]/40">
                    <h3 className="font-black text-sm truncate text-[#F3E5AB]">
                      {ls.level.name}
                    </h3>
                    <span className="text-[11px] font-bold text-slate-300 tabular-nums shrink-0">
                      {ls.evaluatedCount}/{ls.totalParticipants}
                    </span>
                  </div>

                  <div className="p-3.5 flex-1">
                    {ls.topPerformers.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {ls.topPerformers.map((item, rankIdx) => {
                          const rankColors =
                            rankIdx === 0
                              ? 'bg-amber-400 text-[#09152C]'
                              : rankIdx === 1
                              ? 'bg-slate-300 text-slate-900'
                              : rankIdx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200';
                          return (
                            <div
                              key={item.id}
                              className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-2.5"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center shrink-0 tabular-nums ${rankColors}`}
                                >
                                  {rankIdx === 0 ? <Crown size={15} /> : rankIdx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div
                                    className={`font-black text-slate-900 dark:text-white truncate ${
                                      isTvMode ? 'text-base' : 'text-xs sm:text-sm'
                                    }`}
                                  >
                                    {item.name}
                                  </div>
                                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                                    {item.wilayat || item.gradeLabel}
                                  </div>
                                </div>
                              </div>

                              <div className="text-left shrink-0 tabular-nums">
                                <div
                                  className={`font-black text-emerald-700 dark:text-emerald-400 ${
                                    isTvMode ? 'text-base' : 'text-sm'
                                  }`}
                                >
                                  {item.averageScore}
                                  <span className="text-[11px] font-bold text-slate-400 mr-0.5">
                                    /{item.maxScore}
                                  </span>
                                </div>
                                {item.percentage !== null && (
                                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                    {item.percentage}%
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs font-bold text-slate-400">
                        بانتظار رصد التقييمات في هذا المستوى
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200/80 dark:border-slate-800/80 py-3.5 px-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
        <span>إدارة الأوقاف والشؤون الدينية بمحافظة الظاهرة</span>
        <span className="mx-2">·</span>
        <span>منصة المتابعة المباشرة لمسابقة محافظة الظاهرة للقرآن الكريم</span>
      </footer>
    </div>
  );
};

interface ExecutiveKpiCardProps {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'amber' | 'blue' | 'navy';
  darkMode: boolean;
  isTvMode: boolean;
}

const ExecutiveKpiCard: React.FC<ExecutiveKpiCardProps> = ({
  label,
  value,
  subtext,
  icon,
  accent,
  darkMode,
  isTvMode,
}) => {
  const iconStyles = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300',
    navy: 'bg-slate-200/80 text-[#09152C] dark:bg-slate-800 dark:text-[#F3E5AB]',
  }[accent];

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${
        darkMode
          ? 'bg-slate-900/85 border-slate-800'
          : 'bg-white border-slate-200/90'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconStyles}`}
        >
          {icon}
        </span>
      </div>
      <div>
        <div
          className={`font-black tabular-nums text-[#09152C] dark:text-white leading-tight ${
            isTvMode ? 'text-3xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {value}
        </div>
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
          {subtext}
        </div>
      </div>
    </div>
  );
};

export default LiveExecutiveDashboard;
