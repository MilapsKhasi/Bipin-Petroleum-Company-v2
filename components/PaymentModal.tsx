
import React, { useState, useEffect } from 'react';
import { Loader2, X, Plus, Trash2, Calculator } from 'lucide-react';
import { formatDate, parseDateFromInput, formatCurrency } from '../utils/helpers';
import FormActionButtons from './FormActionButtons';
import { useKeyboardShortcuts } from '../utils/shortcutManager';

interface PaymentEntry {
  id: string;
  date: string;
  displayDate: string;
  method: string;
  amount: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (details: any) => void;
  billNumber: string;
  totalAmount: number;
  initialPayments?: any[];
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSubmit, billNumber, totalAmount, initialPayments }) => {
  const today = new Date().toISOString().split('T')[0];
  
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialPayments && initialPayments.length > 0) {
        setPayments(initialPayments.map(p => ({
          id: Math.random().toString(36).substr(2, 9),
          date: p.payment_date || today,
          displayDate: formatDate(p.payment_date || today),
          method: p.payment_method || 'Cash',
          amount: (p.payment_amount || 0).toString()
        })));
      } else {
        setPayments([{
          id: Math.random().toString(36).substr(2, 9),
          date: today,
          displayDate: formatDate(today),
          method: 'Cash',
          amount: totalAmount.toString()
        }]);
      }
    }
  }, [isOpen, initialPayments, totalAmount, today]);

  const addPayment = () => {
    const remaining = totalAmount - payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    setPayments([...payments, {
      id: Math.random().toString(36).substr(2, 9),
      date: today,
      displayDate: formatDate(today),
      method: 'Cash',
      amount: Math.max(0, remaining).toString()
    }]);
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  const updatePayment = (id: string, field: keyof PaymentEntry, val: string) => {
    setPayments(payments.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const handleBlurDate = (id: string) => {
    const p = payments.find(p => p.id === id);
    if (!p) return;
    const iso = parseDateFromInput(p.displayDate);
    if (iso) {
      updatePayment(id, 'date', iso);
      updatePayment(id, 'displayDate', formatDate(iso));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const formattedPayments = payments.map(p => ({
        payment_date: p.date,
        payment_method: p.method,
        payment_amount: parseFloat(p.amount) || 0
      }));
      await onSubmit(formattedPayments);
    } finally {
      setSaving(false);
    }
  };

  useKeyboardShortcuts({
    onSave: isOpen ? () => {
      handleSubmit({ preventDefault: () => {} } as any);
    } : undefined,
    priority: 45
  }, [isOpen, payments, saving]);

  if (!isOpen) return null;

  const totalPaid = payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
  const balance = totalAmount - totalPaid;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Calculator className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Payment Details - Bill {billNumber}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Bill Amount</p>
              <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="text-center border-x border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Paid</p>
              <p className="text-sm font-mono font-bold text-emerald-500">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Balance</p>
              <p className={`text-sm font-mono font-bold ${balance > 0 ? 'text-amber-500' : balance < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {formatCurrency(balance)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {payments.map((p, idx) => (
              <div key={p.id} className="relative p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 bg-white dark:bg-slate-900 group">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Payment #{idx + 1}</span>
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePayment(p.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date</label>
                    <input 
                      required 
                      value={p.displayDate} 
                      onChange={e => updatePayment(p.id, 'displayDate', e.target.value)} 
                      onBlur={() => handleBlurDate(p.id)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs focus:ring-2 focus:ring-primary/20 transition-all" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Method</label>
                    <select 
                      value={p.method} 
                      onChange={e => updatePayment(p.id, 'method', e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded outline-none text-xs appearance-none cursor-pointer focus:ring-2 focus:ring-primary/20 transition-all"
                    >
                      <option value="Cash" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Cash</option>
                      <option value="Bank Transfer" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Bank Transfer</option>
                      <option value="Cheque" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Cheque</option>
                      <option value="UPI" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">UPI</option>
                      <option value="Credit Card" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Credit Card</option>
                      <option value="Other" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</label>
                    <input 
                      required 
                      type="number"
                      step="0.01"
                      value={p.amount} 
                      onChange={e => updatePayment(p.id, 'amount', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg outline-none text-xs font-mono font-bold focus:ring-2 focus:ring-primary/20 transition-all" 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            type="button" 
            onClick={addPayment}
            className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Payment</span>
          </button>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <FormActionButtons
            primaryText="Submit Payments"
            primaryType="button"
            primaryOnClick={handleSubmit}
            primaryDisabled={saving}
            primaryLoading={saving}

            secondaryLeftText="+ Add Payment"
            secondaryLeftType="button"
            secondaryLeftOnClick={addPayment}
            secondaryLeftDisabled={saving}

            secondaryRightText="Save & Close"
            secondaryRightType="button"
            secondaryRightOnClick={handleSubmit}
            secondaryRightDisabled={saving}

            discardText="Discard"
            discardOnClick={onClose}
            discardDisabled={saving}
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
