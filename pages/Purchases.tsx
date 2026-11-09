import React, { useState, useEffect } from 'react';
import { Search, Edit, Trash2, Filter, ChevronDown, Loader2, ShoppingBag, Plus } from 'lucide-react';
import { formatCurrency, formatDate, getActiveCompanyId, normalizeBill } from '../utils/helpers';
import Modal from '../components/Modal';
import BillForm from '../components/BillForm';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabase';
import { toast } from '../utils/toast';

const Purchases = () => {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; bill: any | null }>({
    isOpen: false,
    bill: null
  });

  const loadData = async () => {
    setLoading(true);
    const cid = getActiveCompanyId();
    if (!cid) return;

    try {
      const { data, error } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('date', { ascending: false });

      if (error) throw error;

      const normalized = (data || []).map((b: any) => normalizeBill(b)).filter(Boolean);
      const paymentVouchers = normalized.filter((b: any) => b?.items_raw?.is_payment_voucher === true);
      const actualBills = normalized.filter((b: any) => b && !b.items_raw?.is_payment_voucher);

      const computedBills = actualBills.map((bill: any) => {
        const linkedVouchers = paymentVouchers.filter((v: any) => v.items_raw?.linked_bills?.includes(bill.id));
        const totalPaidOnBill = linkedVouchers.reduce((sum: number, v: any) => {
          const pDetails = v.items_raw?.payment_details;
          const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
          const amt = pArray.reduce((sumVal: number, p: any) => sumVal + (Number(p.payment_amount) || 0), 0);
          return sum + amt;
        }, 0);
        const outstanding = Math.max(0, Number(bill.grand_total || 0) - totalPaidOnBill);
        const status = (outstanding === 0 && Number(bill.grand_total || 0) > 0) ? 'Paid' : 'Pending';
        return { ...bill, outstanding, status, type: 'Purchase' };
      });

      setBills(computedBills);
    } catch (err: any) {
      console.error("Error loading purchases:", err.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('appSettingsChanged', loadData);
    return () => window.removeEventListener('appSettingsChanged', loadData);
  }, []);

  const confirmDelete = async () => {
    if (!deleteDialog.bill) return;
    try {
      const { error } = await supabase.from('purchase_bills').update({ is_deleted: true }).eq('id', deleteDialog.bill.id);
      if (error) {
        toast.error('Error deleting: ' + error.message);
      } else {
        toast.success('Bill deleted successfully.');
        loadData();
      }
    } catch (err: any) {
      toast.error('Error deleting: ' + (err.message || 'Unknown error'));
    }
  };

  const filtered = bills.filter(b => {
    const matchesStatus = statusFilter === 'All' ? true : b.status === statusFilter;
    const matchesSearch = b.bill_number?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Edit Purchase Bill" maxWidth="max-w-5xl">
        <BillForm initialData={editingBill} onSubmit={(bill, isSaveAndNew) => { if (!isSaveAndNew) { setIsModalOpen(false); setEditingBill(null); } loadData(); }} onCancel={() => setIsModalOpen(false)} />
      </Modal>

      <ConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, bill: null })}
        onConfirm={confirmDelete}
        title="Archive Entry"
        message={`Delete purchase entry ${deleteDialog.bill?.bill_number}?`}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">Purchase Register</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Manage and track all vendor purchase invoices and bills</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingBill(null); setIsModalOpen(true); }}
          className="w-full sm:w-auto bg-primary text-white px-5 py-2.5 rounded-md font-medium text-sm hover:bg-primary-dark flex items-center justify-center shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" /> New Purchase
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs shrink-0">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bill or vendor..." 
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Status: {statusFilter}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {isMenuOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1 min-w-[130px]">
                {['All', 'Paid', 'Pending'].map(opt => (
                  <button 
                    key={opt} 
                    onClick={() => { setStatusFilter(opt); setIsMenuOpen(false); }} 
                    className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 ${statusFilter === opt ? 'bg-primary/10 text-primary font-bold' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Gross Purchase</p>
              <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatCurrency(filtered.reduce((acc, b) => acc + Number(b.grand_total || 0), 0))}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Bill No</th>
                  <th className="py-3.5 px-4">Vendor Name</th>
                  <th className="py-3.5 px-4 text-right">Taxable</th>
                  <th className="py-3.5 px-4 text-right">Grand Total</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12px] text-slate-700 dark:text-slate-300">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all">
                    <td className="py-3 px-4 font-mono">{formatDate(b.date)}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white">{b.bill_number}</td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white capitalize">{b.vendor_name}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">{formatCurrency(b.total_without_gst)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(b.grand_total)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${b.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button onClick={() => { setEditingBill(b); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-primary rounded transition-colors" title="Edit Bill"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteDialog({ isOpen: true, bill: b })} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors" title="Delete Bill"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-16 text-center text-slate-400 italic">No purchase entries found matching filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Purchases;