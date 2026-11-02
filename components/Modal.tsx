
import React, { useEffect } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode; 
  hideDefaultCloseButton?: boolean; 
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, footer, hideDefaultCloseButton = false }) => {
  // منع التمرير في الخلفية عند فتح النافذة
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 z-[10000] flex justify-center items-center p-3 sm:p-6 overflow-hidden animate-in fade-in duration-300" 
      role="dialog"
      aria-modal="true"
    >
      {/* الخلفية المعتمة مع تأثير بلوري معزز */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* حاوية المودال الأساسية - استخدام وحدات dvh لضمان دقة الارتفاع على شاشات الهواتف */}
      <div 
        className="relative bg-white dark:bg-slate-900 rounded-3xl sm:rounded-[2.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.6)] w-[95vw] sm:w-full max-w-[420px] sm:max-w-md md:max-w-lg flex flex-col transition-all duration-300 ease-out animate-in zoom-in-95 slide-in-from-bottom-8 border border-white/20 z-[10001] overflow-hidden"
        style={{ 
          maxHeight: 'min(90dvh, 850px)',
          marginBottom: 'env(safe-area-inset-bottom)' 
        }} 
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* الرأس - ثابت في الأعلى */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 sm:py-4 border-b dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0 z-10">
          <h3 className="text-sm sm:text-lg font-black text-green-900 dark:text-green-400 truncate pr-1">{title}</h3>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all active:scale-90 flex items-center justify-center cursor-pointer"
            aria-label="إغلاق"
          >
            <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* المحتوى - مرن وقابل للتمرير فقط */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 min-h-0 custom-scrollbar overscroll-contain bg-white dark:bg-slate-900 scroll-smooth">
          <div className="pb-2">
            {children}
          </div>
        </div>
        
        {/* التذييل - ثابت في الأسفل تماماً */}
        {(footer || !hideDefaultCloseButton) && (
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gray-50/95 dark:bg-slate-800/95 backdrop-blur-md border-t dark:border-slate-800 shrink-0 z-10">
                {footer ? footer : (
                    <button
                        onClick={onClose}
                        className="w-full min-h-[48px] py-3 sm:py-3.5 bg-green-700 text-white rounded-2xl hover:bg-green-800 transition-all font-black text-sm sm:text-base shadow-xl active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <span>إغلاق</span>
                    </button>
                )}
                {/* مساحة إضافية لهواتف الآيفون داخل التذييل لضمان عدم التداخل مع الشريط السفلي */}
                <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }}></div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
