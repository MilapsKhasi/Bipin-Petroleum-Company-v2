import { supabase } from '../lib/supabase';
import { safeSupabaseSave } from './helpers';

export const migrateCustomersToParties = async (companyId: string) => {
  if (!companyId) return;

  try {
    // 1. Fetch all active customers for this company
    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_deleted', false);

    if (custError) {
      console.error('Error fetching customers for migration:', custError);
      return;
    }

    if (!customers || customers.length === 0) {
      return;
    }

    // 2. Fetch all active vendors/parties for this company
    const { data: vendors, error: vendError } = await supabase
      .from('vendors')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_deleted', false);

    if (vendError) {
      console.error('Error fetching vendors for migration:', vendError);
      return;
    }

    const vendorsList = vendors || [];

    for (const customer of customers) {
      // Find matching vendor by GSTIN (if present) or exact name match (case-insensitive, trimmed)
      const custNameLower = customer.name.toLowerCase().trim();
      const custGstinLower = customer.gstin ? customer.gstin.toLowerCase().trim() : '';

      const match = vendorsList.find((v: any) => {
        const vendNameLower = v.name.toLowerCase().trim();
        const vendGstinLower = v.gstin ? v.gstin.toLowerCase().trim() : '';
        
        const nameMatches = vendNameLower === custNameLower;
        const gstinMatches = custGstinLower && vendGstinLower && (custGstinLower === vendGstinLower);
        
        return nameMatches || gstinMatches;
      });

      if (match) {
        // Merge customer details into vendor (if vendor details are empty)
        const updatedPayload = {
          gstin: match.gstin || customer.gstin || null,
          email: match.email || customer.email || null,
          phone: match.phone || customer.phone || null,
          pan: match.pan || customer.pan || null,
          state: match.state || customer.state || null,
          account_number: match.account_number || customer.account_number || null,
          account_name: match.account_name || customer.account_name || null,
          ifsc_code: match.ifsc_code || customer.ifsc_code || null,
          address: match.address || customer.address || null,
          // If customer has opening balance, combine or preserve it
          balance: Number(match.balance || 0) + Number(customer.balance || 0),
          is_customer: true, // Merged party acts as both
          party_type: match.party_type || 'customer', // Keep existing or default to customer
        };

        // Update the existing record in vendors table
        const { error: updateError } = await supabase
          .from('vendors')
          .update(updatedPayload)
          .eq('id', match.id);

        if (updateError) {
          console.error(`Error updating merged party ${match.name}:`, updateError);
        } else {
          // Soft delete from customers table to mark as migrated
          await supabase
            .from('customers')
            .update({ is_deleted: true })
            .eq('id', customer.id);
        }
      } else {
        // Create new record in vendors table
        const newPartyPayload = {
          company_id: companyId,
          name: customer.name.trim(),
          email: customer.email || null,
          phone: customer.phone || null,
          gstin: customer.gstin || null,
          pan: customer.pan || null,
          state: customer.state || null,
          account_number: customer.account_number || null,
          account_name: customer.account_name || null,
          ifsc_code: customer.ifsc_code || null,
          address: customer.address || null,
          balance: Number(customer.balance) || 0,
          party_type: 'customer', // Default Group will be Sundry Debtor
          is_customer: true,
          is_deleted: false,
        };

        const { error: insertError } = await supabase
          .from('vendors')
          .insert([newPartyPayload]);

        if (insertError) {
          console.error(`Error inserting migrated customer ${customer.name}:`, insertError);
        } else {
          // Soft delete from customers table to mark as migrated
          await supabase
            .from('customers')
            .update({ is_deleted: true })
            .eq('id', customer.id);
        }
      }
    }

    console.log('Parties migration completed successfully for company:', companyId);
  } catch (err) {
    console.error('Unexpected error during parties migration:', err);
  }
};
