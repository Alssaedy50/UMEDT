/**
 * Universal Android, PWA, Web & Iframe-Safe File Downloader & Native Share Helper.
 * Uses the Express `/api/download/prepare` + `/api/download/file/:id/:filename` HTTP attachment
 * relay when available in preview, and falls back to client-side Blob downloads on static hosts
 * (Cloudflare Pages, installed PWA, and Android Capacitor APK).
 */

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

export function triggerDirectHttpUrlDownload(url: string, filename?: string): void {
  try {
    const a = document.createElement('a');
    a.href = url;
    if (filename) {
      a.download = filename;
    }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 3000);
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

export async function prepareAndDownloadFile(options: {
  filename: string;
  content: string | Uint8Array;
  mime?: string;
}): Promise<{
  downloadUrl: string;
  filename: string;
}> {
  const { filename, content, mime = 'application/octet-stream' } = options;
  const isBinary = content instanceof Uint8Array;
  const payloadContent = isBinary ? uint8ArrayToBase64(content) : content;

  try {
    const res = await fetch('/api/download/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        mime,
        content: payloadContent,
        isBase64: isBinary
      })
    });

    if (res.ok) {
      const data = (await res.json()) as {
        downloadUrl?: string;
        filename?: string;
      };
      if (data.downloadUrl) {
        triggerDirectHttpUrlDownload(data.downloadUrl, data.filename || filename);
        return {
          downloadUrl: data.downloadUrl,
          filename: data.filename || filename
        };
      }
    }
  } catch {
    // Fallback to client blob if server is unreachable in static Cloudflare Pages / PWA / APK mode
  }

  // Pure client-side fallback (Blob URL)
  const blob = isBinary
    ? new Blob([new Uint8Array(content)], { type: mime })
    : new Blob([content], { type: mime });
  const blobUrl = URL.createObjectURL(blob);
  triggerDirectHttpUrlDownload(blobUrl, filename);
  return {
    downloadUrl: blobUrl,
    filename
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
    text = `ملف من تطبيق UMED-2 DictEngine: ${filename}`
  } = options;

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
      return true;
    }
  } catch {
    // User cancelled or browser blocked share; fallback to download
  }

  await prepareAndDownloadFile({ filename, content, mime });
  return false;
}
