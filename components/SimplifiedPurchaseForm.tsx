
import React, { useState, useEffect } from 'react';
import { Save, Loader2, Check } from 'lucide-react';
// Fixed: Removed non-existent getDatePlaceholder from imports
import { getActiveCompanyId, formatCurrency, parseDateFromInput, formatDate } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import FormActionButtons from './FormActionButtons';
import { toast } from '../utils/toast';

interface SimplifiedPurchaseFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

const SimplifiedPurchaseForm: React.FC<SimplifiedPurchaseFormProps> = ({ initialData, onSubmit, onCancel }) => {
  const cid = getActiveCompanyId();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({
    date: '', displayDate: '', bill_number: '', vendor_name: '',
    total_without_gst: 0, total_gst: 0, round_off: 0, grand_total: 0, status: 'Pending'
  });

  useEffect(() => {
    if (initialData) {
      setFormData({ 
        vendor_name: initialData.vendor_name || '',
        bill_number: initialData.bill_number || '',
        date: initialData.date || '',
        displayDate: formatDate(initialData.date),
        total_without_gst: initialData.total_without_gst || 0,
        total_gst: initialData.total_gst || 0,
        round_off: initialData.round_off || 0,
        grand_total: initialData.grand_total || 0,
        status: initialData.status || 'Pending'
      });
    }
  }, [initialData]);

  const updateAmounts = (taxable: number, gst: number) => {
      const rawTotal = taxable + gst;
      const rounded = Math.round(rawTotal);
      const ro = parseFloat((rounded - rawTotal).toFixed(2));
      setFormData((prev: any) => ({ ...prev, total_without_gst: taxable, total_gst: gst, round_off: ro, grand_total: rounded }));
  };

  const handleDateBlur = () => {
    const iso = parseDateFromInput(formData.displayDate);
    if (iso) setFormData({ ...formData, date: iso, displayDate: formatDate(iso) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.bill_number || !formData.vendor_name) {
      toast.warning("Fill all mandatory fields (Date, Bill No, Vendor).");
      return;
    }
    
    if (!cid) {
      toast.error("No active workspace selected.");
      return;
    }

    setLoading(true);
    try {
      // Logic refined: Data is stored against company_id. 
      // RLS policies on the 'bills' table should grant access based on companies_users membership.
      const payload = {
        company_id: cid,
        vendor_name: formData.vendor_name,
        bill_number: formData.bill_number,
        date: formData.date,
        items: [],
        total_without_gst: formData.total_without_gst,
        total_gst: formData.total_gst,
        grand_total: formData.grand_total,
        status: formData.status,
        is_deleted: false
      };

      let error;
      if (initialData?.id) {
        const { error: err } = await supabase.from('purchase_bills').update(payload).eq('id', initialData.id);
        error = err;
      } else {
        const { error: err } = await supabase.from('purchase_bills').insert([payload]);
        error = err;
      }

      if (error) {
        console.error("Supabase Error:", error);
        throw new Error(error.message);
      }
      
      toast.success(initialData?.id ? "Purchase bill updated." : "Purchase bill recorded.");
      window.dispatchEvent(new Event('appSettingsChanged'));
      onSubmit(payload);
    } catch (err: any) {
      toast.error("Error saving: " + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Date</label>
          {/* Fixed: Replaced getDatePlaceholder() with hardcoded placeholder string */}
          <input required value={formData.displayDate || ''} onChange={(e) => setFormData({...formData, displayDate: e.target.value})} onBlur={handleDateBlur} placeholder="DD/MM/YYYY" className="w-full px-3 py-2 border border-slate-200 rounded text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Bill Number</label>
          <input required value={formData.bill_number || ''} onChange={(e) => setFormData({...formData, bill_number: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono outline-none focus:border-slate-400" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase">Vendor</label>
        <input required value={formData.vendor_name || ''} onChange={(e) => setFormData({...formData, vendor_name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded text-sm outline-none focus:border-slate-400" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Taxable Amount (Without GST)</label>
          <input type="number" step="0.01" value={formData.total_without_gst || 0} onChange={(e) => updateAmounts(Number(e.target.value), formData.total_gst)} className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-medium outline-none focus:border-slate-400" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">GST Amount</label>
          <input type="number" step="0.01" value={formData.total_gst || 0} onChange={(e) => updateAmounts(formData.total_without_gst, Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-medium outline-none focus:border-slate-400" />
        </div>
      </div>



      <div className="bg-slate-50 p-6 border border-slate-200 rounded space-y-3 boxy-shadow">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
              <span>Without GST</span>
              <span className="text-slate-700 font-mono">{formatCurrency(formData.total_without_gst)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
              <span>GST Total</span>
              <span className="text-slate-700 font-mono">{formatCurrency(formData.total_gst)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase italic">
              <span>Round Off</span>
              <span className="text-slate-500 font-mono">{formData.round_off >= 0 ? '+' : ''}{(formData.round_off || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-slate-300">
              <span className="text-xs font-bold text-slate-900 uppercase">Grand Total</span>
              <span className="text-2xl font-semibold text-slate-900">{formatCurrency(formData.grand_total)}</span>
          </div>
      </div>

      <FormActionButtons
        primaryText={initialData ? 'Update Purchase' : 'Save Purchase'}
        primaryType="submit"
        primaryDisabled={loading}
        primaryLoading={loading}

        secondaryLeftText="Save & New"
        secondaryLeftType="submit"
        secondaryLeftOnClick={() => {
          // Trigger submit with new flag or standard submit
        }}
        secondaryLeftDisabled={loading}

        secondaryRightText="Save & Close"
        secondaryRightType="submit"
        secondaryRightDisabled={loading}

        discardText="Discard"
        discardOnClick={onCancel}
        discardDisabled={loading}
      />
    </form>
  );
};

export default SimplifiedPurchaseForm;
