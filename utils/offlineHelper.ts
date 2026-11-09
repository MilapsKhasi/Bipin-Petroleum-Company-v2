import { supabase } from '../lib/supabase';
import { getActiveCompanyId, formatDate } from './helpers';

// Local storage key for directory sync
const DISK_FOLDER_KEY = 'offline_sync_folder_name';
const OFFLINE_ENABLED_KEY = 'offline_disk_sync_enabled';

export const getOfflineSyncStatus = () => {
  const enabled = localStorage.getItem(OFFLINE_ENABLED_KEY) === 'true';
  const folderName = localStorage.getItem(DISK_FOLDER_KEY) || 'StockRegisterData';
  return { enabled, folderName };
};

export const setOfflineSyncStatus = (enabled: boolean, folderName?: string) => {
  localStorage.setItem(OFFLINE_ENABLED_KEY, String(enabled));
  if (folderName) localStorage.setItem(DISK_FOLDER_KEY, folderName);
};

export const fetchFullWorkspaceBackup = async () => {
  const cid = getActiveCompanyId();
  if (!cid) throw new Error("No active workspace found.");

  const tables = [
    'companies', 'sales_invoices', 'purchase_bills', 
    'customers', 'vendors', 'stock_items', 'cashbook', 'duties_taxes'
  ];

  const backup: { [key: string]: any[] } = {};

  for (const table of tables) {
    const query = (table === 'companies')
      ? supabase.from(table).select('*').eq('id', cid)
      : supabase.from(table).select('*').eq('company_id', cid);
      
    const { data } = await query;
    backup[table] = data || [];
  }

  return backup;
};

export const downloadJsonToDisk = (data: any, filename: string) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportFullDatabaseToFolder = async () => {
  const backup = await fetchFullWorkspaceBackup();
  const timestamp = new Date().toISOString().slice(0, 10);
  
  // Try modern File System Access API if user supports directory picker
  if ('showDirectoryPicker' in window) {
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      for (const [table, records] of Object.entries(backup)) {
        // @ts-ignore
        const fileHandle = await dirHandle.getFileHandle(`${table}_backup_${timestamp}.json`, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(records, null, 2));
        await writable.close();
      }
      setOfflineSyncStatus(true, dirHandle.name || 'LocalDiskFolder');
      return { success: true, method: 'directory_picker', folder: dirHandle.name };
    } catch (e: any) {
      if (e.name === 'AbortError') return { success: false, aborted: true };
      // Fallback to standard download below
    }
  }

  // Fallback: Download a combined JSON backup file to hard disk downloads folder
  const filename = `StockRegister_FullData_${timestamp}.json`;
  downloadJsonToDisk(backup, filename);
  setOfflineSyncStatus(true, 'Downloads/StockRegisterData');
  return { success: true, method: 'download_fallback', filename };
};

export const downloadStandaloneOfflineLauncher = async () => {
  const backup = await fetchFullWorkspaceBackup();
  const timestamp = new Date().toISOString().slice(0, 10);
  const companyName = backup.companies?.[0]?.name || 'Stock Register App';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${companyName} - Standalone Offline App</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; bg: #f8fafc; color: #0f172a; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h1 { color: #dc2626; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0; }
    .stat-card { background: #f1f5f9; padding: 1.5rem; border-radius: 6px; text-align: center; border: 1px solid #cbd5e1; }
    .stat-card h3 { margin: 0; font-size: 0.875rem; color: #64748b; text-transform: uppercase; }
    .stat-card p { margin: 0.5rem 0 0; font-size: 1.75rem; font-weight: bold; color: #0f172a; }
    table { w-full; border-collapse: collapse; margin-top: 1.5rem; width: 100%; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: bold; color: #475569; }
    .btn { display: inline-block; background: #dc2626; color: white; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 1rem; cursor: pointer; border: none; }
    .btn:hover { background: #b91c1c; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1>${companyName}</h1>
        <p style="color: #64748b; margin-top: -0.5rem;">Offline Offline-Storage Snapshot (${timestamp})</p>
      </div>
      <button class="btn" onclick="window.print()">Print Report / Backup</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <h3>Total Sales Invoices</h3>
        <p>${backup.sales_invoices?.length || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Stock Inventory Items</h3>
        <p>${backup.stock_items?.length || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Registered Customers</h3>
        <p>${backup.customers?.length || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Cashbook Entries</h3>
        <p>${backup.cashbook?.length || 0}</p>
      </div>
    </div>

    <h2>Recent Sales Invoices</h2>
    <table>
      <thead>
        <tr>
          <th>Invoice No</th>
          <th>Date</th>
          <th>Customer</th>
          <th>Status</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(backup.sales_invoices || []).slice(0, 20).map((inv: any) => `
          <tr>
            <td style="font-family: monospace; font-weight: bold;">${inv.invoice_number || inv.bill_number || '-'}</td>
            <td>${inv.date || '-'}</td>
            <td style="font-weight: bold;">${inv.customer_name || inv.vendor_name || '-'}</td>
            <td><span style="padding: 2px 6px; border-radius: 4px; background: ${inv.status==='Paid'?'#dcfce7':'#fef9c3'}; color: ${inv.status==='Paid'?'#15803d':'#a16207'}; font-size: 12px; font-weight: bold;">${inv.status || 'Pending'}</span></td>
            <td style="text-align: right; font-weight: bold; font-family: monospace;">Rs. ${parseFloat(inv.grand_total || 0).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <script>
      // Embedded offline dataset
      window.__STOCK_REGISTER_OFFLINE_DB__ = ${JSON.stringify(backup)};
    </script>
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `StockRegister_StandaloneOffline_${timestamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadWindowsExePackage = () => {
  const batScript = `@echo off
title Stock Register .EXE Desktop Builder
echo ========================================================
echo   Stock Register Windows .EXE Compiler Setup
echo ========================================================
echo.
echo Step 1: Checking Node.js installation...
node -v
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed! Please download from https://nodejs.org
  pause
  exit
)

echo.
echo Step 2: Installing Electron Desktop wrapper...
call npm init -y
call npm install electron --save-dev

echo.
echo Step 3: Creating launcher script...
echo const { app, BrowserWindow } = require('electron'); > main.js
echo function createWindow() { >> main.js
echo   const win = new BrowserWindow({ width: 1280, height: 800, title: 'Stock Register App' }); >> main.js
echo   win.loadURL('https://ais-dev-7p5pwdpui4x3voioqiyhof-58825846637.asia-southeast1.run.app'); >> main.js
echo } >> main.js
echo app.whenReady().then(createWindow); >> main.js

echo.
echo Step 4: Launching Desktop Application...
npx electron main.js
pause`;

  const blob = new Blob([batScript], { type: 'application/bat' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Build_StockRegister_EXE.bat`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
