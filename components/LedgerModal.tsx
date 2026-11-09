import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Calculator, Printer, History, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate, getActiveCompanyId, normalizeBill } from '../utils/helpers';
import { supabase } from '../lib/supabase';

interface LedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: any;
  type: 'customer' | 'vendor';
}

const LedgerModal: React.FC<LedgerModalProps> = ({ isOpen, onClose, party, type }) => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const cid = getActiveCompanyId();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${party?.name || 'Party'} - Ledger Statement</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box;
              }
              body {
                font-family: 'Inter', sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #ffffff;
                color: #000000;
              }
              @page {
                size: A4 portrait;
                margin: 10mm;
              }
              @media print {
                @page { size: auto; margin: 10mm; }
              }
            </style>
          </head>
          <body class="bg-white">
            <div class="max-w-[850px] mx-auto bg-white p-6">
              
              <!-- Company Logo Centered -->
              <div class="flex justify-center mb-3">
              </div>

              <!-- Company Name Centered -->
              <h1 class="text-center text-xl font-bold" style="color: #1e3a8a;">
                ${companyInfo?.name || 'Bipin Petroleum Co.'}
              </h1>

              <!-- Company Address Centered -->
              <p class="text-center text-xs text-gray-600 mt-1 max-w-lg mx-auto">
                ${companyInfo?.address || '56, Digvijay Plot ,Near Oshwal Hospital, Jamnagar 361005, Gujarat'}
              </p>

              <!-- Thin Horizontal Divider -->
              <hr class="my-4 border-t border-gray-300" />

              <!-- Selected Party Name -->
              <h2 class="text-center text-lg font-semibold text-gray-900 mt-2">
                ${party?.name || 'Company Name'}
              </h2>

              <!-- Ledger Account Title -->
              <p class="text-center text-sm font-medium text-gray-700 mt-0.5">
                Ledger Account
              </p>

              <!-- Date Range -->
              <p class="text-center text-xs text-gray-600 mt-1 mb-6">
                From - ${fromDateFormatted} to - ${toDateFormatted}
              </p>

              <!-- Ledger Table -->
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr style="background-color: #0a192f; color: #ffffff;">
                    <th class="py-2.5 px-3 text-left font-semibold text-xs uppercase tracking-wider w-16">Sr No</th>
                    <th class="py-2.5 px-3 text-left font-semibold text-xs uppercase tracking-wider w-28">Date</th>
                    <th class="py-2.5 px-3 text-left font-semibold text-xs uppercase tracking-wider">Description</th>
                    <th class="py-2.5 px-3 text-left font-semibold text-xs uppercase tracking-wider w-32">Ref No</th>
                    <th class="py-2.5 px-3 text-right font-semibold text-xs uppercase tracking-wider w-28">Debit</th>
                    <th class="py-2.5 px-3 text-right font-semibold text-xs uppercase tracking-wider w-28">Credit</th>
                    <th class="py-2.5 px-3 text-right font-semibold text-xs uppercase tracking-wider w-28">Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  ${ledgerRows.length > 0
          ? ledgerRows
            .map(
              (row, index) => `
                        <tr>
                          <td class="py-2.5 px-3 text-left text-gray-800">${index + 1}</td>
                          <td class="py-2.5 px-3 text-left text-gray-800">${row.date || ''}</td>
                          <td class="py-2.5 px-3 text-left text-gray-800">${row.transaction || ''}</td>
                          <td class="py-2.5 px-3 text-left text-gray-800">${row.reference || '-'}</td>
                          <td class="py-2.5 px-3 text-right text-gray-800">${row.debit ? Number(row.debit).toFixed(2) : ''}</td>
                          <td class="py-2.5 px-3 text-right text-gray-800">${row.credit ? Number(row.credit).toFixed(2) : ''}</td>
                          <td class="py-2.5 px-3 text-right text-gray-800">${Number(row.balance || 0).toFixed(2)}</td>
                        </tr>
                      `
            )
            .join('')
          : `<tr><td colspan="7" class="text-center py-6 text-gray-500">No ledger entries found for the selected period.</td></tr>`
        }
                </tbody>
                <tfoot>
                  <tr class="border-t border-b border-gray-300 font-semibold bg-gray-50">
                    <td colspan="4" class="py-2.5 px-3 text-right text-gray-900"></td>
                    <td class="py-2.5 px-3 text-right text-gray-900">
                      ${ledgerRows.reduce((sum, r) => sum + (Number(r.debit) || 0), 0).toFixed(2)}
                    </td>
                    <td class="py-2.5 px-3 text-right text-gray-900">
                      ${ledgerRows.reduce((sum, r) => sum + (Number(r.credit) || 0), 0).toFixed(2)}
                    </td>
                    <td class="py-2.5 px-3"></td>
                  </tr>
                  <tr>
                    <td colspan="2" class="py-3 px-3"></td>
                    <td class="py-3 px-3 font-semibold text-gray-900">Net Closing Balance</td>
                    <td></td>
                    <td colspan="2" class="py-3 px-3 text-right font-semibold text-gray-900">
                      ${(() => {
          const net = ledgerRows.length > 0 ? ledgerRows[ledgerRows.length - 1].balance : 0;
          return `${Math.abs(net).toFixed(2)} ${net >= 0 ? 'Dr' : 'Cr'}`;
        })()}
                    </td>
                    <td class="py-3 px-3"></td>
                  </tr>
                </tfoot>
              </table>

            </div>
            <script>
              window.addEventListener('load', () => {
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 500);
              });
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const loadLedgerData = async () => {
    if (!party || !cid) return;
    setLoading(true);
    try {
      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('id', cid)
        .single();
      if (company) {
        setCompanyInfo(company);
      }

      const { data: voucherData } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      const { data: salesData } = await supabase
        .from('sales_invoices')
        .select('*')
        .eq('company_id', cid)
        .eq('is_deleted', false);

      const allVouchers = [
        ...(voucherData || []).map((v: any) => ({ ...normalizeBill(v), source: 'purchase_bills' })),
        ...(salesData || []).map((v: any) => ({ ...normalizeBill(v), source: 'sales_invoices' }))
      ];

      const partyTransactions = allVouchers.filter((v: any) =>
        v.vendor_name?.toLowerCase().trim() === party.name?.toLowerCase().trim()
      );

      setTransactions(partyTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch (error) {
      console.error("Error loading ledger:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadLedgerData();
  }, [isOpen, party, cid]);

  const { ledgerRows, finalBalance } = useMemo(() => {
    if (!party) return { ledgerRows: [], finalBalance: 0 };
    const rows: any[] = [];

    const isDebtor = party.party_type === 'customer' || party.is_customer === true || type === 'customer';
    const openingBalanceVal = Number(party.balance) || 0;
    let runningBalance = isDebtor ? openingBalanceVal : -openingBalanceVal;

    // Opening Balance Row
    rows.push({
      date: '',
      transaction: 'Opening Balance',
      reference: '',
      debit: openingBalanceVal !== 0 ? (isDebtor ? openingBalanceVal : 0) : 0,
      credit: openingBalanceVal !== 0 ? (isDebtor ? 0 : openingBalanceVal) : 0,
      balance: runningBalance
    });

    transactions.forEach(t => {
      const amount = Number(t.grand_total) || 0;
      const isSale = t.type === 'Sale';
      const isPaymentVoucher = t.items_raw?.is_payment_voucher === true;

      if (!isPaymentVoucher) {
        if (isSale) {
          runningBalance += amount;
          rows.push({
            date: t.date,
            transaction: 'Sales Invoice',
            reference: t.bill_number || '',
            debit: amount,
            credit: 0,
            balance: runningBalance
          });
        } else {
          runningBalance -= amount;
          rows.push({
            date: t.date,
            transaction: 'Purchase Bill',
            reference: t.bill_number || '',
            debit: 0,
            credit: amount,
            balance: runningBalance
          });
        }
      }

      if (isPaymentVoucher) {
        const pDetailsRaw = t.items_raw?.payment_details;
        const payments = Array.isArray(pDetailsRaw) ? pDetailsRaw : (pDetailsRaw ? [pDetailsRaw] : [{
          payment_amount: amount,
          payment_date: t.date,
          payment_method: 'Cash'
        }]);

        payments.forEach((p: any) => {
          const pAmount = Number(p.payment_amount) || 0;
          const pDate = p.payment_date || t.date;

          if (isSale) {
            runningBalance -= pAmount;
            rows.push({
              date: pDate,
              transaction: 'Receipt',
              reference: t.bill_number || '',
              debit: 0,
              credit: pAmount,
              balance: runningBalance
            });
          } else {
            runningBalance += pAmount;
            rows.push({
              date: pDate,
              transaction: 'Payment',
              reference: t.bill_number || '',
              debit: pAmount,
              credit: 0,
              balance: runningBalance
            });
          }
        });
      }
    });

    return { ledgerRows: rows, finalBalance: runningBalance };
  }, [transactions, party, type]);

  const totals = useMemo(() => {
    return ledgerRows.reduce((acc, row) => ({
      debit: acc.debit + (row.debit || 0),
      credit: acc.credit + (row.credit || 0)
    }), { debit: 0, credit: 0 });
  }, [ledgerRows]);

  const formatMmmYyDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIdx = parseInt(m) - 1;
    const mmm = months[monthIdx] || 'Apr';
    const yy = y.length === 4 ? y.substring(2) : y;
    return `${d.padStart(2, '0')}-${mmm}-${yy}`;
  };

  const formatLedgerDate = (isoStr: string) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  };

  const fromDateFormatted = useMemo(() => {
    if (transactions.length === 0) return '01-Apr-26';
    const dates = transactions.map(t => new Date(t.date).getTime()).filter(Boolean);
    if (dates.length === 0) return '01-Apr-26';
    const minDate = new Date(Math.min(...dates));
    return formatMmmYyDate(minDate.toISOString().split('T')[0]);
  }, [transactions]);

  const toDateFormatted = useMemo(() => {
    if (transactions.length === 0) return '31-Mar-27';
    const dates = transactions.map(t => new Date(t.date).getTime()).filter(Boolean);
    if (dates.length === 0) return '31-Mar-27';
    const maxDate = new Date(Math.max(...dates));
    return formatMmmYyDate(maxDate.toISOString().split('T')[0]);
  }, [transactions]);

  const printRows = useMemo(() => {
    const list = [...ledgerRows];
    while (list.length < 25) {
      list.push({
        isPlaceholder: true,
        date: '',
        transaction: '',
        reference: '',
        debit: 0,
        credit: 0,
        balance: 0
      });
    }
    return list;
  }, [ledgerRows]);

  const debitSum = totals.debit;
  const creditSum = totals.credit;
  const netBalance = Math.abs(debitSum - creditSum);
  const isDebitHigher = debitSum > creditSum;

  if (!isOpen || !party) return null;

  return (
    <>
      {/* SCREEN MODAL VIEW (print:hidden) */}
      <div className="fixed inset-0 z-[550] flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300 print:hidden">
        <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-full sm:h-[90vh] rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <div className="flex items-center space-x-3 sm:space-x-4 overflow-hidden">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-inner shrink-0 ${type === 'customer' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600'}`}>
                <History className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="truncate">
                <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white capitalize tracking-tight truncate">{party.name} - Ledger</h2>
                <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5 sm:mt-1">Statement of Accounts</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={handlePrint}
                className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-none cursor-pointer"
              >
                <Printer className="w-4 h-4 text-primary" />
                <span className="hidden sm:inline">Print Ledger</span>
              </button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="p-10 overflow-y-auto print:overflow-visible print:p-6 bg-white text-black">
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center">
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">Total Debit</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-red-500">{formatCurrency(totals.debit)}</p>
            </div>
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center">
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">Total Credit</p>
              <p className="text-xl sm:text-2xl font-mono font-bold text-emerald-500">{formatCurrency(totals.credit)}</p>
            </div>
            <div className="p-4 sm:p-6 flex flex-col items-center justify-center bg-slate-50/30 dark:bg-slate-800/20">
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 sm:mb-2">Net Balance</p>
              <p className={`text-xl sm:text-2xl font-mono font-bold ${finalBalance > 0 ? 'text-blue-600 dark:text-blue-400' : (finalBalance < 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-400')}`}>
                {formatCurrency(Math.abs(finalBalance))}
                <span className="text-[10px] sm:text-xs ml-1 sm:ml-2 uppercase opacity-50 font-bold">
                  {finalBalance === 0 ? 'Nil' : (finalBalance > 0 ? 'Dr' : 'Cr')}
                </span>
              </p>
            </div>
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-white dark:bg-slate-900 custom-scrollbar">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin opacity-20" />
              </div>
            ) : ledgerRows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 italic">
                <Calculator className="w-16 h-16 opacity-5 mb-4" />
                <p className="text-sm font-medium">No ledger entries found for this party.</p>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-xs border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="p-4 text-left w-32">Date</th>
                      <th className="p-4 text-left">Transaction</th>
                      <th className="p-4 text-left w-36">Reference</th>
                      <th className="p-4 text-right w-40">Debit</th>
                      <th className="p-4 text-right w-40">Credit</th>
                      <th className="p-4 text-right w-44 bg-slate-100/50 dark:bg-slate-800/50">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledgerRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="p-4 text-slate-500 dark:text-slate-400 font-medium">{row.date ? formatDate(row.date) : '-'}</td>
                        <td className="p-4">
                          <div className="flex items-center">
                            {row.debit > 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5 mr-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5 mr-2 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            )}
                            <span className="font-semibold text-slate-850 dark:text-slate-200">{row.transaction}</span>
                          </div>
                        </td>
                        <td className="p-4 text-left font-bold text-slate-600 dark:text-slate-400">{row.reference || '-'}</td>
                        <td className="p-4 text-right font-mono font-bold text-red-500/80">{row.debit > 0 ? formatCurrency(row.debit, false) : '-'}</td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-500/80">{row.credit > 0 ? formatCurrency(row.credit, false) : '-'}</td>
                        <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white bg-slate-50/30 dark:bg-slate-800/30">
                          {formatCurrency(Math.abs(row.balance), false)}
                          <span className={`text-[10px] ml-1.5 uppercase font-bold ${row.balance > 0 ? 'text-blue-600 dark:text-blue-400' : row.balance < 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-400'}`}>
                            {row.balance === 0 ? 'Nil' : (row.balance > 0 ? 'Dr' : 'Cr')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-2">
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Generated on {new Date().toLocaleString()}</p>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Live Ledger Sync Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* EXACT ACCURATE PRINT LAYOUT (print:block hidden) */}
      <div className="hidden print:block fixed inset-0 bg-white text-black z-[99999] p-0 m-0 font-sans leading-normal">
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #root, .print\\:hidden, .fixed, .modal {
              display: none !important;
            }
            .print\\:block {
              display: block !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
            @media print {
              body {
              zoom: 0.89;
            }
          }
          }
        `}} />

        {/* Ledger Outer border Box */}
        <div ref={printRef} className="border-2 border-black w-full min-h-[265mm] flex flex-col justify-between p-0 m-0 text-black">
          <div>
            {/* Top compartmental row (GSTIN & PHONE) */}
            <div className="grid grid-cols-12 border-b-2 border-black text-[10px] font-bold uppercase tracking-wide">
              <div className="col-span-4 p-2 border-r-2 border-black">
                GSTIN : {companyInfo?.gstin || '24CMAPK3117Q1ZZ'}
              </div>
              <div className="col-span-4 p-2 border-r-2 border-black"></div>
              <div className="col-span-4 p-2 text-right">
                PHONE : {party?.phone || companyInfo?.phone || '79907 13846'}
              </div>
            </div>

            {/* Centered Business Name and Address block */}
            <div className="text-center py-4 border-b-2 border-black px-6">
              <h1 className="text-xl font-extrabold tracking-widest text-black mb-1">
                {companyInfo?.name?.toUpperCase() || 'SK ENTERPRISE'}
              </h1>
              <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-wide">
                {companyInfo?.address || 'SHOP NO 28, SHIVOM CIRCLE, GOLDEN POINT, PHASE III, DARED, JAMNAGAR'}
              </p>
            </div>

            {/* Account Info and Period grid block */}
            <div className="grid grid-cols-12 text-[10px] border-b-2 border-black font-semibold">
              <div className="col-span-7 p-3 border-r-2 border-black space-y-1.5 uppercase">
                <div>ACCOUNT : <span className="font-extrabold text-sm ml-2">{party?.name?.toUpperCase() || 'KRAFT AQUATECH'}</span></div>
                <div>GSTIN : <span className="font-extrabold text-sm ml-2">{party?.gstin || '24AANFK2769B1ZD'}</span></div>
              </div>
              <div className="col-span-5 p-3 space-y-1.5 uppercase">
                <div className="flex justify-between">
                  <span>FROM DATE</span>
                  <span className="font-extrabold mr-12">{fromDateFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span>TO DATE</span>
                  <span className="font-extrabold mr-12">{toDateFormatted}</span>
                </div>
              </div>
            </div>

            {/* Main Ledger Book grid table */}
            <table className="w-full text-[10px] border-collapse text-black">
              <thead>
                <tr className="border-b-2 border-black text-left font-bold italic text-black">
                  <th className="p-2 border-r-2 border-black text-center w-10">SR</th>
                  <th className="p-2 border-r-2 border-black text-center w-20">DATE</th>
                  <th className="p-2 border-r-2 border-black px-2">TRANSACTION</th>
                  <th className="p-2 border-r-2 border-black px-2 w-24">REFERENCE</th>
                  <th className="p-2 border-r-2 border-black text-right w-24 px-2">DEBIT</th>
                  <th className="p-2 border-r-2 border-black text-right w-24 px-2">CREDIT</th>
                  <th className="p-2 text-right w-28 px-2">BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {printRows.map((row, idx) => {
                  const srNo = idx + 1;
                  const isPlaceholder = row.isPlaceholder;

                  return (
                    <tr key={idx} className="border-b border-gray-300 h-[7.5mm]">
                      <td className="p-1 border-r-2 border-black text-center font-bold">{srNo}</td>
                      <td className="p-1 border-r-2 border-black text-center font-medium">
                        {isPlaceholder ? '' : (row.date ? formatLedgerDate(row.date) : '')}
                      </td>
                      <td className="p-1 border-r-2 border-black px-2 font-semibold">
                        {isPlaceholder ? '' : row.transaction}
                      </td>
                      <td className="p-1 border-r-2 border-black px-2 font-bold">
                        {isPlaceholder ? '' : (row.reference || '-')}
                      </td>
                      <td className="p-1 border-r-2 border-black text-right font-bold px-2">
                        {isPlaceholder || !row.debit ? '' : Number(row.debit).toFixed(2)}
                      </td>
                      <td className="p-1 border-r-2 border-black text-right font-bold px-2">
                        {isPlaceholder || !row.credit ? '' : Number(row.credit).toFixed(2)}
                      </td>
                      <td className="p-1 text-right font-bold px-2 font-mono">
                        {isPlaceholder ? '' : (
                          <>
                            {Number(Math.abs(row.balance)).toFixed(2)}
                            <span className="text-[8px] ml-1 font-sans font-bold">
                              {row.balance === 0 ? 'Nil' : (row.balance > 0 ? 'Dr' : 'Cr')}
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black font-bold uppercase tracking-wide text-[10px]">
                  <td colSpan={4} className="p-2 text-right border-r-2 border-black">
                    TOTAL
                  </td>
                  <td className="p-2 text-right border-r-2 border-black font-extrabold px-2 font-mono">
                    {debitSum.toFixed(2)}
                  </td>
                  <td className="p-2 text-right border-r-2 border-black font-extrabold px-2 font-mono">
                    {creditSum.toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-extrabold px-2 font-mono">
                    {/* Blank or matching style */}
                  </td>
                </tr>
                <tr className="border-t border-black font-bold uppercase tracking-wide text-[10px]">
                  <td colSpan={4} className="p-2 text-right border-r-2 border-black">
                    NET CLOSING BALANCE
                  </td>
                  <td className="p-2 text-right border-r-2 border-black font-extrabold px-2 font-mono">
                    {!isDebitHigher && netBalance > 0 ? (
                      <>
                        {netBalance.toFixed(2)}
                        <span className="text-[8px] ml-1 font-sans font-bold">Dr</span>
                      </>
                    ) : ''}
                  </td>
                  <td className="p-2 text-right border-r-2 border-black font-extrabold px-2 font-mono">
                    {isDebitHigher && netBalance > 0 ? (
                      <>
                        {netBalance.toFixed(2)}
                        <span className="text-[8px] ml-1 font-sans font-bold">Cr</span>
                      </>
                    ) : ''}
                  </td>
                  <td className="p-2 text-right font-extrabold px-2 font-mono bg-gray-50">
                    {netBalance.toFixed(2)}
                    <span className="text-[8px] ml-1 font-sans font-bold">
                      {debitSum === creditSum ? 'Nil' : (isDebitHigher ? 'Dr' : 'Cr')}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default LedgerModal;