import { LocalMediaRecord } from '../types/lexicon';

const DB_NAME = 'umedt_learning_media_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'media_records';

// Max safe single media payload (15 MB)
export const MAX_SAFE_MEDIA_BYTES = 15 * 1024 * 1024;

const memoryMediaStore = new Map<string, LocalMediaRecord>();

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by_topic', 'topicId', { unique: false });
          store.createIndex('by_block', 'blockId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error || new Error('FAILED_TO_OPEN_MEDIA_IDB'));
      req.onblocked = () =>
        reject(new Error('MEDIA_IDB_BLOCKED'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function saveLocalMediaRecord(record: LocalMediaRecord): Promise<{
  success: boolean;
  errorAr?: string;
  record?: LocalMediaRecord;
  verifiedInIdb?: boolean;
}> {
  if (!record || !record.id || !record.dataUrl) {
    return {
      success: false,
      errorAr: 'بيانات الملف الصوتي غير مكتملة أو فارغة ولا يمكن حفظها.'
    };
  }

  if (record.sizeBytes <= 0) {
    return {
      success: false,
      errorAr: 'الملف الصوتي فارغ (0 بايت) — يرجى إعادة التسجيل أو اختيار ملف صالح.'
    };
  }

  if (record.sizeBytes > MAX_SAFE_MEDIA_BYTES) {
    return {
      success: false,
      errorAr: `حجم الملف (${(record.sizeBytes / (1024 * 1024)).toFixed(
        1
      )} MB) يتجاوز الحد الآمن للتخزين المحلي (15 MB).`
    };
  }

  if (!hasIndexedDb()) {
    return {
      success: false,
      errorAr:
        'قاعدة البيانات المحلية (IndexedDB) غير متاحة أو معطلة في هذا المتصفح — تعذر حفظ الملف الصوتي بشكل دائم.'
    };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openMediaDb();

    // 1. Write record into IndexedDB
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(record);
      putReq.onerror = () =>
        reject(putReq.error || new Error('IDB_PUT_FAILED'));
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('IDB_TX_ERROR'));
      tx.onabort = () =>
        reject(tx.error || new Error('IDB_TX_ABORTED_QUOTA'));
    });

    // 2. Read-back verification to guarantee actual persistence in IndexedDB
    const verifiedRecord = await new Promise<LocalMediaRecord | null>(
      (resolve, reject) => {
        const verifyTx = db!.transaction(STORE_NAME, 'readonly');
        const store = verifyTx.objectStore(STORE_NAME);
        const getReq = store.get(record.id);
        getReq.onsuccess = () =>
          resolve((getReq.result as LocalMediaRecord) || null);
        getReq.onerror = () =>
          reject(getReq.error || new Error('IDB_VERIFY_READ_FAILED'));
      }
    );

    db.close();
    db = null;

    if (
      !verifiedRecord ||
      verifiedRecord.id !== record.id ||
      !verifiedRecord.dataUrl ||
      verifiedRecord.dataUrl.length !== record.dataUrl.length
    ) {
      return {
        success: false,
        errorAr:
          'فشل التحقق من ثبات الملف الصوتي في الذاكرة المحلية (IndexedDB) بعد الحفظ.'
      };
    }

    memoryMediaStore.set(record.id, verifiedRecord);
    return {
      success: true,
      record: verifiedRecord,
      verifiedInIdb: true
    };
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const isQuota = /quota|storage|full/i.test(errMsg);
    return {
      success: false,
      errorAr: isQuota
        ? 'مساحة التخزين المحلية (IndexedDB) ممتلئة — تعذر حفظ التسجيل الصوتي.'
        : `تعذر حفظ الملف الصوتي في قاعدة البيانات المحلية (IndexedDB): ${errMsg}`
    };
  }
}

export async function getLocalMediaRecord(
  id: string
): Promise<LocalMediaRecord | null> {
  if (!id) return null;

  if (hasIndexedDb()) {
    let db: IDBDatabase | null = null;
    try {
      db = await openMediaDb();
      const found = await new Promise<LocalMediaRecord | null>((resolve) => {
        const tx = db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          resolve((req.result as LocalMediaRecord) || null);
        };
        req.onerror = () => resolve(null);
      });
      db.close();
      if (found) {
        memoryMediaStore.set(id, found);
        return found;
      }
    } catch {
      if (db) {
        try {
          db.close();
        } catch {
          // ignore
        }
      }
    }
  }

  return memoryMediaStore.get(id) || null;
}

export async function getMediaRecordsByTopicId(
  topicId: string
): Promise<LocalMediaRecord[]> {
  if (!topicId) return [];
  const results = new Map<string, LocalMediaRecord>();
  for (const item of memoryMediaStore.values()) {
    if (item.topicId === topicId) {
      results.set(item.id, item);
    }
  }
  if (!hasIndexedDb()) {
    return Array.from(results.values());
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openMediaDb();
    const idbItems = await new Promise<LocalMediaRecord[]>((resolve) => {
      const tx = db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as LocalMediaRecord[]) || [];
        resolve(all.filter((r) => r.topicId === topicId));
      };
      req.onerror = () => resolve([]);
    });
    db.close();
    for (const item of idbItems) {
      results.set(item.id, item);
    }
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
  return Array.from(results.values());
}

export async function deleteLocalMediaRecord(id: string): Promise<boolean> {
  if (!id) return false;
  memoryMediaStore.delete(id);
  if (!hasIndexedDb()) return false;

  let db: IDBDatabase | null = null;
  try {
    db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IDB_DELETE_ERROR'));
    });

    // Verify deletion
    const remaining = await new Promise<LocalMediaRecord | null>((resolve) => {
      const verifyTx = db!.transaction(STORE_NAME, 'readonly');
      const store = verifyTx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () =>
        resolve((getReq.result as LocalMediaRecord) || null);
      getReq.onerror = () => resolve(null);
    });
    db.close();
    return remaining === null;
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    return false;
  }
}

export async function deleteLocalMediaRecordsByKeys(
  keys: string[]
): Promise<number> {
  const validKeys = Array.from(
    new Set((keys || []).map((k) => (k || '').trim()).filter(Boolean))
  );
  if (validKeys.length === 0) return 0;

  let deletedCount = 0;
  for (const key of validKeys) {
    const ok = await deleteLocalMediaRecord(key);
    if (ok) deletedCount += 1;
  }
  return deletedCount;
}

export async function deleteLocalMediaRecordsByTopicId(
  topicId: string
): Promise<number> {
  if (!topicId) return 0;
  const records = await getMediaRecordsByTopicId(topicId);
  const keys = records.map((r) => r.id);
  for (const [k, v] of memoryMediaStore.entries()) {
    if (v.topicId === topicId && !keys.includes(k)) {
      keys.push(k);
    }
  }
  return deleteLocalMediaRecordsByKeys(keys);
}

export function formatBytesLabel(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
