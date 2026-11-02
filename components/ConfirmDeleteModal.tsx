import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemTitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  isDangerous?: boolean;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  message,
  itemTitle,
  confirmLabel = 'نعم، تأكيد الحذف',
  cancelLabel = 'إلغاء',
  onConfirm,
  onClose,
  isDangerous = true,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10005] flex justify-center items-center p-3 sm:p-6 overflow-hidden animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      {/* الخلفية المعتمة */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* صندوق التأكيد المميز */}
      <div
        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-[94vw] sm:w-full max-w-md border-2 border-red-500/30 dark:border-red-600/40 z-[10006] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* شريط علوي تحذيري */}
        <div className="bg-gradient-to-l from-red-600 via-rose-600 to-red-700 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-white animate-bounce" />
            </div>
            <h3 className="text-base sm:text-lg font-black">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition cursor-pointer"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم الرسالة */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-bold leading-relaxed">
              {message}
            </p>

            {itemTitle && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 font-black text-xs sm:text-sm text-red-900 dark:text-red-200 break-words flex items-center gap-2">
                <Trash2 size={16} className="text-red-600 shrink-0" />
                <span className="truncate">{itemTitle}</span>
              </div>
            )}

            <p className="text-[11px] text-red-600 dark:text-red-400 font-extrabold flex items-center gap-1.5 pt-1">
              <span>⚠️ تنبيه:</span>
              <span>هذا الإجراء نهائي ولا يمكن التراجع عنه.</span>
            </p>
          </div>

          {/* أزرار التأكيد والإلغاء */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs sm:text-sm transition flex items-center justify-center gap-1.5 shadow-md shadow-red-600/30 cursor-pointer"
            >
              <Trash2 size={16} />
              <span>{confirmLabel}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm transition flex items-center justify-center cursor-pointer"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
