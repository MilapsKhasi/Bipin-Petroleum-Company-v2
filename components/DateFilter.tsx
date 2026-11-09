import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface DateFilterProps {
  onFilterChange: (range: { startDate: string | null; endDate: string | null }) => void;
}

export interface DateFilterHandle {
  focusYear: () => void;
  focusMonth: () => void;
}

const ALL_MONTH_NAMES = [
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

const MONTH_MAP: { [key: string]: number } = {
  'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
  'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
};

const STORAGE_YEARS_KEY = 'bpc_date_filter_years';
const STORAGE_MONTHS_KEY = 'bpc_date_filter_months';

const areArraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

const getInitialYears = (): string[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_YEARS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Failed to parse saved filter years", e);
  }
  return ['This Year'];
};

const getInitialMonths = (): string[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_MONTHS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Failed to parse saved filter months", e);
  }
  return ['This Month'];
};

const DateFilter = forwardRef<DateFilterHandle, DateFilterProps>(({ onFilterChange }, ref) => {
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const yearOptions = [
    { label: 'This Year', value: 'This Year' },
    { label: `${currentYear - 1}-${currentYear}`, value: `${currentYear - 1}-${currentYear}` },
    { label: `${currentYear}-${currentYear + 1}`, value: `${currentYear}-${currentYear + 1}` },
    { label: `${currentYear - 2}-${currentYear - 1}`, value: `${currentYear - 2}-${currentYear - 1}` },
  ];

  const [selectedYears, setSelectedYears] = useState<string[]>(getInitialYears);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(getInitialMonths);

  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isMonthOpen, setIsMonthOpen] = useState(false);

  const yearBtnRef = useRef<HTMLButtonElement>(null);
  const monthBtnRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focusYear: () => {
      yearBtnRef.current?.focus();
    },
    focusMonth: () => {
      monthBtnRef.current?.focus();
    },
  }));

  const updateYears = (next: string[]) => {
    setSelectedYears(next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_YEARS_KEY, JSON.stringify(next));
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('bpc_date_filter_sync', { detail: { years: next } }));
  };

  const updateMonths = (next: string[]) => {
    setSelectedMonths(next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_MONTHS_KEY, JSON.stringify(next));
      }
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('bpc_date_filter_sync', { detail: { months: next } }));
  };

  // Sync across tabs and other mounted DateFilter instances
  useEffect(() => {
    const handleSync = (e: any) => {
      if (e?.detail) {
        if (Array.isArray(e.detail.years)) {
          setSelectedYears(prev => (areArraysEqual(prev, e.detail.years) ? prev : e.detail.years));
        }
        if (Array.isArray(e.detail.months)) {
          setSelectedMonths(prev => (areArraysEqual(prev, e.detail.months) ? prev : e.detail.months));
        }
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_YEARS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSelectedYears(prev => (areArraysEqual(prev, parsed) ? prev : parsed));
          }
        } catch (_) {}
      }
      if (e.key === STORAGE_MONTHS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSelectedMonths(prev => (areArraysEqual(prev, parsed) ? prev : parsed));
          }
        } catch (_) {}
      }
    };

    window.addEventListener('bpc_date_filter_sync', handleSync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('bpc_date_filter_sync', handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsYearOpen(false);
        setIsMonthOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute date range whenever selectedYears or selectedMonths change
  useEffect(() => {
    if (selectedYears.length === 0 || selectedMonths.length === 0) {
      onFilterChange({ startDate: null, endDate: null });
      return;
    }

    const startDates: string[] = [];
    const endDates: string[] = [];

    selectedYears.forEach((yearVal) => {
      let startYear = currentYear;
      if (yearVal === 'This Year') {
        startYear = currentMonthIdx < 3 ? currentYear - 1 : currentYear;
      } else {
        const parts = yearVal.split('-');
        if (parts.length === 2) {
          startYear = parseInt(parts[0], 10);
        }
      }
      const endYear = startYear + 1;

      selectedMonths.forEach((monthVal) => {
        if (monthVal === 'All Months') {
          startDates.push(`${startYear}-04-01`);
          endDates.push(`${endYear}-03-31`);
        } else if (monthVal === 'This Month') {
          const calYear = currentMonthIdx >= 3 ? startYear : endYear;
          const monthStr = String(currentMonthIdx + 1).padStart(2, '0');
          startDates.push(`${calYear}-${monthStr}-01`);
          const lastDay = new Date(calYear, currentMonthIdx + 1, 0).getDate();
          endDates.push(`${calYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`);
        } else if (MONTH_MAP[monthVal] !== undefined) {
          const mIdx = MONTH_MAP[monthVal];
          const calYear = mIdx >= 3 ? startYear : endYear;
          const monthStr = String(mIdx + 1).padStart(2, '0');
          startDates.push(`${calYear}-${monthStr}-01`);
          const lastDay = new Date(calYear, mIdx + 1, 0).getDate();
          endDates.push(`${calYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`);
        }
      });
    });

    if (startDates.length === 0 || endDates.length === 0) {
      onFilterChange({ startDate: null, endDate: null });
      return;
    }

    startDates.sort();
    endDates.sort();

    const startDate = startDates[0];
    const endDate = endDates[endDates.length - 1];

    onFilterChange({ startDate, endDate });
  }, [selectedYears, selectedMonths]);

  // Year Handlers
  const toggleYear = (val: string) => {
    if (selectedYears.includes(val)) {
      if (selectedYears.length > 1) {
        updateYears(selectedYears.filter((y) => y !== val));
      }
    } else {
      updateYears([...selectedYears, val]);
    }
  };

  const selectAllYears = () => {
    updateYears(yearOptions.map((y) => y.value));
  };

  const clearYears = () => {
    updateYears(['This Year']);
  };

  // Month Handlers
  const toggleMonth = (val: string) => {
    if (val === 'All Months') {
      if (selectedMonths.includes('All Months')) {
        updateMonths(['This Month']);
      } else {
        updateMonths(['All Months']);
      }
      return;
    }

    if (val === 'This Month') {
      updateMonths(['This Month']);
      return;
    }

    // Individual month clicked
    let nextMonths = selectedMonths.filter((m) => m !== 'All Months' && m !== 'This Month');
    if (nextMonths.includes(val)) {
      nextMonths = nextMonths.filter((m) => m !== val);
    } else {
      nextMonths.push(val);
    }

    if (nextMonths.length === 0) {
      updateMonths(['This Month']);
    } else if (nextMonths.length === 12) {
      updateMonths(['All Months']);
    } else {
      updateMonths(nextMonths);
    }
  };

  const selectAllMonths = () => {
    updateMonths(['All Months']);
  };

  const clearMonths = () => {
    updateMonths(['This Month']);
  };

  // Label helpers
  const getYearLabel = () => {
    if (selectedYears.length === 0) return 'Select Year';
    if (selectedYears.length === 1) return selectedYears[0];
    if (selectedYears.length === yearOptions.length) return 'All Years';
    return `${selectedYears.length} Years`;
  };

  const getMonthLabel = () => {
    if (selectedMonths.length === 0) return 'Select Month';
    if (selectedMonths.includes('All Months')) return 'All Months';
    if (selectedMonths.includes('This Month')) return 'This Month';
    if (selectedMonths.length === 1) return selectedMonths[0];
    if (selectedMonths.length <= 2) return selectedMonths.join(', ');
    return `${selectedMonths.length} Months`;
  };

  return (
    <div ref={containerRef} className="flex space-x-2 relative">
      {/* Year Dropdown */}
      <div className="relative">
        <button
          ref={yearBtnRef}
          type="button"
          onClick={() => {
            setIsYearOpen(!isYearOpen);
            setIsMonthOpen(false);
          }}
          className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer outline-none min-w-[110px] focus:border-primary focus:ring-1 focus:ring-primary flex items-center justify-between gap-1.5 shadow-xs transition-all duration-150 active:scale-[0.98]"
        >
          <span className="truncate">{getYearLabel()}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0 ml-1" />
        </button>

        {isYearOpen && (
          <div className="absolute top-full left-0 mt-1 z-[600] w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg p-2 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 dark:border-slate-700 text-[11px] text-slate-400 font-medium">
              <span>Select Years</span>
              <div className="space-x-1.5">
                <button type="button" onClick={selectAllYears} className="text-primary hover:underline font-semibold">
                  All
                </button>
                <span>·</span>
                <button type="button" onClick={clearYears} className="text-slate-400 hover:underline">
                  Reset
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1 custom-scrollbar">
              {yearOptions.map((opt) => {
                const isChecked = selectedYears.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleYear(opt.value)}
                      className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Month Dropdown */}
      <div className="relative">
        <button
          ref={monthBtnRef}
          type="button"
          onClick={() => {
            setIsMonthOpen(!isMonthOpen);
            setIsYearOpen(false);
          }}
          className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer outline-none min-w-[110px] focus:border-primary focus:ring-1 focus:ring-primary flex items-center justify-between gap-1.5 shadow-xs transition-all duration-150 active:scale-[0.98]"
        >
          <span className="truncate">{getMonthLabel()}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0 ml-1" />
        </button>

        {isMonthOpen && (
          <div className="absolute top-full right-0 sm:left-0 mt-1 z-[600] w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg p-2 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100 dark:border-slate-700 text-[11px] text-slate-400 font-medium">
              <span>Select Months</span>
              <div className="space-x-1.5">
                <button type="button" onClick={selectAllMonths} className="text-primary hover:underline font-semibold">
                  All
                </button>
                <span>·</span>
                <button type="button" onClick={clearMonths} className="text-slate-400 hover:underline">
                  Reset
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1 custom-scrollbar">
              <label className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-slate-700 dark:text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={selectedMonths.includes('This Month')}
                  onChange={() => toggleMonth('This Month')}
                  className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                />
                <span>This Month</span>
              </label>

              <label className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-slate-700 dark:text-slate-200 font-medium border-b border-slate-100 dark:border-slate-700/50 pb-1.5 mb-1">
                <input
                  type="checkbox"
                  checked={selectedMonths.includes('All Months')}
                  onChange={() => toggleMonth('All Months')}
                  className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                />
                <span>All Months</span>
              </label>

              {ALL_MONTH_NAMES.map((mName) => {
                const isChecked = selectedMonths.includes('All Months') || selectedMonths.includes(mName);
                return (
                  <label
                    key={mName}
                    className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMonth(mName)}
                      className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    />
                    <span>{mName}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default DateFilter;

