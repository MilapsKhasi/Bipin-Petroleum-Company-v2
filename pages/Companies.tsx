
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Loader2, LogOut, ArrowRight, Edit, Trash2, Save, KeyRound, HardDrive } from 'lucide-react';
import Modal from '../components/Modal';
import Logo from '../components/Logo';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import FormActionButtons from '../components/FormActionButtons';
import { supabase, getAuthUser } from '../lib/supabase';
import { useCompany } from '../context/CompanyContext';
import { getActiveLicense, DEFAULT_LICENSE_KEY, removeActiveLicense } from '../lib/licenseManager';

const Companies = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', gstin: '', address: '' });
  const [creating, setCreating] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; company: any | null }>({
    isOpen: false,
    company: null
  });
  const [activeLicense, setActiveLicenseState] = useState<any>(null);
  
  const navigate = useNavigate();
  const { activeCompany, setCompany } = useCompany();

  const loadData = async () => {
    setLoading(true);
    try {
      const activeLic = getActiveLicense();
      setActiveLicenseState(activeLic);
      const user = await getAuthUser();
      const currentUserId = user?.id || activeLic?.user_id;

      const { data, error } = await supabase.from('companies').select('*').eq('is_deleted', false).order('name');
      if (error) throw error;

      // Only show workspaces created with the account user_id which is connected to user's entered email
      const filtered = (data || []).filter((c: any) => {
        if (!currentUserId) return false;
        return c.user_id === currentUserId || c.created_by === currentUserId;
      });

      setCompanies(filtered);
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSignOut = async () => {
    removeActiveLicense();
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  const handleOpenCreate = () => {
    setEditingCompany(null);
    setFormData({ name: '', gstin: '', address: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, company: any) => {
    e.stopPropagation();
    setEditingCompany(company);
    setFormData({ name: company.name, gstin: company.gstin || '', address: company.address || '' });
    setIsModalOpen(true);
  };

  const handleOpenDelete = (e: React.MouseEvent, company: any) => {
    e.stopPropagation();
    setDeleteDialog({ isOpen: true, company });
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setCreating(true);

    try {
      const user = await getAuthUser();
      if (!user) throw new Error("Auth Session Not Found");

      const activeLic = getActiveLicense();
      const licKey = activeLic?.license_key || DEFAULT_LICENSE_KEY;

      const payload = {
        name: formData.name.trim().toUpperCase(),
        gstin: formData.gstin.trim().toUpperCase(),
        address: formData.address.trim(),
        license_key: licKey,
        user_id: user.id,
        created_by: user.id
      };

      let error;
      if (editingCompany) {
        const { error: err } = await supabase.from('companies').update(payload).eq('id', editingCompany.id);
        error = err;
      } else {
        const { error: err } = await supabase.from('companies').insert([payload]).select();
        error = err;
      }

      if (error) throw error;
      
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(`Operation Failed: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog.company) return;
    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_deleted: true })
        .eq('id', deleteDialog.company.id);
      
      if (error) throw error;
      
      if (activeCompany?.id === deleteDialog.company.id) {
          localStorage.removeItem('activeCompanyId');
          localStorage.removeItem('activeCompanyName');
      }
      
      loadData();
    } catch (err: any) {
      alert(`Delete Failed: ${err.message}`);
    } finally {
      setDeleteDialog({ isOpen: false, company: null });
    }
  };

  const selectCompany = async (ws: any) => {
    await setCompany(ws);
    navigate('/', { replace: true });
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.gstin?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FC] overflow-hidden font-sans text-slate-900">
      <header className="h-auto min-h-[4rem] border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-4 sm:py-0 shrink-0 bg-white gap-4">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center space-x-2">
            <Logo size={32} />
            <div className="flex items-center px-3 py-1.5 border border-slate-200 rounded-md bg-slate-50">
              <span className="text-[10px] font-medium text-slate-400 capitalize tracking-widest mr-2">Workspaces</span>
            </div>
          </div>
          <button onClick={handleSignOut} className="sm:hidden p-2 text-slate-400 hover:text-red-500 rounded transition-colors" title="Lock & Return to License Screen">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="w-full sm:flex-1 sm:max-w-lg sm:mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter your workspaces..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded text-xs outline-none focus:border-slate-400 bg-white"
            />
          </div>
        </div>
        <div className="hidden sm:flex items-center space-x-3">
          <div 
            onClick={() => navigate('/auth')}
            title="Active License - Click to change"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs rounded-lg cursor-pointer hover:bg-slate-200 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold">{activeLicense?.license_key || 'Active License'}</span>
          </div>
          <span className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium rounded text-[11px]">
            <HardDrive className="w-3 h-3 text-emerald-600" />
            <span>Offline</span>
          </span>
          <button 
            onClick={handleSignOut} 
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded transition-colors"
            title="Lock & Return to License Screen"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-10 bg-[#F7F8FC]">
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-6 gap-4">
              <div>
                <h1 className="text-[20px] font-medium text-slate-900 capitalize">Select Workspace</h1>
              </div>
              {companies.length > 0 && (
                <button onClick={handleOpenCreate} className="bg-primary text-white px-8 py-3 rounded-md font-medium text-sm hover:bg-primary-dark transition-none flex items-center justify-center capitalize w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" /> New Workspace
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-40 flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              </div>
            ) : filteredCompanies.length === 0 ? (
                <EmptyState 
                  title="No Workspace Found" 
                  message="It seems you haven't registered any business workspace yet. Start by creating one!" 
                  actionLabel="Register Workspace" 
                  onAction={handleOpenCreate} 
                />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCompanies.map((company) => (
                  <div key={company.id} onClick={() => selectCompany(company)}
                    className="group p-6 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition-none relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-white border border-slate-200 rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors">
                        <Building2 className="w-6 h-6 text-slate-400 group-hover:text-white" />
                      </div>
                      <div className="flex items-center space-x-2">
                        <button onClick={(e) => handleOpenEdit(e, company)} className="p-2 text-slate-300 hover:text-slate-900 hover:bg-white rounded transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => handleOpenDelete(e, company)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-white rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                    <h3 className="font-medium text-lg capitalize truncate">{company.name}</h3>
                    <p className="text-[11px] font-mono text-slate-400 mb-4">{company.gstin || 'Unregistered'}</p>
                    <div className="flex items-center text-[10px] font-medium text-slate-400 capitalize tracking-tighter">
                      <span className="bg-white border border-slate-200 px-2 py-0.5 rounded mr-2">Account Ok</span>
                      <span>Enter Desk</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
      
      <ConfirmDialog 
        isOpen={deleteDialog.isOpen} 
        onClose={() => setDeleteDialog({ isOpen: false, company: null })} 
        onConfirm={confirmDelete} 
        title="Delete Workspace" 
        message={`Are you sure you want to delete "${deleteDialog.company?.name}" forever? This action cannot be undone.`} 
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCompany ? "Edit Business Workspace" : "Register Business Workspace"} maxWidth="max-w-2xl">
        <form onSubmit={handleCreateOrUpdate} className="p-4 sm:p-8 space-y-6 bg-white">
          <div className="space-y-6 border border-slate-200 rounded-md p-4 sm:p-8 bg-white">
            <div className="space-y-1.5">
              <label className="text-sm font-medium capitalize text-slate-400">Legal Business Name</label>
              <input required type="text" value={formData.name} onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded outline-none text-base font-medium capitalize focus:border-slate-400" placeholder="e.g. Acme Solutions" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium capitalize text-slate-400">Gstin Identification</label>
              <input type="text" value={formData.gstin} onChange={(e) =>
                setFormData({ ...formData, gstin: e.target.value.toUpperCase() })} className="w-full px-4 py-3 border border-slate-200 rounded outline-none font-mono text-sm uppercase focus:border-slate-400" placeholder="27AAAAA0000A1Z5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium capitalize text-slate-400">Registered Office Address</label>
              <textarea value={formData.address} onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })} rows={3} className="w-full px-4 py-3 border border-slate-200 rounded outline-none text-sm focus:border-slate-400 resize-none" placeholder="Enter complete office address..." />
            </div>
          </div>
          <div className="pt-4">
            <FormActionButtons
              primaryText={creating ? 'Processing...' : editingCompany ? 'Save Changes' : 'Save Workspace'}
              primaryType="submit"
              primaryDisabled={creating}
              primaryLoading={creating}

              secondaryLeftText="Save & Continue"
              secondaryLeftType="submit"
              secondaryLeftDisabled={creating}

              secondaryRightText="Save & Close"
              secondaryRightType="submit"
              secondaryRightDisabled={creating}

              discardText="Discard"
              discardOnClick={() => setIsModalOpen(false)}
              discardDisabled={creating}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Companies;
