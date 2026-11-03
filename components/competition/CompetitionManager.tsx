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
} from '../../utils/juzUtils';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

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
        juzsOrSurahs: '5 أجزاء',
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
            onClick={() => handleToggleCompetitionActive(activeCompetition.id)}
            className={`flex-1 sm:flex-initial min-h-[44px] text-xs sm:text-sm font-black py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer border ${
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
            className="flex-1 sm:flex-initial min-h-[44px] text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
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
    onUpdate({
      ...comp,
      errors: nextErrors,
      errorCategories: nextCategories,
      levels: syncedLevels,
    });
  };

  const handleSave = () => {
    const syncedLevels = buildSyncedLevels(levels, compErrors, compErrorCategories);
    setLevels(syncedLevels);
    onUpdate({
      ...comp,
      errors: compErrors,
      errorCategories: compErrorCategories,
      levels: syncedLevels,
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
        juzsOrSurahs: 'جزء واحد',
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

  // تحميل قالب إكسل للاسم والمستوى
  const handleDownloadLevelExcelTemplate = () => {
    const rows =
      levels.length > 0
        ? levels.map((l, idx) => ({
            'اسم المتسابق': `متسابق تجريبي ${idx + 1}`,
            المستوى: l.name,
            'الأجزاء أو السور المختارة': l.juzsOrSurahs || '',
          }))
        : [
            {
              'اسم المتسابق': 'أحمد محمد علي',
              المستوى: 'المستوى الأول',
              'الأجزاء أو السور المختارة': '5 أجزاء',
            },
          ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المتسابقين_والمستويات');
    XLSX.writeFile(wb, `قالب_متسابقي_${comp.name}.xlsx`);
  };

  // استيراد ملف إكسل للاسم والمستوى (سواء لمستوى محدد أو لجميع المستويات)
  const handleExcelImportForLevels = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fallbackLevelId = targetImportLevelId ?? levels[0]?.id;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];

        const updatedLevels = [...levels];
        const newParticipants: CompetitionParticipant[] = [];
        const baseId = Date.now();

        rows.forEach((row, i) => {
          const keys = Object.keys(row);
          const rawName =
            row['اسم المتسابق'] ||
            row['اسم المشارك'] ||
            row['الاسم'] ||
            row['المتسابق'] ||
            row['المشارك'] ||
            (keys.length > 0 ? row[keys[0]] : '');

          const pName = cleanParticipantLine(String(rawName || ''));
          if (!pName || pName === 'اسم المتسابق' || pName === 'اسم المشارك' || pName === 'الاسم') {
            return;
          }

          const rawLevelName = String(
            row['المستوى'] || row['اسم المستوى'] || row['فرع المسابقة'] || ''
          ).trim();
          const rawScope = String(
            row['الأجزاء أو السور المختارة'] || row['النطاق'] || row['الأجزاء'] || ''
          ).trim();

          let matchedLevel: CompetitionLevel | undefined;

          if (rawLevelName) {
            matchedLevel = updatedLevels.find(
              l =>
                l.name.trim() === rawLevelName ||
                l.name.includes(rawLevelName) ||
                rawLevelName.includes(l.name.trim())
            );
            // إذا كان المستوى المذكور في ملف الإكسل غير موجود بعد، ننشئه تلقائياً!
            if (!matchedLevel) {
              const newLvId =
                updatedLevels.length > 0
                  ? Math.max(...updatedLevels.map(l => l.id)) + 1
                  : 1;
              matchedLevel = {
                id: newLvId,
                name: rawLevelName,
                juzsOrSurahs: rawScope || '5 أجزاء',
                segmentsCount: 5,
                linesPerSegment: 7,
                maxScore: 100,
                errorCategories: DEFAULT_ERROR_CATEGORIES.map(c => ({ ...c })),
                errors: [
                  { id: 1, name: 'التنبيه', deduction: 0.5, category: 'حفظ', color: 'rose' },
                  { id: 2, name: 'الفتح', deduction: 1, category: 'حفظ', color: 'rose' },
                  { id: 3, name: 'التشكيل', deduction: 1, category: 'حفظ', color: 'rose' },
                  { id: 4, name: 'التجويد', deduction: 0.5, category: 'التجويد', color: 'teal' },
                ],
              };
              updatedLevels.push(matchedLevel);
            }
          } else if (fallbackLevelId) {
            matchedLevel =
              updatedLevels.find(l => l.id === Number(fallbackLevelId)) ||
              updatedLevels[0];
          }

          if (matchedLevel) {
            newParticipants.push({
              id: baseId + i,
              name: pName,
              levelId: matchedLevel.id,
              juzsOrSurahs: rawScope || matchedLevel.juzsOrSurahs,
            });
          }
        });

        if (newParticipants.length > 0) {
          setLevels(updatedLevels);
          onUpdate({
            ...comp,
            levels: updatedLevels,
            participants: [...(comp.participants || []), ...newParticipants],
          });
          context?.showToast(
            `تم استيراد ${newParticipants.length} متسابق وتوزيعهم على المستويات بنجاح!`,
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

      {/* شريط علوي لإعداد المستويات واستيراد إكسل الشامل (الاسم والمستوى) */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-emerald-50/60 dark:bg-slate-800/60 p-3.5 sm:p-4 rounded-2xl border border-emerald-200/70 dark:border-slate-700">
        <div>
          <h3 className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-300">
            إعداد المستويات وإدراج المتسابقين
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            يمكنك لصق أسماء المتسابقين (كل سطر اسم) داخل كل مستوى مباشرة، أو استيراد ملف إكسل يحتوي على (اسم المتسابق والمستوى)
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadLevelExcelTemplate}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            title="تحميل قالب إكسل جاهز (الاسم والمستوى)"
          >
            <Download size={16} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
            <span>قالب إكسل (الاسم والمستوى)</span>
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
            <span>استيراد إكسل (الاسم والمستوى)</span>
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
                  <label className="text-xs text-slate-600 dark:text-slate-300 font-bold block mb-2">
                    نطاق التقييم للمستوى (اختر نظام تحديد المستوى)
                  </label>

                  {(() => {
                    const isSpecificJuzs = level.juzsOrSurahs.startsWith('الأجزاء:');
                    const isSpecificSurahs = level.juzsOrSurahs.startsWith('السور:');
                    const isJuzCountOnly = !isSpecificJuzs && !isSpecificSurahs;

                    const formatJuzCountLabel = (count: number) => {
                      if (count === 1) return 'جزء واحد (غير محدد)';
                      if (count === 2) return 'جزآن (غير محددين)';
                      if (count >= 3 && count <= 10) return `${count} أجزاء (غير محددة)`;
                      if (count === 30) return '30 جزءاً (القرآن كاملاً)';
                      return `${count} جزءاً (غير محددة)`;
                    };

                    const extractJuzCount = (str: string): number => {
                      if (str.includes('جزء واحد')) return 1;
                      if (str.includes('جزآن') || str.includes('جزئين')) return 2;
                      const m = str.match(/(\d+)/);
                      if (m) {
                        const n = parseInt(m[1], 10);
                        if (n >= 1 && n <= 30) return n;
                      }
                      return 5;
                    };

                    const currentJuzCount = extractJuzCount(level.juzsOrSurahs);

                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                          <label
                            className={`min-h-[46px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isJuzCountOnly
                                ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isJuzCountOnly}
                              onChange={() =>
                                updateLevel(level.id, {
                                  juzsOrSurahs: formatJuzCountLabel(5),
                                })
                              }
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0"
                            />
                            <span>عدد أجزاء غير محددة (مثل: 15 جزء، 10 أجزاء، 3 أجزاء)</span>
                          </label>

                          <label
                            className={`min-h-[46px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isSpecificJuzs
                                ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isSpecificJuzs}
                              onChange={() =>
                                updateLevel(level.id, { juzsOrSurahs: 'الأجزاء: 30' })
                              }
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0"
                            />
                            <span>أجزاء معينة محددة (مثل: الجزء 30، أو 29 و30)</span>
                          </label>

                          <label
                            className={`min-h-[46px] px-3 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition active:scale-95 ${
                              isSpecificSurahs
                                ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`scopeType-${level.id}`}
                              checked={isSpecificSurahs}
                              onChange={() =>
                                updateLevel(level.id, { juzsOrSurahs: 'السور: البقرة' })
                              }
                              className="text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0"
                            />
                            <span>سور معينة محددة</span>
                          </label>
                        </div>

                        {/* الخيار الأول: تحديد المستوى بعدد الأجزاء فقط (غير محددة بأجزاء معينة) */}
                        {isJuzCountOnly && (
                          <div className="p-3.5 bg-emerald-50/40 dark:bg-slate-800/80 rounded-xl border border-emerald-200/80 dark:border-slate-700 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
                                  تحديد عدد الأجزاء المطلوبة في هذا المستوى (الأجزاء غير محددة مسبقاً):
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  اختر من الأزرار السريعة أو اكتب عدد الأجزاء (مثلاً: 15 جزء، 10 أجزاء، 5 أجزاء، 3 أجزاء)
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                  عدد الأجزاء:
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={currentJuzCount}
                                  onChange={e => {
                                    const val = Math.min(30, Math.max(1, Number(e.target.value) || 1));
                                    updateLevel(level.id, {
                                      juzsOrSurahs: formatJuzCountLabel(val),
                                    });
                                  }}
                                  className="w-20 min-h-[42px] border border-emerald-400 dark:border-slate-600 rounded-xl text-center font-black text-sm bg-white dark:bg-slate-900"
                                />
                              </div>
                            </div>

                            {/* أزرار سريعة لأشهر مستويات المسابقات القرآنية بعدد الأجزاء */}
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                              {[1, 2, 3, 5, 10, 15, 20, 30].map(cnt => {
                                const isSelected = currentJuzCount === cnt;
                                return (
                                  <button
                                    key={cnt}
                                    type="button"
                                    onClick={() =>
                                      updateLevel(level.id, {
                                        juzsOrSurahs: formatJuzCountLabel(cnt),
                                      })
                                    }
                                    className={`min-h-[42px] px-2 py-1.5 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer ${
                                      isSelected
                                        ? 'bg-emerald-700 text-white shadow-sm'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    {cnt === 1
                                      ? 'جزء ١'
                                      : cnt === 2
                                      ? 'جزآن ٢'
                                      : cnt <= 10
                                      ? `${cnt} أجزاء`
                                      : `${cnt} جزء`}
                                  </button>
                                );
                              })}
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                                وصف نطاق المستوى الذي يظهر للمقيمين وفي التقارير (يمكنك تعديله):
                              </label>
                              <input
                                type="text"
                                value={level.juzsOrSurahs}
                                onChange={e =>
                                  updateLevel(level.id, { juzsOrSurahs: e.target.value })
                                }
                                placeholder="مثال: 15 جزءاً (غير محددة)"
                                className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold"
                              />
                            </div>
                          </div>
                        )}

                        {/* الخيار الثاني: أجزاء معينة محددة (مثل الجزء 30 أو 29 و30) */}
                        {isSpecificJuzs && (
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                اختصارات سريعة للأجزاء المحددة الشائعة، أو اضغط على أرقام الأجزاء بالأسفل:
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { label: 'الجزء 30 (عم)', val: 'الأجزاء: 30' },
                                  { label: 'الجزآن 29 و 30', val: 'الأجزاء: 29، 30' },
                                  { label: 'الأجزاء 28 و 29 و 30', val: 'الأجزاء: 28، 29، 30' },
                                  { label: 'الأجزاء 26 إلى 30', val: 'الأجزاء: 26، 27، 28، 29، 30' },
                                ].map((preset, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                      updateLevel(level.id, { juzsOrSurahs: preset.val })
                                    }
                                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-black transition active:scale-95 cursor-pointer ${
                                      level.juzsOrSurahs === preset.val
                                        ? 'bg-amber-500 text-slate-950'
                                        : 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                              {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
                                const currentJuzs = level.juzsOrSurahs
                                  .replace('الأجزاء:', '')
                                  .split('،')
                                  .map(s => s.trim())
                                  .filter(Boolean);
                                const isSelected = currentJuzs.includes(String(juz));
                                return (
                                  <button
                                    key={juz}
                                    type="button"
                                    onClick={() => {
                                      const next = isSelected
                                        ? currentJuzs.filter(j => j !== String(juz))
                                        : [...currentJuzs, String(juz)].sort(
                                            (a, b) => Number(a) - Number(b)
                                          );
                                      updateLevel(level.id, {
                                        juzsOrSurahs: `الأجزاء: ${next.join('، ')}`,
                                      });
                                    }}
                                    className={`min-h-[40px] p-1.5 text-xs sm:text-sm rounded-xl font-black transition active:scale-95 cursor-pointer ${
                                      isSelected
                                        ? 'bg-emerald-700 text-white shadow-xs'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {juz}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* الخيار الثالث: سور معينة محددة */}
                        {isSpecificSurahs && (
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                              اضغط لتحديد السور المطلوبة في هذا المستوى:
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-1">
                              {surahNames.slice(1).map((surah, idx) => {
                                const currentSurahs = level.juzsOrSurahs
                                  .replace('السور:', '')
                                  .split('،')
                                  .map(s => s.trim())
                                  .filter(Boolean);
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
              const inComp = (comp.evaluators || []).some(
                e => e.name.trim().toLowerCase() === ge.name.trim().toLowerCase()
              );
              return (
                <option key={ge.id} value={ge.id}>
                  {ge.name} (رمز الدخول: {ge.pin}){inComp ? ' - [مختار حالياً في المسابقة]' : ''}
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
          <div className="flex items-center justify-between">
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

      {/* عرض قائمة مقيمي المسابقة المسجلين حالياً */}
      <div className="space-y-3">
        <h4 className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>مقائمو المسابقة الحاليون ({(comp.evaluators || []).length})</span>
          <span className="text-xs font-normal text-slate-500">انقر على "تعديل المستويات" للتحكم بمستويات كل مقيم</span>
        </h4>

        {/* Mobile Cards for Evaluators */}
        <div className="md:hidden space-y-2.5">
          {(comp.evaluators || []).map(ev => {
            const assignedLvlNames = (ev.levelIds || [])
              .map(id => (comp.levels || []).find(l => l.id === id)?.name)
              .filter(Boolean);

            return (
              <div
                key={ev.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-black text-base text-slate-900 dark:text-white block">
                      {ev.name}
                    </span>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                      رمز الدخول: {ev.pin}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingEval(ev)}
                      className="min-h-[42px] px-3 text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40 rounded-xl flex items-center justify-center gap-1 transition active:scale-95 font-bold cursor-pointer"
                      title="تعديل المقيم والمستويات المسندة له"
                    >
                      <Edit size={15} />
                      <span>تعديل المستويات</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmEval(ev)}
                      className="min-h-[42px] min-w-[42px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
                      title="حذف المقيم"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    المستويات التي يقيمها:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {assignedLvlNames.length > 0 ? (
                      assignedLvlNames.map((lname, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 text-xs font-extrabold"
                        >
                          {lname}
                        </span>
                      ))
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 text-xs font-extrabold">
                        جميع المستويات
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {(comp.evaluators || []).length === 0 && (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold">
              لا يوجد مقيمين مضافين لهذه المسابقة حالياً. اختر من القائمة المنسدلة بالعلى لإضافتهم.
            </div>
          )}
        </div>

        {/* Desktop Table for Evaluators */}
        <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">
              <tr>
                <th className="p-3.5 border-b dark:border-slate-700">اسم المقيم</th>
                <th className="p-3.5 border-b dark:border-slate-700">كلمة المرور / الرمز</th>
                <th className="p-3.5 border-b dark:border-slate-700">المستويات المسندة</th>
                <th className="p-3.5 border-b dark:border-slate-700 w-36 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(comp.evaluators || []).map(ev => {
                const assignedLvlNames = (ev.levelIds || [])
                  .map(id => (comp.levels || []).find(l => l.id === id)?.name)
                  .filter(Boolean);

                return (
                  <tr key={ev.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="p-3.5 font-bold">{ev.name}</td>
                    <td className="p-3.5 font-mono text-emerald-800 dark:text-emerald-300 font-black">
                      {ev.pin}
                    </td>
                    <td className="p-3.5 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex flex-wrap gap-1">
                        {assignedLvlNames.length > 0 ? (
                          assignedLvlNames.map((lname, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800"
                            >
                              {lname}
                            </span>
                          ))
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                            جميع المستويات
                          </span>
                        )}
                      </div>
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
                  <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد مقيمين مضافين لهذه المسابقة حالياً. اختر من القائمة المنسدلة بالأعلى لإضافتهم وتحديد مستوياتهم.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                className="min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-xs"
              >
                حفظ المستويات
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
  const [juzsOrSurahs, setJuzsOrSurahs] = useState('');
  const [deleteConfirmParticipant, setDeleteConfirmParticipant] = useState<CompetitionParticipant | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<CompetitionParticipant | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const context = useContext(AppContext);

  const handleSaveParticipantEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant || !editingParticipant.name.trim()) {
      context?.showToast('يرجى إدخال اسم المشارك', 'error');
      return;
    }

    const updatedParticipant: CompetitionParticipant = {
      ...editingParticipant,
      name: editingParticipant.name.trim(),
      levelId: Number(editingParticipant.levelId),
      juzsOrSurahs: editingParticipant.juzsOrSurahs?.trim() || undefined,
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
  const isParticipantChoice =
    selectedLevel &&
    !selectedLevel.juzsOrSurahs.startsWith('الأجزاء:') &&
    !selectedLevel.juzsOrSurahs.startsWith('السور:');

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
      juzsOrSurahs: isParticipantChoice
        ? juzsOrSurahs.trim() || selectedLevel?.juzsOrSurahs
        : selectedLevel?.juzsOrSurahs,
    }));

    onUpdate({
      ...comp,
      participants: [...(comp.participants || []), ...newParts],
    });
    setNamesText('');
    setJuzsOrSurahs('');
    context?.showToast(
      `تمت إضافة ${newParts.length} متسابق بنجاح`,
      'success'
    );
  };

  const handleExportTemplate = () => {
    const rows =
      (comp.levels || []).length > 0
        ? comp.levels.map((l, idx) => ({
            'اسم المتسابق': `متسابق تجريبي ${idx + 1}`,
            المستوى: l.name,
            'الأجزاء أو السور المختارة': l.juzsOrSurahs || 'الأجزاء: 1، 2، 3',
          }))
        : [
            {
              'اسم المتسابق': 'أحمد محمد علي',
              المستوى: 'المستوى الأول',
              'الأجزاء أو السور المختارة': 'الأجزاء: 1، 2، 3',
            },
          ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المشاركين');
    XLSX.writeFile(wb, 'قالب_المشاركين_والمستويات.xlsx');
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];

      const newParticipants: CompetitionParticipant[] = [];
      data.forEach((row, i) => {
        const keys = Object.keys(row);
        const rawName =
          row['اسم المتسابق'] ||
          row['اسم المشارك'] ||
          row['الاسم'] ||
          row['المتسابق'] ||
          (keys.length > 0 ? row[keys[0]] : '');
        const pName = cleanParticipantLine(String(rawName || ''));
        if (!pName || pName === 'اسم المتسابق' || pName === 'اسم المشارك' || pName === 'الاسم') {
          return;
        }
        const lName = String(row['المستوى'] || row['اسم المستوى'] || '').trim();
        const scope =
          row['الأجزاء أو السور المختارة'] ||
          row['النطاق'] ||
          row['الأجزاء'] ||
          '';

        const matchedLevel =
          (comp.levels || []).find(
            l =>
              l.name.trim() === lName ||
              (lName && (l.name.includes(lName) || lName.includes(l.name.trim())))
          ) ||
          (comp.levels || []).find(l => l.id === Number(levelId)) ||
          comp.levels[0];

        if (matchedLevel) {
          const isChoice =
            !matchedLevel.juzsOrSurahs.startsWith('الأجزاء:') &&
            !matchedLevel.juzsOrSurahs.startsWith('السور:');
          newParticipants.push({
            id: Date.now() + i,
            name: String(pName),
            levelId: matchedLevel.id,
            juzsOrSurahs: scope
              ? String(scope)
              : !isChoice
              ? matchedLevel.juzsOrSurahs
              : '',
          });
        }
      });

      if (newParticipants.length > 0) {
        onUpdate({
          ...comp,
          participants: [...(comp.participants || []), ...newParticipants],
        });
        context?.showToast(
          `تم استيراد ${newParticipants.length} متسابق بنجاح!`,
          'success'
        );
      } else {
        context?.showToast(
          'لم يتم العثور على بيانات صحيحة في الملف.',
          'error'
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

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

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
              المستوى المشارك فيه
            </label>
            <select
              value={levelId}
              onChange={e => {
                setLevelId(Number(e.target.value));
                setJuzsOrSurahs('');
              }}
              className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-sm"
            >
              {(comp.levels || []).map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isParticipantChoice && (
          <div className="space-y-2.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
              تحديد الأجزاء أو السور الخاصة بالمشارك ({selectedLevel?.juzsOrSurahs}):
            </label>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <button
                type="button"
                onClick={() => setJuzsOrSurahs('الأجزاء: ')}
                className={`min-h-[42px] px-3 py-2 text-xs font-extrabold rounded-xl border transition active:scale-95 cursor-pointer ${
                  juzsOrSurahs.startsWith('الأجزاء:')
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                اختيار أجزاء
              </button>
              <button
                type="button"
                onClick={() => setJuzsOrSurahs('السور: ')}
                className={`min-h-[42px] px-3 py-2 text-xs font-extrabold rounded-xl border transition active:scale-95 cursor-pointer ${
                  juzsOrSurahs.startsWith('السور:')
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                اختيار سور
              </button>
            </div>

            {juzsOrSurahs.startsWith('الأجزاء:') && (
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
                {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
                  const currentJuzs = juzsOrSurahs
                    .replace('الأجزاء:', '')
                    .split('،')
                    .map(s => s.trim())
                    .filter(Boolean);
                  const isSelected = currentJuzs.includes(String(juz));
                  return (
                    <button
                      key={juz}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? currentJuzs.filter(j => j !== String(juz))
                          : [...currentJuzs, String(juz)];
                        setJuzsOrSurahs(`الأجزاء: ${next.join('، ')}`);
                      }}
                      className={`min-h-[40px] p-1.5 text-xs rounded-xl font-black transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {juz}
                    </button>
                  );
                })}
              </div>
            )}

            {juzsOrSurahs.startsWith('السور:') && (
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pt-1">
                {surahNames.slice(1).map((surah, idx) => {
                  const currentSurahs = juzsOrSurahs
                    .replace('السور:', '')
                    .split('،')
                    .map(s => s.trim())
                    .filter(Boolean);
                  const isSelected = currentSurahs.includes(surah);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? currentSurahs.filter(s => s !== surah)
                          : [...currentSurahs, surah];
                        setJuzsOrSurahs(`السور: ${next.join('، ')}`);
                      }}
                      className={`min-h-[38px] px-3 py-1.5 text-xs rounded-xl font-bold transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {surah}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
              title="تحميل قالب إكسل فارغ لتعبئته"
            >
              <Download size={16} className="shrink-0" />
              <span>قالب إكسل</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[46px] bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs sm:text-sm transition active:scale-95 shadow-xs cursor-pointer"
            >
              <Upload size={16} className="shrink-0" />
              <span>استيراد إكسل (الاسم والمستوى)</span>
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

      {/* Mobile Cards for Participants */}
      <div className="md:hidden space-y-2.5">
        {(comp.participants || []).map(p => {
          const levelName = (comp.levels || []).find(l => l.id === p.levelId)?.name;
          return (
            <div
              key={p.id}
              className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="font-black text-base text-slate-900 dark:text-white">
                  {p.name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200/70 dark:border-emerald-800">
                    {levelName}
                  </span>
                  {p.juzsOrSurahs && (
                    <span className="text-slate-500 dark:text-slate-400 font-semibold truncate">
                      ({p.juzsOrSurahs})
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
        {(comp.participants || []).length === 0 && (
          <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold">
            لا يوجد مشاركين مضافين حالياً
          </div>
        )}
      </div>

      {/* Desktop Table for Participants */}
      <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm">
            <tr>
              <th className="p-3.5 border-b dark:border-slate-700">اسم المشارك</th>
              <th className="p-3.5 border-b dark:border-slate-700">المستوى</th>
              <th className="p-3.5 border-b dark:border-slate-700">نطاق الحفظ والتقييم</th>
              <th className="p-3.5 border-b dark:border-slate-700 w-32 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(comp.participants || []).map(p => (
              <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                <td className="p-3.5 font-bold">{p.name}</td>
                <td className="p-3.5 text-sm text-emerald-700 dark:text-emerald-400 font-bold">
                  {(comp.levels || []).find(l => l.id === p.levelId)?.name}
                </td>
                <td className="p-3.5 text-sm text-slate-600 dark:text-slate-300">
                  {p.juzsOrSurahs || '-'}
                </td>
                <td className="p-3.5 text-center">
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingParticipant({ ...p })}
                      className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 rounded-xl transition cursor-pointer"
                      title="تعديل بيانات المشارك"
                    >
                      <Edit size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmParticipant(p)}
                      className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200/80 dark:border-red-900/40 rounded-xl transition cursor-pointer"
                      title="حذف المشارك"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(comp.participants || []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                  لا يوجد مشاركين مضافين حالياً
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* نافذة تعديل بيانات المشارك */}
      {editingParticipant && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setEditingParticipant(null)}
        >
          <form
            onSubmit={handleSaveParticipantEdit}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl text-right max-h-[90vh] overflow-y-auto"
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
                    يمكنك تعديل الاسم أو تغيير المستوى أو نطاق الأجزاء والسور المختارة
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

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                  اسم المشارك
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
                  className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-sm focus:ring-2 focus:ring-emerald-600"
                  placeholder="أدخل اسم المشارك..."
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                  المستوى المشارك فيه
                </label>
                <select
                  value={editingParticipant.levelId}
                  onChange={e => {
                    const nextLevelId = Number(e.target.value);
                    const nextLevel = (comp.levels || []).find(
                      l => l.id === nextLevelId
                    );
                    setEditingParticipant({
                      ...editingParticipant,
                      levelId: nextLevelId,
                      juzsOrSurahs: nextLevel?.juzsOrSurahs || editingParticipant.juzsOrSurahs,
                    });
                  }}
                  className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-sm"
                >
                  {(comp.levels || []).map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2.5 bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                  نطاق الحفظ والتقييم للمشارك (الأجزاء أو السور):
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingParticipant({
                        ...editingParticipant,
                        juzsOrSurahs: (editingParticipant.juzsOrSurahs || '').startsWith('الأجزاء:')
                          ? editingParticipant.juzsOrSurahs
                          : 'الأجزاء: ',
                      })
                    }
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-extrabold rounded-xl border transition cursor-pointer ${
                      (editingParticipant.juzsOrSurahs || '').startsWith('الأجزاء:')
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    اختيار أجزاء محددة
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingParticipant({
                        ...editingParticipant,
                        juzsOrSurahs: (editingParticipant.juzsOrSurahs || '').startsWith('السور:')
                          ? editingParticipant.juzsOrSurahs
                          : 'السور: ',
                      })
                    }
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-extrabold rounded-xl border transition cursor-pointer ${
                      (editingParticipant.juzsOrSurahs || '').startsWith('السور:')
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    اختيار سور محددة
                  </button>
                </div>

                {(editingParticipant.juzsOrSurahs || '').startsWith('الأجزاء:') && (
                  <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 pt-1">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => {
                      const currentJuzs = (editingParticipant.juzsOrSurahs || '')
                        .replace('الأجزاء:', '')
                        .split('،')
                        .map(s => s.trim())
                        .filter(Boolean);
                      const isSelected = currentJuzs.includes(String(juz));
                      return (
                        <button
                          key={juz}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? currentJuzs.filter(j => j !== String(juz))
                              : [...currentJuzs, String(juz)].sort(
                                  (a, b) => Number(a) - Number(b)
                                );
                            setEditingParticipant({
                              ...editingParticipant,
                              juzsOrSurahs: `الأجزاء: ${next.join('، ')}`,
                            });
                          }}
                          className={`min-h-[36px] p-1 text-xs rounded-xl font-black transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {juz}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(editingParticipant.juzsOrSurahs || '').startsWith('السور:') && (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pt-1">
                    {surahNames.slice(1).map((surah, idx) => {
                      const currentSurahs = (editingParticipant.juzsOrSurahs || '')
                        .replace('السور:', '')
                        .split('،')
                        .map(s => s.trim())
                        .filter(Boolean);
                      const isSelected = currentSurahs.includes(surah);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? currentSurahs.filter(s => s !== surah)
                              : [...currentSurahs, surah];
                            setEditingParticipant({
                              ...editingParticipant,
                              juzsOrSurahs: `السور: ${next.join('، ')}`,
                            });
                          }}
                          className={`min-h-[34px] px-2.5 py-1 text-xs rounded-xl font-bold transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {surah}
                        </button>
                      );
                    })}
                  </div>
                )}

                <input
                  type="text"
                  value={editingParticipant.juzsOrSurahs || ''}
                  onChange={e =>
                    setEditingParticipant({
                      ...editingParticipant,
                      juzsOrSurahs: e.target.value,
                    })
                  }
                  placeholder="نطاق التقييم (مثال: الأجزاء: 26، 27، 28، 29، 30 أو 5 أجزاء)"
                  className="w-full min-h-[42px] border border-slate-300 dark:border-slate-700 p-2.5 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs sm:text-sm"
                />
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
    'score_desc' | 'score_asc' | 'name' | 'level'
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

  // إحصائيات عامة للنتائج المتوفرة
  const totalStudentsCount = allResults.length;
  const availableResultsList = allResults.filter(r => r.evaluationsCount > 0);
  const evaluatedStudentsCount = availableResultsList.length;
  const unmemorizedStudentsCount = allResults.filter(r => r.isUnmemorized).length;
  const memorizedStudentsCount = allResults.filter(
    r => r.evaluationsCount > 0 && !r.isUnmemorized
  ).length;
  const multiEvaluatedCount = allResults.filter(
    r => r.evaluationsCount > 1
  ).length;

  const overallAverage =
    memorizedStudentsCount > 0
      ? Number(
          (
            allResults
              .filter(r => r.averageScore !== null && !r.isUnmemorized)
              .reduce((sum, r) => sum + (r.averageScore || 0), 0) /
            memorizedStudentsCount
          ).toFixed(2)
        )
      : null;

  const topScorerResult = React.useMemo(() => {
    const valid = allResults
      .filter(r => r.averageScore !== null && !r.isUnmemorized)
      .sort(
        (a, b) =>
          (b.percentage || 0) - (a.percentage || 0) ||
          (b.averageScore || 0) - (a.averageScore || 0)
      );
    return valid[0] || null;
  }, [allResults]);

  // إذا لم يكن هناك أي نتائج مرصودة بعد، نعرض تلقائياً جميع المسجلين حتى لا يظهر الجدول فارغاً
  const effectiveStatusFilter =
    evalStatusFilter === 'available' && evaluatedStudentsCount === 0
      ? 'all'
      : evalStatusFilter;

  // فرز وتصفية النتائج
  const filteredResults = allResults
    .filter(r => {
      if (
        selectedLevelId !== 'all' &&
        Number(r.effectiveLevelId) !== Number(selectedLevelId)
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

      if (
        searchQuery.trim() &&
        !r.participant.name
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      ) {
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

    return allResults
      .filter(r => {
        if (
          selectedLevelId !== 'all' &&
          Number(r.effectiveLevelId) !== Number(selectedLevelId)
        ) {
          return false;
        }
        if (effectiveMode === 'available' && r.evaluationsCount === 0) {
          return false;
        }
        if (effectiveMode === 'multi_only' && r.evaluationsCount < 2) {
          return false;
        }
        if (
          searchQuery.trim() &&
          !r.participant.name
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase())
        ) {
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
  }, [allResults, selectedLevelId, evalAvgFilterMode, evaluatedStudentsCount, searchQuery]);

  /**
   * تحويل الصور داخل عنصر التقرير إلى Data URL (Base64) لضمان ظهور الديباجة فوراً في ملف الـ PDF
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
            img.setAttribute('src', dataUrl);
          }
        } catch {
          // ignore individual image inline error
        }
      })
    );
  };

  /**
   * تصدير التقرير الرسمي إلى PDF بجودة عالية جداً وبخط عربي متصل وسليم 100% (غير متقطع ولا مقلوب)
   * يعتمد أولاً على محرك Chromium Vector PDF في الخادم (/api/pdf) مع خطي Tajawal و Cairo،
   * مع محرك احتياطي معالج لاتجاه النص العربي (RTL Canvas Shaping) عند عدم توفر الاتصال.
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
      'جاري تجهيز وتصدير التقرير الرسمي بملف PDF عالي الدقة...',
      'info'
    );

    try {
      // 1. تجهيز نسخة نظيفة من التقرير مع تضمين الصور والخطوط العربية المتصلة
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.no-print').forEach(n => n.remove());
      clone.classList.remove('dark:bg-slate-900', 'dark:border-slate-800');
      clone.style.backgroundColor = '#ffffff';
      clone.style.color = '#0f172a';
      clone.style.direction = 'rtl';
      clone.style.letterSpacing = '0px';

      await inlineImagesInClone(clone);

      // جمع كافة قواعد الأنماط الحالية (شاملة Tailwind)
      const headStyles = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
      )
        .map(node => node.outerHTML)
        .join('\n');

      const orientation = isLandscape ? 'landscape' : 'portrait';
      const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <base href="${window.location.origin}/" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
  ${headStyles}
  <style>
    @page {
      size: A4 ${orientation};
      margin: 6mm;
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
    }
    .no-print {
      display: none !important;
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    thead {
      display: table-header-group;
    }
  </style>
</head>
<body dir="rtl">
  <div style="width: 100%; padding: 4px; background: #ffffff; direction: rtl;">
    ${clone.outerHTML}
  </div>
</body>
</html>`;

      // المحاولة الأولى: التصدير المتجهي الأصلي عبر خادم الطباعة الرسمي (/api/pdf) لضمان خط عربي متصل 100% وغير مقلوب
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

      // المحرك الاحتياطي: html2canvas مع فرض اتجاه RTL ومنع تقطع الحروف العربية
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

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
          windowWidth: 1160,
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

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
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
      context?.showToast('تم تصدير ملف الـ PDF الرسمي بنجاح!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      context?.showToast('جارِ فتح نافذة الطباعة الرسمية...', 'info');
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // تصدير النتائج لملف إكسل (ورقة لكشف النتائج الشامل + ورقة لملخص متوسطات المقيمين)
  const exportExcel = () => {
    const evaluatorsList = activeEvaluatorsList;
    const data = filteredResults.map(r => {
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
        'اسم المتسابق': r.participant.name,
        المستوى: r.level?.name || '',
        'المقرر / الأجزاء':
          r.participant.juzsOrSurahs || r.level?.juzsOrSurahs || '',
        'حالة الحفظ': r.isUnmemorized
          ? 'غير حافظ'
          : r.evaluationsCount > 0
          ? 'حافظ'
          : 'بانتظار التقييم',
        'الدرجة العظمى': r.maxScore,
        'عدد المقيمين': r.evaluationsCount,
      };

      evaluatorsList.forEach(evaluatorItem => {
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

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'النتائج ومتوسطات المقيمين');
    XLSX.writeFile(wb, `تقرير_نتائج_ومتوسطات_${comp.name}.xlsx`);
  };

  // حذف تقييم
  const handleDeleteEvaluation = (evaluationId: string) => {
    if (!onUpdate) return;
    const updatedEvals = (comp.evaluations || []).filter(
      ev => String(ev.id) !== String(evaluationId)
    );
    onUpdate({
      ...comp,
      evaluations: updatedEvals,
    });
    setDeleteConfirmEvalId(null);
    context?.showToast('تم حذف التقييم بنجاح', 'success');
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
    availableResultsList.length > 0 ? availableResultsList : allResults;

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

      {/* شريط اختيار نوع التقرير المطلوب وأزرار التصدير */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 no-print">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 w-full xl:w-auto">
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
            className={`min-h-[44px] px-3 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer col-span-2 sm:col-span-1 ${
              reportSubTab === 'certificate'
                ? 'bg-[#09152C] text-amber-300 shadow-md border border-amber-400/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Medal size={16} className="text-amber-400 shrink-0" />
            <span>بطاقات التقييم الرسمية</span>
          </button>
        </div>

        {/* أزرار التصدير والطباعة السريعة */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          <button
            type="button"
            onClick={exportExcel}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet size={16} />
            <span>تصدير Excel</span>
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
              } else if (reportSubTab === 'evaluator_averages') {
                exportToPdf(
                  'official-report-evaluator-avg-container',
                  `ملخص_متوسطات_المقيمين_${comp.name}`,
                  true
                );
              } else if (reportSubTab === 'analytics') {
                exportToPdf(
                  'official-report-analytics-container',
                  `تقرير_تحليلي_${comp.name}`
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

            <div className="flex items-center gap-2">
              <label className="text-xs font-black text-slate-600 dark:text-slate-300 shrink-0">
                تصفية المستوى:
              </label>
              <select
                value={selectedLevelId}
                onChange={e =>
                  setSelectedLevelId(
                    e.target.value === 'all' ? 'all' : Number(e.target.value)
                  )
                }
                className="min-h-[40px] px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-xs font-black"
              >
                <option value="all">جميع المستويات</option>
                {(comp.levels || []).map(lvl => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* أولاً: ملخص النتائج المتوفرة حسب كل مستوى (منصة التتويج + جدول المستوى ذي الحقول المتعددة) */}
          <div className="space-y-7">
            {(() => {
              const targetLevels = (comp.levels || []).filter(
                l =>
                  selectedLevelId === 'all' ||
                  Number(l.id) === Number(selectedLevelId)
              );

              const levelsWithEvaluations = targetLevels.filter(lvl =>
                allResults.some(
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
                      لا يوجد متسابقون مسجلون في هذا المستوى حالياً
                    </p>
                  </div>
                );
              }

              return levelsToRender.map(lvl => {
                const levelSegmentsCount = Math.max(
                  1,
                  Number(lvl.segmentsCount || 5)
                );
                const levelAllParticipants = allResults.filter(
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
                                    <div className="text-xs font-bold text-slate-600 mt-0.5">
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
                                    colSpan={2}
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
                                  <th className="p-2.5 border-l border-white/15 min-w-[140px]">
                                    اسم المتسابق
                                  </th>
                                  <th className="p-2.5 border-l border-white/15 min-w-[110px]">
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

                                      <td className="p-2.5 font-black text-slate-900 dark:text-white text-xs sm:text-sm border-l border-slate-200 dark:border-slate-800">
                                        {w.participant.name}
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
                                      colSpan={3 + levelSegmentsCount + 1}
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
          <div className="pt-8 mt-8 border-t-2 border-amber-400/60 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200">
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
                  placeholder="بحث باسم المتسابق..."
                  className="w-full min-h-[38px] pr-8 pl-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                />
                <Search
                  className="absolute right-2.5 top-2.5 text-slate-400"
                  size={15}
                />
              </div>

              <select
                value={selectedLevelId}
                onChange={e =>
                  setSelectedLevelId(
                    e.target.value === 'all' ? 'all' : Number(e.target.value)
                  )
                }
                className="min-h-[38px] px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs font-black"
              >
                <option value="all">جميع المستويات</option>
                {(comp.levels || []).map(lvl => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name}
                  </option>
                ))}
              </select>
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
                      colSpan={3}
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
                    <th className="p-2.5 border-l border-white/15 min-w-[150px]">
                      اسم المتسابق
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

                        <td className="p-2.5 border-l border-slate-200 dark:border-slate-800 font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                          {r.participant.name}
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
                        colSpan={11 + Math.max(1, activeEvaluatorsList.length)}
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
                        colSpan={5}
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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                  بحث باسم المتسابق
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="اكتب اسم المتسابق..."
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
                  تصفية حسب المستوى
                </label>
                <select
                  value={selectedLevelId}
                  onChange={e =>
                    setSelectedLevelId(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  className="w-full min-h-[40px] px-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                >
                  <option value="all">
                    جميع المستويات ({allResults.length})
                  </option>
                  {(comp.levels || []).map(lvl => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
                  تصفية حسب المقيم
                </label>
                <select
                  value={selectedEvaluatorId}
                  onChange={e =>
                    setSelectedEvaluatorId(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  className="w-full min-h-[40px] px-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs font-bold"
                >
                  <option value="all">جميع المقيمين</option>
                  {activeEvaluatorsList.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
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
                  <option value="name">اسم المتسابق (أبجدي)</option>
                  <option value="level">اسم المستوى</option>
                </select>
              </div>
            </div>

            {/* أزرار الحالات السريعة مع إبراز خيار النتائج المتوفرة */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                {
                  id: 'available',
                  label: `النتائج المتوفرة المرصودة (${evaluatedStudentsCount})`,
                },
                { id: 'all', label: `جميع المسجلين (${allResults.length})` },
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
                      colSpan={2}
                      className="p-2.5 text-center border-l border-white/15 bg-[#071022]"
                    >
                      المركز والترتيب
                    </th>
                    <th
                      colSpan={3}
                      className="p-2.5 text-center border-l border-white/15"
                    >
                      بيانات المتسابق والمستوى القرآني
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
                    <th className="p-2.5 border-l border-white/15 min-w-[145px]">
                      اسم المتسابق
                    </th>
                    <th className="p-2.5 border-l border-white/15 min-w-[110px]">
                      المستوى
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
                      selectedLevelId !== 'all' ? r.rankInLevel : r.overallRank;
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

                        {/* اسم المتسابق */}
                        <td className="p-2.5 font-black text-slate-900 dark:text-white text-xs sm:text-sm border-l border-slate-200 dark:border-slate-800">
                          {r.participant.name}
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
                        colSpan={14}
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
            reportTitle="التقرير الإحصائي والرسوم البيانية التحليلية"
            reportSubtitle="تحليل فني وإحصائي لمستويات الأداء والتقديرات وإنجاز لجان التحكيم"
            metaStats={reportHeaderStats}
          />

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
                تقييمات متعددة اللجان
              </span>
              <span className="text-2xl font-black text-sky-950 dark:text-sky-300 mt-1 block">
                {multiEvaluatedCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
                تم تقييمهم من أكثر من مقيم
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

          {/* الرسم البياني 1: توزيع التقديرات */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              <span>توزيع النتائج المتوفرة للمتسابقين الحافظين حسب التقدير</span>
            </h4>

            {(() => {
              const memorizedEvals = allResults.filter(
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

          {/* الرسم البياني 2: مقارنة متوسطات المستويات */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Award size={18} className="text-amber-500" />
              <span>مقارنة متوسط الأداء ونسب الإنجاز بين المستويات القرآنية</span>
            </h4>

            <div className="space-y-4">
              {(comp.levels || []).map(lvl => {
                const lvlAll = allResults.filter(
                  r => Number(r.effectiveLevelId) === Number(lvl.id)
                );
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

                return (
                  <div key={lvl.id} className="space-y-1.5">
                    <div className="flex flex-wrap justify-between items-center text-xs font-black text-slate-800 dark:text-slate-200 gap-2">
                      <span>
                        {lvl.name} (النتائج المتوفرة: {lvlResults.length} من{' '}
                        {lvlAll.length})
                      </span>
                      <span className="text-emerald-800 dark:text-amber-300">
                        متوسط المستوى: {avgLvlScore} من {lvl.maxScore} (
                        {percentLvl}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-5 rounded-xl overflow-hidden p-0.5">
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

          {/* الرسم البياني 3: نشاط وإنجاز المقيمين */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck size={18} className="text-amber-500" />
              <span>إحصائية رصد وإنجاز المقيمين المعتمدين</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(comp.evaluators || []).map(ev => {
                const evCount = (comp.evaluations || []).filter(
                  e => Number(e.evaluatorId) === Number(ev.id)
                ).length;

                return (
                  <div
                    key={ev.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-black text-sm text-slate-900 dark:text-white block">
                        {ev.name}
                      </span>
                      <span className="text-xs text-slate-500 font-bold">
                        مقيم معتمد بالمسابقة
                      </span>
                    </div>
                    <span className="px-3 py-1 bg-[#09152C] text-amber-300 font-black text-xs rounded-xl">
                      {evCount} تقييم مرصود
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================ 4. تبويب بطاقات وشهادات التقييم الرسمية ================ */}
      {reportSubTab === 'certificate' && (
        <div className="space-y-6">
          {/* اختيار المتسابق no-print */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <label className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                اختر المتسابق لعرض بطاقة النتيجة الرسمية:
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
                {allResults.map(r => (
                  <option key={r.participant.id} value={r.participant.id}>
                    {r.participant.name} — {r.level?.name}{' '}
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

              {/* بيانات المتسابق الأساسية */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-amber-50/60 border-2 border-amber-200 text-xs font-bold">
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">اسم المتسابق:</span>
                  <span className="text-base sm:text-lg font-black text-[#09152C] mt-0.5 block">
                    {certParticipant.participant.name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">المستوى المشارك:</span>
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

                <div className="sm:col-span-4 pt-2 border-t border-amber-200/70">
                  <span className="text-slate-500">المقرر والأجزاء المختارة: </span>
                  <span className="font-black text-slate-900">
                    {certParticipant.participant.juzsOrSurahs ||
                      certParticipant.level?.juzsOrSurahs}
                  </span>
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

      {/* نافذة تأكيد حذف تقييم */}
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

      {/* نافذة تأكيد استبعاد متسابق */}
      <ConfirmDeleteModal
        isOpen={!!excludeParticipantTarget}
        title="تأكيد استبعاد المتسابق"
        message="هل أنت متأكد من إخراج واستبعاد المتسابق من المسابقة؟"
        confirmLabel="نعم، تأكيد الاستبعاد"
        onConfirm={handleExcludeUnmemorizedConfirm}
        onClose={() => setExcludeParticipantTarget(null)}
      />
    </div>
  );
}


