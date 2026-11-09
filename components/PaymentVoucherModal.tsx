import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Calendar, CreditCard, FileText, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import { getActiveCompanyId, formatDate, normalizeBill, safeSupabaseSave, syncTransactionToCashbook, formatCurrency } from '../utils/helpers';
import FormActionButtons from './FormActionButtons';
import { useKeyboardShortcuts } from '../utils/shortcutManager';
import { toast } from '../utils/toast';

interface PaymentVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: 'Receipt' | 'Payment';
  onSuccess?: () => void;
}

export const PaymentVoucherModal: React.FC<PaymentVoucherModalProps> = ({
  isOpen,
  onClose,
  initialType = 'Receipt',
  onSuccess
}) => {
  const [voucherType, setVoucherType] = useState<'Receipt' | 'Payment'>(initialType);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [account, setAccount] = useState<string>('Cash');
  const [partyName, setPartyName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [isSaveAndNew, setIsSaveAndNew] = useState(false);

  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [partyBills, setPartyBills] = useState<any[]>([]);
  const [alreadyPaidBillIds, setAlreadyPaidBillIds] = useState<string[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);

  // Sync initial type when opened
  useEffect(() => {
    if (isOpen) {
      setVoucherType(initialType);
      resetForm();
    }
  }, [isOpen, initialType]);

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setAccount('Cash');
    setPartyName('');
    setAmount('');
    setDescription('');
    setSelectedBillIds([]);
    setAlreadyPaidBillIds([]);
    setPartyBills([]);
  };

  // Load Parties
  useEffect(() => {
    if (!isOpen) return;
    const loadParties = async () => {
      const cid = getActiveCompanyId();
      if (!cid) return;

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

      const receiptParties = allParties.filter((p: any) => {
        const pt = (p.party_type || '').toLowerCase();
        return pt === 'customer' || pt === 'both' || (p.is_customer === true && pt !== 'vendor');
      });

      const paymentParties = allParties.filter((p: any) => {
        const pt = (p.party_type || '').toLowerCase();
        return pt === 'vendor' || pt === 'both' || (p.is_customer === false && pt !== 'customer');
      });

      setCustomers(receiptParties);
      setVendors(paymentParties);
    };

    loadParties();
  }, [isOpen]);

  // Load Pending Bills for selected Party
  useEffect(() => {
    if (!isOpen || !partyName) {
      setPartyBills([]);
      setAlreadyPaidBillIds([]);
      setSelectedBillIds([]);
      return;
    }

    const fetchPartyBills = async () => {
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

        // Extract already paid bill IDs from all payment/receipt vouchers
        const paidIds = (data || [])
          .filter((item: any) => item.items && (item.items as any).is_payment_voucher === true)
          .flatMap((v: any) => v.items?.linked_bills || []);

        setAlreadyPaidBillIds(paidIds);

        // Filter bills for the selected party using case-insensitive matching
        const pNameLower = partyName.trim().toLowerCase();
        const bills = (data || []).filter((item: any) => {
          const isVoucher = item.items && (item.items as any).is_payment_voucher === true;
          const itemParty = (voucherType === 'Receipt' ? item.customer_name : item.vendor_name) || '';
          const nameMatch = itemParty.trim().toLowerCase() === pNameLower;
          return !isVoucher && nameMatch;
        });

        setPartyBills(bills);
        setSelectedBillIds([]);
      } catch (err) {
        console.error('Error fetching party bills:', err);
      } finally {
        setLoadingBills(false);
      }
    };

    fetchPartyBills();
  }, [isOpen, partyName, voucherType]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const cid = getActiveCompanyId();
    if (!cid) {
      toast.error('Please select or create a workspace first.');
      return;
    }

    if (!partyName) {
      toast.warning('Please select a party.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.warning('Please enter a valid amount.');
      return;
    }

    setSaving(true);
    try {
      const isReceipt = voucherType === 'Receipt';
      const table = isReceipt ? 'sales_invoices' : 'purchase_bills';

      const { data: existingVVs } = await supabase
        .from(table)
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      const prefix = isReceipt ? 'REC-' : 'PAY-';
      let maxSeq = 0;
      if (existingVVs) {
        existingVVs.forEach((v: any) => {
          const no = isReceipt ? (v as any).invoice_number : (v as any).bill_number;
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

      const generatedNo = `${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`;

      const selectedBills = partyBills.filter(b => selectedBillIds.includes(b.id));
      const refText = selectedBills.length > 0
        ? ` (Ref: ${selectedBills.map(b => b.invoice_number || b.bill_number).join(', ')})`
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
          payment_details: [{
            payment_amount: parsedAmount,
            payment_date: date,
            payment_method: account.trim()
          }],
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

      const res = await safeSupabaseSave(table, payload);

      if (res && res.data && res.data[0]) {
        await syncTransactionToCashbook(res.data[0]);

        // Save into payments_in or payments_out store
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

      toast.success("Payment voucher saved successfully.");
      if (onSuccess) onSuccess();

      if (isSaveAndNew) {
        resetForm();
      } else {
        onClose();
      }
    } catch (err: any) {
      toast.error('Error saving voucher: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const formRef = useRef<HTMLFormElement>(null);

  useKeyboardShortcuts({
    onSave: isOpen ? () => {
      setIsSaveAndNew(false);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    } : undefined,
    onSaveAndNew: isOpen ? () => {
      setIsSaveAndNew(true);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    } : undefined,
    priority: 35
  }, [isOpen, date, account, partyName, amount, description, selectedBillIds]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={voucherType === 'Receipt' ? 'New Receive Payment Voucher' : 'New Pay Supplier Voucher'}
      maxWidth="max-w-5xl"
    >
      <form ref={formRef} onSubmit={handleSave} className="p-6 space-y-4">
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
                list="accounts-suggestions-modal"
              />
              <datalist id="accounts-suggestions-modal">
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
                customers.map(c => <option key={c.id} value={c.name} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{c.name} {c.balance ? `(Bal: ${formatCurrency(c.balance)})` : ''}</option>)
              ) : (
                vendors.map(v => <option key={v.id} value={v.name} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{v.name} {v.balance ? `(Bal: ${formatCurrency(v.balance)})` : ''}</option>)
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
                No previous bills found for this party.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                {partyBills.map((b) => {
                  const hasDirectPayment = (Array.isArray(b.items?.payment_details) && b.items.payment_details.length > 0) ||
                                           (Array.isArray(b.payment_details) && b.payment_details.length > 0);
                  const isPaid = hasDirectPayment || alreadyPaidBillIds.includes(b.id);
                  const isChecked = isPaid || selectedBillIds.includes(b.id);
                  const billNo = b.invoice_number || b.bill_number;
                  return (
                    <label
                      key={b.id}
                      className={`flex items-center justify-between py-2 px-2.5 rounded-md text-[11px] transition-colors ${
                        isPaid
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
                          disabled={isPaid}
                          onChange={() => !isPaid && handleBillToggle(b.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary dark:bg-slate-800 dark:border-slate-700 disabled:opacity-75 disabled:text-emerald-600"
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white font-mono">{billNo}</span>
                            {isPaid && (
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
            primaryText={`Save ${voucherType}`}
            primaryType="submit"
            primaryOnClick={() => setIsSaveAndNew(false)}
            primaryDisabled={saving}
            primaryLoading={saving && !isSaveAndNew}

            secondaryLeftText="Save & New"
            secondaryLeftType="submit"
            secondaryLeftOnClick={() => setIsSaveAndNew(true)}
            secondaryLeftDisabled={saving}
            secondaryLeftLoading={saving && isSaveAndNew}

            secondaryRightText="Save & Close"
            secondaryRightType="submit"
            secondaryRightOnClick={() => setIsSaveAndNew(false)}
            secondaryRightDisabled={saving}

            discardText="Discard"
            discardOnClick={onClose}
            discardDisabled={saving}
          />
        </div>
      </form>
    </Modal>
  );
};

export default PaymentVoucherModal;
