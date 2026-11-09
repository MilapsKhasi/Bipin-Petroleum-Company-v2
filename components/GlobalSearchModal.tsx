import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, FileText, ShoppingCart, Contact, ArrowDownCircle, ArrowUpCircle, 
  Package, X, ArrowRight, Loader2, Tag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getActiveCompanyId, formatCurrency, formatDate } from '../utils/helpers';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  category: 'sales' | 'purchases' | 'parties' | 'payments' | 'stock';
  title: string;
  subtitle: string;
  detail: string;
  date?: string;
  amount?: number;
  badge: string;
  badgeColor: string;
  rawItem: any;
  navigationPath: string;
}

const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      fetchAndSearch('');
    }
  }, [isOpen]);

  // Handle global keyboard listeners inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          handleSelectResult(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const fetchAndSearch = async (searchTerm: string) => {
    const cid = getActiveCompanyId();
    if (!cid) return;

    setLoading(true);
    try {
      const term = searchTerm.toLowerCase().trim();

      // Fetch all required tables in parallel
      const [
        { data: salesData },
        { data: purchaseData },
        { data: customerData },
        { data: vendorData },
        { data: stockData }
      ] = await Promise.all([
        supabase.from('sales_invoices').select('*').eq('company_id', cid).eq('is_deleted', false),
        supabase.from('purchase_bills').select('*').eq('company_id', cid).eq('is_deleted', false),
        supabase.from('customers').select('*').eq('company_id', cid).eq('is_deleted', false),
        supabase.from('vendors').select('*').eq('company_id', cid).eq('is_deleted', false),
        supabase.from('stock_items').select('*').eq('company_id', cid).eq('is_deleted', false)
      ]);

      const allResults: SearchResult[] = [];

      // 1. Sales Invoices (non-payment vouchers)
      (salesData || []).forEach((item: any) => {
        const isVoucher = item.items && (item.items as any).is_payment_voucher === true;
        if (isVoucher) {
          // It's a Receipt Voucher
          const invNo = item.invoice_number || 'REC-';
          const custName = item.customer_name || 'Customer';
          const amt = Number(item.items?.payment_details?.[0]?.payment_amount) || Number(item.grand_total) || 0;
          const desc = item.description || '';

          if (!term || invNo.toLowerCase().includes(term) || custName.toLowerCase().includes(term) || desc.toLowerCase().includes(term)) {
            allResults.push({
              id: item.id,
              category: 'payments',
              title: `Receipt ${invNo}`,
              subtitle: `From: ${custName}`,
              detail: desc || 'Receipt Payment Entry',
              date: item.date,
              amount: amt,
              badge: 'Receipt',
              badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
              rawItem: item,
              navigationPath: '/receive-payment'
            });
          }
        } else {
          // Regular Sales Invoice
          const invNo = item.invoice_number || 'INV-';
          const custName = item.customer_name || 'Customer';
          const amt = Number(item.grand_total) || 0;

          if (!term || invNo.toLowerCase().includes(term) || custName.toLowerCase().includes(term)) {
            allResults.push({
              id: item.id,
              category: 'sales',
              title: `Sales Invoice ${invNo}`,
              subtitle: `Customer: ${custName}`,
              detail: `Status: ${item.status || 'Unpaid'}`,
              date: item.date,
              amount: amt,
              badge: 'Sales Invoice',
              badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
              rawItem: item,
              navigationPath: '/sales'
            });
          }
        }
      });

      // 2. Purchase Bills (non-payment vouchers)
      (purchaseData || []).forEach((item: any) => {
        const isVoucher = item.items && (item.items as any).is_payment_voucher === true;
        if (isVoucher) {
          // It's a Payment Voucher
          const billNo = item.bill_number || 'PAY-';
          const vendName = item.vendor_name || 'Vendor';
          const amt = Number(item.items?.payment_details?.[0]?.payment_amount) || Number(item.grand_total) || 0;
          const desc = item.description || '';

          if (!term || billNo.toLowerCase().includes(term) || vendName.toLowerCase().includes(term) || desc.toLowerCase().includes(term)) {
            allResults.push({
              id: item.id,
              category: 'payments',
              title: `Payment ${billNo}`,
              subtitle: `To: ${vendName}`,
              detail: desc || 'Pay Supplier Entry',
              date: item.date,
              amount: amt,
              badge: 'Payment',
              badgeColor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
              rawItem: item,
              navigationPath: '/make-payment'
            });
          }
        } else {
          // Regular Purchase Bill
          const billNo = item.bill_number || 'BILL-';
          const vendName = item.vendor_name || 'Vendor';
          const amt = Number(item.grand_total) || 0;

          if (!term || billNo.toLowerCase().includes(term) || vendName.toLowerCase().includes(term)) {
            allResults.push({
              id: item.id,
              category: 'purchases',
              title: `Purchase Bill ${billNo}`,
              subtitle: `Vendor: ${vendName}`,
              detail: `Status: ${item.status || 'Unpaid'}`,
              date: item.date,
              amount: amt,
              badge: 'Purchase Bill',
              badgeColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
              rawItem: item,
              navigationPath: '/bills'
            });
          }
        }
      });

      // 3. Parties (Customers & Vendors)
      const partyMap = new Map();
      (customerData || []).forEach((c: any) => {
        const key = c.name ? c.name.trim().toUpperCase() : c.id;
        partyMap.set(key, { ...c, is_customer: true });
      });
      (vendorData || []).forEach((v: any) => {
        const key = v.name ? v.name.trim().toUpperCase() : v.id;
        partyMap.set(key, v);
      });

      Array.from(partyMap.values()).forEach((party: any) => {
        const name = party.name || '';
        const phone = party.phone || party.mobile || '';
        const email = party.email || '';
        const gstin = party.gstin || '';
        const partyType = party.party_type || (party.is_customer ? 'Customer' : 'Vendor');

        if (!term || name.toLowerCase().includes(term) || phone.includes(term) || email.toLowerCase().includes(term) || gstin.toLowerCase().includes(term)) {
          allResults.push({
            id: party.id,
            category: 'parties',
            title: name,
            subtitle: `${partyType} ${phone ? `• ${phone}` : ''}`,
            detail: gstin ? `GSTIN: ${gstin}` : email || 'Party Contact',
            amount: party.balance ? Number(party.balance) : undefined,
            badge: partyType,
            badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
            rawItem: party,
            navigationPath: '/parties'
          });
        }
      });

      // 4. Stock Items
      (stockData || []).forEach((stock: any) => {
        const name = stock.name || '';
        const sku = stock.sku || stock.item_code || '';
        const category = stock.category || '';

        if (!term || name.toLowerCase().includes(term) || sku.toLowerCase().includes(term) || category.toLowerCase().includes(term)) {
          allResults.push({
            id: stock.id,
            category: 'stock',
            title: name,
            subtitle: `Stock Item ${sku ? `• SKU: ${sku}` : ''}`,
            detail: `Price: ${formatCurrency(stock.sale_price || 0)} ${stock.unit ? `per ${stock.unit}` : ''}`,
            badge: category || 'Stock Item',
            badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
            rawItem: stock,
            navigationPath: '/stock'
          });
        }
      });

      setResults(allResults);
    } catch (err) {
      console.error("Error conducting global search:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelectedIndex(0);
    fetchAndSearch(val);
  };

  const filteredResults = results.filter((r) => {
    if (activeCategory === 'all') return true;
    return r.category === activeCategory;
  });

  const handleSelectResult = (result: SearchResult) => {
    onClose();
    const searchVal = result.rawItem?.invoice_number || result.rawItem?.bill_number || result.rawItem?.name || result.title;
    navigate(result.navigationPath, { 
      state: { 
        selectedItem: result.rawItem, 
        highlightedId: result.id, 
        selectedId: result.id,
        searchKey: searchVal,
        openModal: true
      } 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search sales invoices, purchase bills, parties, payments, stock..."
            className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 outline-none text-sm font-medium"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); fetchAndSearch(''); }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 overflow-x-auto custom-scrollbar bg-slate-50/30 dark:bg-slate-900/30 text-xs">
          {[
            { id: 'all', label: 'All Results' },
            { id: 'sales', label: 'Sales Invoices', icon: FileText },
            { id: 'purchases', label: 'Purchase Bills', icon: ShoppingCart },
            { id: 'parties', label: 'Parties', icon: Contact },
            { id: 'payments', label: 'Payments & Receipts', icon: ArrowDownCircle },
            { id: 'stock', label: 'Stock Items', icon: Package },
          ].map((cat) => {
            const IconComp = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setSelectedIndex(0); }}
                className={`px-3 py-1 rounded-full font-medium whitespace-nowrap text-xs flex items-center transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-xs font-bold'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {IconComp && <IconComp className="w-3.5 h-3.5 mr-1.5" />}
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" /> Searching records...
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-1">
              <p className="font-semibold text-slate-600 dark:text-slate-300">No results found</p>
              <p className="text-[11px] text-slate-400">Try searching for invoice numbers, party names, stock items, or payment vouchers.</p>
            </div>
          ) : (
            filteredResults.map((result, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${result.category}-${result.id}-${idx}`}
                  onClick={() => handleSelectResult(result)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 shadow-xs'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {result.category === 'sales' && <FileText className="w-4 h-4 text-blue-500" />}
                      {result.category === 'purchases' && <ShoppingCart className="w-4 h-4 text-purple-500" />}
                      {result.category === 'parties' && <Contact className="w-4 h-4 text-amber-500" />}
                      {result.category === 'payments' && <ArrowDownCircle className="w-4 h-4 text-emerald-500" />}
                      {result.category === 'stock' && <Package className="w-4 h-4 text-cyan-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {result.title}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${result.badgeColor}`}>
                          {result.badge}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="truncate">{result.subtitle}</span>
                        {result.date && <span>• {formatDate(result.date)}</span>}
                        {result.detail && <span className="hidden sm:inline truncate">• {result.detail}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 ml-3">
                    {result.amount !== undefined && (
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                        {formatCurrency(result.amount)}
                      </span>
                    )}
                    <ArrowRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-primary translate-x-1' : 'text-slate-300 dark:text-slate-600'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 px-4">
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono">↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono">↵</kbd>
              <span>Select</span>
            </span>
          </div>
          <span>Total {filteredResults.length} records</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
