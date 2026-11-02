
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

interface ChangePasswordModalProps {
  onClose: () => void;
  supervisorPassword: string;
  setSupervisorPassword: (password: string) => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, supervisorPassword, setSupervisorPassword }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const oldPasswordInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (oldPasswordInputRef.current && window.innerWidth >= 768) {
      oldPasswordInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (message) {
      setMessage(null);
    }
  }, [oldPassword, newPassword, confirmPassword]);

  const handleSubmitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (oldPassword !== supervisorPassword) {
      setMessage({ type: 'error', text: 'كلمة المرور الحالية غير صحيحة.' });
      return;
    }
    if (!newPassword || newPassword.length < 1) {
      setMessage({ type: 'error', text: 'يرجى إدخال كلمة المرور الجديدة.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
      return;
    }

    setSupervisorPassword(newPassword);
    setMessage({ type: 'success', text: 'تم تغيير كلمة المرور للمشرف بنجاح.' });

    setTimeout(() => {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    }, 1200);
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (window.innerWidth < 768) {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
    }
  };

  return (
    <Modal title="تغيير كلمة المرور للمشرف" onClose={onClose} hideDefaultCloseButton={true}>
      <form onSubmit={handleSubmitPassword} className="space-y-4">
        {message && (
          <div className={`p-3 rounded-xl text-center mb-4 text-sm font-bold ${message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border border-green-300 dark:border-green-700' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-300 dark:border-red-700'}`}>
            <p>{message.text}</p>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-emerald-700 dark:text-amber-400 shrink-0" />
            أدخل كلمة المرور الحالية ثم كلمة المرور الجديدة
          </span>
          <button
            type="button"
            onClick={() => setShowPasswords((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-amber-400 hover:underline cursor-pointer"
          >
            {showPasswords ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                إخفاء الكلمات
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                إظهار الكلمات
              </>
            )}
          </button>
        </div>

        <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
          💡 تقبل كلمة المرور أحرفاً وأرقاماً ورموزاً، أو أرقاماً فقط، أو أحرفاً فقط (كبيرة أو صغيرة)، أو رموزاً فقط حسب ما تحدده.
        </div>

        <div>
          <label htmlFor="old-password-modal" className="block text-sm font-bold text-gray-700 mb-1 dark:text-gray-200">
            كلمة المرور الحالية
          </label>
          <input
            id="old-password-modal"
            type={showPasswords ? 'text' : 'password'}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="input-style"
            required
            ref={oldPasswordInputRef}
            aria-label="كلمة المرور الحالية"
            onFocus={handleInputFocus}
            placeholder="أدخل كلمة المرور الحالية"
          />
        </div>

        <div>
          <label htmlFor="new-password-modal" className="block text-sm font-bold text-gray-700 mb-1 dark:text-gray-200">
            كلمة المرور الجديدة
          </label>
          <input
            id="new-password-modal"
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-style"
            required
            ref={newPasswordInputRef}
            aria-label="كلمة المرور الجديدة"
            onFocus={handleInputFocus}
            placeholder="أرقام، أو أحرف (كبيرة/صغيرة)، أو رموز..."
          />
        </div>

        <div>
          <label htmlFor="confirm-password-modal" className="block text-sm font-bold text-gray-700 mb-1 dark:text-gray-200">
            تأكيد كلمة المرور الجديدة
          </label>
          <input
            id="confirm-password-modal"
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-style"
            required
            ref={confirmPasswordInputRef}
            aria-label="تأكيد كلمة المرور الجديدة"
            onFocus={handleInputFocus}
            placeholder="أعد كتابة كلمة المرور الجديدة"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-4 py-2.5 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors text-sm sm:text-base font-bold dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="min-h-[46px] px-4 py-2.5 text-sm sm:text-base font-bold text-white bg-emerald-800 rounded-xl hover:bg-emerald-900 transition-colors cursor-pointer"
          >
            حفظ كلمة المرور
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
