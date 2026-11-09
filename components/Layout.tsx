
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Users, UserSquare2, BadgeIndianRupee, Package, BarChart3, Settings as SettingsIcon, ShoppingCart, Percent, BookOpen, ChevronDown, Building2, Menu, LogOut, Edit, Trash2, Save, Plus, ShieldCheck, AlertTriangle, MonitorPlay, Wallet, Contact, FileText, ArrowDownCircle, ArrowUpCircle, FolderPlus, Building, Crown, Lock, Search, FileSpreadsheet, Truck, KeyRound, HardDrive } from 'lucide-react';
import { supabase, getAuthUser } from '../lib/supabase';
import { useCompany } from '../context/CompanyContext';
import Logo from './Logo';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import CreateNewModal from './CreateNewModal';
import GlobalSearchModal from './GlobalSearchModal';
import ImportExcelModal from './ImportExcelModal';
import { getUserActivity } from '../utils/activityTracker';
import { getActiveLicense, DEFAULT_LICENSE_KEY, removeActiveLicense } from '../lib/licenseManager';
import BackupStatusBadge from './BackupStatusBadge';
import FormActionButtons from './FormActionButtons';
import SettingsModal from './SettingsModal';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [isCreateNewModalOpen, setIsCreateNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const { activeCompany, setCompany } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<any>(null);
  const [isInactive, setIsInactive] = useState(false);
  const [activeLicense, setActiveLicenseState] = useState<any>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const u = await getAuthUser();
      setUser(u);
      setActiveLicenseState(getActiveLicense());
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const checkStatus = () => {
      if (user) {
        const activity = getUserActivity(user.id);
        setIsInactive(activity?.status === 'inactive');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check status every 30s
    return () => clearInterval(interval);
  }, [user]);

  // Handle window resize to auto-close/open sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (location.pathname === '/settings') {
      setIsSettingsOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handleOpenSettings = () => setIsSettingsOpen(true);
    window.addEventListener('openSettingsModal', handleOpenSettings);
    return () => window.removeEventListener('openSettingsModal', handleOpenSettings);
  }, []);

  // Universal Keyboard Shortcuts (Ctrl+K, Ctrl+N, Ctrl+S, Esc)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl + K -> Global Search
      if (isCtrl && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault();
        e.stopPropagation();
        setIsGlobalSearchOpen(prev => !prev);
        return;
      }

      // Ctrl + N -> Create New
      if (isCtrl && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) {
        e.preventDefault();
        e.stopPropagation();
        setIsCreateNewModalOpen(true);
        return;
      }

      // Ctrl + S -> Save active form or modal
      if (isCtrl && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
        e.preventDefault();
        e.stopPropagation();
        // Look for open modal form
        const modalForm = document.querySelector('.fixed form, [role="dialog"] form') as HTMLFormElement | null;
        if (modalForm) {
          if (typeof modalForm.requestSubmit === 'function') {
            modalForm.requestSubmit();
          } else {
            const btn = modalForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            if (btn) btn.click();
            else modalForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
          return;
        }

        // Look for main page form
        const pageForm = document.querySelector('main form, form') as HTMLFormElement | null;
        if (pageForm) {
          if (typeof pageForm.requestSubmit === 'function') {
            pageForm.requestSubmit();
          } else {
            const btn = pageForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            if (btn) btn.click();
            else pageForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
          return;
        }
      }

      // Esc -> Close search / create new modal / mobile menu / workspace menu
      if (e.key === 'Escape') {
        if (isGlobalSearchOpen) setIsGlobalSearchOpen(false);
        if (isCreateNewModalOpen) setIsCreateNewModalOpen(false);
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (showWorkspaceMenu) setShowWorkspaceMenu(false);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts, true);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts, true);
  }, [isGlobalSearchOpen, isCreateNewModalOpen, isMobileMenuOpen, showWorkspaceMenu]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Edit/Create Workspace States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<any>(null);
  const [wsFormData, setWsFormData] = useState({ name: '', gstin: '', address: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; ws: any | null }>({ isOpen: false, ws: null });

  const loadWorkspaces = async () => {
    try {
      const u = user || await getAuthUser();
      const isRealUser = u && u.id !== 'local-user-1';

      let query = supabase.from('companies').select('*').eq('is_deleted', false);
      if (isRealUser) {
        query = query.or(`created_by.eq.${u.id},user_id.eq.${u.id}`);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;

      const filtered = (data || []).filter((c: any) => {
        if (isRealUser && c.id === 'local-company-1') return false;
        return true;
      });

      setWorkspaces(filtered);
    } catch (err: any) {
      if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError') || err?.name === 'TypeError' || err?.status === 401 || err?.message?.includes('Auth') || err?.message?.includes('JWT')) {
        console.warn("Offline or unauthorized while loading workspaces:", err?.message || err);
      } else {
        console.error("Error loading workspaces:", err);
      }
    }
  };

  useEffect(() => {
    if (user) {
      loadWorkspaces();
    }
  }, [user]);

  const handleSwitchWorkspace = async (ws: any) => {
    await setCompany(ws);
    setShowWorkspaceMenu(false);
    navigate('/', { replace: true });
  };

  const handleSignOut = async () => {
    try {
      removeActiveLicense();
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (err) {
      console.error("Error signing out:", err);
      navigate('/auth', { replace: true });
    }
  };

  const handleOpenCreateWs = () => {
    setEditingWs(null);
    setWsFormData({ name: '', gstin: '', address: '' });
    setIsEditModalOpen(true);
    setShowWorkspaceMenu(false);
  };

  const openEditWs = (e: React.MouseEvent, ws: any) => {
    e.stopPropagation();
    setEditingWs(ws);
    setWsFormData({ name: ws.name, gstin: ws.gstin || '', address: ws.address || '' });
    setIsEditModalOpen(true);
    setShowWorkspaceMenu(false);
  };

  const openDeleteWs = (e: React.MouseEvent, ws: any) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, ws });
    setShowWorkspaceMenu(false);
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsFormData.name.trim()) return;
    
    try {
      const user = await getAuthUser();
      if (!user) throw new Error("Auth session not found");

      const payload = {
        name: wsFormData.name.trim().toUpperCase(),
        gstin: wsFormData.gstin.trim().toUpperCase(),
        address: wsFormData.address.trim(),
        user_id: user.id,
        created_by: user.id
      };

      if (editingWs) {
        const { error } = await supabase
          .from('companies')
          .update(payload)
          .eq('id', editingWs.id);
        if (error) throw error;
        
        if (activeCompany?.id === editingWs.id) {
            await setCompany({ ...editingWs, ...payload, name: payload.name });
        }
      } else {
        const { error } = await supabase
          .from('companies')
          .insert([payload]);
        if (error) throw error;
      }

      setIsEditModalOpen(false);
      loadWorkspaces();
    } catch (err: any) {
      alert(`Operation Failed: ${err.message}`);
    }
  };

  const handleConfirmDeleteWs = async () => {
    if (!deleteConfirm.ws) return;
    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_deleted: true })
        .eq('id', deleteConfirm.ws.id);
      
      if (error) throw error;
      
      if (activeCompany?.id === deleteConfirm.ws.id) {
        localStorage.removeItem('activeCompanyId');
        localStorage.removeItem('activeCompanyName');
        navigate('/companies', { replace: true });
      } else {
        loadWorkspaces();
      }
    } catch (err: any) {
      alert(`Delete Failed: ${err.message}`);
    } finally {
      setDeleteConfirm({ isOpen: false, ws: null });
    }
  };

  const menuGroups = [
    {
      groupName: '',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
      ]
    },
    {
      groupName: 'Sales',
      items: [
        { icon: FileText, label: 'Sales Invoices', path: '/sales' },
        { icon: ArrowDownCircle, label: 'Receive Payment', path: '/receive-payment' },
      ]
    },
    {
      groupName: 'Purchases',
      items: [
        { icon: ShoppingCart, label: 'Purchase Bill', path: '/bills' },
        { icon: ArrowUpCircle, label: 'Pay Supplier', path: '/make-payment' },
      ]
    },
    {
      groupName: 'Stock',
      items: [
        { icon: Package, label: 'Stock Items', path: '/stock' },
      ]
    },
    {
      groupName: 'Parties',
      items: [
        { icon: Contact, label: 'Parties', path: '/parties' },
      ]
    },
    {
      groupName: 'Others',
      items: [
        { icon: BookOpen, label: 'Cashbook', path: '/cashbook' },
        { icon: Percent, label: 'Additional Charges', path: '/additional-charges' },
        { icon: BarChart3, label: 'Reports', path: '/reports' },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-[#F7F8FC] dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300 relative">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[70] lg:relative lg:z-50
        ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-16 -translate-x-full lg:translate-x-0'}
        ${isMobileMenuOpen ? 'translate-x-0 w-64' : ''}
        bg-white dark:bg-slate-900 border-none flex flex-col transition-all duration-300
      `} style={{ borderStyle: 'none' }}>
        <div className="h-16 flex items-center px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <Logo size={32} />
            {(isSidebarOpen || isMobileMenuOpen) && (
              <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-500">
                <div className="flex items-center space-x-2">
                  <span className="text-[16px] font-normal text-black dark:text-white tracking-tight leading-[17px]" style={{ fontFamily: 'Geologica, sans-serif', color: '#000000', fontWeight: 'normal', fontSize: '16px', lineHeight: '17px' }}>Bipin Petroleum Co.</span>
                </div>
              </div>
            )}
          </div>
          {/* Close button for mobile menu */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden ml-auto p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>
        
        {/* Gateway of Bipin Petroleum Co. Header */}
        <div className={`bg-white dark:bg-slate-800/40 flex items-center transition-all duration-300 shrink-0 border-none ${(isSidebarOpen || isMobileMenuOpen) ? 'px-4 py-2.5 h-10' : 'h-1.5 justify-center'}`} style={{ backgroundColor: '#ffffff', borderStyle: 'none' }}>
          {(isSidebarOpen || isMobileMenuOpen) && (
            <span className="text-slate-500 dark:text-slate-400 font-bold text-[10px] capitalize tracking-wide whitespace-nowrap">
              Gateway Of Bipin Petroleum Co.
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-2 custom-scrollbar">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-0.5">
              {(isSidebarOpen || isMobileMenuOpen) && group.groupName && (
                <div className="pt-2 pb-1 px-3 flex items-center space-x-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                    {group.groupName}
                  </span>
                  <span className="h-[1px] flex-1 bg-slate-100 dark:bg-slate-800" />
                </div>
              )}
              {(!isSidebarOpen && !isMobileMenuOpen) && group.groupName && gIdx > 0 && (
                <div className="my-1 border-t border-slate-100 dark:border-slate-800/60" />
              )}
              {group.items.map((item: any, iIdx) => {
                const IconComponent = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path || iIdx}
                    to={item.path || '/'}
                    className={`flex items-center px-3 py-2 rounded transition-colors ${isActive
                      ? 'bg-primary text-white font-bold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                  >
                    <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                    {(isSidebarOpen || isMobileMenuOpen) && (
                      <span className="ml-3 text-[13px] whitespace-nowrap capitalize">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 text-center">
          {(isSidebarOpen || isMobileMenuOpen) ? (
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tracking-wide whitespace-nowrap">
              Powered by <span className="text-primary dark:text-blue-400 font-bold">ZenterPrime</span>
            </p>
          ) : (
            <p className="text-[10px] font-bold text-primary dark:text-blue-400 uppercase tracking-tighter" title="Powered by ZenterPrime">
              ZP
            </p>
          )}
        </div>
      </aside>
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 z-40" style={{ height: '63.9931px', backgroundColor: '#ffffff' }}>
          <div className="flex items-center space-x-4">
            {/* Desktop toggle sidebar */}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden lg:block p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400">
              <Menu className="w-4 h-4" />
            </button>
            {/* Mobile toggle menu */}
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
                className="flex items-center px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                style={{ height: '37.7431px', borderRadius: '8px' }}
              >
                <Building2 className="w-3.5 h-3.5 text-slate-400 mr-2" />
                <span className="font-medium text-slate-700 dark:text-slate-200 capitalize text-[11px] max-w-[100px] sm:max-w-[150px] truncate">
                  {activeCompany?.name || 'Select Workspace'}
                </span>
                <ChevronDown className="ml-2 w-3 h-3 text-slate-400" />
              </button>
              {showWorkspaceMenu && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                    {workspaces.map((ws) => (
                      <div 
                        key={ws.id}
                        className={`w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group ${activeCompany?.id === ws.id ? 'bg-primary/10 dark:bg-primary/5' : ''}`}
                        onClick={() => handleSwitchWorkspace(ws)}
                      >
                        <div className="flex items-center min-w-0 flex-1">
                            <Building2 className={`w-3.5 h-3.5 mr-2 shrink-0 ${activeCompany?.id === ws.id ? 'text-slate-900 dark:text-primary' : 'text-slate-400'}`} />
                            <span className={`truncate capitalize text-xs ${activeCompany?.id === ws.id ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{ws.name}</span>
                        </div>
                        <div className="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => openEditWs(e, ws)} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded"><Edit className="w-3 h-3" /></button>
                            <button onClick={(e) => openDeleteWs(e, ws)} className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-700 rounded"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 py-1 bg-slate-50/50 dark:bg-slate-900/50">
                    <button
                      onClick={handleOpenCreateWs}
                      className="w-full flex items-center px-4 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5 mr-2" />
                      <span className="capitalize">Create New Workspace</span>
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center px-4 py-2.5 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5 mr-2" />
                      <span className="capitalize">Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div 
              onClick={() => navigate('/auth')}
              title="Current Active License Key - Click to manage licenses"
              className="flex items-center space-x-1.5 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] transition-colors cursor-pointer"
              style={{ height: '37.7431px', borderRadius: '8px', borderWidth: '0.5px' }}
            >
              <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="font-semibold">{activeLicense?.license_key || 'Active License'}</span>
            </div>
            <div style={{ height: '37.7431px', display: 'flex', alignItems: 'center' }}>
              <BackupStatusBadge />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {isInactive && (
              <div className="hidden md:flex items-center space-x-2 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full border border-red-100 dark:border-red-800 animate-pulse transition-all">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] sm:text-xs font-medium text-red-600 dark:text-red-400">
                  Inactive Session
                </span>
              </div>
            )}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              style={{ height: '37.7431px', borderRadius: '8px' }}
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>


        <GlobalSearchModal
          isOpen={isGlobalSearchOpen}
          onClose={() => setIsGlobalSearchOpen(false)}
        />
        <ImportExcelModal
          isOpen={isImportExcelOpen}
          onClose={() => setIsImportExcelOpen(false)}
          onSuccess={() => {
            window.dispatchEvent(new Event('appSettingsChanged'));
            window.dispatchEvent(new Event('partiesUpdated'));
            window.dispatchEvent(new Event('stockUpdated'));
          }}
        />
        <CreateNewModal
          isOpen={isCreateNewModalOpen}
          onClose={() => setIsCreateNewModalOpen(false)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 bg-[#F7F8FC] dark:bg-slate-950">
          <Outlet />
        </main>
      </div>

      {/* Workspace Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingWs ? "Workspace Configuration" : "New Business Workspace"} maxWidth="max-w-xl">
        <form onSubmit={handleSaveWorkspace} className="p-6 space-y-6">
            <div className="space-y-4 border border-slate-200 dark:border-slate-800 rounded-md p-6">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 capitalize">Workspace Name</label>
                    <input required value={wsFormData.name} onChange={e => setWsFormData({...wsFormData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm focus:border-slate-400 outline-none capitalize font-medium" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 capitalize">GSTIN Number</label>
                    <input value={wsFormData.gstin} onChange={e => setWsFormData({...wsFormData, gstin: e.target.value.toUpperCase()})} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm focus:border-slate-400 outline-none font-mono uppercase" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 capitalize">Business Address</label>
                    <textarea value={wsFormData.address} onChange={e => setWsFormData({...wsFormData, address: e.target.value})} rows={3} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded text-sm focus:border-slate-400 outline-none resize-none" />
                </div>
            </div>
            <div className="pt-2">
                <FormActionButtons
                    primaryText={editingWs ? 'Update Workspace' : 'Create Workspace'}
                    primaryType="submit"

                    secondaryLeftText="Save & Continue"
                    secondaryLeftType="submit"

                    secondaryRightText="Save & Close"
                    secondaryRightType="submit"

                    discardText="Discard"
                    discardOnClick={() => setIsEditModalOpen(false)}
                />
            </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog 
        isOpen={deleteConfirm.isOpen} 
        onClose={() => setDeleteConfirm({ isOpen: false, ws: null })} 
        onConfirm={handleConfirmDeleteWs} 
        title="Delete Workspace" 
        message={`This will permanently remove "${deleteConfirm.ws?.name}" and all its data. Are you sure?`} 
      />
    </div>
  );
};

export default Layout;
