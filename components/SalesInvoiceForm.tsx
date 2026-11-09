import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Loader2, ChevronDown, UserPlus, UserRoundPen, Undo2, Redo2, ToggleLeft, ToggleRight, Printer } from 'lucide-react';
import { getActiveCompanyId, formatDate, parseDateFromInput, safeSupabaseSave, getSelectedLedgerIds, syncTransactionToCashbook, ensureStockItems, ensureParty, normalizeBill, getAppSettings, formatCurrency, toDisplayValue, READONLY_LEDGERS, fetchStockItemsWithBalance } from '../utils/helpers';
import { supabase, getAuthUser } from '../lib/supabase';
import Modal from './Modal';
import PartyForm from './PartyForm';
import StockForm from './StockForm';
import ItemSelectDropdown from './ItemSelectDropdown';
import PaymentModal from './PaymentModal';
import { recordActivity } from '../utils/activityTracker';
import { InvoicePrintModal } from './InvoicePrintModal';
import FormActionButtons from './FormActionButtons';
import { useKeyboardShortcuts } from '../utils/shortcutManager';
import { toast } from '../utils/toast';

interface SalesInvoiceFormProps {
  initialData?: any;
  onSubmit: (invoice: any, shouldPrint?: boolean, isSaveAndNew?: boolean) => void;
  onCancel: () => void;
}

const SalesInvoiceForm: React.FC<SalesInvoiceFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const cid = getActiveCompanyId();
  const appSettings = getAppSettings();
  const today = new Date().toISOString().split('T')[0];
  const manualOverrides = useRef<Set<string>>(new Set());

  const getInitialState = () => ({
    customer_name: '', 
    invoice_number: '', 
    date: today, 
    displayDate: formatDate(today), 
    gst_type: appSettings.gstType === 'IGST' ? 'Inter-State' : 'Intra-State',
    items: [{ id: Date.now().toString(), itemName: '', hsnCode: '', qty: '', rate: '', discount: 0, discount_type: 'Percentage', tax_rate: 0, taxableAmount: 0, itemTotal: 0 }],
    total_without_gst: 0, 
    total_gst: 0, 
    duties_and_taxes: [], 
    auto_round_off: true,
    round_off: 0, 
    grand_total: 0, 
    status: 'Paid',
    description: '',
    payment_details: null
  });

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>(getInitialState());
  const [history, setHistory] = useState<any[]>([]);
  const [future, setFuture] = useState<any[]>([]);
  const [isGstEnabled, setIsGstEnabled] = useState(appSettings.gstEnabled);
  const [isSaveAndNew, setIsSaveAndNew] = useState(false);

  const updateFormData = useCallback((next: any, skipHistory = false) => {
    if (!skipHistory) {
      setHistory(prev => [...prev, formData].slice(-50));
      setFuture([]);
    }
    setFormData(next);
  }, [formData]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [formData, ...f]);
    setHistory(h => h.slice(0, -1));
    setFormData(prev);
  }, [history, formData]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, formData]);
    setFuture(f => f.slice(1));
    setFormData(next);
  }, [future, formData]);

  const formRef = useRef<HTMLFormElement>(null);

  // Global Shortcut listener for Ctrl+S, Ctrl+P, Ctrl+Shift+S
  useKeyboardShortcuts({
    onSave: () => {
      shouldPrintRef.current = false;
      setIsSaveAndNew(false);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    },
    onSaveAndNew: () => {
      shouldPrintRef.current = false;
      setIsSaveAndNew(true);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    },
    onPrint: () => {
      shouldPrintRef.current = true;
      setIsSaveAndNew(false);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    },
    priority: 30
  }, [formData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Auto focus & select first field on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formRef.current) {
        const focusableInputs = formRef.current.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');

        if (focusableInputs.length > 0) {
          const firstInput = focusableInputs[0];
          firstInput.focus();
          if (
            'select' in firstInput &&
            typeof (firstInput as HTMLInputElement).select === 'function' &&
            !['date', 'checkbox', 'radio', 'file'].includes(firstInput.type)
          ) {
            (firstInput as HTMLInputElement).select();
          }
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const [customers, setCustomers] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [customerModal, setCustomerModal] = useState({ isOpen: false, initialData: null, prefilledName: '' });
  const [itemModal, setItemModal] = useState<{ isOpen: boolean; rowIdx: number | null }>({ isOpen: false, rowIdx: null });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const shouldPrintRef = useRef(false);

  const parseNumber = (val: string) => {
    if (!val) return 0;
    const clean = val.toString().replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const formatWhileTyping = (val: string) => {
    if (val === '') return '';
    const clean = val.replace(/[^0-9.]/g, '');
    if (clean === '') return '';
    const parts = clean.split('.');
    let formatted = new Intl.NumberFormat('en-IN').format(parseFloat(parts[0]));
    if (parts.length > 1) formatted += `.${parts[1].slice(0, 2)}`;
    return val.startsWith('-') ? `-${formatted}` : formatted;
  };

  const recalculate = (state: any, sourceField?: string, sourceDutyId?: string, sourceVal?: any, overrideGstEnabled?: boolean) => {
    const currentGstEnabled = overrideGstEnabled !== undefined ? overrideGstEnabled : isGstEnabled;
    let taxable = state.total_without_gst;
    let gst = state.total_gst;
    let autoGstSum = gst;

    if (sourceDutyId) manualOverrides.current.add(sourceDutyId);

    if (sourceField === 'total_without_gst') {
      taxable = parseNumber(sourceVal);
    } else if (sourceField === 'total_gst') {
      gst = parseNumber(sourceVal);
      autoGstSum = gst;
    } else if (!sourceDutyId) {
      taxable = 0;
      gst = 0;
      autoGstSum = 0;
      const updatedItems = (state.items || []).map((item: any) => {
        const q = parseNumber(item.qty.toString());
        const r = parseNumber(item.rate.toString());
        const d = parseFloat(item.discount) || 0;
        const dt = item.discount_type || 'Percentage';
        const t = parseFloat(item.tax_rate) || 0;
        
        const baseAmount = q * r;
        let discountAmount = 0;
        if (dt === 'Percentage') {
          discountAmount = baseAmount * (d / 100);
        } else {
          discountAmount = d;
        }
        
        // Ensure discount does not exceed baseAmount
        discountAmount = Math.min(discountAmount, baseAmount);
        
        const taxableVal = baseAmount - discountAmount;
        const gstAmt = (currentGstEnabled || t > 0) ? taxableVal * (t / 100) : 0;
        const itemSubtotal = taxableVal + gstAmt; 
        
        taxable += taxableVal;
        autoGstSum += gstAmt;
        gst += gstAmt;
        return { ...item, taxableAmount: taxableVal, itemTotal: itemSubtotal };
      });
      state.items = updatedItems;
    }

    const hasAnyGstItem = (state.items || []).some((item: any) => parseFloat(item.tax_rate) > 0);
    const effectiveGstActive = currentGstEnabled || hasAnyGstItem;

    // Dynamic injection/correction of CGST, SGST, IGST in duties_and_taxes if they are missing
    let duties = [...(state.duties_and_taxes || [])];
    
    // Always filter out existing CGST, SGST, IGST to prevent double calculation or duplicate items
    duties = duties.filter((d: any) => !['CGST', 'SGST', 'IGST'].includes(d.name));

    if (effectiveGstActive) {
      // Determine required GST ledgers based on state.gst_type (default to Intra-State mappings if not set)
      const currentGstType = state.gst_type || (appSettings.gstType === 'IGST' ? 'Inter-State' : 'Intra-State');
      const requiredNames = currentGstType === 'Inter-State' ? ['IGST'] : ['CGST', 'SGST'];
      
      requiredNames.forEach(name => {
        duties.push({
          id: 'virtual_' + name + '_' + Date.now(),
          name: name,
          amount: 0,
          type: 'Charge',
          calc_method: 'Fixed',
          fixed_amount: 0,
          rate: 0,
          apply_on: 'Subtotal',
          is_default: true,
          is_deleted: false
        });
      });
    }
    state.duties_and_taxes = duties;

    let runningTotal = taxable;
    let gstDutiesAdded = 0;

    const updatedDuties = (state.duties_and_taxes || []).map((d: any) => {
      let calcAmt = d.amount || 0;
      if (sourceDutyId === d.id) {
        calcAmt = parseNumber(sourceVal);
      } else if (effectiveGstActive && (d.name === 'CGST' || d.name === 'SGST' || d.name === 'IGST')) {
          const currentGstType = state.gst_type || (appSettings.gstType === 'IGST' ? 'Inter-State' : 'Intra-State');
          if (currentGstType === 'Intra-State') {
              if (d.name === 'CGST' || d.name === 'SGST') calcAmt = autoGstSum / 2;
          } else if (currentGstType === 'Inter-State') {
              if (d.name === 'IGST') calcAmt = autoGstSum;
          }
      } else if (!manualOverrides.current.has(d.id)) {
        const base = d.apply_on === 'Net Total' ? (taxable + gst) : taxable;
        const rate = parseFloat(d.bill_rate !== undefined ? d.bill_rate : d.rate) || 0;
        const fixed = parseFloat(d.bill_fixed_amount !== undefined ? d.bill_fixed_amount : d.fixed_amount) || 0;
        calcAmt = d.calc_method === 'Percentage' ? base * (rate / 100) : fixed;
      }
      if (['CGST', 'SGST', 'IGST'].includes((d.name || '').toUpperCase())) {
        gstDutiesAdded += calcAmt;
      }
      runningTotal += calcAmt;
      return { ...d, amount: calcAmt };
    });

    if (effectiveGstActive && gstDutiesAdded === 0 && gst > 0) {
      runningTotal += gst;
    }

    const rounded = Math.round(runningTotal);
    const ro = parseFloat((rounded - runningTotal).toFixed(2));
    const grandTotal = rounded;

    return { 
      ...state, 
      total_without_gst: parseFloat(taxable.toFixed(2)), 
      total_gst: parseFloat(gst.toFixed(2)), 
      duties_and_taxes: updatedDuties, 
      round_off: ro, 
      grand_total: grandTotal 
    };
  };

  const loadDependencies = async () => {
    if (!cid) return;
    const { data: partyData } = await supabase.from('vendors').select('*').eq('company_id', cid).eq('is_deleted', false).order('name');
    const { data: legacyCustomers } = await supabase.from('customers').select('*').eq('company_id', cid).eq('is_deleted', false).order('name');

    const partyMap = new Map();
    (legacyCustomers || []).forEach((c: any) => {
      const key = c.name ? c.name.trim().toUpperCase() : c.id;
      partyMap.set(key, { ...c, party_type: c.party_type || 'customer', is_customer: true });
    });
    (partyData || []).forEach((p: any) => {
      const key = p.name ? p.name.trim().toUpperCase() : p.id;
      partyMap.set(key, p);
    });

    const allParties = Array.from(partyMap.values());
    const salesParties = allParties.filter((p: any) => {
      const pType = (p.party_type || '').toLowerCase();
      return pType === 'customer' || pType === 'both' || (p.is_customer === true && pType !== 'vendor');
    });

    const stockData = await fetchStockItemsWithBalance(cid);
    setCustomers(salesParties);
    setStockItems(stockData || []);
    
    const { data: allDuties } = await supabase.from('duties_taxes').select('*').eq('company_id', cid).eq('is_deleted', false);
    const selectedIds = getSelectedLedgerIds();

    const isApplicableToSales = (d: any) => {
      if (!d.applicable_to) return true;
      const app = d.applicable_to.toLowerCase().trim();
      return app === 'sales invoices' || app === 'both' || app === 'sales' || app === 'sales invoice';
    };

    // Filter out CGST, SGST, IGST from active/manual duties so users CANNOT manually select them
    const activeReadOnlyDuties = READONLY_LEDGERS.filter((d: any) => selectedIds.includes(d.id));
    const activeDuties = [
      ...(allDuties || [])
        .filter((d: any) => !['CGST', 'SGST', 'IGST'].includes(d.name))
        .filter((d: any) => isApplicableToSales(d))
        .filter((d: any) => d.is_default || selectedIds.includes(d.id)),
      ...activeReadOnlyDuties
    ];

    if (!initialData) {
      setFormData((prev: any) => {
        if (prev.duties_and_taxes.length > 0) return prev;
        return recalculate({ ...prev, duties_and_taxes: activeDuties.map(d => ({ ...d, amount: 0 }))});
      });
    } else {
        const normalized = normalizeBill(initialData);
        normalized?.items_raw?.duties_and_taxes?.forEach((d:any) => { if(d.amount !== 0) manualOverrides.current.add(d.id); });
        
        const hasGstInSavedItems = normalized.items?.some((it: any) => parseFloat(it.tax_rate) > 0) || normalized.total_gst > 0;
        const isGst = (hasGstInSavedItems || normalized.total_gst > 0) || appSettings.gstEnabled;
        setIsGstEnabled(isGst);

        // Map old or saved gst_type if they are in older formats like 'CGST - SGST' or 'IGST' to the new 'Intra-State' / 'Inter-State' modes
        let savedGstType = normalized?.items_raw?.gst_type || normalized?.gst_type;
        if (savedGstType === 'CGST - SGST') savedGstType = 'Intra-State';
        else if (savedGstType === 'IGST') savedGstType = 'Inter-State';
        if (!savedGstType) savedGstType = appSettings.gstType === 'IGST' ? 'Inter-State' : 'Intra-State';

        setFormData(recalculate({ 
          ...getInitialState(), 
          ...normalized, 
          customer_name: normalized?.customer_name || '',
          invoice_number: normalized?.invoice_number || '',
          description: normalized?.description || '', 
          displayDate: formatDate(normalized?.date), 
          gst_type: savedGstType,
          duties_and_taxes: (normalized?.items_raw?.duties_and_taxes || []),
          payment_details: normalized?.items_raw?.payment_details || null
        }, undefined, undefined, undefined, isGst));
    }
  };

  useEffect(() => { loadDependencies(); }, [initialData, cid]);

  const selectStockItemForSalesRow = (idx: number, selected: any) => {
    const newItems = [...formData.items];
    let salesRate = '0';
    if (selected && selected.selling_price !== undefined && selected.selling_price !== null && selected.selling_price !== '') {
      const numericSalePrice = Number(selected.selling_price);
      if (!isNaN(numericSalePrice) && numericSalePrice > 0) {
        salesRate = selected.selling_price.toString();
      }
    }

    newItems[idx] = {
      ...newItems[idx],
      itemName: selected.name || '',
      hsnCode: selected.hsn || '',
      rate: salesRate,
      tax_rate: selected.tax_rate || 0
    };
    setFormData(recalculate({ ...formData, items: newItems }));
  };

  const handleSaveNewStockItem = async (itemData: any) => {
    try {
      const user = await getAuthUser();
      if (user) recordActivity(user.id, user.email || '');

      const storageData = { ...itemData, company_id: cid, is_deleted: false };
      let res = await supabase.from('stock_items').insert([storageData]).select();
      if (res.error && (res.error.message?.includes('selling_price') || res.error.code === 'PGRST204' || res.error.code === '42703')) {
        const { selling_price, ...cleanData } = storageData;
        res = await supabase.from('stock_items').insert([cleanData]).select();
      }

      let insertedItem = (res.data && res.data[0]) ? res.data[0] : null;
      if (!insertedItem) {
        const { data: fetchRes } = await supabase.from('stock_items')
          .select('*')
          .eq('company_id', cid)
          .eq('name', itemData.name)
          .eq('is_deleted', false)
          .maybeSingle();
        insertedItem = fetchRes || itemData;
      }

      const stockData = await fetchStockItemsWithBalance(cid);
      setStockItems(stockData || []);

      if (itemModal.rowIdx !== null && itemModal.rowIdx >= 0) {
        selectStockItemForSalesRow(itemModal.rowIdx, insertedItem);
      }

      setItemModal({ isOpen: false, rowIdx: null });
      toast.success("Stock item created successfully.");
    } catch (err: any) {
      toast.error("Error creating stock item: " + (err.message || 'Unknown error'));
    }
  };

  const updateItemRow = (idx: number, field: string, val: any) => {
    const newItems = [...formData.items];
    newItems[idx] = { ...newItems[idx], [field]: val };
    if (field === 'itemName') {
      const selected = stockItems.find(s => s.name.toLowerCase().trim() === val.toLowerCase().trim());
      if (selected) {
        selectStockItemForSalesRow(idx, selected);
        return;
      }
    }
    setFormData(recalculate({ ...formData, items: newItems }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.customer_name || !formData.invoice_number) {
      toast.warning("Required: Customer Name and Invoice No");
      return;
    }
    setLoading(true);
    try {
      const user = await getAuthUser();
      if (user) recordActivity(user.id, user.email || '');

      const payload: any = {
          customer_name: (formData.customer_name || '').trim().toUpperCase(),
          invoice_number: formData.invoice_number,
          date: formData.date,
          total_without_gst: formData.total_without_gst,
          total_gst: formData.total_gst,
          grand_total: formData.grand_total,
          status: formData.status,
          is_deleted: false,
          description: formData.description,
          round_off: formData.round_off,
          items: {
              line_items: formData.items,
              duties_and_taxes: formData.duties_and_taxes,
              gst_type: formData.gst_type,
              payment_details: formData.payment_details,
              round_off: formData.round_off
          }
      };
      
      const savedRes = await safeSupabaseSave('sales_invoices', payload, initialData?.id);
      await ensureStockItems(formData.items, cid);
      await ensureParty(formData.customer_name, 'customer', cid);
      if (payload.status === 'Paid' && savedRes.data) await syncTransactionToCashbook(savedRes.data[0]);
      window.dispatchEvent(new Event('appSettingsChanged'));
      const finalInv = (savedRes.data && savedRes.data[0]) ? savedRes.data[0] : { ...payload, bill_number: payload.invoice_number };
      toast.success(initialData ? "Invoice updated successfully." : "Invoice saved successfully.");
      onSubmit(finalInv, shouldPrintRef.current, isSaveAndNew);
      if (isSaveAndNew) {
        setFormData(getInitialState());
        setIsGstEnabled(appSettings.gstEnabled);
        manualOverrides.current = new Set();
        loadDependencies();
      }
    } catch (err: any) { 
      toast.error("Error: " + (err.message || 'Unknown error')); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 w-full flex flex-col">
      <Modal isOpen={customerModal.isOpen} onClose={() => setCustomerModal({ ...customerModal, isOpen: false })} title="Party Master" maxWidth="max-w-5xl">
        <PartyForm defaultType="customer" initialData={customerModal.initialData} prefilledName={customerModal.prefilledName} onSubmit={(c) => { setCustomerModal({ ...customerModal, isOpen: false }); loadDependencies(); }} onCancel={() => setCustomerModal({ ...customerModal, isOpen: false })} />
      </Modal>

      <Modal isOpen={itemModal.isOpen} onClose={() => setItemModal({ isOpen: false, rowIdx: null })} title="Create New Item" maxWidth="max-w-5xl">
        <StockForm onSubmit={handleSaveNewStockItem} onCancel={() => setItemModal({ isOpen: false, rowIdx: null })} />
      </Modal>

      <PaymentModal 
        isOpen={showPaymentModal} 
        onClose={() => {
          setShowPaymentModal(false);
          if (!formData.payment_details || formData.payment_details.length === 0) setFormData({ ...formData, status: 'Pending' });
        }} 
        onSubmit={(payments) => {
          setFormData({ ...formData, payment_details: payments, status: 'Paid' });
          setShowPaymentModal(false);
        }}
        billNumber={formData.invoice_number || 'New'}
        totalAmount={formData.grand_total}
        initialPayments={Array.isArray(formData.payment_details) ? formData.payment_details : (formData.payment_details ? [formData.payment_details] : [])}
      />

      <form ref={formRef} onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-4">
            {appSettings.gstEnabled && (
              <>
                <button type="button" onClick={() => {
                  const nextVal = !isGstEnabled;
                  setIsGstEnabled(nextVal);
                  setFormData(recalculate({ ...formData }, undefined, undefined, undefined, nextVal));
                }} className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  {isGstEnabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                  <span>Enable GST</span>
                </button>
                <div className="h-4 w-[1px] bg-slate-200 dark:border-slate-700" />
              </>
            )}
            <button type="button" onClick={undo} disabled={history.length === 0} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors" title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={redo} disabled={future.length === 0} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors" title="Redo (Ctrl+Y)">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 rounded-md p-4 sm:p-8 bg-white dark:bg-slate-900 space-y-6 shadow-sm">
            <div className={`grid grid-cols-1 ${appSettings.gstEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-6`}>
                <div className="space-y-1.5"><label className="text-[14px] font-medium dark:text-slate-300 capitalize">Date</label><input required type="date" value={formData.date || ''} onChange={e => { const d = e.target.value; updateFormData({...formData, date: d, displayDate: formatDate(d)}); }} className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-[14px]" /></div>
                <div className="space-y-1.5"><label className="text-[14px] font-medium dark:text-slate-300 capitalize">Invoice No</label><input required value={toDisplayValue(formData.invoice_number)} onChange={e => updateFormData({...formData, invoice_number: e.target.value})} className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-[14px] font-mono uppercase" /></div>
                {appSettings.gstEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[14px] font-medium dark:text-slate-300 capitalize">GST Mode</label>
                    <div className="relative">
                      <select 
                        value={formData.gst_type || 'Intra-State'} 
                        onChange={e => {
                          const nextGstType = e.target.value;
                          updateFormData(recalculate({ ...formData, gst_type: nextGstType }));
                        }} 
                        className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-[14px] appearance-none cursor-pointer bg-white dark:bg-slate-800"
                      >
                        <option value="Intra-State" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Intra-State (CGST + SGST)</option>
                        <option value="Inter-State" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Inter-State (IGST)</option>
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}
            </div>

            <div className="space-y-1.5">
                <label className="text-[14px] font-medium dark:text-slate-300 capitalize">Customer Name</label>
                <div className="flex gap-3">
                  <input required list="clist" value={toDisplayValue(formData.customer_name)} onChange={e => updateFormData({...formData, customer_name: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-[14px] uppercase font-bold" />
                  <button type="button" onClick={() => setCustomerModal({ isOpen: true, initialData: customers.find(c=>c.name===formData.customer_name), prefilledName: formData.customer_name })} className="h-10 w-10 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"><UserRoundPen className="w-4 h-4 text-slate-400" /></button>
                </div>
                <datalist id="clist">{customers.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-x-auto mt-6 bg-white dark:bg-slate-900">
                <table className="w-full text-[14px] border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold">
                        <tr>
                            <th className="p-3 text-left border-r border-slate-200 dark:border-slate-700 min-w-[200px] capitalize">Particulars</th>
                            <th className="p-3 text-left w-24 border-r border-slate-200 dark:border-slate-700 capitalize">HSN</th>
                            <th className="p-3 text-right w-32 border-r border-slate-200 dark:border-slate-700 capitalize">Rate</th>
                            <th className="p-3 text-center w-24 border-r border-slate-200 dark:border-slate-700 capitalize">QTY</th>
                            <th className="p-3 text-center w-40 border-r border-slate-200 dark:border-slate-700 capitalize">Discount</th>
                            {isGstEnabled && appSettings.gstEnabled && <th className="p-3 text-center w-24 border-r border-slate-200 dark:border-slate-700 capitalize">GST %</th>}
                            <th className="p-3 text-right w-32 capitalize">Subtotal</th>
                            <th className="w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {formData.items.map((it: any, idx: number) => {
                            const base = parseNumber(it.qty) * parseNumber(it.rate);
                            const discVal = parseFloat(it.discount) || 0;
                            const isPerc = it.discount_type === 'Percentage';
                            const equiv = isPerc ? (base * (discVal / 100)) : (base > 0 ? (discVal / base) * 100 : 0);

                            return (
                                <tr key={it.id}>
                                    <td className="p-0 border-r border-slate-100 dark:border-slate-800 min-w-[220px]">
                                        <ItemSelectDropdown
                                            value={it.itemName}
                                            stockItems={stockItems}
                                            onSelect={(selectedItem) => selectStockItemForSalesRow(idx, selectedItem)}
                                            onAddNewItem={() => setItemModal({ isOpen: true, rowIdx: idx })}
                                            placeholder="Select Item"
                                        />
                                    </td>
                                    <td className="p-0 border-r border-slate-100 dark:border-slate-800"><input value={toDisplayValue(it.hsnCode)} onChange={e => updateItemRow(idx, 'hsnCode', e.target.value)} className="w-full h-10 px-3 outline-none bg-transparent font-mono text-slate-400 dark:text-slate-500" /></td>
                                    <td className="p-0 border-r border-slate-100 dark:border-slate-800"><input value={toDisplayValue(it.rate)} onChange={e => updateItemRow(idx, 'rate', e.target.value)} className="w-full h-10 px-2 text-right outline-none font-mono font-bold dark:text-white bg-transparent" /></td>
                                    <td className="p-0 border-r border-slate-100 dark:border-slate-800"><input value={toDisplayValue(it.qty)} onChange={e => updateItemRow(idx, 'qty', e.target.value)} className="w-full h-10 px-2 text-center outline-none font-mono font-bold dark:text-white bg-transparent" /></td>
                                    <td className="p-0 border-r border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center h-10">
                                            <input type="text" value={toDisplayValue(it.discount)} onChange={e => updateItemRow(idx, 'discount', e.target.value)} className="w-1/2 h-full px-2 text-right outline-none bg-transparent dark:text-white border-r border-slate-100 dark:border-slate-800" />
                                            <select value={it.discount_type} onChange={e => updateItemRow(idx, 'discount_type', e.target.value)} className="w-1/2 h-full px-1 outline-none bg-transparent dark:text-white text-[10px] font-bold">
                                                <option value="Percentage" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">%</option>
                                                <option value="Amount" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">₹</option>
                                            </select>
                                        </div>
                                        {discVal > 0 && (
                                            <div className="px-2 pb-1 text-[9px] text-slate-400 text-right">
                                                {isPerc ? `₹${equiv.toFixed(2)}` : `${equiv.toFixed(2)}%`}
                                            </div>
                                        )}
                                    </td>
                                    {isGstEnabled && appSettings.gstEnabled && (
                                        <td className="p-0 border-r border-slate-100 dark:border-slate-800 text-center">
                                            <select value={it.tax_rate} onChange={e => updateItemRow(idx, 'tax_rate', e.target.value)} className="w-full h-10 px-2 outline-none bg-transparent dark:text-white appearance-none text-center cursor-pointer">
                                                <option value="0" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">0%</option>
                                                <option value="5" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">5%</option>
                                                <option value="12" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">12%</option>
                                                <option value="18" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">18%</option>
                                                <option value="28" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">28%</option>
                                            </select>
                                        </td>
                                    )}
                                    <td className="p-3 text-right font-bold font-mono dark:text-slate-200">{formatCurrency(it.itemTotal, false)}</td>
                                    <td className="text-center p-2"><button type="button" onClick={() => updateFormData(recalculate({...formData, items: formData.items.filter((_: any, i: number) => i !== idx)}))} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <button type="button" onClick={() => updateFormData(recalculate({...formData, items: [...formData.items, { id: Date.now().toString(), itemName: '', hsnCode: '', qty: '', rate: '', discount: 0, discount_type: 'Percentage', tax_rate: 0, taxableAmount: 0, itemTotal: 0 }]}))} className="w-full py-3 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 border-t border-slate-200 dark:border-slate-700">+ Add New Row</button>
            </div>
            <div className="flex flex-col lg:flex-row justify-between items-start pt-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 gap-8">
                <div className="w-full lg:w-1/2 lg:pr-12"><label className="text-[14px] font-medium dark:text-slate-300 mb-2 block capitalize">Remark</label><textarea value={toDisplayValue(formData.description)} onChange={e => updateFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-[14px] resize-none h-36 bg-slate-50/30 focus:bg-white transition-all shadow-inner" /></div>
                <div className="flex flex-col items-end space-y-4 w-full lg:w-1/2">
                    <div className="flex items-center justify-between w-full max-w-sm text-[14px]">
                        <span className="text-slate-500 font-bold uppercase tracking-tight pr-4">Taxable (Without GST)</span>
                        <input 
                          type="text" 
                          value={formatWhileTyping(formData.total_without_gst.toString())} 
                          readOnly 
                          className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed rounded outline-none text-[14px] font-mono font-bold text-right w-40 sm:w-48" 
                        />
                    </div>
                    <div className="flex items-center justify-between w-full max-w-sm text-[14px]">
                        <span className="text-slate-500 font-bold uppercase tracking-tight pr-4">GST Amount</span>
                        <input 
                          type="text" 
                          value={formatWhileTyping(formData.total_gst.toString())} 
                          readOnly 
                          className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed rounded outline-none text-[14px] font-mono font-bold text-right w-40 sm:w-48" 
                        />
                    </div>
                    {formData.duties_and_taxes.map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between w-full max-w-sm text-[14px]">
                            <span className="text-slate-500 font-bold uppercase tracking-tight pr-4">{d.name}</span>
                            <input 
                              type="text" 
                              value={formatWhileTyping(d.amount.toString())} 
                              onFocus={(e) => { e.target.value = d.amount.toString(); e.target.select(); }} 
                              onBlur={(e) => { e.target.value = formatWhileTyping(d.amount.toString()) }} 
                              onChange={e => updateFormData(recalculate({...formData}, undefined, d.id, e.target.value))} 
                              className={`px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] font-mono font-bold text-right w-40 sm:w-48 ${(d.is_readonly || (isGstEnabled && appSettings.gstEnabled && (d.name === 'CGST' || d.name === 'SGST' || d.name === 'IGST'))) ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-500' : 'bg-white dark:bg-slate-800'}`}
                              readOnly={d.is_readonly || (isGstEnabled && appSettings.gstEnabled && (d.name === 'CGST' || d.name === 'SGST' || d.name === 'IGST'))}
                            />
                        </div>
                    ))}
                    <div className="flex items-center justify-between w-full max-w-sm text-[14px]">
                        <span className="text-slate-500 font-bold uppercase tracking-tight pr-4">Round Off</span>
                        <input 
                          type="text" 
                          value={
                            formData.round_off === 0 
                              ? '0.00' 
                              : (formData.round_off > 0 ? `+${Number(formData.round_off).toFixed(2)}` : Number(formData.round_off).toFixed(2))
                          } 
                          readOnly
                          className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed rounded outline-none text-[14px] font-mono font-bold text-right w-40 sm:w-48" 
                        />
                    </div>
                    <div className="flex items-center justify-between w-full max-w-sm text-[14px] border-t border-slate-100 dark:border-slate-800 pt-5">
                        <span className="text-slate-900 dark:text-slate-100 font-bold uppercase text-right pr-4 tracking-tighter">Net Total Invoice</span>
                        <span className="font-mono font-bold text-[20px] sm:text-[24px] text-link">{formatCurrency(formData.grand_total)}</span>
                    </div>
                </div>
            </div>
        </div>

        <FormActionButtons
          primaryText={initialData ? 'Update & Print' : 'Save & Print'}
          primaryType="submit"
          primaryOnClick={() => { shouldPrintRef.current = true; setIsSaveAndNew(false); }}
          primaryDisabled={loading}
          primaryLoading={loading && shouldPrintRef.current}

          secondaryLeftText="Save & New"
          secondaryLeftType="submit"
          secondaryLeftOnClick={() => { shouldPrintRef.current = false; setIsSaveAndNew(true); }}
          secondaryLeftDisabled={loading}
          secondaryLeftLoading={loading && isSaveAndNew}

          secondaryRightText="Print Preview"
          secondaryRightType="button"
          secondaryRightOnClick={() => setShowPrintModal(true)}
          secondaryRightDisabled={loading}

          discardText="Discard"
          discardOnClick={onCancel}
          discardDisabled={loading}
        />
      </form>

      <InvoicePrintModal 
        isOpen={showPrintModal} 
        onClose={() => setShowPrintModal(false)} 
        invoice={{
          ...formData,
          bill_number: formData.invoice_number || 'DRAFT',
          items: formData.items,
          items_raw: {
            line_items: formData.items,
            duties_and_taxes: formData.duties_and_taxes,
            payment_details: formData.payment_details
          }
        }} 
      />
    </div>
  );
};

export default SalesInvoiceForm;
