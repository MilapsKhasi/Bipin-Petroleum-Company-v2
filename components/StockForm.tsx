import React, { useState, useEffect, useRef } from 'react';
import { Package, Tag, Box, Hash, Scale, Loader2 } from 'lucide-react';
import { toDisplayValue, toStorageValue, getAppSettings, CURRENCIES } from '../utils/helpers';
import { recordActivity } from '../utils/activityTracker';
import { supabase, getAuthUser } from '../lib/supabase';
import FormActionButtons from './FormActionButtons';
import { useKeyboardShortcuts } from '../utils/shortcutManager';
import { toast } from '../utils/toast';

interface StockFormProps {
  initialData?: any;
  onSubmit: (item: any, isSaveAndNew?: boolean) => void;
  onCancel: () => void;
  focusStockField?: boolean;
}

const TAX_RATES = [0, 5, 12, 18, 28];

const StockForm: React.FC<StockFormProps> = ({ initialData, onSubmit, onCancel, focusStockField }) => {
  const [loading, setLoading] = useState(false);
  const [isSaveAndNew, setIsSaveAndNew] = useState(false);
  const [formData, setFormData] = useState<any>({
    name: '', sku: '', unit: 'PCS', hsn: '', rate: 0, selling_price: 0, in_stock: 0, description: '', tax_rate: 18, kg_per_bag: 0
  });

  const currencySymbol = CURRENCIES[getAppSettings().currency as keyof typeof CURRENCIES]?.symbol || '₹';
  const firstInputRef = useRef<HTMLInputElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);
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
      setFormData({ 
        name: initialData.name || '',
        sku: initialData.sku || '',
        unit: initialData.unit || 'PCS',
        hsn: initialData.hsn || '',
        rate: toDisplayValue(initialData.rate),
        selling_price: toDisplayValue(initialData.selling_price || 0),
        in_stock: toDisplayValue(initialData.in_stock),
        description: initialData.description || '',
        tax_rate: initialData.tax_rate || 18,
        kg_per_bag: toDisplayValue(initialData.kg_per_bag)
      });
    }
    setTimeout(() => {
      if (focusStockField && stockInputRef.current) {
        stockInputRef.current.focus();
        stockInputRef.current.select();
      } else {
        firstInputRef.current?.focus();
        firstInputRef.current?.select();
      }
    }, 150);
  }, [initialData, focusStockField]);

  const handleInputChange = (field: string, value: any) => { 
    if (field === 'name') {
      setFormData({ ...formData, name: typeof value === 'string' ? value.toUpperCase() : value });
    } else {
      setFormData({ ...formData, [field]: value }); 
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.name.trim()) {
      toast.warning("Item name is mandatory.");
      return;
    }
    
    setLoading(true);
    try {
      const user = await getAuthUser();
      if (user) recordActivity(user.id, user.email || '');

      const storageData = { 
        ...formData, 
        name: formData.name.trim().toUpperCase(),
        rate: toStorageValue(formData.rate), 
        selling_price: toStorageValue(formData.selling_price),
        in_stock: toStorageValue(formData.in_stock),
        kg_per_bag: toStorageValue(formData.kg_per_bag)
      };
      await onSubmit(storageData, isSaveAndNew);
      toast.success(initialData ? "Stock item updated." : "Stock item created.");
      if (isSaveAndNew) {
        setFormData({
          name: '', sku: '', unit: 'PCS', hsn: '', rate: 0, selling_price: 0, in_stock: 0, description: '', tax_rate: 18, kg_per_bag: 0
        });
        setTimeout(() => firstInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      toast.error("Error saving item: " + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 bg-white dark:bg-slate-900">
      {/* Item Name */}
      <div className="space-y-1.5">
        <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Item / Product Name</label>
        <input 
          ref={firstInputRef} 
          type="text" 
          required
          value={toDisplayValue(formData.name)} 
          onChange={(e) => handleInputChange('name', e.target.value)} 
          className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-base font-bold text-slate-900 dark:text-white focus:border-slate-400 dark:focus:border-slate-600 uppercase" 
          placeholder="e.g. PREMIUM RICE" 
        />
      </div>

      {/* SKU & HSN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">SKU Code</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.sku)} 
            onChange={(e) => handleInputChange('sku', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-sm font-mono focus:border-slate-400 dark:focus:border-slate-600 dark:text-slate-100" 
            placeholder="Optional" 
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">HSN Code</label>
          <input 
            type="text" 
            value={toDisplayValue(formData.hsnCode || formData.hsn)} 
            onChange={(e) => handleInputChange('hsn', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-sm font-mono focus:border-slate-400 dark:focus:border-slate-600 dark:text-slate-100" 
            placeholder="Optional" 
          />
        </div>
      </div>

      {/* Unit & Opening Stock */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Unit</label>
          <div className="relative">
            <select 
              value={formData.unit} 
              onChange={(e) => handleInputChange('unit', e.target.value)} 
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-sm bg-white dark:bg-slate-800 appearance-none focus:border-slate-400 dark:focus:border-slate-600 dark:text-slate-100 cursor-pointer"
            >
              {['PCS', 'NOS', 'KGS', 'LTR', 'BAGS', 'BOX', 'DRUMS', 'PACKS'].map(u => (
                <option key={u} value={u} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{u}</option>
              ))}
            </select>
            <Box className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Opening Stock</label>
          <input 
            ref={stockInputRef}
            type="number" 
            step="any" 
            value={toDisplayValue(formData.in_stock)} 
            onChange={(e) => handleInputChange('in_stock', e.target.value)} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-sm font-mono font-bold focus:border-slate-400 dark:focus:border-slate-600 dark:text-slate-100" 
            placeholder="0"
          />
        </div>
      </div>

      {/* Pricing & Tax */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Purchase Rate ({currencySymbol})</label>
          <input 
            type="number" 
            step="any" 
            value={toDisplayValue(formData.rate)} 
            onChange={(e) => handleInputChange('rate', e.target.value)} 
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded outline-none text-base font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800" 
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Selling Price ({currencySymbol})</label>
          <input 
            type="number" 
            step="any" 
            value={toDisplayValue(formData.selling_price)} 
            onChange={(e) => handleInputChange('selling_price', e.target.value)} 
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded outline-none text-base font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800" 
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Default GST %</label>
          <select 
            value={formData.tax_rate} 
            onChange={(e) => handleInputChange('tax_rate', Number(e.target.value))} 
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded outline-none text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-800 appearance-none cursor-pointer"
          >
            {TAX_RATES.map(r => (
              <option key={r} value={r} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{r}% GST</option>
            ))}
          </select>
        </div>
      </div>

      {/* Description / Remarks */}
      <div className="space-y-1.5">
        <label className="text-[14px] font-normal text-slate-900 dark:text-slate-300">Item Description</label>
        <textarea 
          rows={3} 
          value={toDisplayValue(formData.description)} 
          onChange={(e) => handleInputChange('description', e.target.value)} 
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded outline-none text-sm focus:border-slate-400 dark:focus:border-slate-600 dark:text-slate-100 resize-none" 
          placeholder="Optional remarks..." 
        />
      </div>

      {/* Form Action Buttons */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <FormActionButtons
          primaryText={initialData ? 'Update Record' : 'Create Item'}
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

export default StockForm;
