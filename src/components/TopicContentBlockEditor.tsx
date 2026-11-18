import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Type,
  AlignLeft,
  Table as TableIcon,
  Image as ImageIcon,
  Video,
  Mic,
  Paperclip,
  HelpCircle,
  AlertCircle,
  ExternalLink,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  GitBranch,
  FileText,
  BookOpen,
  GraduationCap,
  Globe,
  Eye,
  RefreshCw
} from 'lucide-react';
import {
  TopicContentBlock,
  ContentBlockType,
  UnifiedQuizQuestion
} from '../types/lexicon';
import { VoiceRecorderBlock } from './VoiceRecorderBlock';
import {
  saveLocalMediaRecord,
  getLocalMediaRecord,
  deleteLocalMediaRecord,
  formatBytesLabel,
  detectExternalMediaKind,
  downloadRemoteMediaToOfflineCache,
  openMediaInExternalApp,
  isDownloadableMediaUrl,
  normalizeMediaMimeType
} from '../services/mediaStorageService';
import { loadAcademicBooks, loadAcademicExams } from '../services/learningHierarchyService';
import {
  prepareAndDownloadFile,
  base64ToUint8Array
} from '../utils/downloadHelper';

export function sanitizeSvgMarkup(rawSvg: string): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';
  return rawSvg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}

function extractInlineSvgFromDataUrl(dataUrl?: string): string {
  if (!dataUrl || !dataUrl.startsWith('data:image/svg+xml')) return '';
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return '';
    const meta = dataUrl.slice(0, commaIdx).toLowerCase();
    const payload = dataUrl.slice(commaIdx + 1);
    if (meta.includes(';base64')) {
      const bytes = base64ToUint8Array(payload);
      const decoded = new TextDecoder().decode(bytes);
      return sanitizeSvgMarkup(decoded);
    }
    return sanitizeSvgMarkup(decodeURIComponent(payload));
  } catch {
    return '';
  }
}

const CONTENT_BLOCK_TYPE_META: Record<
  ContentBlockType,
  {
    labelEn: string;
    labelAr: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  heading: {
    labelEn: 'Heading / Subheading',
    labelAr: 'عنوان فرعي أكاديمي',
    icon: Type
  },
  paragraph: {
    labelEn: 'Paragraph Explanation',
    labelAr: 'فقرة شرح علمي',
    icon: AlignLeft
  },
  table: {
    labelEn: 'Comparison Table',
    labelAr: 'جدول مقارنة طبي',
    icon: TableIcon
  },
  image: {
    labelEn: 'Image / Diagram',
    labelAr: 'صورة أو مخطط توضيحي',
    icon: ImageIcon
  },
  video: {
    labelEn: 'Video File / Player',
    labelAr: 'ملف فيديو أو مشغل مرئي',
    icon: Video
  },
  video_link: {
    labelEn: 'Video / Reference Link',
    labelAr: 'فيديو أو رابط مرجعي',
    icon: Video
  },
  audio: {
    labelEn: 'Audio / Voice Recording',
    labelAr: 'صوت أو تسجيل ميكروفون',
    icon: Mic
  },
  attachment: {
    labelEn: 'File / PDF Attachment',
    labelAr: 'ملف PDF أو مستند مرفق',
    icon: Paperclip
  },
  question: {
    labelEn: 'Inline Interactive Question',
    labelAr: 'سؤال تفاعلي مدمج بالشرح',
    icon: HelpCircle
  },
  clinical_note: {
    labelEn: 'Clinical Correlation / High-Yield Note',
    labelAr: 'ملاحظة سريرية أو تنبيه امتحاني',
    icon: AlertCircle
  },
  diagram: {
    labelEn: 'SVG Diagram / Flowchart',
    labelAr: 'مخطط أو رسم تفاعلي',
    icon: GitBranch
  },
  pdf_viewer: {
    labelEn: 'Interactive PDF Reader',
    labelAr: 'عارض PDF تفاعلي',
    icon: FileText
  },
  book_reference: {
    labelEn: 'Academic Book Reference',
    labelAr: 'مرجع كتاب أكاديمي',
    icon: BookOpen
  },
  exam_link: {
    labelEn: 'Exam / Quiz Link',
    labelAr: 'رابط اختبار تفاعلي',
    icon: GraduationCap
  }
};

// ============================================================================
// 1. INLINE READER COMPONENT (Renders ContentBlocks in exact pedagogical order)
// ============================================================================

interface SectionContentBlocksRendererProps {
  topicId: string;
  sectionId: string;
  blocks: TopicContentBlock[];
  showToast: (msg: string, type?: string) => void;
  onOpenExamOrQuiz?: (examId?: string, topicId?: string) => void;
}

export const SectionContentBlocksRenderer: React.FC<
  SectionContentBlocksRendererProps
> = ({ topicId, sectionId, blocks, showToast, onOpenExamOrQuiz }) => {
  const [inlineQuizAnswers, setInlineQuizAnswers] = useState<
    Record<string, string>
  >({});
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<
    Record<string, string>
  >({});
  const [downloadingBlockId, setDownloadingBlockId] = useState<string | null>(
    null
  );
  const [zoomedImage, setZoomedImage] = useState<{
    src: string;
    caption: string;
  } | null>(null);
  const [inlinePdfModal, setInlinePdfModal] = useState<{
    url: string;
    title: string;
    mimeType?: string;
  } | null>(null);
  const [inlineTextModal, setInlineTextModal] = useState<{
    title: string;
    content: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [failedBlockImages, setFailedBlockImages] = useState<
    Record<string, boolean>
  >({});

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  useEffect(() => {
    let cancelled = false;
    const resolveStoredMedia = async () => {
      const nextMap: Record<string, string> = {};
      for (const blk of blocks) {
        const rawUrl = blk.mediaUrl || '';
        const idbKey = rawUrl.startsWith('idb://')
          ? rawUrl.slice(6)
          : blk.mediaIdbKey || '';
        if (idbKey) {
          const rec = await getLocalMediaRecord(idbKey);
          if (rec?.dataUrl && !cancelled) {
            const recMime = (rec.mimeType || '').toLowerCase();
            const isHtmlPolluted =
              recMime === 'text/html' ||
              recMime === 'application/xhtml+xml' ||
              rec.dataUrl.startsWith('data:text/html');
            const isNonDownloadableLinkBlock =
              blk.type === 'video_link' &&
              Boolean(blk.externalUrl) &&
              !isDownloadableMediaUrl(
                blk.externalUrl!,
                blk.mediaMimeType,
                blk.mediaFileName
              );
            const isOctetPollutedLink =
              isNonDownloadableLinkBlock &&
              rec.dataUrl.startsWith('data:application/octet-stream');

            if (isHtmlPolluted || isOctetPollutedLink) {
              await deleteLocalMediaRecord(idbKey);
            } else {
              nextMap[blk.id] = rec.dataUrl;
            }
          }
        }
      }
      if (!cancelled && Object.keys(nextMap).length > 0) {
        setResolvedMediaUrls((prev) => ({ ...prev, ...nextMap }));
      }
    };
    void resolveStoredMedia();
    return () => {
      cancelled = true;
    };
  }, [blocks]);

  const handleCacheExternalMediaOffline = async (
    blk: TopicContentBlock,
    externalUrl: string
  ) => {
    if (!externalUrl || !/^https?:\/\//i.test(externalUrl)) {
      showToast('الرابط غير صالح للتنزيل المباشر', 'info');
      return;
    }
    setDownloadingBlockId(blk.id);
    try {
      const res = await downloadRemoteMediaToOfflineCache({
        remoteUrl: externalUrl,
        topicId,
        sectionId,
        blockId: blk.id,
        preferredFileName: blk.mediaFileName || blk.titleEn,
        preferredMimeType: blk.mediaMimeType
      });
      if (res.success && res.dataUrl) {
        setResolvedMediaUrls((prev) => ({ ...prev, [blk.id]: res.dataUrl! }));
        setFailedBlockImages((prev) => {
          if (!prev[blk.id]) return prev;
          const copy = { ...prev };
          delete copy[blk.id];
          return copy;
        });
      }
      showToast(res.messageAr, res.success ? 'success' : 'info');
    } finally {
      setDownloadingBlockId(null);
    }
  };

  const handleOpenInExternalApp = async (
    blk: TopicContentBlock,
    fallbackUrl?: string
  ) => {
    const detectedLink =
      blk.externalUrl && /^https?:\/\//i.test(blk.externalUrl)
        ? detectExternalMediaKind(
            blk.externalUrl,
            blk.mediaMimeType,
            blk.mediaFileName
          )
        : null;
    const preferExternalWebUrl =
      blk.type === 'video_link' &&
      Boolean(blk.externalUrl && /^https?:\/\//i.test(blk.externalUrl)) &&
      (!detectedLink ||
        detectedLink.kind === 'link' ||
        detectedLink.kind === 'video_embed');

    const targetUrl = preferExternalWebUrl
      ? blk.externalUrl!
      : resolvedMediaUrls[blk.id] ||
        (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
        blk.externalUrl ||
        fallbackUrl ||
        '';

    const resolvedMime = /^https?:\/\//i.test(targetUrl)
      ? ''
      : normalizeMediaMimeType(
          blk.mediaMimeType,
          blk.mediaFileName,
          targetUrl
        );

    const res = await openMediaInExternalApp(
      targetUrl,
      blk.mediaFileName || blk.titleEn || 'UMEDT_Media',
      resolvedMime
    );
    showToast(res.messageAr, res.opened ? 'success' : 'info');
  };

  const handleDownloadInlineAttachment = async (blk: TopicContentBlock) => {
    const fileName = blk.mediaFileName || blk.titleEn || 'Attachment.pdf';
    let contentOrUrl =
      resolvedMediaUrls[blk.id] ||
      (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
      blk.externalUrl ||
      blk.text ||
      '';

    if (contentOrUrl.startsWith('idb://') || (!contentOrUrl && blk.mediaIdbKey)) {
      const key = contentOrUrl.startsWith('idb://')
        ? contentOrUrl.slice(6)
        : blk.mediaIdbKey || '';
      const rec = key ? await getLocalMediaRecord(key) : null;
      contentOrUrl = rec?.dataUrl || '';
    }

    if (!contentOrUrl) {
      showToast('الملف المرفق فارغ أو تعذر العثور عليه في التخزين المحلي', 'info');
      return;
    }

    if (/^https?:\/\//i.test(contentOrUrl)) {
      await handleCacheExternalMediaOffline(blk, contentOrUrl);
      return;
    }

    if (contentOrUrl.startsWith('data:')) {
      const commaIdx = contentOrUrl.indexOf(',');
      const header = commaIdx !== -1 ? contentOrUrl.slice(5, commaIdx) : '';
      const dataPart = commaIdx !== -1 ? contentOrUrl.slice(commaIdx + 1) : '';
      const mime = normalizeMediaMimeType(
        header.split(';')[0] || blk.mediaMimeType,
        fileName,
        contentOrUrl
      );
      const payload = header.includes('base64')
        ? base64ToUint8Array(dataPart)
        : decodeURIComponent(dataPart);
      const res = await prepareAndDownloadFile({
        filename: fileName,
        content: payload,
        mime
      });
      if (res.initiated) {
        showToast(res.messageAr);
      } else {
        showToast(res.error || 'تعذر حفظ الملف المرفق', 'info');
      }
      return;
    }

    const normalizedMime = normalizeMediaMimeType(
      blk.mediaMimeType,
      fileName,
      contentOrUrl
    );
    const textMime =
      normalizedMime === 'application/octet-stream'
        ? 'text/plain;charset=utf-8'
        : normalizedMime.startsWith('text/') || normalizedMime === 'application/json'
          ? `${normalizedMime};charset=utf-8`
          : normalizedMime;

    const res = await prepareAndDownloadFile({
      filename: fileName,
      content: contentOrUrl,
      mime: textMime
    });
    if (res.initiated) {
      showToast(res.messageAr, 'success');
    } else {
      showToast(res.error || 'تعذر تنزيل الملف المرفق', 'info');
    }
  };

  const handlePreviewTextAttachment = async (
    blk: TopicContentBlock,
    resolvedSrc: string
  ) => {
    const fileName = blk.mediaFileName || blk.titleEn || 'Study_Sheet.txt';
    const mimeType = normalizeMediaMimeType(
      blk.mediaMimeType,
      fileName,
      resolvedSrc
    );
    let textContent = '';

    if (resolvedSrc.startsWith('data:')) {
      const commaIdx = resolvedSrc.indexOf(',');
      const header = commaIdx !== -1 ? resolvedSrc.slice(5, commaIdx) : '';
      const dataPart = commaIdx !== -1 ? resolvedSrc.slice(commaIdx + 1) : '';
      if (header.includes('base64')) {
        textContent = new TextDecoder('utf-8', { fatal: false }).decode(
          base64ToUint8Array(dataPart)
        );
      } else {
        try {
          textContent = decodeURIComponent(dataPart);
        } catch {
          textContent = dataPart;
        }
      }
    } else if (/^https?:\/\//i.test(resolvedSrc)) {
      const cached = await downloadRemoteMediaToOfflineCache({
        remoteUrl: resolvedSrc,
        topicId,
        sectionId,
        blockId: blk.id,
        preferredFileName: fileName,
        preferredMimeType: mimeType
      });
      if (cached.success && cached.dataUrl) {
        setResolvedMediaUrls((prev) => ({ ...prev, [blk.id]: cached.dataUrl }));
        const commaIdx = cached.dataUrl.indexOf(',');
        const dataPart = commaIdx !== -1 ? cached.dataUrl.slice(commaIdx + 1) : '';
        textContent = new TextDecoder('utf-8', { fatal: false }).decode(
          base64ToUint8Array(dataPart)
        );
      } else {
        showToast(cached.messageAr, 'info');
        return;
      }
    } else {
      textContent = resolvedSrc || blk.text || '';
    }

    setInlineTextModal({
      title: fileName,
      content: textContent,
      fileName,
      mimeType
    });
  };

  return (
    <div className="space-y-4">
      {sortedBlocks.map((blk) => {
        if (blk.type === 'heading') {
          return (
            <div key={blk.id} className="pt-2 space-y-0.5">
              <h3
                dir="ltr"
                className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-left"
              >
                {blk.titleEn || blk.text}
              </h3>
              {blk.titleAr && blk.titleAr !== blk.titleEn && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {blk.titleAr}
                </p>
              )}
            </div>
          );
        }

        if (blk.type === 'paragraph') {
          return (
            <div key={blk.id} className="space-y-1.5">
              {blk.text && (
                <p
                  dir="auto"
                  className="text-sm sm:text-[15px] leading-[1.85] text-slate-800 dark:text-slate-200 whitespace-pre-line"
                >
                  {blk.text}
                </p>
              )}
              {blk.textAr && blk.textAr !== blk.text && (
                <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-line">
                  {blk.textAr}
                </p>
              )}
            </div>
          );
        }

        if (blk.type === 'clinical_note') {
          return (
            <div
              key={blk.id}
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-amber-800 dark:text-amber-300">
                <span dir="ltr" className="break-words">{blk.titleEn || 'Clinical Correlation & High-Yield Note'}</span>
                <span>{blk.titleAr || 'ملاحظة سريرية هامة'}</span>
              </div>
              <p
                dir="auto"
                className="text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line"
              >
                {blk.text}
              </p>
            </div>
          );
        }

        if (blk.type === 'table') {
          const headers = blk.tableHeaders || [];
          const rows = blk.tableRows || [];
          return (
            <div
              key={blk.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
            >
              {(blk.titleEn || blk.titleAr) && (
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-extrabold text-slate-900 dark:text-white break-words">
                    {blk.titleEn}
                  </span>
                  {blk.titleAr && (
                    <span className="text-xs text-slate-500">{blk.titleAr}</span>
                  )}
                </div>
              )}
              <div className="w-full max-w-full overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse" dir="ltr">
                  {headers.length > 0 && (
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                        {headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="p-3 font-extrabold text-slate-800 dark:text-slate-200"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-950/50"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            dir="auto"
                            className="p-3 text-slate-700 dark:text-slate-300 align-top"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (blk.type === 'image') {
          const remoteUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const imgSrc =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteUrl;
          if (!imgSrc) return null;
          const isCachedLocally = Boolean(
            resolvedMediaUrls[blk.id] || imgSrc.startsWith('data:')
          );
          const hasImageError = Boolean(failedBlockImages[blk.id]);
          const isSvgImg =
            imgSrc.startsWith('data:image/svg') ||
            imgSrc.toLowerCase().includes('.svg') ||
            (blk.mediaMimeType || '').includes('svg') ||
            (blk.mediaFileName || '').toLowerCase().endsWith('.svg');

          return (
            <figure
              key={blk.id}
              className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 my-2 max-w-full"
            >
              {!hasImageError ? (
                <img
                  src={imgSrc}
                  alt={blk.captionEn || blk.captionAr || 'Medical diagram'}
                  referrerPolicy="no-referrer"
                  onClick={() =>
                    setZoomedImage({
                      src: imgSrc,
                      caption: blk.captionEn || blk.captionAr || ''
                    })
                  }
                  onLoad={() => {
                    if (failedBlockImages[blk.id]) {
                      setFailedBlockImages((prev) => {
                        const copy = { ...prev };
                        delete copy[blk.id];
                        return copy;
                      });
                    }
                  }}
                  onError={() => {
                    setFailedBlockImages((prev) => ({ ...prev, [blk.id]: true }));
                  }}
                  className={`w-full max-w-full h-auto max-h-[420px] object-contain mx-auto cursor-zoom-in ${
                    isSvgImg ? 'bg-white dark:bg-slate-900 p-2' : 'bg-slate-950'
                  }`}
                />
              ) : (
                <div className="min-h-[140px] flex flex-col items-center justify-center p-5 text-center space-y-2.5 bg-slate-100 dark:bg-slate-900">
                  <ImageIcon className="w-7 h-7 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    تعذر عرض الصورة من الرابط — يمكنك محاولة الجلب أوفلاين أو الفتح خارجياً
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFailedBlockImages((prev) => {
                          const copy = { ...prev };
                          delete copy[blk.id];
                          return copy;
                        })
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>إعادة المحاولة</span>
                    </button>
                    {remoteUrl && isDownloadableMediaUrl(remoteUrl, blk.mediaMimeType, blk.mediaFileName) && (
                      <button
                        type="button"
                        disabled={downloadingBlockId === blk.id}
                        onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingBlockId === blk.id ? 'جاري الجلب...' : 'جلب أوفلاين'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
              <figcaption className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="leading-relaxed break-words">
                  {blk.captionEn || blk.captionAr || blk.mediaFileName || 'صورة توضيحية'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {remoteUrl &&
                    !isCachedLocally &&
                    isDownloadableMediaUrl(remoteUrl, blk.mediaMimeType, blk.mediaFileName) && (
                      <button
                        type="button"
                        disabled={downloadingBlockId === blk.id}
                        onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                        className="min-h-[36px] px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>
                          {downloadingBlockId === blk.id ? 'جاري الحفظ...' : 'تنزيل أوفلاين'}
                        </span>
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => void handleOpenInExternalApp(blk, imgSrc)}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>فتح خارجياً</span>
                  </button>
                </div>
              </figcaption>
            </figure>
          );
        }

        if (blk.type === 'video' || blk.type === 'video_link') {
          const remoteUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const localOrDirectSrc =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteUrl;
          if (!localOrDirectSrc) return null;

          const detected = detectExternalMediaKind(
            remoteUrl || localOrDirectSrc,
            blk.mediaMimeType,
            blk.mediaFileName
          );
          const canCacheOffline =
            Boolean(remoteUrl) &&
            isDownloadableMediaUrl(remoteUrl, blk.mediaMimeType, blk.mediaFileName);
          const isPlayableVideoFile =
            detected.kind === 'video_direct' ||
            localOrDirectSrc.startsWith('data:video/') ||
            (blk.type === 'video' &&
              detected.kind !== 'link' &&
              detected.kind !== 'video_embed');
          const isAudioLink =
            detected.kind === 'audio' ||
            localOrDirectSrc.startsWith('data:audio/');
          const isCachedLocally = Boolean(
            resolvedMediaUrls[blk.id] ||
              localOrDirectSrc.startsWith('data:video/') ||
              localOrDirectSrc.startsWith('data:audio/')
          );
          const domainLabel = (() => {
            try {
              if (/^https?:\/\//i.test(remoteUrl)) {
                return new URL(remoteUrl).hostname.replace(/^www\./, '');
              }
            } catch {
              // ignore
            }
            return '';
          })();

          return (
            <div
              key={blk.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {detected.kind === 'video_embed' || isPlayableVideoFile ? (
                      <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <p
                      dir="ltr"
                      className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-400 break-words text-left"
                    >
                      {blk.titleEn || blk.mediaFileName || remoteUrl || 'Medical Resource'}
                    </p>
                  </div>
                  {(blk.titleAr || blk.text) && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                      {blk.titleAr || blk.text}
                    </p>
                  )}
                  {domainLabel && (
                    <p className="text-[11px] font-mono text-slate-400" dir="ltr">
                      {domainLabel}
                      {detected.kind === 'video_embed'
                        ? ' · Embedded Video'
                        : detected.kind === 'link'
                          ? ' · External Reference'
                          : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {canCacheOffline && !isCachedLocally && (
                    <button
                      type="button"
                      disabled={downloadingBlockId === blk.id}
                      onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {downloadingBlockId === blk.id ? 'جاري التنزيل...' : 'حفظ أوفلاين'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleOpenInExternalApp(blk, remoteUrl || localOrDirectSrc)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      detected.kind === 'link'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>
                      {detected.kind === 'link'
                        ? 'فتح الرابط في المتصفح'
                        : detected.kind === 'video_embed'
                          ? 'فتح في YouTube / المتصفح'
                          : 'فتح في تطبيق خارجي'}
                    </span>
                  </button>
                </div>
              </div>

              {isPlayableVideoFile ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={localOrDirectSrc}
                  className="w-full max-h-[380px] rounded-xl bg-black"
                />
              ) : isAudioLink ? (
                <audio
                  controls
                  preload="metadata"
                  src={localOrDirectSrc}
                  className="w-full"
                />
              ) : detected.kind === 'video_embed' && detected.embedUrl ? (
                typeof navigator !== 'undefined' && navigator.onLine === false ? (
                  <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 text-center space-y-1">
                    <p className="font-bold">فيديو YouTube مدمج يتطلب اتصالاً بالإنترنت للتشغيل</p>
                    <p dir="ltr" className="text-[11px] font-mono text-slate-400 break-all">
                      {remoteUrl}
                    </p>
                  </div>
                ) : (
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-800">
                    <iframe
                      src={detected.embedUrl}
                      title={blk.titleEn || 'Embedded Video'}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  </div>
                )
              ) : null}
            </div>
          );
        }

        if (blk.type === 'audio') {
          const remoteAudioUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const activeAudioSrc =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteAudioUrl;
          const isCachedLocally = Boolean(
            resolvedMediaUrls[blk.id] ||
              (activeAudioSrc && activeAudioSrc.startsWith('data:'))
          );

          return (
            <div key={blk.id} className="space-y-2">
              <VoiceRecorderBlock
                topicId={topicId}
                sectionId={sectionId}
                blockId={blk.id}
                initialAudioUrl={activeAudioSrc || blk.mediaUrl}
                initialMediaIdbKey={blk.mediaIdbKey}
                initialDurationSeconds={blk.mediaDurationSeconds}
                initialTitleEn={blk.titleEn}
                initialTitleAr={blk.titleAr}
                readOnly={true}
                showToast={showToast}
              />
              {(remoteAudioUrl || activeAudioSrc) && (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {remoteAudioUrl && !isCachedLocally && (
                    <button
                      type="button"
                      disabled={downloadingBlockId === blk.id}
                      onClick={() =>
                        void handleCacheExternalMediaOffline(blk, remoteAudioUrl)
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>
                        {downloadingBlockId === blk.id
                          ? 'جاري التنزيل...'
                          : 'تنزيل الصوت أوفلاين'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleOpenInExternalApp(blk, activeAudioSrc)}
                    className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>فتح في مشغل خارجي</span>
                  </button>
                </div>
              )}
            </div>
          );
        }

        if (blk.type === 'attachment') {
          const remoteUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const resolvedSrc =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteUrl;
          const normalizedMime = normalizeMediaMimeType(
            blk.mediaMimeType,
            blk.mediaFileName,
            resolvedSrc
          );
          const isPdf =
            normalizedMime.includes('pdf') ||
            (blk.mediaFileName || '').toLowerCase().endsWith('.pdf') ||
            resolvedSrc.toLowerCase().includes('.pdf') ||
            resolvedSrc.startsWith('data:application/pdf');
          const isInlinePlainText =
            Boolean(resolvedSrc) &&
            !resolvedSrc.startsWith('data:') &&
            !resolvedSrc.startsWith('idb://') &&
            !/^https?:\/\//i.test(resolvedSrc);
          const isTextDoc =
            !isPdf &&
            (isInlinePlainText ||
              normalizedMime.startsWith('text/') ||
              normalizedMime === 'application/json' ||
              /\.(txt|json|md|csv)$/i.test(blk.mediaFileName || blk.titleEn || ''));
          const canCacheOffline =
            Boolean(remoteUrl) &&
            isDownloadableMediaUrl(remoteUrl, normalizedMime, blk.mediaFileName);
          const isCachedLocally = Boolean(
            resolvedMediaUrls[blk.id] ||
              resolvedSrc.startsWith('data:') ||
              isInlinePlainText
          );

          return (
            <div
              key={blk.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Paperclip className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p
                    dir="ltr"
                    className="text-xs font-extrabold text-slate-900 dark:text-white truncate text-left"
                  >
                    {blk.mediaFileName || blk.titleEn || 'Attached Medical Document'}
                  </p>
                  <p className="text-[11px] text-slate-500 break-words">
                    {blk.titleAr || normalizedMime} ·{' '}
                    {blk.mediaSizeBytes
                      ? formatBytesLabel(blk.mediaSizeBytes)
                      : blk.text || (isCachedLocally ? 'محفوظ أوفلاين' : 'رابط خارجي')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {isPdf && resolvedSrc && (
                  <button
                    type="button"
                    onClick={() =>
                      setInlinePdfModal({
                        url: resolvedSrc,
                        title: blk.mediaFileName || blk.titleEn || 'PDF Viewer',
                        mimeType: normalizedMime || 'application/pdf'
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <span>معاينة PDF</span>
                  </button>
                )}
                {isTextDoc && resolvedSrc && (
                  <button
                    type="button"
                    onClick={() => void handlePreviewTextAttachment(blk, resolvedSrc)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة النص</span>
                  </button>
                )}
                {canCacheOffline && !isCachedLocally && (
                  <button
                    type="button"
                    disabled={downloadingBlockId === blk.id}
                    onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {downloadingBlockId === blk.id ? 'جاري التنزيل...' : 'حفظ أوفلاين'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDownloadInlineAttachment(blk)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenInExternalApp(blk, resolvedSrc)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>تطبيق خارجي</span>
                </button>
              </div>
            </div>
          );
        }

        if (blk.type === 'question' && blk.inlineQuestion) {
          const iq = blk.inlineQuestion;
          const chosenKey = inlineQuizAnswers[blk.id] || '';
          const isCorrect =
            chosenKey && iq.correctOptionKeys.includes(chosenKey.toUpperCase());

          return (
            <div
              key={blk.id}
              className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/30 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                <span dir="ltr">Inline Self-Check Question</span>
                <span>سؤال تحقق ذاتي مدمج بالشرح</span>
              </div>
              <p
                dir="ltr"
                className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white text-left"
              >
                {iq.questionEn}
              </p>
              <div className="space-y-1.5">
                {iq.options.map((opt) => {
                  const selected = chosenKey === opt.key;
                  const right = iq.correctOptionKeys.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setInlineQuizAnswers((prev) => ({
                          ...prev,
                          [blk.id]: opt.key
                        }))
                      }
                      className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-bold flex items-center justify-between ${
                        chosenKey
                          ? right
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                            : selected
                              ? 'bg-rose-500/15 border-rose-500 text-rose-900 dark:text-rose-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500'
                      }`}
                    >
                      <span dir="ltr">
                        {opt.key}) {opt.textEn}
                      </span>
                      {chosenKey && right && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      {chosenKey && selected && !right && (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              {chosenKey && (
                <p
                  dir="ltr"
                  className={`text-xs p-2.5 rounded-xl ${
                    isCorrect
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {iq.explanationEn}
                </p>
              )}
            </div>
          );
        }

        if (blk.type === 'diagram') {
          const remoteUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const resolvedUrlForBlock = resolvedMediaUrls[blk.id] || '';
          const rawSvg = blk.diagramSvg
            ? sanitizeSvgMarkup(blk.diagramSvg)
            : extractInlineSvgFromDataUrl(resolvedUrlForBlock);
          const imgSrc =
            resolvedUrlForBlock ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteUrl;
          const svgDataUri = rawSvg
            ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawSvg)}`
            : '';
          const isCachedLocally = Boolean(
            rawSvg || resolvedUrlForBlock || (imgSrc && imgSrc.startsWith('data:'))
          );

          return (
            <figure
              key={blk.id}
              className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 my-2 max-w-full"
            >
              {(blk.titleEn || blk.titleAr) && (
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {blk.titleEn || 'Medical Diagram'}
                  </span>
                  {blk.titleAr && (
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {blk.titleAr}
                    </span>
                  )}
                </div>
              )}

              {rawSvg ? (
                <div
                  onClick={() =>
                    setZoomedImage({
                      src: svgDataUri,
                      caption: blk.captionEn || blk.captionAr || blk.titleAr || blk.titleEn || ''
                    })
                  }
                  className="p-3 bg-white dark:bg-slate-950 flex justify-center overflow-x-auto cursor-zoom-in [&>svg]:max-w-full [&>svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: rawSvg }}
                />
              ) : imgSrc && !failedBlockImages[blk.id] ? (
                <img
                  src={imgSrc}
                  alt={blk.captionEn || blk.titleEn || 'Medical diagram'}
                  referrerPolicy="no-referrer"
                  onClick={() =>
                    setZoomedImage({
                      src: imgSrc,
                      caption: blk.captionEn || blk.captionAr || blk.titleAr || ''
                    })
                  }
                  onError={() => {
                    setFailedBlockImages((prev) => ({ ...prev, [blk.id]: true }));
                  }}
                  className="w-full max-w-full h-auto max-h-[420px] object-contain mx-auto bg-white dark:bg-slate-900 p-2 cursor-zoom-in"
                />
              ) : (
                <div className="p-4 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line text-center space-y-2">
                  <p>{blk.text || blk.captionAr || blk.captionEn || 'تعذر عرض المخطط من الرابط'}</p>
                  {failedBlockImages[blk.id] && (
                    <button
                      type="button"
                      onClick={() =>
                        setFailedBlockImages((prev) => {
                          const copy = { ...prev };
                          delete copy[blk.id];
                          return copy;
                        })
                      }
                      className="min-h-[34px] px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>إعادة المحاولة</span>
                    </button>
                  )}
                </div>
              )}

              <figcaption className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-300 break-words">
                  {blk.captionAr || blk.captionEn || blk.text || 'مخطط علمي'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {remoteUrl && !isCachedLocally && (
                    <button
                      type="button"
                      disabled={downloadingBlockId === blk.id}
                      onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                      className="min-h-[36px] px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{downloadingBlockId === blk.id ? 'تنزيل...' : 'حفظ أوفلاين'}</span>
                    </button>
                  )}
                  {(svgDataUri || imgSrc) && (
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImage({
                          src: svgDataUri || imgSrc,
                          caption: blk.captionAr || blk.captionEn || blk.titleEn || ''
                        })
                      }
                      className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-bold whitespace-nowrap shrink-0"
                    >
                      تكبير
                    </button>
                  )}
                </div>
              </figcaption>
            </figure>
          );
        }

        if (blk.type === 'pdf_viewer') {
          const remoteUrl =
            blk.externalUrl ||
            (blk.mediaUrl && /^https?:\/\//i.test(blk.mediaUrl) ? blk.mediaUrl : '');
          const resolvedSrc =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            remoteUrl;
          const isCachedLocally = Boolean(
            resolvedMediaUrls[blk.id] || resolvedSrc.startsWith('data:')
          );

          return (
            <div
              key={blk.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                    {blk.titleAr || blk.titleEn || blk.mediaFileName || 'ملف PDF'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums break-words">
                    {blk.mediaFileName || 'PDF'} ·{' '}
                    {blk.mediaSizeBytes
                      ? formatBytesLabel(blk.mediaSizeBytes)
                      : blk.text || (isCachedLocally ? 'متاح أوفلاين' : 'رابط سحابي')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {resolvedSrc && (
                  <button
                    type="button"
                    onClick={() =>
                      setInlinePdfModal({
                        url: resolvedSrc,
                        title: blk.titleAr || blk.titleEn || blk.mediaFileName || 'PDF',
                        mimeType: blk.mediaMimeType || 'application/pdf'
                      })
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-extrabold whitespace-nowrap shrink-0"
                  >
                    معاينة PDF
                  </button>
                )}
                {remoteUrl && !isCachedLocally && (
                  <button
                    type="button"
                    disabled={downloadingBlockId === blk.id}
                    onClick={() => void handleCacheExternalMediaOffline(blk, remoteUrl)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingBlockId === blk.id ? 'تنزيل...' : 'حفظ أوفلاين'}</span>
                  </button>
                )}
                {resolvedSrc && (
                  <button
                    type="button"
                    onClick={() => void handleOpenInExternalApp(blk, resolvedSrc)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح</span>
                  </button>
                )}
              </div>
            </div>
          );
        }

        if (blk.type === 'book_reference') {
          const matchedBook = blk.bookId
            ? loadAcademicBooks().find((b) => b.id === blk.bookId)
            : undefined;
          const bookTitle =
            blk.titleAr ||
            matchedBook?.titleAr ||
            blk.titleEn ||
            matchedBook?.titleEn ||
            'مرجع كتاب طبي';
          const bookPdfUrl =
            resolvedMediaUrls[blk.id] ||
            (blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') ? blk.mediaUrl : '') ||
            blk.externalUrl ||
            matchedBook?.pdfUrl ||
            matchedBook?.mediaUrl ||
            matchedBook?.externalUrl ||
            '';

          const handleOpenBook = async () => {
            if (matchedBook?.mediaIdbKey) {
              const rec = await getLocalMediaRecord(matchedBook.mediaIdbKey);
              if (rec?.dataUrl) {
                setInlinePdfModal({
                  url: rec.dataUrl,
                  title: bookTitle,
                  mimeType: rec.mimeType || 'application/pdf'
                });
                return;
              }
            }
            if (bookPdfUrl) {
              setInlinePdfModal({
                url: bookPdfUrl,
                title: bookTitle,
                mimeType: 'application/pdf'
              });
              return;
            }
            showToast('المرجع غير مرتبط بملف PDF قابل للعرض محلياً بعد', 'info');
          };

          return (
            <div
              key={blk.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white break-words">
                    {bookTitle}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                    {blk.text || blk.captionAr || blk.captionEn || (matchedBook ? `${matchedBook.authors?.join('، ') || 'مرجع أكاديمي'} · ${(matchedBook.fileFormat || 'pdf').toUpperCase()}` : blk.bookId || 'مرجع علمي')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleOpenBook()}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold whitespace-nowrap shrink-0"
                >
                  فتح الكتاب
                </button>
                {bookPdfUrl && /^https?:\/\//i.test(bookPdfUrl) && !resolvedMediaUrls[blk.id] && (
                  <button
                    type="button"
                    disabled={downloadingBlockId === blk.id}
                    onClick={() => void handleCacheExternalMediaOffline(blk, bookPdfUrl)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingBlockId === blk.id ? 'تنزيل...' : 'أوفلاين'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        }

        if (blk.type === 'exam_link') {
          const matchedExam = blk.examId
            ? loadAcademicExams().find((ex) => ex.id === blk.examId)
            : undefined;
          const examTitle =
            blk.titleAr ||
            matchedExam?.titleAr ||
            blk.titleEn ||
            matchedExam?.titleEn ||
            'اختبار التقييم الذاتي';
          const qCount = matchedExam?.questionIds?.length || matchedExam?.questions?.length;

          return (
            <div
              key={blk.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white break-words">
                    {examTitle}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                    {blk.text ||
                      (matchedExam
                        ? `${qCount || 0} سؤال · ${matchedExam.durationMinutes || 15} دقيقة`
                        : 'اختبار تدريبي مرتبط بالموضوع')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onOpenExamOrQuiz) {
                    onOpenExamOrQuiz(blk.examId, topicId);
                  } else {
                    showToast('يمكنك فتح الاختبار من شريط الاختبارات بالأعلى', 'info');
                  }
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold whitespace-nowrap shrink-0"
              >
                بدء الاختبار
              </button>
            </div>
          );
        }

        return (
          <div
            key={blk.id}
            className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
          >
            {(blk.titleEn || blk.titleAr) && (
              <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                {blk.titleAr || blk.titleEn}
              </p>
            )}
            {blk.text && (
              <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">
                {blk.text}
              </p>
            )}
          </div>
        );
      })}

      {/* Image Zoom Lightbox Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full space-y-3 text-center"
          >
            <img
              src={zoomedImage.src}
              alt={zoomedImage.caption || 'Zoomed image'}
              className="max-h-[78dvh] w-auto mx-auto rounded-2xl object-contain bg-slate-950"
            />
            <div className="flex items-center justify-center gap-3">
              {zoomedImage.caption && (
                <span className="text-xs text-slate-200 font-bold">
                  {zoomedImage.caption}
                </span>
              )}
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="px-4 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-extrabold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline PDF Viewer Modal */}
      {inlinePdfModal && (
        <div
          onClick={() => setInlinePdfModal(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[85dvh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span
                dir="ltr"
                className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate"
              >
                {inlinePdfModal.title}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const r = openMediaInExternalApp(
                      inlinePdfModal.url,
                      inlinePdfModal.title,
                      inlinePdfModal.mimeType || 'application/pdf'
                    );
                    showToast(r.messageAr);
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في تطبيق خارجي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInlinePdfModal(null)}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <iframe
              src={inlinePdfModal.url}
              title={inlinePdfModal.title}
              className="w-full flex-1 border-0 bg-slate-100 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {/* Inline Text / Study Sheet Viewer Modal */}
      {inlineTextModal && (
        <div
          onClick={() => setInlineTextModal(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[85dvh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span
                dir="ltr"
                className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate"
              >
                {inlineTextModal.title}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    void prepareAndDownloadFile({
                      filename: inlineTextModal.fileName,
                      content: inlineTextModal.content,
                      mime:
                        inlineTextModal.mimeType === 'application/octet-stream'
                          ? 'text/plain;charset=utf-8'
                          : `${inlineTextModal.mimeType};charset=utf-8`
                    }).then((r) => {
                      if (r.initiated) showToast(r.messageAr, 'success');
                    });
                  }}
                  className="min-h-[36px] px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInlineTextModal(null)}
                  className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <pre
              dir="auto"
              className="p-4 sm:p-5 overflow-y-auto text-xs sm:text-sm leading-relaxed font-sans whitespace-pre-wrap text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950"
            >
              {inlineTextModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. REORDERABLE CONTENT BLOCKS EDITOR (Supports all 10 ContentBlock types)
// ============================================================================

interface SectionContentBlocksEditorProps {
  topicId?: string;
  sectionId: string;
  blocks: TopicContentBlock[];
  onChangeBlocks: (nextBlocks: TopicContentBlock[]) => void;
  showToast: (msg: string, type?: string) => void;
}

export const SectionContentBlocksEditor: React.FC<
  SectionContentBlocksEditorProps
> = ({ topicId, sectionId, blocks, onChangeBlocks, showToast }) => {
  const [showAddBlockPicker, setShowAddBlockPicker] = useState<boolean>(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [activeUploadBlockId, setActiveUploadBlockId] = useState<string | null>(
    null
  );

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const updateBlockById = (
    blockId: string,
    patch: Partial<TopicContentBlock>
  ) => {
    const updated = sortedBlocks.map((b) =>
      b.id === blockId ? { ...b, ...patch } : b
    );
    onChangeBlocks(updated);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sortedBlocks.length) return;
    const copy = [...sortedBlocks];
    const [removed] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, removed);
    const reordered = copy.map((b, i) => ({ ...b, order: i + 1 }));
    onChangeBlocks(reordered);
  };

  const deleteBlock = (blockId: string) => {
    const target = sortedBlocks.find((b) => b.id === blockId);
    if (target?.mediaIdbKey) {
      void deleteLocalMediaRecord(target.mediaIdbKey);
    }
    const filtered = sortedBlocks
      .filter((b) => b.id !== blockId)
      .map((b, i) => ({ ...b, order: i + 1 }));
    onChangeBlocks(filtered);
  };

  const addNewContentBlock = (type: ContentBlockType) => {
    const newId = `cblk-${sectionId}-${Date.now()}`;
    const nextOrder = sortedBlocks.length + 1;
    let newBlock: TopicContentBlock = {
      id: newId,
      type,
      order: nextOrder
    };

    if (type === 'heading') {
      newBlock = {
        ...newBlock,
        titleEn: 'New Academic Subheading',
        titleAr: 'عنوان فرعي جديد'
      };
    } else if (type === 'paragraph') {
      newBlock = {
        ...newBlock,
        text: ''
      };
    } else if (type === 'clinical_note') {
      newBlock = {
        ...newBlock,
        titleEn: 'Clinical Correlation & High-Yield Note',
        titleAr: 'ملاحظة سريرية وامتحانية هامة',
        text: '',
        noteSeverity: 'high-yield'
      };
    } else if (type === 'table') {
      newBlock = {
        ...newBlock,
        titleEn: 'Diagnostic Comparison Table',
        titleAr: 'جدول مقارنة تشخيصي',
        tableHeaders: ['Feature / Parameter', 'Condition A', 'Condition B'],
        tableRows: [
          ['Key Morphology', '', ''],
          ['Diagnostic Test', '', '']
        ]
      };
    } else if (type === 'image') {
      newBlock = {
        ...newBlock,
        mediaUrl: '',
        captionEn: '',
        captionAr: ''
      };
    } else if (type === 'video' || type === 'video_link') {
      newBlock = {
        ...newBlock,
        titleEn: '',
        titleAr: '',
        externalUrl: '',
        mediaUrl: ''
      };
    } else if (type === 'audio') {
      newBlock = {
        ...newBlock,
        titleEn: 'Clinical Audio / Voice Recording',
        titleAr: 'تسجيل صوتي للشرح الطبي',
        mediaUrl: '',
        externalUrl: ''
      };
    } else if (type === 'attachment') {
      newBlock = {
        ...newBlock,
        titleEn: '',
        mediaFileName: '',
        mediaUrl: '',
        externalUrl: ''
      };
    } else if (type === 'question') {
      const inlineQ: UnifiedQuizQuestion = {
        id: `inl-q-${Date.now()}`,
        type: 'single_choice',
        questionEn: '',
        options: [
          { key: 'A', textEn: '' },
          { key: 'B', textEn: '' },
          { key: 'C', textEn: '' },
          { key: 'D', textEn: '' }
        ],
        correctOptionKeys: ['A'],
        explanationEn: '',
        linkedTermIds: [],
        createdAt: new Date().toISOString()
      };
      newBlock = {
        ...newBlock,
        inlineQuestion: inlineQ
      };
    } else if (type === 'diagram') {
      newBlock = {
        ...newBlock,
        titleEn: 'Medical Concept Diagram',
        titleAr: 'مخطط توضيحي للمفاهيم',
        diagramSvg: '',
        captionAr: '',
        externalUrl: ''
      };
    } else if (type === 'pdf_viewer') {
      newBlock = {
        ...newBlock,
        titleEn: 'Reference PDF Viewer',
        titleAr: 'عرض ملف PDF مرجعي',
        externalUrl: '',
        mediaFileName: 'reference.pdf'
      };
    } else if (type === 'book_reference') {
      newBlock = {
        ...newBlock,
        titleEn: 'Academic Textbook Chapter',
        titleAr: 'مرجع من كتاب أكاديمي',
        bookId: '',
        externalUrl: '',
        text: 'الفصل الأول · الصفحات 1-18'
      };
    } else if (type === 'exam_link') {
      newBlock = {
        ...newBlock,
        titleEn: 'Topic Assessment Exam',
        titleAr: 'اختبار تقييم الموضوع',
        examId: '',
        text: 'اختبار شامل لأسئلة هذا الموضوع'
      };
    }

    onChangeBlocks([...sortedBlocks, newBlock]);
    setShowAddBlockPicker(false);
  };

  const handleUploadInlineImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadBlockId) return;
    const prevBlock = sortedBlocks.find((b) => b.id === activeUploadBlockId);
    const prevKey = prevBlock?.mediaIdbKey;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `img-${activeUploadBlockId}-${Date.now()}`;
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId: activeUploadBlockId,
        mediaType: 'image',
        fileName: file.name,
        mimeType: file.type || 'image/png',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });
      if (!saved.success || !saved.verifiedInIdb) {
        showToast(saved.errorAr || 'حجم الصورة كبير جداً أو تعذر الحفظ في IndexedDB', 'info');
        return;
      }
      if (prevKey && prevKey !== idbKey) {
        void deleteLocalMediaRecord(prevKey);
      }
      updateBlockById(activeUploadBlockId, {
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaFileName: file.name,
        mediaMimeType: file.type || 'image/png',
        mediaSizeBytes: file.size,
        captionEn: file.name.replace(/\.[^/.]+$/, '')
      });
      showToast(`تم حفظ الصورة "${file.name}" في IndexedDB وإدراجها داخل الشرح`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadInlineVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadBlockId) return;
    const prevBlock = sortedBlocks.find((b) => b.id === activeUploadBlockId);
    const prevKey = prevBlock?.mediaIdbKey;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `vid-${activeUploadBlockId}-${Date.now()}`;
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId: activeUploadBlockId,
        mediaType: 'video_file',
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });
      if (!saved.success || !saved.verifiedInIdb) {
        showToast(saved.errorAr || 'حجم الفيديو يتجاوز الحد المسموح أو تعذر الحفظ محلياً', 'info');
        return;
      }
      if (prevKey && prevKey !== idbKey) {
        void deleteLocalMediaRecord(prevKey);
      }
      updateBlockById(activeUploadBlockId, {
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaFileName: file.name,
        mediaMimeType: file.type || 'video/mp4',
        mediaSizeBytes: file.size,
        titleEn: prevBlock?.titleEn || file.name,
        text: formatBytesLabel(file.size)
      });
      showToast(`تم رفع الفيديو "${file.name}" (${formatBytesLabel(file.size)}) وحفظه محلياً`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadInlineAttachment = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadBlockId) return;
    const prevBlock = sortedBlocks.find((b) => b.id === activeUploadBlockId);
    const prevKey = prevBlock?.mediaIdbKey;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `att-${activeUploadBlockId}-${Date.now()}`;
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId: activeUploadBlockId,
        mediaType: 'pdf_document',
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });
      if (!saved.success || !saved.verifiedInIdb) {
        showToast(saved.errorAr || 'حجم الملف يتجاوز الحد الآمن أو تعذر الحفظ في IndexedDB', 'info');
        return;
      }
      if (prevKey && prevKey !== idbKey) {
        void deleteLocalMediaRecord(prevKey);
      }
      updateBlockById(activeUploadBlockId, {
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaFileName: file.name,
        mediaMimeType: file.type || 'application/pdf',
        mediaSizeBytes: file.size,
        titleEn: file.name,
        text: formatBytesLabel(file.size)
      });
      showToast(`تم حفظ وإرفاق الملف "${file.name}" (${formatBytesLabel(file.size)}) في هذا القسم`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadInlineImage}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleUploadInlineVideo}
        className="hidden"
      />
      <input
        ref={attachmentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,application/pdf"
        onChange={handleUploadInlineAttachment}
        className="hidden"
      />

      {sortedBlocks.map((blk, idx) => {
        const meta = CONTENT_BLOCK_TYPE_META[blk.type] || CONTENT_BLOCK_TYPE_META.paragraph;
        const IconComp = meta.icon;

        return (
          <div
            key={blk.id}
            className="w-full max-w-full min-w-0 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 box-border"
          >
            {/* Block Header & Reorder Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300 min-w-0">
                <IconComp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="break-words">
                  #{idx + 1} · {meta.labelEn} ({meta.labelAr})
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveBlock(idx, 'up')}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
                  title="نقل للأعلى"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === sortedBlocks.length - 1}
                  onClick={() => moveBlock(idx, 'down')}
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
                  title="نقل للأسفل"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteBlock(blk.id)}
                  className="min-h-[40px] min-w-[40px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                  title="حذف هذه الكتلة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Type-Specific Editor Fields */}
            {blk.type === 'heading' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  dir="ltr"
                  value={blk.titleEn || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { titleEn: e.target.value })
                  }
                  placeholder="English Subheading (Primary)..."
                  className="w-full min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
                <input
                  type="text"
                  value={blk.titleAr || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { titleAr: e.target.value })
                  }
                  placeholder="الترجمة العربية للعنوان الفرعي..."
                  className="w-full min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {(blk.type === 'paragraph' || blk.type === 'clinical_note') && (
              <div className="space-y-2">
                {blk.type === 'clinical_note' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={blk.titleEn || ''}
                      onChange={(e) =>
                        updateBlockById(blk.id, { titleEn: e.target.value })
                      }
                      placeholder="Clinical Note Title (EN)..."
                      className="w-full min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    />
                    <input
                      type="text"
                      value={blk.titleAr || ''}
                      onChange={(e) =>
                        updateBlockById(blk.id, { titleAr: e.target.value })
                      }
                      placeholder="عنوان الملاحظة السريرية (عربي)..."
                      className="w-full min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                )}
                <textarea
                  rows={4}
                  dir="auto"
                  value={blk.text || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { text: e.target.value })
                  }
                  placeholder="اكتب الشرح العلمي هنا (المصطلحات الإنجليزية ستُربط تلقائياً بالقاموس)..."
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
                />
              </div>
            )}

            {blk.type === 'table' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.titleEn || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { titleEn: e.target.value })
                    }
                    placeholder="Table Title (English)..."
                    className="w-full min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { titleAr: e.target.value })
                    }
                    placeholder="عنوان الجدول بالعربية..."
                    className="w-full min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block">
                    عناوين الأعمدة (افصل بين الأعمدة بعلامة | ):
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={(blk.tableHeaders || []).join(' | ')}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        tableHeaders: e.target.value.split('|').map((s) => s.trim())
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block">
                    صفوف الجدول (كل سطر يمثل صفاً، وافصل الخلايا بعلامة | ):
                  </label>
                  <textarea
                    rows={4}
                    dir="ltr"
                    value={(blk.tableRows || [])
                      .map((r) => r.join(' | '))
                      .join('\n')}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        tableRows: e.target.value
                          .split('\n')
                          .map((line) => line.split('|').map((c) => c.trim()))
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {blk.type === 'image' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadBlockId(blk.id);
                      imageInputRef.current?.click();
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع صورة من الهاتف</span>
                  </button>
                  <input
                    type="text"
                    dir="ltr"
                    value={
                      blk.externalUrl ||
                      (blk.mediaUrl && !blk.mediaUrl.startsWith('data:') && !blk.mediaUrl.startsWith('idb://')
                        ? blk.mediaUrl
                        : '')
                    }
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        externalUrl: e.target.value,
                        mediaUrl: e.target.value
                      })
                    }
                    placeholder="أو الصق رابط الصورة المباشر (https://...)"
                    className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <input
                  type="text"
                  dir="auto"
                  value={blk.captionEn || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      captionEn: e.target.value,
                      captionAr: e.target.value
                    })
                  }
                  placeholder="وصف الشكل أو الصورة التوضيحية..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                {blk.mediaUrl && !blk.mediaUrl.startsWith('idb://') && (
                  <img
                    src={blk.mediaUrl}
                    alt={blk.captionEn || 'Preview'}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-40 rounded-xl object-contain border border-slate-200 dark:border-slate-800"
                  />
                )}
              </div>
            )}

            {(blk.type === 'video' || blk.type === 'video_link') && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadBlockId(blk.id);
                      videoInputRef.current?.click();
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع فيديو من الهاتف</span>
                  </button>
                  <input
                    type="url"
                    dir="ltr"
                    value={blk.externalUrl || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { externalUrl: e.target.value })
                    }
                    placeholder="أو الصق رابط فيديو (YouTube / Drive / MP4 https://...)"
                    className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.titleEn || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { titleEn: e.target.value })
                    }
                    placeholder="Video Title (EN)..."
                    className="w-full min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        titleAr: e.target.value,
                        text: e.target.value
                      })
                    }
                    placeholder="وصف مختصر بالعربية..."
                    className="w-full min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                {blk.mediaFileName && (
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    تم إرفاق ملف الفيديو: {blk.mediaFileName} ({blk.text})
                  </p>
                )}
              </div>
            )}

            {blk.type === 'audio' && (
              <div className="space-y-2">
                <VoiceRecorderBlock
                  topicId={topicId}
                  sectionId={sectionId}
                  blockId={blk.id}
                  initialAudioUrl={blk.mediaUrl}
                  initialMediaIdbKey={blk.mediaIdbKey}
                  initialDurationSeconds={blk.mediaDurationSeconds}
                  initialTitleEn={blk.titleEn}
                  initialTitleAr={blk.titleAr}
                  readOnly={false}
                  onChange={(updated) => updateBlockById(blk.id, updated)}
                  showToast={showToast}
                />
                <input
                  type="url"
                  dir="ltr"
                  value={blk.externalUrl || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      externalUrl: e.target.value,
                      mediaUrl: e.target.value || blk.mediaUrl
                    })
                  }
                  placeholder="أو الصق رابط ملف صوتي خارجي (MP3 / WAV / M4A https://...)"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'attachment' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadBlockId(blk.id);
                      attachmentInputRef.current?.click();
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف PDF أو مستند من الهاتف</span>
                  </button>
                  <input
                    type="url"
                    dir="ltr"
                    value={blk.externalUrl || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        externalUrl: e.target.value,
                        mediaUrl: e.target.value || blk.mediaUrl
                      })
                    }
                    placeholder="أو الصق رابط ملف PDF خارجي (https://...)"
                    className="w-full sm:w-auto sm:flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <input
                  type="text"
                  dir="auto"
                  value={blk.titleEn || blk.mediaFileName || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      titleEn: e.target.value,
                      mediaFileName: e.target.value
                    })
                  }
                  placeholder="اسم الملف أو عنوان المرجع (PDF Title)..."
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                {blk.mediaFileName && (
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    تم إرفاق: {blk.mediaFileName} {blk.text ? `(${blk.text})` : ''}
                  </span>
                )}
              </div>
            )}

            {blk.type === 'question' && blk.inlineQuestion && (
              <div className="space-y-2">
                <input
                  type="text"
                  dir="ltr"
                  value={blk.inlineQuestion.questionEn}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      inlineQuestion: {
                        ...blk.inlineQuestion!,
                        questionEn: e.target.value
                      }
                    })
                  }
                  placeholder="Inline Question Stem (English)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {blk.inlineQuestion.options.map((opt, oIdx) => {
                    const isRight = blk.inlineQuestion!.correctOptionKeys.includes(
                      opt.key
                    );
                    return (
                      <div key={opt.key} className="flex items-center gap-1.5 min-w-0 w-full">
                        <button
                          type="button"
                          onClick={() =>
                            updateBlockById(blk.id, {
                              inlineQuestion: {
                                ...blk.inlineQuestion!,
                                correctOptionKeys: [opt.key]
                              }
                            })
                          }
                          className={`min-h-[44px] min-w-[44px] rounded-xl font-mono text-xs font-bold border shrink-0 ${
                            isRight
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {opt.key}
                        </button>
                        <input
                          type="text"
                          dir="ltr"
                          value={opt.textEn}
                          onChange={(e) => {
                            const val = e.target.value;
                            const nextOpts = blk.inlineQuestion!.options.map(
                              (item, i) =>
                                i === oIdx ? { ...item, textEn: val } : item
                            );
                            updateBlockById(blk.id, {
                              inlineQuestion: {
                                ...blk.inlineQuestion!,
                                options: nextOpts
                              }
                            });
                          }}
                          placeholder={`Option ${opt.key}...`}
                          className="flex-1 min-w-0 w-full min-h-[44px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={blk.inlineQuestion.explanationEn}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      inlineQuestion: {
                        ...blk.inlineQuestion!,
                        explanationEn: e.target.value
                      }
                    })
                  }
                  placeholder="Explanation of the correct answer..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'diagram' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.titleEn || ''}
                    onChange={(e) => updateBlockById(blk.id, { titleEn: e.target.value })}
                    placeholder="Diagram Title (EN)..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) => updateBlockById(blk.id, { titleAr: e.target.value })}
                    placeholder="عنوان المخطط بالعربية..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <textarea
                  rows={3}
                  dir="ltr"
                  value={blk.diagramSvg || ''}
                  onChange={(e) => updateBlockById(blk.id, { diagramSvg: e.target.value })}
                  placeholder="<svg viewBox='0 0 400 200'>...</svg> أو اتركه فارغاً لاستخدام رابط الصورة"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="url"
                  dir="ltr"
                  value={blk.externalUrl || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      externalUrl: e.target.value,
                      mediaUrl: e.target.value
                    })
                  }
                  placeholder="أو رابط صورة المخطط (https://...)"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'pdf_viewer' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) => updateBlockById(blk.id, { titleAr: e.target.value })}
                    placeholder="عنوان ملف PDF بالعربية..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.mediaFileName || ''}
                    onChange={(e) => updateBlockById(blk.id, { mediaFileName: e.target.value })}
                    placeholder="filename.pdf"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
                <input
                  type="url"
                  dir="ltr"
                  value={blk.externalUrl || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      externalUrl: e.target.value,
                      mediaUrl: e.target.value
                    })
                  }
                  placeholder="رابط ملف PDF المباشر (https://...pdf)"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'book_reference' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) => updateBlockById(blk.id, { titleAr: e.target.value })}
                    placeholder="اسم الكتاب أو الفصل..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.bookId || ''}
                    onChange={(e) => updateBlockById(blk.id, { bookId: e.target.value })}
                    placeholder="bookId (e.g. book-robbins-heme)"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
                <input
                  type="url"
                  dir="ltr"
                  value={blk.externalUrl || ''}
                  onChange={(e) => updateBlockById(blk.id, { externalUrl: e.target.value })}
                  placeholder="رابط PDF الكتاب (اختياري https://...)"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'exam_link' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) => updateBlockById(blk.id, { titleAr: e.target.value })}
                    placeholder="عنوان الاختبار المرتبط..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.examId || ''}
                    onChange={(e) => updateBlockById(blk.id, { examId: e.target.value })}
                    placeholder="examId (e.g. exam-heme-01)"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
                <input
                  type="text"
                  value={blk.text || ''}
                  onChange={(e) => updateBlockById(blk.id, { text: e.target.value })}
                  placeholder="وصف مختصر للاختبار..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add Content Block Trigger & Bottom Sheet Picker */}
      <div className="pt-1">
        {!showAddBlockPicker ? (
          <button
            type="button"
            onClick={() => setShowAddBlockPicker(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عنصر محتوى جديد في هذا القسم (صورة، جدول، صوت، PDF، سؤال...)</span>
          </button>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold">
                اختر نوع العنصر لإدراجه في هذا الموضع:
              </span>
              <button
                type="button"
                onClick={() => setShowAddBlockPicker(false)}
                className="text-xs text-slate-500 font-bold"
              >
                إغلاق
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(CONTENT_BLOCK_TYPE_META) as ContentBlockType[]).map(
                (bType) => {
                  const meta = CONTENT_BLOCK_TYPE_META[bType];
                  const IconComp = meta.icon;
                  return (
                    <button
                      key={bType}
                      type="button"
                      onClick={() => addNewContentBlock(bType)}
                      className="min-h-[48px] p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-right flex items-center gap-2 transition-colors"
                    >
                      <IconComp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">
                          {meta.labelAr}
                        </p>
                        <p dir="ltr" className="text-[10px] text-slate-500 truncate">
                          {meta.labelEn}
                        </p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
