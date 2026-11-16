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

export type DetectedMediaKind =
  | 'image'
  | 'video_direct'
  | 'video_embed'
  | 'audio'
  | 'pdf'
  | 'link';

export interface DetectedMediaMeta {
  kind: DetectedMediaKind;
  mimeType: string;
  embedUrl?: string;
  suggestedFileName: string;
}

export function detectExternalMediaKind(
  rawUrl: string,
  explicitMime?: string,
  explicitFileName?: string
): DetectedMediaMeta {
  const url = (rawUrl || '').trim();
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  const mimeLower = (explicitMime || '').toLowerCase();

  let fallbackName = explicitFileName || '';
  if (!fallbackName && url.startsWith('http')) {
    try {
      const parsed = new URL(url);
      const lastSeg = parsed.pathname.split('/').filter(Boolean).pop() || '';
      if (lastSeg) {
        fallbackName = decodeURIComponent(lastSeg);
      }
    } catch {
      // ignore
    }
  }

  // YouTube embed detection
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      kind: 'video_embed',
      mimeType: 'text/html',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
      suggestedFileName: fallbackName || `youtube-${ytMatch[1]}.mp4`
    };
  }

  // Vimeo embed detection
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d{5,15})/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      kind: 'video_embed',
      mimeType: 'text/html',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      suggestedFileName: fallbackName || `vimeo-${vimeoMatch[1]}.mp4`
    };
  }

  // Google Drive preview detection
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdriveMatch && gdriveMatch[1]) {
    return {
      kind: 'video_embed',
      mimeType: 'text/html',
      embedUrl: `https://drive.google.com/file/d/${gdriveMatch[1]}/preview`,
      suggestedFileName: fallbackName || `gdrive-${gdriveMatch[1]}.pdf`
    };
  }

  if (
    mimeLower.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(lower) ||
    url.startsWith('data:image/')
  ) {
    return {
      kind: 'image',
      mimeType: explicitMime || 'image/png',
      suggestedFileName: fallbackName || `medical-image-${Date.now()}.png`
    };
  }

  if (
    mimeLower.startsWith('video/') ||
    /\.(mp4|webm|ogg|mov|m4v|mkv)$/i.test(lower) ||
    url.startsWith('data:video/')
  ) {
    return {
      kind: 'video_direct',
      mimeType: explicitMime || 'video/mp4',
      suggestedFileName: fallbackName || `medical-video-${Date.now()}.mp4`
    };
  }

  if (
    mimeLower.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(lower) ||
    url.startsWith('data:audio/')
  ) {
    return {
      kind: 'audio',
      mimeType: explicitMime || 'audio/mpeg',
      suggestedFileName: fallbackName || `medical-audio-${Date.now()}.mp3`
    };
  }

  if (
    mimeLower === 'application/pdf' ||
    /\.pdf$/i.test(lower) ||
    url.startsWith('data:application/pdf')
  ) {
    return {
      kind: 'pdf',
      mimeType: 'application/pdf',
      suggestedFileName: fallbackName || `medical-document-${Date.now()}.pdf`
    };
  }

  return {
    kind: 'link',
    mimeType: explicitMime || 'application/octet-stream',
    suggestedFileName: fallbackName || `resource-${Date.now()}`
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

/**
 * Downloads a remote media file from its external URL and stores it locally for offline playback/viewing.
 * Stores in IndexedDB (`umedt_learning_media_db_v1`) when available and always caches in `memoryMediaStore`.
 */
export async function downloadRemoteMediaToOfflineCache(params: {
  url?: string;
  remoteUrl?: string;
  id?: string;
  topicId?: string;
  sectionId?: string;
  blockId?: string;
  fileName?: string;
  preferredFileName?: string;
  mimeType?: string;
  preferredMimeType?: string;
  customFetch?: typeof fetch;
}): Promise<{
  success: boolean;
  idbKey: string;
  mediaIdbKey: string;
  dataUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  verifiedInIdb: boolean;
  messageAr: string;
  errorAr?: string;
}> {
  const cleanUrl = (params.url || params.remoteUrl || '').trim();
  const explicitMime = params.mimeType || params.preferredMimeType;
  const explicitFileName = params.fileName || params.preferredFileName;
  const detected = detectExternalMediaKind(
    cleanUrl,
    explicitMime,
    explicitFileName
  );
  const idbKey =
    params.id ||
    `offline-media-${params.blockId || params.topicId || 'item'}-${Date.now()}`;

  if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:'))) {
    return {
      success: false,
      idbKey,
      mediaIdbKey: idbKey,
      dataUrl: '',
      fileName: detected.suggestedFileName,
      mimeType: detected.mimeType,
      sizeBytes: 0,
      verifiedInIdb: false,
      messageAr: 'الرابط غير صالح للتنزيل المحلي.',
      errorAr: 'الرابط غير صالح للتنزيل المحلي.'
    };
  }

  try {
    let dataUrl = '';
    let resolvedMime = explicitMime || detected.mimeType;
    let sizeBytes = 0;

    if (cleanUrl.startsWith('data:')) {
      dataUrl = cleanUrl;
      const commaIdx = cleanUrl.indexOf(',');
      const b64Part = commaIdx !== -1 ? cleanUrl.slice(commaIdx + 1) : '';
      sizeBytes = Math.max(1, Math.floor((b64Part.length * 3) / 4));
    } else {
      // 1. Check Android Native bridge first if no customFetch was provided
      const nativeBridge =
        !params.customFetch && typeof window !== 'undefined'
          ? (
              window as unknown as {
                UMEDNativeDownloader?: {
                  fetchRemoteUrlBase64?: (u: string) => string;
                };
              }
            ).UMEDNativeDownloader
          : undefined;

      if (nativeBridge && typeof nativeBridge.fetchRemoteUrlBase64 === 'function') {
        try {
          const rawRes = nativeBridge.fetchRemoteUrlBase64(cleanUrl);
          const parsed = JSON.parse(rawRes) as {
            ok?: boolean;
            contentType?: string;
            base64?: string;
          };
          if (parsed.ok && parsed.base64) {
            if (parsed.contentType && parsed.contentType !== 'application/octet-stream') {
              resolvedMime = parsed.contentType.split(';')[0].trim();
            }
            sizeBytes = Math.max(1, Math.floor((parsed.base64.length * 3) / 4));
            dataUrl = `data:${resolvedMime};base64,${parsed.base64}`;
          }
        } catch {
          // Fallback to fetch
        }
      }

      if (!dataUrl) {
        const fetchFn = params.customFetch || fetch;
        let response: Response | null = null;
        try {
          response = await fetchFn(cleanUrl);
        } catch {
          if (!params.customFetch) {
            response = await fetchFn(
              `/api/remote-fetch?url=${encodeURIComponent(cleanUrl)}`
            );
          }
        }

        if (!response || !response.ok) {
          return {
            success: false,
            idbKey,
            mediaIdbKey: idbKey,
            dataUrl: '',
            fileName: detected.suggestedFileName,
            mimeType: resolvedMime,
            sizeBytes: 0,
            verifiedInIdb: false,
            messageAr: `تعذر تنزيل الوسائط من الرابط (${response?.status || 'Network Error'}).`,
            errorAr: `HTTP ${response?.status || 0}`
          };
        }

        const ctHeader = response.headers.get('content-type');
        if (ctHeader && !ctHeader.includes('text/html') && ctHeader !== 'application/octet-stream') {
          resolvedMime = ctHeader.split(';')[0].trim();
        }
        const ab = await response.arrayBuffer();
        const bytes = new Uint8Array(ab);
        sizeBytes = bytes.byteLength;
        if (sizeBytes === 0) {
          return {
            success: false,
            idbKey,
            mediaIdbKey: idbKey,
            dataUrl: '',
            fileName: detected.suggestedFileName,
            mimeType: resolvedMime,
            sizeBytes: 0,
            verifiedInIdb: false,
            messageAr: 'الملف الذي تم جلبه من الرابط فارغ (0 بايت).',
            errorAr: 'EMPTY_REMOTE_PAYLOAD'
          };
        }
        const b64 = uint8ToBase64(bytes);
        dataUrl = `data:${resolvedMime};base64,${b64}`;
      }
    }

    const mediaTypeMap: LocalMediaRecord['mediaType'] =
      detected.kind === 'image'
        ? 'image'
        : detected.kind === 'video_direct' || detected.kind === 'video_embed'
          ? 'video_file'
          : detected.kind === 'audio'
            ? 'audio_file'
            : detected.kind === 'pdf'
              ? 'pdf_document'
              : 'attachment';

    const record: LocalMediaRecord = {
      id: idbKey,
      topicId: params.topicId,
      sectionId: params.sectionId,
      blockId: params.blockId,
      mediaType: mediaTypeMap,
      fileName: explicitFileName || detected.suggestedFileName,
      mimeType: resolvedMime,
      sizeBytes,
      sourceExternalUrl: cleanUrl,
      dataUrl,
      createdAt: new Date().toISOString()
    };

    // Always store in memoryMediaStore so offline playback works immediately even in environments without IndexedDB
    memoryMediaStore.set(idbKey, record);

    let verifiedInIdb = false;
    if (hasIndexedDb() && sizeBytes <= MAX_SAFE_MEDIA_BYTES) {
      const saved = await saveLocalMediaRecord(record);
      verifiedInIdb = Boolean(saved.success && saved.verifiedInIdb);
    }

    return {
      success: true,
      idbKey,
      mediaIdbKey: idbKey,
      dataUrl,
      fileName: record.fileName,
      mimeType: resolvedMime,
      sizeBytes,
      verifiedInIdb,
      messageAr: `تم تنزيل وحفظ "${record.fileName}" (${formatBytesLabel(
        sizeBytes
      )}) للعمل دون إنترنت.`
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      idbKey,
      mediaIdbKey: idbKey,
      dataUrl: '',
      fileName: detected.suggestedFileName,
      mimeType: detected.mimeType,
      sizeBytes: 0,
      verifiedInIdb: false,
      messageAr: `تعذر تنزيل الملف للعمل أوفلاين: ${msg}`,
      errorAr: msg
    };
  }
}

/**
 * Opens an external URL or local media file in an external application on Android (`ACTION_VIEW`) or browser tab.
 */
export function openMediaInExternalApp(
  urlOrDataUrl: string,
  fileName?: string,
  mimeType?: string
): { opened: boolean; messageAr: string } {
  const target = (urlOrDataUrl || '').trim();
  if (!target) {
    return { opened: false, messageAr: 'لا يوجد رابط أو ملف لفتحه خارجياً.' };
  }

  if (typeof window !== 'undefined') {
    const bridge = (
      window as unknown as {
        UMEDNativeDownloader?: {
          openExternalUrl?: (u: string, m: string) => string;
          openDownloadedFile?: (f: string, m: string) => string;
          saveBase64FileToDownloads?: (f: string, b: string, m: string) => string;
        };
      }
    ).UMEDNativeDownloader;

    if (bridge) {
      try {
        if (target.startsWith('data:') && bridge.saveBase64FileToDownloads && bridge.openDownloadedFile) {
          const safeName = fileName || `umedt-media-${Date.now()}`;
          const safeMime = mimeType || 'application/octet-stream';
          bridge.saveBase64FileToDownloads(safeName, target, safeMime);
          const openRes = JSON.parse(bridge.openDownloadedFile(safeName, safeMime)) as {
            ok?: boolean;
          };
          if (openRes.ok) {
            return {
              opened: true,
              messageAr: `تم فتح "${safeName}" في تطبيق خارجي.`
            };
          }
        } else if (bridge.openExternalUrl) {
          const raw = bridge.openExternalUrl(target, mimeType || '');
          const parsed = JSON.parse(raw) as { ok?: boolean };
          if (parsed.ok) {
            return {
              opened: true,
              messageAr: 'تم فتح الوسائط في التطبيق الخارجي.'
            };
          }
        }
      } catch {
        // Fallback to standard link
      }
    }

    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = target;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (target.startsWith('data:') && fileName) {
        a.download = fileName;
      }
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 2000);
      return {
        opened: true,
        messageAr: 'تم فتح الملف / الرابط في عارض خارجي.'
      };
    }
  }

  return {
    opened: true,
    messageAr: 'تم تجهيز فتح الوسائط خارجياً.'
  };
}

export async function getAllLocalMediaRecordsMap(): Promise<
  Map<string, LocalMediaRecord>
> {
  const result = new Map<string, LocalMediaRecord>();
  for (const [k, v] of memoryMediaStore.entries()) {
    result.set(k, v);
  }
  if (hasIndexedDb()) {
    let db: IDBDatabase | null = null;
    try {
      db = await openMediaDb();
      const all = await new Promise<LocalMediaRecord[]>((resolve) => {
        const tx = db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as LocalMediaRecord[]) || []);
        req.onerror = () => resolve([]);
      });
      db.close();
      for (const item of all) {
        result.set(item.id, item);
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
  return result;
}
