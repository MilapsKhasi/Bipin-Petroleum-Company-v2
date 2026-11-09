import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Loader2, Trash2, Plus, Wallet, CreditCard, ArrowDownCircle, ArrowUpCircle, Calendar, FileText, Edit } from 'lucide-react';
import { formatDate, getActiveCompanyId, normalizeBill, safeSupabaseSave, syncTransactionToCashbook, formatCurrency, unsyncTransactionFromCashbook } from '../utils/helpers';
import Modal from '../components/Modal';
import DateFilter, { DateFilterHandle } from '../components/DateFilter';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import FormActionButtons from '../components/FormActionButtons';
import TableSkeleton from '../components/TableSkeleton';
import { toast } from '../utils/toast';
import { supabase } from '../lib/supabase';

interface Voucher {
  id: string;
  date: string;
  created_at?: string;
  voucher_no: string;
  type: 'Receipt' | 'Payment';
  party_name: string;
  account: string;
  amount: number;
  description: string;
  raw: any;
}

interface PaymentsProps {
  typeFilter?: 'Receipt' | 'Payment';
}

const Payments: React.FC<PaymentsProps> = ({ typeFilter }) => {
  const location = useLocation();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [totalPayables, setTotalPayables] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; voucher: Voucher | null }>({ isOpen: false, voucher: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ startDate: string | null, endDate: string | null }>({ startDate: null, endDate: null });

  useEffect(() => {
    if (location.state?.highlightedId || location.state?.searchKey || location.state?.selectedItem) {
      const targetId = location.state.highlightedId || location.state.selectedItem?.id;
      const voucherNo = location.state.selectedItem?.invoice_number || location.state.selectedItem?.bill_number || location.state.selectedItem?.voucher_no;
      if (voucherNo) {
        setSearchQuery(voucherNo);
      } else if (location.state.searchKey) {
        setSearchQuery(location.state.searchKey);
      }
      if (targetId) {
        setHighlightedId(targetId);
      }
    }
  }, [location.state]);

  // Automatically open target voucher when loaded
  useEffect(() => {
    if (!loading && vouchers.length > 0 && (location.state?.highlightedId || location.state?.selectedItem?.id)) {
      const targetId = location.state.highlightedId || location.state.selectedItem?.id;
      const found = vouchers.find(v => v.id === targetId);
      if (found) {
        handleEditVoucher(found);
      } else if (location.state.selectedItem) {
        const raw = location.state.selectedItem;
        handleEditVoucher({
          id: raw.id,
          date: raw.date || new Date().toISOString().split('T')[0],
          voucher_no: raw.invoice_number || raw.bill_number || raw.voucher_no || 'VCH',
          type: raw.type || (raw.invoice_number ? 'Receipt' : 'Payment'),
          party_name: raw.customer_name || raw.vendor_name || raw.party_name || '',
          amount: Number(raw.grand_total || raw.amount || 0),
          account: raw.account || 'Cash',
          description: raw.description || '',
          raw
        });
      }
    }
  }, [loading, vouchers, location.state]);

  // Form states
  const [voucherType, setVoucherType] = useState<'Receipt' | 'Payment'>(typeFilter || 'Receipt');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [account, setAccount] = useState<string>('Cash');
  const [partyName, setPartyName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [isSaveAndNew, setIsSaveAndNew] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);

  // Dropdown options
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  const [partyBills, setPartyBills] = useState<any[]>([]);
  const [alreadyPaidBillIds, setAlreadyPaidBillIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);

  const dateFilterRef = useRef<DateFilterHandle>(null);

  // Sync voucherType with typeFilter when route changes
  useEffect(() => {
    if (typeFilter) {
      setVoucherType(typeFilter);
    }
  }, [typeFilter]);

  useEffect(() => {
    const fetchPartyBills = async () => {
      if (!partyName) {
        setPartyBills([]);
        setAlreadyPaidBillIds([]);
        setSelectedBillIds([]);
        return;
      }

      setLoadingBills(true);
      try {
        const cid = getActiveCompanyId();
        if (!cid) return;
        const table = voucherType === 'Receipt' ? 'sales_invoices' : 'purchase_bills';
        
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('company_id', cid)
          .eq('is_deleted', false);
        
        if (error) throw error;

        // Collect all linked bill IDs from existing vouchers (excluding current editing voucher)
        const paidIds = (data || [])
          .filter((item: any) => {
            const isVoucher = item.items && (item.items as any).is_payment_voucher === true;
            return isVoucher && (!editingVoucher || item.id !== editingVoucher.id);
          })
          .flatMap((v: any) => v.items?.linked_bills || []);

        setAlreadyPaidBillIds(paidIds);

        // Filter out standalone payment/receipt vouchers and match the selected party name (case-insensitive)
        const pNameLower = partyName.trim().toLowerCase();
        const bills = (data || []).filter((item: any) => {
          const isVoucher = item.items && (item.items as any).is_payment_voucher === true;
          const itemParty = (voucherType === 'Receipt' ? item.customer_name : item.vendor_name) || '';
          const nameMatch = itemParty.trim().toLowerCase() === pNameLower;
          return !isVoucher && nameMatch;
        });

        setPartyBills(bills);
        
        // If we are editing, restore selected bills if they match current party and type
        if (editingVoucher && editingVoucher.party_name?.trim().toLowerCase() === pNameLower && editingVoucher.type === voucherType) {
          const linked = editingVoucher.raw?.items?.linked_bills || [];
          setSelectedBillIds(linked);
        } else {
          setSelectedBillIds([]);
        }
      } catch (err) {
        console.error("Error fetching party bills:", err);
      } finally {
        setLoadingBills(false);
      }
    };

    fetchPartyBills();
  }, [partyName, voucherType, editingVoucher]);

  const handleBillToggle = (billId: string) => {
    setSelectedBillIds(prev => {
      const next = prev.includes(billId) 
        ? prev.filter(id => id !== billId) 
        : [...prev, billId];
      
      const total = partyBills
        .filter((b: any) => next.includes(b.id))
        .reduce((sum: number, b: any) => sum + (Number(b.grand_total) || 0), 0);
      
      setAmount(total > 0 ? total.toFixed(2) : '');
      return next;
    });
  };

  const totalOutstanding = useMemo(() => {
    return partyBills
      .filter((b: any) => {
        const hasDirectPayment = (Array.isArray(b.items?.payment_details) && b.items.payment_details.length > 0) ||
                                 (Array.isArray(b.payment_details) && b.payment_details.length > 0);
        const isLinked = alreadyPaidBillIds.includes(b.id);
        return !hasDirectPayment && !isLinked;
      })
      .reduce((sum: number, b: any) => sum + (Number(b.grand_total) || 0), 0);
  }, [partyBills, alreadyPaidBillIds]);

  const loadData = async () => {
    setLoading(true);
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }

    try {
      let receipts: Voucher[] = [];
      let payments: Voucher[] = [];

      let receiptsQuery = supabase
        .from('sales_invoices')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      let paymentsQuery = supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      if (dateRange.startDate && dateRange.endDate) {
        receiptsQuery = receiptsQuery.gte('date', dateRange.startDate).lte('date', dateRange.endDate);
        paymentsQuery = paymentsQuery.gte('date', dateRange.startDate).lte('date', dateRange.endDate);
      }

      const [{ data: receiptsData }, { data: paymentsData }] = await Promise.all([
        receiptsQuery,
        paymentsQuery
      ]);

      // Calculate Total Receivables and Payables
      const allPaymentVouchers = [
        ...(paymentsData || []).map((b: any) => normalizeBill(b)).filter((b: any) => b?.items_raw?.is_payment_voucher === true),
        ...(receiptsData || []).map((s: any) => normalizeBill(s)).filter((s: any) => s?.items_raw?.is_payment_voucher === true)
      ];

      const actualSales = (receiptsData || []).map((s: any) => normalizeBill(s)).filter((s: any) => s && !s?.items_raw?.is_payment_voucher);
      const actualBills = (paymentsData || []).map((b: any) => normalizeBill(b)).filter((b: any) => b && !b?.items_raw?.is_payment_voucher);

      const getInvoiceOutstanding = (inv: any, isSale: boolean) => {
        if (inv.status === 'Paid') return 0;
        const linkedVouchers = allPaymentVouchers.filter(v => {
          const isCorrectType = isSale ? (v.customer_name || v.type === 'Sale') : (v.vendor_name || v.type === 'Purchase');
          return isCorrectType && v.items_raw?.linked_bills?.includes(inv.id);
        });
        const totalPaidOnInv = linkedVouchers.reduce((sum, v) => {
          const pDetails = v.items_raw?.payment_details;
          const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
          return sum + pArray.reduce((s: number, p: any) => s + (Number(p.payment_amount) || 0), 0);
        }, 0);
        return Math.max(0, Number(inv.grand_total || 0) - totalPaidOnInv);
      };

      setTotalReceivables(actualSales.reduce((sum: number, inv: any) => sum + getInvoiceOutstanding(inv, true), 0));
      setTotalPayables(actualBills.reduce((sum: number, inv: any) => sum + getInvoiceOutstanding(inv, false), 0));

      // 1. Process Receipts
      if (!typeFilter || typeFilter === 'Receipt') {
        receipts = (receiptsData || [])
          .filter((item: any) => item.items && (item.items as any).is_payment_voucher === true)
          .map((item: any) => {
            const norm = normalizeBill(item);
            const pDetails = norm?.items_raw?.payment_details;
            const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
            const firstPayment = pArray[0] || {};
            return {
              id: item.id,
              date: item.date,
              created_at: item.created_at,
              voucher_no: item.invoice_number,
              type: 'Receipt' as const,
              party_name: item.customer_name,
              account: firstPayment.payment_method || 'Cash',
              amount: Number(firstPayment.payment_amount) || 0,
              description: item.description || '',
              raw: item
            };
          });
      }

      // 2. Process Payments
      if (!typeFilter || typeFilter === 'Payment') {
        payments = (paymentsData || [])
          .filter((item: any) => item.items && (item.items as any).is_payment_voucher === true)
          .map((item: any) => {
            const norm = normalizeBill(item);
            const pDetails = norm?.items_raw?.payment_details;
            const pArray = Array.isArray(pDetails) ? pDetails : (pDetails ? [pDetails] : []);
            const firstPayment = pArray[0] || {};
            return {
              id: item.id,
              date: item.date,
              created_at: item.created_at,
              voucher_no: item.bill_number,
              type: 'Payment' as const,
              party_name: item.vendor_name,
              account: firstPayment.payment_method || 'Cash',
              amount: Number(firstPayment.payment_amount) || 0,
              description: item.description || '',
              raw: item
            };
          });
      }

      // Combine and sort by date ascending so new entries are appended at the bottom
      const combined = [...receipts, ...payments].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;

        return (a.voucher_no || '').localeCompare(b.voucher_no || '');
      });
      setVouchers(combined);

      // 3. Load Customers & Vendors with strict party filtering
      const { data: vends } = await supabase.from('vendors').select('*').eq('company_id', cid).eq('is_deleted', false).order('name');
      const { data: custs } = await supabase.from('customers').select('*').eq('company_id', cid).eq('is_deleted', false).order('name');

      const partyMap = new Map();
      (custs || []).forEach((c: any) => {
        const key = c.name ? c.name.trim().toUpperCase() : c.id;
        partyMap.set(key, { ...c, party_type: c.party_type || 'customer', is_customer: true });
      });
      (vends || []).forEach((v: any) => {
        const key = v.name ? v.name.trim().toUpperCase() : v.id;
        partyMap.set(key, v);
      });

      const allParties = Array.from(partyMap.values());

      // Receipt (Payment Received) -> Customer or Both
      const receiptParties = allParties.filter((p: any) => {
        const pType = (p.party_type || '').toLowerCase();
        return pType === 'customer' || pType === 'both' || (p.is_customer === true && pType !== 'vendor');
      });

      // Payment (Payment Given) -> Vendor or Both
      const paymentParties = allParties.filter((p: any) => {
        const pType = (p.party_type || '').toLowerCase();
        return pType === 'vendor' || pType === 'both' || (p.is_customer === false && pType !== 'customer');
      });

      setCustomers(receiptParties);
      setVendors(paymentParties);
    } catch (err: any) {
      console.error("Error loading payment vouchers:", err.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleRefresh = () => loadData();
    window.addEventListener('appSettingsChanged', handleRefresh);
    return () => window.removeEventListener('appSettingsChanged', handleRefresh);
  }, [dateRange, typeFilter]);

  const resetForm = () => {
    setEditingVoucher(null);
    setVoucherType(typeFilter || 'Receipt');
    setDate(new Date().toISOString().split('T')[0]);
    setAccount('Cash');
    setPartyName('');
    setAmount('');
    setDescription('');
    setPartyBills([]);
    setSelectedBillIds([]);
  };

  const handleEditVoucher = (voucher: Voucher) => {
    setEditingVoucher(voucher);
    setVoucherType(voucher.type);
    setDate(voucher.date);
    setAccount(voucher.account);
    setPartyName(voucher.party_name);
    setAmount(voucher.amount.toString());
    
    // Clean up Ref text from description to avoid duplicates
    const baseDesc = (voucher.description || '').replace(/\s*\(Ref:\s*[^)]+\)$/, '');
    setDescription(baseDesc);

    const linked = voucher.raw?.items?.linked_bills || [];
    setSelectedBillIds(linked);

    setIsModalOpen(true);
  };

  const handleSaveVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyName) {
      toast.warning("Please select a Party Name.");
      return;
    }
    if (!account.trim()) {
      toast.warning("Please specify an Account.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.warning("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    const cid = getActiveCompanyId();
    try {
      const isReceipt = voucherType === 'Receipt';
      const table = isReceipt ? 'sales_invoices' : 'purchase_bills';

      let generatedNo = '';
      if (editingVoucher && editingVoucher.type === voucherType) {
        // Preserve existing voucher number
        generatedNo = editingVoucher.voucher_no;
      } else {
        // Auto-generate voucher number (e.g. REC-001 / PAY-001)
        const { data: existingVVs } = await supabase
          .from(table)
          .select(isReceipt ? 'invoice_number' : 'bill_number')
          .eq('company_id', cid)
          .eq('is_deleted', false);

        const prefix = isReceipt ? 'REC-' : 'PAY-';
        let maxSeq = 0;
        if (existingVVs) {
          existingVVs.forEach((v: any) => {
            const no = isReceipt ? v.invoice_number : v.bill_number;
            if (no && no.startsWith(prefix)) {
              const numPart = no.substring(prefix.length);
              if (/^\d+$/.test(numPart)) {
                const parsed = parseInt(numPart, 10);
                if (!isNaN(parsed) && parsed > maxSeq) {
                  maxSeq = parsed;
                }
              }
            }
          });
        }

        const nextSeq = maxSeq + 1;
        generatedNo = `${prefix}${nextSeq.toString().padStart(3, '0')}`;
      }

      const paymentDetails = [{
        payment_amount: parsedAmount,
        payment_date: date,
        payment_method: account.trim()
      }];

      const selectedBills = partyBills.filter((b: any) => selectedBillIds.includes(b.id));
      const refText = selectedBills.length > 0 
        ? ` (Ref: ${selectedBills.map((b: any) => b.invoice_number || b.bill_number).join(', ')})`
        : '';
      const finalDesc = (description.trim() || `${voucherType} Voucher`) + refText;

      const payload: any = {
        company_id: cid,
        date: date,
        total_without_gst: 0,
        total_gst: 0,
        grand_total: 0,
        status: 'Paid',
        is_deleted: false,
        description: finalDesc,
        items: {
          line_items: [],
          is_payment_voucher: true,
          payment_details: paymentDetails,
          linked_bills: selectedBillIds
        }
      };

      if (isReceipt) {
        payload.customer_name = partyName;
        payload.invoice_number = generatedNo;
      } else {
        payload.vendor_name = partyName;
        payload.bill_number = generatedNo;
      }

      // 1. Unsync old version from cashbook
      if (editingVoucher) {
        await unsyncTransactionFromCashbook(editingVoucher.raw);
      }

      let res: any = null;
      if (editingVoucher && editingVoucher.type === voucherType) {
        // 2a. Update existing in place
        const { data, error } = await supabase
          .from(table)
          .update(payload)
          .eq('id', editingVoucher.id)
          .select();

        if (error) throw error;
        res = { data };
      } else {
        // 2b. If type changed, delete old one and create new one
        if (editingVoucher) {
          const oldTable = editingVoucher.type === 'Receipt' ? 'sales_invoices' : 'purchase_bills';
          const { error: delError } = await supabase
            .from(oldTable)
            .update({ is_deleted: true })
            .eq('id', editingVoucher.id);
          
          if (delError) throw delError;
        }

        res = await safeSupabaseSave(table, payload);
      }

      // 3. Sync updated version to cashbook
      if (res && res.data && res.data[0]) {
        await syncTransactionToCashbook(res.data[0]);

        // Save specifically to payments_in or payments_out in IndexedDB
        const specificPaymentTable = isReceipt ? 'payments_in' : 'payments_out';
        const paymentRecord = {
          id: res.data[0].id,
          company_id: cid,
          date: date,
          party: partyName,
          party_name: partyName,
          amount: parsedAmount,
          account: account.trim(),
          voucher_no: generatedNo,
          type: isReceipt ? 'Receive payment' : 'Make payment',
          description: finalDesc,
          created_at: new Date().toISOString()
        };
        await safeSupabaseSave(specificPaymentTable, paymentRecord);
      }

      // Update linked bills status to 'Paid'
      if (selectedBillIds.length > 0) {
        await supabase
          .from(table)
          .update({ status: 'Paid' })
          .in('id', selectedBillIds);
      }

      window.dispatchEvent(new Event('appSettingsChanged'));
      toast.success(editingVoucher ? "Voucher updated successfully." : "Voucher created successfully.");
      if (!isSaveAndNew) {
        setIsModalOpen(false);
      }
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error("Error saving voucher: " + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVoucher = (voucher: Voucher) => {
    setDeleteDialog({ isOpen: true, voucher });
  };

  const confirmDelete = async () => {
    const voucher = deleteDialog.voucher;
    if (!voucher) return;

    setLoading(true);
    try {
      const table = voucher.type === 'Receipt' ? 'sales_invoices' : 'purchase_bills';
      const { error } = await supabase.from(table).update({ is_deleted: true }).eq('id', voucher.id);
      if (error) throw error;

      if (voucher.raw) {
        await unsyncTransactionFromCashbook(voucher.raw);

        const linked = voucher.raw.items?.linked_bills || [];
        if (linked.length > 0) {
          await supabase.from(table).update({ status: 'Pending' }).in('id', linked);
        }
      }

      window.dispatchEvent(new Event('appSettingsChanged'));
      toast.success(`${voucher.type} voucher #${voucher.voucher_no} deleted`);
      loadData();
    } catch (err: any) {
      console.error("Error deleting voucher:", err);
      toast.error('Failed to delete voucher: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
      setDeleteDialog({ isOpen: false, voucher: null });
    }
  };

  const filteredVouchers = vouchers.filter((v: Voucher) => {
    const search = searchQuery.toLowerCase();
    return (
      v.party_name?.toLowerCase().includes(search) ||
      v.voucher_no?.toLowerCase().includes(search) ||
      v.account?.toLowerCase().includes(search) ||
      v.description?.toLowerCase().includes(search)
    );
  });

  const isReceiptMode = typeFilter === 'Receipt';
  const isPaymentMode = typeFilter === 'Payment';

  const pageTitle = isReceiptMode 
    ? 'Receive Payment' 
    : isPaymentMode 
      ? 'Pay Supplier' 
      : 'Payments & Receipts';

  const pageSubtitle = isReceiptMode
    ? 'Record and manage money received from customers'
    : isPaymentMode
      ? 'Record and manage money paid to vendors'
      : 'Record and manage standalone double-entry ledger transactions';

  const newButtonLabel = isReceiptMode
    ? 'Receive Payment'
    : isPaymentMode
      ? 'Pay Supplier'
      : 'New Voucher';

  const partyColumnHeader = isReceiptMode
    ? 'Customer Name'
    : isPaymentMode
      ? 'Vendor Name'
      : 'Party Name';

  const totalReceived = useMemo(() => {
    return filteredVouchers
      .filter(v => v.type === 'Receipt')
      .reduce((sum, v) => sum + Number(v.amount || 0), 0);
  }, [filteredVouchers]);

  const totalPaid = useMemo(() => {
    return filteredVouchers
      .filter(v => v.type === 'Payment')
      .reduce((sum, v) => sum + Number(v.amount || 0), 0);
  }, [filteredVouchers]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center space-x-3">
          {isReceiptMode ? (
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
          ) : isPaymentMode ? (
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Wallet className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-[20px] font-medium text-slate-900 dark:text-white capitalize">{pageTitle}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">{pageSubtitle}</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="w-full sm:w-auto bg-primary text-white px-4 py-2 rounded font-medium text-xs hover:bg-primary-dark active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> <span>{newButtonLabel}</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs shrink-0">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search party, voucher no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <DateFilter ref={dateFilterRef} onFilterChange={setDateRange} />
        </div>

        {/* Summary Cards */}
        {isReceiptMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Received</p>
                <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(totalReceived)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ArrowDownCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Receivables</p>
                <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatCurrency(totalReceivables)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
          </div>
        ) : isPaymentMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Paid</p>
                <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-100/80 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <ArrowUpCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Payables</p>
                <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {formatCurrency(totalPayables)}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-100/80 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Received</p>
                <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(totalReceived)}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ArrowDownCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Receivables</p>
                <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">{formatCurrency(totalReceivables)}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Paid</p>
                <p className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-100/80 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <ArrowUpCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Total Payables</p>
                <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">{formatCurrency(totalPayables)}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-rose-100/80 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={6} columns={typeFilter ? 7 : 8} />
        ) : filteredVouchers.length === 0 ? (
          <EmptyState
            title={`No ${pageTitle} Vouchers Found`}
            message={
              searchQuery 
                ? `No vouchers match your search criteria.` 
                : isReceiptMode
                  ? "Create standalone receipt vouchers from customers to settle outstanding invoices or advance payments."
                  : isPaymentMode
                    ? "Create standalone payment vouchers to vendors to settle outstanding bills or advance payments."
                    : "Create standalone payments or receipts just like Tally Prime to settle outstanding balances."
            }
          />
        ) : (
          <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Voucher No</th>
                  {!typeFilter && <th className="py-3.5 px-4">Type</th>}
                  <th className="py-3.5 px-4">Account (Bank/Cash)</th>
                  <th className="py-3.5 px-4">{partyColumnHeader}</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4">Narration</th>
                  <th className="py-3.5 px-4 text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12px] text-slate-700 dark:text-slate-300">
                {filteredVouchers.map((voucher) => {
                  const isHighlighted = voucher.id === highlightedId;
                  return (
                    <tr 
                      key={voucher.id} 
                      ref={(el) => {
                        if (el && isHighlighted) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      className={`transition-colors duration-150 cursor-pointer ${
                        isHighlighted
                          ? 'bg-amber-100/90 dark:bg-amber-950/60 border-l-4 border-amber-500 ring-2 ring-amber-400/60 shadow-md font-semibold'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/60'
                      }`}
                      onClick={() => setHighlightedId(voucher.id)}
                    >
                      <td className="py-3 px-4 font-mono tabular-nums">{formatDate(voucher.date)}</td>
                      <td className="py-3 px-4 font-semibold font-mono tabular-nums">{voucher.voucher_no}</td>
                      {!typeFilter && (
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${voucher.type === 'Receipt' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                            {voucher.type === 'Receipt' ? (
                              <ArrowDownCircle className="w-3 h-3 mr-1 shrink-0" />
                            ) : (
                              <ArrowUpCircle className="w-3 h-3 mr-1 shrink-0" />
                            )}
                            {voucher.type}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-4 capitalize">{voucher.account}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{voucher.party_name}</td>
                      <td className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${voucher.type === 'Receipt' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        {formatCurrency(voucher.amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={voucher.description}>
                        {voucher.description}
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleEditVoucher(voucher)}
                            className="p-1 text-slate-400 hover:text-primary rounded transition-colors"
                            title="Edit Voucher"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteVoucher(voucher)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                            title="Delete Voucher"
                          >
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingVoucher 
            ? `Edit ${editingVoucher.type} Voucher` 
            : isReceiptMode 
              ? "Receive Payment Entry" 
              : isPaymentMode 
                ? "Pay Supplier Entry" 
                : "Payment & Receipt Voucher Entry"
        }
        maxWidth="max-w-5xl"
      >
        <form onSubmit={handleSaveVoucher} className="p-6 space-y-4">
          {!typeFilter && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Voucher Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setVoucherType('Receipt'); setPartyName(''); }}
                  className={`py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center ${voucherType === 'Receipt' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}
                >
                  <ArrowDownCircle className="w-4 h-4 mr-2" /> Receipt (Receive Money)
                </button>
                <button
                  type="button"
                  onClick={() => { setVoucherType('Payment'); setPartyName(''); }}
                  className={`py-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-center ${voucherType === 'Payment' ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-500 text-rose-700 dark:text-rose-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}
                >
                  <ArrowUpCircle className="w-4 h-4 mr-2" /> Payment (Pay Money)
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Account (Bank / Cash)</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Kotak Bank, SBI, Cash"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all"
                  list="accounts-suggestions"
                />
                <datalist id="accounts-suggestions">
                  <option value="Cash" />
                  <option value="Kotak Bank" />
                  <option value="State Bank of India" />
                  <option value="HDFC Bank" />
                  <option value="ICICI Bank" />
                  <option value="Bank of Baroda" />
                </datalist>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                {voucherType === 'Receipt' ? 'Customer Name (Party)' : 'Vendor Name (Party)'}
              </label>
              <select
                required
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Select Party</option>
                {voucherType === 'Receipt' ? (
                  customers.map((c: any) => <option key={c.id} value={c.name} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{c.name} {c.balance ? `(Bal: ${formatCurrency(c.balance)})` : ''}</option>)
                ) : (
                  vendors.map((v: any) => <option key={v.id} value={v.name} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{v.name} {v.balance ? `(Bal: ${formatCurrency(v.balance)})` : ''}</option>)
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all font-mono font-bold"
              />
            </div>
          </div>

          {partyName && (
            <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-3.5 bg-slate-50/50 dark:bg-slate-900/50 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {voucherType === 'Receipt' ? 'Pending Sales Invoices' : 'Pending Purchase Bills'}
                </span>
                <div className="flex items-center space-x-2 text-[10px] font-bold">
                  <span className="text-slate-500 dark:text-slate-400">
                    Outstanding: <span className="font-mono text-red-500 dark:text-red-400 font-bold">{formatCurrency(totalOutstanding)}</span>
                  </span>
                  {selectedBillIds.length > 0 && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {selectedBillIds.length} Selected
                    </span>
                  )}
                </div>
              </div>
              
              {loadingBills ? (
                <div className="py-4 flex items-center justify-center text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mr-2 text-primary" /> Loading bills...
                </div>
              ) : partyBills.length === 0 ? (
                <div className="py-2 text-center text-xs text-slate-400 italic">
                  No previous pending bills found for this party.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                  {partyBills.map((b: any) => {
                    const hasDirectPayment = (Array.isArray(b.items?.payment_details) && b.items.payment_details.length > 0) ||
                                             (Array.isArray(b.payment_details) && b.payment_details.length > 0);
                    const isAlreadyPaid = hasDirectPayment || alreadyPaidBillIds.includes(b.id);
                    const isChecked = isAlreadyPaid || selectedBillIds.includes(b.id);
                    const billNo = b.invoice_number || b.bill_number;
                    return (
                      <label 
                        key={b.id} 
                        className={`flex items-center justify-between py-2 px-2.5 rounded-md text-[11px] transition-colors ${
                          isAlreadyPaid 
                            ? 'opacity-65 bg-slate-100/50 dark:bg-slate-800/20 cursor-not-allowed' 
                            : isChecked 
                              ? 'bg-primary/5 dark:bg-primary/10 cursor-pointer' 
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            disabled={isAlreadyPaid}
                            onChange={() => !isAlreadyPaid && handleBillToggle(b.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-800 dark:border-slate-700 disabled:opacity-75 disabled:text-emerald-600"
                          />
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-slate-900 dark:text-white font-mono">{billNo}</span>
                              {isAlreadyPaid && (
                                <span className="px-1.5 py-0.5 text-[8px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 rounded">
                                  Paid
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-400">{formatDate(b.date)}</span>
                          </div>
                        </div>
                        <span className="font-bold font-mono text-slate-950 dark:text-white">
                          {formatCurrency(Number(b.grand_total) || 0)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Narration / Description</label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <textarea
                placeholder="Enter transaction remarks..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <FormActionButtons
              primaryText={editingVoucher ? 'Save Changes' : `Save ${voucherType}`}
              primaryType="submit"
              primaryOnClick={() => setIsSaveAndNew(false)}
              primaryDisabled={saving}
              primaryLoading={saving && !isSaveAndNew}

              secondaryLeftText="Save & New"
              secondaryLeftType="submit"
              secondaryLeftOnClick={() => setIsSaveAndNew(true)}
              secondaryLeftDisabled={saving}
              secondaryLeftLoading={saving && isSaveAndNew}
              showSecondaryLeft={!editingVoucher}

              secondaryRightText="Save & Close"
              secondaryRightType="submit"
              secondaryRightOnClick={() => setIsSaveAndNew(false)}
              secondaryRightDisabled={saving}

              discardText="Discard"
              discardOnClick={() => setIsModalOpen(false)}
              discardDisabled={saving}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, voucher: null })}
        onConfirm={confirmDelete}
        title={`Delete ${deleteDialog.voucher?.type || 'Voucher'}`}
        message={`Are you sure you want to permanently delete this ${deleteDialog.voucher?.type || 'voucher'}? This action is irreversible.`}
      />
    </div>
  );
};

export default Payments;
