import React, { useState, useContext, useMemo, useEffect } from 'react';
import { AppContext } from '../App';
import { User, UserRole, CompetitionEvaluator } from '../types';
import {
  DEFAULT_APP_NAME,
  REMEMBERED_LOGIN_PASSWORD_KEY,
  REMEMBER_ME_PREFERENCE_KEY,
} from '../constants';
import { safeLocalStorage } from '../utils/storage';
import Logo, { AwqafBadge } from './Logo';
import MobileInstallModal from './MobileInstallModal';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Smartphone, Trophy, ShieldCheck, Search, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const REMEMBERED_EVALUATOR_PINS_KEY = 'competitionRememberedEvaluatorPins';

const getSavedEvaluatorPins = (): Record<string, string> => {
  try {
    const raw = safeLocalStorage.getItem(REMEMBERED_EVALUATOR_PINS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const getEvaluatorStorageKeys = (evaluator: { id: number | string; competitionId: string; name: string }) => [
  `${evaluator.competitionId}_${evaluator.id}`,
  `id_${evaluator.id}`,
  `name_${evaluator.name.trim()}`,
];

interface LoginScreenProps {
  onLogin: (user: any, rememberMe?: boolean) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'initial' | 'supervisor' | 'evaluator'>('initial');
  const [selectedEvaluator, setSelectedEvaluator] = useState<(CompetitionEvaluator & { competitionId: string; competitionName: string }) | null>(null);
  const [evaluatorSearchTerm, setEvaluatorSearchTerm] = useState('');
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    const savedPref = safeLocalStorage.getItem(REMEMBER_ME_PREFERENCE_KEY);
    return savedPref !== 'false';
  });
  const [password, setPassword] = useState<string>(() => {
    const savedPref = safeLocalStorage.getItem(REMEMBER_ME_PREFERENCE_KEY);
    if (savedPref === 'false') return '';
    return safeLocalStorage.getItem(REMEMBERED_LOGIN_PASSWORD_KEY) || '';
  });
  const [evaluatorPin, setEvaluatorPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showEvaluatorPin, setShowEvaluatorPin] = useState(false);
  const [error, setError] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);

  const context = useContext(AppContext);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const supervisorPassword = context?.supervisorPassword || '';
  const appName = context?.appName || DEFAULT_APP_NAME;
  const isLoadingFirebase = context?.isLoadingFirebase ?? false;
  const firebaseConnectionStatus = context?.firebaseConnectionStatus ?? 'disconnected';

  // استرجاع كلمة مرور المشرف المحفوظة عند فتح تبويب المشرف
  useEffect(() => {
    if (mode === 'supervisor') {
      const savedPref = safeLocalStorage.getItem(REMEMBER_ME_PREFERENCE_KEY);
      const isRemembered = savedPref !== 'false';
      setRememberMe(isRemembered);
      const savedPass = isRemembered ? safeLocalStorage.getItem(REMEMBERED_LOGIN_PASSWORD_KEY) || '' : '';
      if (savedPass) {
        setPassword(savedPass);
      }
    }
  }, [mode]);

  const allEvaluators = useMemo(() => {
    const list: (CompetitionEvaluator & { competitionId: string; competitionName: string })[] = [];
    const comps = context?.competitions || [];
    const sortedComps = [...comps].sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
    sortedComps.forEach(c => {
      if (c.evaluators && c.evaluators.length > 0) {
        c.evaluators.forEach(e => {
          list.push({
            ...e,
            competitionId: String(c.id),
            competitionName: c.name,
          });
        });
      }
    });
    return list;
  }, [context?.competitions]);

  const filteredEvaluators = useMemo(() => {
    if (!evaluatorSearchTerm) return allEvaluators;
    return allEvaluators.filter(e =>
      e.name.toLowerCase().includes(evaluatorSearchTerm.toLowerCase()) ||
      e.competitionName.toLowerCase().includes(evaluatorSearchTerm.toLowerCase())
    );
  }, [allEvaluators, evaluatorSearchTerm]);

  const handleSelectEvaluator = (evaluator: CompetitionEvaluator & { competitionId: string; competitionName: string }) => {
    setSelectedEvaluator(evaluator);
    setError('');
    const savedPins = getSavedEvaluatorPins();
    const keys = getEvaluatorStorageKeys(evaluator);
    const matchedPin = keys.map(k => savedPins[k]).find(val => Boolean(val)) || '';
    if (matchedPin) {
      setEvaluatorPin(matchedPin);
      setRememberMe(true);
    } else {
      setEvaluatorPin('');
      const savedPref = safeLocalStorage.getItem(REMEMBER_ME_PREFERENCE_KEY);
      setRememberMe(savedPref !== 'false');
    }
  };

  const handleRememberMeChange = (checked: boolean, isEvaluatorMode = false) => {
    setRememberMe(checked);
    safeLocalStorage.setItem(REMEMBER_ME_PREFERENCE_KEY, checked ? 'true' : 'false');
    if (!checked) {
      if (!isEvaluatorMode) {
        safeLocalStorage.removeItem(REMEMBERED_LOGIN_PASSWORD_KEY);
      } else if (selectedEvaluator) {
        const savedPins = getSavedEvaluatorPins();
        getEvaluatorStorageKeys(selectedEvaluator).forEach(k => delete savedPins[k]);
        safeLocalStorage.setItem(REMEMBERED_EVALUATOR_PINS_KEY, JSON.stringify(savedPins));
      }
    } else if (!isEvaluatorMode && password) {
      safeLocalStorage.setItem(REMEMBERED_LOGIN_PASSWORD_KEY, password);
    }
  };

  const handleSupervisorLoginAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (supervisorPassword && password === supervisorPassword) {
      if (rememberMe) {
        safeLocalStorage.setItem(REMEMBER_ME_PREFERENCE_KEY, 'true');
        safeLocalStorage.setItem(REMEMBERED_LOGIN_PASSWORD_KEY, password);
      } else {
        safeLocalStorage.setItem(REMEMBER_ME_PREFERENCE_KEY, 'false');
        safeLocalStorage.removeItem(REMEMBERED_LOGIN_PASSWORD_KEY);
      }
      onLogin({ id: 1, role: UserRole.SUPERVISOR, name: 'المشرف العام' }, rememberMe);
    } else if (!supervisorPassword) {
      setError('جاري الاتصال بقاعدة البيانات... يرجى الانتظار.');
    } else {
      setError('كلمة المرور غير صحيحة.');
    }
  };

  const handleEvaluatorLoginAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedEvaluator) return;

    const cleanPin = evaluatorPin.trim();
    if (cleanPin === String(selectedEvaluator.pin).trim()) {
      const savedPins = getSavedEvaluatorPins();
      const keys = getEvaluatorStorageKeys(selectedEvaluator);
      if (rememberMe) {
        safeLocalStorage.setItem(REMEMBER_ME_PREFERENCE_KEY, 'true');
        keys.forEach(k => {
          savedPins[k] = cleanPin;
        });
        safeLocalStorage.setItem(REMEMBERED_EVALUATOR_PINS_KEY, JSON.stringify(savedPins));
      } else {
        keys.forEach(k => delete savedPins[k]);
        safeLocalStorage.setItem(REMEMBERED_EVALUATOR_PINS_KEY, JSON.stringify(savedPins));
      }

      onLogin(
        {
          id: selectedEvaluator.id,
          name: selectedEvaluator.name,
          role: UserRole.COMPETITION_EVALUATOR,
          competitionId: selectedEvaluator.competitionId,
        },
        rememberMe
      );
    } else {
      setError('رمز الدخول (PIN) غير صحيح.');
    }
  };

  const handleInstallAppClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowInstallModal(true);
    }
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[100dvh] w-full bg-gradient-to-b from-[#071124] via-[#0F2347] to-[#071124] p-2 sm:p-5 overflow-x-hidden select-none">
      {/* الإطار الملكي المذهّب الذي يملأ شاشة الهاتف بالكامل */}
      <div className="flex-1 w-full max-w-md mx-auto rounded-[1.9rem] sm:rounded-[2.4rem] p-[4px] sm:p-[6px] bg-gradient-to-b from-[#F3D77D] via-[#B88924] to-[#F3D77D] shadow-[0_24px_70px_rgba(0,0,0,0.65)] flex flex-col my-auto min-h-[calc(100dvh-1rem)] sm:min-h-[640px] sm:max-h-[860px]">
        {/* الإطار الداخلي المزخرف */}
        <div className="flex-1 rounded-[1.65rem] sm:rounded-[2.1rem] bg-[#FAF8F5] dark:bg-[#0B162C] border-2 border-[#D4AF37]/45 relative overflow-hidden flex flex-col justify-between">
          {/* زخارف الزوايا الأربع الذهبية */}
          <svg
            className="pointer-events-none absolute top-2 right-2 w-8 h-8 text-[#D4AF37]/70 z-20"
            viewBox="0 0 40 40"
            fill="none"
          >
            <path d="M38 2H14C7.37 2 2 7.37 2 14V38" stroke="currentColor" strokeWidth="2.2" />
            <path d="M38 7H17C11.48 7 7 11.48 7 17V38" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="11" cy="11" r="2.5" fill="currentColor" />
          </svg>
          <svg
            className="pointer-events-none absolute top-2 left-2 w-8 h-8 text-[#D4AF37]/70 z-20 -scale-x-100"
            viewBox="0 0 40 40"
            fill="none"
          >
            <path d="M38 2H14C7.37 2 2 7.37 2 14V38" stroke="currentColor" strokeWidth="2.2" />
            <path d="M38 7H17C11.48 7 7 11.48 7 17V38" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="11" cy="11" r="2.5" fill="currentColor" />
          </svg>
          <svg
            className="pointer-events-none absolute bottom-2 right-2 w-8 h-8 text-[#D4AF37]/60 z-20 -scale-y-100"
            viewBox="0 0 40 40"
            fill="none"
          >
            <path d="M38 2H14C7.37 2 2 7.37 2 14V38" stroke="currentColor" strokeWidth="2.2" />
            <path d="M38 7H17C11.48 7 7 11.48 7 17V38" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="11" cy="11" r="2.5" fill="currentColor" />
          </svg>
          <svg
            className="pointer-events-none absolute bottom-2 left-2 w-8 h-8 text-[#D4AF37]/60 z-20 -scale-x-100 -scale-y-100"
            viewBox="0 0 40 40"
            fill="none"
          >
            <path d="M38 2H14C7.37 2 2 7.37 2 14V38" stroke="currentColor" strokeWidth="2.2" />
            <path d="M38 7H17C11.48 7 7 11.48 7 17V38" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="11" cy="11" r="2.5" fill="currentColor" />
          </svg>

          {/* القسم العلوي الملكي (تاج المحراب والشعار) */}
          <div className="relative bg-gradient-to-b from-[#09152C] via-[#122954] to-[#1B3C73] text-white pt-4 pb-5 px-4 text-center border-b-2 border-[#D4AF37]/60 shadow-md shrink-0">
            {/* شريط علوي مدمج يجمع حالة الاتصال السحابي وشعار الأوقاف كإضافة أنيقة */}
            <div className="flex items-center justify-between gap-2 mb-3 px-2">
              <AwqafBadge variant="compact" />
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#09152C]/80 border border-[#D4AF37]/40 shadow-xs">
                <span
                  className={`w-2 h-2 rounded-full ${
                    firebaseConnectionStatus === 'connected'
                      ? 'bg-sky-400 animate-pulse'
                      : firebaseConnectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-bounce'
                      : 'bg-amber-500/80'
                  }`}
                />
                <span className="text-[11px] font-extrabold text-amber-100/90">
                  {firebaseConnectionStatus === 'connected'
                    ? 'متصل'
                    : firebaseConnectionStatus === 'connecting'
                    ? 'جاري الاتصال...'
                    : 'غير متصل'}
                </span>
              </div>
            </div>

            <div className="flex justify-center mb-2.5">
              <div className="p-1 rounded-full bg-gradient-to-b from-[#F5D77F] via-[#D4AF37] to-[#B8860B] shadow-[0_4px_20px_rgba(212,175,55,0.4)]">
                <Logo size="lg" className="border-0 shadow-none" />
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-[#F5D77F] mb-1 leading-snug px-2 drop-shadow-xs">
              {appName}
            </h1>
            <p className="text-blue-100/85 text-xs sm:text-sm font-bold">
              {isLoadingFirebase
                ? 'جاري مزامنة بيانات المسابقات...'
                : 'منصة التحكيم والتقييم للمسابقات القرآنية'}
            </p>
          </div>

          {/* القسم الأوسط التفاعلي (يمتد ليملأ الفراغ في شاشة الهاتف بتوازن) */}
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-7 py-5 overflow-y-auto">
            {mode === 'initial' && (
              <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-300 my-auto">
                <button
                  onClick={() => setMode('evaluator')}
                  disabled={isLoadingFirebase}
                  className="w-full min-h-[58px] py-4 px-5 text-base sm:text-lg font-black text-white bg-gradient-to-l from-[#0F2347] via-[#1B3C73] to-[#0F2347] hover:from-[#163363] hover:to-[#163363] rounded-2xl border border-[#D4AF37]/60 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <Trophy className="w-6 h-6 text-[#F5D77F] shrink-0" />
                  <span>دخول مقيمي المسابقة</span>
                </button>

                <button
                  onClick={() => setMode('supervisor')}
                  disabled={isLoadingFirebase}
                  className="w-full min-h-[56px] py-3.5 px-5 text-sm sm:text-base font-black text-[#0F2347] dark:text-[#F5D77F] bg-[#FAF3E0] dark:bg-[#112244] border-2 border-[#D4AF37]/70 rounded-2xl hover:bg-[#F3E7C4] dark:hover:bg-[#172E5A] transition-all shadow-xs active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0 text-[#B8860B] dark:text-[#F5D77F]" />
                  <span>دخول المشرف وإعداد المسابقات</span>
                </button>
              </div>
            )}

            {mode === 'supervisor' && (
              <form
                onSubmit={handleSupervisorLoginAttempt}
                className="space-y-4 sm:space-y-5 animate-in slide-in-from-bottom-4 duration-200 my-auto"
              >
                <h3 className="text-lg sm:text-xl font-black text-[#0F2347] dark:text-[#F5D77F] text-center">
                  دخول المشرف العام
                </h3>
                <div className="space-y-3 text-right">
                  <div className="relative">
                    <input
                      autoFocus
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="input-style text-center text-xl sm:text-2xl tracking-[0.2em] font-bold py-3.5 px-12 min-h-[54px] border-2 border-[#C8DAF0] focus:border-[#1D427B]"
                      disabled={isLoadingFirebase}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-[#0F2347] dark:text-slate-400 dark:hover:text-[#F5D77F] transition-colors cursor-pointer"
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {rememberMe && Boolean(safeLocalStorage.getItem(REMEMBERED_LOGIN_PASSWORD_KEY)) && password && (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 py-1.5 px-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>تم استرجاع كلمة المرور المحفوظة تلقائياً</span>
                    </div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer p-2.5 hover:bg-blue-50/50 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => handleRememberMeChange(e.target.checked, false)}
                      disabled={isLoadingFirebase}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded border-gray-300 text-[#1D427B] focus:ring-[#1D427B]"
                    />
                    <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                      حفظ كلمة المرور والبقاء متصلاً
                    </span>
                  </label>
                </div>

                {error && (
                  <p className="text-red-600 dark:text-red-400 text-sm sm:text-base font-black text-center">
                    {error}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('initial');
                      setError('');
                    }}
                    className="min-h-[50px] py-3.5 text-base sm:text-lg font-black bg-[#EFE8D8] text-[#0F2347] dark:bg-slate-800 dark:text-white rounded-2xl hover:bg-[#E2D8C3] transition-all active:scale-95 cursor-pointer border border-[#D8CCB0]"
                  >
                    رجوع
                  </button>
                  <button
                    type="submit"
                    className="min-h-[50px] py-3.5 text-base sm:text-lg font-black text-white bg-gradient-to-l from-[#0F2347] to-[#1D427B] rounded-2xl hover:opacity-95 shadow-lg border border-[#D4AF37]/50 transition-all active:scale-95 cursor-pointer"
                    disabled={isLoadingFirebase}
                  >
                    {isLoadingFirebase ? 'جاري التحميل...' : 'دخول'}
                  </button>
                </div>
              </form>
            )}

            {mode === 'evaluator' && (
              <div className="space-y-3.5 animate-in slide-in-from-right-4 duration-200 flex flex-col w-full my-auto">
                {!selectedEvaluator ? (
                  <>
                    <h3 className="text-lg sm:text-xl font-black text-[#0F2347] dark:text-[#F5D77F] text-center">
                      اختر اسم المقيم
                    </h3>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ابحث عن اسمك..."
                        value={evaluatorSearchTerm}
                        onChange={e => setEvaluatorSearchTerm(e.target.value)}
                        className="input-style pr-11 font-bold py-3 min-h-[48px] text-sm sm:text-base"
                        disabled={isLoadingFirebase}
                      />
                      <Search className="absolute right-3.5 top-3.5 h-5 w-5 text-slate-400" />
                    </div>
                    <div className="max-h-[34dvh] overflow-y-auto border-2 border-[#E6EEF8] dark:border-slate-700 rounded-2xl p-2 bg-white/80 dark:bg-slate-800/90 custom-scrollbar shadow-inner space-y-1.5">
                      {filteredEvaluators.map((e, idx) => (
                        <button
                          key={`${e.competitionId}-${e.id}-${idx}`}
                          onClick={() => handleSelectEvaluator(e)}
                          className="w-full min-h-[54px] text-right p-3.5 bg-[#FAF4E6] dark:bg-slate-900/90 hover:bg-[#163363] hover:text-white dark:hover:bg-[#1D427B] rounded-xl border border-[#E5D7B5] dark:border-slate-700 transition-all active:scale-[0.98] flex items-center justify-between gap-2 cursor-pointer shadow-2xs"
                        >
                          <div>
                            <div className="font-black text-base sm:text-lg text-[#0F2347] dark:text-white">{e.name}</div>
                            <div className="text-xs font-bold text-amber-800 dark:text-amber-300 opacity-90">{e.competitionName}</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-amber-800 dark:text-amber-300 rotate-180 shrink-0" />
                        </button>
                      ))}
                      {filteredEvaluators.length === 0 && !isLoadingFirebase && (
                        <div className="p-6 text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm space-y-1 text-center">
                          <p>لا يوجد مقيمون مسجلون حالياً.</p>
                          <p className="text-xs opacity-80">
                            يمكن للمشرف إضافة المسابقة والمقيمين من لوحة التحكم.
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setMode('initial')}
                      className="w-full min-h-[48px] mt-1 py-3 px-4 text-sm sm:text-base font-black bg-[#EFE8D8] text-[#0F2347] dark:bg-slate-800 dark:text-slate-200 rounded-2xl hover:bg-[#E2D8C3] transition-all active:scale-95 cursor-pointer border border-[#D8CCB0]"
                    >
                      رجوع للشاشة الرئيسية
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleEvaluatorLoginAttempt} className="space-y-4">
                    <div className="space-y-1 bg-[#F4F7FB] dark:bg-slate-800 p-3.5 rounded-2xl border border-[#C8DAF0] dark:border-slate-700 text-center">
                      <h3 className="text-base sm:text-xl font-black text-[#0F2347] dark:text-[#F5D77F]">
                        المقيم: {selectedEvaluator.name}
                      </h3>
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        {selectedEvaluator.competitionName}
                      </p>
                    </div>
                    <div className="space-y-3 text-right">
                      <div className="relative">
                        <input
                          autoFocus
                          type={showEvaluatorPin ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={evaluatorPin}
                          onChange={e => setEvaluatorPin(e.target.value)}
                          placeholder="أدخل كلمة المرور أو الرمز"
                          className="input-style text-center text-xl sm:text-2xl tracking-[0.2em] font-bold py-3.5 px-12 min-h-[54px]"
                          disabled={isLoadingFirebase}
                        />
                        <button
                          type="button"
                          onClick={() => setShowEvaluatorPin(prev => !prev)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-[#0F2347] dark:text-slate-400 dark:hover:text-[#F5D77F] transition-colors cursor-pointer"
                          title={showEvaluatorPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                        >
                          {showEvaluatorPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>

                      <p className="text-[11px] text-center font-bold text-slate-500 dark:text-slate-400">
                        تقبل كلمة المرور أرقاماً أو حروفاً (كبيرة أو صغيرة) أو رموزاً
                      </p>

                      {rememberMe && evaluatorPin && getEvaluatorStorageKeys(selectedEvaluator).some(k => Boolean(getSavedEvaluatorPins()[k])) && (
                        <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 py-1.5 px-3 rounded-lg border border-emerald-200/80 dark:border-emerald-800/50">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>تم استرجاع كلمة المرور المحفوظة تلقائياً</span>
                        </div>
                      )}

                      <label className="flex items-center gap-3 cursor-pointer p-2.5 hover:bg-blue-50/50 dark:hover:bg-slate-800 rounded-xl transition-colors">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={e => handleRememberMeChange(e.target.checked, true)}
                          disabled={isLoadingFirebase}
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded border-gray-300 text-[#1D427B] focus:ring-[#1D427B]"
                        />
                        <span className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-300">
                          حفظ كلمة المرور وتذكر الدخول
                        </span>
                      </label>
                    </div>
                    {error && (
                      <p className="text-red-600 dark:text-red-400 text-sm sm:text-base font-black text-center">
                        {error}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEvaluator(null);
                          setError('');
                        }}
                        className="min-h-[48px] py-3.5 text-sm sm:text-base font-black bg-[#EFE8D8] text-[#0F2347] dark:bg-slate-800 dark:text-white rounded-2xl hover:bg-[#E2D8C3] transition-all active:scale-95 cursor-pointer border border-[#D8CCB0]"
                      >
                        تغيير الاسم
                      </button>
                      <button
                        type="submit"
                        className="min-h-[48px] py-3.5 text-sm sm:text-base font-black text-white bg-gradient-to-l from-[#0F2347] to-[#1D427B] rounded-2xl hover:opacity-95 shadow-lg border border-[#D4AF37]/50 transition-all active:scale-95 cursor-pointer"
                        disabled={isLoadingFirebase}
                      >
                        دخول للتقييم
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* الشريط السفلي داخل الإطار لتثبيت التطبيق واكتمال ملء شاشة الهاتف */}
          <div className="px-4 py-3.5 bg-[#F2EFE9]/90 dark:bg-[#081124] border-t border-[#D4AF37]/35 shrink-0 flex flex-col items-center gap-2">
            {!isInstalled ? (
              <button
                onClick={handleInstallAppClick}
                className="w-full min-h-[46px] py-2.5 px-4 text-xs sm:text-sm font-black text-[#0F2347] dark:text-[#F5D77F] bg-gradient-to-l from-amber-100/90 via-amber-50 to-amber-100/90 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-950/40 border border-[#D4AF37]/60 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                {isInstallable ? (
                  <Download className="w-4 h-4 shrink-0 text-[#B8860B] dark:text-[#F5D77F]" />
                ) : (
                  <Smartphone className="w-4 h-4 shrink-0 text-[#B8860B] dark:text-[#F5D77F]" />
                )}
                <span>تثبيت تطبيق المسابقات على الهاتف</span>
              </button>
            ) : (
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                بوابة التحكيم الإلكتروني للمسابقات القرآنية
              </div>
            )}
          </div>
        </div>
      </div>

      {showInstallModal && (
        <MobileInstallModal onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
};

export default LoginScreen;
