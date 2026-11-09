import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Sun, Moon, Check, Loader2, Download, Trash2, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getActiveCompanyId, getAppSettings } from '../utils/helpers';
import { supabase, getAuthUser } from '../lib/supabase';
import { 
  getBackupConfig, 
  saveBackupConfig, 
  getBackupHistory, 
  executeManualBackup, 
  BackupConfig, 
  BackupFrequency, 
  BackupFormat 
} from '../lib/backupEngine';
import { getActiveLicense } from '../lib/licenseManager';
import { useCompany } from '../context/CompanyContext';
import { useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts, showShortcutFeedback } from '../utils/shortcutManager';
import { toast } from '../utils/toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = 'Business Profile' }) => {
  const navigate = useNavigate();
  const { activeCompany, setCompany, refresh } = useCompany();
  const cid = getActiveCompanyId();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);

  // Business Profile State
  const [workspaceInfo, setWorkspaceInfo] = useState({
    name: 'Bipin Petroleum Co.',
    gstin: '24ANAPM3896D1Z4',
    phone: '70160 99583',
    address: '58 Digvijay Plot, Near Oshwal Hospital, Jamnagar 361005, Gujarat',
    bank_name: 'Navanagar Corporetive Bank LTD',
    account_holder: 'Bipin Petroleum Co.',
    account_number: '013000200000169',
    ifsc_code: 'TNCB0000013',
    branch: 'Jamnagar',
    upi_id: '',
  });

  // GST State
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstType, setGstType] = useState('Both');


  // Backup State
  const [backupConfig, setBackupConfigState] = useState<BackupConfig>(getBackupConfig());
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Recycle Bin State
  const [recycleItems, setRecycleItems] = useState<any[]>([]);
  const [recycleLoading, setRecycleLoading] = useState(false);

  // License State
  const [license, setLicense] = useState<any>(null);

  // Debounce timer ref for auto-saving company profile
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial profile data
  const loadData = useCallback(async () => {
    if (!cid) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase.from('companies').select('*').eq('id', cid).maybeSingle();
      if (data) {
        setWorkspaceInfo({
          name: data.name || 'Bipin Petroleum Co.',
          gstin: data.gstin || '24ANAPM3896D1Z4',
          phone: data.phone || '70160 99583',
          address: data.address || '58 Digvijay Plot, Near Oshwal Hospital, Jamnagar 361005, Gujarat',
          bank_name: data.bank_name || data.bank_details?.bank_name || 'Navanagar Corporetive Bank LTD',
          account_holder: data.account_holder || data.account_name || data.bank_details?.account_holder || 'Bipin Petroleum Co.',
          account_number: data.account_number || data.bank_details?.account_number || '013000200000169',
          ifsc_code: data.ifsc_code || data.bank_details?.ifsc_code || 'TNCB0000013',
          branch: data.branch || data.bank_details?.branch || 'Jamnagar',
          upi_id: data.upi_id || data.bank_details?.upi_id || '',
        });
      }

      const settings = getAppSettings();
      setGstEnabled(settings.gstEnabled);
      setGstType(settings.gstType || 'Both');

      setBackupConfigState(getBackupConfig());
      setBackupHistory(getBackupHistory());
      setLicense(getActiveLicense());

      // Fetch Recycle Bin items
      fetchRecycleItems();
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  const fetchRecycleItems = async () => {
    if (!cid) return;
    setRecycleLoading(true);
    try {
      const [invRes, billRes, vendRes, itemRes] = await Promise.all([
        supabase.from('sales_invoices').select('id, invoice_number, customer_name, date').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('purchase_bills').select('id, bill_number, vendor_name, date').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('vendors').select('id, name').eq('is_deleted', true).eq('company_id', cid),
        supabase.from('stock_items').select('id, name').eq('is_deleted', true).eq('company_id', cid)
      ]);

      const items: any[] = [];
      invRes.data?.forEach((i: any) => items.push({ ...i, type: 'Sales Invoice', title: `${i.invoice_number} - ${i.customer_name}`, table: 'sales_invoices' }));
      billRes.data?.forEach((b: any) => items.push({ ...b, type: 'Purchase Bill', title: `${b.bill_number} - ${b.vendor_name}`, table: 'purchase_bills' }));
      vendRes.data?.forEach((v: any) => items.push({ ...v, type: 'Party', title: v.name, table: 'vendors' }));
      itemRes.data?.forEach((s: any) => items.push({ ...s, type: 'Stock Item', title: s.name, table: 'stock_items' }));

      setRecycleItems(items);
    } catch (err) {
      console.warn('Error fetching recycle bin:', err);
    } finally {
      setRecycleLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // AUTO-SAVE: Workspace Profile Changes (Debounced to avoid excessive DB writes)
  const handleProfileChange = (field: string, value: string) => {
    const updated = { ...workspaceInfo, [field]: value };
    setWorkspaceInfo(updated);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!cid) return;
      try {
        const payload: any = {
          name: updated.name.trim().toUpperCase(),
          gstin: updated.gstin.trim().toUpperCase(),
          phone: updated.phone.trim(),
          address: updated.address.trim(),
          bank_name: updated.bank_name.trim(),
          account_holder: updated.account_holder.trim(),
          account_number: updated.account_number.trim(),
          ifsc_code: updated.ifsc_code.trim().toUpperCase(),
          branch: updated.branch.trim(),
          upi_id: updated.upi_id.trim()
        };

        await supabase.from('companies').update(payload).eq('id', cid);
        localStorage.setItem('activeCompanyName', payload.name);
        if (activeCompany) {
          setCompany({ ...activeCompany, ...payload });
        }
        window.dispatchEvent(new Event('appSettingsChanged'));
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 400);
  };

  // AUTO-SAVE: GST Toggle & Type
  const handleGstToggle = (enabled: boolean) => {
    setGstEnabled(enabled);
    if (!cid) return;
    const current = getAppSettings();
    const next = { ...current, gstEnabled: enabled };
    localStorage.setItem(`appSettings_${cid}`, JSON.stringify(next));
    window.dispatchEvent(new Event('appSettingsChanged'));
  };

  const handleGstTypeChange = (type: string) => {
    setGstType(type);
    if (!cid) return;
    const current = getAppSettings();
    const next = { ...current, gstType: type };
    localStorage.setItem(`appSettings_${cid}`, JSON.stringify(next));
    window.dispatchEvent(new Event('appSettingsChanged'));
  };


  // AUTO-SAVE: Backup Frequency & Format
  const handleScheduleBackupChange = (freq: BackupFrequency) => {
    const updated = saveBackupConfig({ frequency: freq });
    setBackupConfigState(updated);
  };

  const handleBackupFormatChange = (fmt: BackupFormat) => {
    const updated = saveBackupConfig({ format: fmt });
    setBackupConfigState(updated);
  };

  const handleToggleAutoBackup = () => {
    const next = !backupConfig.autoDownload;
    const updated = saveBackupConfig({ autoDownload: next });
    setBackupConfigState(updated);
  };

  const handleRunManualBackup = async () => {
    setIsExporting(true);
    try {
      await executeManualBackup(backupConfig.format || 'csv', { autoDownload: true });
      setBackupHistory(getBackupHistory());
    } finally {
      setIsExporting(false);
    }
  };

  // Restore Recycle Bin item
  const handleRestoreItem = async (item: any) => {
    try {
      await supabase.from(item.table).update({ is_deleted: false }).eq('id', item.id);
      fetchRecycleItems();
      window.dispatchEvent(new Event('appSettingsChanged'));
    } catch (err) {
      console.error('Error restoring item:', err);
    }
  };

  // Delete Workspace
  const handleDeleteWorkspace = async () => {
    if (!confirm('Are you sure you want to permanently delete this workspace? This action cannot be undone.')) {
      return;
    }
    try {
      if (cid) {
        await supabase.from('companies').update({ is_deleted: true }).eq('id', cid);
        localStorage.removeItem('activeCompanyId');
        localStorage.removeItem('activeCompanyName');
        toast.success("Workspace deleted successfully.");
        onClose();
        navigate('/companies', { replace: true });
      }
    } catch (err: any) {
      toast.error('Delete failed: ' + (err.message || 'Unknown error'));
    }
  };

  const [savingManual, setSavingManual] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // MANUAL SAVE (Triggered by Ctrl+S or fixed Save Changes button)
  const handleManualSave = async () => {
    if (savingManual || !cid) return;
    setSavingManual(true);
    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      const payload: any = {
        name: workspaceInfo.name.trim().toUpperCase(),
        gstin: workspaceInfo.gstin.trim().toUpperCase(),
        phone: workspaceInfo.phone.trim(),
        address: workspaceInfo.address.trim(),
        bank_name: workspaceInfo.bank_name.trim(),
        account_holder: workspaceInfo.account_holder.trim(),
        account_number: workspaceInfo.account_number.trim(),
        ifsc_code: workspaceInfo.ifsc_code.trim().toUpperCase(),
        branch: workspaceInfo.branch.trim(),
        upi_id: workspaceInfo.upi_id.trim()
      };

      await supabase.from('companies').update(payload).eq('id', cid);
      localStorage.setItem('activeCompanyName', payload.name);
      if (activeCompany) {
        setCompany({ ...activeCompany, ...payload });
      }

      // GST Settings
      const current = getAppSettings();
      const nextSettings = { ...current, gstEnabled, gstType };
      localStorage.setItem(`appSettings_${cid}`, JSON.stringify(nextSettings));

      // Backup Settings
      saveBackupConfig(backupConfig);

      window.dispatchEvent(new Event('appSettingsChanged'));

      setSaveSuccess(true);
      toast.success("Settings saved successfully.");
      showShortcutFeedback('Settings Saved Successfully (Ctrl+S)', 'save');
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      toast.error('Error saving settings: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingManual(false);
    }
  };

  // Register Ctrl+S shortcut for Settings Modal
  useKeyboardShortcuts({
    onSave: isOpen ? handleManualSave : undefined,
    priority: 50
  }, [isOpen, workspaceInfo, gstEnabled, gstType, backupConfig, cid]);

  if (!isOpen) return null;

  const tabs = [
    'Business Profile',
    'GST & Taxations',
    'Backup & Data',
    'Recycle Bin',
    'License',
    'Check for Updates',
    'Danger Zone'
  ];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="absolute inset-0" 
        onClick={onClose} 
      />

      <div className="relative bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 w-[960px] max-w-[95vw] h-[680px] max-h-[90vh] rounded-xs shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header with Fixed 'Save Changes' Button */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-[18px] font-normal text-slate-900 dark:text-white">Settings</h2>
            {saveSuccess && (
              <span className="inline-flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 animate-in fade-in duration-150">
                <Check className="w-3.5 h-3.5 mr-1" /> Changes Saved
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {/* Fixed 'Save Changes' button */}
            <button
              type="button"
              onClick={handleManualSave}
              disabled={savingManual}
              className="px-4 py-2 bg-primary hover:bg-primary-dark active:bg-blue-800 text-white text-xs font-medium rounded transition-none flex items-center space-x-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="Save all setting changes (Shortcut: Ctrl + S)"
            >
              {savingManual ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Save Changes</span>
              <kbd className="hidden sm:inline text-[10px] text-blue-200 ml-1 font-mono font-normal">Ctrl+S</kbd>
            </button>

            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Split View */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Sidebar Tabs (Fixed and non-scrolling) */}
          <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 space-y-1.5 shrink-0 bg-white dark:bg-slate-900 select-none overflow-hidden">
            {tabs.map((tab) => {
              const isDanger = tab === 'Danger Zone';
              const isActive = activeTab === tab;

              let btnClasses = 'w-full text-left px-3.5 py-2 text-xs font-medium rounded-xs transition-colors block ';
              if (isDanger) {
                if (isActive) {
                  btnClasses += 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400';
                } else {
                  btnClasses += 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30';
                }
              } else {
                if (isActive) {
                  btnClasses += 'bg-[#3B66CC] dark:bg-primary text-white font-semibold';
                } else {
                  btnClasses += 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60';
                }
              }

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={btnClasses}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Right Content Area (Only this inside content area scrolls) */}
          <div className="flex-1 p-6 sm:p-8 overflow-y-auto bg-white dark:bg-slate-900 custom-scrollbar min-h-0">
            {/* 1. Business Profile (Screenshot 488) */}
            {activeTab === 'Business Profile' && (
              <div className="space-y-6 max-w-3xl">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Business Profile</h3>

                <div className="space-y-5 text-sm">
                  {/* Business Name */}
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Business Name</label>
                    <input
                      type="text"
                      value={workspaceInfo.name}
                      onChange={(e) => handleProfileChange('name', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm"
                      placeholder="Business Name"
                    />
                  </div>

                  {/* Registered GSTIN & Contact Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Registered GSTIN</label>
                      <input
                        type="text"
                        value={workspaceInfo.gstin}
                        onChange={(e) => handleProfileChange('gstin', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm uppercase font-mono"
                        placeholder="GSTIN"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Contact Number</label>
                      <div className="flex">
                        <span className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-r-0 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm select-none">
                          +91
                        </span>
                        <input
                          type="text"
                          value={workspaceInfo.phone}
                          onChange={(e) => handleProfileChange('phone', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm flex-1"
                          placeholder="Contact Number"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Office Address */}
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Office Address</label>
                    <textarea
                      rows={3}
                      value={workspaceInfo.address}
                      onChange={(e) => handleProfileChange('address', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm resize-none"
                      placeholder="Registered Office Address"
                    />
                  </div>

                  {/* Bank Name & Account Holder Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Bank Name</label>
                      <input
                        type="text"
                        value={workspaceInfo.bank_name}
                        onChange={(e) => handleProfileChange('bank_name', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm"
                        placeholder="Bank Name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Account Holder Name</label>
                      <input
                        type="text"
                        value={workspaceInfo.account_holder}
                        onChange={(e) => handleProfileChange('account_holder', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm"
                        placeholder="Account Holder Name"
                      />
                    </div>
                  </div>

                  {/* Account Number & IFSC Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Account Number</label>
                      <input
                        type="text"
                        value={workspaceInfo.account_number}
                        onChange={(e) => handleProfileChange('account_number', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm font-mono"
                        placeholder="Account Number"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">IFSC Code</label>
                      <input
                        type="text"
                        value={workspaceInfo.ifsc_code}
                        onChange={(e) => handleProfileChange('ifsc_code', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm font-mono uppercase"
                        placeholder="IFSC Code"
                      />
                    </div>
                  </div>

                  {/* Branch & UPI ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">Branch</label>
                      <input
                        type="text"
                        value={workspaceInfo.branch}
                        onChange={(e) => handleProfileChange('branch', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm"
                        placeholder="Branch"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-normal text-slate-800 dark:text-slate-200">UPI ID</label>
                      <input
                        type="text"
                        value={workspaceInfo.upi_id}
                        onChange={(e) => handleProfileChange('upi_id', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-none outline-none focus:border-slate-400 text-sm"
                        placeholder="UPI ID"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. GST & Taxations (Screenshot 489) */}
            {activeTab === 'GST & Taxations' && (
              <div className="space-y-6 max-w-3xl">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">GST & Taxations</h3>

                {/* Box 1: Enable GST with toggle */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable GST</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gstEnabled}
                    onClick={() => handleGstToggle(!gstEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      gstEnabled ? 'bg-[#3B66CC] dark:bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        gstEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Box 2: Default GST Tax Type dropdown */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">Default GST Tax Type</label>
                  <select
                    value={gstType}
                    onChange={(e) => handleGstTypeChange(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                  >
                    <option value="Both">Both</option>
                    <option value="CGST - SGST">CGST & SGST (Intra-State)</option>
                    <option value="IGST">IGST (Inter-State)</option>
                  </select>
                </div>
              </div>
            )}


            {/* 4. Backup & Data (Screenshot 491) */}
            {activeTab === 'Backup & Data' && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Backup & Data</h3>
                  <button
                    onClick={handleRunManualBackup}
                    disabled={isExporting}
                    className="px-4 py-2 bg-[#009E4F] hover:bg-emerald-700 text-white font-medium text-xs rounded transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {isExporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Run Manual Backup</span>
                  </button>
                </div>

                {/* Box 1: Enable Auto-backup with toggle */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Enable Auto-backup</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={backupConfig.autoDownload}
                    onClick={handleToggleAutoBackup}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      backupConfig.autoDownload ? 'bg-[#3B66CC] dark:bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        backupConfig.autoDownload ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Box 2: Schedule Backup at dropdown */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">Schedule Backup at</label>
                  <select
                    value={backupConfig.frequency}
                    onChange={(e) => handleScheduleBackupChange(e.target.value as BackupFrequency)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                  >
                    <option value="manual">Manual</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Box 3: Download data in dropdown */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <label className="text-xs font-medium text-slate-800 dark:text-slate-200 block">Download data in</label>
                  <select
                    value={backupConfig.format}
                    onChange={(e) => handleBackupFormatChange(e.target.value as BackupFormat)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded outline-none text-xs cursor-pointer"
                  >
                    <option value="csv">Excel as CSV ( default )</option>
                    <option value="json">JSON ( Complete snapshot )</option>
                  </select>
                </div>

                {/* Box 4: Recent Backups */}
                <div className="border border-slate-200 dark:border-slate-800 p-4 space-y-3 min-h-[140px]">
                  <label className="text-sm font-medium text-slate-800 dark:text-slate-200 block">Recent Backups</label>
                  {backupHistory.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {backupHistory.map((b, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800">
                          <span className="font-mono text-slate-700 dark:text-slate-300">{b.filename || b.timestamp}</span>
                          <span className="text-slate-400">{b.recordCount} records</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic pt-2">No backups performed yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* 5. Recycle Bin (Screenshot 492) */}
            {activeTab === 'Recycle Bin' && (
              <div className="space-y-4 max-w-3xl">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Recycle Bin</h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden min-h-[280px] flex flex-col">
                  {/* Top Filter Bar */}
                  <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center">
                    <span className="px-3.5 py-1 bg-[#3B66CC] dark:bg-primary text-white text-xs font-semibold rounded-none cursor-pointer">
                      All
                    </span>
                  </div>

                  {/* List / Content */}
                  <div className="flex-1 p-4 overflow-y-auto">
                    {recycleLoading ? (
                      <div className="flex items-center justify-center h-36">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      </div>
                    ) : recycleItems.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {recycleItems.map((item) => (
                          <div key={item.id} className="py-2.5 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</p>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider">{item.type}</span>
                            </div>
                            <button
                              onClick={() => handleRestoreItem(item)}
                              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-none flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restore</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-slate-400 text-xs italic">
                        Recycle Bin is empty.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 6. License (Screenshot 493) */}
            {activeTab === 'License' && (
              <div className="space-y-6 max-w-3xl">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">License & Plans</h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
                  <div className="bg-[#3B66CC] dark:bg-primary text-white font-bold text-center py-3 text-sm">
                    Standard Edition
                  </div>
                  <div className="p-6 space-y-4 text-xs sm:text-sm">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400">Valid until</span>
                      <span className="font-medium text-slate-900 dark:text-white">1 November 2026</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400">License Key</span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white">{license?.license_key || 'LC-93JA-89AX-49ZS'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400">Registered License Email</span>
                      <span className="font-medium text-slate-900 dark:text-white">{license?.client_name || 'bhushanmehta1992@gmail.com'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Check for Updates (Screenshot 494) */}
            {activeTab === 'Check for Updates' && (
              <div className="space-y-6 max-w-3xl">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Check for Updates</h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
                  <div className="bg-[#007A78] text-white font-bold text-center py-3 text-sm">
                    You're upto date
                  </div>
                  <div className="p-6 space-y-4 text-xs sm:text-sm">
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400">Version</span>
                      <span className="font-medium text-slate-900 dark:text-white">V2.0</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600 dark:text-slate-400">Build</span>
                      <span className="font-mono font-medium text-slate-900 dark:text-white">2026-27-02</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 8. Danger Zone (Screenshot 495) */}
            {activeTab === 'Danger Zone' && (
              <div className="space-y-6 max-w-3xl">
                <h3 className="text-[16px] font-bold text-red-600">Danger Zone</h3>

                <div className="border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Delete this workspace</h4>
                    <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone</p>
                  </div>
                  <button
                    onClick={handleDeleteWorkspace}
                    className="px-5 py-2.5 bg-[#C00000] hover:bg-red-700 text-white font-semibold text-xs rounded-none transition-colors shrink-0 shadow-xs"
                  >
                    Delete Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
