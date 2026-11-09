
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './helpers';

export interface ExportConfig {
    companyName: string;
    gstin: string;
    email: string;
    phone: string;
    address: string;
    reportTitle: string;
    dateRange: string;
}

export const exportToExcel = (
    headers: string[], 
    rows: any[][], 
    config: ExportConfig
) => {
    const sheetData: any[][] = [];
    
    // Header Section for Excel
    sheetData.push([config.companyName.toUpperCase()]); 
    sheetData.push([`GSTIN: ${config.gstin || 'N/A'} | Address: ${config.address || 'N/A'}`]); 
    sheetData.push([`REPORT: ${config.reportTitle} | PERIOD: ${config.dateRange}`]);
    sheetData.push([]); // Spacer
    sheetData.push(headers);

    rows.forEach(row => {
        sheetData.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const colWidths = headers.map(h => ({ wch: Math.max(h.length + 5, 12) }));
    ws['!cols'] = colWidths;

    const lastColIndex = headers.length - 1;
    if (lastColIndex > 0) {
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIndex } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIndex } },
            { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIndex } }
        ];
    }

    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${config.reportTitle.replace(/\s+/g, '_')}_${new Date().getTime()}.xlsx`);
};

/**
 * Specialized export for Cashbook Entry Sheet matching the visual reference:
 * - High-impact colored headers (Green for Income, Red for Expense)
 * - Unified column widths for vertical alignment
 * - Bottom summary ledger
 */
export const exportCashbookEntryToPDF = (
    incomeRows: any[],
    expenseRows: any[],
    config: { companyName: string; date: string; openingBalance: number; openingDateText: string }
) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 20;

    const formattedDate = formatDate(config.date);

    const incomeTotal = incomeRows.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
    const expenseTotal = expenseRows.reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
    const netClosing = config.openingBalance + incomeTotal - expenseTotal;

    const sharedColumnStyles: any = {
        0: { cellWidth: 20, halign: 'center' }, // SR NO
        1: { cellWidth: 'auto', halign: 'left' }, // PARTICULARS
        2: { cellWidth: 40, halign: 'right' }  // AMOUNT
    };

    // 1. Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(config.companyName.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;

    // 2. Report Sub-header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`DAILY CASH STATEMENT - DATE: ${formattedDate}`, pageWidth / 2, currentY, { align: 'center' });
    currentY += 12;

    // 3. Opening Balance Block
    autoTable(doc, {
        startY: currentY,
        body: [
            [`OPENING BALANCE FOR DATE ${config.openingDateText}`, config.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })]
        ],
        theme: 'grid',
        styles: { fontSize: 11, fontStyle: 'bold', cellPadding: 5, textColor: [0, 0, 0], lineWidth: 0.15, lineColor: [200, 200, 200] },
        columnStyles: {
            0: { halign: 'left', cellWidth: 'auto' },
            1: { halign: 'right', cellWidth: 40 }
        }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // 4. Income Section (Emerald Green)
    autoTable(doc, {
        startY: currentY,
        head: [
            [{ content: 'INCOME (INWARDS)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fillColor: [0, 185, 93], textColor: [255, 255, 255], fontSize: 12 } }],
            ['SR NO', 'PARTICULARS', 'AMOUNT']
        ],
        body: incomeRows.map((row, i) => [i + 1, row.particulars.toUpperCase(), parseFloat(row.amount || '0').toFixed(2)]),
        foot: [['', 'TOTAL INWARD', incomeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })]],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.1, lineColor: [220, 220, 220] },
        headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 },
        columnStyles: sharedColumnStyles,
        footStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 128, 0], fontSize: 10 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // 5. Expense Section (Vibrant Red)
    autoTable(doc, {
        startY: currentY,
        head: [
            [{ content: 'EXPENSE (OUTWARDS)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 12 } }],
            ['SR NO', 'PARTICULARS', 'AMOUNT']
        ],
        body: expenseRows.map((row, i) => [i + 1, row.particulars.toUpperCase(), parseFloat(row.amount || '0').toFixed(2)]),
        foot: [['', 'TOTAL OUTWARD', expenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })]],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.1, lineColor: [220, 220, 220] },
        headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 8 },
        columnStyles: sharedColumnStyles,
        footStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [220, 38, 38], fontSize: 10 }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // 6. Bottom Summary Ledger
    autoTable(doc, {
        startY: currentY,
        body: [
            ['Total Income', incomeTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            ['Total Expense', expenseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })],
            [`CLOSING BALANCE FOR DATE ${formattedDate}`, netClosing.toLocaleString('en-IN', { minimumFractionDigits: 2 })]
        ],
        theme: 'grid',
        styles: { fontSize: 12, fontStyle: 'bold', cellPadding: 5, textColor: [0, 0, 0], lineWidth: 0.15, lineColor: [200, 200, 200] },
        columnStyles: {
            0: { halign: 'left', cellWidth: 'auto' },
            1: { halign: 'right', cellWidth: 50 }
        }
    });

    const footerText = "GENERATED BY FINDESK PRIME";
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    doc.save(`Cashbook_${formattedDate.replace(/\//g, '-')}.pdf`);
};

export const exportCashbookEntryToExcel = (
    incomeRows: any[],
    expenseRows: any[],
    config: { companyName: string; date: string; openingBalance: number; openingDateText: string }
) => {
    const ws_data: any[][] = [];
    const formattedDate = formatDate(config.date);
    ws_data.push([config.companyName.toUpperCase()]);
    ws_data.push([`DAILY CASH STATEMENT - DATE: ${formattedDate}`]);
    ws_data.push([]);
    
    ws_data.push([`OPENING BALANCE FOR DATE ${config.openingDateText}`, "", config.openingBalance]);
    ws_data.push([]);

    ws_data.push(["INCOME (INWARDS)"]);
    ws_data.push(["SR NO", "PARTICULARS", "AMOUNT"]);
    let totalIn = 0;
    incomeRows.forEach((r, i) => {
        const amt = parseFloat(r.amount) || 0;
        totalIn += amt;
        ws_data.push([i + 1, r.particulars.toUpperCase(), amt]);
    });
    ws_data.push(["TOTAL INWARD", "", totalIn]);
    
    ws_data.push([]);
    ws_data.push(["EXPENSE (OUTWARDS)"]);
    ws_data.push(["SR NO", "PARTICULARS", "AMOUNT"]);
    let totalOut = 0;
    expenseRows.forEach((r, i) => {
        const amt = parseFloat(r.amount) || 0;
        totalOut += amt;
        ws_data.push([i + 1, r.particulars.toUpperCase(), amt]);
    });
    ws_data.push(["TOTAL OUTWARD", "", totalOut]);
    
    ws_data.push([]);
    ws_data.push(["Total Income", "", totalIn]);
    ws_data.push(["Total Expense", "", totalOut]);
    const closing = config.openingBalance + totalIn - totalOut;
    ws_data.push([`CLOSING BALANCE FOR DATE ${formattedDate}`, "", closing]);

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Cashbook_${formattedDate.replace(/\//g, '-')}.xlsx`);
};

export const exportToCSV = (headers: string[], rows: any[][], config: ExportConfig) => {
    const csvContent = [
        `"${config.companyName.replace(/"/g, '""')}"`,
        `"GSTIN: ${config.gstin}","Address: ${config.address}"`,
        `"Report: ${config.reportTitle}","Period: ${config.dateRange}"`,
        '',
        headers.join(','),
        ...rows.map(row => row.map(cell => {
            const stringCell = String(cell ?? '');
            if (stringCell.includes(',') || stringCell.includes('"') || stringCell.includes('\n')) {
                return `"${stringCell.replace(/"/g, '""')}"`;
            }
            return stringCell;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${config.reportTitle.replace(/\s+/g, '_')}_Data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const triggerPrint = () => {
    window.print();
};
