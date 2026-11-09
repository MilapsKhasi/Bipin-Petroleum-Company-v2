
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Loader2, Save, ArrowLeft, Trash2, FileSpreadsheet, FileText, Calendar, RotateCcw, RotateCw } from 'lucide-react';
import { exportCashbookEntryToExcel, exportCashbookEntryToPDF } from '../utils/exportHelper';
import { formatDate, parseDateFromInput, formatCurrency } from '../utils/helpers';
import FormActionButtons from './FormActionButtons';

interface CashbookRow {
  id: string;
  particulars: string;
  amount: string;
}

interface HistoryItem {
  income: CashbookRow[];
  expense: CashbookRow[];
}

interface CashbookSheetProps {
  initialData?: any;
  existingEntries?: any[];
  prevBalance?: number;
  prevDate?: string;
  onSave: (data: any) => void;
  onCancel: () => void;
}

const CashbookSheet: React.FC<CashbookSheetProps> = ({ initialData, existingEntries = [], prevBalance = 0, prevDate = 'Initial', onSave, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [reportDate, setReportDate] = useState(''); 
  const [displayDate, setDisplayDate] = useState(''); 
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingDateText, setOpeningDateText] = useState('');
  
  const createEmptyRow = () => ({ id: Math.random().toString(36).substr(2, 9), particulars: '', amount: '' });

  const [incomeRows, setIncomeRows] = useState<CashbookRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<CashbookRow[]>([]);

  // History State for Undo/Redo
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isNavigatingHistory = useRef(false);

  const saveToHistory = useCallback((inc: CashbookRow[], exp: CashbookRow[]) => {
    if (isNavigatingHistory.current) return;

    const newSnapshot: HistoryItem = {
      income: JSON.parse(JSON.stringify(inc)),
      expense: JSON.parse(JSON.stringify(exp))
    };

    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      if (sliced.length > 0) {
        const last = sliced[sliced.length - 1];
        if (JSON.stringify(last) === JSON.stringify(newSnapshot)) return sliced;
      }
      return [...sliced, newSnapshot].slice(-50);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  useEffect(() => {
    if (initialData) {
      const isoDate = initialData.date || '';
      setReportDate(isoDate);
      setDisplayDate(formatDate(isoDate));
      
      const raw = initialData.raw_data || {};
      const inc = Array.isArray(raw.incomeRows) ? [...raw.incomeRows] : [];
      const exp = Array.isArray(raw.expenseRows) ? [...raw.expenseRows] : [];
      
      while (inc.length < 15) inc.push(createEmptyRow());
      while (exp.length < 15) exp.push(createEmptyRow());
      
      setIncomeRows(inc);
      setExpenseRows(exp);
      setOpeningBalance(Number(raw.openingBalance) || 0);
      setOpeningDateText(raw.prevDate || 'Initial');

      setHistory([{ income: inc, expense: exp }]);
      setHistoryIndex(0);
    } else {
      const todayIso = new Date().toISOString().split('T')[0];
      setReportDate(todayIso);
      setDisplayDate(formatDate(todayIso));
      const inc = Array(15).fill(null).map(createEmptyRow);
      const exp = Array(15).fill(null).map(createEmptyRow);
      setIncomeRows(inc);
      setExpenseRows(exp);
      setOpeningBalance(prevBalance);
      setOpeningDateText(prevDate);

      setHistory([{ income: inc, expense: exp }]);
      setHistoryIndex(0);
    }
  }, [initialData, prevBalance, prevDate]);

  const calculateTotal = (rows: CashbookRow[]) => {
    return rows.reduce((acc, row) => acc + (parseFloat(row.amount) || 0), 0);
  };

  const incomeTotal = calculateTotal(incomeRows);
  const expenseTotal = calculateTotal(expenseRows);
  const closingBalance = openingBalance + incomeTotal - expenseTotal;

  // Auto focus & select first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstInput = document.querySelector<HTMLInputElement>('input:not([disabled])');
      if (firstInput) {
        firstInput.focus();
        if (typeof firstInput.select === 'function' && !['date', 'checkbox', 'radio'].includes(firstInput.type)) {
          firstInput.select();
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const executeSave = () => {
    if (loading) return;
    setLoading(true);
    onSave({ 
      id: initialData?.id, 
      date: reportDate, 
      openingBalance, 
      prevDate: openingDateText,
      incomeTotal, 
      expenseTotal, 
      balance: closingBalance, 
      incomeRows, 
      expenseRows 
    });
  };

  // Keyboard shortcuts (Ctrl+S, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        executeSave();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [initialData, reportDate, openingBalance, openingDateText, incomeTotal, expenseTotal, closingBalance, incomeRows, expenseRows, onSave, onCancel, loading]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [history, historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      isNavigatingHistory.current = true;
      const prevState = history[historyIndex - 1];
      setIncomeRows(JSON.parse(JSON.stringify(prevState.income)));
      setExpenseRows(JSON.parse(JSON.stringify(prevState.expense)));
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => { isNavigatingHistory.current = false; }, 10);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      isNavigatingHistory.current = true;
      const nextState = history[historyIndex + 1];
      setIncomeRows(JSON.parse(JSON.stringify(nextState.income)));
      setExpenseRows(JSON.parse(JSON.stringify(nextState.expense)));
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => { isNavigatingHistory.current = false; }, 10);
    }
  };

  const handleDateBlur = () => {
    const iso = parseDateFromInput(displayDate);
    if (iso) {
      setReportDate(iso);
      setDisplayDate(formatDate(iso));
    } else {
      setDisplayDate(formatDate(reportDate));
    }
  };

  const handleInputChange = (type: 'income' | 'expense', index: number, field: keyof CashbookRow, value: string) => {
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;
    const rows = type === 'income' ? [...incomeRows] : [...expenseRows];
    rows[index] = { ...rows[index], [field]: value };
    setter(rows);
  };

  const handleBlur = () => {
    saveToHistory(incomeRows, expenseRows);
  };

  const removeRow = (type: 'income' | 'expense', index: number) => {
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;
    const rows = type === 'income' ? [...incomeRows] : [...expenseRows];
    if (rows.length > 15) {
      rows.splice(index, 1);
    } else {
      rows[index] = createEmptyRow();
    }
    setter(rows);
    saveToHistory(type === 'income' ? rows : incomeRows, type === 'expense' ? rows : expenseRows);
  };

  const handleKeyDown = (type: 'income' | 'expense', index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const rows = type === 'income' ? incomeRows : expenseRows;
    const setter = type === 'income' ? setIncomeRows : setExpenseRows;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === rows.length - 1) {
        const newRows = [...rows, createEmptyRow()];
        setter(newRows);
        saveToHistory(type === 'income' ? newRows : incomeRows, type === 'expense' ? newRows : expenseRows);
      } else {
        const nextInput = (e.currentTarget.closest('tr')?.nextElementSibling?.querySelector('input')) as HTMLInputElement;
        nextInput?.focus();
      }
    }

    if (e.key === 'Delete' && e.currentTarget.value === '') {
      e.preventDefault();
      removeRow(type, index);
    }
  };

  const handleExportXLSX = () => {
    const companyName = localStorage.getItem('activeCompanyName') || 'Workspace';
    const cleanIncome = incomeRows.filter(r => r.particulars.trim() !== '' && r.amount !== '');
    const cleanExpense = expenseRows.filter(r => r.particulars.trim() !== '' && r.amount !== '');
    exportCashbookEntryToExcel(cleanIncome, cleanExpense, { companyName, date: reportDate, openingBalance, openingDateText });
  };

  const handleExportPDF = () => {
    const companyName = localStorage.getItem('activeCompanyName') || 'Workspace';
    const cleanIncome = incomeRows.filter(r => r.particulars.trim() !== '' && r.amount !== '');
    const cleanExpense = expenseRows.filter(r => r.particulars.trim() !== '' && r.amount !== '');
    exportCashbookEntryToPDF(cleanIncome, cleanExpense, { companyName, date: reportDate, openingBalance, openingDateText });
  };

  return (
    <div className="bg-white dark:bg-slate-900 w-full border border-slate-300 dark:border-slate-800 rounded-md flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
      {/* Utility Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 sm:py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 gap-4">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <button onClick={onCancel} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight truncate max-w-[150px] sm:max-w-none">
              {localStorage.getItem('activeCompanyName') || 'Workspace'}
            </h2>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
              Daily Cash Statement - {displayDate}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-none uppercase cursor-pointer">
            <FileText className="w-3.5 h-3.5 text-rose-500" /> <span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={handleExportXLSX} className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-none uppercase cursor-pointer">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> <span className="hidden sm:inline">Excel</span>
          </button>
          <button 
            onClick={executeSave}
            disabled={loading}
            className="bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark transition-none flex items-center gap-1.5 ml-2 uppercase shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{initialData ? 'Update Entry' : 'Save Statement'}</span>
            <span className="sm:hidden">{initialData ? 'Update' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-950 flex flex-col space-y-4 custom-scrollbar">
        <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-4 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Stmt Date:</label>
                <input 
                  type="text" 
                  value={displayDate}
                  onChange={(e) => setDisplayDate(e.target.value)}
                  onBlur={handleDateBlur}
                  className="border-b border-slate-200 dark:border-slate-700 outline-none text-[13px] w-28 font-mono bg-transparent dark:text-white font-bold"
                />
              </div>
              <div className="flex items-center space-x-1">
                <button onClick={handleUndo} disabled={historyIndex <= 0} className={`p-1 ${historyIndex <= 0 ? 'opacity-20' : 'opacity-100 text-slate-400'}`}><RotateCcw className="w-4 h-4"/></button>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`p-1 ${historyIndex >= history.length - 1 ? 'opacity-20' : 'opacity-100 text-slate-400'}`}><RotateCw className="w-4 h-4"/></button>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] sm:text-[13px] font-bold text-slate-900 dark:text-white uppercase tracking-tight gap-1">
              <span>OPENING BALANCE FOR DATE {openingDateText}</span>
              <span className="font-mono text-[14px] sm:text-[16px]">{formatCurrency(openingBalance)}</span>
            </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 border border-slate-300 dark:border-slate-800 rounded overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex flex-col lg:grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-300 dark:divide-slate-800 flex-1 overflow-hidden">
            {/* Income Section */}
            <div className="flex flex-col overflow-hidden">
              <div className="bg-emerald-600 px-4 py-2 text-center text-white text-[12px] font-bold uppercase tracking-widest shrink-0">
                INCOME (INWARDS)
              </div>
              <div className="overflow-y-auto custom-scrollbar flex-1 overflow-x-auto">
                <table className="w-full text-[12px] border-collapse min-w-[300px]">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-20 border-b border-slate-200 dark:border-slate-700">
                    <tr className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                      <th className="w-10 sm:w-12 py-2 border-r border-slate-200 dark:border-slate-700 text-center">SR</th>
                      <th className="py-2 px-3 text-left">PARTICULARS</th>
                      <th className="w-24 sm:w-32 py-2 px-3 text-right border-l border-slate-200 dark:border-slate-700">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {incomeRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group">
                        <td className="py-1 border-r border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 text-center font-mono select-none relative">
                          <span className="group-hover:hidden">{idx + 1}</span>
                          <button type="button" onClick={() => removeRow('income', idx)} className="hidden group-hover:flex absolute inset-0 items-center justify-center text-rose-400 hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
                        </td>
                        <td className="py-0"><input type="text" value={row.particulars} onChange={(e) => handleInputChange('income', idx, 'particulars', e.target.value)} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown('income', idx, e)} className="w-full h-8 px-2 sm:px-3 outline-none bg-transparent font-medium text-slate-700 dark:text-slate-300 uppercase text-[10px] sm:text-[11px]" /></td>
                        <td className="py-0 border-l border-slate-200 dark:border-slate-700"><input type="text" value={row.amount} onChange={(e) => handleInputChange('income', idx, 'amount', e.target.value)} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown('income', idx, e)} placeholder="0.00" className="w-full h-8 px-2 sm:px-3 text-right outline-none bg-transparent font-mono font-bold text-slate-900 dark:text-white" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white dark:bg-slate-900 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr className="font-bold text-emerald-600">
                      <td colSpan={2} className="py-2 px-3 text-right text-[10px] sm:text-[11px] uppercase tracking-widest">TOTAL INWARD</td>
                      <td className="py-2 px-3 text-right font-mono text-[12px] sm:text-[14px]">{formatCurrency(incomeTotal, false)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Expense Section */}
            <div className="flex flex-col overflow-hidden">
              <div className="bg-rose-600 px-4 py-2 text-center text-white text-[12px] font-bold uppercase tracking-widest shrink-0">
                EXPENSE (OUTWARDS)
              </div>
              <div className="overflow-y-auto custom-scrollbar flex-1 overflow-x-auto">
                <table className="w-full text-[12px] border-collapse min-w-[300px]">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-20 border-b border-slate-200 dark:border-slate-700">
                    <tr className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                      <th className="w-10 sm:w-12 py-2 border-r border-slate-200 dark:border-slate-700 text-center">SR</th>
                      <th className="py-2 px-3 text-left">PARTICULARS</th>
                      <th className="w-24 sm:w-32 py-2 px-3 text-right border-l border-slate-200 dark:border-slate-700">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {expenseRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group">
                        <td className="py-1 border-r border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 text-center font-mono select-none relative">
                          <span className="group-hover:hidden">{idx + 1}</span>
                          <button type="button" onClick={() => removeRow('expense', idx)} className="hidden group-hover:flex absolute inset-0 items-center justify-center text-rose-400 hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
                        </td>
                        <td className="py-0"><input type="text" value={row.particulars} onChange={(e) => handleInputChange('expense', idx, 'particulars', e.target.value)} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown('expense', idx, e)} className="w-full h-8 px-2 sm:px-3 outline-none bg-transparent font-medium text-slate-700 dark:text-slate-300 uppercase text-[10px] sm:text-[11px]" /></td>
                        <td className="py-0 border-l border-slate-200 dark:border-slate-700"><input type="text" value={row.amount} onChange={(e) => handleInputChange('expense', idx, 'amount', e.target.value)} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown('expense', idx, e)} placeholder="0.00" className="w-full h-8 px-2 sm:px-3 text-right outline-none bg-transparent font-mono font-bold text-slate-900 dark:text-white" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white dark:bg-slate-900 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr className="font-bold text-rose-600">
                      <td colSpan={2} className="py-2 px-3 text-right text-[10px] sm:text-[11px] uppercase tracking-widest">TOTAL OUTWARD</td>
                      <td className="py-2 px-3 text-right font-mono text-[12px] sm:text-[14px]">{formatCurrency(expenseTotal, false)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom Summary Ledger */}
          <div className="bg-slate-100 dark:bg-slate-800 px-4 sm:px-8 py-4 shrink-0 grid grid-cols-1 gap-1 border-t-2 border-slate-300 dark:border-slate-700">
            <div className="flex justify-between text-[11px] sm:text-[13px] font-bold text-slate-700 dark:text-slate-300 uppercase">
              <span>Total Income</span>
              <span className="font-mono">{formatCurrency(incomeTotal)}</span>
            </div>
            <div className="flex justify-between text-[11px] sm:text-[13px] font-bold text-slate-700 dark:text-slate-300 uppercase">
              <span>Total Expense</span>
              <span className="font-mono">{formatCurrency(expenseTotal)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between text-[12px] sm:text-[15px] font-black text-slate-900 dark:text-white uppercase mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 gap-1">
              <span className="max-w-[150px] sm:max-w-none">CLOSING BALANCE FOR DATE {displayDate}</span>
              <span className="font-mono text-link">{formatCurrency(closingBalance)}</span>
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <FormActionButtons
              primaryText={initialData ? 'Update Entry' : 'Save Statement'}
              primaryType="button"
              primaryOnClick={executeSave}
              primaryDisabled={loading}
              primaryLoading={loading}

              secondaryLeftText="Export Excel"
              secondaryLeftType="button"
              secondaryLeftOnClick={handleExportXLSX}
              secondaryLeftDisabled={loading}

              secondaryRightText="Export PDF"
              secondaryRightType="button"
              secondaryRightOnClick={handleExportPDF}
              secondaryRightDisabled={loading}

              discardText="Discard"
              discardOnClick={onCancel}
              discardDisabled={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashbookSheet;
