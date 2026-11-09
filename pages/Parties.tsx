import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getActiveCompanyId, normalizeBill } from '../utils/helpers';
import { 
  Plus, Search, Landmark, ArrowLeft, Maximize2, Minimize2, 
  Trash2, Edit, Eye, FileText, User, Filter, AlertCircle, Phone, 
  Mail, MapPin
} from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import PartyForm from '../components/PartyForm';
import LedgerModal from '../components/LedgerModal';
import EmptyState from '../components/EmptyState';
import { toast } from '../utils/toast';

const Parties = () => {
  const location = useLocation();
  const cid = getActiveCompanyId();
  const [loading, setLoading] = useState(true);
  const [parties, setParties] = useState<any[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<any[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<any[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.highlightedId || location.state?.selectedId || location.state?.searchKey || location.state?.selectedItem) {
      const pId = location.state.highlightedId || location.state.selectedId || location.state.selectedItem?.id;
      if (pId) {
        setSelectedPartyId(String(pId));
        setHighlightedId(String(pId));
      }
      if (location.state.selectedItem?.name) {
        setSearchQuery(location.state.selectedItem.name);
      } else if (location.state.searchKey) {
        setSearchQuery(location.state.searchKey);
      }
    }
  }, [location.state]);

  // Ensure selected party is active once loaded
  useEffect(() => {
    if (!loading && parties.length > 0 && (location.state?.highlightedId || location.state?.selectedId || location.state?.selectedItem?.id)) {
      const targetId = String(location.state.highlightedId || location.state.selectedId || location.state.selectedItem?.id);
      const found = parties.find(p => String(p.id) === targetId);
      if (found) {
        setSelectedPartyId(String(found.id));
        setHighlightedId(String(found.id));
      }
    }
  }, [loading, parties, location.state]);
  
  // Filters: 'all' | 'debtor' | 'creditor'
  const [filterType, setFilterType] = useState<'all' | 'debtor' | 'creditor'>('all');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; party: any | null }>({
    isOpen: false,
    party: null
  });

  const loadData = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      // 1. Load unified parties (from vendors table where is_deleted = false)
      const { data: partyData } = await supabase
        .from('vendors')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('name');

      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('name');

      const partyMap = new Map();
      (custData || []).forEach((c: any) => {
        const key = c.name ? c.name.trim().toUpperCase() : c.id;
        partyMap.set(key, { ...c, party_type: c.party_type || 'customer', is_customer: true });
      });
      (partyData || []).forEach((v: any) => {
        const key = v.name ? v.name.trim().toUpperCase() : v.id;
        partyMap.set(key, v);
      });

      setParties(Array.from(partyMap.values()));

      // 2. Load Sales Invoices
      const { data: salesData } = await supabase
        .from('sales_invoices')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);
      
      setSalesInvoices(salesData || []);

      // 3. Load Purchase Bills
      const { data: purchaseData } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      setPurchaseBills(purchaseData || []);

    } catch (err) {
      console.error('Error loading parties data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('appSettingsChanged', loadData);
    window.addEventListener('partiesUpdated', loadData);
    return () => {
      window.removeEventListener('appSettingsChanged', loadData);
      window.removeEventListener('partiesUpdated', loadData);
    };
  }, [cid]);

  // Handle saving party
  const handleSaveParty = () => {
    setIsFormOpen(false);
    setEditingParty(null);
    loadData();
    window.dispatchEvent(new Event('appSettingsChanged'));
  };

  // Handle deleting party
  const handleDeleteParty = (party: any) => {
    setDeleteDialog({ isOpen: true, party });
  };

  const confirmDeleteParty = async () => {
    if (!deleteDialog.party) return;
    try {
      const { error } = await supabase
        .from('vendors')
        .update({ is_deleted: true })
        .eq('id', deleteDialog.party.id);

      if (error) throw error;
      
      // If deleted party was selected, clear selection
      if (selectedPartyId === String(deleteDialog.party.id)) {
        setSelectedPartyId(null);
      }
      
      const partyName = deleteDialog.party.name;
      setDeleteDialog({ isOpen: false, party: null });
      toast.success(`Party account "${partyName}" deleted`);
      loadData();
      window.dispatchEvent(new Event('appSettingsChanged'));
    } catch (err: any) {
      toast.error('Error deleting party: ' + err.message);
    }
  };

  // Filter parties based on search and selected group filter
  const filteredParties = useMemo(() => {
    return parties.filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.gstin?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const pType = (p.party_type || '').toLowerCase();
      const isDebtor = pType === 'customer' || pType === 'both' || (p.is_customer === true && pType !== 'vendor');
      const isCreditor = pType === 'vendor' || pType === 'both' || (p.is_customer === false && pType !== 'customer');

      if (filterType === 'debtor') {
        return matchesSearch && isDebtor;
      }
      if (filterType === 'creditor') {
        return matchesSearch && isCreditor;
      }
      return matchesSearch;
    });
  }, [parties, searchQuery, filterType]);

  const selectedParty = useMemo(() => {
    return parties.find(p => String(p.id) === String(selectedPartyId));
  }, [parties, selectedPartyId]);

  // Pre-calculate real outstanding balances for all parties
  const partyBalancesMap = useMemo(() => {
    const map = new Map<string, { netBalance: number; isDr: boolean }>();

    const normalizedSales = salesInvoices.map(s => normalizeBill(s));
    const normalizedPurchases = purchaseBills.map(b => normalizeBill(b));

    const salesByParty = new Map<string, number>();
    const receiptsByParty = new Map<string, number>();
    const purchasesByParty = new Map<string, number>();
    const paymentsByParty = new Map<string, number>();

    normalizedSales.forEach(s => {
      if (!s) return;
      const name = s.customer_name?.toLowerCase().trim();
      if (!name) return;
      if (s.items_raw?.is_payment_voucher) {
        const pDetails = s.items_raw?.payment_details;
        const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
        const amount = pArray.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);
        const finalAmt = amount || Number(s.grand_total) || 0;
        receiptsByParty.set(name, (receiptsByParty.get(name) || 0) + finalAmt);
      } else {
        salesByParty.set(name, (salesByParty.get(name) || 0) + Number(s.grand_total || 0));
      }
    });

    normalizedPurchases.forEach(b => {
      if (!b) return;
      const name = b.vendor_name?.toLowerCase().trim();
      if (!name) return;
      if (b.items_raw?.is_payment_voucher) {
        const pDetails = b.items_raw?.payment_details;
        const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
        const amount = pArray.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);
        const finalAmt = amount || Number(b.grand_total) || 0;
        paymentsByParty.set(name, (paymentsByParty.get(name) || 0) + finalAmt);
      } else {
        purchasesByParty.set(name, (purchasesByParty.get(name) || 0) + Number(b.grand_total || 0));
      }
    });

    parties.forEach(party => {
      const nameLower = party.name?.toLowerCase().trim() || '';
      const pType = (party.party_type || '').toLowerCase();
      const isDebtor = pType === 'customer' || pType === 'both' || (party.is_customer === true && pType !== 'vendor');
      
      const openingBalanceVal = Number(party.balance) || 0;
      const openingDbCr = isDebtor ? openingBalanceVal : -openingBalanceVal;

      const sales = salesByParty.get(nameLower) || 0;
      const receipts = receiptsByParty.get(nameLower) || 0;
      const purchases = purchasesByParty.get(nameLower) || 0;
      const payments = paymentsByParty.get(nameLower) || 0;

      const netDb = openingDbCr + sales + payments - purchases - receipts;
      const isDr = netDb > 0 || (netDb === 0 && isDebtor);

      map.set(String(party.id), {
        netBalance: netDb,
        isDr
      });
    });

    return map;
  }, [parties, salesInvoices, purchaseBills]);

  // Dynamic ledger and transaction computation for the selected party
  const partyStats = useMemo(() => {
    if (!selectedParty) return { transactions: [], totalSales: 0, totalReceipts: 0, totalPurchases: 0, totalPayments: 0, netBalance: 0 };

    const nameLower = selectedParty.name?.toLowerCase().trim();

    // 1. Invoices & Receipts (Sales)
    const normalizedSales = salesInvoices.map(s => normalizeBill(s));
    const partyInvoices = normalizedSales.filter(s => s && !s.items_raw?.is_payment_voucher && s.customer_name?.toLowerCase().trim() === nameLower);
    const partyReceipts = normalizedSales.filter(s => s && s.items_raw?.is_payment_voucher === true && s.customer_name?.toLowerCase().trim() === nameLower);

    // 2. Bills & Payments (Purchases)
    const normalizedPurchases = purchaseBills.map(b => normalizeBill(b));
    const partyBills = normalizedPurchases.filter(b => b && !b.items_raw?.is_payment_voucher && b.vendor_name?.toLowerCase().trim() === nameLower);
    const partyPayments = normalizedPurchases.filter(b => b && b.items_raw?.is_payment_voucher === true && b.vendor_name?.toLowerCase().trim() === nameLower);

    const totalSales = partyInvoices.reduce((acc, i) => acc + Number(i.grand_total || 0), 0);
    const totalPurchases = partyBills.reduce((acc, b) => acc + Number(b.grand_total || 0), 0);

    const totalReceipts = partyReceipts.reduce((acc, r) => {
      const pDetails = r.items_raw?.payment_details;
      const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
      const amount = pArray.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);
      return acc + (amount || Number(r.grand_total) || 0);
    }, 0);

    const totalPayments = partyPayments.reduce((acc, p) => {
      const pDetails = p.items_raw?.payment_details;
      const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
      const amount = pArray.reduce((sum: number, p: any) => sum + (Number(p.payment_amount) || 0), 0);
      return acc + (amount || Number(p.grand_total) || 0);
    }, 0);

    // netBalance representation:
    // Debit side is positive, Credit side is negative.
    // Sundry Debtor default balance is Debit (Positive).
    // Sundry Creditor default balance is Credit (Negative).
    const isDebtor = selectedParty.party_type === 'customer' || selectedParty.is_customer === true;
    const openingBalanceVal = Number(selectedParty.balance) || 0;
    const openingDbCr = isDebtor ? openingBalanceVal : -openingBalanceVal;

    const netBalance = openingDbCr + totalSales + totalPayments - totalPurchases - totalReceipts;

    // Build list of transactions for sidebar
    const allTransactions = [
      ...partyInvoices.map(item => ({ ...item, displayType: 'Sale' })),
      ...partyReceipts.map(item => ({ ...item, displayType: 'Receipt' })),
      ...partyBills.map(item => ({ ...item, displayType: 'Purchase' })),
      ...partyPayments.map(item => ({ ...item, displayType: 'Payment' }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      transactions: allTransactions,
      totalSales,
      totalReceipts,
      totalPurchases,
      totalPayments,
      netBalance
    };

  }, [selectedParty, salesInvoices, purchaseBills]);

  return (
    <div className="space-y-6 h-full flex flex-col min-h-0 animate-in fade-in duration-300">
      
      {/* Save/Edit Party Modal */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => { setIsFormOpen(false); setEditingParty(null); }} 
        title={editingParty ? "Edit Party Profile" : "Register New Party Account"} 
        maxWidth="max-w-5xl"
      >
        <PartyForm 
          initialData={editingParty} 
          onSubmit={handleSaveParty} 
          onCancel={() => { setIsFormOpen(false); setEditingParty(null); }} 
        />
      </Modal>

      {/* Delete Party Dialog */}
      <ConfirmDialog 
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, party: null })}
        onConfirm={confirmDeleteParty}
        title="Delete Party"
        message={`Are you sure you want to delete "${deleteDialog.party?.name}"? All transaction linkages will remain intact but this party will be removed from directory.`}
      />

      {/* Full Ledger Statement Modal */}
      {selectedParty && (
        <LedgerModal 
          isOpen={isLedgerOpen} 
          onClose={() => setIsLedgerOpen(false)} 
          party={selectedParty} 
          type={selectedParty.party_type === 'customer' || selectedParty.is_customer === true ? 'customer' : 'vendor'} 
        />
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">Party Master & Accounts</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Unified register for Customer & Supplier accounts, balances, and contact details</p>
          </div>
        </div>
        <button 
          onClick={() => { setEditingParty(null); setIsFormOpen(true); }} 
          className="w-full sm:w-auto bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> <span>New Party Account</span>
        </button>
      </div>

      {/* Skeleton Loading & Empty State */}
      {loading ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
          <div className="w-full lg:w-80 flex flex-col space-y-3 shrink-0">
            <div className="h-9 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
            <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-md animate-pulse" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="p-4 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900 space-y-2 animate-pulse">
                <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
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
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-32" />
                </div>
              </div>
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-32" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-20" />
                  <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-20" />
                </div>
              ))}
            </div>
            <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-40 mb-4" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : parties.length === 0 ? (
        <EmptyState 
          title="No Party Accounts Created" 
          message="You haven't added any ledger accounts yet. Manage your business sales, purchases, payments, and receipts under a single unified party register!" 
          actionLabel="Create Party Account" 
          onAction={() => { setEditingParty(null); setIsFormOpen(true); }} 
        />
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
          
          {/* LEFT PANELS: SEARCH & LIST */}
          {!isFullScreen && (
            <div className={`w-full lg:w-80 flex flex-col space-y-4 flex-1 lg:flex-none min-h-0 lg:shrink-0 ${selectedPartyId ? 'hidden lg:flex' : 'flex'}`}>
              
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Search by name, GSTIN..." 
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-slate-900 dark:text-slate-100" 
                />
              </div>

              {/* Tally Style Filter Tabs */}
              <div className="bg-slate-100 dark:bg-slate-800/60 p-1 rounded-md flex space-x-1 shrink-0">
                <button
                  onClick={() => setFilterType('all')}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-all duration-150 active:scale-[0.98] capitalize ${filterType === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType('debtor')}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-all duration-150 active:scale-[0.98] capitalize ${filterType === 'debtor' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Customers
                </button>
                <button
                  onClick={() => setFilterType('creditor')}
                  className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-all duration-150 active:scale-[0.98] capitalize ${filterType === 'creditor' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Vendors
                </button>
              </div>

              {/* Party Scrollable Cards */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar touch-pan-y">
                {filteredParties.map((party) => {
                  const isSelected = String(selectedPartyId) === String(party.id);
                  const isHighlighted = String(party.id) === String(highlightedId);
                  const pType = (party.party_type || '').toLowerCase();
                  const isDebtor = pType === 'customer' || pType === 'both' || (party.is_customer === true && pType !== 'vendor');
                  
                  const balInfo = partyBalancesMap.get(String(party.id)) || { netBalance: 0, isDr: isDebtor };
                  const absBal = Math.abs(balInfo.netBalance);
                  const drCrTag = balInfo.isDr ? 'Dr' : 'Cr';

                  return (
                    <div 
                      key={party.id} 
                      ref={(el) => {
                        if (el && (isHighlighted || isSelected)) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      }}
                      onClick={() => {
                        setSelectedPartyId(String(party.id));
                        setHighlightedId(String(party.id));
                      }} 
                      className={`p-4 border rounded-[5px] cursor-pointer transition-all duration-150 active:scale-[0.99] group ${
                        isHighlighted
                          ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-500 ring-2 ring-amber-400 text-slate-900 dark:text-white font-semibold shadow-md'
                          : isSelected 
                            ? 'bg-primary border-transparent text-white shadow-xs' 
                            : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/80 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <h3 className="text-xs font-bold capitalize truncate">{party.name}</h3>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium leading-none tracking-tight shrink-0 ${
                          isSelected && !isHighlighted ? 'bg-white/20 text-white' : (isDebtor ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30')
                        }`}>
                          {isDebtor ? 'DR' : 'CR'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-2">
                        <span className={isSelected && !isHighlighted ? 'text-white/80' : ''}>{party.gstin || 'No GSTIN'}</span>
                        <span className={`font-mono font-bold ${isSelected && !isHighlighted ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                          ₹{absBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {drCrTag}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredParties.length === 0 && (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-xs capitalize">No parties found matching criteria</p>
                )}
              </div>
            </div>
          )}

          {/* RIGHT PANEL: PARTY PROFILE & TRANSACTION LEDGER SUMMARY */}
          <div className={`flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex flex-col overflow-hidden ${isFullScreen ? 'fixed inset-4 z-[150] m-0 shadow-2xl' : ''} ${!selectedPartyId ? 'hidden lg:flex' : 'flex'}`}>
            {selectedParty ? (
              <div className="flex flex-col h-full">
                
                {/* Header Profile Actions */}
                <div className="px-4 sm:px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <button onClick={() => setSelectedPartyId(null)} className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                      <Landmark className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div className="truncate">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white capitalize leading-none truncate">{selectedParty.name}</h2>
                      <p className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 tracking-tighter mt-1.5">ID: {selectedParty.id.split('-')[0]}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 shrink-0">
                    <button 
                      onClick={() => { setEditingParty(selectedParty); setIsFormOpen(true); }} 
                      title="Edit Profile"
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-none shadow-xs"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setIsLedgerOpen(true)} 
                      title="Opening Statement / Ledger"
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-none shadow-xs"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setIsFullScreen(!isFullScreen)} 
                      title={isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
                      className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md transition-none hidden lg:block shadow-xs"
                    >
                      {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button 
                      onClick={() => handleDeleteParty(selectedParty)} 
                      title="Delete Account"
                      className="p-2 border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-md transition-none shadow-xs"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </button>
                  </div>
                </div>

                {/* Main scrollable body panel */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
                  
                  {/* Grid summary stats cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-lg p-4 shadow-inner">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sales Booked</p>
                      <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">₹{partyStats.totalSales.toFixed(0)}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-lg p-4 shadow-inner">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Receipts Settled</p>
                      <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{partyStats.totalReceipts.toFixed(0)}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-lg p-4 shadow-inner">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Purchases Booked</p>
                      <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">₹{partyStats.totalPurchases.toFixed(0)}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-lg p-4 shadow-inner">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payments Settled</p>
                      <p className="text-lg font-mono font-bold text-amber-600 dark:text-amber-500">₹{partyStats.totalPayments.toFixed(0)}</p>
                    </div>
                  </div>

                  {/* Net outstanding and category section */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-lg p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                      <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Net Outstanding Ledger Balance</span>
                      <h3 className="text-2xl sm:text-3xl font-mono font-extrabold mt-1 text-slate-900 dark:text-white">
                        ₹{Math.abs(partyStats.netBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-sm font-sans font-normal text-slate-500 dark:text-slate-400 ml-2">
                          {partyStats.netBalance === 0 ? 'Nil' : (partyStats.netBalance > 0 ? 'Dr (Receivable)' : 'Cr (Payable)')}
                        </span>
                      </h3>
                    </div>
                    <button 
                      onClick={() => setIsLedgerOpen(true)} 
                      className="bg-primary hover:bg-primary-dark text-white font-bold text-xs px-6 py-3 rounded shadow-sm transition-none capitalize tracking-tight"
                    >
                      Open Party Statement
                    </button>
                  </div>

                  {/* Business & Contact info grids */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                    <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-6 space-y-4">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center">
                        <Landmark className="w-4 h-4 mr-2 text-slate-400" /> Accounting & Contact Details
                      </h3>
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Party Type:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {selectedParty.party_type === 'both' 
                              ? 'Both (Sundry Debtors & Creditors)' 
                              : (selectedParty.party_type === 'customer' || selectedParty.is_customer === true ? 'Customer (Sundry Debtors)' : 'Vendor (Sundry Creditors)')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">GSTIN:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedParty.gstin || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">PAN:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedParty.pan || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Opening Balance:</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">₹{Number(selectedParty.balance || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">State:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{selectedParty.state || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-6 space-y-4">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center">
                        <User className="w-4 h-4 mr-2 text-slate-400" /> Contact & Delivery info
                      </h3>
                      <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                        {selectedParty.phone && (
                          <p className="flex items-center">
                            <Phone className="w-3.5 h-3.5 text-slate-400 mr-2.5" /> {selectedParty.phone}
                          </p>
                        )}
                        {selectedParty.email && (
                          <p className="flex items-center">
                            <Mail className="w-3.5 h-3.5 text-slate-400 mr-2.5" /> {selectedParty.email}
                          </p>
                        )}
                        {selectedParty.address ? (
                          <p className="flex items-start">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 mr-2.5 mt-0.5" /> 
                            <span className="leading-relaxed">{selectedParty.address}</span>
                          </p>
                        ) : (
                          <p className="text-slate-400 capitalize text-center py-4">No contact or physical address registered</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recent vouchers list */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Recent Linked Transactions</h3>
                    
                    {partyStats.transactions.length === 0 ? (
                      <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center">
                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 capitalize">No transaction entries found for this party ledger.</p>
                      </div>
                    ) : (
                      <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-50 dark:divide-slate-800 text-xs">
                        {partyStats.transactions.slice(0, 10).map((t, index) => {
                          const isReceipt = t.displayType === 'Receipt';
                          const isPayment = t.displayType === 'Payment';
                          const isSale = t.displayType === 'Sale';
                          
                          return (
                            <div key={index} className="px-6 py-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <div className="space-y-1">
                                <p className="font-bold text-slate-800 dark:text-slate-200 uppercase">{t.displayType} Voucher: #{t.bill_number}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{t.date}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-bold text-slate-900 dark:text-white">₹{Number(t.grand_total).toFixed(2)}</p>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase leading-none ${isReceipt ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : (isPayment ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30' : (isSale ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30' : 'bg-slate-50 text-slate-600 dark:bg-slate-800'))}`}>
                                  {t.status || 'Settled'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Landmark className="w-12 h-12 mb-4 text-slate-300" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">No Party Selected</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">Select a ledger account from the listing sidebar to review profiles, outstanding balances, and ledger details.</p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default Parties;
