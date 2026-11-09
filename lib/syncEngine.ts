import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getBPCPendingQueue,
  getAllBPCQueue,
  markBPCQueueItemSynced,
  clearSyncedBPCQueue,
  getBPCRecord,
  BPC_Sync_Queue_Item,
  BPCSyncStoreName,
  BPC_SYNC_STORES
} from './idb';

export interface SyncStatusInfo {
  isOnline: boolean;
  state: 'OFFLINE' | 'IDLE' | 'SYNCING' | 'ERROR';
  pendingCount: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

// In-memory status listeners
const listeners = new Set<(status: SyncStatusInfo) => void>();

let currentStatus: SyncStatusInfo = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  state: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'IDLE',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
};

function updateStatus(patch: Partial<SyncStatusInfo>) {
  currentStatus = { ...currentStatus, ...patch };
  listeners.forEach((cb) => {
    try {
      cb(currentStatus);
    } catch (e) {
      console.error('[SyncEngine] Listener error:', e);
    }
  });
}

export function subscribeSyncStatus(cb: (status: SyncStatusInfo) => void): () => void {
  listeners.add(cb);
  cb(currentStatus);
  return () => {
    listeners.delete(cb);
  };
}

export function getSyncStatus(): SyncStatusInfo {
  return currentStatus;
}

// Create real Supabase client if URL and KEY are configured
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  let url = '';
  let key = '';

  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    url = (import.meta as any).env.VITE_SUPABASE_URL || '';
    key = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
  }

  if (typeof localStorage !== 'undefined') {
    url = url || localStorage.getItem('supabase_url') || localStorage.getItem('VITE_SUPABASE_URL') || '';
    key = key || localStorage.getItem('supabase_anon_key') || localStorage.getItem('VITE_SUPABASE_ANON_KEY') || '';
  }

  if (url && key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false },
      });
      return supabaseClient;
    } catch (err) {
      console.warn('[SyncEngine] Failed to create Supabase client:', err);
    }
  }

  return null;
}

// Map BPC stores to Supabase tables
function mapBPCToSupabaseTable(store: BPCSyncStoreName, record?: any): string {
  switch (store) {
    case 'BPC_Companies':
      return 'bp_companies';
    case 'BPC_Workspaces':
      return 'bp_companies';
    case 'BPC_Sales_Invoices':
      return 'bp_sales_invoices';
    case 'BPC_Purchase_Bills':
      return 'bp_purchase_bills';
    case 'BPC_Stock_Items':
      return 'bp_stock_items';
    case 'BPC_Parties':
      if (record && (record.is_customer || record.party_type === 'customer')) {
        return 'bp_customers';
      }
      return 'bp_vendors';
    case 'BPC_Duties_And_Taxes':
      return 'bp_additional_charges';
    case 'BPC_Cashbooks':
      return 'bp_cashbooks';
    case 'BPC_Recycle_Bin':
      return 'bp_recycle_bin';
    default:
      return '';
  }
}

let isSyncing = false;

/**
 * Processes pending items in BPC_Sync_Queue.
 * If offline: items remain PENDING.
 * If online and Supabase is configured: transmits changes and marks items SYNCED.
 */
export async function processBPCSyncQueue(): Promise<{
  syncedCount: number;
  pendingCount: number;
  error?: string | null;
}> {
  if (isSyncing) {
    return { syncedCount: 0, pendingCount: currentStatus.pendingCount };
  }

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    const pending = await getBPCPendingQueue();
    updateStatus({ isOnline: false, state: 'OFFLINE', pendingCount: pending.length });
    return { syncedCount: 0, pendingCount: pending.length };
  }

  isSyncing = true;
  updateStatus({ isOnline: true, state: 'SYNCING' });

  try {
    const pendingItems = await getBPCPendingQueue();
    updateStatus({ pendingCount: pendingItems.length });

    if (pendingItems.length === 0) {
      updateStatus({ state: 'IDLE' });
      isSyncing = false;
      return { syncedCount: 0, pendingCount: 0 };
    }

    const client = getSupabaseClient();
    let syncedCount = 0;

    for (const item of pendingItems) {
      const storeName = item.Store;
      const recordId = item['Record ID'];
      const action = item.Action;

      // If Supabase client is available, attempt real network sync
      if (client) {
        try {
          // Special handling for BPC_Recycle_Bin entries representing deleted records
          if (storeName === 'BPC_Recycle_Bin') {
            const rbRecord = await getBPCRecord('BPC_Recycle_Bin', recordId);

            if (action === 'CREATE' || action === 'UPDATE') {
              if (rbRecord) {
                const originalStore = rbRecord.originalStore as BPCSyncStoreName;
                const originalRecordId = rbRecord.originalRecordId || rbRecord.id;
                const origSbTable = mapBPCToSupabaseTable(originalStore, rbRecord.originalData || rbRecord);

                // 1. Mark/soft-delete the original Supabase record using actual schema (is_deleted: true)
                if (origSbTable && originalRecordId) {
                  const { error: origErr } = await client
                    .from(origSbTable)
                    .update({ is_deleted: true })
                    .eq('id', originalRecordId);

                  if (origErr) {
                    console.warn(`[SyncEngine] Error soft-deleting original ${origSbTable}[${originalRecordId}]:`, origErr);
                    throw origErr;
                  }
                  console.log(`[SyncEngine] Marked ${origSbTable}[${originalRecordId}] as is_deleted=true in Supabase`);
                }

                // 2. Also sync to bp_recycle_bin if table exists, or ignore if table does not exist
                try {
                  await client.from('bp_recycle_bin').upsert(rbRecord);
                } catch {
                  // Not all schemas have bp_recycle_bin table; ignore gracefully
                }
              }

              if (item.ID) {
                await markBPCQueueItemSynced(item.ID);
              }
              syncedCount++;
              continue;
            } else if (action === 'DELETE') {
              // Recycle bin item permanently deleted or restored
              try {
                await client.from('bp_recycle_bin').delete().eq('id', recordId);
              } catch {
                // Ignore if table does not exist
              }

              if (item.ID) {
                await markBPCQueueItemSynced(item.ID);
              }
              syncedCount++;
              continue;
            }
          }

          const localRecord = await getBPCRecord(storeName, recordId);
          const sbTable = mapBPCToSupabaseTable(storeName, localRecord);

          if (!sbTable) {
            // No target table, skip or mark synced
            if (item.ID) await markBPCQueueItemSynced(item.ID);
            syncedCount++;
            continue;
          }

          if (action === 'CREATE' || action === 'UPDATE') {
            if (localRecord) {
              const { error } = await client.from(sbTable).upsert(localRecord);
              if (error) {
                console.warn(`[SyncEngine] Supabase upsert error on ${sbTable}:`, error);
                throw error;
              }
            }
          } else if (action === 'DELETE') {
            // Soft delete or hard delete in Supabase
            const { error } = await client.from(sbTable).update({ is_deleted: true }).eq('id', recordId);
            if (error) {
              console.warn(`[SyncEngine] Supabase delete error on ${sbTable}:`, error);
              throw error;
            }
          }

          if (item.ID) {
            await markBPCQueueItemSynced(item.ID);
          }
          syncedCount++;
        } catch (networkOrApiError: any) {
          console.warn('[SyncEngine] Network or Supabase sync paused. Queue preserved as PENDING:', networkOrApiError?.message || networkOrApiError);
          // If network failed, stop processing this run so queue preserves order
          updateStatus({
            state: 'ERROR',
            lastError: networkOrApiError?.message || 'Network sync error'
          });
          break;
        }
      } else {
        // Supabase is not configured yet with URL/Key
        // The queue entries remain safely PENDING in IndexedDB
        console.log(`[SyncEngine] Supabase not configured; ${pendingItems.length} queue item(s) remain PENDING.`);
        break;
      }
    }

    const remainingPending = await getBPCPendingQueue();
    updateStatus({
      state: 'IDLE',
      pendingCount: remainingPending.length,
      lastSyncedAt: syncedCount > 0 ? new Date() : currentStatus.lastSyncedAt
    });

    isSyncing = false;
    return { syncedCount, pendingCount: remainingPending.length };
  } catch (err: any) {
    console.error('[SyncEngine] Unexpected error during sync run:', err);
    updateStatus({ state: 'ERROR', lastError: err?.message || 'Sync error' });
    isSyncing = false;
    return { syncedCount: 0, pendingCount: currentStatus.pendingCount, error: err?.message };
  }
}

// Background sync triggers
let syncTimer: any = null;

export function startSyncEngine() {
  if (typeof window === 'undefined') return;

  // Listen to network changes
  window.addEventListener('online', () => {
    console.log('[SyncEngine] Network online detected. Triggering queue processing...');
    updateStatus({ isOnline: true });
    processBPCSyncQueue().catch(() => {});
  });

  window.addEventListener('offline', () => {
    console.log('[SyncEngine] Network offline detected. Application running in pure offline mode.');
    updateStatus({ isOnline: false, state: 'OFFLINE' });
  });

  // Global trigger function for when records are created/updated/deleted
  (window as any).triggerBPCSync = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => {
        processBPCSyncQueue().catch(() => {});
      }, 500);
    }
  };

  // Periodic poll every 30 seconds if online
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine && !isSyncing) {
      processBPCSyncQueue().catch(() => {});
    }
  }, 30000);

  // Initial trigger
  setTimeout(() => {
    processBPCSyncQueue().catch(() => {});
  }, 1000);
}

// Global console inspection exposure
if (typeof window !== 'undefined') {
  (window as any).bpcSyncEngine = {
    processQueue: processBPCSyncQueue,
    getStatus: getSyncStatus,
    getPendingQueue: getBPCPendingQueue,
    getAllQueue: getAllBPCQueue,
    clearSynced: clearSyncedBPCQueue
  };

  startSyncEngine();
}

// Backward compatibility exports
export const syncAllIDBToSupabase = processBPCSyncQueue;
export const processOfflineSyncQueue = processBPCSyncQueue;
export const enqueueOfflineOp = async () => {};
export const clearSyncedQueue = clearSyncedBPCQueue;
export const getPendingSyncQueue = getBPCPendingQueue;
