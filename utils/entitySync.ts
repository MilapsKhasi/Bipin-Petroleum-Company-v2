import { supabase } from '../lib/supabase';
import { safeSupabaseSave, normalizeBill } from './helpers';

/**
 * Checks if a transaction (sale invoice, purchase bill, payment voucher, etc.)
 * belongs to a given Party using permanent ID first, then names/aliases fallback.
 */
export const matchesParty = (transaction: any, party: any): boolean => {
  if (!party || !transaction) return false;
  const targetPartyId = String(party.id);

  // 1. Primary check: permanent entity ID
  const txPartyId = transaction.party_id || transaction.partyId || transaction.customer_id || transaction.vendor_id;
  if (txPartyId && String(txPartyId) === targetPartyId) {
    return true;
  }

  // Check inside nested items if stored there
  const nestedPartyId = transaction.items_raw?.party_id || transaction.items_raw?.partyId;
  if (nestedPartyId && String(nestedPartyId) === targetPartyId) {
    return true;
  }

  // 2. Fallback check: display name or known aliases (for older unmigrated data)
  const txName = (transaction.customer_name || transaction.vendor_name || transaction.party_name || '').trim().toLowerCase();
  if (!txName) return false;

  const currentPartyName = (party.name || '').trim().toLowerCase();
  if (txName === currentPartyName) return true;

  const aliases: string[] = Array.isArray(party.previous_names) ? party.previous_names : [];
  return aliases.some(alias => alias && alias.trim().toLowerCase() === txName);
};

/**
 * Checks if a line item belongs to a Stock Item using permanent ID first,
 * then names/aliases fallback.
 */
export const matchesStockItem = (lineItem: any, stockItem: any): boolean => {
  if (!stockItem || !lineItem) return false;
  const targetStockId = String(stockItem.id);

  // 1. Primary check: permanent entity ID
  const txStockId = lineItem.stock_item_id || lineItem.stockItemId || lineItem.item_id || lineItem.itemId;
  if (txStockId && String(txStockId) === targetStockId) {
    return true;
  }

  // 2. Fallback check: display item name or known aliases
  const itName = (lineItem.itemName || lineItem.name || '').trim().toLowerCase();
  if (!itName) return false;

  const currentStockName = (stockItem.name || '').trim().toLowerCase();
  if (itName === currentStockName) return true;

  const aliases: string[] = Array.isArray(stockItem.previous_names) ? stockItem.previous_names : [];
  return aliases.some(alias => alias && alias.trim().toLowerCase() === itName);
};

/**
 * Checks if a duty/additional charge belongs to an Additional Charge master.
 */
export const matchesCharge = (duty: any, charge: any): boolean => {
  if (!charge || !duty) return false;
  const targetChargeId = String(charge.id);

  const txChargeId = duty.charge_id || duty.id;
  if (txChargeId && String(txChargeId) === targetChargeId) {
    return true;
  }

  const dutyName = (duty.name || '').trim().toLowerCase();
  if (!dutyName) return false;

  const currentChargeName = (charge.name || '').trim().toLowerCase();
  if (dutyName === currentChargeName) return true;

  const aliases: string[] = Array.isArray(charge.previous_names) ? charge.previous_names : [];
  return aliases.some(alias => alias && alias.trim().toLowerCase() === dutyName);
};

/**
 * Renames a Party while strictly preserving its permanent ID.
 * All historical transactions are kept intact and connected via party_id.
 */
export const renamePartyInDatabase = async (
  partyId: string,
  newName: string,
  companyId: string,
  existingPartyData?: any
): Promise<any> => {
  if (!partyId || !newName || !companyId) return null;
  const normalizedNewName = newName.trim().toUpperCase();

  // 1. Fetch current party record if not provided
  let currentParty = existingPartyData;
  if (!currentParty || currentParty.id !== partyId) {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', partyId)
      .eq('company_id', companyId)
      .maybeSingle();
    currentParty = data;
  }

  if (!currentParty) {
    console.warn(`[entitySync] Party with ID ${partyId} not found for rename`);
    return null;
  }

  const oldName = (currentParty.name || '').trim().toUpperCase();
  const isNameChanged = oldName && oldName !== normalizedNewName;

  const previousNames: string[] = Array.isArray(currentParty.previous_names) ? [...currentParty.previous_names] : [];
  if (isNameChanged && oldName && !previousNames.includes(oldName)) {
    previousNames.push(oldName);
  }

  // 2. Update Party record (ID remains immutable)
  const partyPayload = {
    ...currentParty,
    name: normalizedNewName,
    previous_names: previousNames,
    company_id: companyId,
    is_deleted: false
  };

  const savedPartyRes = await safeSupabaseSave('vendors', partyPayload, partyId);
  const updatedParty = (savedPartyRes?.data && savedPartyRes.data[0]) ? savedPartyRes.data[0] : partyPayload;

  // 3. If name changed, update historical transactions to ensure permanent party_id and sync display name
  if (isNameChanged) {
    try {
      // Sales Invoices
      const { data: sales } = await supabase
        .from('sales_invoices')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_deleted', false);

      for (const sale of sales || []) {
        const matches = (sale.party_id && String(sale.party_id) === String(partyId)) ||
          (sale.customer_name && sale.customer_name.trim().toUpperCase() === oldName);

        if (matches) {
          await supabase
            .from('sales_invoices')
            .update({
              party_id: partyId,
              customer_name: normalizedNewName
            })
            .eq('id', sale.id);
        }
      }

      // Purchase Bills
      const { data: bills } = await supabase
        .from('purchase_bills')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_deleted', false);

      for (const bill of bills || []) {
        const matches = (bill.party_id && String(bill.party_id) === String(partyId)) ||
          (bill.vendor_name && bill.vendor_name.trim().toUpperCase() === oldName);

        if (matches) {
          await supabase
            .from('purchase_bills')
            .update({
              party_id: partyId,
              vendor_name: normalizedNewName
            })
            .eq('id', bill.id);
        }
      }

      // Delivery Challans
      const { data: challans } = await supabase
        .from('delivery_challans')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_deleted', false);

      for (const ch of challans || []) {
        const matches = (ch.party_id && String(ch.party_id) === String(partyId)) ||
          (ch.customer_name && ch.customer_name.trim().toUpperCase() === oldName);

        if (matches) {
          await supabase
            .from('delivery_challans')
            .update({
              party_id: partyId,
              customer_name: normalizedNewName
            })
            .eq('id', ch.id);
        }
      }
    } catch (txErr) {
      console.error('[entitySync] Error updating transactions for renamed party:', txErr);
    }
  }

  return updatedParty;
};

/**
 * Renames a Stock Item while strictly preserving its permanent ID.
 * Historical line items are kept intact and connected via stock_item_id.
 */
export const renameStockItemInDatabase = async (
  stockItemId: string,
  newName: string,
  companyId: string,
  existingStockData?: any
): Promise<any> => {
  if (!stockItemId || !newName || !companyId) return null;
  const normalizedNewName = newName.trim().toUpperCase();

  let currentStock = existingStockData;
  if (!currentStock || currentStock.id !== stockItemId) {
    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('id', stockItemId)
      .eq('company_id', companyId)
      .maybeSingle();
    currentStock = data;
  }

  if (!currentStock) {
    console.warn(`[entitySync] Stock item with ID ${stockItemId} not found for rename`);
    return null;
  }

  const oldName = (currentStock.name || '').trim().toUpperCase();
  const isNameChanged = oldName && oldName !== normalizedNewName;

  const previousNames: string[] = Array.isArray(currentStock.previous_names) ? [...currentStock.previous_names] : [];
  if (isNameChanged && oldName && !previousNames.includes(oldName)) {
    previousNames.push(oldName);
  }

  // 1. Update Stock Item record (ID remains immutable)
  const stockPayload = {
    ...currentStock,
    name: normalizedNewName,
    previous_names: previousNames,
    company_id: companyId,
    is_deleted: false
  };

  const savedRes = await safeSupabaseSave('stock_items', stockPayload, stockItemId);
  const updatedStock = (savedRes?.data && savedRes.data[0]) ? savedRes.data[0] : stockPayload;

  // 2. If name changed, update line items in historical transactions
  if (isNameChanged) {
    try {
      const [{ data: sales }, { data: bills }] = await Promise.all([
        supabase.from('sales_invoices').select('*').eq('company_id', companyId).eq('is_deleted', false),
        supabase.from('purchase_bills').select('*').eq('company_id', companyId).eq('is_deleted', false)
      ]);

      for (const sale of sales || []) {
        const rawItems = sale.items || {};
        const lineItems = Array.isArray(rawItems) ? rawItems : (rawItems.line_items || []);
        let modified = false;

        const updatedLineItems = lineItems.map((it: any) => {
          const isMatch = (it.stock_item_id && String(it.stock_item_id) === String(stockItemId)) ||
            (it.itemName && it.itemName.trim().toUpperCase() === oldName);

          if (isMatch) {
            modified = true;
            return {
              ...it,
              stock_item_id: stockItemId,
              stockItemId: stockItemId,
              itemName: normalizedNewName
            };
          }
          return it;
        });

        if (modified) {
          const updatedItemsObj = Array.isArray(rawItems) ? updatedLineItems : { ...rawItems, line_items: updatedLineItems };
          await supabase.from('sales_invoices').update({ items: updatedItemsObj }).eq('id', sale.id);
        }
      }

      for (const bill of bills || []) {
        const rawItems = bill.items || {};
        const lineItems = Array.isArray(rawItems) ? rawItems : (rawItems.line_items || []);
        let modified = false;

        const updatedLineItems = lineItems.map((it: any) => {
          const isMatch = (it.stock_item_id && String(it.stock_item_id) === String(stockItemId)) ||
            (it.itemName && it.itemName.trim().toUpperCase() === oldName);

          if (isMatch) {
            modified = true;
            return {
              ...it,
              stock_item_id: stockItemId,
              stockItemId: stockItemId,
              itemName: normalizedNewName
            };
          }
          return it;
        });

        if (modified) {
          const updatedItemsObj = Array.isArray(rawItems) ? updatedLineItems : { ...rawItems, line_items: updatedLineItems };
          await supabase.from('purchase_bills').update({ items: updatedItemsObj }).eq('id', bill.id);
        }
      }
    } catch (stockTxErr) {
      console.error('[entitySync] Error updating transactions for renamed stock item:', stockTxErr);
    }
  }

  return updatedStock;
};

/**
 * Historical Data Recovery: Idempotent Migration
 * Detects existing Parties and their historical IDs, preserves their original IDs,
 * and reconnects historical transactions using the original permanent ID.
 * NEVER deletes or duplicates data.
 */
export const reconnectHistoricalEntityReferences = async (companyId: string): Promise<{
  migratedSales: number;
  migratedBills: number;
  migratedStockLinks: number;
}> => {
  if (!companyId) return { migratedSales: 0, migratedBills: 0, migratedStockLinks: 0 };

  try {
    const [
      { data: parties },
      { data: stockItems },
      { data: charges },
      { data: sales },
      { data: bills },
      { data: challans }
    ] = await Promise.all([
      supabase.from('vendors').select('*').eq('company_id', companyId).eq('is_deleted', false),
      supabase.from('stock_items').select('*').eq('company_id', companyId).eq('is_deleted', false),
      supabase.from('duties_taxes').select('*').eq('company_id', companyId).eq('is_deleted', false),
      supabase.from('sales_invoices').select('*').eq('company_id', companyId).eq('is_deleted', false),
      supabase.from('purchase_bills').select('*').eq('company_id', companyId).eq('is_deleted', false),
      supabase.from('delivery_challans').select('*').eq('company_id', companyId).eq('is_deleted', false)
    ]);

    let migratedSales = 0;
    let migratedBills = 0;
    let migratedStockLinks = 0;

    // Helper: find party safely by ID, current name, or alias
    const resolveParty = (nameOrId?: string, existingId?: string) => {
      if (existingId) {
        const found = (parties || []).find((p: any) => String(p.id) === String(existingId));
        if (found) return found;
      }
      if (!nameOrId) return null;
      const targetName = nameOrId.trim().toUpperCase();
      // Match by current name first
      let matched = (parties || []).find((p: any) => (p.name || '').trim().toUpperCase() === targetName);
      if (matched) return matched;
      // Match by previous_names
      matched = (parties || []).find((p: any) => {
        const aliases: string[] = Array.isArray(p.previous_names) ? p.previous_names : [];
        return aliases.some(a => (a || '').trim().toUpperCase() === targetName);
      });
      return matched || null;
    };

    // Helper: find stock item safely
    const resolveStockItem = (nameOrId?: string, existingId?: string) => {
      if (existingId) {
        const found = (stockItems || []).find((s: any) => String(s.id) === String(existingId));
        if (found) return found;
      }
      if (!nameOrId) return null;
      const targetName = nameOrId.trim().toUpperCase();
      let matched = (stockItems || []).find((s: any) => (s.name || '').trim().toUpperCase() === targetName);
      if (matched) return matched;
      matched = (stockItems || []).find((s: any) => {
        const aliases: string[] = Array.isArray(s.previous_names) ? s.previous_names : [];
        return aliases.some(a => (a || '').trim().toUpperCase() === targetName);
      });
      return matched || null;
    };

    // Helper: find charge safely
    const resolveCharge = (nameOrId?: string, existingId?: string) => {
      if (existingId) {
        const found = (charges || []).find((c: any) => String(c.id) === String(existingId));
        if (found) return found;
      }
      if (!nameOrId) return null;
      const targetName = nameOrId.trim().toUpperCase();
      let matched = (charges || []).find((c: any) => (c.name || '').trim().toUpperCase() === targetName);
      if (matched) return matched;
      matched = (charges || []).find((c: any) => {
        const aliases: string[] = Array.isArray(c.previous_names) ? c.previous_names : [];
        return aliases.some(a => (a || '').trim().toUpperCase() === targetName);
      });
      return matched || null;
    };

    // 1. Reconnect Sales Invoices
    for (const sale of sales || []) {
      let needsUpdate = false;
      const updates: any = {};

      const currentPartyId = sale.party_id || sale.partyId;
      if (!currentPartyId) {
        const resolved = resolveParty(sale.customer_name);
        if (resolved) {
          updates.party_id = resolved.id;
          needsUpdate = true;
          migratedSales++;
        }
      }

      // Reconnect line items & charges in items JSON
      const rawItems = sale.items || {};
      const lineItems = Array.isArray(rawItems) ? rawItems : (rawItems.line_items || []);
      let lineItemsModified = false;

      const updatedLineItems = lineItems.map((it: any) => {
        const currentStockId = it.stock_item_id || it.stockItemId;
        if (!currentStockId) {
          const resolvedStock = resolveStockItem(it.itemName);
          if (resolvedStock) {
            lineItemsModified = true;
            migratedStockLinks++;
            return {
              ...it,
              stock_item_id: resolvedStock.id,
              stockItemId: resolvedStock.id
            };
          }
        }
        return it;
      });

      // Duties and taxes
      const duties = rawItems.duties_and_taxes || [];
      let dutiesModified = false;
      const updatedDuties = duties.map((d: any) => {
        if (!d.charge_id && !d.id?.startsWith('ro_')) {
          const resolvedC = resolveCharge(d.name, d.id);
          if (resolvedC) {
            dutiesModified = true;
            return {
              ...d,
              charge_id: resolvedC.id
            };
          }
        }
        return d;
      });

      if (lineItemsModified || dutiesModified) {
        needsUpdate = true;
        updates.items = Array.isArray(rawItems)
          ? updatedLineItems
          : { ...rawItems, line_items: updatedLineItems, duties_and_taxes: updatedDuties };
      }

      if (needsUpdate) {
        await supabase.from('sales_invoices').update(updates).eq('id', sale.id);
      }
    }

    // 2. Reconnect Purchase Bills
    for (const bill of bills || []) {
      let needsUpdate = false;
      const updates: any = {};

      const currentPartyId = bill.party_id || bill.partyId;
      if (!currentPartyId) {
        const resolved = resolveParty(bill.vendor_name);
        if (resolved) {
          updates.party_id = resolved.id;
          needsUpdate = true;
          migratedBills++;
        }
      }

      const rawItems = bill.items || {};
      const lineItems = Array.isArray(rawItems) ? rawItems : (rawItems.line_items || []);
      let lineItemsModified = false;

      const updatedLineItems = lineItems.map((it: any) => {
        const currentStockId = it.stock_item_id || it.stockItemId;
        if (!currentStockId) {
          const resolvedStock = resolveStockItem(it.itemName);
          if (resolvedStock) {
            lineItemsModified = true;
            migratedStockLinks++;
            return {
              ...it,
              stock_item_id: resolvedStock.id,
              stockItemId: resolvedStock.id
            };
          }
        }
        return it;
      });

      const duties = rawItems.duties_and_taxes || [];
      let dutiesModified = false;
      const updatedDuties = duties.map((d: any) => {
        if (!d.charge_id && !d.id?.startsWith('ro_')) {
          const resolvedC = resolveCharge(d.name, d.id);
          if (resolvedC) {
            dutiesModified = true;
            return {
              ...d,
              charge_id: resolvedC.id
            };
          }
        }
        return d;
      });

      if (lineItemsModified || dutiesModified) {
        needsUpdate = true;
        updates.items = Array.isArray(rawItems)
          ? updatedLineItems
          : { ...rawItems, line_items: updatedLineItems, duties_and_taxes: updatedDuties };
      }

      if (needsUpdate) {
        await supabase.from('purchase_bills').update(updates).eq('id', bill.id);
      }
    }

    // 3. Reconnect Delivery Challans
    for (const ch of challans || []) {
      let needsUpdate = false;
      const updates: any = {};

      if (!ch.party_id) {
        const resolved = resolveParty(ch.customer_name);
        if (resolved) {
          updates.party_id = resolved.id;
          needsUpdate = true;
        }
      }

      const rawItems = ch.items || {};
      const lineItems = Array.isArray(rawItems) ? rawItems : (rawItems.line_items || []);
      let lineItemsModified = false;

      const updatedLineItems = lineItems.map((it: any) => {
        if (!it.stock_item_id && !it.stockItemId) {
          const resolvedStock = resolveStockItem(it.itemName);
          if (resolvedStock) {
            lineItemsModified = true;
            return {
              ...it,
              stock_item_id: resolvedStock.id,
              stockItemId: resolvedStock.id
            };
          }
        }
        return it;
      });

      if (lineItemsModified) {
        needsUpdate = true;
        updates.items = Array.isArray(rawItems) ? updatedLineItems : { ...rawItems, line_items: updatedLineItems };
      }

      if (needsUpdate) {
        await supabase.from('delivery_challans').update(updates).eq('id', ch.id);
      }
    }

    return { migratedSales, migratedBills, migratedStockLinks };
  } catch (err) {
    console.error('[entitySync] Migration error:', err);
    return { migratedSales: 0, migratedBills: 0, migratedStockLinks: 0 };
  }
};
