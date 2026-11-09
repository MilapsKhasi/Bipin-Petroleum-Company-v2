import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, FileText, ShoppingCart, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface NewVoucherDropdownProps {
  onSelectSalesInvoice: () => void;
  onSelectPurchaseBill: () => void;
  onSelectReceivePayment: () => void;
  onSelectMakePayment: () => void;
  className?: string;
}

export const NewVoucherDropdown: React.FC<NewVoucherDropdownProps> = ({
  onSelectSalesInvoice,
  onSelectPurchaseBill,
  onSelectReceivePayment,
  onSelectMakePayment,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-primary text-white font-medium text-xs rounded capitalize hover:bg-primary-dark active:scale-[0.98] flex items-center justify-between gap-1.5 shadow-sm transition-all duration-150 cursor-pointer"
      >
        <span>New Voucher</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-48 sm:w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={() => { setIsOpen(false); onSelectSalesInvoice(); }}
            className="w-full text-left px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Sales Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsOpen(false); onSelectPurchaseBill(); }}
            className="w-full text-left px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Purchase Bill</span>
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <button
            type="button"
            onClick={() => { setIsOpen(false); onSelectReceivePayment(); }}
            className="w-full text-left px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
          >
            <ArrowDownCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Receive Payment</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsOpen(false); onSelectMakePayment(); }}
            className="w-full text-left px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
          >
            <ArrowUpCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Pay Supplier</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default NewVoucherDropdown;
