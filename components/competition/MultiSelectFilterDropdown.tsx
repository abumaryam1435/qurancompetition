import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Filter, Search, Check, ChevronDown, X } from 'lucide-react';

export interface MultiSelectFilterOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectFilterDropdownProps {
  label: string;
  options: MultiSelectFilterOption[];
  selectedValues: string[];
  onChange: (nextSelected: string[]) => void;
  placeholder?: string;
}

/**
 * قائمة تصفية منسدلة احترافية متعددة الاختيار:
 * - تحتوي بداخلها على خانة بحث فورية
 * - تحتوي على زري «تحديد الكل» و«إلغاء الكل»
 * - إذا لم يتم تحديد أي عنصر (selectedValues.length === 0) فإن ذلك يعني «الكل» تلقائياً
 */
export default function MultiSelectFilterDropdown({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'بحث داخل القائمة...',
}: MultiSelectFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      opt =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, searchText]);

  const isFilteredActive =
    selectedValues.length > 0 && selectedValues.length < options.length;

  const toggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    if (searchText.trim()) {
      const visibleValues = filteredOptions.map(o => o.value);
      const merged = Array.from(new Set([...selectedValues, ...visibleValues]));
      onChange(merged);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const handleDeselectAll = () => {
    if (searchText.trim()) {
      const visibleSet = new Set(filteredOptions.map(o => o.value));
      onChange(selectedValues.filter(v => !visibleSet.has(v)));
    } else {
      onChange([]);
    }
  };

  const statusText = useMemo(() => {
    if (selectedValues.length === 0 || selectedValues.length === options.length) {
      return 'الكل';
    }
    if (selectedValues.length === 1) {
      const found = options.find(o => o.value === selectedValues[0]);
      return found ? found.label : '1 محدد';
    }
    return `${selectedValues.length} محدد`;
  }, [selectedValues, options]);

  return (
    <div ref={containerRef} className="relative text-right" dir="rtl">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-xs font-black flex items-center justify-between gap-2 transition cursor-pointer ${
          isFilteredActive
            ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-500 text-emerald-950 dark:text-emerald-200 shadow-2xs'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Filter
            size={13}
            className={
              isFilteredActive
                ? 'text-emerald-600 dark:text-emerald-400 shrink-0'
                : 'text-slate-400 shrink-0'
            }
          />
          <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0">
            {label}:
          </span>
          <span
            className={`truncate font-black ${
              isFilteredActive
                ? 'text-emerald-800 dark:text-amber-300'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedValues.length > 0 && (
            <span
              onClick={e => {
                e.stopPropagation();
                onChange([]);
              }}
              className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center hover:bg-red-600 transition"
              title="إلغاء التحديد (إظهار الكل)"
            >
              ×
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 right-0 w-72 sm:w-80 bg-white dark:bg-slate-900 border-2 border-emerald-500/70 dark:border-slate-700 rounded-2xl shadow-2xl p-3 space-y-2.5">
          {/* رأس القائمة المنسدلة */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div>
              <span className="text-xs font-black text-slate-900 dark:text-white block">
                تصفية حسب: {label}
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                عدم تحديد أي خيار يعرض «الكل» تلقائياً
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          {/* خانة البحث داخل زر التصفية */}
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={placeholder}
              className="w-full min-h-[36px] pr-8 pl-7 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <Search
              size={14}
              className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute left-2 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* أزرار اختيار الكل وإلغاء الكل */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={options.length === 0}
              className="min-h-[32px] px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-[11px] font-black transition cursor-pointer disabled:opacity-40"
            >
              تحديد الكل ({filteredOptions.length})
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="min-h-[32px] px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 text-[11px] font-black transition cursor-pointer"
            >
              إلغاء الكل (عرض الكل)
            </button>
          </div>

          {/* قائمة الخيارات المتعددة */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isChecked = selectedValues.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleOption(opt.value)}
                    className={`w-full py-2 px-2.5 rounded-xl text-right flex items-center justify-between gap-2 transition cursor-pointer text-xs font-bold ${
                      isChecked
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isChecked
                            ? 'bg-white border-white text-emerald-700'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {opt.count !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                          isChecked
                            ? 'bg-emerald-800 text-amber-200'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-5 text-center text-xs font-bold text-slate-400">
                لا توجد نتائج مطابقة للبحث
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
