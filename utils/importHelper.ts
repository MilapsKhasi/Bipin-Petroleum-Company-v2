
import * as XLSX from 'xlsx';
import { Bill, Vendor } from '../types';

// ==========================================
// CONFIGURATION & ALIASES
// ==========================================

const ALIASES = {
  bill: {
    number: ['billno', 'billnumber', 'invoiceno', 'invoicenumber', 'ref', 'reference', 'docno', 'invoice#', 'bill#', 'inv', 'invno'],
    date: ['date', 'billdate', 'invoicedate', 'entrydate', 'createdat', 'dt', 'invdate'],
    vendor: ['vendor', 'vendorname', 'party', 'partyname', 'supplier', 'name', 'account', 'customer'],
    amount: ['total', 'grandtotal', 'netamount', 'amount', 'payable', 'invoiceamount', 'billamount', 'finaltotal', 'amt', 'val', 'value', 'net'],
    gstin: ['gstin', 'gst', 'taxid', 'vat', 'gstno'],
    status: ['status', 'paymentstatus', 'paid', 'pymt']
  },
  vendor: {
    name: ['name', 'vendorname', 'vendor', 'party', 'partyname', 'account', 'ledger', 'supplier', 'customer', 'contactperson'],
    gst: ['gst', 'gstin', 'gstno', 'taxid', 'tin'],
    email: ['email', 'emailid', 'mail'],
    phone: ['phone', 'mobile', 'contact', 'cell', 'mobileno', 'ph'],
    address: ['address', 'billingaddress', 'city', 'location', 'addr'],
    balance: ['balance', 'openingbalance', 'due', 'closingbalance', 'amountdue', 'bal', 'currbal']
  },
  stock: {
    name: ['name', 'itemname', 'item', 'product', 'productname', 'stockitem', 'description', 'particulars', 'material', 'desc'],
    sku: ['sku', 'code', 'itemcode', 'productcode', 'partno', 'id', 'barcode'],
    rate: ['rate', 'price', 'purchaseprice', 'cost', 'unitprice', 'mrp', 'value', 'basicprice'],
    qty: ['qty', 'quantity', 'stock', 'instock', 'openingstock', 'units', 'closingstock', 'count', 'pcs', 'nos'],
    unit: ['unit', 'uom', 'measure', 'type'],
    hsn: ['hsn', 'sac', 'hsncode'],
    category: ['category', 'group', 'family', 'cat']
  }
};

// ==========================================
// HELPERS
// ==========================================

// Normalize string for comparison (removes special chars, lowercase)
const normalize = (str: any) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Robust Number Parser
// Handles: "1,000", "$500", "(500)" [negative], "₹ 1.25"
const parseCleanNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    
    let str = String(val).trim();
    
    // Handle accounting negative: (500) -> -500
    const isNegativeParenthesis = str.startsWith('(') && str.endsWith(')');
    
    // Remove currency symbols, commas, and spaces. Keep digits, dot, minus.
    str = str.replace(/[^0-9.-]/g, '');
    
    let num = parseFloat(str);
    if (isNaN(num)) return 0;
    
    return isNegativeParenthesis ? -num : num;
};

// Calculate Levenshtein distance for fuzzy matching
const getLevenshteinDistance = (s: string, t: string) => {
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const arr = [];
    for (let i = 0; i <= t.length; i++) {
        arr[i] = [i];
        for (let j = 1; j <= s.length; j++) {
            arr[i][j] =
                i === 0
                    ? j
                    : Math.min(
                          arr[i - 1][j] + 1,
                          arr[i][j - 1] + 1,
                          arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
                      );
        }
    }
    return arr[t.length][s.length];
};

// ==========================================
// SMART HEADER DETECTION
// ==========================================

const detectHeaderRow = (sheetData: any[][], type: 'bill' | 'vendor' | 'stock'): { headerIndex: number, map: Record<string, number> } => {
    let bestScore = -1;
    let bestIndex = 0;
    const maxScanRows = Math.min(sheetData.length, 5); // Scan first 5 rows only

    // Flatten all alias arrays for the specific type to check for matches
    const typeAliases = ALIASES[type];
    const allKeyAliases = Object.values(typeAliases).flat();

    for (let i = 0; i < maxScanRows; i++) {
        const row = sheetData[i];
        if (!Array.isArray(row)) continue;

        let score = 0;
        row.forEach(cell => {
            const val = normalize(cell);
            if (val.length > 1 && allKeyAliases.includes(val)) {
                score++;
            }
        });

        // Give preference to earlier rows if scores are tied, but if this row is significantly better, take it
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }

    // If no good header found, fallback to 0
    if (bestScore === 0) bestIndex = 0;

    // Create the Column Map (Alias -> Column Index)
    const headerRow = sheetData[bestIndex];
    const colMap: Record<string, number> = {};

    if (Array.isArray(headerRow)) {
        headerRow.forEach((cell, colIdx) => {
            const cellVal = normalize(cell);
            // Map exact matches
            for (const [key, aliases] of Object.entries(typeAliases)) {
                if (aliases.includes(cellVal)) {
                    colMap[key] = colIdx;
                    return; // Found match for this cell
                }
            }
            
            // Map Fuzzy matches if exact not found
            if (cellVal.length > 2) {
                 for (const [key, aliases] of Object.entries(typeAliases)) {
                    const match = aliases.some(alias => {
                        // Contains logic
                        if (cellVal.includes(alias)) return true;
                        // Distance logic
                        return getLevenshteinDistance(cellVal, alias) <= 1;
                    });
                    if (match && colMap[key] === undefined) {
                        colMap[key] = colIdx;
                    }
                 }
            }
        });
    }

    return { headerIndex: bestIndex, map: colMap };
};

// ==========================================
// MAIN PARSER
// ==========================================

export interface ImportResult {
    data: any[];
    invalidRows: any[];
    stats: {
        totalRows: number;
        valid: number;
        invalid: number;
    };
}

export const parseImportFile = async (file: File, type: 'bill' | 'vendor' | 'stock'): Promise<ImportResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                // cellDates: true helps with Excel date parsing
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                const result: ImportResult = {
                    data: [],
                    invalidRows: [],
                    stats: { totalRows: 0, valid: 0, invalid: 0 }
                };

                let globalIndexOffset = 0;

                // Process Every Sheet
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    // Get raw array of arrays (header: 1)
                    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
                    
                    if (sheetData.length === 0) continue;

                    // 1. Detect Header
                    const { headerIndex, map } = detectHeaderRow(sheetData, type);
                    
                    // 2. Process Data Rows (Start after header)
                    for (let i = headerIndex + 1; i < sheetData.length; i++) {
                        const row = sheetData[i];
                        // Skip completely empty rows
                        if (row.every(c => !c || String(c).trim() === '')) continue;
                        
                        // Check for Total/Summary rows (Aggressive filtering toned down)
                        const firstCell = String(row[0] || '').toLowerCase();
                        // Only skip if it explicitly says "Grand Total" or similar in the first column AND matches no other data structure
                        if ((firstCell.includes('total') || firstCell.includes('summary')) && row.length < 3) continue;

                        const uniqueId = `${Date.now()}-${globalIndexOffset}`;
                        const mappedItem = mapRow(row, map, type, uniqueId);

                        if (mappedItem.isValid) {
                            result.data.push(mappedItem.data);
                        } else {
                            result.invalidRows.push({ row: i + 1, sheet: sheetName, raw: row, reason: mappedItem.reason });
                        }
                        globalIndexOffset++;
                    }
                }

                result.stats.totalRows = result.data.length + result.invalidRows.length;
                result.stats.valid = result.data.length;
                result.stats.invalid = result.invalidRows.length;

                resolve(result);

            } catch (error) {
                console.error("Import Error:", error);
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// ==========================================
// ROW MAPPING LOGIC
// ==========================================

const getVal = (row: any[], index: number | undefined) => {
    if (index === undefined || index < 0 || index >= row.length) return '';
    const val = row[index];
    if (val instanceof Date) return val.toISOString().split('T')[0]; // Handle date objects
    return String(val).trim();
};

const mapRow = (row: any[], map: Record<string, number>, type: string, id: string) => {
    
    // Helper to get number from specific mapped column
    const getNum = (key: string) => parseCleanNumber(getVal(row, map[key]));
    // Helper to get string
    const getStr = (key: string) => getVal(row, map[key]);

    if (type === 'bill') {
        const vendor = getStr('vendor');
        const billNo = getStr('number');
        const total = getNum('amount');
        
        // Validation: Needs Vendor OR Bill No OR Total > 0
        if (!vendor && !billNo && total === 0) {
            return { isValid: false, reason: 'Missing Vendor, Bill No, and Amount' };
        }

        // Fix property naming to match Bill interface (snake_case) where applicable
        return {
            isValid: true,
            data: {
                id: id,
                bill_number: billNo || `DRAFT-${Math.floor(Math.random() * 1000)}`,
                date: getStr('date') || new Date().toISOString().split('T')[0],
                vendor_name: vendor || 'Unknown Vendor',
                // Keep extra fields for auto-creation logic
                gstin: getStr('gstin'),
                address: '',
                total_without_gst: 0, // Difficult to calculate without line items
                total_gst: 0,
                grand_total: total,
                items: [],
                status: (getStr('status').toLowerCase().includes('paid')) ? 'Paid' : 'Pending',
                round_off: 0,
                is_deleted: false,
                currencyCode: 'USD',
                exchangeRate: 1
            }
        };
    } 
    
    else if (type === 'vendor') {
        const name = getStr('name');
        if (!name) return { isValid: false, reason: 'Missing Vendor Name' };
        
        return {
            isValid: true,
            data: {
                id: id,
                name: name,
                email: getStr('email'),
                phone: getStr('phone'),
                gstin: getStr('gst'),
                address: getStr('address'),
                balance: getNum('balance'),
                status: 'Active'
            }
        };
    } 
    
    else if (type === 'stock') {
        const name = getStr('name');
        if (!name) return { isValid: false, reason: 'Missing Item Name' };

        const qty = getNum('qty');

        return {
            isValid: true,
            data: {
                id: Date.now() + Math.random(), // Stock needs number ID usually, but using random to avoid collisions
                name: name,
                sku: getStr('sku') || `SKU-${Math.floor(Math.random()*10000)}`,
                category: getStr('category') || 'General',
                unit: getStr('unit') || 'PCS',
                hsn: getStr('hsn'),
                rate: getNum('rate'),
                inStock: qty,
                outOfStock: 0,
                total: qty, // Assuming import is initial stock
                description: '',
                taxRate: ''
            }
        };
    }

    return { isValid: false, reason: 'Unknown Type' };
};

export const autoCreateDependencies = (importedData: any[], type: 'bill') => {
    const savedVendors = JSON.parse(localStorage.getItem('vendors') || '[]');
    let vendorsUpdated = false;

    if (type === 'bill') {
        // Use any to allow access to intermediate fields like gstin and address
        importedData.forEach((bill: any) => {
            // Fix property access to use vendor_name instead of vendorName to match update in mapRow
            if (bill.vendor_name && bill.vendor_name !== 'Unknown Vendor') {
                const exists = savedVendors.find((v: Vendor) => v.name.toLowerCase() === bill.vendor_name.toLowerCase());
                if (!exists) {
                    const newVendor: Vendor = {
                        id: Date.now().toString() + Math.random(),
                        name: bill.vendor_name,
                        gstin: bill.gstin || '',
                        address: bill.address || '',
                        email: '',
                        phone: '',
                        balance: 0
                        // status: 'Active' removed because 'status' property does not exist in type 'Vendor'
                    };
                    savedVendors.push(newVendor);
                    vendorsUpdated = true;
                }
            }
        });
    }

    if (vendorsUpdated) {
        localStorage.setItem('vendors', JSON.stringify(savedVendors));
    }
};
