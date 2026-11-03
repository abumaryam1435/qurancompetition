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
    const list: (CompetitionEvaluator & { competitionId: string; competitionName: string; isCompetitionActive: boolean })[] = [];
    const comps = context?.competitions || [];
    // عرض مقيمي المسابقات المفعّلة فقط في قائمة الدخول النشطة
    const activeComps = comps.filter(c => c.isActive);
    activeComps.forEach(c => {
      if (c.evaluators && c.evaluators.length > 0) {
        c.evaluators.forEach(e => {
          list.push({
            ...e,
            competitionId: String(c.id),
            competitionName: c.name,
            isCompetitionActive: Boolean(c.isActive),
          });
        });
      }
    });
    return list;
  }, [context?.competitions]);

  const hasInactiveCompetitions = useMemo(() => {
    const comps = context?.competitions || [];
    return comps.some(c => !c.isActive);
  }, [context?.competitions]);

  const filteredEvaluators = useMemo(() => {
    if (!evaluatorSearchTerm) return allEvaluators;
    return allEvaluators.filter(e =>
      e.name.toLowerCase().includes(evaluatorSearchTerm.toLowerCase()) ||
      e.competitionName.toLowerCase().includes(evaluatorSearchTerm.toLowerCase())
    );
  }, [allEvaluators, evaluatorSearchTerm]);

  const handleSelectEvaluator = (evaluator: CompetitionEvaluator & { competitionId: string; competitionName: string }) => {
    const comp = (context?.competitions || []).find(c => String(c.id) === String(evaluator.competitionId));
    if (comp && !comp.isActive) {
      setError('عذراً، هذه المسابقة غير مفعّلة حالياً من قِبل المشرف ولا يمكن الدخول إليها.');
      return;
    }
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

    const targetComp = (context?.competitions || []).find(
      c => String(c.id) === String(selectedEvaluator.competitionId)
    );
    if (!targetComp || !targetComp.isActive) {
      setError('عذراً، هذه المسابقة غير مفعّلة حالياً من قِبل المشرف ولا يمكن للمقيمين الدخول إليها.');
      return;
    }

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
        {/* الإطار الداخلي المزخرف بخلفية كحلية فاتحة */}
        <div className="flex-1 rounded-[1.65rem] sm:rounded-[2.1rem] bg-gradient-to-b from-[#18345C] via-[#162F54] to-[#132746] border-2 border-[#D4AF37]/50 relative overflow-hidden flex flex-col justify-between shadow-inner">
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

          {/* القسم العلوي الملكي (شعار الأوقاف في أعلى الشاشة تماماً بدون خلفية بيضاء، يليه شعار التطبيق) */}
          <div className="relative bg-gradient-to-b from-[#09152C] via-[#122954] to-[#183663] text-white pt-2.5 pb-4 px-4 text-center border-b-2 border-[#D4AF37]/60 shadow-md shrink-0">
            {/* حالة الاتصال السحابي في الزاوية العلوية حتى يرتفع شعار الأوقاف لأعلى الشاشة تماماً */}
            <div className="absolute top-2.5 left-9 z-20">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#09152C]/90 border border-[#D4AF37]/40 shadow-xs">
                <span
                  className={`w-2 h-2 rounded-full ${
                    firebaseConnectionStatus === 'connected'
                      ? 'bg-sky-400 animate-pulse'
                      : firebaseConnectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-bounce'
                      : 'bg-amber-500/80'
                  }`}
                />
                <span className="text-[10px] font-extrabold text-amber-100/90">
                  {firebaseConnectionStatus === 'connected'
                    ? 'متصل'
                    : firebaseConnectionStatus === 'connecting'
                    ? 'جاري الاتصال...'
                    : 'غير متصل'}
                </span>
              </div>
            </div>

            {/* 1. شعار الأوقاف في أعلى الشاشة تماماً في الوسط بدون خلفية بيضاء */}
            <div className="flex justify-center pt-0.5 mb-2">
              <AwqafBadge variant="login" />
            </div>

            {/* 2. شعار التطبيق منزل قليلاً بتناسق وأناقة */}
            <div className="flex justify-center mt-1.5 mb-2">
              <div className="p-1.5 rounded-full bg-gradient-to-b from-[#F5D77F] via-[#D4AF37] to-[#B8860B] shadow-[0_4px_22px_rgba(212,175,55,0.45)]">
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

          {/* القسم الأوسط التفاعلي (خلفية كحلي فاتح خلف أزرار الدخول) */}
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-7 py-5 overflow-y-auto bg-gradient-to-b from-[#18345C] to-[#142A4A]">
            {mode === 'initial' && (
              <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-300 my-auto">
                <button
                  onClick={() => setMode('evaluator')}
                  disabled={isLoadingFirebase}
                  className="w-full min-h-[58px] py-4 px-5 text-base sm:text-lg font-black text-white bg-gradient-to-l from-[#0D1F3C] via-[#163363] to-[#0D1F3C] hover:from-[#1A3C74] hover:to-[#1A3C74] rounded-2xl border-2 border-[#D4AF37]/80 transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <Trophy className="w-6 h-6 text-[#F5D77F] shrink-0" />
                  <span>دخول مقيمي المسابقة</span>
                </button>

                <button
                  onClick={() => setMode('supervisor')}
                  disabled={isLoadingFirebase}
                  className="w-full min-h-[56px] py-3.5 px-5 text-sm sm:text-base font-black text-[#F5D77F] bg-[#0E203B] hover:bg-[#132A4E] border-2 border-[#D4AF37]/80 rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0 text-[#F5D77F]" />
                  <span>دخول المشرف وإعداد المسابقات</span>
                </button>
              </div>
            )}

            {mode === 'supervisor' && (
              <form
                onSubmit={handleSupervisorLoginAttempt}
                className="space-y-4 sm:space-y-5 animate-in slide-in-from-bottom-4 duration-200 my-auto"
              >
                <h3 className="text-lg sm:text-xl font-black text-white text-center drop-shadow-xs">
                  دخول المشرف العام
                </h3>
                <div className="space-y-3 text-right">
                  <div className="relative">
                    <input
                      autoFocus
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onFocus={e => e.target.select()}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="input-style text-center text-xl sm:text-2xl tracking-[0.2em] font-bold py-3.5 px-12 min-h-[54px] border-2 border-[#C8DAF0] focus:border-[#F5D77F] bg-white text-slate-900 shadow-inner"
                      disabled={isLoadingFirebase}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-[#0F2347] transition-colors cursor-pointer"
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {rememberMe && Boolean(safeLocalStorage.getItem(REMEMBERED_LOGIN_PASSWORD_KEY)) && password && (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-emerald-200 bg-emerald-900/60 py-1.5 px-3 rounded-lg border border-emerald-500/50">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                      <span>تم استرجاع كلمة المرور المحفوظة تلقائياً</span>
                    </div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => handleRememberMeChange(e.target.checked, false)}
                      disabled={isLoadingFirebase}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded border-gray-300 text-[#1D427B] focus:ring-[#F5D77F]"
                    />
                    <span className="text-sm sm:text-base font-bold text-blue-100">
                      حفظ كلمة المرور والبقاء متصلاً
                    </span>
                  </label>
                </div>

                {error && (
                  <p className="text-red-300 text-sm sm:text-base font-black text-center">
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
                    <h3 className="text-lg sm:text-xl font-black text-white text-center drop-shadow-xs">
                      اختر اسم المقيم
                    </h3>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ابحث عن اسمك..."
                        value={evaluatorSearchTerm}
                        onChange={e => setEvaluatorSearchTerm(e.target.value)}
                        className="input-style pr-11 font-bold py-3 min-h-[48px] text-sm sm:text-base bg-white text-slate-900 border-2 border-[#C8DAF0] focus:border-[#F5D77F]"
                        disabled={isLoadingFirebase}
                      />
                      <Search className="absolute right-3.5 top-3.5 h-5 w-5 text-slate-400" />
                    </div>
                    <div className="max-h-[34dvh] overflow-y-auto border-2 border-[#D4AF37]/30 rounded-2xl p-2 bg-[#0C1A30]/80 custom-scrollbar shadow-inner space-y-1.5">
                      {filteredEvaluators.map((e, idx) => (
                        <button
                          key={`${e.competitionId}-${e.id}-${idx}`}
                          onClick={() => handleSelectEvaluator(e)}
                          className="w-full min-h-[54px] text-right p-3.5 bg-[#FAF4E6] hover:bg-[#163363] hover:text-white rounded-xl border border-[#E5D7B5] transition-all active:scale-[0.98] flex items-center justify-between gap-2 cursor-pointer shadow-xs group"
                        >
                          <div>
                            <div className="font-black text-base sm:text-lg text-[#0F2347] group-hover:text-white transition-colors">{e.name}</div>
                            <div className="text-xs font-bold text-amber-800 group-hover:text-amber-200 transition-colors opacity-90">{e.competitionName}</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-amber-800 group-hover:text-amber-200 transition-colors rotate-180 shrink-0" />
                        </button>
                      ))}
                      {filteredEvaluators.length === 0 && !isLoadingFirebase && (
                        <div className="p-6 text-blue-200 font-bold text-xs sm:text-sm space-y-1.5 text-center">
                          {hasInactiveCompetitions ? (
                            <>
                              <p className="text-amber-300 font-black text-sm">
                                لا توجد مسابقة مفعّلة حالياً لدخول المقيمين
                              </p>
                              <p className="text-xs opacity-90 leading-relaxed">
                                المسابقة متوقفة حالياً من قِبل المشرف، يرجى مراجعة المشرف لتفعيل المسابقة للتمكن من تسجيل الدخول والاطلاع على أسماء المشاركين.
                              </p>
                            </>
                          ) : (
                            <>
                              <p>لا يوجد مقيمون مسجلون حالياً.</p>
                              <p className="text-xs opacity-80">
                                يمكن للمشرف إضافة المسابقة والمقيمين من لوحة التحكم.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setMode('initial')}
                      className="w-full min-h-[48px] mt-1 py-3 px-4 text-sm sm:text-base font-black bg-[#EFE8D8] text-[#0F2347] rounded-2xl hover:bg-[#E2D8C3] transition-all active:scale-95 cursor-pointer border border-[#D8CCB0]"
                    >
                      رجوع للشاشة الرئيسية
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleEvaluatorLoginAttempt} className="space-y-4">
                    <div className="space-y-1 bg-[#0E203B]/90 p-3.5 rounded-2xl border border-[#D4AF37]/50 text-center shadow-md">
                      <h3 className="text-base sm:text-xl font-black text-[#F5D77F]">
                        المقيم: {selectedEvaluator.name}
                      </h3>
                      <p className="text-xs font-bold text-blue-100">
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
                          onFocus={e => e.target.select()}
                          onChange={e => setEvaluatorPin(e.target.value)}
                          placeholder="أدخل كلمة المرور أو الرمز"
                          className="input-style text-center text-xl sm:text-2xl tracking-[0.2em] font-bold py-3.5 px-12 min-h-[54px] bg-white text-slate-900 border-2 border-[#C8DAF0] focus:border-[#F5D77F]"
                          disabled={isLoadingFirebase}
                        />
                        <button
                          type="button"
                          onClick={() => setShowEvaluatorPin(prev => !prev)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-[#0F2347] transition-colors cursor-pointer"
                          title={showEvaluatorPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                        >
                          {showEvaluatorPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>

                      <p className="text-[11px] text-center font-bold text-blue-200">
                        تقبل كلمة المرور أرقاماً أو حروفاً (كبيرة أو صغيرة) أو رموزاً
                      </p>

                      {rememberMe && evaluatorPin && getEvaluatorStorageKeys(selectedEvaluator).some(k => Boolean(getSavedEvaluatorPins()[k])) && (
                        <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-emerald-200 bg-emerald-900/60 py-1.5 px-3 rounded-lg border border-emerald-500/50">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                          <span>تم استرجاع كلمة المرور المحفوظة تلقائياً</span>
                        </div>
                      )}

                      <label className="flex items-center gap-3 cursor-pointer p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={e => handleRememberMeChange(e.target.checked, true)}
                          disabled={isLoadingFirebase}
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded border-gray-300 text-[#1D427B] focus:ring-[#F5D77F]"
                        />
                        <span className="text-sm sm:text-base font-bold text-blue-100">
                          حفظ كلمة المرور وتذكر الدخول
                        </span>
                      </label>
                    </div>
                    {error && (
                      <p className="text-red-300 text-sm sm:text-base font-black text-center">
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

          {/* الشريط السفلي داخل الإطار متناسق الألوان مع القسم العلوي */}
          <div className="px-4 py-3.5 bg-gradient-to-b from-[#122954] to-[#09152C] border-t-2 border-[#D4AF37]/60 shrink-0 flex flex-col items-center gap-2">
            {!isInstalled ? (
              <button
                onClick={handleInstallAppClick}
                className="w-full min-h-[46px] py-2.5 px-4 text-xs sm:text-sm font-black text-[#F5D77F] bg-gradient-to-l from-[#0D1F3C] via-[#163363] to-[#0D1F3C] hover:from-[#1A3C74] hover:to-[#1A3C74] border border-[#D4AF37]/70 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                {isInstallable ? (
                  <Download className="w-4 h-4 shrink-0 text-[#F5D77F]" />
                ) : (
                  <Smartphone className="w-4 h-4 shrink-0 text-[#F5D77F]" />
                )}
                <span>تثبيت تطبيق المسابقات على الهاتف</span>
              </button>
            ) : (
              <div className="text-[11px] font-bold text-amber-100/80">
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
