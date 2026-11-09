import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Printer, Truck, Calendar, User, FileText, AlertTriangle, Package, ShoppingCart } from 'lucide-react';
import { supabase, getAuthUser } from '../lib/supabase';
import { getActiveCompanyId, safeSupabaseSave, ensureParty, ensureStockItems, normalizeBill, fetchStockItemsWithBalance } from '../utils/helpers';
import Modal from './Modal';
import StockForm from './StockForm';
import BillForm from './BillForm';
import ItemSelectDropdown from './ItemSelectDropdown';
import { recordActivity } from '../utils/activityTracker';
import FormActionButtons from './FormActionButtons';
import { toast } from '../utils/toast';

interface DeliveryChallanFormProps {
  initialData?: any;
  onSubmit: (challan: any, shouldPrint: boolean, isSaveAndNew: boolean) => void;
  onCancel: () => void;
}

export const DeliveryChallanForm: React.FC<DeliveryChallanFormProps> = ({
  initialData,
  onSubmit,
  onCancel
}) => {
  const cid = getActiveCompanyId();

  const [date, setDate] = useState<string>(
    initialData?.date || new Date().toISOString().split('T')[0]
  );
  const [challanNumber, setChallanNumber] = useState<string>(
    initialData?.invoice_number || initialData?.bill_number || ''
  );
  const [partyName, setPartyName] = useState<string>(
    initialData?.customer_name || initialData?.vendor_name || ''
  );
  const [vehicleNo, setVehicleNo] = useState<string>(
    initialData?.items_raw?.vehicle_no || ''
  );
  const [driverName, setDriverName] = useState<string>(
    initialData?.items_raw?.driver_name || ''
  );
  const [ewayBillNo, setEwayBillNo] = useState<string>(
    initialData?.items_raw?.eway_bill_no || ''
  );
  const [dispatchDestination, setDispatchDestination] = useState<string>(
    initialData?.items_raw?.dispatch_destination || ''
  );
  const [notes, setNotes] = useState<string>(
    initialData?.description || ''
  );

  const [parties, setParties] = useState<any[]>([]);
  const [stockItemsList, setStockItemsList] = useState<any[]>([]);
  const [existingChallans, setExistingChallans] = useState<{ id: string; number: string }[]>([]);
  const [challanNoDuplicateError, setChallanNoDuplicateError] = useState<string | null>(null);
  const [loadingParties, setLoadingParties] = useState(false);
  const [loadingChallanNo, setLoadingChallanNo] = useState(false);
  const [saving, setSaving] = useState(false);

  const [itemModal, setItemModal] = useState<{ isOpen: boolean; rowIdx: number | null }>({
    isOpen: false,
    rowIdx: null
  });

  const [stockWarningModal, setStockWarningModal] = useState<{
    isOpen: boolean;
    items: {
      itemName: string;
      stockItemId?: string;
      sku?: string;
      hsn: string;
      unit: string;
      rate: number;
      tax_rate: number;
      requiredQty: number;
      availableStock: number;
      shortageQty: number;
    }[];
  }>({
    isOpen: false,
    items: []
  });

  const [stockAdjustmentModal, setStockAdjustmentModal] = useState<{
    isOpen: boolean;
    item: any;
  }>({
    isOpen: false,
    item: null
  });

  const [purchaseDraftModal, setPurchaseDraftModal] = useState<{
    isOpen: boolean;
    initialData: any;
  }>({
    isOpen: false,
    initialData: null
  });

  const [lineItems, setLineItems] = useState<any[]>(() => {
    if (initialData?.items && Array.isArray(initialData.items) && initialData.items.length > 0) {
      return initialData.items.map((item: any) => ({
        id: item.id || Math.random().toString(),
        item_name: item.item_name || item.description || '',
        hsn: item.hsn || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'PCS',
        rate: item.rate || item.price || 0,
        tax_rate: item.tax_rate || 0,
        amount: item.amount || (Number(item.quantity || 1) * Number(item.rate || 0))
      }));
    }
    return [
      { id: '1', item_name: '', hsn: '', quantity: 1, unit: 'PCS', rate: 0, tax_rate: 0, amount: 0 }
    ];
  });

  // Load parties, stock items, and existing delivery challan numbers
  useEffect(() => {
    if (!cid) return;

    const loadRefData = async () => {
      setLoadingParties(true);
      try {
        const [{ data: custs }, { data: vends }, stockData, { data: dcDocs }, { data: salesDocs }] = await Promise.all([
          supabase.from('customers').select('*').eq('company_id', cid).eq('is_deleted', false),
          supabase.from('vendors').select('*').eq('company_id', cid).eq('is_deleted', false),
          fetchStockItemsWithBalance(cid),
          supabase.from('delivery_challans').select('id, challan_number, invoice_number').eq('company_id', cid).eq('is_deleted', false),
          supabase.from('sales_invoices').select('id, invoice_number').eq('company_id', cid).eq('is_deleted', false)
        ]);

        const pMap = new Map();
        (custs || []).forEach((c: any) => pMap.set(c.name?.trim().toUpperCase() || c.id, c));
        (vends || []).forEach((v: any) => pMap.set(v.name?.trim().toUpperCase() || v.id, v));

        setParties(Array.from(pMap.values()));
        setStockItemsList(stockData || []);

        const existingList: { id: string; number: string }[] = [];
        (dcDocs || []).forEach((doc: any) => {
          const num = (doc.challan_number || doc.invoice_number || '').trim();
          if (num) existingList.push({ id: doc.id, number: num });
        });
        (salesDocs || []).forEach((doc: any) => {
          const num = (doc.invoice_number || '').trim();
          if (num && !existingList.some(item => item.id === doc.id)) {
            existingList.push({ id: doc.id, number: num });
          }
        });

        setExistingChallans(existingList);
      } catch (err) {
        console.error('Error loading ref data:', err);
      } finally {
        setLoadingParties(false);
      }
    };

    loadRefData();
  }, [cid]);

  // Check for duplicate challan number
  const checkDuplicateChallanNo = (num: string, list = existingChallans) => {
    const trimmed = num.trim().toLowerCase();
    if (!trimmed) {
      setChallanNoDuplicateError(null);
      return false;
    }

    const isDup = list.some(
      item => item.number.toLowerCase() === trimmed && item.id !== initialData?.id
    );

    if (isDup) {
      const msg = `Challan number '${num.trim()}' already exists in database`;
      setChallanNoDuplicateError(msg);
      return true;
    } else {
      setChallanNoDuplicateError(null);
      return false;
    }
  };

  const handleChallanNumberChange = (val: string) => {
    setChallanNumber(val);
    checkDuplicateChallanNo(val, existingChallans);
  };

  useEffect(() => {
    if (challanNumber) {
      checkDuplicateChallanNo(challanNumber, existingChallans);
    }
  }, [challanNumber, existingChallans]);

  // Generate Challan Number if creating new
  useEffect(() => {
    if (initialData || !cid) return;

    const generateNumber = async () => {
      setLoadingChallanNo(true);
      try {
        const [{ data: dcData }, { data: salesData }] = await Promise.all([
          supabase.from('delivery_challans').select('challan_number, invoice_number').eq('company_id', cid).eq('is_deleted', false),
          supabase.from('sales_invoices').select('invoice_number').eq('company_id', cid).eq('is_deleted', false)
        ]);

        let maxSeq = 0;
        const checkSeq = (no?: string) => {
          if (no && no.startsWith('DC-')) {
            const numPart = no.substring(3);
            if (/^\d+$/.test(numPart)) {
              const parsed = parseInt(numPart, 10);
              if (!isNaN(parsed) && parsed > maxSeq) {
                maxSeq = parsed;
              }
            }
          }
        };

        (dcData || []).forEach((inv: any) => checkSeq(inv.challan_number || inv.invoice_number));
        (salesData || []).forEach((inv: any) => checkSeq(inv.invoice_number));

        const generatedNo = `DC-${(maxSeq + 1).toString().padStart(3, '0')}`;
        setChallanNumber(generatedNo);
      } catch (err) {
        console.error('Error generating DC number:', err);
        setChallanNumber('DC-001');
      } finally {
        setLoadingChallanNo(false);
      }
    };

    generateNumber();
  }, [cid, initialData]);

  const selectStockItemForDCRow = (index: number, selected: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      const row = { ...updated[index] };

      if (selected) {
        row.item_name = selected.name || '';
        row.hsn = selected.hsn || '';
        row.unit = selected.unit || 'PCS';
        row.rate = selected.selling_price !== undefined && selected.selling_price !== null && selected.selling_price !== ''
          ? Number(selected.selling_price)
          : Number(selected.rate || 0);
        row.tax_rate = selected.tax_rate || 0;
      } else {
        row.item_name = '';
      }

      const qty = parseFloat(row.quantity) || 0;
      const rate = parseFloat(row.rate) || 0;
      row.amount = qty * rate;

      updated[index] = row;
      return updated;
    });
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
      setStockItemsList(stockData || []);

      if (itemModal.rowIdx !== null && itemModal.rowIdx >= 0) {
        selectStockItemForDCRow(itemModal.rowIdx, insertedItem);
      }

      setItemModal({ isOpen: false, rowIdx: null });
      toast.success("Stock item created successfully.");
    } catch (err: any) {
      toast.error("Error creating stock item: " + (err.message || 'Unknown error'));
    }
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      if (field === 'item_name') {
        const found = stockItemsList.find(
          s => s.name?.toLowerCase() === String(value).toLowerCase()
        );
        if (found) {
          row.hsn = found.hsn || '';
          row.unit = found.unit || 'PCS';
          row.rate = found.selling_price || found.rate || 0;
          row.tax_rate = found.tax_rate || 0;
        }
      }

      const qty = parseFloat(row.quantity) || 0;
      const rate = parseFloat(row.rate) || 0;
      row.amount = qty * rate;

      updated[index] = row;
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { id: Math.random().toString(), item_name: '', hsn: '', quantity: 1, unit: 'PCS', rate: 0, tax_rate: 0, amount: 0 }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const totalGst = 0;
  const grandTotal = subtotal;

  const handleSave = async (shouldPrint: boolean = false, isSaveAndNew: boolean = false) => {
    if (!cid) {
      toast.error('Workspace company not loaded.');
      return;
    }
    if (!partyName.trim()) {
      toast.warning('Please select or enter a Customer/Party Name.');
      return;
    }
    if (!challanNumber.trim()) {
      toast.warning('Please enter a Delivery Challan Number.');
      return;
    }

    if (checkDuplicateChallanNo(challanNumber, existingChallans)) {
      toast.warning(`Delivery Challan number '${challanNumber.trim()}' already exists. Please enter a unique challan number.`);
      return;
    }

    const validItems = lineItems.filter(item => item.item_name.trim() !== '');
    if (validItems.length === 0) {
      toast.warning('Please add at least one stock item.');
      return;
    }

    setSaving(true);
    try {
      // 1. Fetch latest stock balances
      const latestStockList = await fetchStockItemsWithBalance(cid);
      setStockItemsList(latestStockList || []);

      // 2. Validate stock for each selected line item
      const requestedQtyMap = new Map<string, { name: string; qty: number; hsn: string; unit: string; rate: number; tax_rate: number }>();
      validItems.forEach(item => {
        const rawName = (item.item_name || '').trim();
        if (rawName) {
          const key = rawName.toUpperCase();
          const qty = Number(item.quantity) || 0;
          if (requestedQtyMap.has(key)) {
            const existing = requestedQtyMap.get(key)!;
            existing.qty += qty;
          } else {
            requestedQtyMap.set(key, {
              name: rawName,
              qty: qty,
              hsn: item.hsn || '',
              unit: item.unit || 'PCS',
              rate: Number(item.rate) || 0,
              tax_rate: Number(item.tax_rate) || 0
            });
          }
        }
      });

      const shortageList: {
        itemName: string;
        stockItemId?: string;
        sku?: string;
        hsn: string;
        unit: string;
        rate: number;
        tax_rate: number;
        requiredQty: number;
        availableStock: number;
        shortageQty: number;
      }[] = [];

      requestedQtyMap.forEach((reqObj, key) => {
        const matchedStock = (latestStockList || []).find(
          (s: any) => (s.name || '').trim().toUpperCase() === key
        );
        const available = Math.max(0, Number(matchedStock?.in_stock || 0));
        if (reqObj.qty > available) {
          shortageList.push({
            itemName: matchedStock?.name || reqObj.name,
            stockItemId: matchedStock?.id,
            sku: matchedStock?.sku || '',
            hsn: matchedStock?.hsn || reqObj.hsn,
            unit: matchedStock?.unit || reqObj.unit,
            rate: matchedStock?.rate || reqObj.rate,
            tax_rate: matchedStock?.tax_rate || reqObj.tax_rate,
            requiredQty: reqObj.qty,
            availableStock: available,
            shortageQty: reqObj.qty - available
          });
        }
      });

      if (shortageList.length > 0) {
        setSaving(false);
        setStockWarningModal({
          isOpen: true,
          items: shortageList
        });
        return;
      }

      // Auto register party & stock items
      await ensureParty(partyName, 'customer', cid);
      await ensureStockItems(validItems, cid);

      const itemsPayload = {
        is_delivery_challan: true,
        vehicle_no: vehicleNo.trim(),
        driver_name: driverName.trim(),
        eway_bill_no: ewayBillNo.trim(),
        dispatch_destination: dispatchDestination.trim(),
        line_items: validItems.map(i => ({
          item_name: i.item_name,
          hsn: i.hsn,
          quantity: Number(i.quantity) || 0,
          unit: i.unit,
          rate: Number(i.rate) || 0,
          tax_rate: 0,
          amount: Number(i.amount) || 0
        }))
      };

      const payload = {
        company_id: cid,
        customer_name: partyName.trim(),
        challan_number: challanNumber.trim(),
        invoice_number: challanNumber.trim(),
        date: date,
        total_goods_value: grandTotal,
        total_without_gst: subtotal,
        total_gst: totalGst,
        grand_total: grandTotal,
        status: 'Dispatched',
        is_deleted: false,
        description: notes.trim(),
        items: itemsPayload
      };

      let savedRes;
      try {
        savedRes = await safeSupabaseSave('delivery_challans', payload, initialData?.id);
      } catch (dcErr: any) {
        console.warn('Saving to delivery_challans failed, falling back to sales_invoices:', dcErr);
        savedRes = await safeSupabaseSave('sales_invoices', payload, initialData?.id);
      }

      const savedData = savedRes?.data?.[0] || { ...payload, id: initialData?.id || 'new-dc' };
      const normalized = normalizeBill(savedData);

      onSubmit(normalized, shouldPrint, isSaveAndNew);
      toast.success(initialData ? "Delivery Challan updated successfully." : "Delivery Challan created successfully.");
    } catch (err: any) {
      console.error('Error saving delivery challan:', err);
      toast.error(`Save failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenStockAdjustment = () => {
    const shortageItems = stockWarningModal.items;
    if (shortageItems.length === 0) return;
    const firstItem = shortageItems[0];
    setStockWarningModal({ isOpen: false, items: [] });

    const matchedStockItem = stockItemsList.find(
      s => s.name?.trim().toUpperCase() === firstItem.itemName?.trim().toUpperCase()
    );

    setStockAdjustmentModal({
      isOpen: true,
      item: matchedStockItem || {
        id: firstItem.stockItemId,
        name: firstItem.itemName,
        sku: firstItem.sku || '',
        unit: firstItem.unit || 'PCS',
        hsn: firstItem.hsn || '',
        rate: firstItem.rate || 0,
        in_stock: firstItem.availableStock || 0
      }
    });
  };

  const handleOpenPurchaseDraft = async () => {
    const shortageItems = stockWarningModal.items;
    if (shortageItems.length === 0) return;
    setStockWarningModal({ isOpen: false, items: [] });

    let suggestedVendor = '';
    try {
      const { data: pastPurchases } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false)
        .order('date', { ascending: false });

      const shortageNames = shortageItems.map(s => s.itemName.trim().toUpperCase());
      if (pastPurchases) {
        for (const pb of pastPurchases) {
          const norm = normalizeBill(pb);
          if (norm?.vendor_name && norm.vendor_name.trim() !== '' && norm.vendor_name !== 'Unknown' && norm.items?.some((it: any) => shortageNames.includes(it.itemName?.trim().toUpperCase()))) {
            suggestedVendor = norm.vendor_name;
            break;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching supplier history:', e);
    }

    const draftItems = shortageItems.map((s, idx) => ({
      id: (idx + 1).toString(),
      itemName: s.itemName,
      hsnCode: s.hsn || '',
      qty: s.shortageQty,
      unit: s.unit || 'PCS',
      rate: s.rate || 0,
      tax_rate: s.tax_rate || 0,
      taxableAmount: s.shortageQty * (s.rate || 0),
      itemTotal: s.shortageQty * (s.rate || 0)
    }));

    setPurchaseDraftModal({
      isOpen: true,
      initialData: {
        type: 'Purchase',
        vendor_name: suggestedVendor,
        bill_number: '',
        date: new Date().toISOString().split('T')[0],
        items: draftItems
      }
    });
  };

  const handleStockAdjustmentSaved = async (storageData: any) => {
    try {
      await safeSupabaseSave('stock_items', {
        ...storageData,
        company_id: cid,
        is_deleted: false
      }, stockAdjustmentModal.item?.id);

      const updatedStockList = await fetchStockItemsWithBalance(cid);
      setStockItemsList(updatedStockList || []);
      setStockAdjustmentModal({ isOpen: false, item: null });
      toast.success("Stock adjustment saved successfully.");
      window.dispatchEvent(new Event('appSettingsChanged'));
    } catch (err: any) {
      toast.error("Error saving stock item: " + (err.message || 'Unknown error'));
    }
  };

  const handlePurchaseBillSaved = async () => {
    const updatedStockList = await fetchStockItemsWithBalance(cid);
    setStockItemsList(updatedStockList || []);
    setPurchaseDraftModal({ isOpen: false, initialData: null });
    window.dispatchEvent(new Event('appSettingsChanged'));
  };

  return (
    <div className="space-y-6 p-5">
      {/* Basic Info Fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md border border-slate-200/80 dark:border-slate-800">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Customer / Party Name *
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              list="dc-parties-list"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="Select or enter party name"
              className="w-full h-10 pl-9 pr-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
            <datalist id="dc-parties-list">
              {parties.map(p => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Challan Number *
          </label>
          <div className="relative">
            <FileText className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${challanNoDuplicateError ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`} />
            <input
              type="text"
              value={challanNumber}
              onChange={(e) => handleChallanNumberChange(e.target.value)}
              placeholder={loadingChallanNo ? 'Generating...' : 'e.g. DC-001'}
              className={`w-full h-10 pl-9 pr-3 bg-white dark:bg-slate-800 rounded-md text-xs font-mono font-medium text-slate-900 dark:text-white focus:outline-none transition-all ${
                challanNoDuplicateError
                  ? 'border-2 border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-200 font-bold'
                  : 'border border-slate-200 dark:border-slate-700 focus:border-slate-300 dark:focus:border-slate-600'
              }`}
            />
          </div>
          {challanNoDuplicateError && (
            <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center space-x-1">
              <span>{challanNoDuplicateError}</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Challan Date *
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 pl-9 pr-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Transport & Vehicle Details */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-md border border-slate-200/80 dark:border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-2">
          <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Dispatch & Transport Details</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Vehicle Number
            </label>
            <input
              type="text"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="e.g. MH-12-AB-1234"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Driver Name / Phone
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="e.g. Ramesh / 9876543210"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              E-Way Bill No.
            </label>
            <input
              type="text"
              value={ewayBillNo}
              onChange={(e) => setEwayBillNo(e.target.value)}
              placeholder="e.g. 123456789012"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Destination Location
            </label>
            <input
              type="text"
              value={dispatchDestination}
              onChange={(e) => setDispatchDestination(e.target.value)}
              placeholder="e.g. Warehouse 3, Pune"
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Dispatched Stock Items Table */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-900">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Dispatched Items & Quantities
          </span>
          <button
            type="button"
            onClick={addLineItem}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium flex items-center space-x-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Item</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold">
                <th className="p-2.5 w-10 text-center">#</th>
                <th className="p-2.5 min-w-[220px]">Item Name</th>
                <th className="p-2.5 w-24">HSN</th>
                <th className="p-2.5 w-24 text-right">Qty</th>
                <th className="p-2.5 w-20">Unit</th>
                <th className="p-2.5 w-28 text-right">Rate (₹)</th>
                <th className="p-2.5 w-28 text-right">Amount (₹)</th>
                <th className="p-2.5 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lineItems.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                  <td className="p-0 border-r border-slate-100 dark:border-slate-800 min-w-[220px]">
                    <ItemSelectDropdown
                      value={item.item_name}
                      stockItems={stockItemsList}
                      onSelect={(selectedItem) => selectStockItemForDCRow(idx, selectedItem)}
                      onAddNewItem={() => setItemModal({ isOpen: true, rowIdx: idx })}
                      placeholder="Select Item"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={item.hsn}
                      onChange={(e) => handleLineChange(idx, 'hsn', e.target.value)}
                      placeholder="HSN"
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                      placeholder="PCS"
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.rate}
                      onChange={(e) => handleLineChange(idx, 'rate', e.target.value)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </td>
                  <td className="p-2.5 text-right font-mono font-medium text-slate-900 dark:text-white">
                    {(Number(item.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      disabled={lineItems.length === 1}
                      className="p-1 text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary & Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Dispatch Notes / Terms
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Goods delivered in good condition. Subject to verification at destination."
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600"
          />
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-md border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white">
            <span>Total Goods Value</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <FormActionButtons
        primaryText={initialData ? 'Update & Print' : 'Save & Print'}
        primaryType="button"
        primaryOnClick={() => handleSave(true, false)}
        primaryDisabled={saving}
        primaryLoading={saving}

        secondaryLeftText="Save & New"
        secondaryLeftType="button"
        secondaryLeftOnClick={() => handleSave(false, true)}
        secondaryLeftDisabled={saving}

        secondaryRightText={initialData ? 'Update Challan' : 'Save Challan'}
        secondaryRightType="button"
        secondaryRightOnClick={() => handleSave(false, false)}
        secondaryRightDisabled={saving}

        discardText="Discard"
        discardOnClick={onCancel}
        discardDisabled={saving}
      />

      {/* Stock Item Modal */}
      {itemModal.isOpen && (
        <Modal
          isOpen={itemModal.isOpen}
          onClose={() => setItemModal({ isOpen: false, rowIdx: null })}
          title="Add New Stock Item"
        >
          <StockForm
            onSubmit={handleSaveNewStockItem}
            onCancel={() => setItemModal({ isOpen: false, rowIdx: null })}
          />
        </Modal>
      )}

      {/* Stock Warning Modal */}
      {stockWarningModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setStockWarningModal({ isOpen: false, items: [] })}
          title="Stock Not Available"
          maxWidth="max-w-xl"
        >
          <div className="p-6 space-y-6">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-lg flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Stock Not Available</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  The following items do not have enough stock to complete this Delivery Challan.
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {stockWarningModal.items.map((item, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-lg space-y-2">
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span className="text-amber-500">•</span>
                    <span>{item.itemName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200/80 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-sans uppercase tracking-wider">Required</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{item.requiredQty} {item.unit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-sans uppercase tracking-wider">Available</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{item.availableStock} {item.unit}</span>
                    </div>
                    <div>
                      <span className="text-rose-500 block text-[10px] font-sans uppercase tracking-wider font-semibold">Shortage</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">{item.shortageQty} {item.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStockWarningModal({ isOpen: false, items: [] })}
                className="w-full sm:w-auto px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenStockAdjustment}
                className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md transition-colors shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Package className="w-4 h-4" />
                <span>Add Stock</span>
              </button>
              <button
                type="button"
                onClick={handleOpenPurchaseDraft}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Purchase New Qty</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Stock Adjustment Modal */}
      {stockAdjustmentModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setStockAdjustmentModal({ isOpen: false, item: null })}
          title="Stock Adjustment / Opening Stock"
          maxWidth="max-w-5xl"
        >
          <StockForm
            initialData={stockAdjustmentModal.item}
            focusStockField={true}
            onSubmit={handleStockAdjustmentSaved}
            onCancel={() => setStockAdjustmentModal({ isOpen: false, item: null })}
          />
        </Modal>
      )}

      {/* Purchase Bill Draft Modal */}
      {purchaseDraftModal.isOpen && (
        <Modal
          isOpen={true}
          onClose={() => setPurchaseDraftModal({ isOpen: false, initialData: null })}
          title="Create Purchase Bill for Stock Shortage"
          maxWidth="max-w-5xl"
        >
          <BillForm
            initialData={purchaseDraftModal.initialData}
            focusQtyField={true}
            onSubmit={handlePurchaseBillSaved}
            onCancel={() => setPurchaseDraftModal({ isOpen: false, initialData: null })}
          />
        </Modal>
      )}
    </div>
  );
};

export default DeliveryChallanForm;

