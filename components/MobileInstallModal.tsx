import React, { useContext } from 'react';
import Modal from './Modal';
import Logo from './Logo';
import { AppContext } from '../App';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Smartphone, Share2 } from 'lucide-react';

interface MobileInstallModalProps {
  onClose: () => void;
}

export const MobileInstallModal: React.FC<MobileInstallModalProps> = ({ onClose }) => {
  const context = useContext(AppContext);
  const appName = context?.appName || 'المسابقات القرآنية';
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const handleDirectInstall = async () => {
    const installed = await install();
    if (installed) {
      context?.showToast('تم تثبيت التطبيق بنجاح على جهازك', 'success');
      onClose();
    }
  };

  return (
    <Modal title="تثبيت تطبيق المسابقات القرآنية" onClose={onClose}>
      <div className="space-y-6 text-gray-800 text-base leading-relaxed dark:text-gray-200" dir="rtl">
        <div className="flex flex-col items-center text-center p-5 bg-emerald-50/70 dark:bg-slate-800/80 rounded-2xl border border-emerald-200/70 dark:border-slate-700">
          <Logo size="lg" className="h-20 w-20 mb-3 shadow-lg" />
          <h4 className="text-xl font-black text-emerald-950 dark:text-emerald-300">{appName}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            ثبّت التطبيق على الشاشة الرئيسية لهاتفك ليظهر بأيقونة المسابقات القرآنية ويعمل بملء الشاشة وبسرعة عالية.
          </p>

          {isInstallable && !isInstalled && (
            <button
              onClick={handleDirectInstall}
              className="mt-4 w-full sm:w-auto px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              <span>تثبيت التطبيق الآن بضغطة واحدة</span>
            </button>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <h4 className="text-lg font-extrabold text-gray-900 mb-3 flex items-center gap-2 dark:text-gray-100">
            <Smartphone className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>لمستخدمي أندرويد (متصفح Chrome)</span>
          </h4>
          <ol className="list-decimal pr-6 space-y-2 text-sm text-gray-800 dark:text-gray-200">
            <li>افتح التطبيق في متصفح جوجل كروم (Chrome).</li>
            <li>اضغط على زر القائمة (النقاط الثلاث الرأسية <span className="font-bold">⋮</span>) في أعلى المتصفح.</li>
            <li>اختر <span className="font-bold text-emerald-700 dark:text-emerald-400">«تثبيت التطبيق»</span> أو <span className="font-bold text-emerald-700 dark:text-emerald-400">«الإضافة إلى الشاشة الرئيسية»</span>.</li>
            <li>أكد الإضافة لتظهر أيقونة <strong>المسابقات القرآنية</strong> على شاشة هاتفك.</li>
          </ol>
        </div>

        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <h4 className="text-lg font-extrabold text-gray-900 mb-3 flex items-center gap-2 dark:text-gray-100">
            <Share2 className="h-5 w-5 text-amber-600 shrink-0" />
            <span>لمستخدمي آيفون وآيباد (متصفح Safari)</span>
          </h4>
          <ol className="list-decimal pr-6 space-y-2 text-sm text-gray-800 dark:text-gray-200">
            <li>افتح التطبيق في متصفح سفاري (Safari).</li>
            <li>اضغط على زر المشاركة (أيقونة المربع الذي يخرج منه سهم لأعلى) في الشريط السفلي.</li>
            <li>مرر للأسفل واختر <span className="font-bold text-amber-700 dark:text-amber-400">«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</span>.</li>
            <li>اضغط على <strong>«إضافة» (Add)</strong> في الزاوية العلوية لتظهر أيقونة التطبيق بالحجم الكامل.</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};

export default MobileInstallModal;