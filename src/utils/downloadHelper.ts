/**
 * Universal Android, PWA, Web & Iframe-Safe File Downloader & Native Share Helper.
 * Uses the Express `/api/download/prepare` + `/api/download/file/:id/:filename` HTTP attachment
 * relay when available in preview, and falls back to client-side Blob / Data-URI downloads on
 * static hosts (Cloudflare Pages, installed PWA, and Android Capacitor APK).
 */

export interface LocalDownloadRecord {
  filename: string;
  sizeBytes: number;
  sizeKB: number;
  mime: string;
  timestamp: string;
  method: 'server-attachment' | 'client-blob' | 'android-data-uri' | 'native-share';
}

const LAST_LOCAL_DOWNLOAD_KEY = 'umed_last_local_download_v1';
const fallbackMemoryStore = new Map<string, string>();

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
      },
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
    entries: () => Array.from(fallbackMemoryStore.entries()),
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

export function recordLocalDownload(record: LocalDownloadRecord): void {
  try {
    getSafeStorage().setItem(LAST_LOCAL_DOWNLOAD_KEY, JSON.stringify(record));
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
      lastDownload: getLastLocalDownloadRecord(),
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
  const ua = navigator.userAgent || '';
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return true;
  }
  return /Android/i.test(ua) && /wv|Version\/\d+\.\d+/i.test(ua);
}

export async function prepareAndDownloadFile(options: {
  filename: string;
  content: string | Uint8Array;
  mime?: string;
}): Promise<{
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
  sizeKB: number;
  method: LocalDownloadRecord['method'];
}> {
  const { filename, content, mime = 'application/octet-stream' } = options;
  const isBinary = content instanceof Uint8Array;
  const sizeBytes = getByteLength(content);
  const sizeKB = Math.max(1, Math.round((sizeBytes / 1024) * 10) / 10);
  const payloadContent = isBinary ? uint8ArrayToBase64(content) : content;

  // 1. Try server-side attachment relay (when running on Node/Express server) with a fast timeout
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
          filename,
          mime,
          content: payloadContent,
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
          const finalName = data.filename || filename;
          triggerDirectHttpUrlDownload(data.downloadUrl, finalName);
          const rec: LocalDownloadRecord = {
            filename: finalName,
            sizeBytes,
            sizeKB,
            mime,
            timestamp: new Date().toISOString(),
            method: 'server-attachment'
          };
          recordLocalDownload(rec);
          return {
            downloadUrl: data.downloadUrl,
            filename: finalName,
            sizeBytes,
            sizeKB,
            method: 'server-attachment'
          };
        }
      }
    } catch {
      // Fallback to client-side download in offline / static / APK mode
    }
  }

  // 2. In Android WebView / Capacitor APK, data: URI downloads are handled more reliably than blob: URLs
  if (isAndroidWebViewEnvironment() && sizeBytes <= 6 * 1024 * 1024) {
    try {
      const base64Data = isBinary
        ? payloadContent
        : stringToBase64Utf8(content as string);
      const dataUrl = `data:${mime};base64,${base64Data}`;
      triggerDirectHttpUrlDownload(dataUrl, filename);
      const rec: LocalDownloadRecord = {
        filename,
        sizeBytes,
        sizeKB,
        mime,
        timestamp: new Date().toISOString(),
        method: 'android-data-uri'
      };
      recordLocalDownload(rec);
      return {
        downloadUrl: dataUrl,
        filename,
        sizeBytes,
        sizeKB,
        method: 'android-data-uri'
      };
    } catch {
      // Continue to standard Blob download
    }
  }

  // 3. Standard client-side Blob URL download
  const blob = isBinary
    ? new Blob([new Uint8Array(content)], { type: mime })
    : new Blob([content], { type: mime });
  const blobUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(blob)
      : '';
  if (blobUrl) {
    triggerDirectHttpUrlDownload(blobUrl, filename);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Ignore
      }
    }, 30000);
  }

  const rec: LocalDownloadRecord = {
    filename,
    sizeBytes,
    sizeKB,
    mime,
    timestamp: new Date().toISOString(),
    method: 'client-blob'
  };
  recordLocalDownload(rec);

  return {
    downloadUrl: blobUrl,
    filename,
    sizeBytes,
    sizeKB,
    method: 'client-blob'
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

  const sizeBytes = getByteLength(content);
  const sizeKB = Math.max(1, Math.round((sizeBytes / 1024) * 10) / 10);

  try {
    const part = content instanceof Uint8Array ? new Uint8Array(content) : content;
    const file = new File([part], filename, { type: mime });
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
      recordLocalDownload({
        filename,
        sizeBytes,
        sizeKB,
        mime,
        timestamp: new Date().toISOString(),
        method: 'native-share'
      });
      return true;
    }
  } catch {
    // User cancelled or browser blocked share; fallback to direct download
  }

  await prepareAndDownloadFile({ filename, content, mime });
  return false;
}

