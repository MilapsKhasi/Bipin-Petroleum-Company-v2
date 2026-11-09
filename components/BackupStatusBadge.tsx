import React, { useState, useEffect, useRef } from 'react';
import { Download, FileSpreadsheet, FileCode, CheckCircle2, ChevronDown, Clock, ShieldCheck, Settings, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getBackupConfig, 
  executeManualBackup, 
  subscribeBackupEvents, 
  BackupConfig,
  getPopulatedWorkspaceData
} from '../lib/backupEngine';

export const BackupStatusBadge: React.FC = () => {
  const [config, setConfig] = useState<BackupConfig>(getBackupConfig());
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalRecords: number; totalModules: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refreshState = () => {
    setConfig(getBackupConfig());
    getPopulatedWorkspaceData().then((data) => {
      setStats({
        totalRecords: data.metadata.totalRecords,
        totalModules: data.metadata.totalModules,
      });
    }).catch(() => {});
  };

  useEffect(() => {
    refreshState();
    const unsub = subscribeBackupEvents(refreshState);
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'excel' | 'json') => {
    try {
      setIsExporting(format);
      setSuccessMsg(null);
      const res = await executeManualBackup(format, { autoDownload: true });
      setSuccessMsg(`Saved ${res.totalRecords} records (${res.totalModules} modules) in ${res.filename}`);
      refreshState();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Backup error:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const getFrequencyLabel = () => {
    switch (config.frequency) {
      case 'every_transaction': return 'Auto: Every Tx';
      case 'daily': return 'Auto: Daily';
      case 'weekly': return 'Auto: Weekly';
      case 'monthly': return 'Auto: Monthly';
      case 'manual_only': return 'Manual Only';
      default: return 'Auto';
    }
  };

  const formatLastBackup = () => {
    if (!config.lastBackupTimestamp) return 'No backup yet';
    const diffMin = Math.round((Date.now() - config.lastBackupTimestamp) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(config.lastBackupTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shadow-2xs"
        title="Local Data Backup System (Click for quick backup options)"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="font-semibold hidden sm:inline">Backup:</span>
        <span className="text-emerald-700 dark:text-emerald-300 font-mono text-[10px] sm:text-[11px]">
          {getFrequencyLabel()}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform text-emerald-500 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-3 px-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-md">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight">Data Backup Center</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">100% Local & Secure Data Storage</p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 rounded-md"
              title="Backup Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Stats summary */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2.5 mb-3 border border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[11px]">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Last Backup</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                {formatLastBackup()}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Data Ready</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats ? `${stats.totalRecords} records (${stats.totalModules} modules)` : 'Ready to export'}
              </span>
            </div>
          </div>

          {successMsg && (
            <div className="mb-3 p-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-300 text-[11px] flex items-start gap-1.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span className="break-all leading-tight">{successMsg}</span>
            </div>
          )}

          <div className="space-y-2">
            <button
              disabled={isExporting !== null}
              onClick={() => handleExport('excel')}
              className="w-full flex items-center justify-between px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                {isExporting === 'excel' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                <span>{isExporting === 'excel' ? 'Exporting Excel...' : 'Export Excel Backup (.xlsx)'}</span>
              </span>
              <Download className="w-3.5 h-3.5 opacity-80" />
            </button>

            <button
              disabled={isExporting !== null}
              onClick={() => handleExport('json')}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                {isExporting === 'json' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileCode className="w-3.5 h-3.5" />}
                <span>{isExporting === 'json' ? 'Exporting JSON...' : 'Export JSON Backup (.json)'}</span>
              </span>
              <Download className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>Empty modules are automatically omitted.</span>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="font-semibold text-primary hover:underline"
            >
              Configure
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupStatusBadge;
