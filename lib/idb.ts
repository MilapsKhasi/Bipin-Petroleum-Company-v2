// ============================================================
// 1. MAJOR DATABASE
// ============================================================
export const DB_NAME = 'Bipin_Petroleum_Company_DB';

// ============================================================
// 2. DATABASE VERSION
// ============================================================
export const DB_VERSION = 1;

// ============================================================
// 3. STORE DEFINITIONS
// ============================================================
export const BPC_BUSINESS_STORES = [
  'BPC_Companies',
  'BPC_Workspaces',
  'BPC_Sales_Invoices',
  'BPC_Purchase_Bills',
  'BPC_Stock_Items',
  'BPC_Parties',
  'BPC_Duties_And_Taxes',
  'BPC_Cashbooks',
  'BPC_Recycle_Bin',
  'BPC_Settings_Preferences'
] as const;

export const BPC_SYNC_STORES = [
  'BPC_Companies',
  'BPC_Workspaces',
  'BPC_Sales_Invoices',
  'BPC_Purchase_Bills',
  'BPC_Stock_Items',
  'BPC_Parties',
  'BPC_Duties_And_Taxes',
  'BPC_Cashbooks',
  'BPC_Recycle_Bin'
] as const;

export const BPC_QUEUE_STORE = 'BPC_Sync_Queue' as const;

export type BPCBusinessStoreName = (typeof BPC_BUSINESS_STORES)[number];
export type BPCSyncStoreName = (typeof BPC_SYNC_STORES)[number];
export type BPCAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type BPCStatus = 'PENDING' | 'SYNCED';

export interface BPC_Sync_Queue_Item {
  ID?: number;
  Store: BPCSyncStoreName;
  Action: BPCAction;
  'Record ID': string | number;
  Status: BPCStatus;
}

// In-memory cache for ultra-fast queries and sync fallback
export const bpcMemoryCache: Record<string, any[]> = {};
export const idbMemoryCache = bpcMemoryCache; // Backward compatibility alias

// Legacy stores list for backward compatibility
export const IDB_STORES = [
  ...BPC_BUSINESS_STORES,
  BPC_QUEUE_STORE,
  'companies',
  'sales_invoices',
  'purchase_bills',
  'customers',
  'vendors',
  'stock_items',
  'stock_groups',
  'cashbooks',
  'cashbook',
  'additional_charges',
  'duties_taxes',
  'delivery_challans',
  'payments_in',
  'payments_out',
  'payment_vouchers',
  'user_activities',
  'licenses',
  'profiles',
  'users',
  'meta'
] as const;

export type IDBStoreName = (typeof IDB_STORES)[number];

// Helper to normalize table names to canonical BPC stores
export function mapTableToBPCStore(table: string): BPCBusinessStoreName {
  const clean = table.replace(/^public\./, '').trim();
  if (clean === 'BPC_Companies' || clean === 'companies' || clean === 'bp_companies') return 'BPC_Companies';
  if (clean === 'BPC_Workspaces' || clean === 'workspaces' || clean === 'bp_workspaces') return 'BPC_Workspaces';
  if (clean === 'BPC_Sales_Invoices' || clean === 'sales_invoices' || clean === 'sales' || clean === 'bp_sales_invoices') return 'BPC_Sales_Invoices';
  if (clean === 'BPC_Purchase_Bills' || clean === 'purchase_bills' || clean === 'bills' || clean === 'bp_purchase_bills') return 'BPC_Purchase_Bills';
  if (clean === 'BPC_Stock_Items' || clean === 'stock_items' || clean === 'stock' || clean === 'bp_stock_items') return 'BPC_Stock_Items';
  if (clean === 'BPC_Parties' || clean === 'parties' || clean === 'vendors' || clean === 'customers' || clean === 'bp_vendors' || clean === 'bp_customers') return 'BPC_Parties';
  if (clean === 'BPC_Duties_And_Taxes' || clean === 'duties_taxes' || clean === 'additional_charges' || clean === 'bp_additional_charges') return 'BPC_Duties_And_Taxes';
  if (clean === 'BPC_Cashbooks' || clean === 'cashbooks' || clean === 'cashbook' || clean === 'bp_cashbooks') return 'BPC_Cashbooks';
  if (clean === 'BPC_Recycle_Bin' || clean === 'recycle_bin' || clean === 'recycle') return 'BPC_Recycle_Bin';
  return 'BPC_Settings_Preferences';
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'bpc-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// ============================================================
// 4. DATABASE INITIALIZATION
// ============================================================
let dbPromise: Promise<IDBDatabase> | null = null;
let isInitialized = false;

export function openBPCDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Create 10 Business Stores
      BPC_BUSINESS_STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });

      // 2. Create BPC_Sync_Queue
      if (!db.objectStoreNames.contains(BPC_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(BPC_QUEUE_STORE, {
          keyPath: 'ID',
          autoIncrement: true
        });
        queueStore.createIndex('Status', 'Status', { unique: false });
        queueStore.createIndex('Store', 'Store', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[BPC_DB] Failed to open database:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

// Alias for openBPCDB
export const openDB = openBPCDB;

// Migrate data from localStorage or legacy PurchaseMasterIDB safely into BPC stores
async function migrateLegacyDataIfPresent(db: IDBDatabase): Promise<void> {
  const legacyMappings: Array<{ legacyKey: string; targetStore: BPCBusinessStoreName }> = [
    { legacyKey: 'companies', targetStore: 'BPC_Companies' },
    { legacyKey: 'sales_invoices', targetStore: 'BPC_Sales_Invoices' },
    { legacyKey: 'purchase_bills', targetStore: 'BPC_Purchase_Bills' },
    { legacyKey: 'stock_items', targetStore: 'BPC_Stock_Items' },
    { legacyKey: 'vendors', targetStore: 'BPC_Parties' },
    { legacyKey: 'customers', targetStore: 'BPC_Parties' },
    { legacyKey: 'duties_taxes', targetStore: 'BPC_Duties_And_Taxes' },
    { legacyKey: 'additional_charges', targetStore: 'BPC_Duties_And_Taxes' },
    { legacyKey: 'cashbooks', targetStore: 'BPC_Cashbooks' },
    { legacyKey: 'cashbook', targetStore: 'BPC_Cashbooks' },
    { legacyKey: 'licenses', targetStore: 'BPC_Settings_Preferences' },
    { legacyKey: 'profiles', targetStore: 'BPC_Settings_Preferences' },
    { legacyKey: 'users', targetStore: 'BPC_Settings_Preferences' }
  ];

  if (typeof localStorage === 'undefined') return;

  for (const { legacyKey, targetStore } of legacyMappings) {
    const raw = localStorage.getItem(`local_db_${legacyKey}`);
    if (raw) {
      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          const tx = db.transaction(targetStore, 'readwrite');
          const store = tx.objectStore(targetStore);
          for (const item of items) {
            if (item && typeof item === 'object') {
              const id = item.id || generateId();
              store.put({ ...item, id });
            }
          }
          await new Promise<void>((res) => {
            tx.oncomplete = () => res();
            tx.onerror = () => res();
          });
        }
      } catch (e) {
        // Skip parse error
      }
    }
  }
}

export async function initBPCDatabase(): Promise<Record<string, any[]>> {
  if (isInitialized) return bpcMemoryCache;

  try {
    const db = await openBPCDB();
    await migrateLegacyDataIfPresent(db);

    // Populate in-memory cache for all stores
    for (const store of BPC_BUSINESS_STORES) {
      bpcMemoryCache[store] = await getAllBPCRecords(store);
      // Populate aliases for seamless backward compatibility
      const alias = store.replace('BPC_', '').toLowerCase();
      bpcMemoryCache[alias] = bpcMemoryCache[store];
    }

    // Also populate common legacy aliases
    bpcMemoryCache['vendors'] = bpcMemoryCache['BPC_Parties'] || [];
    bpcMemoryCache['customers'] = bpcMemoryCache['BPC_Parties'] || [];
    bpcMemoryCache['duties_taxes'] = bpcMemoryCache['BPC_Duties_And_Taxes'] || [];
    bpcMemoryCache['additional_charges'] = bpcMemoryCache['BPC_Duties_And_Taxes'] || [];
    bpcMemoryCache['cashbook'] = bpcMemoryCache['BPC_Cashbooks'] || [];
    bpcMemoryCache['sales'] = bpcMemoryCache['BPC_Sales_Invoices'] || [];
    bpcMemoryCache['bills'] = bpcMemoryCache['BPC_Purchase_Bills'] || [];

    isInitialized = true;
    console.log('[BPC_DB] Initialized Bipin_Petroleum_Company_DB successfully.');
  } catch (err) {
    console.warn('[BPC_DB] Initialization warning, setting up memory fallbacks:', err);
    BPC_BUSINESS_STORES.forEach((store) => {
      if (!bpcMemoryCache[store]) bpcMemoryCache[store] = [];
    });
  }

  return bpcMemoryCache;
}

// Backward compatibility alias for initIndexedDB
export const initIndexedDB = initBPCDatabase;

// Auto-initialize when window exists
if (typeof window !== 'undefined') {
  initBPCDatabase().catch((e) => console.warn('[BPC_DB] Auto-init error:', e));
}

// ============================================================
// 5. BPC_Sync_Queue
// ============================================================
/**
 * Records a change into BPC_Sync_Queue for one of the 9 sync-enabled stores.
 * Structure: ID (auto) | Store | Action | Record ID | Status ('PENDING')
 */
export async function enqueueBPCOperation(
  store: BPCSyncStoreName,
  action: BPCAction,
  recordId: string | number
): Promise<void> {
  // Only the 9 sync stores participate in sync queue
  if (!BPC_SYNC_STORES.includes(store)) {
    return;
  }

  try {
    const db = await openBPCDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BPC_QUEUE_STORE, 'readwrite');
      const queueStore = tx.objectStore(BPC_QUEUE_STORE);

      const entry: BPC_Sync_Queue_Item = {
        Store: store,
        Action: action,
        'Record ID': recordId,
        Status: 'PENDING'
      };

      queueStore.add(entry);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log(`[BPC_Sync_Queue] Enqueued: ${action} on ${store} [${recordId}] (PENDING)`);

    // Notify sync worker if online
    if (typeof window !== 'undefined' && (window as any).triggerBPCSync) {
      (window as any).triggerBPCSync();
    }
  } catch (err) {
    console.error('[BPC_Sync_Queue] Failed to enqueue operation:', err);
  }
}

export async function getBPCPendingQueue(): Promise<BPC_Sync_Queue_Item[]> {
  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BPC_QUEUE_STORE, 'readonly');
      const queueStore = tx.objectStore(BPC_QUEUE_STORE);
      const request = queueStore.getAll();

      request.onsuccess = () => {
        const all = (request.result || []) as BPC_Sync_Queue_Item[];
        const pending = all.filter((item) => item.Status === 'PENDING');
        resolve(pending);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[BPC_Sync_Queue] Error reading pending queue:', err);
    return [];
  }
}

export async function getAllBPCQueue(): Promise<BPC_Sync_Queue_Item[]> {
  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BPC_QUEUE_STORE, 'readonly');
      const queueStore = tx.objectStore(BPC_QUEUE_STORE);
      const request = queueStore.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[BPC_Sync_Queue] Error reading all queue:', err);
    return [];
  }
}

export async function markBPCQueueItemSynced(id: number): Promise<void> {
  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BPC_QUEUE_STORE, 'readwrite');
      const queueStore = tx.objectStore(BPC_QUEUE_STORE);
      const getReq = queueStore.get(id);

      getReq.onsuccess = () => {
        if (getReq.result) {
          const item = getReq.result;
          item.Status = 'SYNCED';
          queueStore.put(item);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[BPC_Sync_Queue] Error marking item synced:', err);
  }
}

export async function clearSyncedBPCQueue(): Promise<void> {
  try {
    const db = await openBPCDB();
    const all = await getAllBPCQueue();
    const syncedIds = all.filter((item) => item.Status === 'SYNCED').map((item) => item.ID).filter(Boolean) as number[];

    if (!syncedIds.length) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(BPC_QUEUE_STORE, 'readwrite');
      const queueStore = tx.objectStore(BPC_QUEUE_STORE);
      syncedIds.forEach((id) => queueStore.delete(id));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[BPC_Sync_Queue] Error clearing synced items:', err);
  }
}

// Generic record readers
export async function getBPCRecord(store: BPCBusinessStoreName, id: string | number): Promise<any | null> {
  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      const request = objectStore.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[BPC_DB] Error getting record ${id} from ${store}:`, err);
    const cached = bpcMemoryCache[store] || [];
    return cached.find((item) => String(item.id) === String(id)) || null;
  }
}

export async function getAllBPCRecords(store: BPCBusinessStoreName): Promise<any[]> {
  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objectStore = tx.objectStore(store);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[BPC_DB] Error getting all records from ${store}:`, err);
    return bpcMemoryCache[store] || [];
  }
}

// Internal base helpers for CRUD
async function baseCreateRecord(store: BPCBusinessStoreName, data: any): Promise<any> {
  const recordId = data.id || generateId();
  const record = { ...data, id: recordId };

  // 1. Save in IndexedDB
  const db = await openBPCDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    objectStore.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Update memory cache
  const list = bpcMemoryCache[store] || [];
  const idx = list.findIndex((item) => String(item.id) === String(recordId));
  if (idx !== -1) list[idx] = record;
  else list.push(record);
  bpcMemoryCache[store] = list;

  // Mirror to localStorage for backup
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`local_db_${store}`, JSON.stringify(list));
    }
  } catch {}

  // 2. Enqueue in BPC_Sync_Queue if store is sync-enabled
  if (BPC_SYNC_STORES.includes(store as BPCSyncStoreName)) {
    await enqueueBPCOperation(store as BPCSyncStoreName, 'CREATE', recordId);
  }

  return record;
}

async function baseUpdateRecord(store: BPCBusinessStoreName, id: string | number, data: any): Promise<any> {
  const existing = (await getBPCRecord(store, id)) || {};
  const updated = { ...existing, ...data, id };

  // 1. Update in IndexedDB
  const db = await openBPCDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    objectStore.put(updated);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Update memory cache
  const list = bpcMemoryCache[store] || [];
  const idx = list.findIndex((item) => String(item.id) === String(id));
  if (idx !== -1) list[idx] = updated;
  else list.push(updated);
  bpcMemoryCache[store] = list;

  // Mirror to localStorage for backup
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`local_db_${store}`, JSON.stringify(list));
    }
  } catch {}

  // 2. Enqueue in BPC_Sync_Queue if store is sync-enabled
  if (BPC_SYNC_STORES.includes(store as BPCSyncStoreName)) {
    await enqueueBPCOperation(store as BPCSyncStoreName, 'UPDATE', id);
  }

  return updated;
}

async function baseDeleteRecord(store: BPCBusinessStoreName, id: string | number): Promise<void> {
  // 1. Delete from IndexedDB
  const db = await openBPCDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    objectStore.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Update memory cache
  if (bpcMemoryCache[store]) {
    bpcMemoryCache[store] = bpcMemoryCache[store].filter((item) => String(item.id) !== String(id));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`local_db_${store}`, JSON.stringify(bpcMemoryCache[store]));
      }
    } catch {}
  }

  // 2. Enqueue in BPC_Sync_Queue if store is sync-enabled
  if (BPC_SYNC_STORES.includes(store as BPCSyncStoreName)) {
    await enqueueBPCOperation(store as BPCSyncStoreName, 'DELETE', id);
  }
}

// Remove record from original store without enqueuing a separate DELETE
async function baseRemoveRecordWithoutQueue(store: BPCBusinessStoreName, id: string | number): Promise<void> {
  const db = await openBPCDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    objectStore.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  if (bpcMemoryCache[store]) {
    bpcMemoryCache[store] = bpcMemoryCache[store].filter((item) => String(item.id) !== String(id));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`local_db_${store}`, JSON.stringify(bpcMemoryCache[store]));
      }
    } catch {}
  }
}

// Move a record from any sync-enabled store into BPC_Recycle_Bin
export async function moveToRecycleBin(
  store: BPCSyncStoreName,
  recordId: string | number
): Promise<any> {
  if (store === 'BPC_Recycle_Bin') {
    return baseDeleteRecord('BPC_Recycle_Bin', recordId);
  }

  // 1. Read complete original record BEFORE removing it
  const originalRecord = await getBPCRecord(store, recordId);
  if (!originalRecord) {
    console.warn(`[RecycleBin] Original record ${recordId} not found in ${store}`);
    return null;
  }

  // 2. Create complete Recycle Bin record
  const recycleId = `rb_${store}_${recordId}`;
  const recycleBinRecord = {
    ...originalRecord,
    id: recycleId,
    originalStore: store,
    originalRecordId: recordId,
    originalData: JSON.parse(JSON.stringify(originalRecord)),
    deletedAt: new Date().toISOString(),
    is_deleted: true
  };

  try {
    // 3. Save into BPC_Recycle_Bin FIRST
    // This saves to BPC_Recycle_Bin and creates queue entry:
    // BPC_Recycle_Bin | CREATE | <recycleId> | PENDING
    const savedRecycleRecord = await createRecycleBinEntry(recycleBinRecord);

    // 4. Verify that the record is in BPC_Recycle_Bin before removing from original store
    const verifySaved = await getBPCRecord('BPC_Recycle_Bin', recycleId);
    if (!verifySaved) {
      throw new Error(`[RecycleBin] Failed to verify Recycle Bin write for ${recordId}. Original record was NOT deleted.`);
    }

    // 5. Remove original record from original store without enqueuing a separate DELETE
    await baseRemoveRecordWithoutQueue(store, recordId);

    console.log(`[RecycleBin] Successfully moved ${store}[${recordId}] to BPC_Recycle_Bin[${recycleId}]. Queue entry created: BPC_Recycle_Bin | CREATE | ${recycleId} | PENDING`);

    return savedRecycleRecord;
  } catch (err) {
    console.error(`[RecycleBin] Error moving record ${recordId} from ${store} to Recycle Bin. Original record kept untouched:`, err);
    throw err;
  }
}

// Restore a record from BPC_Recycle_Bin back to its original store
export async function restoreFromRecycleBin(
  recycleIdOrOriginalId: string | number
): Promise<any> {
  const allRecycle = await getAllBPCRecords('BPC_Recycle_Bin');
  const recycleItem = allRecycle.find(
    (item) =>
      String(item.id) === String(recycleIdOrOriginalId) ||
      String(item.originalRecordId) === String(recycleIdOrOriginalId)
  );

  if (!recycleItem) {
    console.warn(`[RecycleBin] Item ${recycleIdOrOriginalId} not found in BPC_Recycle_Bin`);
    return null;
  }

  const originalStore = (recycleItem.originalStore || 'BPC_Companies') as BPCSyncStoreName;
  const originalRecordId = recycleItem.originalRecordId || recycleItem.id;

  // Reconstruct original record
  const originalRecord = recycleItem.originalData ? { ...recycleItem.originalData } : { ...recycleItem };
  originalRecord.id = originalRecordId;
  originalRecord.is_deleted = false;
  delete (originalRecord as any).originalStore;
  delete (originalRecord as any).originalRecordId;
  delete (originalRecord as any).originalData;
  delete (originalRecord as any).deletedAt;

  // 1. Recreate in original store (this enqueues CREATE / UPDATE)
  const restored = await baseCreateRecord(originalStore, originalRecord);

  // 2. Remove from BPC_Recycle_Bin (this enqueues BPC_Recycle_Bin | DELETE)
  await baseDeleteRecord('BPC_Recycle_Bin', recycleItem.id);

  console.log(`[RecycleBin] Restored ${originalStore}[${originalRecordId}] from BPC_Recycle_Bin`);
  return restored;
}

// ============================================================
// 6. CREATE FUNCTIONS
// ============================================================
export async function createCompany(data: any): Promise<any> {
  return baseCreateRecord('BPC_Companies', data);
}

export async function createWorkspace(data: any): Promise<any> {
  return baseCreateRecord('BPC_Workspaces', data);
}

export async function createSalesInvoice(data: any): Promise<any> {
  return baseCreateRecord('BPC_Sales_Invoices', data);
}

export async function createPurchaseBill(data: any): Promise<any> {
  return baseCreateRecord('BPC_Purchase_Bills', data);
}

export async function createStockItem(data: any): Promise<any> {
  return baseCreateRecord('BPC_Stock_Items', data);
}

export async function createParty(data: any): Promise<any> {
  return baseCreateRecord('BPC_Parties', data);
}

export async function createDutyAndTax(data: any): Promise<any> {
  return baseCreateRecord('BPC_Duties_And_Taxes', data);
}

export async function createCashbook(data: any): Promise<any> {
  return baseCreateRecord('BPC_Cashbooks', data);
}

export async function createRecycleBinEntry(data: any): Promise<any> {
  return baseCreateRecord('BPC_Recycle_Bin', data);
}

// ============================================================
// 7. UPDATE FUNCTIONS
// ============================================================
export async function updateCompany(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Companies', id, data);
}

export async function updateWorkspace(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Workspaces', id, data);
}

export async function updateSalesInvoice(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Sales_Invoices', id, data);
}

export async function updatePurchaseBill(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Purchase_Bills', id, data);
}

export async function updateStockItem(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Stock_Items', id, data);
}

export async function updateParty(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Parties', id, data);
}

export async function updateDutyAndTax(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Duties_And_Taxes', id, data);
}

export async function updateCashbook(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Cashbooks', id, data);
}

export async function updateRecycleBinEntry(id: string | number, data: any): Promise<any> {
  return baseUpdateRecord('BPC_Recycle_Bin', id, data);
}

// ============================================================
// 8. DELETE FUNCTIONS (Treated as MOVING to BPC_Recycle_Bin)
// ============================================================
export async function deleteCompany(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Companies', id);
}

export async function deleteWorkspace(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Workspaces', id);
}

export async function deleteSalesInvoice(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Sales_Invoices', id);
}

export async function deletePurchaseBill(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Purchase_Bills', id);
}

export async function deleteStockItem(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Stock_Items', id);
}

export async function deleteParty(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Parties', id);
}

export async function deleteDutyAndTax(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Duties_And_Taxes', id);
}

export async function deleteCashbook(id: string | number): Promise<void> {
  return moveToRecycleBin('BPC_Cashbooks', id);
}

export async function deleteRecycleBinEntry(id: string | number): Promise<void> {
  return baseDeleteRecord('BPC_Recycle_Bin', id);
}

// RESTORE FUNCTIONS
export async function restoreCompany(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreWorkspace(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreSalesInvoice(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restorePurchaseBill(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreStockItem(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreParty(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreDutyAndTax(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

export async function restoreCashbook(id: string | number): Promise<any> {
  return restoreFromRecycleBin(id);
}

// ============================================================
// Backward Compatibility Functions for existing modules
// ============================================================
export async function getAllFromIDB(storeName: string): Promise<any[]> {
  const canonical = mapTableToBPCStore(storeName);
  return getAllBPCRecords(canonical);
}

export async function saveAllToIDB(storeName: string, items: any[]): Promise<void> {
  const canonical = mapTableToBPCStore(storeName);
  bpcMemoryCache[canonical] = items;
  bpcMemoryCache[storeName] = items;

  try {
    const db = await openBPCDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(canonical, 'readwrite');
      const store = tx.objectStore(canonical);
      store.clear();
      items.forEach((item) => {
        if (item && typeof item === 'object') {
          const itemToSave = item.id ? item : { ...item, id: generateId() };
          store.put(itemToSave);
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[BPC_DB] Error saving all to ${canonical}:`, err);
  }
}

export async function upsertToIDB(storeName: string, itemOrItems: any | any[]): Promise<void> {
  const canonical = mapTableToBPCStore(storeName);
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];

  for (const item of items) {
    if (!item) continue;
    const id = item.id;
    const existing = id ? await getBPCRecord(canonical, id) : null;
    if (existing) {
      await baseUpdateRecord(canonical, id, item);
    } else {
      await baseCreateRecord(canonical, item);
    }
  }
}

export async function deleteFromIDB(storeName: string, id: string): Promise<void> {
  const canonical = mapTableToBPCStore(storeName);
  if (canonical === 'BPC_Recycle_Bin') {
    return baseDeleteRecord('BPC_Recycle_Bin', id);
  }
  if (canonical === 'BPC_Settings_Preferences') {
    return baseDeleteRecord('BPC_Settings_Preferences', id);
  }
  return moveToRecycleBin(canonical as BPCSyncStoreName, id);
}

export async function setMetaIDB(key: string, value: any): Promise<void> {
  return baseUpdateRecord('BPC_Settings_Preferences', key, { id: key, key, value });
}

export async function getMetaIDB(key: string): Promise<any> {
  const rec = await getBPCRecord('BPC_Settings_Preferences', key);
  return rec ? rec.value : null;
}

// Global exposure for console inspection
if (typeof window !== 'undefined') {
  (window as any).bpcDB = {
    DB_NAME,
    DB_VERSION,
    BPC_BUSINESS_STORES,
    BPC_SYNC_STORES,
    BPC_QUEUE_STORE,
    getQueue: getAllBPCQueue,
    getPendingQueue: getBPCPendingQueue,
    clearSyncedQueue: clearSyncedBPCQueue,
    createCompany,
    createWorkspace,
    createSalesInvoice,
    createPurchaseBill,
    createStockItem,
    createParty,
    createDutyAndTax,
    createCashbook,
    createRecycleBinEntry,
    updateCompany,
    updateWorkspace,
    updateSalesInvoice,
    updatePurchaseBill,
    updateStockItem,
    updateParty,
    updateDutyAndTax,
    updateCashbook,
    updateRecycleBinEntry,
    deleteCompany,
    deleteWorkspace,
    deleteSalesInvoice,
    deletePurchaseBill,
    deleteStockItem,
    deleteParty,
    deleteDutyAndTax,
    deleteCashbook,
    deleteRecycleBinEntry,
    moveToRecycleBin,
    restoreFromRecycleBin,
    restoreCompany,
    restoreWorkspace,
    restoreSalesInvoice,
    restorePurchaseBill,
    restoreStockItem,
    restoreParty,
    restoreDutyAndTax,
    restoreCashbook,
    getAllRecords: getAllBPCRecords,
    getRecord: getBPCRecord
  };
}
