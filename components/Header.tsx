import React, { useContext, useState } from 'react';
import { AppContext } from '../App';
import { DEFAULT_APP_NAME } from '../constants';
import Logo, { AwqafBadge } from './Logo';
import MobileInstallModal from './MobileInstallModal';
import ChangePasswordModal from './ChangePasswordModal';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Smartphone, Sun, Moon, LogOut, RefreshCw, KeyRound } from 'lucide-react';

const Header: React.FC = () => {
  const context = useContext(AppContext);
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  if (!context) return null;
  const {
    currentUser,
    logout,
    theme,
    toggleTheme,
    appName,
    isSyncing,
    supervisorPassword,
    setSupervisorPassword,
  } = context;

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowInstallModal(true);
    }
  };

  return (
    <>
      <header className="bg-emerald-900 dark:bg-slate-900 text-white shadow-lg no-print border-b border-amber-500/30 dark:border-slate-800 sticky top-0 z-30">
        <div className="container mx-auto px-2 sm:px-6 lg:px-8 py-1.5 sm:py-2.5 flex justify-between items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
            <Logo size="sm" className="shrink-0" />
            <AwqafBadge variant="compact" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[11px] xs:text-xs sm:text-xl md:text-2xl font-black tracking-tight text-amber-300 dark:text-amber-400 leading-tight line-clamp-2 break-words whitespace-normal">
                {appName || DEFAULT_APP_NAME}
              </h1>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] xs:text-[11px] sm:text-xs text-emerald-100/90 dark:text-gray-300 leading-tight mt-0.5">
                <span className="leading-tight line-clamp-2 break-words whitespace-normal">
                  {currentUser?.role === 'supervisor'
                    ? 'لوحة تحكم المشرف العام'
                    : `المقيم: ${currentUser?.name || ''}`}
                </span>
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 text-amber-300 font-bold shrink-0">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span className="hidden xs:inline">مزامنة...</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {!isInstalled && (
              <button
                onClick={handleInstallClick}
                className="min-h-[36px] min-w-[36px] sm:min-h-[42px] sm:min-w-[42px] px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold cursor-pointer"
                title="تثبيت تطبيق المسابقات القرآنية على الهاتف"
              >
                {isInstallable ? (
                  <Download className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                ) : (
                  <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                )}
                <span className="hidden md:inline">تثبيت التطبيق</span>
              </button>
            )}

            {currentUser?.role === 'supervisor' && (
              <button
                onClick={() => setShowChangePasswordModal(true)}
                className="min-h-[36px] sm:min-h-[42px] px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-emerald-800/80 dark:bg-slate-800 hover:bg-emerald-700 dark:hover:bg-slate-700 text-amber-300 border border-amber-400/30 transition-all active:scale-95 flex items-center justify-center gap-1 text-[11px] sm:text-sm font-bold cursor-pointer"
                title="تغيير كلمة المرور للمشرف"
                aria-label="تغيير كلمة المرور للمشرف"
              >
                <KeyRound className="h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 text-amber-300" />
                <span className="hidden sm:inline">تغيير كلمة المرور</span>
                <span className="inline sm:hidden">المرور</span>
              </button>
            )}

            <button
              onClick={toggleTheme}
              className="min-h-[36px] min-w-[36px] sm:min-h-[42px] sm:min-w-[42px] p-1.5 sm:p-2 rounded-xl bg-emerald-800/70 dark:bg-slate-800 hover:bg-emerald-700 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
              aria-label="تغيير المظهر"
              title={theme === 'light' ? 'الوضع الليلي' : 'الوضع النهاري'}
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-amber-200" />
              ) : (
                <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
              )}
            </button>

            <button
              onClick={logout}
              className="min-h-[36px] sm:min-h-[42px] px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-red-600/90 hover:bg-red-700 text-white transition-all active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {showInstallModal && (
        <MobileInstallModal onClose={() => setShowInstallModal(false)} />
      )}

      {showChangePasswordModal && currentUser?.role === 'supervisor' && (
        <ChangePasswordModal
          onClose={() => setShowChangePasswordModal(false)}
          supervisorPassword={supervisorPassword}
          setSupervisorPassword={setSupervisorPassword}
        />
      )}
    </>
  );
};

export default Header;
