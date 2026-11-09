import React, { useEffect, useState, useRef, useMemo } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Printer, Download, Save, Check, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import bpcLogoAsset from '../src/assets/images/bpc_logo_1790426997620.jpg';
import { supabase } from '../lib/supabase';
import { getActiveCompanyId, formatDate } from '../utils/helpers';
import { useKeyboardShortcuts } from '../utils/shortcutManager';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  purePrintMode?: boolean;
  onSaveAndPrint?: () => void;
}

export function numberToWords(num: number): string {
  if (isNaN(num) || num === 0) return 'Rupees Zero only...';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);

  let str = 'Rupees ' + inWords(integerPart);
  if (decimalPart > 0) {
    str += ' and ' + inWords(decimalPart) + ' Paise';
  }
  str += ' only...';
  return str;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ 
  isOpen, 
  onClose, 
  invoice,
  purePrintMode = false,
  onSaveAndPrint
}) => {
  const cid = getActiveCompanyId();
  const [company, setCompany] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('local_db_companies');
      if (cached && cid) {
        const list = JSON.parse(cached);
        return list.find((c: any) => c.id === cid) || {};
      }
    } catch {}
    return {};
  });
  const [customer, setCustomer] = useState<any>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Print Preview Controls State
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [margins, setMargins] = useState<'Auto' | 'None' | 'Minimum'>('Auto');
  const [paperSize, setPaperSize] = useState<'A4 ( default )' | 'Letter' | 'Legal'>('A4 ( default )');
  const [taxDisplayMode, setTaxDisplayMode] = useState<'Auto' | 'CGST_SGST' | 'IGST'>('Auto');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    setZoomLevel(100);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !invoice) return;

    const fetchDetails = async () => {
      if (cid) {
        const { data: comp } = await supabase.from('companies').select('*').eq('id', cid).maybeSingle();
        if (comp) setCompany(comp);
      }
      const partyName = invoice.customer_name || invoice.vendor_name;
      if (partyName && cid) {
        let { data: cust } = await supabase.from('vendors').select('*').eq('company_id', cid).eq('name', partyName).eq('is_deleted', false).maybeSingle();
        if (!cust) {
          const res = await supabase.from('customers').select('*').eq('company_id', cid).eq('name', partyName).eq('is_deleted', false).maybeSingle();
          cust = res.data;
        }
        if (cust) setCustomer(cust);
      }
    };
    fetchDetails();
  }, [isOpen, invoice, cid]);

  const itemsRaw = invoice?.items_raw || invoice?.items || {};
  let lineItems: any[] = [];
  if (Array.isArray(invoice?.items)) {
    lineItems = invoice.items;
  } else if (Array.isArray(itemsRaw?.line_items)) {
    lineItems = itemsRaw.line_items;
  }

  let dutiesAndTaxes: any[] = [];
  if (Array.isArray(invoice?.duties_and_taxes)) {
    dutiesAndTaxes = invoice.duties_and_taxes;
  } else if (Array.isArray(itemsRaw?.duties_and_taxes)) {
    dutiesAndTaxes = itemsRaw.duties_and_taxes;
  } else if (Array.isArray(invoice?.items?.duties_and_taxes)) {
    dutiesAndTaxes = invoice.items.duties_and_taxes;
  }

  const payment = itemsRaw?.payment_details || invoice?.payment_details || {};

  // Company Details with fallbacks matching exact Screenshot (496)
  const companyName = company?.name || 'Bipin Petroleum Co.';
  const companyAddress = company?.address || 'Address Line 1';
  const companyPhone = company?.phone || '1234567890';
  const companyGstin = company?.gstin || '24CMAPK3117Q1ZZ';

  // Customer Details with fallbacks matching exact Screenshot (496)
  const customerName = invoice?.customer_name || invoice?.vendor_name || customer?.name || 'Customer Name';
  const customerAddress = customer?.address || 'Address Line 1';
  const customerPhone = customer?.phone || 'Customer Phone';
  const customerGstin = customer?.gstin || 'Customer GSTIN';
  const customerState = customer?.state || '';
  const customerCountry = customer?.country || '';
  const customerStateCountry = [customerState, customerCountry].filter(Boolean).join(', ') || 'Address Line 1';

  const shipToName = customerName;
  const shipToAddress = customer?.shipping_address || customerAddress;

  // Invoice Details with fallbacks matching exact Screenshot (496)
  const isPurchase = invoice?.type === 'Purchase' || (invoice?.vendor_name && !invoice?.customer_name);
  const invoiceTitle = isPurchase ? 'Purchase Bill / Invoice' : 'Tax Invoice';
  const invoiceNo = invoice?.invoice_number || invoice?.bill_number || '2026-27-001';
  const invoiceDate = invoice?.date ? formatDate(invoice.date) : 'DD/MM/YY';
  const poNumber = payment?.po_number || invoice?.po_number || itemsRaw?.po_number || 'PO/001';

  // GST & Tax Calculations
  const gstType = itemsRaw?.gst_type || invoice?.gst_type || 'Intra-State';
  const defaultIsInterState = gstType === 'Inter-State' || gstType === 'IGST';
  const isInterState = taxDisplayMode === 'Auto' ? defaultIsInterState : (taxDisplayMode === 'IGST');

  let totalQty = 0;
  let totalAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalSubtotal = 0;

  const calculatedItems = lineItems.map((item: any, idx: number) => {
    const qty = parseFloat(item.qty || item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const rawTax = item.tax_rate !== undefined ? item.tax_rate : (item.gst !== undefined ? item.gst : item.tax);
    const taxRate = (rawTax !== undefined && rawTax !== '' && !isNaN(Number(rawTax))) ? parseFloat(rawTax) : 0;
    const amount = parseFloat(item.taxableAmount) || (qty * rate);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isInterState) {
      igst = amount * (taxRate / 100);
    } else {
      cgst = amount * ((taxRate / 2) / 100);
      sgst = amount * ((taxRate / 2) / 100);
    }

    const subtotal = amount + (isInterState ? igst : (cgst + sgst));

    totalQty += qty;
    totalAmount += amount;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalSubtotal += subtotal;

    return {
      sr: idx + 1,
      name: item.itemName || item.name || `Item Name ${idx + 1}`,
      hsn: item.hsnCode || item.hsn || '1234',
      qty,
      rate,
      amount,
      taxRate,
      cgst,
      sgst,
      igst,
      subtotal
    };
  });

  // Additional Charges
  const appliedCharges = dutiesAndTaxes.filter((d: any) => {
    const amt = parseFloat(d.amount) || 0;
    return amt !== 0 && !['CGST', 'SGST', 'IGST'].includes((d.name || '').toUpperCase());
  });

  const sumAdditionalCharges = appliedCharges.reduce((acc: number, d: any) => {
    const amt = parseFloat(d.amount) || 0;
    return acc + (d.type === 'Deduction' ? -Math.abs(amt) : amt);
  }, 0);

  const taxableVal = invoice?.total_without_gst !== undefined ? parseFloat(invoice.total_without_gst) : totalAmount;
  const gstVal = invoice?.total_gst !== undefined ? parseFloat(invoice.total_gst) : (isInterState ? totalIgst : (totalCgst + totalSgst));

  const cgstDuty = dutiesAndTaxes.find((d: any) => (d.name || '').toUpperCase() === 'CGST');
  const sgstDuty = dutiesAndTaxes.find((d: any) => (d.name || '').toUpperCase() === 'SGST');
  const igstDuty = dutiesAndTaxes.find((d: any) => (d.name || '').toUpperCase() === 'IGST');

  const cgstVal = (!isInterState && cgstDuty && parseFloat(cgstDuty.amount) > 0)
    ? parseFloat(cgstDuty.amount)
    : (totalCgst > 0 ? totalCgst : (!isInterState ? gstVal / 2 : 0));
  const sgstVal = (!isInterState && sgstDuty && parseFloat(sgstDuty.amount) > 0)
    ? parseFloat(sgstDuty.amount)
    : (totalSgst > 0 ? totalSgst : (!isInterState ? gstVal / 2 : 0));
  const igstVal = (isInterState && igstDuty && parseFloat(igstDuty.amount) > 0)
    ? parseFloat(igstDuty.amount)
    : (totalIgst > 0 ? totalIgst : (isInterState ? gstVal : 0));

  const currentTotalBeforeRound = taxableVal + (isInterState ? igstVal : (cgstVal + sgstVal)) + sumAdditionalCharges;

  let roundOffVal = 0;
  if (invoice?.round_off !== undefined && invoice?.round_off !== null && !isNaN(Number(invoice.round_off))) {
    roundOffVal = parseFloat(invoice.round_off);
  } else if (invoice?.items_raw?.round_off !== undefined && invoice?.items_raw?.round_off !== null && !isNaN(Number(invoice.items_raw.round_off))) {
    roundOffVal = parseFloat(invoice.items_raw.round_off);
  } else if (invoice?.grand_total !== undefined && invoice?.grand_total !== null && Number(invoice.grand_total) > 0) {
    roundOffVal = parseFloat((parseFloat(invoice.grand_total) - currentTotalBeforeRound).toFixed(2));
  } else {
    roundOffVal = parseFloat((Math.round(currentTotalBeforeRound) - currentTotalBeforeRound).toFixed(2));
  }

  const grandTotalVal = invoice?.grand_total !== undefined && invoice.grand_total !== null && Number(invoice.grand_total) > 0 
    ? parseFloat(invoice.grand_total) 
    : parseFloat((currentTotalBeforeRound + roundOffVal).toFixed(2));

  const bankName = company?.bank_name || 'Navanagar Corporetive Bank LTD';
  const bankHolder = company?.account_holder || 'Bipin Petroleum Co.';
  const bankAccount = company?.account_number || '013000200000169';
  const bankIfsc = company?.ifsc_code || 'TNCB0000013';
  const bankUpi = company?.upi_id || '';

  // Native Print (Computer's print options / browser print preview)
  const handlePrint = async (silentMode: boolean = false) => {
    if ((window as any).electronAPI?.print) {
      if (!invoiceRef.current) return;
      try {
        // High-DPI rasterization matching PDF pipeline
        const imgData = await toPng(invoiceRef.current, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });

        await (window as any).electronAPI.print({
          imageData: imgData,
          invoiceNo,
          silent: silentMode,
          showPreview: true, 
        });
      } catch (err) {
        console.error('Electron print error:', err);
      }
      return;
    }

    if (!invoiceRef.current) {
      window.print();
      return;
    }

    // Web iframe print fallback...
    try {
      const htmlContent = invoiceRef.current.outerHTML;
      let printFrame = document.getElementById('tax-invoice-print-frame') as HTMLIFrameElement;
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'tax-invoice-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.visibility = 'hidden';
        document.body.appendChild(printFrame);
      }
      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Tax Invoice - ${invoiceNo}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box;
              }
              html, body {
                margin: 0;
                padding: 0;
                background-color: #ffffff;
                width: 100%;
              }
              @page {
                size: ${paperSize === 'Letter' ? 'letter' : paperSize === 'Legal' ? 'legal' : 'A4'} portrait;
                margin: 0mm !important;
              }
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
        `);
        frameDoc.close();
        setTimeout(() => {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        }, 250);
        return;
      }
    } catch (err) {
      console.warn('Iframe print error, falling back to window.print', err);
    }
    window.print();
  };

  // Download PDF
  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return;
    setDownloadingPdf(true);
    try {
      const imgData = await toPng(invoiceRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (invoiceRef.current.offsetHeight * pdfWidth) / invoiceRef.current.offsetWidth;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Tax_Invoice_${invoiceNo}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      // Fallback to browser print as PDF
      handlePrint();
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Save & Print action directly triggers browser or windows print options without extra popup
  const handleSaveAndPrintClick = () => {
    if (onSaveAndPrint) {
      onSaveAndPrint();
    }
    // Directly open the print preview of browser or windows print options
    handlePrint();
  };

  useKeyboardShortcuts({
    onPrint: isOpen && invoice ? handlePrint : undefined,
    onSave: isOpen && invoice ? handleSaveAndPrintClick : undefined,
    priority: 60
  }, [isOpen, invoice]);

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="absolute inset-0" 
        onClick={onClose} 
      />

      <div className="relative bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 w-full max-w-6xl rounded-xs shadow-2xl flex flex-col h-[92vh] max-h-[95vh] overflow-hidden z-10 transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <h2 className="text-[18px] font-normal text-slate-900 dark:text-white">Tax Invoice – Print Preview</h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Invoice Sheet in Frame with Zoom In/Out & 2D Scrolling */}
          <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 overflow-x-auto overflow-y-auto custom-scrollbar relative">
            {/* Zoom Controls centered sticky bar */}
            <div className="sticky top-0 z-30 mb-4 flex justify-center pointer-events-none">
              <div className="pointer-events-auto flex items-center space-x-1.5 bg-white/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 shadow-md px-3 py-1.5 rounded-full text-xs text-slate-700 dark:text-slate-300 backdrop-blur-xs">
                <button 
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-medium px-1 min-w-[42px] text-center">{zoomLevel}%</span>
                <button 
                  onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setZoomLevel(100)}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-600"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* A4 Invoice Paper Container with Zoom scale & Scroll Preservation */}
            <div className="min-w-fit w-full flex justify-center items-start pb-12">
              <div 
                style={{ 
                  width: `${794 * (zoomLevel / 100)}px`, 
                  height: `${1123 * (zoomLevel / 100)}px`,
                  transform: `scale(${zoomLevel / 100})`, 
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out'
                }}
                className="shrink-0"
              >
                <div
                  ref={invoiceRef}
                  style={{
                    width: '794px',
                    minWidth: '794px',
                    maxWidth: '794px',
                    height: '1123px',
                    minHeight: '1123px',
                  }}
                  className="invoice-print-sheet bg-white text-slate-900 p-8 border border-slate-300 text-[12px] leading-snug flex flex-col justify-between shadow-lg relative box-border"
                >
                  {/* Center Oil Can Watermark */}
                  <div 
                    className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden" 
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 500 500"
                      className="w-[360px] h-[360px] text-slate-900 fill-current opacity-[0.035]"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M 230 55 C 230 48 236 44 244 44 L 288 44 C 296 44 302 48 302 55 L 302 68 C 302 72 298 75 294 75 L 290 75 L 290 102 C 290 110 295 116 300 122 C 316 138 330 160 334 184 L 336 218 C 338 232 340 248 340 264 L 340 382 C 340 416 316 442 282 442 L 152 442 C 118 442 94 416 94 382 L 94 264 C 94 222 114 186 144 164 L 178 140 C 186 134 192 125 192 115 L 192 75 L 188 75 C 184 75 180 72 180 68 L 180 55 C 180 48 186 44 194 44 L 238 44 C 246 44 252 48 252 55 Z M 164 212 C 144 226 132 248 132 272 L 132 322 C 132 338 144 350 160 350 C 176 350 188 338 188 322 L 188 256 C 188 238 178 222 164 212 Z" />
                      <path d="M 388 138 C 388 138 434 204 434 240 C 434 268 410 292 382 292 C 354 292 330 268 330 240 C 330 204 376 138 388 138 Z" />
                    </svg>
                  </div>

                  {/* Printable Content sitting above watermark */}
                  <div className="relative z-10 flex flex-col justify-between flex-1">
                    <div>
                      {/* 1. Header: Fixed 340px Left and 340px Right */}
                      <div className="flex justify-between items-start pb-4">
                        {/* Left: Company Details */}
                        <div className="w-[340px] space-y-1.5">
                          <div className="flex items-center space-x-2.5 mb-2">
                            <img
                              src={company?.logo || bpcLogoAsset || "/bpc_logo.png"}
                              alt="Logo"
                              className="w-8 h-8 object-cover rounded-full flex-shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <h1 className="text-[19px] font-bold text-[#0f3460] tracking-tight leading-none truncate">
                              {companyName}
                            </h1>
                          </div>
                          <div className="grid grid-cols-[64px_1fr] text-[12px] text-slate-700 leading-snug">
                            <span className="text-slate-500 font-medium">Phone</span>
                            <span className="font-medium text-slate-900">{companyPhone}</span>
                          </div>
                          <div className="grid grid-cols-[64px_1fr] text-[12px] text-slate-700 leading-snug">
                            <span className="text-slate-500 font-medium">GSTIN</span>
                            <span className="font-mono font-bold text-slate-900">{companyGstin}</span>
                          </div>
                          <div className="grid grid-cols-[64px_1fr] text-[12px] text-slate-700 leading-snug">
                            <span className="text-slate-500 font-medium">Address</span>
                            <span className="text-slate-800 line-clamp-2">{companyAddress}</span>
                          </div>
                        </div>

                        {/* Right: Tax Invoice Metadata */}
                        <div className="w-[340px] space-y-1.5 text-right">
                          <h2 className="text-[19px] font-bold text-slate-900 mb-2">{invoiceTitle}</h2>
                          <div className="grid grid-cols-[160px_1fr] text-[12px] leading-snug">
                            <span className="text-slate-500 text-left">{isPurchase ? 'Bill / Invoice Number' : 'Invoice Number'}</span>
                            <span className="font-mono font-bold text-slate-900 text-right">{invoiceNo}</span>
                          </div>
                          <div className="grid grid-cols-[160px_1fr] text-[12px] leading-snug">
                            <span className="text-slate-500 text-left">{isPurchase ? 'Bill Date' : 'Invoice Date'}</span>
                            <span className="font-medium text-slate-900 text-right">{invoiceDate}</span>
                          </div>
                          <div className="grid grid-cols-[160px_1fr] text-[12px] leading-snug">
                            <span className="text-slate-500 text-left">Purchase Order Number</span>
                            <span className="font-mono font-medium text-slate-900 text-right">{poNumber}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Billed To & Shipped To Section */}
                      <div className="flex justify-between py-2.5 border-t border-slate-200">
                        {/* Billed To */}
                        <div className="w-[340px] space-y-1 text-[12px] leading-snug">
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">{isPurchase ? 'Supplier' : 'Billed to'}</span>
                            <span className="font-bold text-[12.5px] text-slate-900 truncate">{customerName}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">GSTIN</span>
                            <span className="font-mono font-bold text-slate-900">{customerGstin}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">Phone</span>
                            <span className="text-slate-900">{customerPhone}</span>
                          </div>
                        </div>

                        {/* Shipped To */}
                        <div className="w-[340px] space-y-1 text-[12px] leading-snug">
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">Shipped to</span>
                            <span className="font-bold text-[12.5px] text-slate-900 truncate">{shipToName}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">Address</span>
                            <span className="text-slate-900 line-clamp-2">{shipToAddress}</span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] items-baseline">
                            <span className="text-slate-500 font-medium">State & Country</span>
                            <span className="text-slate-900">{customerStateCountry}</span>
                          </div>
                        </div>
                      </div>

                      {/* 3. Items Table Section with fixed 730px layout and perfectly matching Total row */}
                      <div className="mt-3 min-h-[380px] flex flex-col justify-between border-b border-slate-200">
                        <div>
                          <table className="w-[730px] border-collapse text-[11.5px] table-fixed">
                            {isInterState ? (
                              <colgroup>
                                <col style={{ width: '36px' }} />
                                <col style={{ width: '210px' }} />
                                <col style={{ width: '64px' }} />
                                <col style={{ width: '44px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '76px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '102px' }} />
                                <col style={{ width: '80px' }} />
                              </colgroup>
                            ) : (
                              <colgroup>
                                <col style={{ width: '36px' }} />
                                <col style={{ width: '186px' }} />
                                <col style={{ width: '64px' }} />
                                <col style={{ width: '44px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '76px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '70px' }} />
                              </colgroup>
                            )}
                            <thead>
                              <tr className="bg-[#0f3460] text-white font-semibold">
                                <th className="py-2 px-2 text-center">Sr</th>
                                <th className="py-2 px-2 text-left">Particulars</th>
                                <th className="py-2 px-2 text-center">HSN</th>
                                <th className="py-2 px-2 text-center">QTY</th>
                                <th className="py-2 px-2 text-right">Rate</th>
                                <th className="py-2 px-2 text-right">Amount</th>
                                <th className="py-2 px-2 text-center">Tax %</th>
                                {isInterState ? (
                                  <th className="py-2 px-2 text-right">IGST</th>
                                ) : (
                                  <>
                                    <th className="py-2 px-2 text-right">CGST</th>
                                    <th className="py-2 px-2 text-right">SGST</th>
                                  </>
                                )}
                                <th className="py-2 px-2 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {calculatedItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="py-1.5 px-2 text-center text-slate-500">{item.sr}</td>
                                  <td className="py-1.5 px-2 font-medium text-slate-900 truncate" title={item.name}>{item.name}</td>
                                  <td className="py-1.5 px-2 text-center font-mono text-slate-600">{item.hsn}</td>
                                  <td className="py-1.5 px-2 text-center font-mono font-medium text-slate-900">{item.qty}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-slate-700">{item.rate.toFixed(2)}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-slate-900 font-medium">{item.amount.toFixed(2)}</td>
                                  <td className="py-1.5 px-2 text-center font-mono text-slate-600">{item.taxRate}%</td>
                                  {isInterState ? (
                                    <td className="py-1.5 px-2 text-right font-mono text-slate-700">{item.igst.toFixed(2)}</td>
                                  ) : (
                                    <>
                                      <td className="py-1.5 px-2 text-right font-mono text-slate-700">{item.cgst.toFixed(2)}</td>
                                      <td className="py-1.5 px-2 text-right font-mono text-slate-700">{item.sgst.toFixed(2)}</td>
                                    </>
                                  )}
                                  <td className="py-1.5 px-2 text-right font-mono font-semibold text-slate-900">{item.subtotal.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Total amount row perfectly matching the exact column layout above */}
                        <div className="w-full border-t-2 border-slate-300 font-bold bg-slate-50/80 shrink-0">
                          <table className="w-[730px] border-collapse text-[12px] table-fixed">
                            {isInterState ? (
                              <colgroup>
                                <col style={{ width: '36px' }} />
                                <col style={{ width: '210px' }} />
                                <col style={{ width: '64px' }} />
                                <col style={{ width: '44px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '76px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '102px' }} />
                                <col style={{ width: '80px' }} />
                              </colgroup>
                            ) : (
                              <colgroup>
                                <col style={{ width: '36px' }} />
                                <col style={{ width: '186px' }} />
                                <col style={{ width: '64px' }} />
                                <col style={{ width: '44px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '76px' }} />
                                <col style={{ width: '50px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '68px' }} />
                                <col style={{ width: '70px' }} />
                              </colgroup>
                            )}
                            <tbody>
                              <tr className="font-bold text-slate-900">
                                <td colSpan={3} className="py-2.5 px-3 text-slate-800 text-left font-bold">Total</td>
                                <td className="py-2.5 px-2 text-center font-mono font-bold">{totalQty}</td>
                                <td className="py-2.5 px-2"></td>
                                <td className="py-2.5 px-2 text-right font-mono font-bold">{totalAmount.toFixed(2)}</td>
                                <td className="py-2.5 px-2"></td>
                                {isInterState ? (
                                  <td className="py-2.5 px-2 text-right font-mono font-bold">{totalIgst.toFixed(2)}</td>
                                ) : (
                                  <>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold">{totalCgst.toFixed(2)}</td>
                                    <td className="py-2.5 px-2 text-right font-mono font-bold">{totalSgst.toFixed(2)}</td>
                                  </>
                                )}
                                <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-950">{totalSubtotal.toFixed(2)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* 4. Bottom Section: Totals, Additional Charges, Bank Details & Signature */}
                    <div className="mt-auto pt-4 space-y-4">
                      {/* Grand Total in words & Calculations */}
                      <div className="flex justify-between items-start pt-2">
                        {/* Left: In words */}
                        <div className="w-[340px] space-y-1">
                          <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Grand Total in words</div>
                          <div className="text-[13px] font-semibold text-slate-900 leading-relaxed capitalize">
                            {numberToWords(grandTotalVal)}
                          </div>
                        </div>

                        {/* Right: Amounts, CGST/SGST Breakdown, Additional Charges & Round Off */}
                        <div className="w-[340px] space-y-2 text-[12.5px]">
                          <div className="grid grid-cols-[180px_1fr] items-center text-slate-700">
                            <span className="text-left font-medium">Taxable Amount</span>
                            <span className="font-mono font-semibold text-slate-900 text-right">{taxableVal.toFixed(2)}</span>
                          </div>

                          {isInterState ? (
                            <div className="grid grid-cols-[180px_1fr] items-center text-slate-700">
                              <span className="text-left font-medium">Integrated Tax (IGST)</span>
                              <span className="font-mono font-semibold text-slate-900 text-right">{igstVal.toFixed(2)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-[180px_1fr] items-center text-slate-700">
                                <span className="text-left font-medium">Central Tax (CGST)</span>
                                <span className="font-mono font-semibold text-slate-900 text-right">{cgstVal.toFixed(2)}</span>
                              </div>
                              <div className="grid grid-cols-[180px_1fr] items-center text-slate-700">
                                <span className="text-left font-medium">State Tax (SGST)</span>
                                <span className="font-mono font-semibold text-slate-900 text-right">{sgstVal.toFixed(2)}</span>
                              </div>
                            </>
                          )}

                          {appliedCharges.length > 0 && (
                            <div className="pt-1.5 space-y-1 border-t border-slate-200">
                              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Additional Charges</div>
                              {appliedCharges.map((ch: any, idx: number) => (
                                <div key={idx} className="grid grid-cols-[180px_1fr] items-center text-slate-700">
                                  <span className="text-left">{ch.name}</span>
                                  <span className="font-mono font-medium text-right">{parseFloat(ch.amount || 0).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-[180px_1fr] items-center text-slate-700 pt-1 border-t border-slate-200">
                            <span className="font-medium text-left">Round Off</span>
                            <span className="font-mono font-semibold text-slate-900 text-right">
                              {roundOffVal > 0 ? `+${roundOffVal.toFixed(2)}` : (roundOffVal < 0 ? roundOffVal.toFixed(2) : '0.00')}
                            </span>
                          </div>

                          <div className="grid grid-cols-[160px_1fr] items-baseline border-t-2 border-slate-400 pt-2 font-bold text-slate-900">
                            <span className="text-[13.5px] text-left">Grand Total</span>
                            <span className="font-mono text-[16px] font-bold text-slate-900 text-right">{grandTotalVal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bank Details & Authorized Signatory */}
                      <div className="flex justify-between items-end border-t border-slate-200 pt-3">
                        {/* Bank Details */}
                        <div className="w-[340px] space-y-1 text-[12.5px]">
                          <div className="text-[12px] font-bold text-slate-700 uppercase tracking-wide mb-1">Bank Details</div>
                          <div className="grid grid-cols-[90px_1fr] items-center text-slate-600">
                            <span className="font-medium text-slate-500 text-left">Bank</span>
                            <span className="font-semibold text-slate-900 text-right truncate">{bankName}</span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] items-center text-slate-600">
                            <span className="font-medium text-slate-500 text-left">A/c Holder</span>
                            <span className="font-semibold text-slate-900 text-right truncate">{bankHolder}</span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] items-center text-slate-600">
                            <span className="font-medium text-slate-500 text-left">A/c Number</span>
                            <span className="font-mono font-bold text-slate-900 tracking-wider text-right">{bankAccount}</span>
                          </div>
                          <div className="grid grid-cols-[90px_1fr] items-center text-slate-600">
                            <span className="font-medium text-slate-500 text-left">IFSC Code</span>
                            <span className="font-mono font-bold text-slate-900 tracking-wide text-right">{bankIfsc}</span>
                          </div>
                          {bankUpi && (
                            <div className="grid grid-cols-[90px_1fr] items-center text-slate-600">
                              <span className="font-medium text-slate-500 text-left">UPI ID</span>
                              <span className="font-medium text-slate-900 text-right truncate">{bankUpi}</span>
                            </div>
                          )}
                        </div>

                        {/* Signatory */}
                        <div className="w-[340px] flex flex-col justify-between items-end text-right">
                          <div className="text-[12px] font-medium text-slate-600">
                            for {companyName}
                          </div>
                          <div className="pt-10">
                            <div className="w-44 border-b border-slate-400 mb-1.5" />
                            <div className="text-[11.5px] font-medium text-slate-600 w-44 text-center">
                              Authorized Signatory
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Options & Action Buttons */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between bg-white dark:bg-slate-900 shrink-0">
            <div className="space-y-6">
              {/* Tax / GST Format Dropdown */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">GST / Tax Format</label>
                <select
                  value={taxDisplayMode}
                  onChange={(e) => setTaxDisplayMode(e.target.value as any)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                >
                  <option value="Auto">Auto (from Invoice)</option>
                  <option value="CGST_SGST">SGST / CGST Format (Intra-State)</option>
                  <option value="IGST">IGST Format (Inter-State)</option>
                </select>
              </div>

              {/* Margins Dropdown */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">Margins</label>
                <select
                  value={margins}
                  onChange={(e) => setMargins(e.target.value as any)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                >
                  <option value="Auto">Auto</option>
                  <option value="None">None</option>
                  <option value="Minimum">Minimum</option>
                </select>
              </div>

              {/* Paper Size Dropdown */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">Paper Size</label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as any)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                >
                  <option value="A4 ( default )">A4 ( default )</option>
                  <option value="Letter">Letter</option>
                  <option value="Legal">Legal</option>
                </select>
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="space-y-2.5 pt-6">
              {/* Print as PDF Button */}
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-755 text-slate-700 dark:text-slate-200 font-medium text-xs rounded transition-colors shadow-2xs flex items-center justify-center space-x-2 cursor-pointer"
              >
                {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                <span>Print as PDF</span>
              </button>

              {/* Print Invoice Button (Opens computer print options) */}
              <button
                type="button"
                onClick={() => handlePrint()}
                className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-755 text-slate-700 dark:text-slate-200 font-medium text-xs rounded transition-colors shadow-2xs flex items-center justify-center space-x-2 cursor-pointer"
                title="Print Invoice (Ctrl + P)"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                <span>Print Invoice</span>
                <kbd className="text-[10px] text-slate-400 font-mono font-normal ml-1">Ctrl+P</kbd>
              </button>

              {/* Save & Print Button */}
              <button
                type="button"
                onClick={handleSaveAndPrintClick}
                className="w-full px-4 py-2 bg-primary hover:bg-primary-dark active:bg-blue-800 text-white font-medium text-xs rounded transition-colors shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
                title="Save & Print (Ctrl + S)"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                <span>Save & Print</span>
                <kbd className="text-[10px] text-blue-200 font-mono font-normal ml-1">Ctrl+S</kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePrintModal;
