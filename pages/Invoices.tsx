
import React, { useState, useEffect } from 'react';
import { Search, Edit, Trash2, Loader2, Download, ReceiptText, Plus, Printer } from 'lucide-react';
import { formatCurrency, formatDate, getActiveCompanyId, normalizeBill } from '../utils/helpers';
import Modal from '../components/Modal';
import SalesInvoiceForm from '../components/SalesInvoiceForm';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabase';
import { InvoicePrintModal } from '../components/InvoicePrintModal';

const Invoices = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; invoice: any | null }>({
    isOpen: false,
    invoice: null
  });

  const loadData = async () => {
    setLoading(true);
    const cid = getActiveCompanyId();
    if (!cid) return;
    
    const { data } = await supabase
        .from('sales_invoices')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('date', { ascending: false });

    const mappedData = (data || []).map((item: any) => {
        const norm = normalizeBill(item);
        return norm ? { ...norm, type: 'Sale' } : null;
    }).filter(Boolean) as any[];

    setInvoices(mappedData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const confirmDelete = async () => {
    if (!deleteDialog.invoice) return;
    const { error } = await supabase.from('sales_invoices').update({ is_deleted: true }).eq('id', deleteDialog.invoice.id);
    if (!error) { loadData(); window.dispatchEvent(new Event('appSettingsChanged')); }
  };

  const filtered = invoices.filter(i => {
    return i.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) || i.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingInvoice ? "Edit Sales Invoice" : "Generate Sales Invoice"} maxWidth="max-w-5xl">
        <SalesInvoiceForm initialData={editingInvoice} onSubmit={(inv, shouldPrint) => { setIsModalOpen(false); loadData(); if (shouldPrint && inv) setPrintModalInvoice(inv); }} onCancel={() => setIsModalOpen(false)} />
      </Modal>

      <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, invoice: null })} onConfirm={confirmDelete} title="Archive Invoice" message={`Are you sure you want to move invoice ${deleteDialog.invoice?.invoice_number} to the trash?`} />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <ReceiptText className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 dark:text-slate-500" />
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Sales Invoice Register</h1>
        </div>
        <div className="flex items-center">
          <button onClick={() => { setEditingInvoice(null); setIsModalOpen(true); }} className="bg-primary text-white px-6 sm:px-8 py-3 rounded-lg font-bold text-sm border border-primary hover:bg-primary-dark shadow-md transition-all active:scale-95 flex items-center justify-center w-full sm:w-auto">
            <Plus className="w-4 h-4 sm:w-4.5 sm:h-4.5 mr-2" /> Generate Sales Invoice
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="relative">
          <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 w-4 h-4 sm:w-5 sm:h-5" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by Invoice Number or Customer Name..." className="w-full pl-12 sm:pl-14 pr-4 sm:pr-6 py-3 sm:py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm sm:text-base outline-none focus:border-slate-400 dark:focus:border-slate-600 shadow-sm transition-all text-slate-900 dark:text-slate-100" />
        </div>
        
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900 overflow-x-auto">
          {loading ? (
            <div className="py-40 flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary mb-4" /><p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-[10px]">Loading Register...</p></div>
          ) : (
            <table className="w-full text-left text-base border-collapse min-w-[800px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-5 px-8 border-r border-slate-200 dark:border-slate-800">Invoice Date</th>
                  <th className="py-5 px-8 border-r border-slate-200 dark:border-slate-800">Invoice No</th>
                  <th className="py-5 px-8 border-r border-slate-200 dark:border-slate-800">Customer / Party Name</th>
                  <th className="py-5 px-8 border-r border-slate-200 dark:border-slate-800 text-right">Net Receivable</th>
                  <th className="py-5 px-8 text-center">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-all duration-200">
                    <td className="py-5 px-8 border-r border-slate-100 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-400">{formatDate(inv.date)}</td>
                    <td className="py-5 px-8 border-r border-slate-100 dark:border-slate-800 font-mono font-bold text-slate-900 dark:text-slate-100">{inv.invoice_number}</td>
                    <td className="py-5 px-8 border-r border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100 truncate max-w-[300px]">{inv.customer_name}</td>
                    <td className="py-5 px-8 border-r border-slate-100 dark:border-slate-800 text-right font-bold text-slate-900 dark:text-slate-100 text-lg">{formatCurrency(inv.grand_total)}</td>
                    <td className="py-5 px-8 text-center">
                      <div className="flex justify-center space-x-3 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setPrintModalInvoice(inv)} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Print Invoice"><Printer className="w-5 h-5" /></button>
                          <button onClick={() => { setEditingInvoice(inv); setIsModalOpen(true); }} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all" title="Edit Invoice"><Edit className="w-5 h-5" /></button>
                          <button onClick={() => setDeleteDialog({ isOpen: true, invoice: inv })} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Delete Invoice"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="py-40 text-center"><ReceiptText className="w-16 h-16 text-slate-100 dark:text-slate-800 mx-auto mb-4" /><p className="text-slate-300 dark:text-slate-700 italic font-medium">No sales invoices found.</p></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <InvoicePrintModal 
        isOpen={!!printModalInvoice} 
        onClose={() => setPrintModalInvoice(null)} 
        invoice={printModalInvoice} 
      />
    </div>
  );
};

export default Invoices;
