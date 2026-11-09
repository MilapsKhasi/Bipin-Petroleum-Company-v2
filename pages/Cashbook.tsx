
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Loader2, Calendar, Trash2, Edit, Eye, RefreshCw, Landmark, FileDown, AlertCircle, Wallet } from 'lucide-react';
import { formatDate, formatCurrency } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import CashbookSheet from '../components/CashbookSheet';
import EmptyState from '../components/EmptyState';
import TableSkeleton from '../components/TableSkeleton';
import { exportToCSV } from '../utils/exportHelper';
import { useCompany } from '../context/CompanyContext';
import { toast } from '../utils/toast';

const Cashbook = () => {
  const { activeCompany, loading: companyLoading } = useCompany();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState<'list' | 'entry'>('list');
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    if (!activeCompany?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cashbooks')
        .select('*')
        .eq('company_id', activeCompany.id)
        .not('is_deleted', 'is', true)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setEntries(data || []);
    } catch (e: any) {
      console.error("Cashbook API Fetch Failed:", e.message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyLoading) return;
    loadData();
    const handleSettingsChange = () => loadData();
    window.addEventListener('appSettingsChanged', handleSettingsChange);
    return () => window.removeEventListener('appSettingsChanged', handleSettingsChange);
  }, [activeCompany?.id, companyLoading]);

  const stats = useMemo(() => {
    return entries.reduce((acc, entry) => ({
      income: acc.income + (Number(entry.income_total) || 0),
      expense: acc.expense + (Number(entry.expense_total) || 0),
      balance: acc.balance + (Number(entry.balance) || 0)
    }), { income: 0, expense: 0, balance: 0 });
  }, [entries]);

  // Context-aware Previous Data Calculation
  const prevData = useMemo(() => {
    if (entries.length === 0) return { balance: 0, date: 'Initial' };
    
    if (!editingEntry) {
      // Logic for New Entry: Link to the absolute latest record
      return { balance: Number(entries[0].balance) || 0, date: formatDate(entries[0].date) };
    } else {
      // Logic for Editing: Link to the record created just before this one
      const currentIndex = entries.findIndex(e => e.id === editingEntry.id);
      const preceding = entries[currentIndex + 1]; // sorted desc, so index+1 is older
      if (preceding) {
        return { balance: Number(preceding.balance) || 0, date: formatDate(preceding.date) };
      }
      return { balance: 0, date: 'Initial' };
    }
  }, [entries, editingEntry, viewState]);

  const handleExportCSV = async () => {
    if (!activeCompany?.id || entries.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Sr', 'Stmt Date', 'Income', 'Expense', 'Balance'];
      const rows = entries.map((e, i) => [
        i + 1,
        formatDate(e.date),
        (Number(e.income_total) || 0).toFixed(2),
        (Number(e.expense_total) || 0).toFixed(2),
        (Number(e.balance) || 0).toFixed(2)
      ]);
      const config = {
        companyName: activeCompany.name || 'Cashbook Report',
        gstin: activeCompany.gstin || 'N/A',
        email: '', phone: '', address: activeCompany.address || 'N/A',
        reportTitle: 'Cashbook Register',
        dateRange: 'Full History'
      };
      exportToCSV(headers, rows, config);
      toast.success("Cashbook exported to CSV successfully.");
    } catch (err) {
      toast.error("Export Failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveSheet = async (data: any) => {
    if (!data.date) {
      toast.warning("Please provide a date for the statement.");
      return;
    }
    setLoading(true);
    const cid = activeCompany?.id;
    if (!cid) return;
    
    const payload = { 
      company_id: cid, 
      date: data.date, 
      income_total: data.incomeTotal, 
      expense_total: data.expenseTotal, 
      balance: data.balance, 
      raw_data: data, 
      is_deleted: false
    };

    try {
      if (data.id) {
        await supabase.from('cashbooks').update(payload).eq('id', data.id);
      } else {
        await supabase.from('cashbooks').insert([{ ...payload, created_at: new Date().toISOString() }]);
      }
      toast.success("Cashbook statement saved successfully.");
      await loadData();
    } catch (e: any) {
      toast.error("Failed to save statement. Please try again.");
    } finally { 
      setLoading(false);
      setViewState('list'); 
      setEditingEntry(null); 
    }
  };

  const deleteEntry = async (id: string) => {
      if (!confirm("Permanently delete this?")) return;
      setLoading(true);
      try {
        await supabase.from('cashbooks').update({ is_deleted: true }).eq('id', id);
        toast.success("Statement deleted successfully.");
        await loadData();
      } catch (err: any) {
        toast.error("Failed to delete statement: " + (err.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
  };

  if (companyLoading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!activeCompany?.id) return (
      <div className="h-full flex flex-col items-center justify-center p-10 bg-white border border-slate-200 rounded-md">
        <AlertCircle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-xl font-medium text-slate-900 mb-2">Workspace Required</h2>
        <p className="text-slate-500 text-center max-w-md">Please select a workspace first.</p>
      </div>
  );

  if (viewState === 'entry') {
    return (
      <div className="h-full flex flex-col animate-in slide-in-from-right duration-300">
        <CashbookSheet 
          initialData={editingEntry} 
          existingEntries={entries}
          prevBalance={prevData.balance}
          prevDate={prevData.date}
          onSave={handleSaveSheet} 
          onCancel={() => { setViewState('list'); setEditingEntry(null); }} 
        />
      </div>
    );
  }

  const filteredEntries = entries.filter(e => String(e.date).includes(searchQuery));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">Cashbook Register</h1>
              <button onClick={loadData} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded transition-colors" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Daily cash in hand statements, income, expenses, and net balances</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
          <button 
            type="button"
            onClick={handleExportCSV}
            disabled={exporting || entries.length === 0}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[0.98] transition-all duration-150 font-medium flex items-center gap-1.5 disabled:opacity-50 text-slate-700 dark:text-slate-300 shadow-xs cursor-pointer"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <FileDown className="w-3.5 h-3.5 mr-1.5" />} <span>Export CSV</span>
          </button>
          <button 
            type="button"
            onClick={() => { setEditingEntry(null); setViewState('entry'); }} 
            className="bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> <span>Create Statement</span>
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : entries.length === 0 ? (
        <EmptyState 
          title="No Records" 
          message="No cashbook records found." 
          actionLabel="Create Statement" 
          onAction={() => { setEditingEntry(null); setViewState('entry'); }} 
        />
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[ 
                { label: 'Cumulative Inward', value: stats.income, color: 'text-emerald-600 dark:text-emerald-400' }, 
                { label: 'Cumulative Outward', value: stats.expense, color: 'text-rose-600 dark:text-rose-400' }, 
                { label: 'Net Cash In Hand', value: stats.balance, color: 'text-slate-900 dark:text-white' } 
                ].map((stat, i) => (
                <div key={i} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5 flex flex-col hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1 block">{stat.label}</span>
                    <span className={`text-[22px] font-bold font-mono ${stat.color}`}>
                        {formatCurrency(stat.value)}
                    </span>
                </div>
                ))}
            </div>

            <div className="space-y-4 pt-4">
                <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 w-4 h-4" />
                <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    placeholder="Search by date..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs outline-none focus:border-slate-300 dark:focus:border-slate-600 shadow-sm text-slate-900 dark:text-slate-100" 
                />
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-sm border-collapse min-w-[800px]">
                    <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        <th className="w-16 py-4 px-6 text-center border-r border-slate-100 dark:border-slate-800">Sr</th>
                        <th className="py-4 px-6 border-r border-slate-100 dark:border-slate-800">Statement Date</th>
                        <th className="text-right py-4 px-6 border-r border-slate-100 dark:border-slate-800">Income</th>
                        <th className="text-right py-4 px-6 border-r border-slate-100 dark:border-slate-800">Expense</th>
                        <th className="text-right py-4 px-6 border-r border-slate-100 dark:border-slate-800">Balance</th>
                        <th className="text-center py-4 px-6">Manage</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEntries.map((e, i) => (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-6 text-center border-r border-slate-100 dark:border-slate-800 font-mono text-slate-400 dark:text-slate-500">{i + 1}</td>
                        <td className="py-3 px-6 border-r border-slate-100 dark:border-slate-800">
                            <div className="flex items-center text-slate-700 dark:text-slate-300 font-bold">
                            <Calendar className="w-3.5 h-3.5 mr-2 text-slate-300 dark:text-slate-600" />
                            {formatDate(e.date)}
                            </div>
                        </td>
                        <td className="text-right py-3 px-6 border-r border-slate-100 dark:border-slate-800 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            {formatCurrency(e.income_total, false)}
                        </td>
                        <td className="text-right py-3 px-6 border-r border-slate-100 dark:border-slate-800 font-mono text-rose-600 dark:text-rose-400 font-bold">
                            {formatCurrency(e.expense_total, false)}
                        </td>
                        <td className="text-right py-3 px-6 border-r border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100 font-mono">
                            {formatCurrency(e.balance, false)}
                        </td>
                        <td className="text-center py-3 px-6">
                            <div className="flex items-center justify-center space-x-2">
                            <button onClick={() => { setEditingEntry(e); setViewState('entry'); }} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => { setEditingEntry(e); setViewState('entry'); }} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => deleteEntry(e.id)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default Cashbook;
