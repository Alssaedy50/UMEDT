import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface PdfJsPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel?: () => void };
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void> | void;
}

interface PdfJsApi {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<PdfJsDocument>;
  };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsApi;
  }
}

interface PdfDocumentReaderProps {
  source: string;
  title?: string;
}

let pdfJsLoader: Promise<PdfJsApi> | null = null;

function loadPdfJs(): Promise<PdfJsApi> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsLoader) return pdfJsLoader;

  pdfJsLoader = new Promise<PdfJsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-umedt-pdfjs="true"]'
    );
    const script = existing || document.createElement('script');

    const fail = () => {
      pdfJsLoader = null;
      reject(new Error('تعذر تحميل محرك قراءة PDF. تحقق من اتصال الإنترنت ثم أعد المحاولة.'));
    };

    script.addEventListener('error', fail, { once: true });
    script.addEventListener(
      'load',
      () => {
        if (!window.pdfjsLib) {
          fail();
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      },
      { once: true }
    );

    if (!existing) {
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.dataset.umedtPdfjs = 'true';
      document.head.appendChild(script);
    } else if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
    }
  });

  return pdfJsLoader;
}

export const PdfDocumentReader: React.FC<PdfDocumentReaderProps> = ({
  source,
  title
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PdfJsDocument | null>(null);
  const renderCancelRef = useRef<(() => void) | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  const loadDocument = useCallback(async () => {
    if (!source) {
      setError('رابط ملف PDF غير موجود.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setPdfDocument(null);
    documentRef.current = null;

    try {
      const pdfjs = await loadPdfJs();
      const response = await fetch(source, {
        method: 'GET',
        cache: 'force-cache',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`تعذر تنزيل ملف PDF (HTTP ${response.status}).`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.length < 5) {
        throw new Error('الملف فارغ أو غير مكتمل.');
      }

      const header = new TextDecoder().decode(bytes.slice(0, 1024));
      if (
        (contentType.includes('text/html') || header.trimStart().startsWith('<!DOCTYPE html')) &&
        !header.includes('%PDF-')
      ) {
        throw new Error('الرابط أعاد صفحة HTML وليس ملف PDF مباشراً. استخدم رابط raw مباشر للملف.');
      }

      const loaded = await pdfjs.getDocument({ data: bytes }).promise;
      documentRef.current = loaded;
      setPdfDocument(loaded);
      setPageCount(loaded.numPages);
      setPageNumber(1);
      setZoom(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير معروف أثناء قراءة PDF.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void loadDocument();
    return () => {
      renderCancelRef.current?.();
      const current = documentRef.current;
      documentRef.current = null;
      if (current) void current.destroy();
    };
  }, [loadDocument]);

  useEffect(() => {
    let cancelled = false;
    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current) return;
      setRendering(true);
      renderCancelRef.current?.();

      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('تعذر إنشاء مساحة رسم صفحة PDF.');

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const task = page.render({ canvasContext: context, viewport });
        renderCancelRef.current = () => task.cancel?.();
        await task.promise;
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'تعذر عرض صفحة PDF.';
          if (!message.toLowerCase().includes('cancel')) setError(message);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderCancelRef.current?.();
    };
  }, [pdfDocument, pageNumber, zoom]);

  if (loading) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <p className="text-sm font-bold">جارٍ تحميل وقراءة ملف PDF...</p>
        <p className="text-xs text-slate-500">قد يستغرق ذلك وقتاً حسب حجم الملف وسرعة الاتصال.</p>
      </div>
    );
  }

  if (error && !pdfDocument) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center gap-3 p-5 text-center">
        <AlertTriangle className="w-9 h-9 text-amber-500" />
        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">تعذرت قراءة ملف PDF داخل التطبيق</p>
        <p className="max-w-xl text-xs leading-6 text-slate-600 dark:text-slate-300">{error}</p>
        <button
          type="button"
          onClick={() => void loadDocument()}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-slate-200 dark:bg-slate-950">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300" dir="ltr">
          {title || 'PDF'} · {pageNumber} / {pageCount}
          {rendering ? ' · Rendering…' : ''}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="تصغير" disabled={zoom <= 0.6} onClick={() => setZoom(v => Math.max(0.6, Number((v - 0.2).toFixed(1))))} className="min-w-9 min-h-9 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 flex items-center justify-center">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="min-w-12 text-center text-[11px] font-bold text-slate-600 dark:text-slate-300">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="تكبير" disabled={zoom >= 2.4} onClick={() => setZoom(v => Math.min(2.4, Number((v + 0.2).toFixed(1))))} className="min-w-9 min-h-9 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 flex items-center justify-center">
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button type="button" aria-label="الصفحة السابقة" disabled={pageNumber <= 1} onClick={() => setPageNumber(v => Math.max(1, v - 1))} className="min-w-9 min-h-9 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 flex items-center justify-center">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" aria-label="الصفحة التالية" disabled={pageNumber >= pageCount} onClick={() => setPageNumber(v => Math.min(pageCount, v + 1))} className="min-w-9 min-h-9 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3 flex justify-center items-start">
        <canvas
          ref={canvasRef}
          aria-label={`PDF page ${pageNumber}`}
          className="max-w-full h-auto bg-white shadow-lg"
        />
      </div>
      {error && (
        <p className="shrink-0 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40">{error}</p>
      )}
    </div>
  );
};
