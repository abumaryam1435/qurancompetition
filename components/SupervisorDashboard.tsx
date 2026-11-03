import React, { useContext, useState } from 'react';
import { AppContext } from '../App';
import { Settings } from './Settings';
import CompetitionManager from './competition/CompetitionManager';
import SuggestedPassagesPage from './competition/SuggestedPassagesPage';
import GlobalEvaluatorsManager from './competition/GlobalEvaluatorsManager';
import { Trophy, Settings as SettingsIcon, BookOpen, Users } from 'lucide-react';

type View = 'competition' | 'evaluators' | 'passages' | 'settings';

export const SupervisorDashboard: React.FC = () => {
  const context = useContext(AppContext);
  const [activeView, setActiveView] = useState<View>('competition');
  const [competitionListTrigger, setCompetitionListTrigger] = useState<number>(0);

  if (!context) {
    return <div className="dark:text-gray-200 p-8 text-center font-bold">جاري تحميل البيانات...</div>;
  }

  return (
    <div className="container mx-auto space-y-3 sm:space-y-6 px-0.5 sm:px-2 pb-10">
      {/* Top Bar & Segmented Navigation for Quranic Competitions Supervisor */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2.5 sm:gap-3 bg-white dark:bg-slate-900 p-3 sm:p-5 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 no-print">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-2xl font-black text-emerald-950 dark:text-emerald-300 tracking-tight">
              إدارة المسابقات القرآنية
            </h2>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 font-medium mt-0.5 leading-relaxed">
              إعداد المسابقات وسجل المقيمين المعتمدين والمقاطع المقترحة والمشاركين والنتائج
            </p>
          </div>
        </div>

        <nav
          aria-label="تنقل صفحات المشرف"
          className="grid grid-cols-2 sm:grid-cols-4 sm:flex items-stretch sm:items-center gap-1.5 w-full lg:w-auto p-1.5 bg-emerald-50/90 dark:bg-slate-800 rounded-2xl border border-emerald-200/70 dark:border-slate-700"
        >
          <button
            type="button"
            onClick={() => {
              setActiveView('competition');
              setCompetitionListTrigger(prev => prev + 1);
            }}
            className={`min-h-[50px] sm:min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-sm transition-all active:scale-95 cursor-pointer text-center leading-tight ${
              activeView === 'competition'
                ? 'bg-emerald-800 text-white shadow-sm dark:bg-emerald-600'
                : 'text-emerald-950 dark:text-gray-200 hover:bg-emerald-100/70 dark:hover:bg-slate-700'
            }`}
          >
            <Trophy className="w-4 h-4 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
            <span className="block whitespace-normal sm:whitespace-nowrap">
              المسابقات القرآنية
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('evaluators')}
            className={`min-h-[50px] sm:min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-sm transition-all active:scale-95 cursor-pointer text-center leading-tight ${
              activeView === 'evaluators'
                ? 'bg-emerald-800 text-white shadow-sm dark:bg-emerald-600'
                : 'text-emerald-950 dark:text-gray-200 hover:bg-emerald-100/70 dark:hover:bg-slate-700'
            }`}
          >
            <Users className="w-4 h-4 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
            <span className="block whitespace-normal sm:whitespace-nowrap">
              المقيمون المعتمدون
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('passages')}
            className={`min-h-[50px] sm:min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-sm transition-all active:scale-95 cursor-pointer text-center leading-tight ${
              activeView === 'passages'
                ? 'bg-emerald-800 text-white shadow-sm dark:bg-emerald-600'
                : 'text-emerald-950 dark:text-gray-200 hover:bg-emerald-100/70 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
            <span className="block whitespace-normal sm:whitespace-nowrap">
              المقاطع المقترحة
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('settings')}
            className={`min-h-[50px] sm:min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-sm transition-all active:scale-95 cursor-pointer text-center leading-tight ${
              activeView === 'settings'
                ? 'bg-emerald-800 text-white shadow-sm dark:bg-emerald-600'
                : 'text-emerald-950 dark:text-gray-200 hover:bg-emerald-100/70 dark:hover:bg-slate-700'
            }`}
          >
            <SettingsIcon className="w-4 h-4 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
            <span className="block whitespace-normal sm:whitespace-nowrap">
              الإعدادات العامة
            </span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className={activeView === 'competition' ? 'block' : 'hidden'}>
        <CompetitionManager
          onOpenPassagesPage={() => setActiveView('passages')}
          onOpenEvaluatorsPage={() => setActiveView('evaluators')}
          resetToListTrigger={competitionListTrigger}
        />
      </div>

      <div className={activeView === 'evaluators' ? 'block' : 'hidden'}>
        <GlobalEvaluatorsManager />
      </div>

      <div className={activeView === 'passages' ? 'block' : 'hidden'}>
        <SuggestedPassagesPage />
      </div>

      <div className={activeView === 'settings' ? 'block' : 'hidden'}>
        <Settings />
      </div>
    </div>
  );
};

export default SupervisorDashboard;

