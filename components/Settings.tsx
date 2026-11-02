import React, { useState, useRef, useContext } from 'react';
import { AppContext } from '../App';
import { DEFAULT_APP_NAME } from '../constants';
import { Logo } from './Logo';
import { MobileInstallModal } from './MobileInstallModal';
import { usePWAInstall } from '../utils/usePWAInstall';
import {
  Cloud,
  CheckCircle2,
  Copy,
  Share2,
  Activity,
  Wifi,
  Sparkles,
  ShieldCheck,
  Smartphone,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const context = useContext(AppContext);
  if (!context) return null;

  const {
    appName,
    setAppName,
    customLogo,
    setCustomLogo,
    competitions,
    updateCompetitions,
    globalEvaluators,
    updateGlobalEvaluators,
    users,
    importFullBackup,
    supervisorPassword,
    setSupervisorPassword,
    deleteAllData,
    firebaseConnectionStatus,
  } = context;

  const [nameInput, setNameInput] = useState(appName || DEFAULT_APP_NAME);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4500);
  };

  const handleSaveAppName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim() || DEFAULT_APP_NAME;
    setAppName(trimmed);
    setNameInput(trimmed);
    showFeedback('success', 'تم حفظ اسم المسابقة بنجاح');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showFeedback('error', 'حجم الصورة كبير جداً. يرجى اختيار شعار بحجم أقل من 2 ميجابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomLogo(reader.result);
        showFeedback('success', 'تم تحديث شعار البرنامج وأيقونة التطبيق بنجاح');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setCustomLogo(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    showFeedback('success', 'تمت استعادة الشعار الافتراضي للمسابقات القرآنية');
  };

  const handleExportBackup = () => {
    const backupData = {
      version: '2.0-competitions-full',
      exportedAt: new Date().toISOString(),
      appName,
      customLogo,
      supervisorPassword,
      competitions,
      globalEvaluators,
      users,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `نسخة_كاملة_المسابقات_المقيمين_الشعار_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showFeedback('success', 'تم تصدير النسخة الاحتياطية الشاملة لجميع المسابقات والمقيمين والإعدادات بنجاح');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        importFullBackup({
          competitions: Array.isArray(parsed.competitions) ? parsed.competitions : competitions,
          users: Array.isArray(parsed.users) ? parsed.users : users,
          globalEvaluators: Array.isArray(parsed.globalEvaluators) ? parsed.globalEvaluators : globalEvaluators,
          customLogo: parsed.customLogo !== undefined ? parsed.customLogo : customLogo,
          supervisorPassword: parsed.supervisorPassword || supervisorPassword,
          appName: parsed.appName || appName,
        });
        showFeedback('success', 'تم استيراد واستعادة جميع بيانات المسابقات والمقيمين والشعار بنجاح');
      } catch {
        showFeedback('error', 'ملف النسخة الاحتياطية غير صالح');
      }
    };
    reader.readAsText(file);
    if (backupInputRef.current) backupInputRef.current.value = '';
  };

  const isConnected = firebaseConnectionStatus === 'connected';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      {statusMsg && (
        <div
          className={`p-3.5 sm:p-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-between gap-2 shadow-sm border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-xs underline px-2 py-1 shrink-0">
            إغلاق
          </button>
        </div>
      )}

      {/* ==================== بطاقة حالة الاتصال ==================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border-2 border-emerald-200/80 dark:border-emerald-900/50 overflow-hidden">
        {/* رأس البطاقة */}
        <div className="bg-gradient-to-l from-[#09152C] via-[#132A52] to-[#09152C] text-white p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
                <Cloud className="w-6 h-6 text-[#F5D77F]" />
              </div>
              <div>
                <h2 className="text-base sm:text-xl font-black text-[#F5D77F]">
                  حالة الاتصال
                </h2>
                <p className="text-xs sm:text-sm text-blue-100/90 mt-1 leading-relaxed">
                  قاعدة البيانات متصلة وتعمل تلقائياً بين المشرف وجميع المقيمين
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-0">
              <span
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-2 shadow-sm ${
                  isConnected
                    ? 'bg-sky-500/25 text-sky-100 border border-sky-400/50'
                    : firebaseConnectionStatus === 'connecting'
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                    : 'bg-slate-900/60 text-slate-200 border border-slate-700'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                      : firebaseConnectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-bounce'
                      : 'bg-red-400'
                  }`}
                />
                <span>
                  {isConnected
                    ? 'متصل'
                    : firebaseConnectionStatus === 'connecting'
                    ? 'جاري الاتصال...'
                    : 'غير متصل'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* تثبيت التطبيق على الهواتف */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Logo size="md" className="shrink-0" />
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-emerald-950 dark:text-amber-400">
              أيقونة تثبيت التطبيق على الهاتف (PWA)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              تم تجهيز أيقونة المسابقات القرآنية بأحجام قياسية لجميع الهواتف (آيفون وأندرويد)
            </p>
          </div>
        </div>
        <div className="flex flex-col xs:flex-row items-stretch sm:items-center gap-2 shrink-0">
          {isInstallable && !isInstalled && (
            <button
              type="button"
              onClick={async () => {
                await install();
              }}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm transition active:scale-95 shadow-sm flex items-center justify-center cursor-pointer"
            >
              تثبيت مباشر الآن
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInstallModal(true)}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-slate-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-slate-700 font-bold text-xs sm:text-sm transition active:scale-95 flex items-center justify-center cursor-pointer"
          >
            دليل التثبيت على الجوال
          </button>
        </div>
      </div>

      {/* النسخ الاحتياطي وإدارة البيانات */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-extrabold text-emerald-950 dark:text-amber-400 mb-1">
          النسخ الاحتياطي وإدارة بيانات المسابقات
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          حفظ نسخة احتياطية لجميع المسابقات القرآنية والمتسابقين والمقيمين والنتائج أو استعادتها
        </p>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
          <div className="grid grid-cols-2 sm:flex gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportBackup}
              className="min-h-[46px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm transition active:scale-95 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download size={16} />
              <span>تصدير نسخة (JSON)</span>
            </button>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="min-h-[46px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload size={16} />
              <span>استيراد نسخة</span>
            </button>
          </div>

          {!showResetConfirm ? (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 hover:bg-red-100 text-red-700 dark:text-red-300 font-bold text-xs sm:text-sm transition active:scale-95 sm:mr-auto flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={16} />
              <span>مسح جميع بيانات المسابقات</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:mr-auto bg-red-50 dark:bg-red-950/60 p-2.5 rounded-xl border border-red-200 dark:border-red-800">
              <span className="text-xs font-bold text-red-800 dark:text-red-200 px-2 text-center sm:text-right">
                هل أنت متأكد من مسح كافة البيانات؟
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    deleteAllData();
                    setShowResetConfirm(false);
                    showFeedback('success', 'تم مسح جميع البيانات وإعادة الضبط');
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-red-600 text-white font-bold text-xs active:scale-95 cursor-pointer"
                >
                  نعم، مسح الكل
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs active:scale-95 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInstallModal && <MobileInstallModal onClose={() => setShowInstallModal(false)} />}
    </div>
  );
};

export default Settings;
