import { LocalMediaRecord } from '../types/learningPlatform';

const MEDIA_DB_NAME = 'umedt_learning_media_db_v1';
const MEDIA_DB_VERSION = 1;
const MEDIA_STORE_NAME = 'media_blobs';
const MAX_SINGLE_MEDIA_BYTES = 15 * 1024 * 1024; // 15 MB safe limit per mobile file

const memoryMediaFallback = new Map<string, LocalMediaRecord>();

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = window.indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        const store = db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
        store.createIndex('topicId', 'topicId', { unique: false });
        store.createIndex('mediaType', 'mediaType', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open media DB'));
  });
}

export async function saveLocalMediaRecord(
  record: LocalMediaRecord
): Promise<{ success: boolean; errorAr?: string; record?: LocalMediaRecord }> {
  if (record.sizeBytes > MAX_SINGLE_MEDIA_BYTES) {
    return {
      success: false,
      errorAr: `حجم الملف (${(record.sizeBytes / (1024 * 1024)).toFixed(1)} MB) يتجاوز الحد الآمن للهاتف (15 MB). يرجى استخدام ملف أصغر أو رابط خارجي.`
    };
  }

  memoryMediaFallback.set(record.id, record);

  if (!hasIndexedDb()) {
    return { success: true, record };
  }

  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to save media record'));
      };
    });
    return { success: true, record };
  } catch {
    return { success: true, record };
  }
}

export async function getLocalMediaRecord(id: string): Promise<LocalMediaRecord | null> {
  if (memoryMediaFallback.has(id)) {
    return memoryMediaFallback.get(id) || null;
  }
  if (!hasIndexedDb()) {
    return null;
  }
  try {
    const db = await openMediaDb();
    return await new Promise<LocalMediaRecord | null>((resolve) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = (req.result as LocalMediaRecord | undefined) || null;
        if (res) {
          memoryMediaFallback.set(res.id, res);
        }
        db.close();
        resolve(res);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function listLocalMediaRecords(): Promise<LocalMediaRecord[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryMediaFallback.values());
  }
  try {
    const db = await openMediaDb();
    return await new Promise<LocalMediaRecord[]>((resolve) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? (req.result as LocalMediaRecord[]) : [];
        for (const item of list) {
          memoryMediaFallback.set(item.id, item);
        }
        db.close();
        resolve(list);
      };
      req.onerror = () => {
        db.close();
        resolve(Array.from(memoryMediaFallback.values()));
      };
    });
  } catch {
    return Array.from(memoryMediaFallback.values());
  }
}

export async function deleteLocalMediaRecord(id: string): Promise<void> {
  memoryMediaFallback.delete(id);
  if (!hasIndexedDb()) return;
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

export async function getMediaStorageUsage(): Promise<{
  count: number;
  totalBytes: number;
  formattedSize: string;
}> {
  const all = await listLocalMediaRecords();
  const totalBytes = all.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
  const formattedSize =
    totalBytes >= 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.round(totalBytes / 1024)} KB`;
  return {
    count: all.length,
    totalBytes,
    formattedSize
  };
}

export function formatBytesLabel(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
