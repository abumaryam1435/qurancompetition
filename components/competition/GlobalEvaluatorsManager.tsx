import React, { useState, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../../App';
import { GlobalEvaluator, Competition } from '../../types';
import {
  Users,
  UserPlus,
  Trash2,
  Edit,
  KeyRound,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  Search,
  Plus,
  Award,
  Sparkles,
  FileText,
  Copy,
  Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmDeleteModal from '../ConfirmDeleteModal';

export const GlobalEvaluatorsManager: React.FC = () => {
  const context = useContext(AppContext);
  if (!context) return null;

  const {
    globalEvaluators,
    updateGlobalEvaluators,
    competitions,
    updateCompetitions,
    showToast,
  } = context;

  // حقول إضافة مقيم جديد
  const [newEvaluatorName, setNewEvaluatorName] = useState('');
  const [newEvaluatorPin, setNewEvaluatorPin] = useState('');
  const [newEvaluatorNotes, setNewEvaluatorNotes] = useState('');

  // حقول الإضافة الجماعية
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // التعديل على مقيم قائم في السجل العام
  const [editingEvaluator, setEditingEvaluator] = useState<GlobalEvaluator | null>(null);

  // التصفية والبحث
  const [searchTerm, setSearchTerm] = useState('');

  // الحذف
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // اختيار مسابقة لإسناد مقيمين إليها مباشرة
  const [targetCompId, setTargetCompId] = useState<string>(() => {
    const activeComp = competitions.find(c => c.isActive);
    return activeComp ? activeComp.id : competitions[0]?.id || '';
  });
  const [selectedGlobalIds, setSelectedGlobalIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredEvaluators = useMemo(() => {
    if (!searchTerm.trim()) return globalEvaluators;
    const term = searchTerm.toLowerCase().trim();
    return globalEvaluators.filter(
      e =>
        e.name.toLowerCase().includes(term) ||
        e.pin.toLowerCase().includes(term) ||
        (e.notes || '').toLowerCase().includes(term)
    );
  }, [globalEvaluators, searchTerm]);

  // توليد كلمة مرور عشوائية بأرقام فقط (4 أرقام)
  const generateRandomPin = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  // توليد كلمة مرور بحروف وأرقام
  const generateAlphaNumericPin = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  // توليد كلمة مرور قوية مع رموز
  const generateStrongPinWithSymbols = () => {
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
    return res;
  };

  const handleAddEvaluator = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newEvaluatorName.trim();
    if (!trimmedName) {
      showToast('يرجى كتابة اسم المقيم أولاً', 'error');
      return;
    }

    if (globalEvaluators.some(e => e.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      showToast('هذا المقيم مسجل بالفعل في السجل العام', 'error');
      return;
    }

    const pinToUse = newEvaluatorPin.trim() || generateRandomPin();

    const newEval: GlobalEvaluator = {
      id: Date.now(),
      name: trimmedName,
      pin: pinToUse,
      notes: newEvaluatorNotes.trim() || undefined,
      createdAt: Date.now(),
    };

    updateGlobalEvaluators([...globalEvaluators, newEval]);
    setNewEvaluatorName('');
    setNewEvaluatorPin('');
    setNewEvaluatorNotes('');
    showToast(`تمت إضافة المقيم (${trimmedName}) إلى صفحة المقيمين بنجاح!`, 'success');
  };

  // الإضافة الجماعية للمقيمين من أسطر
  const handleBulkAddEvaluators = () => {
    const lines = bulkText
      .split('\n')
      .map(l => l.trim().replace(/^[\d٠-٩]+[\s\-.)،:]+/, '').trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      showToast('يرجى كتابة أسماء المقيمين (اسم في كل سطر)', 'error');
      return;
    }

    let addedCount = 0;
    const nextList = [...globalEvaluators];

    lines.forEach((name, idx) => {
      if (!nextList.some(e => e.name.toLowerCase() === name.toLowerCase())) {
        nextList.push({
          id: Date.now() + idx + Math.floor(Math.random() * 1000),
          name,
          pin: generateRandomPin(),
          createdAt: Date.now(),
        });
        addedCount++;
      }
    });

    updateGlobalEvaluators(nextList);
    setBulkText('');
    setShowBulkAdd(false);
    showToast(`تمت إضافة (${addedCount}) مقيم جديد إلى صفحة المقيمين بنجاح!`, 'success');
  };

  // حفظ التعديل ومزامنته مع المسابقات المسند إليها المقيم
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvaluator) return;
    const trimmedName = editingEvaluator.name.trim();
    if (!trimmedName) {
      showToast('اسم المقيم لا يمكن أن يكون فارغاً', 'error');
      return;
    }

    const originalEval = globalEvaluators.find(ev => ev.id === editingEvaluator.id);
    const updatedPin = editingEvaluator.pin.trim() || '1234';

    const nextList = globalEvaluators.map(e =>
      e.id === editingEvaluator.id
        ? {
            ...editingEvaluator,
            name: trimmedName,
            pin: updatedPin,
          }
        : e
    );

    updateGlobalEvaluators(nextList);

    // تحديث اسم ورمز المقيم في جميع المسابقات التي تم اختياره فيها سابقاً
    if (originalEval) {
      const oldNameLower = originalEval.name.trim().toLowerCase();
      let compsChanged = false;
      const updatedComps = competitions.map(comp => {
        const hasEval = (comp.evaluators || []).some(
          ev => ev.name.trim().toLowerCase() === oldNameLower
        );
        if (!hasEval) return comp;
        compsChanged = true;
        return {
          ...comp,
          evaluators: (comp.evaluators || []).map(ev =>
            ev.name.trim().toLowerCase() === oldNameLower
              ? { ...ev, name: trimmedName, pin: updatedPin }
              : ev
          ),
        };
      });
      if (compsChanged) {
        updateCompetitions(updatedComps);
      }
    }

    setEditingEvaluator(null);
    showToast('تم تحديث بيانات المقيم ومزامنتها بنجاح', 'success');
  };

  // الحذف
  const handleDeleteEvaluator = (id: number) => {
    updateGlobalEvaluators(globalEvaluators.filter(e => e.id !== id));
    setDeleteConfirmId(null);
    showToast('تم حذف المقيم من السجل العام بنجاح', 'info');
  };

  // إسناد المقيمين المحددين من السجل العام إلى مسابقة محددة
  const handleAttachSelectedToCompetition = () => {
    if (selectedGlobalIds.length === 0) {
      showToast('يرجى تحديد مقيم واحد على الأقل من السجل العام', 'error');
      return;
    }

    const targetComp = competitions.find(c => c.id === targetCompId);
    if (!targetComp) {
      showToast('يرجى اختيار مسابقة لإسناد المقيمين إليها', 'error');
      return;
    }

    const currentCompEvaluators = targetComp.evaluators || [];
    const firstLevelId = targetComp.levels?.[0]?.id ? [targetComp.levels[0].id] : [];

    let attachedCount = 0;
    const nextCompEvaluators = [...currentCompEvaluators];

    selectedGlobalIds.forEach(globalId => {
      const gEval = globalEvaluators.find(e => e.id === globalId);
      if (!gEval) return;

      // التأكد من عدم التكرار بالاسم
      if (!nextCompEvaluators.some(e => e.name.trim().toLowerCase() === gEval.name.trim().toLowerCase())) {
        nextCompEvaluators.push({
          id: Date.now() + Math.floor(Math.random() * 10000),
          name: gEval.name,
          pin: gEval.pin,
          levelIds: firstLevelId,
        });
        attachedCount++;
      }
    });

    const updatedCompetitions = competitions.map(c =>
      c.id === targetCompId ? { ...c, evaluators: nextCompEvaluators } : c
    );

    updateCompetitions(updatedCompetitions);
    setSelectedGlobalIds([]);
    showToast(
      `تم إسناد (${attachedCount}) مقيم إلى مسابقة "${targetComp.name}" بنجاح!`,
      'success'
    );
  };

  // التحديد والتظليل الجماعي
  const toggleSelectAll = () => {
    if (selectedGlobalIds.length === filteredEvaluators.length) {
      setSelectedGlobalIds([]);
    } else {
      setSelectedGlobalIds(filteredEvaluators.map(e => e.id));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedGlobalIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // تصدير كـ Excel
  const handleExportExcel = () => {
    const dataToExport = globalEvaluators.map((e, idx) => ({
      'م': idx + 1,
      'اسم المقيم': e.name,
      'رمز الدخول (PIN)': e.pin,
      'الملاحظات': e.notes || 'لا يوجد',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'المقيمون المعتمدون');
    XLSX.writeFile(workbook, 'السجل_العام_للمقيمين_المعتمدين.xlsx');
    showToast('تم تصدير ملف اكسل بأسماء ورموز المقيمين بنجاح', 'success');
  };

  // استيراد من ملف Excel
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt: ProgressEvent<FileReader>) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        let importedCount = 0;
        const nextList = [...globalEvaluators];

        data.forEach((row: any, idx: number) => {
          const name = (row['اسم المقيم'] || row['الاسم'] || row['Name'] || '').toString().trim();
          const pin = (row['رمز الدخول (PIN)'] || row['الرمز'] || row['PIN'] || generateRandomPin()).toString().trim();
          const notes = (row['الملاحظات'] || row['ملاحظات'] || '').toString().trim();

          if (name && !nextList.some(e => e.name.toLowerCase() === name.toLowerCase())) {
            nextList.push({
              id: Date.now() + idx + Math.floor(Math.random() * 1000),
              name,
              pin,
              notes: notes || undefined,
              createdAt: Date.now(),
            });
            importedCount++;
          }
        });

        updateGlobalEvaluators(nextList);
        showToast(`تم استيراد (${importedCount}) مقيم بنجاح!`, 'success');
      } catch (err) {
        showToast('فشل قراءة ملف اكسل، يرجى التأكد من هيكل الملف', 'error');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 sm:space-y-6 text-right" dir="rtl">
      {/* ==================== رأس الصفحة والتوضيح ==================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-emerald-100/90 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 text-amber-300 flex items-center justify-center shrink-0 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-black text-emerald-950 dark:text-emerald-300">
                  السجل العام للمقيمين المعتمدين
                </h2>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800">
                  {globalEvaluators.length} مقيم معتمد
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                سجل دائم لإضافة وإدارة المقيمين ورموز دخولهم مرة واحدة وإعادة إسنادهم لأي مسابقة بضغطة زر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={globalEvaluators.length === 0}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-black transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Download size={15} />
              <span>تصدير Excel</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-black transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Upload size={15} />
              <span>استيراد Excel</span>
            </button>
          </div>
        </div>

        {/* نموذج إضافة مقيم فردي أو جماعي */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
              <UserPlus size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span>إضافة مقيم جديد للسجل العام:</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowBulkAdd(!showBulkAdd)}
              className="text-xs font-extrabold text-amber-800 dark:text-amber-300 underline hover:opacity-80 cursor-pointer"
            >
              {showBulkAdd ? 'إلغاء الإضافة الجماعية' : 'إضافة مجموعة مقيمين دفعة واحدة (لصق أسماء)'}
            </button>
          </div>

          {!showBulkAdd ? (
            <form onSubmit={handleAddEvaluator} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  اسم المقيم الكامل
                </label>
                <input
                  type="text"
                  value={newEvaluatorName}
                  onChange={e => setNewEvaluatorName(e.target.value)}
                  placeholder="مثال: الشيخ عبدالله محمد..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    رمز الدخول (PIN)
                  </label>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setNewEvaluatorPin(generateRandomPin())}
                      className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 transition cursor-pointer"
                      title="توليد 4 أرقام"
                    >
                      أرقام
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEvaluatorPin(generateAlphaNumericPin())}
                      className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 transition cursor-pointer"
                      title="توليد حروف وأرقام"
                    >
                      حروف/أرقام
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEvaluatorPin(generateStrongPinWithSymbols())}
                      className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-200 transition cursor-pointer flex items-center gap-0.5"
                      title="توليد مع رموز"
                    >
                      <Sparkles size={10} />
                      مع رموز
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={newEvaluatorPin}
                  onChange={e => setNewEvaluatorPin(e.target.value)}
                  placeholder="أدخل الرمز أو اختر توليد..."
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-emerald-500 text-center"
                />
              </div>

              <div className="sm:col-span-3 flex items-center gap-2">
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus size={16} />
                  <span>إضافة المقيم</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder="الطق أسماء المقيمين هنا (اسم في كل سطر)...&#10;أحمد علي المحمد&#10;سعد عبد الله الزهراني&#10;خالد إبراهيم العلي"
                rows={4}
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-emerald-500 leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkAdd(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleBulkAddEvaluators}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-700 text-white font-black text-xs sm:text-sm cursor-pointer shadow-sm active:scale-95"
                >
                  إضافة كافة القائمة بالسجل
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== شريط التحديد والإسناد لمسابقة محددة ==================== */}
      {globalEvaluators.length > 0 && (
        <div className="bg-gradient-to-l from-emerald-900 via-emerald-800 to-teal-900 text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-3 border border-emerald-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-amber-300 flex items-center gap-1.5">
                <Sparkles size={16} />
                <span>إسناد السجل العام للمسابقات بضغطة زر:</span>
              </h3>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                حدد المقيمين المطلوبة إضافتهم من القائمة أدناه واختر المسابقة لإدراجهم فيها فوراً
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={targetCompId}
                onChange={e => setTargetCompId(e.target.value)}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-amber-400/40 bg-slate-900 text-white font-black text-xs sm:text-sm shrink-0"
              >
                {competitions.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.isActive ? '• (نشطة حالياً)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAttachSelectedToCompetition}
                disabled={selectedGlobalIds.length === 0}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 font-black text-xs sm:text-sm transition active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 size={16} />
                <span>إدراج المحددين ({selectedGlobalIds.length}) للمسابقة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== شريط البحث وجدول/بطاقات المقيمين ==================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="ابحث عن اسم المقيم أو الرمز..."
              className="w-full min-h-[42px] pr-10 pl-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {filteredEvaluators.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-black cursor-pointer border border-slate-200 dark:border-slate-700 self-start sm:self-auto shrink-0"
            >
              {selectedGlobalIds.length === filteredEvaluators.length
                ? 'إلغاء تحديد الكل'
                : 'تحديد كافة القائمة'}
            </button>
          )}
        </div>

        {/* شبكة بطاقات المقيمين المعتمدين */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEvaluators.map(ev => {
            const isSelected = selectedGlobalIds.includes(ev.id);
            const compsContainingEv = competitions.filter(c =>
              (c.evaluators || []).some(
                e => e.name.trim().toLowerCase() === ev.name.trim().toLowerCase()
              )
            );

            return (
              <div
                key={ev.id}
                onClick={() => toggleSelectOne(ev.id)}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent div
                        className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0 mt-1"
                      />
                      <span className="font-black text-base sm:text-lg text-slate-900 dark:text-white block leading-snug">
                        {ev.name}
                      </span>
                    </div>

                    <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 text-xs font-black border border-amber-300/70 shrink-0 font-mono">
                      🔑 {ev.pin}
                    </span>
                  </div>

                  {ev.notes && (
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700">
                      {ev.notes}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Award size={12} className="text-emerald-600 shrink-0" />
                    <span>مشارك في ({compsContainingEv.length}) مسابقة:</span>
                    {compsContainingEv.length > 0 ? (
                      <span className="text-emerald-800 dark:text-emerald-300 font-black truncate max-w-[180px]">
                        {compsContainingEv.map(c => c.name).join(' ، ')}
                      </span>
                    ) : (
                      <span className="text-slate-400">غير مسند لمسابقات حالياً</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setEditingEvaluator(ev);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs font-black flex items-center gap-1 cursor-pointer border border-amber-200 dark:border-amber-800"
                  >
                    <Edit size={13} />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteConfirmId(ev.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-300 text-xs font-black flex items-center gap-1 cursor-pointer border border-red-200 dark:border-red-900"
                  >
                    <Trash2 size={13} />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredEvaluators.length === 0 && (
            <div className="col-span-full p-8 text-center text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm space-y-2">
              <Users className="w-8 h-8 text-slate-400 mx-auto" />
              <p>لا يوجد مقيمون معتمدون في السجل العام حالياً.</p>
              <p className="text-xs text-slate-400">
                استخدم نموذج الإضافة أعلاه لإدراج مقيمين جدد أو استيرادهم من ملف اكسل.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* نافذة تعديل بيانات المقيم */}
      {editingEvaluator && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4">
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Edit className="w-5 h-5 text-amber-600" />
              <span>تعديل بيانات المقيم في السجل العام</span>
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  اسم المقيم:
                </label>
                <input
                  type="text"
                  value={editingEvaluator.name}
                  onChange={e =>
                    setEditingEvaluator({ ...editingEvaluator, name: e.target.value })
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  رمز الدخول (PIN / كلمة المرور):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editingEvaluator.pin}
                    onChange={e =>
                      setEditingEvaluator({ ...editingEvaluator, pin: e.target.value })
                    }
                    className="w-full min-h-[44px] pl-16 pr-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-sm font-mono text-center"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditingEvaluator({ ...editingEvaluator, pin: generateRandomPin() })
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 rounded-lg text-xs font-black cursor-pointer"
                  >
                    توليد
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات وتخصص المقيم (اختياري):
                </label>
                <textarea
                  value={editingEvaluator.notes || ''}
                  onChange={e =>
                    setEditingEvaluator({ ...editingEvaluator, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs"
                  placeholder="مثل: متخصص في القراءات العشر / مدرسة الفرقان..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEvaluator(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs sm:text-sm cursor-pointer shadow-sm active:scale-95"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف المقيم من السجل العام */}
      {deleteConfirmId && (
        <ConfirmDeleteModal
          isOpen={true}
          title="حذف المقيم من السجل العام"
          message="هل أنت متأكد من حذف هذا المقيم من السجل العام؟ لن يؤثر ذلك على التقييمات المرصودة سابقاً في المسابقات."
          itemTitle={globalEvaluators.find(e => e.id === deleteConfirmId)?.name}
          onConfirm={() => handleDeleteEvaluator(deleteConfirmId)}
          onClose={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
};

export default GlobalEvaluatorsManager;
