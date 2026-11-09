import * as XLSX from 'xlsx';
import { getAllFromIDB, upsertToIDB, saveAllToIDB, IDBStoreName, IDB_STORES } from './idb';
import { getActiveCompanyId } from '../utils/helpers';

export type BackupFrequency = 'every_transaction' | 'daily' | 'weekly' | 'monthly' | 'manual_only';
export type BackupFormat = 'excel' | 'json';

export interface BackupConfig {
  frequency: BackupFrequency;
  format: BackupFormat;
  autoDownload: boolean;
  lastBackupTimestamp: number | null;
  lastBackupFilename?: string;
  lastBackupRecords?: number;
  lastBackupModules?: number;
}

export interface BackupHistoryEntry {
  id: string;
  timestamp: number;
  type: 'auto' | 'manual';
  trigger: string;
  format: BackupFormat;
  filename: string;
  totalRecords: number;
  totalModules: number;
  modules: string[];
}

export interface WorkspaceBackupData {
  metadata: {
    appName: string;
    version: string;
    generatedAt: string;
    companyId: string;
    companyName: string;
    totalModules: number;
    totalRecords: number;
    modulesIncluded: string[];
  };
  tables: Record<string, any[]>;
}

const CONFIG_KEY = 'bp_backup_configuration';
const HISTORY_KEY = 'bp_backup_history_log';
const LAST_BACKUP_KEY = 'bp_last_backup_timestamp';

export function getBackupConfig(): BackupConfig {
  if (typeof localStorage === 'undefined') {
    return {
      frequency: 'daily',
      format: 'excel',
      autoDownload: true,
      lastBackupTimestamp: null,
    };
  }

  const raw = localStorage.getItem(CONFIG_KEY);
  let config: Partial<BackupConfig> = {};
  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch {}
  }

  const lastTimeRaw = localStorage.getItem(LAST_BACKUP_KEY);
  const lastTime = lastTimeRaw ? parseInt(lastTimeRaw, 10) : null;

  return {
    frequency: config.frequency || 'daily',
    format: config.format || 'excel',
    autoDownload: config.autoDownload !== undefined ? config.autoDownload : true,
    lastBackupTimestamp: config.lastBackupTimestamp || (!isNaN(Number(lastTime)) ? lastTime : null),
    lastBackupFilename: config.lastBackupFilename,
    lastBackupRecords: config.lastBackupRecords,
    lastBackupModules: config.lastBackupModules,
  };
}

export function saveBackupConfig(newConfig: Partial<BackupConfig>): BackupConfig {
  const current = getBackupConfig();
  const updated: BackupConfig = { ...current, ...newConfig };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    if (updated.lastBackupTimestamp) {
      localStorage.setItem(LAST_BACKUP_KEY, String(updated.lastBackupTimestamp));
    }
  }
  notifyBackupListeners();
  return updated;
}

export function getBackupHistory(): BackupHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addBackupHistoryEntry(entry: BackupHistoryEntry) {
  if (typeof localStorage === 'undefined') return;
  const history = getBackupHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 30); // keep last 30 backup entries
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  notifyBackupListeners();
}

let backupListeners: Array<() => void> = [];

export function subscribeBackupEvents(callback: () => void): () => void {
  backupListeners.push(callback);
  return () => {
    backupListeners = backupListeners.filter((cb) => cb !== callback);
  };
}

function notifyBackupListeners() {
  backupListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('[BackupEngine] Listener error:', e);
    }
  });
}

/**
 * Human-readable sheet & module title mapping
 */
export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  companies: 'Workspaces',
  sales_invoices: 'Sales Invoices',
  purchase_bills: 'Purchase Bills',
  customers: 'Customers',
  vendors: 'Vendors',
  stock_items: 'Stock Inventory',
  stock_groups: 'Stock Groups',
  cashbooks: 'Cashbook Entries',
  cashbook: 'Cashbook Entries',
  duties_taxes: 'Additional Charges',
  additional_charges: 'Additional Charges',
  payments_in: 'Receive Payments',
  payments_out: 'Made Payments',
  delivery_challans: 'Delivery Challans',
  users: 'Users & Staff',
  licenses: 'License Registrations'
};

/**
 * Fetches all non-empty tables for the current workspace.
 * Strictly ignores modules that contain no data.
 */
export async function getPopulatedWorkspaceData(targetCompanyId?: string): Promise<WorkspaceBackupData> {
  const cid = targetCompanyId || getActiveCompanyId();
  const rawCompanies = await getAllFromIDB('companies');
  const activeComp = rawCompanies.find((c: any) => c.id === cid) || rawCompanies[0] || { id: 'default', name: 'Bipin Petroleum Co.' };

  const tablesToScan: IDBStoreName[] = [
    'companies',
    'sales_invoices',
    'purchase_bills',
    'customers',
    'vendors',
    'stock_items',
    'stock_groups',
    'cashbooks',
    'duties_taxes',
    'payments_in',
    'payments_out',
    'delivery_challans',
    'users',
    'licenses'
  ];

  const populatedTables: Record<string, any[]> = {};
  let totalRecordsCount = 0;
  const includedModuleNames: string[] = [];

  for (const store of tablesToScan) {
    try {
      let records = await getAllFromIDB(store);
      if (!records || !Array.isArray(records)) {
        // Check localStorage fallback
        const rawLocal = localStorage.getItem(`local_db_${store}`);
        if (rawLocal) {
          try {
            records = JSON.parse(rawLocal);
          } catch {}
        }
      }

      if (records && Array.isArray(records)) {
        // Filter by company_id if multi-tenant data, except global stores
        const isScopedStore = ['sales_invoices', 'purchase_bills', 'customers', 'vendors', 'stock_items', 'cashbooks', 'duties_taxes', 'payments_in', 'payments_out', 'delivery_challans'].includes(store);
        
        let filtered = records;
        if (isScopedStore && cid) {
          filtered = records.filter((r: any) => !r.company_id || r.company_id === cid);
        }

        // Exclude hard-deleted or soft-deleted items if required, or keep them with flag
        // Filter out non-records or empty elements
        filtered = filtered.filter((r: any) => r && typeof r === 'object' && Object.keys(r).length > 0 && !r.is_deleted);

        // ONLY include if the table has data (> 0 records)
        if (filtered.length > 0) {
          populatedTables[store] = filtered;
          totalRecordsCount += filtered.length;
          includedModuleNames.push(store);
        }
      }
    } catch (err) {
      console.warn(`[BackupEngine] Error reading store ${store}:`, err);
    }
  }

  const now = new Date();
  return {
    metadata: {
      appName: 'Bipin Petroleum Co. Purchase & Stock Management System',
      version: '1.0',
      generatedAt: now.toISOString(),
      companyId: activeComp.id,
      companyName: activeComp.name || 'Bipin Petroleum Co.',
      totalModules: includedModuleNames.length,
      totalRecords: totalRecordsCount,
      modulesIncluded: includedModuleNames,
    },
    tables: populatedTables,
  };
}

/**
 * Downloads a string or binary buffer as a file in the browser
 */
function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Formats a record row cleanly for Excel tabular display
 */
function sanitizeRowForExcel(row: any): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === 'items' && Array.isArray(val)) {
      clean['items_summary'] = val.map((i: any) => `${i.item_name || i.name || 'Item'} (Qty: ${i.qty || i.quantity || 1}, Rate: ₹${i.rate || i.price || 0})`).join(' | ');
      clean['items_count'] = val.length;
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = JSON.stringify(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Creates and downloads a multi-sheet Excel (.xlsx) backup file.
 * Ignores any module that has no data.
 */
export async function generateExcelBackup(targetCompanyId?: string): Promise<{
  blob: Blob;
  filename: string;
  totalRecords: number;
  totalModules: number;
  moduleNames: string[];
  companyName: string;
}> {
  const data = await getPopulatedWorkspaceData(targetCompanyId);
  const timestamp = new Date().toISOString().slice(0, 10);
  const timeCode = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const cleanCompName = data.metadata.companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanCompName}_Backup_${timestamp}_${timeCode}.xlsx`;

  const wb = XLSX.utils.book_new();

  // 1. Overview Summary Sheet
  const summaryRows = [
    { 'Property': 'Company Name', 'Value': data.metadata.companyName },
    { 'Property': 'Backup Date & Time', 'Value': new Date().toLocaleString() },
    { 'Property': 'Application', 'Value': data.metadata.appName },
    { 'Property': 'Total Active Records', 'Value': data.metadata.totalRecords },
    { 'Property': 'Total Modules Backed Up', 'Value': data.metadata.totalModules },
    { 'Property': '', 'Value': '' },
    { 'Property': '--- MODULE BREAKDOWN ---', 'Value': '--- RECORD COUNT ---' },
    ...data.metadata.modulesIncluded.map((mod) => ({
      'Property': MODULE_DISPLAY_NAMES[mod] || mod,
      'Value': `${data.tables[mod]?.length || 0} records`
    }))
  ];
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Backup Overview');

  // 2. Individual Sheet for each populated module
  for (const [storeName, records] of Object.entries(data.tables)) {
    if (!records || records.length === 0) continue;

    const sheetName = (MODULE_DISPLAY_NAMES[storeName] || storeName).slice(0, 31); // Excel sheet max 31 chars
    const sanitizedRows = records.map((r) => sanitizeRowForExcel(r));
    const ws = XLSX.utils.json_to_sheet(sanitizedRows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  return {
    blob,
    filename,
    totalRecords: data.metadata.totalRecords,
    totalModules: data.metadata.totalModules,
    moduleNames: data.metadata.modulesIncluded,
    companyName: data.metadata.companyName,
  };
}

/**
 * Creates and downloads a JSON (.json) backup file.
 * Ignores any module that has no data.
 */
export async function generateJsonBackup(targetCompanyId?: string): Promise<{
  blob: Blob;
  filename: string;
  totalRecords: number;
  totalModules: number;
  moduleNames: string[];
  companyName: string;
}> {
  const data = await getPopulatedWorkspaceData(targetCompanyId);
  const timestamp = new Date().toISOString().slice(0, 10);
  const timeCode = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const cleanCompName = data.metadata.companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanCompName}_Backup_${timestamp}_${timeCode}.json`;

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });

  return {
    blob,
    filename,
    totalRecords: data.metadata.totalRecords,
    totalModules: data.metadata.totalModules,
    moduleNames: data.metadata.modulesIncluded,
    companyName: data.metadata.companyName,
  };
}

/**
 * Executes a manual backup export in either Excel or JSON format
 */
export async function executeManualBackup(format: BackupFormat, options?: { autoDownload?: boolean }): Promise<{
  success: boolean;
  filename: string;
  format: BackupFormat;
  totalRecords: number;
  totalModules: number;
  moduleNames: string[];
}> {
  try {
    const shouldDownload = options?.autoDownload !== undefined ? options.autoDownload : true;
    let result: {
      blob: Blob;
      filename: string;
      totalRecords: number;
      totalModules: number;
      moduleNames: string[];
    };

    if (format === 'excel') {
      result = await generateExcelBackup();
    } else {
      result = await generateJsonBackup();
    }

    if (shouldDownload) {
      triggerBrowserDownload(result.blob, result.filename);
    }

    const now = Date.now();
    saveBackupConfig({
      lastBackupTimestamp: now,
      lastBackupFilename: result.filename,
      lastBackupRecords: result.totalRecords,
      lastBackupModules: result.totalModules,
    });

    addBackupHistoryEntry({
      id: `backup_${now}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      type: 'manual',
      trigger: 'User Manual Request',
      format,
      filename: result.filename,
      totalRecords: result.totalRecords,
      totalModules: result.totalModules,
      modules: result.moduleNames,
    });

    return {
      success: true,
      filename: result.filename,
      format,
      totalRecords: result.totalRecords,
      totalModules: result.totalModules,
      moduleNames: result.moduleNames,
    };
  } catch (err: any) {
    console.error('[BackupEngine] Manual backup export failed:', err);
    throw err;
  }
}

/**
 * Checks schedule and automatically runs backup if due.
 * Called on every data mutation (transaction) or on interval timers.
 */
export async function checkAndTriggerAutoBackup(triggerType: 'transaction' | 'timer' | 'startup'): Promise<boolean> {
  const config = getBackupConfig();

  if (config.frequency === 'manual_only') {
    return false;
  }

  const now = Date.now();
  const lastTime = config.lastBackupTimestamp || 0;
  const elapsedMs = now - lastTime;

  let shouldRun = false;

  switch (config.frequency) {
    case 'every_transaction':
      if (triggerType === 'transaction') {
        shouldRun = true;
      }
      break;
    case 'daily':
      // 24 hours = 86,400,000 ms
      if (elapsedMs >= 24 * 60 * 60 * 1000 || lastTime === 0) {
        shouldRun = true;
      }
      break;
    case 'weekly':
      // 7 days = 604,800,000 ms
      if (elapsedMs >= 7 * 24 * 60 * 60 * 1000 || lastTime === 0) {
        shouldRun = true;
      }
      break;
    case 'monthly':
      // 30 days = 2,592,000,000 ms
      if (elapsedMs >= 30 * 24 * 60 * 60 * 1000 || lastTime === 0) {
        shouldRun = true;
      }
      break;
  }

  if (!shouldRun) return false;

  console.log(`[BackupEngine] Auto-backup triggered by ${triggerType} (Schedule: ${config.frequency}, Format: ${config.format})`);

  try {
    let result: {
      blob: Blob;
      filename: string;
      totalRecords: number;
      totalModules: number;
      moduleNames: string[];
    };

    if (config.format === 'excel') {
      result = await generateExcelBackup();
    } else {
      result = await generateJsonBackup();
    }

    if (config.autoDownload) {
      triggerBrowserDownload(result.blob, result.filename);
    }

    saveBackupConfig({
      lastBackupTimestamp: now,
      lastBackupFilename: result.filename,
      lastBackupRecords: result.totalRecords,
      lastBackupModules: result.totalModules,
    });

    addBackupHistoryEntry({
      id: `backup_${now}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      type: 'auto',
      trigger: `Auto (${config.frequency})`,
      format: config.format,
      filename: result.filename,
      totalRecords: result.totalRecords,
      totalModules: result.totalModules,
      modules: result.moduleNames,
    });

    return true;
  } catch (err) {
    console.warn('[BackupEngine] Auto backup failed:', err);
    return false;
  }
}

/**
 * Restores all database tables from a valid JSON backup file
 */
export async function restoreDatabaseFromJson(file: File): Promise<{
  success: boolean;
  totalRestored: number;
  modulesRestored: string[];
  message: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        const tablesData = parsed.tables || parsed.data || (typeof parsed === 'object' ? parsed : null);
        if (!tablesData || typeof tablesData !== 'object') {
          throw new Error('Invalid backup file format: missing tables data.');
        }

        let totalRestored = 0;
        const modulesRestored: string[] = [];

        for (const [storeName, items] of Object.entries(tablesData)) {
          if (!Array.isArray(items) || items.length === 0) continue;

          // Validate if recognized IDB store
          if (IDB_STORES.includes(storeName as IDBStoreName)) {
            await saveAllToIDB(storeName as IDBStoreName, items);
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(`local_db_${storeName}`, JSON.stringify(items));
            }
            totalRestored += items.length;
            modulesRestored.push(storeName);
          }
        }

        window.dispatchEvent(new Event('appSettingsChanged'));
        window.dispatchEvent(new Event('partiesUpdated'));
        window.dispatchEvent(new Event('stockUpdated'));

        resolve({
          success: true,
          totalRestored,
          modulesRestored,
          message: `Successfully restored ${totalRestored} records across ${modulesRestored.length} modules!`,
        });
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read backup file.'));
    reader.readAsText(file);
  });
}

// Background timer to check scheduled daily/weekly/monthly auto backups every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    checkAndTriggerAutoBackup('timer').catch(() => {});
  }, 10 * 60 * 1000);
}
