import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../../App';
import {
  Competition,
  CompetitionLevel,
  CompetitionEvaluator,
  CompetitionParticipant,
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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { surahNames } from '../../utils/quranData';
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
    errors: (lvl.errors || []).map((err, eIdx) => ({
      ...err,
      id: err.id || eIdx + 1,
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
}: {
  onOpenPassagesPage?: () => void;
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

  const [activeTab, setActiveTab] = useState<
    'general' | 'settings' | 'evaluators' | 'participants' | 'reports'
  >('settings');

  const activeCompetition = competitions.find(c => c.id === activeCompetitionId);

  const handleCreateCompetition = (
    name: string,
    options?: CreateCompetitionOptions
  ) => {
    const sourceComp = options?.sourceCompetitionId
      ? competitions.find(c => c.id === options.sourceCompetitionId)
      : undefined;

    const baseTime = Date.now();

    const defaultLevels: CompetitionLevel[] = [
      {
        id: 1,
        name: 'المستوى الأول (خمسة أجزاء)',
        juzsOrSurahs: '5 أجزاء',
        segmentsCount: 3,
        linesPerSegment: 7,
        maxScore: 100,
        errors: [
          { id: 1, name: 'التنبيه', deduction: 0.5 },
          { id: 2, name: 'الفتح', deduction: 1 },
          { id: 3, name: 'التشكيل', deduction: 1 },
          { id: 4, name: 'التجويد', deduction: 0.5 },
        ],
      },
    ];

    const clonedLevels =
      sourceComp && (sourceComp.levels || []).length > 0
        ? deepCloneLevels(sourceComp.levels)
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
      isActive: true,
      passageMode: sourceComp?.passageMode || 'random',
      previewLinesPerSegment: sourceComp?.previewLinesPerSegment,
      manualPassages: sourceComp?.manualPassages
        ? sourceComp.manualPassages.map((mp, idx) => ({
            ...mp,
            id: `mp-${mp.juzNumber}-${idx}-${baseTime}`,
          }))
        : [],
      levels: clonedLevels,
      evaluators: clonedEvaluators,
      participants: clonedParticipants,
      evaluations: [],
    };

    const updated = competitions.map(c => ({ ...c, isActive: false }));
    updateCompetitions([...updated, newComp]);
    setActiveCompetitionId(newComp.id);
    setActiveTab('settings');

    if (sourceComp) {
      showToast(
        `تم نسخ إعدادات ومستويات "${sourceComp.name}" إلى "${name}" بنجاح! يمكنك التعديل عليها الآن.`,
        'success'
      );
    } else {
      showToast('تم إنشاء المسابقة بنجاح!', 'success');
    }
  };

  const handleUpdateActiveComp = (updatedComp: Competition) => {
    updateCompetitions(
      competitions.map(c => (c.id === updatedComp.id ? updatedComp : c))
    );
  };

  if (!activeCompetition) {
    return (
      <CompetitionGeneralSettings
        competitions={competitions}
        onCreate={handleCreateCompetition}
        onSelect={id => {
          updateCompetitions(
            competitions.map(c => ({ ...c, isActive: c.id === id }))
          );
          setActiveCompetitionId(id);
        }}
        onDelete={id => {
          updateCompetitions(competitions.filter(c => c.id !== id));
          if (activeCompetitionId === id) setActiveCompetitionId(null);
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
            <span className="text-[11px] font-bold text-slate-400 block">
              المسابقة النشطة حالياً
            </span>
            <h2 className="text-base sm:text-2xl font-black text-emerald-950 dark:text-emerald-300 truncate">
              {activeCompetition.name}
            </h2>
          </div>
        </div>

        <button
          onClick={() => setActiveCompetitionId(null)}
          className="w-full sm:w-auto min-h-[44px] text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
        >
          <span>تبديل أو إضافة مسابقة</span>
          <ChevronRight size={16} className="rotate-180" />
        </button>
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
              handleCreateCompetition(newName, {
                sourceCompetitionId: activeCompetition.id,
                ...opts,
              })
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
  onDelete,
}: {
  competitions: Competition[];
  onCreate: (n: string, options?: CreateCompetitionOptions) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
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

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-4 sm:p-6 max-w-2xl mx-auto mt-2 sm:mt-6 text-slate-800 dark:text-slate-100 border border-emerald-100 dark:border-slate-800"
      dir="rtl"
    >
      <h2 className="text-lg sm:text-2xl font-black mb-4 sm:mb-6 flex items-center gap-2 text-emerald-950 dark:text-emerald-300">
        <Award className="text-emerald-600 shrink-0" />
        <span>إدارة المسابقات القرآنية</span>
      </h2>

      <div className="mb-6 sm:mb-8 p-4 rounded-2xl bg-emerald-50/50 dark:bg-slate-800/50 border border-emerald-200/70 dark:border-slate-700 space-y-3.5">
        <label className="block text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
          إضافة مسابقة قرآنية جديدة
        </label>

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
                onCreate(newName.trim(), {
                  sourceCompetitionId: sourceCompetitionId || undefined,
                  copyEvaluators,
                  copyParticipants,
                });
                setNewName('');
                setSourceCompetitionId('');
              }
            }}
            className="w-full sm:w-auto min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
          >
            <Plus size={20} />
            <span>
              {sourceCompetitionId ? 'إنشاء بنسخ الإعدادات' : 'إنشاء المسابقة'}
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
                {competitions.map(c => (
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

      {competitions.length > 0 && (
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-700 dark:text-slate-300 mb-3">
            المسابقات المسجلة
          </h3>
          <div className="space-y-3">
            {competitions.map(comp => {
              const isCloningThis = cloningCompId === comp.id;
              return (
                <div
                  key={comp.id}
                  className="p-3.5 sm:p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/70 dark:bg-slate-800/60 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-black text-base sm:text-lg block text-emerald-950 dark:text-white">
                        {comp.name}
                      </span>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>المستويات: {(comp.levels || []).length}</span>
                        <span>•</span>
                        <span>المقيمين: {(comp.evaluators || []).length}</span>
                        <span>•</span>
                        <span>المشاركين: {(comp.participants || []).length}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(comp.id)}
                        className="flex-1 sm:flex-initial min-h-[44px] bg-emerald-700 text-white hover:bg-emerald-800 px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition active:scale-95 flex items-center justify-center cursor-pointer shadow-xs"
                      >
                        فتح وإدارة المسابقة
                      </button>

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
                        className={`flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border ${
                          isCloningThis
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/60'
                        }`}
                        title="نسخ إعدادات هذه المسابقة بجميع مستوياتها لمسابقة جديدة"
                      >
                        <Copy size={16} />
                        <span>نسخ لمسابقة جديدة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTargetComp(comp)}
                        className="min-h-[44px] min-w-[44px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/50 p-2.5 rounded-xl transition active:scale-95 flex items-center justify-center cursor-pointer"
                        title="حذف المسابقة"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* نافذة النسخ السريع المضمنة لنسخ المسابقة بجميع مستوياتها والتعديل عليها */}
                  {isCloningThis && (
                    <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-slate-900 border border-amber-300 dark:border-amber-800/70 space-y-3">
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
                            onCreate(cloneNewName.trim(), {
                              sourceCompetitionId: comp.id,
                              copyEvaluators: cloneCopyEvaluators,
                              copyParticipants: cloneCopyParticipants,
                            });
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
  const [cloneName, setCloneName] = useState(`${comp.name} (نسخة جديدة)`);
  const [copyEvaluators, setCopyEvaluators] = useState(true);
  const [copyParticipants, setCopyParticipants] = useState(false);
  const context = useContext(AppContext);

  const handleSave = () => {
    if (!name.trim()) return;
    onUpdate({ ...comp, name: name.trim() });
    context?.showToast('تم حفظ الإعدادات العامة!', 'success');
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
  // نص الأسماء المتعددة الأسطر لكل مستوى على حدة
  const [bulkNamesByLevel, setBulkNamesByLevel] = useState<Record<number, string>>({});
  const [targetImportLevelId, setTargetImportLevelId] = useState<number | null>(null);
  const [importFromCompId, setImportFromCompId] = useState<string>('');
  const [deleteConfirmLevel, setDeleteConfirmLevel] = useState<CompetitionLevel | null>(null);
  const [deleteConfirmError, setDeleteConfirmError] = useState<{ levelId: number; error: any } | null>(null);
  const [deleteConfirmLevelParticipant, setDeleteConfirmLevelParticipant] = useState<{ id: number; name: string } | null>(null);
  const [editingDeductions, setEditingDeductions] = useState<Record<string, string>>({});
  const excelInputRef = useRef<HTMLInputElement>(null);
  const context = useContext(AppContext);

  const otherCompetitions = (allCompetitions || []).filter(c => c.id !== comp.id);

  // تحديث المستويات عند تبديل المسابقة النشطة
  React.useEffect(() => {
    setLevels(comp.levels || []);
    setEditingDeductions({});
  }, [comp.id]);

  const handleSave = () => {
    onUpdate({ ...comp, levels });
    context?.showToast('تم حفظ إعدادات المستويات بنجاح!', 'success');
  };

  const handleCancel = () => {
    setLevels(comp.levels || []);
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
    let nextLevels: CompetitionLevel[];

    if (mode === 'replace') {
      nextLevels = cloned.map((lvl, idx) => ({
        ...lvl,
        id: idx + 1,
      }));
    } else {
      const maxExistingId =
        levels.length > 0 ? Math.max(...levels.map(l => l.id)) : 0;
      nextLevels = [
        ...levels,
        ...cloned.map((lvl, idx) => ({
          ...lvl,
          id: maxExistingId + idx + 1,
        })),
      ];
    }

    setLevels(nextLevels);
    onUpdate({ ...comp, levels: nextLevels });
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
      errors: (levelToCopy.errors || []).map(e => ({ ...e })),
    };
    const nextLevels = [...levels, duplicated];
    setLevels(nextLevels);
    onUpdate({ ...comp, levels: nextLevels });
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
        segmentsCount: 3,
        linesPerSegment: 7,
        maxScore: 100,
        errors: [
          { id: 1, name: 'التنبيه', deduction: 0.5 },
          { id: 2, name: 'الفتح', deduction: 1 },
          { id: 3, name: 'التشكيل', deduction: 1 },
          { id: 4, name: 'التجويد', deduction: 0.5 },
        ],
      },
    ];
    setLevels(nextLevels);
    onUpdate({ ...comp, levels: nextLevels });
  };

  const updateLevel = (id: number, updated: Partial<CompetitionLevel>) => {
    setLevels(levels.map(l => (l.id === id ? { ...l, ...updated } : l)));
  };

  const removeLevel = (id: number) => {
    const nextLevels = levels.filter(l => l.id !== id);
    setLevels(nextLevels);
    onUpdate({ ...comp, levels: nextLevels });
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
                segmentsCount: 3,
                linesPerSegment: 7,
                maxScore: 100,
                errors: [
                  { id: 1, name: 'التنبيه', deduction: 0.5 },
                  { id: 2, name: 'الفتح', deduction: 1 },
                  { id: 3, name: 'التشكيل', deduction: 1 },
                  { id: 4, name: 'التجويد', deduction: 0.5 },
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
                        عدد المقاطع للاختبار
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={level.segmentsCount}
                        onChange={e =>
                          updateLevel(level.id, {
                            segmentsCount: Number(e.target.value),
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
                        onChange={e =>
                          updateLevel(level.id, {
                            maxScore: Number(e.target.value),
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

              {/* Errors setup */}
              <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-col xs:flex-row justify-between items-stretch xs:items-center gap-2">
                  <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-200">
                    معايير الخصم والأخطاء (الافتراضي: التنبيه، الفتح، التشكيل، التجويد)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const currentErrors = level.errors || [];
                      const newErrId =
                        currentErrors.length > 0
                          ? Math.max(...currentErrors.map(e => e.id)) + 1
                          : 1;
                      updateLevel(level.id, {
                        errors: [
                          ...currentErrors,
                          { id: newErrId, name: 'خطأ جديد', deduction: 1 },
                        ],
                      });
                    }}
                    className="min-h-[40px] text-xs bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-2 rounded-xl hover:bg-emerald-100 font-extrabold flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer shrink-0"
                  >
                    <Plus size={15} />
                    <span>إضافة نوع خطأ</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(level.errors || []).map(err => (
                    <div
                      key={err.id}
                      className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                          نوع الخطأ
                        </span>
                        <input
                          type="text"
                          value={err.name}
                          onFocus={e => e.currentTarget.select()}
                          onClick={e => e.currentTarget.select()}
                          onChange={e => {
                            const updatedErrs = (level.errors || []).map(er =>
                              er.id === err.id
                                ? { ...er, name: e.target.value }
                                : er
                            );
                            updateLevel(level.id, { errors: updatedErrs });
                          }}
                          className="w-full min-h-[40px] border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-white dark:bg-slate-900"
                          placeholder="اسم الخطأ"
                        />
                      </div>
                      <div className="w-24 shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                          مقدار الخصم
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          value={
                            editingDeductions[`${level.id}_${err.id}`] !== undefined
                              ? editingDeductions[`${level.id}_${err.id}`]
                              : String(err.deduction ?? 0)
                          }
                          onFocus={e => e.currentTarget.select()}
                          onClick={e => e.currentTarget.select()}
                          onChange={e => {
                            // تحويل الأرقام العربية إن وجدت والفاصلة إلى نقطة عشرية
                            const normalized = e.target.value
                              .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                              .replace(',', '.');
                            if (!/^\d*\.?\d*$/.test(normalized)) return;
                            const key = `${level.id}_${err.id}`;
                            setEditingDeductions(prev => ({ ...prev, [key]: normalized }));
                            const parsed = normalized === '' || normalized === '.' ? 0 : Number(normalized);
                            if (!Number.isNaN(parsed)) {
                              const updatedErrs = (level.errors || []).map(er =>
                                er.id === err.id
                                  ? { ...er, deduction: parsed }
                                  : er
                              );
                              updateLevel(level.id, { errors: updatedErrs });
                            }
                          }}
                          onBlur={() => {
                            const key = `${level.id}_${err.id}`;
                            setEditingDeductions(prev => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                          }}
                          className="w-full min-h-[40px] border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-center bg-white dark:bg-slate-900"
                          placeholder="الخصم"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteConfirmError({
                            levelId: level.id,
                            error: err,
                          })
                        }
                        className="min-h-[40px] min-w-[40px] mt-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg flex items-center justify-center transition active:scale-95 shrink-0 cursor-pointer"
                        title="حذف نوع الخطأ"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
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
        message="هل أنت متأكد من حذف هذا البند من بنود الخصم والأخطاء؟"
        itemTitle={deleteConfirmError?.error?.name}
        confirmLabel="نعم، حذف البند"
        onConfirm={() => {
          if (deleteConfirmError) {
            const target = levels.find(l => l.id === deleteConfirmError.levelId);
            if (target) {
              updateLevel(target.id, {
                errors: (target.errors || []).filter(
                  er => er.id !== deleteConfirmError.error.id
                ),
              });
            }
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
}: {
  comp: Competition;
  onUpdate: (c: Competition) => void;
}) {
  const context = useContext(AppContext);
  const globalEvaluators = context?.globalEvaluators || [];

  const [selectedGlobalId, setSelectedGlobalId] = useState<string>('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [deleteConfirmEval, setDeleteConfirmEval] = useState<CompetitionEvaluator | null>(null);
  const [editingEval, setEditingEval] = useState<CompetitionEvaluator | null>(null);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const [selectedGlobalIds, setSelectedGlobalIds] = useState<number[]>([]);

  // عند اختيار مقيم معتمد من القائمة المنسدلة
  const handleSelectGlobalEvaluator = (idStr: string) => {
    setSelectedGlobalId(idStr);
    if (!idStr) {
      setName('');
      setPin('');
      return;
    }

    const found = globalEvaluators.find(g => String(g.id) === idStr);
    if (found) {
      setName(found.name);
      setPin(found.pin);

      // للتحقق مما إذا كان المقيم مضافاً سابقاً للتعرف على مستوياته المسندة
      const existingInComp = (comp.evaluators || []).find(
        e => e.name.trim().toLowerCase() === found.name.trim().toLowerCase()
      );

      if (existingInComp && existingInComp.levelIds && existingInComp.levelIds.length > 0) {
        setSelectedLevels(existingInComp.levelIds);
      } else if (selectedLevels.length === 0) {
        // بالافتراضي تحديد كافة المستويات
        setSelectedLevels((comp.levels || []).map(l => l.id));
      }
    }
  };

  // دوال مساعدة لتوليد كلمات مرور تلقائية متنوعة
  const generateNumericPin = () => {
    const val = String(Math.floor(1000 + Math.random() * 9000));
    setPin(val);
  };

  const generateAlphaNumeric = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPin(res);
  };

  const generateStrongWithSymbols = () => {
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowers = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const syms = '!@#$%&*';
    const all = uppers + lowers + nums + syms;
    let res =
      uppers.charAt(Math.floor(Math.random() * uppers.length)) +
      lowers.charAt(Math.floor(Math.random() * lowers.length)) +
      nums.charAt(Math.floor(Math.random() * nums.length)) +
      syms.charAt(Math.floor(Math.random() * syms.length));
    for (let i = 0; i < 4; i++) {
      res += all.charAt(Math.floor(Math.random() * all.length));
    }
    setPin(res);
  };

  const handleAdd = () => {
    if (!name.trim() || !pin) {
      context?.showToast('الرجاء اختيار مقيم معتمد أو إدخال اسمه وكلمة المرور', 'error');
      return;
    }

    const assignedLevelIds =
      selectedLevels.length > 0
        ? selectedLevels
        : (comp.levels || []).map(l => l.id);

    const existingIndex = (comp.evaluators || []).findIndex(
      e => e.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      // تحديث المقيم والمستويات المسندة له في المسابقة
      const updated = [...(comp.evaluators || [])];
      updated[existingIndex] = {
        ...updated[existingIndex],
        pin: pin,
        levelIds: assignedLevelIds,
      };
      onUpdate({ ...comp, evaluators: updated });
      context?.showToast(`تم تحديث مستويات المقيم (${name}) في المسابقة بنجاح!`, 'success');
    } else {
      // إضافة مقيم جديد للمسابقة
      const newEval: CompetitionEvaluator = {
        id: Date.now(),
        name: name.trim(),
        pin: pin,
        levelIds: assignedLevelIds,
      };
      onUpdate({ ...comp, evaluators: [...(comp.evaluators || []), newEval] });

      // مزامنة أوتوماتيكية مع السجل العام للمقيمين المعتمدين إذا لم يكن مسجلاً
      if (context?.globalEvaluators && context?.updateGlobalEvaluators) {
        if (!context.globalEvaluators.some(ge => ge.name.trim().toLowerCase() === name.trim().toLowerCase())) {
          context.updateGlobalEvaluators([
            ...context.globalEvaluators,
            {
              id: newEval.id,
              name: newEval.name,
              pin: newEval.pin || '1234',
              createdAt: Date.now(),
            },
          ]);
        }
      }
      context?.showToast(`تمت إضافة المقيم (${name}) للمسابقة بالمستويات المحددة!`, 'success');
    }

    // إعادة ضبط النموذج
    setSelectedGlobalId('');
    setName('');
    setPin('');
    setSelectedLevels([]);
  };

  // إستيراد المحددين من السجل العام للمسابقة الحالية
  const handleImportFromGlobal = () => {
    if (selectedGlobalIds.length === 0) {
      context?.showToast('يرجى تحديد مقيم واحد على الأقل من السجل العام', 'error');
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
    context?.showToast(`تمت إضافة (${addedCount}) مقيم من السجل العام إلى هذه المسابقة!`, 'success');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEval) return;
    if (!editingEval.name.trim() || !editingEval.pin) {
      context?.showToast('يرجى ملء اسم المقيم وكلمة المرور', 'error');
      return;
    }

    const updated = (comp.evaluators || []).map(ev =>
      ev.id === editingEval.id ? editingEval : ev
    );
    onUpdate({ ...comp, evaluators: updated });
    setEditingEval(null);
    context?.showToast('تم تحديث بيانات المقيم والمستويات المسندة بنجاح!', 'success');
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* بطاقة إضافة أو تحديد المقيمين للمسابقة */}
      <div className="bg-slate-50 dark:bg-slate-800/60 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-black text-sm sm:text-base text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span>إضافة مقيم للمسابقة وتحديد المستويات المسندة له</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              اختر مقيماً معتمداً من القائمة المنسدلة، ثم حدد المستويات التي سيقوم بتحكيمها في هذه المسابقة.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedGlobalIds([]);
              setShowGlobalModal(true);
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs sm:text-sm font-black transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-2xs"
          >
            <Users size={16} />
            <span>تحديد جملة من السجل العام ({globalEvaluators.length})</span>
          </button>
        </div>

        {/* 1. القائمة المنسدلة لاختيار المقيمين المعتمدين */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-slate-900/80 border border-emerald-200 dark:border-slate-700 space-y-2">
          <label className="block text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-300">
            اختيار المقيم من السجل العام للمقيمين المعتمدين:
          </label>
          <select
            value={selectedGlobalId}
            onChange={e => handleSelectGlobalEvaluator(e.target.value)}
            className="w-full min-h-[48px] border-2 border-emerald-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-800 font-bold text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">-- اختر مقيماً معتمداً من القائمة المنسدلة (أو أدخل اسمه يدوياً بالأسفل) --</option>
            {globalEvaluators.map(ge => {
              const inComp = (comp.evaluators || []).some(
                e => e.name.trim().toLowerCase() === ge.name.trim().toLowerCase()
              );
              return (
                <option key={ge.id} value={ge.id}>
                  {ge.name} (رمز الدخول: {ge.pin}){inComp ? ' - [مضاف سابقاً للمسابقة]' : ''}
                </option>
              );
            })}
          </select>
          {globalEvaluators.length === 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
              💡 لم تقم بإنشاء مقيمين في تبويب "المقيمون المعتمدون" بعد. يمكنك كتابة الاسم والرمز يدوياً بالأسفل، وسيتم حفظهم تلقائياً.
            </p>
          )}
        </div>

        {/* 2. حقول الاسم وكلمة المرور (تتعبأ تلقائياً عند الاختيار من القائمة) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
              اسم المقيم
            </label>
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setSelectedGlobalId('');
              }}
              className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-sm"
              placeholder="مثال: الشيخ عبدالله محمد..."
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                كلمة المرور / رمز الدخول (PIN)
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={generateNumericPin}
                  className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 transition cursor-pointer"
                  title="توليد 4 أرقام فقط"
                >
                  أرقام
                </button>
                <button
                  type="button"
                  onClick={generateAlphaNumeric}
                  className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 transition cursor-pointer"
                  title="توليد حروف وأرقام"
                >
                  حروف/أرقام
                </button>
                <button
                  type="button"
                  onClick={generateStrongWithSymbols}
                  className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-200 transition cursor-pointer flex items-center gap-0.5"
                  title="توليد مع رموز وحروف كبيرة وصغيرة"
                >
                  <Sparkles size={11} />
                  مع رموز
                </button>
              </div>
            </div>
            <input
              type="text"
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full min-h-[46px] border border-slate-300 dark:border-slate-700 p-3 rounded-xl bg-white dark:bg-slate-900 font-bold text-sm font-mono"
              placeholder="أرقام، أوهروف، أو رموز..."
            />
          </div>
        </div>

        {/* 3. تحديد المستويات المسندة للمقيم */}
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
              ⚠️ تنبيه: عند عدم تحديد أي مستوى، سيتم إسناد كافة المستويات تلقائياً لهذا المقيم.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="w-full sm:w-auto min-h-[48px] bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
        >
          <Plus size={18} />
          <span>إضافة المقيم إلى هذه المسابقة</span>
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

      {/* نافذة تعديل بيانات وكلمة مرور وتحديد مستويات المقيم */}
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
                تعديل بيانات المقيم والمستويات المسندة له
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
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  اسم المقيم
                </label>
                <input
                  type="text"
                  value={editingEval.name}
                  onChange={e =>
                    setEditingEval({ ...editingEval, name: e.target.value })
                  }
                  className="input-style font-bold text-sm"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    كلمة المرور / الرمز
                  </label>
                  <span className="text-[10px] text-slate-500 font-bold">
                    حروف (كبيرة/صغيرة)، أرقام، رموز
                  </span>
                </div>
                <input
                  type="text"
                  value={editingEval.pin}
                  onChange={e =>
                    setEditingEval({ ...editingEval, pin: e.target.value })
                  }
                  className="input-style font-mono font-bold text-sm text-left"
                  dir="ltr"
                  required
                />
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
                حفظ التعديلات
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const context = useContext(AppContext);

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
              <button
                type="button"
                onClick={() => setDeleteConfirmParticipant(p)}
                className="min-h-[42px] min-w-[42px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-center transition active:scale-95 shrink-0 cursor-pointer"
                title="حذف المشارك"
              >
                <Trash2 size={18} />
              </button>
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
              <th className="p-3.5 border-b dark:border-slate-700 w-24 text-center">إجراء</th>
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
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmParticipant(p)}
                    className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 size={18} />
                  </button>
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

function CompetitionReports({
  comp,
  onUpdate,
}: {
  comp: Competition;
  onUpdate?: (updated: Competition) => void;
}) {
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'all'>('all');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<number | 'all'>(
    'all'
  );
  const [evalStatusFilter, setEvalStatusFilter] = useState<
    'all' | 'evaluated' | 'memorized' | 'unmemorized' | 'not_evaluated' | 'multi_evaluated'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailParticipantId, setDetailParticipantId] = useState<number | null>(
    null
  );
  const [deleteConfirmEvalId, setDeleteConfirmEvalId] = useState<string | null>(null);
  const [excludeParticipantTarget, setExcludeParticipantTarget] = useState<CompetitionParticipant | 'all' | null>(null);
  const context = useContext(AppContext);

  // دالة مساعدة للحصول على اسم المقيم حتى لو تم تعديل قائمة المقيمين لاحقاً
  const getEvaluatorName = (evaluatorId: number, fallbackName?: string) => {
    const found = (comp.evaluators || []).find(
      e => Number(e.id) === Number(evaluatorId)
    );
    return found?.name || fallbackName || `مقيم #${evaluatorId}`;
  };

  // حساب نتائج كل طالب (جميع التقييمات من كل مقيم + المتوسط بين التقييمات في هذه المسابقة)
  const allResults = (comp.participants || [])
    .map(p => {
      const level = (comp.levels || []).find(
        l => Number(l.id) === Number(p.levelId)
      );
      const maxScore = level?.maxScore || 100;

      // جميع التقييمات المرصودة لهذا الطالب في هذه المسابقة من مختلف المقيمين
      const pEvals = (comp.evaluations || []).filter(
        ev => Number(ev.participantId) === Number(p.id)
      );

      // تحديد هل الطالب مصنف كـ "غير حافظ" سواء في سجله أو في أي تقييم أو مقطع
      const isUnmemorized =
        Boolean(p.isUnmemorized) ||
        pEvals.some(
          ev =>
            Boolean(ev.isUnmemorized) ||
            (ev.segments || []).some((s: any) => Boolean(s.isUnmemorized))
        );

      // حساب المتوسط بين جميع تقييمات المقيمين لهذا الطالب
      const avgScore =
        pEvals.length > 0
          ? pEvals.reduce((sum, ev) => sum + Number(ev.totalScore || 0), 0) /
            pEvals.length
          : null;

      const roundedAvg =
        avgScore !== null ? Number(avgScore.toFixed(2)) : null;
      const percentage =
        roundedAvg !== null && maxScore > 0
          ? Number(((roundedAvg / maxScore) * 100).toFixed(1))
          : null;

      // أعلى وأقل درجة بين المقيمين (في حال تقييمه من أكثر من مقيم)
      const highestScore =
        pEvals.length > 0
          ? Math.max(...pEvals.map(ev => Number(ev.totalScore || 0)))
          : null;
      const lowestScore =
        pEvals.length > 0
          ? Math.min(...pEvals.map(ev => Number(ev.totalScore || 0)))
          : null;

      return {
        participant: p,
        level,
        maxScore,
        evaluationsCount: pEvals.length,
        averageScore: roundedAvg,
        percentage,
        highestScore,
        lowestScore,
        evaluations: pEvals,
        isUnmemorized,
      };
    })
    .sort((a, b) => {
      // الحافظين أولاً مرتبين بالدرجات الأعلى، ثم غير الحافظين، ثم من لم يُقيّم
      if (a.isUnmemorized && !b.isUnmemorized) return 1;
      if (!a.isUnmemorized && b.isUnmemorized) return -1;
      if (a.averageScore === null && b.averageScore === null) return 0;
      if (a.averageScore === null) return 1;
      if (b.averageScore === null) return -1;
      return b.averageScore - a.averageScore;
    });

  // تطبيق الفلاتر (المستوى، المقيم، حالة التقييم، الحفظ، البحث بالاسم)
  const filteredResults = allResults.filter(r => {
    if (
      selectedLevelId !== 'all' &&
      Number(r.participant.levelId) !== Number(selectedLevelId)
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

    if (evalStatusFilter === 'evaluated' && r.evaluationsCount === 0) {
      return false;
    }
    if (evalStatusFilter === 'not_evaluated' && r.evaluationsCount > 0) {
      return false;
    }
    if (evalStatusFilter === 'multi_evaluated' && r.evaluationsCount < 2) {
      return false;
    }
    if (evalStatusFilter === 'memorized' && (r.isUnmemorized || r.evaluationsCount === 0)) {
      return false;
    }
    if (evalStatusFilter === 'unmemorized' && !r.isUnmemorized) {
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
  });

  // إحصائيات عامة للمشرف (قريبة من تقارير اختبارات إعداد حافظ)
  const totalStudentsCount = allResults.length;
  const evaluatedStudentsCount = allResults.filter(
    r => r.evaluationsCount > 0
  ).length;
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

  // حذف تقييم معين لمقيم في حال أراد المشرف إعادة التقييم
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

  // استبعاد الطلاب غير الحافظين
  const handleExcludeUnmemorizedConfirm = () => {
    if (!onUpdate || !excludeParticipantTarget) return;

    if (excludeParticipantTarget === 'all') {
      const unmemorizedIds = new Set(
        allResults.filter(r => r.isUnmemorized).map(r => Number(r.participant.id))
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
        `تم استبعاد جميع المتسابقين غير الحافظين وعددهم (${unmemorizedIds.size}) بنجاح!`,
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
        `تم استبعاد المتسابق "${excludeParticipantTarget.name}" من المسابقة بنجاح!`,
        'success'
      );
    }
    setExcludeParticipantTarget(null);
  };

  // تصدير النتائج المفصلة إلى ملف إكسل (شامل جميع تقييمات كل مقيم + المتوسط النهائي وحالة الحفظ)
  const exportReport = () => {
    const evaluatorsList = comp.evaluators || [];

    const data = filteredResults.map((r, idx) => {
      const row: Record<string, any> = {
        المركز: r.averageScore !== null && !r.isUnmemorized ? idx + 1 : (r.isUnmemorized ? 'غير حافظ' : '-'),
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

      // عمود مستقل لكل مقيم في المسابقة لعرض درجته المرصودة لهذا الطالب
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

      // ملخص نصي لجميع التقييمات من كل مقيم
      row['جميع التقييمات من كل مقيم'] =
        r.evaluations.length > 0
          ? r.evaluations
              .map(
                ev =>
                  `${getEvaluatorName(ev.evaluatorId, ev.evaluatorName)}: (${ev.isUnmemorized ? 'غير حافظ: 0' : ev.totalScore})`
              )
              .join(' | ')
          : 'لم يقيم';

      row['متوسط التقييمات النهائي'] =
        r.averageScore !== null
          ? r.isUnmemorized
            ? 'غير حافظ'
            : r.averageScore
          : 'لم يقيم';
      row['النسبة المئوية'] =
        r.percentage !== null && !r.isUnmemorized ? `${r.percentage}%` : '-';

      // ملاحظات المقيمين
      const notes = r.evaluations
        .map(e =>
          e.notes
            ? `${getEvaluatorName(e.evaluatorId, e.evaluatorName)}: ${e.notes}`
            : ''
        )
        .filter(Boolean)
        .join(' | ');
      row['ملاحظات التقييم'] = notes || '-';

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'النتائج والتقييمات');
    XLSX.writeFile(wb, `نتائج_${comp.name}.xlsx`);
  };

  const detailResult =
    detailParticipantId !== null
      ? allResults.find(
          r => Number(r.participant.id) === Number(detailParticipantId)
        )
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* الترويسة وزر تصدير النتائج */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div>
          <h3 className="font-black text-base sm:text-xl text-emerald-950 dark:text-emerald-300">
            كشف نتائج المسابقة وتقييمات المحكّمين ومتوسط الدرجات
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            يعرض لكل طالب جميع التقييمات المرصودة من كل مقيم، مع احتساب المتوسط التلقائي وفرز الطلاب الحافظين وغير الحافظين
          </p>
        </div>
        <button
          type="button"
          onClick={exportReport}
          className="w-full sm:w-auto min-h-[46px] bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-sm cursor-pointer shrink-0"
        >
          <Download size={18} />
          <span>تصدير كشف التقييمات والمتوسط (Excel)</span>
        </button>
      </div>

      {/* تنبيه وخيار استبعاد الطلاب غير الحافظين */}
      {unmemorizedStudentsCount > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/80 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black text-red-950 dark:text-red-200">
                يوجد ({unmemorizedStudentsCount}) متسابق مصنف «غير حافظ»
              </div>
              <p className="text-[11px] text-red-800/80 dark:text-red-300/80 font-bold">
                يمكنك فرزهم في الكشف أدناه أو إخراجهم واستبعادهم من المسابقة دفعة واحدة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExcludeParticipantTarget('all')}
            className="min-h-[42px] px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-red-600/30 cursor-pointer shrink-0"
          >
            <Trash2 size={16} />
            <span>استبعاد جميع غير الحافظين ({unmemorizedStudentsCount})</span>
          </button>
        </div>
      )}

      {/* بطاقات الإحصائيات السريعة */}
      <div className={`grid gap-2.5 sm:gap-3 ${unmemorizedStudentsCount > 0 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
            إجمالي المتسابقين
          </span>
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5 block">
            {totalStudentsCount}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
            تم تقييمهم
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {evaluatedStudentsCount}
            </span>
            <span className="text-xs font-bold text-emerald-600/80">
              من {totalStudentsCount}
            </span>
          </div>
        </div>

        {unmemorizedStudentsCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
            <span className="text-[11px] font-bold text-red-800 dark:text-red-300 block">
              غير حافظ
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-black text-red-600 dark:text-red-400">
                {unmemorizedStudentsCount}
              </span>
              <span className="text-xs font-bold text-red-500/80">متسابق</span>
            </div>
          </div>
        )}

        <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70">
          <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300 block">
            تقييم متعدد (أكثر من مقيم)
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-400">
              {multiEvaluatedCount}
            </span>
            <span className="text-xs font-bold text-blue-600/80">متسابق</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
            متوسط درجات الحافظين
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400 mt-0.5 block">
            {overallAverage !== null ? overallAverage : '-'}
          </span>
        </div>
      </div>

      {/* شريط الفلترة والبحث المتقدم */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* البحث باسم الطالب */}
          <div>
            <label className="block text-[11px] font-black text-slate-600 dark:text-slate-300 mb-1">
              بحث باسم الطالب
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="اكتب اسم الطالب للبحث..."
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold"
            />
          </div>

          {/* تصفية حسب المستوى */}
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
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold"
            >
              <option value="all">جميع المستويات ({allResults.length})</option>
              {(comp.levels || []).map(lvl => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.name}
                </option>
              ))}
            </select>
          </div>

          {/* تصفية حسب المقيم */}
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
              className="w-full min-h-[42px] px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold"
            >
              <option value="all">جميع المقيمين</option>
              {(comp.evaluators || []).map(ev => (
                <option key={ev.id} value={ev.id}>
                  المقيم: {ev.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* أزرار حالة التقييم وفرز الحفظ */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { id: 'all', label: `الكل (${allResults.length})` },
            {
              id: 'evaluated',
              label: `تم تقييمهم (${evaluatedStudentsCount})`,
            },
            {
              id: 'memorized',
              label: `الحافظين (${memorizedStudentsCount})`,
            },
            {
              id: 'unmemorized',
              label: `غير الحافظين (${unmemorizedStudentsCount})`,
              badgeClass: unmemorizedStudentsCount > 0 ? 'text-red-600 dark:text-red-400 font-black' : '',
            },
            {
              id: 'multi_evaluated',
              label: `أكثر من مقيم (${multiEvaluatedCount})`,
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
              className={`min-h-[36px] px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                evalStatusFilter === tab.id
                  ? tab.id === 'unmemorized'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-emerald-700 text-white shadow-xs'
                  : `bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 ${tab.badgeClass || ''}`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* بطاقات النتائج للهواتف (Mobile Cards) */}
      <div className="md:hidden space-y-3">
        {filteredResults.map((r, idx) => (
          <div
            key={r.participant.id}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 space-y-3 shadow-xs"
          >
            {/* الصف العلوي: المركز + اسم الطالب + المتوسط النهائي */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-9 h-9 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                    r.isUnmemorized
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300'
                      : idx === 0 && r.averageScore !== null
                      ? 'bg-amber-400 text-emerald-950'
                      : idx === 1 && r.averageScore !== null
                      ? 'bg-slate-300 text-slate-900'
                      : idx === 2 && r.averageScore !== null
                      ? 'bg-amber-700/25 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r.isUnmemorized ? '✕' : r.averageScore !== null ? idx + 1 : '-'}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-base text-slate-900 dark:text-white truncate">
                      {r.participant.name}
                    </span>
                    {r.isUnmemorized && (
                      <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-black text-[10px] border border-red-300 dark:border-red-800">
                        غير حافظ
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>{r.level?.name}</span>
                    {(r.participant.juzsOrSurahs || r.level?.juzsOrSurahs) && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {r.participant.juzsOrSurahs || r.level?.juzsOrSurahs}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-left shrink-0 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  متوسط التقييمات ({r.evaluationsCount})
                </span>
                <div className="font-black text-lg text-emerald-700 dark:text-emerald-400 leading-tight">
                  {r.isUnmemorized ? (
                    <span className="text-sm font-black text-red-600 dark:text-red-400">غير حافظ</span>
                  ) : r.averageScore !== null ? (
                    <>
                      {r.averageScore}
                      <span className="text-[11px] text-slate-400 font-bold">
                        /{r.maxScore}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">لم يقيم</span>
                  )}
                </div>
              </div>
            </div>

            {/* تفصيل جميع التقييمات من كل مقيم لهذا الطالب */}
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/70 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-black text-slate-500 dark:text-slate-400">
                <span>جميع التقييمات المرصودة من المقيمين:</span>
                <div className="flex items-center gap-2">
                  {r.isUnmemorized && onUpdate && (
                    <button
                      type="button"
                      onClick={() => setExcludeParticipantTarget(r.participant)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 font-extrabold text-[11px] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>استبعاد من المسابقة</span>
                    </button>
                  )}
                  {r.evaluationsCount > 1 && !r.isUnmemorized && (
                    <span className="text-blue-600 dark:text-blue-400">
                      تم احتساب المتوسط من {r.evaluationsCount} مقيمين
                    </span>
                  )}
                </div>
              </div>

              {r.evaluations.length > 0 ? (
                <div className="grid grid-cols-1 gap-1.5">
                  {r.evaluations.map((ev, evIdx) => {
                    const evName = getEvaluatorName(
                      ev.evaluatorId,
                      ev.evaluatorName
                    );
                    const segList =
                      ev.segments || (ev as any).segmentEvaluations || [];
                    const totalErrorsCount = segList.reduce(
                      (acc: number, seg: any) =>
                        acc +
                        Number(
                          Object.values(
                            seg.errorsCount || seg.errors || {}
                          ).reduce((s: number, c: any) => s + Number(c || 0), 0)
                        ),
                      0
                    );
                    return (
                      <div
                        key={ev.id || evIdx}
                        className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-black text-[10px] flex items-center justify-center shrink-0">
                              {evIdx + 1}
                            </span>
                            <span className="font-black text-slate-800 dark:text-slate-200 truncate">
                              {evName}
                            </span>
                            {ev.isUnmemorized && (
                              <span className="text-[10px] font-black text-red-600 bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded-md border border-red-200 dark:border-red-900">
                                غير حافظ
                              </span>
                            )}
                            {totalErrorsCount > 0 && (
                              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded-md">
                                {totalErrorsCount} ملاحظة
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black text-sm text-emerald-700 dark:text-emerald-400">
                              {ev.isUnmemorized ? '0' : ev.totalScore}
                              <span className="text-[10px] text-slate-400">
                                /{r.maxScore}
                              </span>
                            </span>
                          </div>
                        </div>

                        {ev.notes && (
                          <div className="text-[11px] text-amber-900 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/40 p-1.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40 font-bold">
                            💬 ملاحظة: {ev.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs font-bold text-slate-400 py-1">
                  لم يتم رصد أي تقييم لهذا المتسابق حتى الآن.
                </div>
              )}

              {r.evaluations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailParticipantId(r.participant.id)}
                  className="w-full min-h-[38px] mt-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black text-xs transition cursor-pointer"
                >
                  عرض تفصيل المقاطع والأخطاء لكل مقيم
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredResults.length === 0 && (
          <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold">
            لا توجد نتائج مطابقة للفلتر المحدد
          </div>
        )}
      </div>

      {/* جدول النتائج الشامل لسطح المكتب */}
      <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black">
              <tr>
                <th className="p-3.5 border-b dark:border-slate-700 w-16 text-center">
                  المركز
                </th>
                <th className="p-3.5 border-b dark:border-slate-700">
                  المتسابق
                </th>
                <th className="p-3.5 border-b dark:border-slate-700">
                  المستوى والمقرر
                </th>
                <th className="p-3.5 border-b dark:border-slate-700">
                  جميع التقييمات من كل مقيم
                </th>
                <th className="p-3.5 border-b dark:border-slate-700 text-center w-28">
                  عدد المقيمين
                </th>
                <th className="p-3.5 border-b dark:border-slate-700 text-center w-40">
                  المتوسط النهائي
                </th>
                <th className="p-3.5 border-b dark:border-slate-700 text-center w-32">
                  التفاصيل والإجراء
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredResults.map((r, idx) => (
                <tr
                  key={r.participant.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                >
                  <td className="p-3.5 text-center">
                    <span
                      className={`inline-flex w-8 h-8 rounded-xl font-black text-xs items-center justify-center ${
                        r.isUnmemorized
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300'
                          : idx === 0 && r.averageScore !== null
                          ? 'bg-amber-400 text-emerald-950 shadow-2xs'
                          : idx === 1 && r.averageScore !== null
                          ? 'bg-slate-300 text-slate-900'
                          : idx === 2 && r.averageScore !== null
                          ? 'bg-amber-700/20 text-amber-900 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {r.isUnmemorized ? '✕' : r.averageScore !== null ? idx + 1 : '-'}
                    </span>
                  </td>

                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900 dark:text-white">
                        {r.participant.name}
                      </span>
                      {r.isUnmemorized && (
                        <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 font-black text-[10px] border border-red-300 dark:border-red-800">
                          غير حافظ
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3.5">
                    <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                      {r.level?.name}
                    </div>
                    {(r.participant.juzsOrSurahs || r.level?.juzsOrSurahs) && (
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        📖 {r.participant.juzsOrSurahs || r.level?.juzsOrSurahs}
                      </div>
                    )}
                  </td>

                  <td className="p-3.5">
                    {r.evaluations.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {r.evaluations.map((ev, evIdx) => {
                          const evName = getEvaluatorName(
                            ev.evaluatorId,
                            ev.evaluatorName
                          );
                          return (
                            <div
                              key={ev.id || evIdx}
                              className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-xl text-xs"
                            >
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {evName}:
                              </span>
                              <span className={`font-black px-1.5 py-0.5 rounded-lg ${
                                ev.isUnmemorized
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                  : 'text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-900 shadow-2xs'
                              }`}>
                                {ev.isUnmemorized ? 'غير حافظ' : `${ev.totalScore} / ${r.maxScore}`}
                              </span>
                              {ev.notes && (
                                <span
                                  className="text-[10px] font-bold text-amber-700 dark:text-amber-400 cursor-help"
                                  title={`ملاحظة: ${ev.notes}`}
                                >
                                  💬
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold">
                        لم يتم التقييم بعد
                      </span>
                    )}
                  </td>

                  <td className="p-3.5 text-center">
                    <span
                      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-black ${
                        r.evaluationsCount > 1
                          ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300'
                          : r.evaluationsCount === 1
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {r.evaluationsCount} مقيم
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    {r.isUnmemorized ? (
                      <span className="px-2.5 py-1 rounded-xl bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 font-black text-xs border border-red-300">
                        غير حافظ
                      </span>
                    ) : r.averageScore !== null ? (
                      <div>
                        <span className="font-black text-lg text-emerald-700 dark:text-emerald-400">
                          {r.averageScore}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">
                          {' '}
                          / {r.maxScore}
                        </span>
                        {r.percentage !== null && (
                          <div className="text-[10px] font-bold text-slate-500">
                            ({r.percentage}%)
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 font-bold">-</span>
                    )}
                  </td>

                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {r.evaluations.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDetailParticipantId(r.participant.id)}
                          className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-black text-xs transition cursor-pointer"
                        >
                          التفاصيل ({r.evaluationsCount})
                        </button>
                      )}
                      {r.isUnmemorized && onUpdate && (
                        <button
                          type="button"
                          onClick={() => setExcludeParticipantTarget(r.participant)}
                          className="px-2 py-1 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 font-bold text-xs transition cursor-pointer"
                          title="استبعاد من المسابقة"
                        >
                          استبعاد
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredResults.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-slate-400 font-bold"
                  >
                    لا توجد بيانات لعرضها
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة تفاصيل تقييمات الطالب من جميع المقيمين */}
      {detailResult && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-6 overflow-hidden"
          onClick={() => setDetailParticipantId(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl max-w-3xl w-[96vw] sm:w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 p-3.5 sm:p-5 bg-white dark:bg-slate-900 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-sm sm:text-xl text-emerald-950 dark:text-emerald-300 truncate">
                    تفصيل تقييمات: {detailResult.participant.name}
                  </h4>
                  {detailResult.isUnmemorized && (
                    <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-800 font-black text-xs border border-red-300">
                      غير حافظ
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  {detailResult.level?.name} • المقيمون:{' '}
                  {detailResult.evaluationsCount} • المتوسط النهائي:{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {detailResult.isUnmemorized ? 'غير حافظ' : `${detailResult.averageScore} من ${detailResult.maxScore}`}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailParticipantId(null)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-xs cursor-pointer shrink-0"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {detailResult.evaluations.map((ev, index) => {
                const evName = getEvaluatorName(
                  ev.evaluatorId,
                  ev.evaluatorName
                );
                const levelErrors = detailResult.level?.errors || [];
                const segList =
                  ev.segments || (ev as any).segmentEvaluations || [];

                return (
                  <div
                    key={ev.id || index}
                    className="p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700 pb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs sm:text-base text-slate-900 dark:text-white block truncate">
                              المقيم: {evName}
                            </span>
                            {ev.isUnmemorized && (
                              <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-black text-[10px] border border-red-300">
                                غير حافظ لهذا المقرر
                              </span>
                            )}
                          </div>
                          {ev.timestamp && (
                            <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold block">
                              {new Date(ev.timestamp).toLocaleString('ar-SA')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2.5 sm:px-3 py-1 rounded-xl bg-emerald-600 text-white font-black text-xs sm:text-sm">
                          الدرجة: {ev.isUnmemorized ? '0' : ev.totalScore} / {detailResult.maxScore}
                        </span>
                        {onUpdate && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmEvalId(String(ev.id))}
                            className="min-h-[36px] min-w-[36px] p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer flex items-center justify-center"
                            title="حذف تقييم هذا المقيم"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* خانة الملاحظات إن وجدت */}
                    {ev.notes && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 text-xs font-bold text-amber-900 dark:text-amber-300">
                        💬 <strong>ملاحظات المقيم:</strong> {ev.notes}
                      </div>
                    )}

                    {/* تفصيل المقاطع لهذا المقيم */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {segList.map((seg: any, sIdx: number) => {
                        const segNum =
                          seg.segmentNumber || seg.segmentIndex || sIdx + 1;
                        const errCounts = seg.errorsCount || seg.errors || {};
                        return (
                          <div
                            key={segNum}
                            className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 font-black text-emerald-900 dark:text-emerald-300">
                              <span className="shrink-0">المقطع {segNum}</span>
                              {seg.isUnmemorized && (
                                <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-black">
                                  غير حافظ
                                </span>
                              )}
                              {seg.passageDescription && (
                                <span className="text-[11px] font-bold text-slate-500 truncate">
                                  {seg.passageDescription}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {levelErrors.map(errType => {
                                const count = errCounts[errType.id] || 0;
                                return (
                                  <span
                                    key={errType.id}
                                    className={`px-2 py-0.5 rounded-lg font-bold text-[11px] ${
                                      count > 0
                                        ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {errType.name}: <strong>{count}</strong>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف تقييم مقيم */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmEvalId}
        title="تأكيد حذف التقييم"
        message="هل أنت متأكد من حذف رصد تقييم هذا المقيم؟ سيمكنه أو لغيره إعادة تقييم المتسابق لاحقاً."
        confirmLabel="نعم، حذف التقييم"
        onConfirm={() => {
          if (deleteConfirmEvalId) {
            handleDeleteEvaluation(deleteConfirmEvalId);
          }
        }}
        onClose={() => setDeleteConfirmEvalId(null)}
      />

      {/* نافذة تأكيد استبعاد متسابق غير حافظ / أو جميع غير الحافظين */}
      <ConfirmDeleteModal
        isOpen={!!excludeParticipantTarget}
        title={
          excludeParticipantTarget === 'all'
            ? 'تأكيد استبعاد جميع المتسابقين غير الحافظين'
            : 'تأكيد استبعاد المتسابق من المسابقة'
        }
        message={
          excludeParticipantTarget === 'all'
            ? `هل أنت متأكد من استبعاد وحذف جميع المتسابقين المصنفين «غير حافظ» وعددهم (${unmemorizedStudentsCount}) من المسابقة ونتائجها؟`
            : `هل أنت متأكد من استبعاد وإخراج المتسابق من المسابقة نهائياً؟`
        }
        itemTitle={
          excludeParticipantTarget === 'all'
            ? `جميع غير الحافظين (${unmemorizedStudentsCount} متسابق)`
            : (excludeParticipantTarget as CompetitionParticipant)?.name
        }
        confirmLabel="نعم، تأكيد الاستبعاد"
        onConfirm={handleExcludeUnmemorizedConfirm}
        onClose={() => setExcludeParticipantTarget(null)}
      />
    </div>
  );
}

