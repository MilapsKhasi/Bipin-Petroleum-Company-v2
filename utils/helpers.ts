
import { supabase } from '../lib/supabase';

export const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' }
};

export const getActiveCompanyId = () => {
  const id = localStorage.getItem('activeCompanyId');
  return id && id !== 'undefined' ? id : '';
};

export const getAppSettings = () => {
  const cid = getActiveCompanyId();
  const defaultSettings = { 
    currency: 'INR', 
    borderStyle: 'rounded', 
    dateFormat: 'DD/MM/YY',
    gstEnabled: false,
    gstType: 'CGST - SGST'
  };
  
  if (!cid) return defaultSettings;
  
  const s = localStorage.getItem(`appSettings_${cid}`);
  try {
    if (!s) return defaultSettings;
    const parsed = JSON.parse(s);
    return {
      ...defaultSettings,
      ...parsed,
      // Ensure boolean type for gstEnabled
      gstEnabled: parsed.gstEnabled === true || parsed.gstEnabled === 'true'
    };
  } catch (e) {
    return defaultSettings;
  }
};

export const formatCurrency = (amount: number | undefined | null, includeSymbol: boolean = true) => {
  if (amount === undefined || amount === null || isNaN(amount)) return includeSymbol ? '₹ 0.00' : '0.00';
  const { currency } = getAppSettings();
  
  const options: any = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  };
  
  if (includeSymbol) {
    options.style = 'currency';
    options.currency = currency;
  } else {
    options.style = 'decimal';
  }
  
  return new Intl.NumberFormat('en-IN', options).format(amount);
};

export const formatDate = (iso: any) => {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  // Using 2-digit year as requested
  const shortYear = y.length === 4 ? y.substring(2) : y;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${shortYear}`;
};

export const formatDateLong = (iso: any) => {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  const dateObj = new Date(iso);
  if (isNaN(dateObj.getTime())) return iso;
  return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const toTitleCase = (str: any) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};



export const parseDateFromInput = (input: string): string | null => {
  if (!input) return null;
  const parts = input.split(/[\/\-.]/);
  if (parts.length !== 3) return null;
  let [d, m, y] = parts;
  if (y.length === 2) {
    const yearNum = parseInt(y);
    const prefix = yearNum < 50 ? "20" : "19";
    y = prefix + y;
  }
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dateObj = new Date(iso);
  if (isNaN(dateObj.getTime())) return null;
  return iso;
};

export const toDisplayValue = (val: any) => {
  return val === null || val === undefined ? '' : val;
};

export const toStorageValue = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
};

export const safeSupabaseSave = async (table: string, payload: any, id?: string): Promise<any> => {
  const cid = getActiveCompanyId();
  if (!cid && table !== 'companies' && table !== 'profiles') {
    throw new Error("No active workspace context.");
  }

  let cleanPayload: any = { ...payload };
  
  // Convert empty strings to null & ensure code/name fields are appropriately capitalized
  Object.keys(cleanPayload).forEach(key => {
    if (cleanPayload[key] === '') {
      cleanPayload[key] = null;
    } else if (
      table !== 'companies' &&
      typeof cleanPayload[key] === 'string' &&
      ['gstin', 'hsn', 'hsn_sac', 'sac', 'pan', 'ifsc', 'sku', 'name', 'customer_name', 'vendor_name', 'item_name', 'party_name', 'company_name', 'account_name'].includes(key.toLowerCase())
    ) {
      cleanPayload[key] = cleanPayload[key].toUpperCase();
    } else if (
      table === 'companies' &&
      typeof cleanPayload[key] === 'string' &&
      ['gstin', 'pan', 'ifsc', 'ifsc_code'].includes(key.toLowerCase())
    ) {
      cleanPayload[key] = cleanPayload[key].toUpperCase();
    }
  });

  if (table !== 'companies' && table !== 'profiles') {
    cleanPayload.company_id = cid;
  }

  const ghostColumns = [
    'type',
    'gst_type',
    'transaction_type', 
    'user_id', 
    'items_raw', 
    'displayDate'
  ];
  
  ghostColumns.forEach(col => delete cleanPayload[col]);

  const operation = id
    ? supabase.from(table).update(cleanPayload).eq('id', id).select()
    : supabase.from(table).insert([cleanPayload]).select();

  const res = await operation;
  if (res.error) throw res.error;
  return res;
};

import { matchesStockItem } from './entitySync';

export const normalizeBill = (data: any) => {
  if (!data) return null;
  let isSale = false;
  if (data.type === 'Sale') {
    isSale = true;
  } else if (data.type === 'Purchase') {
    isSale = false;
  } else {
    isSale = !!(data.customer_name || data.invoice_number || data.challan_number) && !(data.vendor_name || data.bill_number);
  }
  const partyName = isSale ? (data.customer_name ?? data.vendor_name ?? '') : (data.vendor_name ?? data.customer_name ?? '');
  const docNumber = data.challan_number || data.invoice_number || data.bill_number || '';
  const partyId = data.party_id || data.partyId || data.customer_id || data.vendor_id || null;
  const itemsRaw = data.items || {};
  let line_items = [];
  let gstType = 'Intra-State';

  if (Array.isArray(itemsRaw)) {
    line_items = itemsRaw.map((it: any) => ({
      ...it,
      stock_item_id: it.stock_item_id || it.stockItemId || it.item_id || it.itemId || null,
      stockItemId: it.stock_item_id || it.stockItemId || it.item_id || it.itemId || null
    }));
  } else if (typeof itemsRaw === 'object') {
    line_items = (itemsRaw.line_items || []).map((it: any) => ({
      ...it,
      stock_item_id: it.stock_item_id || it.stockItemId || it.item_id || it.itemId || null,
      stockItemId: it.stock_item_id || it.stockItemId || it.item_id || it.itemId || null
    }));
    gstType = itemsRaw.gst_type || 'Intra-State'; 
  }

  return {
    ...data,
    party_id: partyId,
    partyId: partyId,
    type: isSale ? 'Sale' : 'Purchase',
    vendor_name: data.vendor_name !== undefined ? data.vendor_name : partyName, 
    customer_name: data.customer_name !== undefined ? data.customer_name : partyName, 
    bill_number: data.bill_number !== undefined ? data.bill_number : docNumber, 
    invoice_number: data.invoice_number !== undefined ? data.invoice_number : docNumber,
    challan_number: data.challan_number !== undefined ? data.challan_number : docNumber,
    gst_type: gstType,
    items: line_items,
    items_raw: itemsRaw                  
  };
};

export const getSelectedLedgerIds = () => {
  const cid = getActiveCompanyId();
  if (!cid) return [];
  try { return JSON.parse(localStorage.getItem(`selectedLedgers_${cid}`) || '[]'); } catch { return []; }
};

export const READONLY_LEDGERS = [
  { id: 'ro_cgst_2_5', name: 'CGST @2.5', type: 'Charge', calc_method: 'Percentage', rate: 2.5, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_cgst_6', name: 'CGST @6', type: 'Charge', calc_method: 'Percentage', rate: 6, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_cgst_9', name: 'CGST @9', type: 'Charge', calc_method: 'Percentage', rate: 9, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_cgst_14', name: 'CGST @14', type: 'Charge', calc_method: 'Percentage', rate: 14, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },

  { id: 'ro_sgst_2_5', name: 'SGST @2.5', type: 'Charge', calc_method: 'Percentage', rate: 2.5, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_sgst_6', name: 'SGST @6', type: 'Charge', calc_method: 'Percentage', rate: 6, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_sgst_9', name: 'SGST @9', type: 'Charge', calc_method: 'Percentage', rate: 9, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_sgst_14', name: 'SGST @14', type: 'Charge', calc_method: 'Percentage', rate: 14, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },

  { id: 'ro_igst_5', name: 'IGST @5', type: 'Charge', calc_method: 'Percentage', rate: 5, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_igst_12', name: 'IGST @12', type: 'Charge', calc_method: 'Percentage', rate: 12, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_igst_18', name: 'IGST @18', type: 'Charge', calc_method: 'Percentage', rate: 18, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true },
  { id: 'ro_igst_28', name: 'IGST @28', type: 'Charge', calc_method: 'Percentage', rate: 28, fixed_amount: 0, apply_on: 'Subtotal', is_default: false, is_readonly: true }
];

export const toggleSelectedLedgerId = (ledgerId: string) => {
  const cid = getActiveCompanyId();
  if (!cid) return [];
  const current = getSelectedLedgerIds();
  const next = current.includes(ledgerId) ? current.filter((id: string) => id !== ledgerId) : [...current, ledgerId];
  localStorage.setItem(`selectedLedgers_${cid}`, JSON.stringify(next));
  return next;
};

export const fetchStockItemsWithBalance = async (company_id: string) => {
  if (!company_id) return [];
  try {
    const [{ data: stockItems }, { data: purchaseData }, { data: saleData }] = await Promise.all([
      supabase.from('stock_items').select('*').eq('company_id', company_id).eq('is_deleted', false).order('name', { ascending: true }),
      supabase.from('purchase_bills').select('*').eq('company_id', company_id).eq('is_deleted', false),
      supabase.from('sales_invoices').select('*').eq('company_id', company_id).eq('is_deleted', false)
    ]);

    if (!stockItems || stockItems.length === 0) return [];

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

    return stockItems.map((item: any) => {
      let inward = 0;
      let outward = 0;

      normalizedVouchers.forEach((v: any) => {
        v.items?.forEach((it: any) => {
          if (matchesStockItem(it, item)) {
            const q = Number(it.qty || 0);
            if (v.type === 'Purchase') inward += q;
            else outward += q;
          }
        });
      });

      const netStock = (Number(item.in_stock) || 0) + inward - outward;
      return {
        ...item,
        in_stock: netStock
      };
    });
  } catch (err) {
    console.error('Error fetching stock items with balance:', err);
    const { data: stockItems } = await supabase.from('stock_items').select('*').eq('company_id', company_id).eq('is_deleted', false).order('name', { ascending: true });
    return stockItems || [];
  }
};

export const ensureStockItems = async (items: any[], company_id: string) => {
  if (!items || !Array.isArray(items)) return;
  const { data: allStock } = await supabase.from('stock_items').select('*').eq('company_id', company_id).eq('is_deleted', false);
  
  for (const item of items) {
    const itemName = (item.itemName || item.name || '').trim().toUpperCase();
    const stockId = item.stock_item_id || item.stockItemId || item.id;
    if (!itemName && !stockId) continue;

    // 1. Match by permanent ID first
    let existing = (allStock || []).find((s: any) => stockId && String(s.id) === String(stockId));
    // 2. Match by current name or previous_names
    if (!existing && itemName) {
      existing = (allStock || []).find((s: any) => {
        if ((s.name || '').trim().toUpperCase() === itemName) return true;
        const aliases: string[] = Array.isArray(s.previous_names) ? s.previous_names : [];
        return aliases.some(a => (a || '').trim().toUpperCase() === itemName);
      });
    }

    const payload: any = {
      name: existing?.name || itemName,
      hsn: (item.hsnCode || existing?.hsn || '').toUpperCase(),
      rate: Number(item.rate) || existing?.rate || 0,
      tax_rate: Number(item.tax_rate) !== undefined ? Number(item.tax_rate) : (existing?.tax_rate || 0),
      unit: item.unit || existing?.unit || 'PCS',
      company_id,
      is_deleted: false
    };

    if (existing) {
      await supabase.from('stock_items').update(payload).eq('id', existing.id);
    } else if (itemName) {
      await supabase.from('stock_items').insert([{ ...payload, in_stock: 0, previous_names: [] }]);
    }
  }
};

export const ensureParty = async (name: string, type: 'customer' | 'vendor', company_id: string, partyId?: string) => {
  if ((!name || !name.trim()) && !partyId) return null;
  const nameTrim = name ? name.trim().toUpperCase() : '';

  // 1. Fetch all active parties in vendors table for this company
  const { data: allVendors } = await supabase
    .from('vendors')
    .select('*')
    .eq('company_id', company_id)
    .eq('is_deleted', false);

  // 1a. Match by permanent ID first
  let existingVendor = (allVendors || []).find((v: any) => partyId && String(v.id) === String(partyId));

  // 1b. Match by current name
  if (!existingVendor && nameTrim) {
    existingVendor = (allVendors || []).find((v: any) => (v.name || '').trim().toUpperCase() === nameTrim);
  }

  // 1c. Match by previous_names (aliases) - CRITICAL: never recreate a renamed party!
  if (!existingVendor && nameTrim) {
    existingVendor = (allVendors || []).find((v: any) => {
      const aliases: string[] = Array.isArray(v.previous_names) ? v.previous_names : [];
      return aliases.some(a => (a || '').trim().toUpperCase() === nameTrim);
    });
  }

  if (existingVendor) {
    const pType = (existingVendor.party_type || '').toLowerCase();
    if (type === 'customer' && pType === 'vendor') {
      await supabase.from('vendors').update({ party_type: 'both', is_customer: true }).eq('id', existingVendor.id);
    } else if (type === 'vendor' && pType === 'customer') {
      await supabase.from('vendors').update({ party_type: 'both' }).eq('id', existingVendor.id);
    }
    return existingVendor;
  }

  // 2. Search legacy 'customers' table if any
  if (nameTrim) {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', company_id)
      .eq('is_deleted', false)
      .ilike('name', nameTrim)
      .maybeSingle();

    if (existingCustomer) {
      const newType = type === 'vendor' ? 'both' : (existingCustomer.party_type || 'customer');
      const res = await safeSupabaseSave('vendors', {
        ...existingCustomer,
        party_type: newType,
        is_customer: true
      });
      return (res?.data && res.data[0]) ? res.data[0] : existingCustomer;
    }
  }

  // 3. Not found, save as new party in 'vendors'
  if (!nameTrim) return null;
  const payload = {
    name: nameTrim,
    party_type: type,
    is_customer: type === 'customer',
    company_id,
    is_deleted: false,
    balance: 0,
    previous_names: []
  };
  const res = await safeSupabaseSave('vendors', payload);
  return (res?.data && res.data[0]) ? res.data[0] : null;
};

export const syncTransactionToCashbook = async (transaction: any) => {
  const bill = normalizeBill(transaction);
  if (!bill) return;
  const { company_id, date, vendor_name, bill_number, grand_total, type, status } = bill;
  if (status !== 'Paid') return;
  try {
    const { data: existing } = await supabase.from('cashbooks').select('*').eq('company_id', company_id).eq('date', date).eq('is_deleted', false).maybeSingle();
    const isSale = type === 'Sale';
    
    // Check if it's a payment voucher
    const isPaymentVoucher = bill.items_raw?.is_payment_voucher === true;
    let amount = Number(grand_total) || 0;
    
    if (isPaymentVoucher) {
      const pDetails = bill.items_raw?.payment_details;
      const payments = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
      amount = payments.reduce((acc: number, p: any) => acc + (Number(p.payment_amount) || 0), 0);
    }
    
    const entryLabel = isPaymentVoucher
      ? `${isSale ? 'Receipt' : 'Payment'} - Voucher ${bill_number} - Account: ${bill.items_raw?.payment_details?.[0]?.payment_method || 'Cash'} - ${vendor_name}`
      : `${isSale ? 'Sales' : 'Purchase'} - Bill ${bill_number} - ${vendor_name}`;
      
    let incomeRows = []; let expenseRows = []; let cashbookId = null;
    if (existing) {
      cashbookId = existing.id;
      const raw = existing.raw_data || {};
      incomeRows = Array.isArray(raw.incomeRows) ? raw.incomeRows : [];
      expenseRows = Array.isArray(raw.expenseRows) ? raw.expenseRows : [];
      
      const alreadyIn = [...incomeRows, ...expenseRows].some(r => r.particulars?.includes(isPaymentVoucher ? `Voucher ${bill_number}` : `Bill ${bill_number}`));
      if (alreadyIn) return;
    }
    const newRow = { id: Math.random().toString(36).substr(2, 9), particulars: entryLabel, amount: amount.toString() };
    if (isSale) incomeRows.push(newRow); else expenseRows.push(newRow);
    const payload = {
      company_id, date,
      income_total: incomeRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
      expense_total: expenseRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
      balance: incomeRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0) - expenseRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
      raw_data: { incomeRows, expenseRows, date },
      is_deleted: false
    };
    if (cashbookId) await supabase.from('cashbooks').update(payload).eq('id', cashbookId);
    else await supabase.from('cashbooks').insert([payload]);
  } catch (err) { console.error("Cashbook Sync Error:", err); }
};

export const unsyncTransactionFromCashbook = async (transaction: any) => {
  const bill = normalizeBill(transaction);
  if (!bill) return;
  const { company_id, date, bill_number } = bill;
  try {
    const { data: existing } = await supabase.from('cashbooks').select('*').eq('company_id', company_id).eq('date', date).eq('is_deleted', false).maybeSingle();
    if (!existing) return;

    const isPaymentVoucher = bill.items_raw?.is_payment_voucher === true;
    const termToMatch = isPaymentVoucher ? `Voucher ${bill_number}` : `Bill ${bill_number}`;

    const raw = existing.raw_data || {};
    let incomeRows = Array.isArray(raw.incomeRows) ? raw.incomeRows : [];
    let expenseRows = Array.isArray(raw.expenseRows) ? raw.expenseRows : [];

    incomeRows = incomeRows.filter((r: any) => !r.particulars?.includes(termToMatch));
    expenseRows = expenseRows.filter((r: any) => !r.particulars?.includes(termToMatch));

    if (incomeRows.length === 0 && expenseRows.length === 0) {
      await supabase.from('cashbooks').update({ is_deleted: true }).eq('id', existing.id);
    } else {
      const payload = {
        income_total: incomeRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
        expense_total: expenseRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
        balance: incomeRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0) - expenseRows.reduce((acc: number, r: any) => acc + (Number(r.amount) || 0), 0),
        raw_data: { incomeRows, expenseRows, date }
      };
      await supabase.from('cashbooks').update(payload).eq('id', existing.id);
    }
  } catch (err) {
    console.error("Cashbook Unsync Error:", err);
  }
};
