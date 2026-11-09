import React, { useState, useEffect, useRef } from 'react';
import { getActiveCompanyId, safeSupabaseSave, toStorageValue, toDisplayValue } from '../utils/helpers';
import { getAuthUser } from '../lib/supabase';
import { recordActivity } from '../utils/activityTracker';
import FormActionButtons from './FormActionButtons';
import { useKeyboardShortcuts } from '../utils/shortcutManager';
import { toast } from '../utils/toast';

interface PartyFormProps {
  initialData?: any | null;
  prefilledName?: string;
  defaultType?: 'customer' | 'vendor' | 'both';
  onSubmit: (party: any, isSaveAndNew?: boolean) => void;
  onCancel: () => void;
}

const PartyForm: React.FC<PartyFormProps> = ({ initialData, prefilledName, defaultType = 'customer', onSubmit, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [isSaveAndNew, setIsSaveAndNew] = useState(false);
  const [formData, setFormData] = useState<any>({
    name: prefilledName || '', 
    email: '', 
    phone: '', 
    gstin: '', 
    pan: '', 
    state: '',
    account_number: '', 
    account_name: '', 
    ifsc_code: '', 
    address: '', 
    balance: 0,
    party_type: defaultType,
    is_customer: defaultType === 'customer' || defaultType === 'both'
  });

  const firstInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useKeyboardShortcuts({
    onSave: () => {
      setIsSaveAndNew(false);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    },
    onSaveAndNew: () => {
      setIsSaveAndNew(true);
      if (formRef.current) {
        if (typeof formRef.current.requestSubmit === 'function') formRef.current.requestSubmit();
        else formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    },
    priority: 40 // Higher priority than parent invoice/bill if opened as submodal
  }, [formData]);

  useEffect(() => {
    if (initialData) {
      let pType = (initialData.party_type || '').toLowerCase();
      if (!pType || (pType !== 'customer' && pType !== 'vendor' && pType !== 'both')) {
        pType = initialData.is_customer ? 'customer' : 'vendor';
      }
      setFormData({ 
        ...initialData,
        party_type: pType,
        is_customer: pType === 'customer' || pType === 'both'
      });
    } else if (prefilledName) {
      setFormData((prev: any) => ({ ...prev, name: prefilledName }));
    }
    setTimeout(() => {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    }, 100);
  }, [initialData, prefilledName]);

  const handleChange = (field: string, value: any) => { 
    if (field === 'name') {
      setFormData((prev: any) => ({ ...prev, name: typeof value === 'string' ? value.toUpperCase() : value })); 
    } else {
      setFormData((prev: any) => ({ ...prev, [field]: value })); 
    }
  };

  const handleTypeChange = (type: 'customer' | 'vendor' | 'both') => {
    setFormData((prev: any) => ({ 
      ...prev, 
      party_type: type,
      is_customer: type === 'customer' || type === 'both'
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.name.trim()) {
      toast.warning("Party Name is required.");
      return;
    }
    setLoading(true);
    try {
      const user = await getAuthUser();
      if (user) recordActivity(user.id, user.email || '');

      const cid = getActiveCompanyId();
      const payload = { 
        ...formData, 
        party_type: formData.party_type || 'customer',
        is_customer: formData.party_type === 'customer' || formData.party_type === 'both',
        balance: toStorageValue(formData.balance),
        company_id: cid, 
        is_deleted: false,
        name: formData.name.trim().toUpperCase()
      };
      
      const result = await safeSupabaseSave('vendors', payload, initialData?.id);
      toast.success(initialData ? "Party updated successfully." : "Party created successfully.");
      onSubmit(result.data[0], isSaveAndNew);
      if (isSaveAndNew) {
        setFormData({
          name: '', 
          email: '', 
          phone: '', 
          gstin: '', 
          pan: '', 
          state: '',
          account_number: '', 
          account_name: '', 
          ifsc_code: '', 
          address: '', 
          balance: 0,
          party_type: defaultType,
          is_customer: defaultType === 'customer' || defaultType === 'both'
        });
        setTimeout(() => firstInputRef.current?.focus(), 100);
      }
    } catch (err: any) { 
      toast.error("Error saving party: " + (err.message || 'Unknown error')); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 bg-white dark:bg-slate-900">
      {/* Party Name & Party Type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Party Name</label>
          <input 
            ref={firstInputRef} 
            type="text" 
            required
            value={toDisplayValue(formData.name)} 
            onChange={e => handleChange('name', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-bold" 
            placeholder="Party / Business Name" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Party Type</label>
          <select 
            value={formData.party_type || 'customer'}
            onChange={e => handleTypeChange(e.target.value as 'customer' | 'vendor' | 'both')}
            className="w-full h-10 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium cursor-pointer"
          >
            <option value="customer" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Customer</option>
            <option value="vendor" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Vendor</option>
            <option value="both" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Both (Customer & Vendor)</option>
          </select>
        </div>
      </div>

      {/* Opening Balance & Tax Info */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Opening Balance</label>
          <input 
            type="number" 
            value={toDisplayValue(formData.balance)} 
            onChange={e => handleChange('balance', parseFloat(e.target.value) || 0)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono" 
            placeholder="0.00" 
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">GSTIN Number</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.gstin)} 
            onChange={e => handleChange('gstin', e.target.value.toUpperCase())} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-mono" 
            placeholder="GSTIN (Optional)" 
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">PAN Number</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.pan)} 
            onChange={e => handleChange('pan', e.target.value.toUpperCase())} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-mono" 
            placeholder="PAN Number" 
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">State</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.state)} 
            onChange={e => handleChange('state', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
            placeholder="State Name" 
          />
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Email Address</label>
          <input 
            type="email" 
            value={toDisplayValue(formData.email)} 
            onChange={e => handleChange('email', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
            placeholder="Email Address" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Contact Number</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.phone)} 
            onChange={e => handleChange('phone', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
            placeholder="Phone Number" 
          />
        </div>
      </div>

      {/* Business Address */}
      <div className="space-y-1.5">
        <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Business Address</label>
        <textarea 
          rows={3} 
          value={toDisplayValue(formData.address)} 
          onChange={e => handleChange('address', e.target.value)} 
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
          placeholder="Physical / Billing Address" 
        />
      </div>

      {/* Bank Details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Bank Account Number</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.account_number)} 
            onChange={e => handleChange('account_number', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono" 
            placeholder="Account Number" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Account Holder Name</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.account_name)} 
            onChange={e => handleChange('account_name', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
            placeholder="Holder's Name" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">IFSC Code</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.ifsc_code)} 
            onChange={e => handleChange('ifsc_code', e.target.value.toUpperCase())} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-[14px] focus:border-slate-400 dark:focus:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase" 
            placeholder="IFSC Code" 
          />
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <FormActionButtons
          primaryText={initialData ? 'Update Party' : 'Save Party'}
          primaryType="submit"
          primaryOnClick={() => setIsSaveAndNew(false)}
          primaryDisabled={loading}
          primaryLoading={loading && !isSaveAndNew}

          secondaryLeftText="Save & New"
          secondaryLeftType="submit"
          secondaryLeftOnClick={() => setIsSaveAndNew(true)}
          secondaryLeftDisabled={loading}
          secondaryLeftLoading={loading && isSaveAndNew}

          secondaryRightText="Save & Close"
          secondaryRightType="submit"
          secondaryRightOnClick={() => setIsSaveAndNew(false)}
          secondaryRightDisabled={loading}

          discardText="Discard"
          discardOnClick={onCancel}
          discardDisabled={loading}
        />
      </div>
    </form>
  );
};

export default PartyForm;
