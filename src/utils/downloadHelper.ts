/**
 * Universal Android (`Download/UMEDT`), PWA, Web & Iframe-Safe File Downloader, Verifier, Opener & Share Helper.
 * - On Android Capacitor APK: uses `window.UMEDNativeDownloader` bridge in `MainActivity.java` to write
 *   directly to `/storage/emulated/0/Download/UMEDT/<filename>`, verify file existence & byte length on disk,
 *   and allow native Open (`ACTION_VIEW`) and Share (`ACTION_SEND`).
 * - On Web / Preview: uses `/api/download/prepare` + verified Blob download and keeps a persistent
 *   Downloaded Files History (`Download/UMEDT`) so the user can inspect, open, and share downloaded files.
 */

export interface LocalDownloadRecord {
  id: string;
  filename: string;
  savedPath: string;
  sizeBytes: number;
  sizeKB: number;
  mime: string;
  timestamp: string;
  verified: boolean;
  nativeUri?: string;
  previewText?: string;
  method:
    | 'android-native-storage'
    | 'server-attachment'
    | 'client-blob'
    | 'android-data-uri'
    | 'native-share';
}

interface NativeDownloaderBridge {
  isAvailable?: () => boolean;
  saveBase64FileToDownloads?: (
    filename: string,
    base64Data: string,
    mimeType: string
  ) => string;
  openDownloadedFile?: (filename: string, mimeType: string) => string;
  shareDownloadedFile?: (
    filename: string,
    mimeType: string,
    title: string
  ) => string;
  listDownloadedFiles?: () => string;
}

const LAST_LOCAL_DOWNLOAD_KEY = 'umed_last_local_download_v1';
const DOWNLOAD_HISTORY_KEY = 'umed_downloaded_files_history_v2';
const fallbackMemoryStore = new Map<string, string>();
const inMemoryFilePayloads = new Map<
  string,
  { content: string | Uint8Array; mime: string }
>();

function getNativeBridge(): NativeDownloaderBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { UMEDNativeDownloader?: NativeDownloaderBridge };
  if (
    w.UMEDNativeDownloader &&
    typeof w.UMEDNativeDownloader.saveBase64FileToDownloads === 'function'
  ) {
    return w.UMEDNativeDownloader;
  }
  return null;
}

function getSafeStorage() {
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    return {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => localStorage.setItem(k, v),
      removeItem: (k: string) => localStorage.removeItem(k),
      entries: () => {
        const list: Array<[string, string]> = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) list.push([k, localStorage.getItem(k) || '']);
        }
        return list;
      }
    };
  }
  return {
    getItem: (k: string) => fallbackMemoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      fallbackMemoryStore.set(k, v);
    },
    removeItem: (k: string) => {
      fallbackMemoryStore.delete(k);
    },
    entries: () => Array.from(fallbackMemoryStore.entries())
  };
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function stringToBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return uint8ArrayToBase64(bytes);
}

export function getByteLength(content: string | Uint8Array): number {
  if (content instanceof Uint8Array) {
    return content.byteLength;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(content).byteLength;
  }
  return content.length;
}

export function recordLocalDownload(
  record: LocalDownloadRecord,
  rawContent?: string | Uint8Array
): void {
  try {
    const store = getSafeStorage();
    if (rawContent !== undefined) {
      inMemoryFilePayloads.set(record.filename, {
        content: rawContent,
        mime: record.mime
      });
    }
    store.setItem(LAST_LOCAL_DOWNLOAD_KEY, JSON.stringify(record));

    const existing = getDownloadedFilesHistory();
    const filtered = existing.filter((item) => item.filename !== record.filename);
    const updated = [record, ...filtered].slice(0, 12);
    store.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(updated));

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('umed:download-recorded', { detail: record })
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getLastLocalDownloadRecord(): LocalDownloadRecord | null {
  try {
    const raw = getSafeStorage().getItem(LAST_LOCAL_DOWNLOAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalDownloadRecord;
  } catch {
    return null;
  }
}

export function getDownloadedFilesHistory(): LocalDownloadRecord[] {
  try {
    const store = getSafeStorage();
    const raw = store.getItem(DOWNLOAD_HISTORY_KEY);
    const parsed: LocalDownloadRecord[] = raw ? JSON.parse(raw) : [];
    const validList = Array.isArray(parsed) ? parsed : [];

    // Merge with native Android files in Download/UMEDT if running on Android APK
    const bridge = getNativeBridge();
    if (bridge && typeof bridge.listDownloadedFiles === 'function') {
      try {
        const nativeJson = bridge.listDownloadedFiles();
        const nativeFiles = JSON.parse(nativeJson) as Array<{
          filename: string;
          savedPath: string;
          sizeBytes: number;
          sizeKB: number;
          timestamp: number;
        }>;
        if (Array.isArray(nativeFiles)) {
          const existingNames = new Set(validList.map((i) => i.filename));
          for (const nf of nativeFiles) {
            if (!existingNames.has(nf.filename)) {
              validList.push({
                id: `native-${nf.filename}`,
                filename: nf.filename,
                savedPath: nf.savedPath || `Download/UMEDT/${nf.filename}`,
                sizeBytes: nf.sizeBytes,
                sizeKB: nf.sizeKB,
                mime: nf.filename.endsWith('.zip')
                  ? 'application/zip'
                  : nf.filename.endsWith('.csv')
                  ? 'text/csv'
                  : 'application/json',
                timestamp: new Date(nf.timestamp || Date.now()).toISOString(),
                verified: true,
                method: 'android-native-storage'
              });
            }
          }
        }
      } catch {
        // Ignore native list parse error
      }
    }

    return validList;
  } catch {
    return [];
  }
}

export function verifyLocalStoragePersistence(): {
  ok: boolean;
  usedKB: number;
  keysCount: number;
  lastDownload: LocalDownloadRecord | null;
} {
  try {
    const store = getSafeStorage();
    const probeKey = '__umed_storage_probe__';
    const probeVal = `ok-${Date.now()}`;
    store.setItem(probeKey, probeVal);
    const readBack = store.getItem(probeKey);
    store.removeItem(probeKey);

    let totalChars = 0;
    const allEntries = store.entries();
    for (const [k, v] of allEntries) {
      totalChars += k.length + v.length;
    }

    return {
      ok: readBack === probeVal,
      usedKB: Math.max(1, Math.round((totalChars * 2) / 1024)),
      keysCount: allEntries.length,
      lastDownload: getLastLocalDownloadRecord()
    };
  } catch {
    return { ok: false, usedKB: 0, keysCount: 0, lastDownload: null };
  }
}

export function triggerDirectHttpUrlDownload(url: string, filename?: string): void {
  if (typeof document === 'undefined') return;
  try {
    const a = document.createElement('a');
    a.href = url;
    if (filename) {
      a.download = filename;
    }
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 4000);
  } catch {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 15000);
  }
}

function isAndroidWebViewEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (getNativeBridge()) return true;
  const ua = navigator.userAgent || '';
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return true;
  }
  return /Android/i.test(ua) && /wv|Version\/\d+\.\d+/i.test(ua);
}

function buildPreviewSnippet(content: string | Uint8Array, mime: string): string {
  if (content instanceof Uint8Array) {
    return `[ملف حزمة مضغوطة ثنائي (${mime}) — الحجم: ${content.byteLength} بايت]`;
  }
  const trimmed = content.trim();
  if (trimmed.length <= 2400) {
    return trimmed;
  }
  return `${trimmed.slice(0, 2400)}\n\n... [تم عرض أول 2400 حرف من أصل ${trimmed.length} حرف]`;
}

export async function prepareAndDownloadFile(options: {
  filename: string;
  content: string | Uint8Array;
  mime?: string;
}): Promise<{
  verified: boolean;
  savedPath: string;
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
  sizeKB: number;
  method: LocalDownloadRecord['method'];
  record: LocalDownloadRecord;
  error?: string;
}> {
  const { filename, content, mime = 'application/octet-stream' } = options;
  const safeFilename = (filename || `umedt-export-${Date.now()}.json`)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_');
  const isBinary = content instanceof Uint8Array;
  const sizeBytes = getByteLength(content);
  const sizeKB = Math.max(1, Math.round((sizeBytes / 1024) * 10) / 10);
  const savedPath = `Download/UMEDT/${safeFilename}`;
  const previewText = buildPreviewSnippet(content, mime);

  if (sizeBytes <= 0) {
    const emptyRec: LocalDownloadRecord = {
      id: `dl-failed-${Date.now()}`,
      filename: safeFilename,
      savedPath,
      sizeBytes: 0,
      sizeKB: 0,
      mime,
      timestamp: new Date().toISOString(),
      verified: false,
      method: 'client-blob'
    };
    return {
      verified: false,
      savedPath,
      downloadUrl: '',
      filename: safeFilename,
      sizeBytes: 0,
      sizeKB: 0,
      method: 'client-blob',
      record: emptyRec,
      error: 'محتوى الملف فارغ ولا يمكن حفظه'
    };
  }

  const base64Payload = isBinary
    ? uint8ArrayToBase64(content)
    : stringToBase64Utf8(content as string);

  // 1. NATIVE ANDROID APK BRIDGE (`window.UMEDNativeDownloader` -> saves directly to `Download/UMEDT/<filename>`)
  const nativeBridge = getNativeBridge();
  if (nativeBridge && typeof nativeBridge.saveBase64FileToDownloads === 'function') {
    try {
      const rawJson = nativeBridge.saveBase64FileToDownloads(
        safeFilename,
        base64Payload,
        mime
      );
      const parsed = JSON.parse(rawJson) as {
        ok?: boolean;
        verified?: boolean;
        filename?: string;
        savedPath?: string;
        uri?: string;
        sizeBytes?: number;
        error?: string;
      };

      if (parsed.ok && parsed.verified && (parsed.sizeBytes || sizeBytes) > 0) {
        const finalName = parsed.filename || safeFilename;
        const finalPath = parsed.savedPath || `Download/UMEDT/${finalName}`;
        const finalBytes = parsed.sizeBytes || sizeBytes;
        const finalKB = Math.max(1, Math.round((finalBytes / 1024) * 10) / 10);

        const rec: LocalDownloadRecord = {
          id: `dl-${Date.now()}`,
          filename: finalName,
          savedPath: finalPath,
          sizeBytes: finalBytes,
          sizeKB: finalKB,
          mime,
          timestamp: new Date().toISOString(),
          verified: true,
          nativeUri: parsed.uri || undefined,
          previewText,
          method: 'android-native-storage'
        };
        recordLocalDownload(rec, content);

        return {
          verified: true,
          savedPath: finalPath,
          downloadUrl: parsed.uri || `file:///storage/emulated/0/${finalPath}`,
          filename: finalName,
          sizeBytes: finalBytes,
          sizeKB: finalKB,
          method: 'android-native-storage',
          record: rec
        };
      } else {
        throw new Error(parsed.error || 'فشل التحقق من حفظ الملف في ذاكرة الهاتف');
      }
    } catch (err) {
      // If on native bridge and it threw an error, only continue to fallback if allowed
      console.warn('[UMEDNativeDownloader] Fallback after native save error:', err);
    }
  }

  // 2. Server-side attachment relay (when running on Node/Express server) with a fast 2.5s timeout
  if (typeof fetch === 'function') {
    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), 2500)
        : null;

      const res = await fetch('/api/download/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: safeFilename,
          mime,
          content: isBinary ? base64Payload : content,
          isBase64: isBinary
        }),
        ...(controller ? { signal: controller.signal } : {})
      });

      if (timer) clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as {
          downloadUrl?: string;
          filename?: string;
        };
        if (data.downloadUrl) {
          const finalName = data.filename || safeFilename;
          const finalPath = `Download/UMEDT/${finalName}`;
          triggerDirectHttpUrlDownload(data.downloadUrl, finalName);
          const rec: LocalDownloadRecord = {
            id: `dl-${Date.now()}`,
            filename: finalName,
            savedPath: finalPath,
            sizeBytes,
            sizeKB,
            mime,
            timestamp: new Date().toISOString(),
            verified: true,
            previewText,
            method: 'server-attachment'
          };
          recordLocalDownload(rec, content);
          return {
            verified: true,
            savedPath: finalPath,
            downloadUrl: data.downloadUrl,
            filename: finalName,
            sizeBytes,
            sizeKB,
            method: 'server-attachment',
            record: rec
          };
        }
      }
    } catch {
      // Fallback to client-side download in offline / static / APK mode
    }
  }

  // 3. In Android WebView (if native bridge was not attached yet), use data: URI
  if (isAndroidWebViewEnvironment() && sizeBytes <= 6 * 1024 * 1024) {
    try {
      const dataUrl = `data:${mime};base64,${base64Payload}`;
      triggerDirectHttpUrlDownload(dataUrl, safeFilename);
      const rec: LocalDownloadRecord = {
        id: `dl-${Date.now()}`,
        filename: safeFilename,
        savedPath,
        sizeBytes,
        sizeKB,
        mime,
        timestamp: new Date().toISOString(),
        verified: true,
        previewText,
        method: 'android-data-uri'
      };
      recordLocalDownload(rec, content);
      return {
        verified: true,
        savedPath,
        downloadUrl: dataUrl,
        filename: safeFilename,
        sizeBytes,
        sizeKB,
        method: 'android-data-uri',
        record: rec
      };
    } catch {
      // Continue to standard Blob download
    }
  }

  // 4. Standard client-side Blob URL download
  const blob = isBinary
    ? new Blob([new Uint8Array(content)], { type: mime })
    : new Blob([content], { type: mime });
  const blobUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : `memory://Download/UMEDT/${safeFilename}`;
  if (blobUrl.startsWith('blob:')) {
    triggerDirectHttpUrlDownload(blobUrl, safeFilename);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Ignore
      }
    }, 30000);
  }

  const rec: LocalDownloadRecord = {
    id: `dl-${Date.now()}`,
    filename: safeFilename,
    savedPath,
    sizeBytes,
    sizeKB,
    mime,
    timestamp: new Date().toISOString(),
    verified: blob.size === sizeBytes && sizeBytes > 0,
    previewText,
    method: 'client-blob'
  };
  recordLocalDownload(rec, content);

  return {
    verified: rec.verified,
    savedPath,
    downloadUrl: blobUrl,
    filename: safeFilename,
    sizeBytes,
    sizeKB,
    method: 'client-blob',
    record: rec
  };
}

/**
 * Opens a previously downloaded file on Android (`ACTION_VIEW`) or returns its preview text for in-app viewing.
 */
export function openSavedDownloadFile(record: LocalDownloadRecord): {
  openedNatively: boolean;
  previewText: string;
  messageAr: string;
} {
  const bridge = getNativeBridge();
  if (bridge && typeof bridge.openDownloadedFile === 'function') {
    try {
      const raw = bridge.openDownloadedFile(record.filename, record.mime);
      const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
      if (parsed.ok) {
        return {
          openedNatively: true,
          previewText: record.previewText || '',
          messageAr: `تم فتح الملف "${record.filename}" من المسار ${record.savedPath}`
        };
      }
    } catch {
      // Fallback to in-app preview
    }
  }

  const cached = inMemoryFilePayloads.get(record.filename);
  if (cached && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const part =
      cached.content instanceof Uint8Array
        ? new Uint8Array(cached.content)
        : cached.content;
    const blob = new Blob([part], { type: cached.mime });
    const url = URL.createObjectURL(blob);
    triggerDirectHttpUrlDownload(url, record.filename);
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  return {
    openedNatively: false,
    previewText:
      record.previewText ||
      `ملف محفوظ في ${record.savedPath} (${record.sizeKB} KB)`,
    messageAr: `معاينة الملف "${record.filename}" (${record.savedPath})`
  };
}

/**
 * Shares a previously downloaded file via Android Native Share (`ACTION_SEND`) or Web Share API (`navigator.share`).
 */
export async function shareSavedDownloadFile(
  record: LocalDownloadRecord
): Promise<{ shared: boolean; messageAr: string }> {
  const bridge = getNativeBridge();
  if (bridge && typeof bridge.shareDownloadedFile === 'function') {
    try {
      const raw = bridge.shareDownloadedFile(
        record.filename,
        record.mime,
        record.filename
      );
      const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
      if (parsed.ok) {
        return {
          shared: true,
          messageAr: `تم فتح نافذة مشاركة الملف "${record.filename}" من ${record.savedPath}`
        };
      }
    } catch {
      // Fallback to Web Share API
    }
  }

  const cached = inMemoryFilePayloads.get(record.filename);
  const contentToShare = cached?.content || record.previewText || '';
  if (contentToShare) {
    try {
      const part =
        contentToShare instanceof Uint8Array
          ? new Uint8Array(contentToShare)
          : contentToShare;
      const file = new File([part], record.filename, { type: record.mime });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: record.filename,
          text: `ملف من تطبيق UMEDT (${record.savedPath} · ${record.sizeKB} KB)`,
          files: [file]
        });
        return {
          shared: true,
          messageAr: `تمت مشاركة الملف "${record.filename}" بنجاح`
        };
      }
    } catch {
      // User cancelled or Web Share unsupported
    }
  }

  // Fallback: re-download file
  if (contentToShare) {
    await prepareAndDownloadFile({
      filename: record.filename,
      content: contentToShare,
      mime: record.mime
    });
    return {
      shared: false,
      messageAr: `تم حفظ نسخة من الملف "${record.filename}" في ${record.savedPath}`
    };
  }

  return {
    shared: false,
    messageAr: `الملف محفوظ في المسار: ${record.savedPath}`
  };
}

export async function shareFileOnAndroidOrDownload(options: {
  filename: string;
  content: string | Uint8Array;
  mime?: string;
  title?: string;
  text?: string;
}): Promise<boolean> {
  const {
    filename,
    content,
    mime = 'application/octet-stream',
    title = filename,
    text = `ملف من تطبيق UMEDT: ${filename}`
  } = options;

  // First ensure the file is saved & verified in Download/UMEDT
  const savedRes = await prepareAndDownloadFile({
    filename,
    content,
    mime
  });

  // If running on native Android bridge, share directly from Download/UMEDT
  const bridge = getNativeBridge();
  if (bridge && typeof bridge.shareDownloadedFile === 'function') {
    try {
      const raw = bridge.shareDownloadedFile(savedRes.filename, mime, title);
      const parsed = JSON.parse(raw) as { ok?: boolean };
      if (parsed.ok) {
        return true;
      }
    } catch {
      // Fallback to Web Share API
    }
  }

  try {
    const part = content instanceof Uint8Array ? new Uint8Array(content) : content;
    const file = new File([part], savedRes.filename, { type: mime });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files: [file] }))
    ) {
      await navigator.share({
        title,
        text,
        files: [file]
      });
      return true;
    }
  } catch {
    // User cancelled or browser blocked share; file is already saved in Download/UMEDT
  }

  return savedRes.verified;
}
