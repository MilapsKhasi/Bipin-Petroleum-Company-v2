
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, History, Trash2, Edit, Eye, Package, Maximize2, Minimize2, Plus, TrendingUp, TrendingDown, Layers, ArrowDownLeft, ArrowUpRight, ArrowLeft } from 'lucide-react';
import { getActiveCompanyId, formatDate, normalizeBill } from '../utils/helpers';
import Modal from '../components/Modal';
import StockForm from '../components/StockForm';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { toast } from '../utils/toast';

const Stock = () => {
  const location = useLocation();
  const cid = getActiveCompanyId();
  const [items, setItems] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.highlightedId || location.state?.selectedId || location.state?.searchKey || location.state?.selectedItem) {
      const sId = location.state.highlightedId || location.state.selectedId || location.state.selectedItem?.id;
      if (sId) {
        setSelectedId(String(sId));
        setHighlightedId(String(sId));
      }
      if (location.state.selectedItem?.name) {
        setSearchQuery(location.state.selectedItem.name);
      } else if (location.state.searchKey) {
        setSearchQuery(location.state.searchKey);
      }
    }
  }, [location.state]);

  // Ensure selected item is active once loaded
  useEffect(() => {
    if (!loading && items.length > 0 && (location.state?.highlightedId || location.state?.selectedId || location.state?.selectedItem?.id)) {
      const targetId = String(location.state.highlightedId || location.state.selectedId || location.state.selectedItem?.id);
      const found = items.find(i => String(i.id) === targetId);
      if (found) {
        setSelectedId(String(found.id));
        setHighlightedId(String(found.id));
      }
    }
  }, [loading, items, location.state]);
  
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; item: any | null }>({
    isOpen: false,
    item: null
  });

  const loadData = async () => {
    setLoading(true);
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      const { data: stockItems } = await supabase
        .from('stock_items')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('name', { ascending: true });
      
      const [{ data: purchaseData }, { data: saleData }] = await Promise.all([
        supabase.from('purchase_bills').select('*').eq('company_id', cid).eq('is_deleted', false),
        supabase.from('sales_invoices').select('*').eq('company_id', cid).eq('is_deleted', false)
      ]);
      
      const normalizedVouchers = [
        ...(purchaseData || []).map((b: any) => {
          const norm = normalizeBill(b);
          return norm ? { ...norm, type: 'Purchase' } : null;
        }).filter(Boolean),
        ...(saleData || []).map((s: any) => {
          const norm = normalizeBill(s);
          return norm ? { ...norm, type: 'Sale' } : null;
        }).filter(Boolean)
      ];

      setItems(stockItems || []);
      setVouchers(normalizedVouchers);
      
      if (stockItems && stockItems.length > 0 && !selectedId) {
        setSelectedId(String(stockItems[0].id));
      }
    } catch (err) {
      console.error("Stock load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('appSettingsChanged', loadData);
    window.addEventListener('stockUpdated', loadData);
    return () => {
      window.removeEventListener('appSettingsChanged', loadData);
      window.removeEventListener('stockUpdated', loadData);
    };
  }, [cid]);

  const handleSaveItem = async (itemData: any, isSaveAndNew?: boolean) => {
    const cid = getActiveCompanyId();
    let res;
    if (editingItem) {
      res = await supabase.from('stock_items').update({ ...itemData }).eq('id', editingItem.id);
      if (res.error && (res.error.message?.includes('selling_price') || res.error.code === 'PGRST204' || res.error.code === '42703')) {
        const { selling_price, ...cleanData } = itemData;
        res = await supabase.from('stock_items').update(cleanData).eq('id', editingItem.id);
      }
    } else {
      res = await supabase.from('stock_items').insert([{ ...itemData, company_id: cid }]);
      if (res.error && (res.error.message?.includes('selling_price') || res.error.code === 'PGRST204' || res.error.code === '42703')) {
        const { selling_price, ...cleanData } = itemData;
        res = await supabase.from('stock_items').insert([{ ...cleanData, company_id: cid }]);
      }
    }
    loadData();
    if (!isSaveAndNew) {
      setIsModalOpen(false);
      setEditingItem(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog.item) return;
    const itemName = deleteDialog.item.name;
    const { error } = await supabase.from('stock_items').update({ is_deleted: true }).eq('id', deleteDialog.item.id);
    if (!error) {
      toast.success(`Stock item "${itemName}" deleted`);
      loadData();
      if (selectedId === String(deleteDialog.item.id)) setSelectedId(null);
    } else {
      toast.error('Failed to delete item: ' + error.message);
    }
  };

  const selectedItem = items.find(i => String(i.id) === String(selectedId));

  const itemStats = useMemo(() => {
    if (!selectedItem) return null;
    const transactions: any[] = [];
    let inwardTotal = 0;
    let outwardTotal = 0;
    
    vouchers.forEach(v => {
      v.items?.forEach((it: any) => {
        if (it.itemName?.trim().toLowerCase() === selectedItem.name?.trim().toLowerCase()) {
          const isPurchase = v.type === 'Purchase';
          const qty = Number(it.qty || 0);
          transactions.push({ 
            date: v.date, 
            docNo: v.bill_number || v.invoice_number, 
            party: v.vendor_name || v.customer_name, 
            qty: qty, 
            type: v.type 
          });
          if (isPurchase) inwardTotal += qty;
          else outwardTotal += qty;
        }
      });
    });

    const stockBalance = (Number(selectedItem.in_stock) || 0) + inwardTotal - outwardTotal;

    return { 
      transactions: transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), 
      inwardTotal,
      outwardTotal,
      stockBalance
    };
  }, [selectedItem, vouchers]);

  const filteredItems = items.filter(i => i.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-300">
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null); }} title={editingItem ? "Edit Stock Master" : "Add New Stock Item"} maxWidth="max-w-5xl">
        <StockForm initialData={editingItem} onSubmit={handleSaveItem} onCancel={() => { setIsModalOpen(false); setEditingItem(null); }} />
      </Modal>
      <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, item: null })} onConfirm={confirmDelete} title="Delete Stock Item" message={`Are you sure you want to remove "${deleteDialog.item?.name}" from master?`} />
      
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">Inventory & Stock Control</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Track stock balances, inward purchases, outward sales, and SKU registers</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
          className="w-full sm:w-auto bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> <span>New SKU Item</span>
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
          <div className="w-full lg:w-80 flex flex-col space-y-3 shrink-0">
            <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="p-4 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900 space-y-2 animate-pulse">
                <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-6 space-y-6 hidden lg:flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-24" />
                </div>
              </div>
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-28" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
                  <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                </div>
              ))}
            </div>
            <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-36 mb-4" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState 
          title="Inventory is Empty" 
          message="Take control of your warehouse! Register your stock items (SKUs) to track movements, quantities, and valuation." 
          actionLabel="Add First Stock Item" 
          onAction={() => { setEditingItem(null); setIsModalOpen(true); }} 
        />
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
            {!isFullScreen && (
            <div className={`w-full lg:w-80 flex flex-col space-y-4 flex-1 lg:flex-none min-h-0 lg:shrink-0 ${selectedId ? 'hidden lg:flex' : 'flex'}`}>
                <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter items..." className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm text-slate-900 dark:text-slate-100 transition-all" />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar touch-pan-y">
                {filteredItems.map((item) => {
                    let inward = 0; let outward = 0;
                    vouchers.forEach(v => { v.items?.forEach((it: any) => {
                    if (it.itemName?.toLowerCase() === item.name?.toLowerCase()) {
                        if (v.type === 'Purchase') inward += Number(it.qty || 0);
                        else outward += Number(it.qty || 0);
                    }
                    });});
                    const currentBalance = (Number(item.in_stock) || 0) + inward - outward;
                    const isSelected = String(selectedId) === String(item.id);
                    const isHighlighted = String(item.id) === String(highlightedId);

                    return (
                    <div 
                      key={item.id} 
                      ref={(el) => {
                        if (el && (isHighlighted || isSelected)) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      }}
                      onClick={() => {
                        setSelectedId(String(item.id));
                        setHighlightedId(String(item.id));
                      }} 
                      className={`p-4 border rounded-[5px] cursor-pointer transition-all ${
                        isHighlighted
                          ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-500 ring-2 ring-amber-400 text-slate-900 dark:text-white font-semibold shadow-md'
                          : isSelected 
                            ? 'bg-primary border-transparent text-white' 
                            : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                        <h3 className={`font-medium capitalize text-[11px] truncate mb-1 ${isSelected && !isHighlighted ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{item.name}</h3>
                        <div className="flex justify-between items-end">
                            <span className={`text-[10px] font-medium capitalize tracking-tighter ${isSelected && !isHighlighted ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>Hsn: {item.hsn || 'N/A'}</span>
                            <span className={`font-mono text-lg font-bold leading-none ${isSelected && !isHighlighted ? 'text-white' : 'text-link dark:text-blue-400'}`}>
                                {currentBalance.toFixed(0)} <span className={`text-[10px] opacity-60 font-sans ${isSelected && !isHighlighted ? 'text-white' : ''}`}>{item.unit || 'PCS'}</span>
                            </span>
                        </div>
                    </div>
                    );
                })}
                </div>
            </div>
            )}

            <div className={`flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex flex-col overflow-hidden ${isFullScreen ? 'fixed inset-4 z-[500] m-0 shadow-2xl' : ''} ${!selectedId ? 'hidden lg:flex' : 'flex'}`}>
            {selectedItem && itemStats ? (
                <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
                <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
                    <div className="flex items-center space-x-3 sm:space-x-4 overflow-hidden">
                    <button onClick={() => setSelectedId(null)} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm shrink-0">
                        <Package className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div className="truncate">
                        <h2 className="text-base sm:text-xl font-medium text-slate-900 dark:text-white capitalize tracking-tight truncate">{selectedItem.name}</h2>
                        <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded capitalize">Hsn {selectedItem.hsn || 'N/A'}</span>
                        <span className="text-[9px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 px-2 py-0.5 rounded capitalize">Sku {selectedItem.sku || 'N/A'}</span>
                        </div>
                    </div>
                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <button 
                        onClick={() => { setEditingItem(selectedItem); setIsModalOpen(true); }} 
                        title="Edit Stock Master"
                        className="p-2.5 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-slate-900 dark:hover:text-white shadow-xs"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => document.getElementById('stock-movement-log')?.scrollIntoView({ behavior: 'smooth' })} 
                        title="View Stock Movement Statement"
                        className="p-2.5 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-slate-900 dark:hover:text-white shadow-xs"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setIsFullScreen(!isFullScreen)} 
                        title={isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
                        className="hidden sm:block p-2.5 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-slate-900 dark:hover:text-white shadow-xs"
                      >
                        {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => setDeleteDialog({ isOpen: true, item: selectedItem })} 
                        title="Delete Stock Item"
                        className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg shadow-xs"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                    <div className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest mb-1">Current Balance</p>
                        <p className="text-2xl sm:text-3xl font-bold font-mono text-link dark:text-blue-400">{itemStats.stockBalance.toFixed(0)} <span className="text-xs font-normal opacity-50">{selectedItem.unit}</span></p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest mb-1">Purchased (Inward)</p>
                        <div className="flex items-center text-emerald-600 dark:text-emerald-400">
                            <ArrowDownLeft className="w-4 h-4 mr-1" />
                            <p className="text-xl sm:text-2xl font-medium font-mono">{itemStats.inwardTotal.toFixed(0)}</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest mb-1">Sold (Outward)</p>
                        <div className="flex items-center text-rose-600 dark:text-rose-400">
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                            <p className="text-xl sm:text-2xl font-medium font-mono">{itemStats.outwardTotal.toFixed(0)}</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest mb-1">Purchase Rate</p>
                        <p className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-white font-mono">₹{selectedItem.rate || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
                        <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest mb-1">Selling Price</p>
                        <p className="text-xl sm:text-2xl font-medium text-slate-900 dark:text-white font-mono">₹{selectedItem.selling_price || 0}</p>
                    </div>
                    </div>

                    <div className="space-y-4" id="stock-movement-log">
                    <h4 className="text-[11px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest flex items-center">
                        <History className="w-4 h-4 mr-2 text-slate-300 dark:text-slate-600" /> Stock Movement Log
                    </h4>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
                        <table className="clean-table min-w-[600px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-medium text-slate-400 dark:text-slate-500 capitalize tracking-widest border-b border-slate-200 dark:border-slate-800">
                                <th className="font-medium capitalize">Date</th>
                                <th className="font-medium capitalize">Voucher #</th>
                                <th className="font-medium capitalize">Type</th>
                                <th className="font-medium capitalize">Party</th>
                                <th className="text-right font-medium capitalize">Quantity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {itemStats.transactions.map((t, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-none">
                                    <td className="text-slate-500 dark:text-slate-400 font-medium">{formatDate(t.date)}</td>
                                    <td className="font-mono font-medium text-slate-900 dark:text-slate-100">{t.docNo}</td>
                                    <td>
                                        <span className={`text-[9px] font-medium capitalize px-2 py-0.5 rounded-sm ${t.type === 'Sale' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td className="capitalize font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{t.party}</td>
                                    <td className={`text-right font-bold font-mono ${t.type === 'Purchase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {t.type === 'Purchase' ? '+' : '-'}{t.qty}
                                    </td>
                                </tr>
                            ))}
                            {itemStats.transactions.length === 0 && (
                                <tr><td colSpan={5} className="py-24 text-center text-slate-300 dark:text-slate-700 italic">No inventory activity registered for this SKU.</td></tr>
                            )}
                        </tbody>
                        </table>
                    </div>
                    </div>
                </div>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 italic py-20">
                    <Layers className="w-16 h-16 opacity-5 mb-4" />
                    <p className="text-sm font-medium">Select an item from the list to view analytics.</p>
                </div>
            )}
            </div>
        </div>
      )}
    </div>
  );
};

export default Stock;
