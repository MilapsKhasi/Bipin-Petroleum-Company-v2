
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Loader2, Edit, Trash2, Plus, Printer, TrendingUp } from 'lucide-react';
import { formatDate, formatCurrency, getActiveCompanyId, normalizeBill, unsyncTransactionFromCashbook } from '../utils/helpers';
import Modal from '../components/Modal';
import SalesInvoiceForm from '../components/SalesInvoiceForm';
import ConfirmDialog from '../components/ConfirmDialog';
import DateFilter, { DateFilterHandle } from '../components/DateFilter';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { InvoicePrintModal } from '../components/InvoicePrintModal';
import { useKeyboardShortcuts } from '../utils/shortcutManager';
import TableSkeleton from '../components/TableSkeleton';
import { toast } from '../utils/toast';

const Sales = () => {
  const location = useLocation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<any | null>(null);
  const [printPureMode, setPrintPureMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ startDate: string | null, endDate: string | null }>({ startDate: null, endDate: null });

  useEffect(() => {
    if (location.state?.highlightedId || location.state?.searchKey || location.state?.selectedItem) {
      const targetId = location.state.highlightedId || location.state.selectedItem?.id;
      const targetNo = location.state.selectedItem?.invoice_number || location.state.selectedItem?.bill_number;
      if (targetNo) {
        setSearchQuery(targetNo);
      } else if (location.state.searchKey) {
        setSearchQuery(location.state.searchKey);
      }
      if (targetId) {
        setHighlightedId(targetId);
      }
    }
  }, [location.state]);

  // Automatically open the target invoice modal when loaded
  useEffect(() => {
    if (!loading && invoices.length > 0 && (location.state?.highlightedId || location.state?.selectedItem?.id)) {
      const targetId = location.state.highlightedId || location.state.selectedItem?.id;
      const found = invoices.find(inv => inv.id === targetId);
      if (found) {
        setEditingInvoice(found);
        setIsModalOpen(true);
      } else if (location.state.selectedItem) {
        setEditingInvoice(normalizeBill(location.state.selectedItem));
        setIsModalOpen(true);
      }
    }
  }, [loading, invoices, location.state]);
  
  const [headerFocusIdx, setHeaderFocusIdx] = useState<number | null>(null); 
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [lastShiftNTime, setLastShiftNTime] = useState<number>(0);

  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; invoice: any | null }>({
    isOpen: false,
    invoice: null
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dateFilterRef = useRef<DateFilterHandle>(null);
  const newSaleBtnRef = useRef<HTMLButtonElement>(null);

  const loadData = async () => {
    setLoading(true);
    const cid = getActiveCompanyId();
    if (!cid) return;
    
    try {
      let query = supabase.from('sales_invoices')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      if (dateRange.startDate && dateRange.endDate) {
        query = query.gte('date', dateRange.startDate).lte('date', dateRange.endDate);
      }
      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      
      const normalizedData = (data || []).map(normalizeBill).filter((b: any) => b && !b.items_raw?.is_payment_voucher);
      setInvoices(normalizedData);
    } catch (err: any) {
      console.error("Error loading sales:", err.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleRefresh = () => loadData();
    window.addEventListener('appSettingsChanged', handleRefresh);
    return () => window.removeEventListener('appSettingsChanged', handleRefresh);
  }, [dateRange]);

  const filtered = invoices.filter(i => {
    const search = searchQuery.toLowerCase();
    return i.invoice_number?.toLowerCase().includes(search) || i.customer_name?.toLowerCase().includes(search);
  });

  useEffect(() => {
    if (headerFocusIdx === 0) dateFilterRef.current?.focusYear();
    if (headerFocusIdx === 1) dateFilterRef.current?.focusMonth();
    if (headerFocusIdx === 2) newSaleBtnRef.current?.focus();
  }, [headerFocusIdx]);

  const confirmDelete = async () => {
    if (!deleteDialog.invoice) return;
    const { error } = await supabase.from('sales_invoices').update({ is_deleted: true }).eq('id', deleteDialog.invoice.id);
    if (!error) {
        await unsyncTransactionFromCashbook(deleteDialog.invoice);
        toast.success(`Invoice #${deleteDialog.invoice.bill_number || ''} deleted`);
        loadData();
        window.dispatchEvent(new Event('appSettingsChanged'));
    } else {
        toast.error('Failed to delete invoice');
    }
    setDeleteDialog({ isOpen: false, invoice: null });
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteDialog.isOpen) {
          e.preventDefault();
          setDeleteDialog({ isOpen: false, invoice: null });
        } else if (isModalOpen) {
          e.preventDefault();
          setIsModalOpen(false);
          setEditingInvoice(null);
        } else if (selectedRowIdx !== null) {
          setSelectedRowIdx(null);
        }
        return;
      }

      const activeEl = document.activeElement;
      const isFocusedInInput = (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT') && activeEl !== searchInputRef.current;
      if (isFocusedInInput || isModalOpen) return;

      if (selectedRowIdx !== null) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedRowIdx(prev => (prev === null ? 0 : Math.min(prev + 1, filtered.length - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedRowIdx(prev => (prev === null ? 0 : Math.max(prev - 1, 0)));
        }
      }

      if (e.shiftKey) {
        if (e.key === 'N' || e.key === 'n') {
          setLastShiftNTime(Date.now());
        }
        if ((e.key === 'S' || e.key === 's') && (Date.now() - lastShiftNTime < 1000)) {
          e.preventDefault();
          setEditingInvoice(null);
          setIsModalOpen(true);
          setLastShiftNTime(0);
          return;
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setHeaderFocusIdx(prev => (prev === null ? 0 : (prev + 1) % 3));
          setSelectedRowIdx(null);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setHeaderFocusIdx(prev => (prev === null ? 2 : (prev - 1 + 3) % 3));
          setSelectedRowIdx(null);
        } 
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeEl !== searchInputRef.current) {
            searchInputRef.current?.focus();
            setSelectedRowIdx(null);
            setHeaderFocusIdx(null);
          } else {
            if (filtered.length > 0) {
              setSelectedRowIdx(0);
              searchInputRef.current?.blur();
            }
          }
        } 
        else if (e.key === 'E' || e.key === 'e') {
          if (selectedRowIdx !== null && filtered[selectedRowIdx]) {
            e.preventDefault();
            setEditingInvoice(filtered[selectedRowIdx]);
            setIsModalOpen(true);
          }
        } 
        else if (e.key === 'D' || e.key === 'd') {
          if (selectedRowIdx !== null && filtered[selectedRowIdx]) {
            e.preventDefault();
            const inv = filtered[selectedRowIdx];
            if (!deleteDialog.isOpen) {
              setDeleteDialog({ isOpen: true, invoice: inv });
            } else {
              confirmDelete();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [filtered, selectedRowIdx, deleteDialog, headerFocusIdx, isModalOpen, lastShiftNTime]);

  useKeyboardShortcuts({
    onPrint: () => {
      if (!isModalOpen && !printModalInvoice) {
        if (selectedRowIdx !== null && filtered[selectedRowIdx]) {
          setPrintModalInvoice(filtered[selectedRowIdx]);
        } else if (filtered.length > 0) {
          setPrintModalInvoice(filtered[0]);
        }
      }
    },
    priority: 15
  }, [filtered, selectedRowIdx, isModalOpen, printModalInvoice]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingInvoice(null); }} title={editingInvoice ? "Update Sale Invoice" : "Generate Sale Invoice"} maxWidth="max-w-5xl">
        <SalesInvoiceForm 
          initialData={editingInvoice} 
          onSubmit={(inv, shouldPrint, isSaveAndNew) => { 
            if (!isSaveAndNew) { setIsModalOpen(false); setEditingInvoice(null); } 
            loadData(); 
            if (shouldPrint && inv) {
              setPrintPureMode(true);
              setPrintModalInvoice(inv);
            }
          }} 
          onCancel={() => { setIsModalOpen(false); setEditingInvoice(null); }} 
        />
      </Modal>

      <ConfirmDialog 
        isOpen={deleteDialog.isOpen} 
        onClose={() => setDeleteDialog({ isOpen: false, invoice: null })} 
        onConfirm={confirmDelete} 
        title="Delete Invoice" 
        message={`Permanently archive sale invoice ${deleteDialog.invoice?.invoice_number}? (Press Shift + D again to confirm, or Esc to cancel)`} 
      />

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">Sales Ledger</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Generate sales invoices, track revenue, and manage customer accounts</p>
          </div>
        </div>
        <button
          ref={newSaleBtnRef}
          onClick={() => { setEditingInvoice(null); setIsModalOpen(true); }}
          className="w-full sm:w-auto bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> <span>New Sale</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs shrink-0">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice or customer..." 
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <DateFilter ref={dateFilterRef} onFilterChange={setDateRange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Revenue</p>
              <p className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {formatCurrency(filtered.reduce((acc, i) => acc + Number(i.grand_total || 0), 0))}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : invoices.length === 0 ? (
          <EmptyState 
            title="No Sales Invoices" 
            message="Start generating revenue records by creating your first sales invoice. Track payments and customer history efficiently!" 
            actionLabel="Generate New Sale" 
            onAction={() => { setEditingInvoice(null); setIsModalOpen(true); }} 
          />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
            <Search className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No matching invoices found</p>
            <p className="text-xs text-slate-400 mb-4">No results match your search query &quot;{searchQuery}&quot;</p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-3.5 px-4 w-12">Sr</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Invoice #</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4 text-right">Taxable</th>
                  <th className="py-3.5 px-4 text-right">GST</th>
                  <th className="py-3.5 px-4 text-right">Net Total</th>
                  <th className="py-3.5 px-4 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12px] text-slate-700 dark:text-slate-300">
                {filtered.map((inv, i) => {
                  const isHighlighted = inv.id === highlightedId;
                  return (
                    <tr 
                      key={inv.id} 
                      ref={(el) => {
                        if (el && isHighlighted) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className={`transition-colors duration-150 cursor-pointer ${
                        isHighlighted
                          ? 'bg-amber-100/90 dark:bg-amber-950/60 border-l-4 border-amber-500 ring-2 ring-amber-400/60 shadow-md font-semibold'
                          : selectedRowIdx === i 
                            ? 'bg-slate-100/80 dark:bg-slate-800 border-l-4 border-primary font-medium' 
                            : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/60'
                      }`}
                      onClick={() => { setSelectedRowIdx(i); setHighlightedId(inv.id); }}
                    >
                      <td className="py-3 px-4 text-slate-400 font-mono tabular-nums">{i + 1}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{formatDate(inv.date)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">{inv.bill_number}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white capitalize">{inv.vendor_name}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(inv.total_without_gst)}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">{formatCurrency(inv.total_gst)}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">{formatCurrency(inv.grand_total)}</td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1">
                          <button onClick={() => { setPrintPureMode(false); setPrintModalInvoice(inv); }} className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors" title="Print Invoice">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setEditingInvoice(inv); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-primary rounded transition-colors" title="Edit Invoice">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteDialog({ isOpen: true, invoice: inv })} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors" title="Delete Invoice">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvoicePrintModal 
        isOpen={!!printModalInvoice} 
        onClose={() => setPrintModalInvoice(null)} 
        invoice={printModalInvoice} 
        purePrintMode={printPureMode}
      />
    </div>
  );
};

export default Sales;
