import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Save, 
  Loader2, 
  Trash2, 
  Building2, 
  MapPin, 
  Fingerprint, 
  Moon, 
  Sun, 
  Laptop,
  Percent, 
  CheckCircle2, 
  RotateCcw, 
  ShieldCheck, 
  BadgeCheck, 
  Download, 
  FileSpreadsheet, 
  FileCode, 
  Clock, 
  Upload, 
  Check, 
  Layers, 
  Database, 
  Calendar, 
  Zap, 
  FileText,
  AlertCircle,
  Landmark,
  CreditCard,
  QrCode,
  Phone,
  User,
  Sliders,
  Sparkles,
  AlertTriangle,
  Search,
  HardDrive
} from 'lucide-react';
import { getActiveCompanyId, safeSupabaseSave, getAppSettings, formatDate } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { 
  getBackupConfig, 
  saveBackupConfig, 
  getBackupHistory, 
  executeManualBackup, 
  restoreDatabaseFromJson, 
  getPopulatedWorkspaceData, 
  subscribeBackupEvents, 
  BackupConfig, 
  BackupFrequency, 
  BackupFormat, 
  MODULE_DISPLAY_NAMES,
  WorkspaceBackupData 
} from '../lib/backupEngine';
import ConfirmDialog from '../components/ConfirmDialog';
import { useCompany } from '../context/CompanyContext';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { refresh: refreshCompanyContext } = useCompany();
  const cid = getActiveCompanyId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Workspace Profile State
  const [workspaceInfo, setWorkspaceInfo] = useState({ 
    name: '', 
    gstin: '', 
    address: '',
    phone: '',
    bank_name: 'Navanagar Co-Orporetive Bank',
    account_holder: 'Bipin Petroleum Co.',
    account_number: '013000200000169',
    ifsc_code: 'TNCB0000013',
    branch: 'Jamnagar',
    upi_id: '',
  });

  // Track initial state for unsaved changes indicator
  const [initialData, setInitialData] = useState<any>(null);


  // GST Configuration State
  const [gstConfig, setGstConfig] = useState(() => {
    const s = getAppSettings();
    return { enabled: s.gstEnabled, type: s.gstType || 'CGST - SGST' };
  });

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [licenseId, setLicenseId] = useState('26401');

  // Backup Engine State
  const [backupConfig, setBackupConfig] = useState<BackupConfig>(getBackupConfig());
  const [backupHistory, setBackupHistory] = useState(getBackupHistory());
  const [workspaceData, setWorkspaceData] = useState<WorkspaceBackupData | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [backupActionMsg, setBackupActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Recycle Bin State
  const [recycleTab, setRecycleTab] = useState('All');
  const [recycleSearch, setRecycleSearch] = useState('');
  const [deletedItems, setDeletedItems] = useState<any[]>([]);
  const [recycleLoading, setRecycleLoading] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<any | null>(null);

  const recycleTabs = [
    'All', 'Workspace', 'Sales Invoices', 'Purchase Bills', 
    'Customers', 'Vendors', 'Stock Master', 'Cashbook', 'Additional Charges'
  ];

  const refreshBackupData = async () => {
    try {
      setBackupConfig(getBackupConfig());
      setBackupHistory(getBackupHistory());
      const data = await getPopulatedWorkspaceData(cid || undefined);
      setWorkspaceData(data);
    } catch (err) {
      console.warn('[Settings] Failed to refresh backup data:', err);
    }
  };

  const loadProfile = async () => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('companies').select('*').eq('id', cid).single();
      if (error) throw error;
      if (data) {
        const loadedInfo = { 
          name: data.name || '', 
          gstin: data.gstin || '', 
          address: data.address || '',
          phone: data.phone || '',
          bank_name: data.bank_name || data.bank_details?.bank_name || 'Navanagar Co-Orporetive Bank',
          account_holder: data.account_holder || data.account_name || data.bank_details?.account_holder || data.bank_details?.account_name || 'Bipin Petroleum Co.',
          account_number: data.account_number || data.bank_details?.account_number || '013000200000169',
          ifsc_code: data.ifsc_code || data.ifsc || data.bank_details?.ifsc_code || data.bank_details?.ifsc || 'TNCB0000013',
          branch: data.branch || data.bank_branch || data.bank_details?.branch || 'Jamnagar',
          upi_id: data.upi_id || data.bank_details?.upi_id || '',
        };
        setWorkspaceInfo(loadedInfo);
        setInitialData(loadedInfo);
      }

      const settings = getAppSettings();
      setGstConfig({
        enabled: settings.gstEnabled,
        type: settings.gstType || 'CGST - SGST'
      });
      
      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id, created_at')
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      
      if (allCompanies) {
        const index = allCompanies.findIndex((c: any) => c.id === cid);
        if (index !== -1) {
          setLicenseId(`${26401 + index}`);
        }
      }

      await refreshBackupData();
      await fetchRecycleData();
    } catch (err) {
      console.error("Settings load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecycleData = async () => {
    if (!cid) return;
    setRecycleLoading(true);
    
    try {
      const queries = [
        supabase.from('companies').select('id, name, created_at').eq('is_deleted', true).eq('id', cid), 
        supabase.from('companies').select('id, name, created_at').eq('is_deleted', true).not('id', 'eq', cid), 
        supabase.from('sales_invoices').select('id, invoice_number, customer_name, date').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('purchase_bills').select('id, bill_number, vendor_name, date').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('vendors').select('id, name, party_type, is_customer').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('stock_items').select('id, name').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('cashbooks').select('id, date').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('duties_taxes').select('id, name').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('customers').select('id, name, party_type, is_customer').eq('is_deleted', true).eq('company_id', cid)
      ];

      const results = await Promise.all(queries) as any[];
      const allItems: any[] = [];
      
      results[0].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Workspace', label: i.name, table: 'companies' }));
      results[1].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Workspace', label: i.name, table: 'companies' }));
      results[2].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Sales Invoices', label: `${i.invoice_number} (${i.customer_name})`, table: 'sales_invoices' }));
      results[3].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Purchase Bills', label: `${i.bill_number} (${i.vendor_name})`, table: 'purchase_bills' }));
      results[4].data?.forEach((i: any) => {
        allItems.push({ ...i, origin: 'Vendors', label: i.name, table: 'vendors' });
      });
      results[5].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Stock Master', label: i.name, table: 'stock_items' }));
      results[6].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Cashbook', label: `Statement ${i.date}`, table: 'cashbooks' }));
      results[7].data?.forEach((i: any) => allItems.push({ ...i, origin: 'Additional Charges', label: i.name, table: 'duties_taxes' }));
      results[8].data?.forEach((i: any) => {
        allItems.push({ ...i, origin: 'Customers', label: i.name, table: 'customers' });
      });

      setDeletedItems(allItems);
    } catch (err) {
      console.error("Recycle fetch error:", err);
    } finally {
      setRecycleLoading(false);
    }
  };

  useEffect(() => { 
    loadProfile(); 
    const unsub = subscribeBackupEvents(() => {
      refreshBackupData();
    });
    return () => unsub();
  }, [cid]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!initialData) return false;
    return JSON.stringify(workspaceInfo) !== JSON.stringify(initialData);
  }, [workspaceInfo, initialData]);


  const handleUpdateFrequency = (freq: BackupFrequency) => {
    const updated = saveBackupConfig({ frequency: freq });
    setBackupConfig(updated);
    setBackupActionMsg({
      type: 'success',
      text: `Auto-backup frequency updated to: ${getFrequencyDisplay(freq)}`
    });
  };

  const handleUpdateFormat = (format: BackupFormat) => {
    const updated = saveBackupConfig({ format });
    setBackupConfig(updated);
    setBackupActionMsg({
      type: 'success',
      text: `Default backup format updated to: ${format.toUpperCase()}`
    });
  };

  const handleToggleAutoDownload = () => {
    const nextVal = !backupConfig.autoDownload;
    const updated = saveBackupConfig({ autoDownload: nextVal });
    setBackupConfig(updated);
    setBackupActionMsg({
      type: 'success',
      text: nextVal ? 'Automatic browser download enabled for scheduled backups.' : 'Silent background backup enabled (no popup download).'
    });
  };

  const handleManualBackup = async (format: BackupFormat) => {
    setIsExporting(format);
    setBackupActionMsg(null);
    try {
      const res = await executeManualBackup(format, { autoDownload: true });
      setBackupActionMsg({
        type: 'success',
        text: `Exported ${res.totalRecords} records across ${res.totalModules} active modules to ${res.filename}!`
      });
      await refreshBackupData();
    } catch (err: any) {
      setBackupActionMsg({
        type: 'error',
        text: `Backup failed: ${err.message || 'Error creating file'}`
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Are you sure you want to restore data from "${file.name}"? This will import records into your local database.`)) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    setBackupActionMsg(null);
    try {
      const res = await restoreDatabaseFromJson(file);
      setBackupActionMsg({
        type: 'success',
        text: res.message
      });
      await refreshBackupData();
      await fetchRecycleData();
    } catch (err: any) {
      setBackupActionMsg({
        type: 'error',
        text: `Restore failed: ${err.message || 'Invalid backup file'}`
      });
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  const handleRecover = async (item: any) => {
    try {
      const { error } = await supabase.from(item.table).update({ is_deleted: false }).eq('id', item.id);
      if (error) throw error;
      await fetchRecycleData();
      await refreshBackupData();
      window.dispatchEvent(new Event('appSettingsChanged'));
    } catch (err: any) {
      alert("Recovery failed: " + err.message);
    }
  };

  const handlePermanentDelete = async (item: any) => {
    try {
      const { error } = await supabase.from(item.table).delete().eq('id', item.id);
      if (error) throw error;
      await fetchRecycleData();
      await refreshBackupData();
      setPermanentDeleteTarget(null);
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const toggleGST = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const newEnabled = !gstConfig.enabled;
    const newConfig = { ...gstConfig, enabled: newEnabled };
    setGstConfig(newConfig);
    
    if (cid) {
      const currentSettings = getAppSettings();
      const updatedSettings = { 
        ...currentSettings, 
        gstEnabled: newEnabled, 
        gstType: newConfig.type 
      };
      localStorage.setItem(`appSettings_${cid}`, JSON.stringify(updatedSettings));
      window.dispatchEvent(new Event('appSettingsChanged'));
    }
  };

  const handleGstTypeChange = (newType: string) => {
    const newConfig = { ...gstConfig, type: newType };
    setGstConfig(newConfig);
    if (cid) {
      const currentSettings = getAppSettings();
      const updatedSettings = { 
        ...currentSettings, 
        gstEnabled: gstConfig.enabled, 
        gstType: newType 
      };
      localStorage.setItem(`appSettings_${cid}`, JSON.stringify(updatedSettings));
      window.dispatchEvent(new Event('appSettingsChanged'));
    }
  };

  const handleSave = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cid) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
        name: workspaceInfo.name,
        gstin: workspaceInfo.gstin,
        address: workspaceInfo.address,
        phone: workspaceInfo.phone,
        bank_name: workspaceInfo.bank_name,
        account_holder: workspaceInfo.account_holder,
        account_number: workspaceInfo.account_number,
        ifsc_code: workspaceInfo.ifsc_code,
        branch: workspaceInfo.branch,
        upi_id: workspaceInfo.upi_id,
        account_name: workspaceInfo.account_holder,
        ifsc: workspaceInfo.ifsc_code,
        bank_branch: workspaceInfo.branch,
        bank_details: {
          bank_name: workspaceInfo.bank_name,
          account_holder: workspaceInfo.account_holder,
          account_name: workspaceInfo.account_holder,
          account_number: workspaceInfo.account_number,
          ifsc_code: workspaceInfo.ifsc_code,
          ifsc: workspaceInfo.ifsc_code,
          branch: workspaceInfo.branch,
          upi_id: workspaceInfo.upi_id,
        }
      };

      await safeSupabaseSave('companies', payload, cid);
      localStorage.setItem('activeCompanyName', workspaceInfo.name);

      const currentSettings = getAppSettings();
      const updatedSettings = { 
        ...currentSettings, 
        gstEnabled: gstConfig.enabled, 
        gstType: gstConfig.type 
      };
      localStorage.setItem(`appSettings_${cid}`, JSON.stringify(updatedSettings));

      if (gstConfig.enabled) {
        const ledgersToEnsure = gstConfig.type === 'CGST - SGST' ? ['CGST', 'SGST'] : ['IGST'];
        for (const name of ledgersToEnsure) {
          const { data: existing } = await supabase.from('duties_taxes').select('id').eq('company_id', cid).eq('name', name).eq('is_deleted', false).maybeSingle();
          if (!existing) {
            await safeSupabaseSave('duties_taxes', {
              name, type: 'Charge', calc_method: 'Fixed', fixed_amount: 0, rate: 0, apply_on: 'Subtotal', is_default: true, is_deleted: false
            });
          }
        }
      }

      setInitialData({ ...workspaceInfo });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await refreshCompanyContext();
      window.dispatchEvent(new Event('appSettingsChanged'));
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [cid, workspaceInfo, gstConfig, refreshCompanyContext]);

  // Support Ctrl+S or Cmd+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleDeleteWorkspace = async () => {
    if (!cid) return;
    try {
      const { error } = await supabase.from('companies').update({ is_deleted: true }).eq('id', cid);
      if (error) throw error;
      localStorage.removeItem('activeCompanyId');
      localStorage.removeItem('activeCompanyName');
      navigate('/companies', { replace: true });
    } catch (err: any) {
      alert(`Delete Failed: ${err.message}`);
    }
  };

  const getFrequencyDisplay = (freq: BackupFrequency) => {
    switch (freq) {
      case 'every_transaction': return 'After Every Transaction';
      case 'daily': return 'Once a Day (Daily)';
      case 'weekly': return 'Once a Week (Weekly)';
      case 'monthly': return 'Once a Month (Monthly)';
      case 'manual_only': return 'Manual Only (Disabled)';
      default: return freq;
    }
  };

  const formatLastBackupTime = (ts: number | null | undefined) => {
    if (!ts) return 'Never';
    try {
      const d = new Date(ts);
      return `${formatDate(d.toISOString())} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Never';
    }
  };

  // Filter deleted items by tab and search
  const filteredDeleted = useMemo(() => {
    return deletedItems.filter(item => {
      const matchesTab = recycleTab === 'All' || item.origin === recycleTab;
      const matchesSearch = !recycleSearch || (item.label && item.label.toLowerCase().includes(recycleSearch.toLowerCase()));
      return matchesTab && matchesSearch;
    });
  }, [deletedItems, recycleTab, recycleSearch]);

  // Count items per tab
  const getTabCount = (tab: string) => {
    if (tab === 'All') return deletedItems.length;
    return deletedItems.filter(i => i.origin === tab).length;
  };

  if (loading) {
    return (
      <div className="py-40 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
      {/* Sticky Header / Action Bar */}
      <div className="sticky top-0 z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-[#F7F8FC]/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-5xl mx-auto">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Settings</h1>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Building2 className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate max-w-[160px]">{workspaceInfo.name || 'Workspace'}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">#{licenseId}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage your business profile, invoice print details, GST, appearance, and local automated backups.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {saveSuccess ? (
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600 shrink-0" /> Saved successfully
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" /> Unsaved changes
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center px-4 py-2 bg-primary hover:bg-primary-dark active:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              title="Shortcut: Ctrl+S"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Business Profile */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-primary dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/50">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Business Profile
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Legal company identity, official contact, and registered office address
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline-block">
              Workspace Profile
            </span>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Legal Business / Workspace Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    required 
                    value={workspaceInfo.name} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, name: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium" 
                    placeholder="e.g. Bipin Petroleum Co." 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  GSTIN Number
                </label>
                <div className="relative">
                  <Fingerprint className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.gstin} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, gstin: e.target.value.toUpperCase()})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono uppercase" 
                    placeholder="e.g. 24AABCB1234F1Z0" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Business Contact Phone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.phone} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, phone: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium" 
                    placeholder="e.g. +91 98765 43210" 
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Registered Office Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <textarea 
                    value={workspaceInfo.address} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, address: e.target.value})} 
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" 
                    rows={2} 
                    placeholder="Complete business premises / office address..." 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Bank Details for Sales Invoices */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Bank Details & Invoice Print Footer
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Account information printed on the bottom of customer sales invoices
                </p>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Printed on Sales Invoices
            </span>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Bank Name
                </label>
                <div className="relative">
                  <Landmark className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.bank_name} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, bank_name: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium" 
                    placeholder="e.g. Navanagar Co-Operative Bank / SBI" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Account Holder Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.account_holder} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, account_holder: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium" 
                    placeholder="e.g. Bipin Petroleum Co." 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Account Number
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.account_number} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, account_number: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" 
                    placeholder="e.g. 013000200000169" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  IFSC Code
                </label>
                <div className="relative">
                  <Fingerprint className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.ifsc_code} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, ifsc_code: e.target.value.toUpperCase()})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono uppercase" 
                    placeholder="e.g. TNCB0000013" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Branch (Optional)
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.branch} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, branch: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium" 
                    placeholder="e.g. Jamnagar" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  UPI ID / VPA (Optional)
                </label>
                <div className="relative">
                  <QrCode className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  <input 
                    value={workspaceInfo.upi_id} 
                    onChange={(e) => setWorkspaceInfo({...workspaceInfo, upi_id: e.target.value})} 
                    className="w-full pl-10 pr-3.5 h-10 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono" 
                    placeholder="e.g. bipinpetroleum@okhdfcbank" 
                  />
                </div>
              </div>
            </div>

            {/* Live Print Footer Preview */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Live Sales Invoice Print Preview
                </span>
                <span className="text-[10px] text-slate-400">
                  Updated in real-time
                </span>
              </div>
              
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/60 max-w-lg">
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded border border-slate-200/90 dark:border-slate-700/80 shadow-2xs text-xs space-y-1.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] tracking-tight">Bank Details</span>
                    <span className="text-[9px] uppercase font-semibold text-slate-400">Invoice Footer</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] pt-0.5">
                    <span className="text-slate-500 dark:text-slate-400">Bank</span>
                    <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">{workspaceInfo.bank_name || '—'}</span>
                  </div>
                  {workspaceInfo.branch && (
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Branch</span>
                      <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">{workspaceInfo.branch}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">A/c Holder</span>
                    <span className="col-span-2 font-semibold text-slate-800 dark:text-slate-200">{workspaceInfo.account_holder || '—'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">A/c No.</span>
                    <span className="col-span-2 font-semibold font-mono text-slate-900 dark:text-slate-100">{workspaceInfo.account_number || '—'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">IFSC Code</span>
                    <span className="col-span-2 font-semibold font-mono text-slate-900 dark:text-slate-100">{workspaceInfo.ifsc_code || '—'}</span>
                  </div>
                  {workspaceInfo.upi_id && (
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">UPI ID</span>
                      <span className="col-span-2 font-semibold font-mono text-slate-900 dark:text-slate-100">{workspaceInfo.upi_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: GST Configuration */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900/50">
                <Percent className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  GST & Tax Configuration
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Enable automatic GST calculation and tax ledger assignment for vouchers
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${gstConfig.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
              {gstConfig.enabled ? 'GST Enabled' : 'GST Disabled'}
            </span>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Enable Goods & Services Tax (GST)
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Calculate CGST, SGST, or IGST automatically across sales invoices, purchase bills, and ledgers.
                </p>
              </div>
              <button 
                type="button" 
                onClick={toggleGST} 
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none items-center ${gstConfig.enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${gstConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {gstConfig.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Default GST Structure
                  </label>
                  <div className="relative">
                    <select 
                      value={gstConfig.type} 
                      onChange={(e) => handleGstTypeChange(e.target.value)} 
                      className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium appearance-none cursor-pointer"
                    >
                      <option value="CGST - SGST">CGST - SGST (Intra-State / Within State)</option>
                      <option value="IGST">IGST (Inter-State / Outside State)</option>
                    </select>
                    <Percent className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tax ledgers ({gstConfig.type === 'CGST - SGST' ? 'CGST & SGST' : 'IGST'}) are automatically created and assigned upon saving.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>


        {/* Section 5: Data Backup & Automated Schedule Engine */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Data Backup & Automated Schedule
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Local offline storage backups, automated transaction snapshots, and instant exports
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {backupConfig.frequency === 'manual_only' ? 'Manual Backup Mode' : `Auto: ${getFrequencyDisplay(backupConfig.frequency)}`}
            </span>
          </div>

          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              All application data is securely stored locally on your device. Choose when the system automatically creates backup snapshots, or trigger one-click Excel and JSON downloads below. <strong className="text-slate-700 dark:text-slate-300 font-semibold">Empty modules with 0 records are automatically skipped</strong> to ensure lightweight and fast backup files.
            </p>

            {/* Notification alert */}
            {backupActionMsg && (
              <div className={`p-3.5 rounded-lg text-xs font-medium border flex items-center justify-between animate-in fade-in duration-200 ${
                backupActionMsg.type === 'success' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200'
              }`}>
                <span className="flex items-center gap-2">
                  {backupActionMsg.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                  {backupActionMsg.text}
                </span>
                <button type="button" onClick={() => setBackupActionMsg(null)} className="font-bold opacity-70 hover:opacity-100 ml-4">✕</button>
              </div>
            )}

            {/* Auto-Backup Frequency Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Auto-Backup Frequency
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    id: 'every_transaction' as BackupFrequency,
                    title: 'After Every Transaction',
                    desc: 'Snapshot on save of invoices, bills, items or vouchers',
                    icon: Zap,
                    badge: 'Recommended'
                  },
                  {
                    id: 'daily' as BackupFrequency,
                    title: 'Once a Day (Daily)',
                    desc: 'Automated snapshot generated every 24 hours',
                    icon: Calendar,
                    badge: 'Standard'
                  },
                  {
                    id: 'weekly' as BackupFrequency,
                    title: 'Once a Week (Weekly)',
                    desc: 'Automated snapshot every 7 days',
                    icon: Clock
                  },
                  {
                    id: 'monthly' as BackupFrequency,
                    title: 'Once a Month (Monthly)',
                    desc: 'Automated snapshot every 30 days',
                    icon: Layers
                  },
                  {
                    id: 'manual_only' as BackupFrequency,
                    title: 'Manual Only',
                    desc: 'Automatic backups paused. Download manually on demand',
                    icon: ShieldCheck
                  }
                ].map((item) => {
                  const isSelected = backupConfig.frequency === item.id;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleUpdateFrequency(item.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                        isSelected 
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-1 ring-emerald-500/40' 
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {item.badge && (
                        <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                          {item.badge}
                        </span>
                      )}
                      <div className="flex items-start space-x-3 mb-2">
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.title}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{item.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 mt-1">
                        <span className="text-[10px] text-slate-400">Status</span>
                        <span className={`text-[10px] font-semibold ${isSelected ? 'text-emerald-600 dark:text-emerald-400 flex items-center gap-1' : 'text-slate-400'}`}>
                          {isSelected && <Check className="w-3 h-3" />} {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Default Format & Auto-Download Preferences */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Default Format for Auto-Backup
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => handleUpdateFormat('excel')}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      backupConfig.format === 'excel'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Excel Workbook (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateFormat('json')}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      backupConfig.format === 'json'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>JSON Archive (.json)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  3. Browser Download On Schedule
                </label>
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Prompt File Download</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Trigger browser save dialog when automated backup runs</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleToggleAutoDownload} 
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none items-center ${backupConfig.autoDownload ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${backupConfig.autoDownload ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Manual One-Click Export Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  4. Manual Immediate Backup Export
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Download a complete portable snapshot of your active database entries right now.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleManualBackup('excel')}
                  className="flex items-center justify-between p-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3 text-left">
                    <div className="p-2.5 bg-emerald-700/60 rounded-lg shrink-0">
                      <FileSpreadsheet className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Download Excel File (.xlsx)</div>
                      <div className="text-[10px] text-emerald-100">Multi-sheet workbook with all populated data</div>
                    </div>
                  </div>
                  {isExporting === 'excel' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleManualBackup('json')}
                  className="flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-900 active:bg-black text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3 text-left">
                    <div className="p-2.5 bg-slate-700 rounded-lg shrink-0">
                      <FileCode className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Download JSON File (.json)</div>
                      <div className="text-[10px] text-slate-300">Clean portable data archive with metadata</div>
                    </div>
                  </div>
                  {isExporting === 'json' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Real-time Workspace Data Inventory */}
            {workspaceData && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-slate-500" />
                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Active Data Backup Scope & Inventory
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                    {workspaceData.metadata.totalRecords} active records across {workspaceData.metadata.totalModules} modules
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {workspaceData.metadata.modulesIncluded.map((mod) => (
                    <div key={mod} className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {MODULE_DISPLAY_NAMES[mod] || mod}
                      </span>
                      <span className="text-[11px] font-semibold font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-2xs">
                        {workspaceData.tables[mod]?.length || 0}
                      </span>
                    </div>
                  ))}
                  {workspaceData.metadata.modulesIncluded.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">
                      No records created yet. Start creating invoices, parties, or stock items to automatically include them.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Restore / Import Section */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Restore from JSON Backup
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Import records from any previously saved JSON backup file directly into your workspace.
                </p>
              </div>

              <label className="inline-flex items-center justify-center px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors shrink-0 shadow-2xs">
                {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
                {isRestoring ? 'Restoring data...' : 'Select Backup File (.json)'}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  disabled={isRestoring}
                  className="hidden"
                />
              </label>
            </div>

            {/* Backup Summary & History */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Last backup timestamp:</span>
                <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                  {formatLastBackupTime(backupConfig.lastBackupTimestamp)}
                </span>
              </div>

              {backupHistory.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Recent Backup History
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {backupHistory.slice(0, 5).map((h) => (
                      <div key={h.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                        <div className="flex items-center space-x-2 truncate">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${h.format === 'excel' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'}`}>
                            {h.format}
                          </span>
                          <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{h.filename}</span>
                        </div>
                        <div className="flex items-center space-x-3 text-slate-400 shrink-0 text-[10px]">
                          <span>{h.totalRecords} records</span>
                          <span>{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Section 6: Recycle Bin & Data Recovery */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Recycle Bin & Data Recovery
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Restore soft-deleted entries or permanently purge items
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={fetchRecycleData} 
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer flex items-center gap-1 text-xs"
            title="Refresh Recycle Bin"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${recycleLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-[11px]">Refresh</span>
          </button>
        </div>
        
        <div>
          {/* Sub-header Tabs & Search */}
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/20 dark:bg-slate-900/20">
            <div className="flex overflow-x-auto gap-1 scrollbar-none py-0.5">
              {recycleTabs.map(tab => {
                const count = getTabCount(tab);
                const isSelected = recycleTab === tab;
                return (
                  <button 
                    key={tab}
                    type="button"
                    onClick={() => setRecycleTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-semibold' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab}</span>
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                        isSelected 
                          ? 'bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800' 
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {deletedItems.length > 0 && (
              <div className="relative shrink-0 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={recycleSearch}
                  onChange={(e) => setRecycleSearch(e.target.value)}
                  placeholder="Filter deleted items..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400"
                />
              </div>
            )}
          </div>

          <div className="p-6">
            {recycleLoading ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading deleted items...</span>
              </div>
            ) : filteredDeleted.length === 0 ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {recycleSearch ? 'No deleted items matching your filter.' : 'Recycle bin is clean. No deleted items found.'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Items you delete across sales, purchases, or stock will appear here for recovery.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDeleted.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{item.label}</p>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="capitalize">{item.origin}</span>
                        {item.date && (
                          <>
                            <span>•</span>
                            <span>{formatDate(item.date)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <button 
                        type="button" 
                        onClick={() => handleRecover(item)}
                        className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
                      >
                        Restore
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setPermanentDeleteTarget(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 7: Software License & System Details */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-primary dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/50">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Software License & Engine
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Local desktop executable license verification and version specifications
              </p>
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 rounded-full flex items-center">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mr-1.5" />
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Version v1.0</span>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">License Tier</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Active Local License
              </span>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Assigned License ID</span>
              <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                {licenseId}
              </span>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Engine Storage</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" /> Offline Local IndexedDB
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 8: Danger Zone */}
      <div className="bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300">Delete Current Workspace</h4>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-0.5">
              Moving this workspace to the recycle bin hides all associated records from active views. It can be restored later from the Recycle Bin.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDeleteConfirmOpen(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
        >
          Delete Workspace
        </button>
      </div>

      {/* Confirm Permanent Delete Modal */}
      {permanentDeleteTarget && (
        <ConfirmDialog
          isOpen={true}
          title="Permanently Delete Item?"
          message={`Are you sure you want to permanently delete "${permanentDeleteTarget.label}"? This action cannot be undone and records cannot be recovered.`}
          onConfirm={() => handlePermanentDelete(permanentDeleteTarget)}
          onClose={() => setPermanentDeleteTarget(null)}
          confirmLabel="Yes, Delete Permanently"
          variant="danger"
        />
      )}

      {/* Confirm Delete Workspace Modal */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Move Workspace to Recycle Bin?"
        message={`Are you sure you want to delete workspace "${workspaceInfo.name || 'this workspace'}"? It can be recovered later from the Recycle Bin.`}
        onConfirm={handleDeleteWorkspace}
        onClose={() => setIsDeleteConfirmOpen(false)}
        confirmLabel="Move to Recycle Bin"
        variant="danger"
      />
    </div>
  );
};

export default Settings;
