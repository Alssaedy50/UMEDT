import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  LocalMediaRecord,
  AcademicBookResource,
  AcademicExamPackage
} from '../types/lexicon';
import {
  getAllLocalMediaRecordsMap,
  detectExternalMediaKind,
  formatBytesLabel
} from './mediaStorageService';
import {
  stripBinaryMediaFromTopicsForBackup,
  redactBotTokenFromText
} from './telegramBackupService';
import { computeDeterministicFastHashHex } from './cloudLibrarySyncService';
import { resolveTermsForTopics } from './exportDownloadService';
import { base64ToUint8Array } from '../utils/downloadHelper';

export interface StandaloneExportParams {
  scope:
    | 'single_topic'
    | 'topic'
    | 'complete_block'
    | 'block'
    | 'complete_subject'
    | 'subject';
  titleEn?: string;
  titleAr?: string;
  topic?: TopicArticle;
  block?: MedicalBlock;
  subject?: MedicalSubject;
  allSubjects?: MedicalSubject[];
  subjects?: MedicalSubject[];
  allTopics?: TopicArticle[];
  topics?: TopicArticle[];
  allTerms: DictionaryTerm[];
  allQuestions: UnifiedQuizQuestion[];
  books?: AcademicBookResource[];
  exams?: AcademicExamPackage[];
  includeLocalMedia: boolean;
  /**
   * When true, local media inside HTML will reference relative `media/<filename>` paths
   * for packaging inside a `.zip` archive alongside a `media/` folder.
   */
  useRelativeZipMediaPaths?: boolean;
  preloadedMediaMap?: Map<string, LocalMediaRecord>;
}

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSvgMarkup(rawSvg: string): string {
  const input = String(rawSvg || '').trim();
  if (!input || !/<svg[\s>]/i.test(input)) return '';
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function sanitizeZipEntryName(rawName: string, fallback: string): string {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function extractDataUrlBytes(dataUrl: string): Uint8Array | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  try {
    if (header.includes(';base64')) {
      return base64ToUint8Array(body);
    }
    return new TextEncoder().encode(decodeURIComponent(body));
  } catch {
    return null;
  }
}

function buildZipBytesFromEntries(
  entries: Array<{ name: string; data: Uint8Array }>
): Uint8Array {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  const computeCrc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of entries) {
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(file.data);
    const size = file.data.byteLength;

    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Store (0)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + size;
  }

  const centralDirSize = centralParts.reduce((s, p) => s + p.byteLength, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + eocd.byteLength;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of localParts) {
    output.set(part, pos);
    pos += part.byteLength;
  }
  for (const part of centralParts) {
    output.set(part, pos);
    pos += part.byteLength;
  }
  output.set(eocd, pos);
  return output;
}

/**
 * Inspects a ZIP byte array and returns the list of entry file names inside it.
 */
export function inspectZipEntriesList(zipBytes: Uint8Array): string[] {
  const names: string[] = [];
  const decoder = new TextDecoder('utf-8');
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );
  let pos = 0;
  while (pos + 30 <= zipBytes.byteLength) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;
    const compressedSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > zipBytes.byteLength) break;
    names.push(decoder.decode(zipBytes.subarray(nameStart, nameEnd)));
    pos = nameEnd + extraLen + compressedSize;
  }
  return names;
}

/**
 * Generates a 100% standalone, interactive HTML document for a Topic, Subject, or Block
 * that works outside UMEDT in any desktop or mobile browser.
 */
export async function generateStandaloneHtmlDocument(
  params: StandaloneExportParams
): Promise<{
  htmlString: string;
  htmlText: string;
  recordsCount: number;
  includedLocalMediaCount: number;
  collectedZipMediaEntries: Array<{ name: string; data: Uint8Array }>;
}> {
  const mediaMap = params.preloadedMediaMap || (await getAllLocalMediaRecordsMap());
  const collectedZipMediaEntries: Array<{ name: string; data: Uint8Array }> = [];
  const addedZipPaths = new Set<string>();
  let includedLocalMediaCount = 0;

  const normalizedScope =
    params.scope === 'topic'
      ? 'single_topic'
      : params.scope === 'block'
        ? 'complete_block'
        : params.scope === 'subject'
          ? 'complete_subject'
          : params.scope;

  const allSubjects = params.allSubjects || params.subjects || [];
  const allTopics = params.allTopics || params.topics || [];

  const targetTopics: TopicArticle[] =
    normalizedScope === 'single_topic'
      ? params.topic
        ? [params.topic]
        : allTopics
      : normalizedScope === 'complete_subject' && params.subject
        ? allTopics.filter((t) => t.subjectId === params.subject!.id)
        : normalizedScope === 'complete_block' && params.block
          ? (() => {
              const blockSubjIds = new Set(
                allSubjects
                  .filter((s) => s.blockId === params.block!.id)
                  .map((s) => s.id)
              );
              const filtered = allTopics.filter(
                (t) =>
                  t.blockId === params.block!.id ||
                  (t.subjectId && blockSubjIds.has(t.subjectId))
              );
              return filtered.length > 0 ? filtered : allTopics;
            })()
          : allTopics;

  const linkedTerms = resolveTermsForTopics(targetTopics, params.allTerms);
  const topicIdSet = new Set(targetTopics.map((t) => t.id));
  const referencedBookIds = new Set<string>();
  const referencedExamIds = new Set<string>();
  for (const tp of targetTopics) {
    for (const sec of tp.sections || []) {
      for (const cb of sec.contentBlocks || []) {
        if (cb.bookId) referencedBookIds.add(cb.bookId);
        if (cb.examId) referencedExamIds.add(cb.examId);
      }
    }
  }
  const linkedBooks = (params.books || []).filter(
    (bk) =>
      referencedBookIds.has(bk.id) ||
      (bk.topicIds || []).some((tid) => topicIdSet.has(tid)) ||
      (normalizedScope === 'complete_block' && params.block && bk.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' && params.subject && bk.subjectId === params.subject.id)
  );
  const linkedExams = (params.exams || []).filter(
    (ex) =>
      referencedExamIds.has(ex.id) ||
      (ex.topicIds || []).some((tid) => topicIdSet.has(tid)) ||
      (normalizedScope === 'complete_block' && params.block && ex.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' && params.subject && ex.subjectId === params.subject.id)
  );
  const linkedQuestions = params.allQuestions.filter(
    (q) =>
      (q.topicId && topicIdSet.has(q.topicId)) ||
      (normalizedScope === 'complete_block' &&
        params.block &&
        q.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' &&
        params.subject &&
        q.subjectId === params.subject.id)
  );

  const resolveMediaUrlForStandalone = (opts: {
    rawUrl?: string;
    externalUrl?: string;
    mediaIdbKey?: string;
    fileName?: string;
    fallbackExt: string;
  }): { resolvedSrc: string; externalHref: string; isOmittedLocal: boolean } => {
    const extUrl = (opts.externalUrl || '').trim();
    const raw = (opts.rawUrl || '').trim();
    const externalHref =
      extUrl.startsWith('http://') || extUrl.startsWith('https://')
        ? extUrl
        : raw.startsWith('http://') || raw.startsWith('https://')
          ? raw
          : '';

    const idbKey = raw.startsWith('idb://')
      ? raw.slice(6)
      : opts.mediaIdbKey || '';
    const hashedExternalKey = externalHref
      ? `idb-${computeDeterministicFastHashHex(externalHref).slice(0, 16)}`
      : '';
    const record =
      (idbKey ? mediaMap.get(idbKey) : undefined) ||
      (hashedExternalKey ? mediaMap.get(hashedExternalKey) : undefined);
    const resolvedKey = record?.id || idbKey || hashedExternalKey;
    const localDataUrl =
      record?.dataUrl || (raw.startsWith('data:') ? raw : '');

    if (localDataUrl) {
      if (!params.includeLocalMedia) {
        return {
          resolvedSrc: externalHref,
          externalHref,
          isOmittedLocal: !externalHref
        };
      }
      includedLocalMediaCount += 1;
      if (params.useRelativeZipMediaPaths) {
        const baseName = sanitizeZipEntryName(
          opts.fileName || record?.fileName || `${resolvedKey || 'media'}.${opts.fallbackExt}`,
          `media_${Date.now()}.${opts.fallbackExt}`
        );
        const zipEntryPath = `media/${baseName}`;
        if (!addedZipPaths.has(zipEntryPath)) {
          const bytes = extractDataUrlBytes(localDataUrl);
          if (bytes && bytes.byteLength > 0) {
            collectedZipMediaEntries.push({ name: zipEntryPath, data: bytes });
            addedZipPaths.add(zipEntryPath);
          }
        }
        return {
          resolvedSrc: zipEntryPath,
          externalHref,
          isOmittedLocal: false
        };
      }
      return {
        resolvedSrc: localDataUrl,
        externalHref,
        isOmittedLocal: false
      };
    }

    return {
      resolvedSrc: externalHref,
      externalHref,
      isOmittedLocal: false
    };
  };

  const primaryTopic = params.topic || targetTopics[0];

  const mainTitleAr =
    params.titleAr ||
    (normalizedScope === 'single_topic' && primaryTopic
      ? primaryTopic.titleAr || primaryTopic.title
      : normalizedScope === 'complete_block' && params.block
        ? params.block.titleAr || params.block.titleEn
        : params.subject
          ? params.subject.titleAr || params.subject.titleEn
          : 'محتوى UMEDT المستقل');

  const mainTitleEn =
    params.titleEn ||
    (normalizedScope === 'single_topic' && primaryTopic
      ? primaryTopic.titleEn || primaryTopic.title
      : normalizedScope === 'complete_block' && params.block
        ? params.block.titleEn
        : params.subject
          ? params.subject.titleEn
          : 'UMEDT Standalone Medical Package');

  const renderSingleTopicHtml = (topic: TopicArticle, idx: number): string => {
    const subj = allSubjects.find((s) => s.id === topic.subjectId);
    const blk = params.block || undefined;

    const sectionsHtml = (topic.sections || [])
      .map((sec, sIdx) => {
        const paragraphsHtml = (sec.paragraphs || [])
          .filter(Boolean)
          .map((p) => `<p class="para" dir="auto">${escapeHtml(p)}</p>`)
          .join('\n');

        const blocksHtml = [...(sec.contentBlocks || [])]
          .sort((a, b) => a.order - b.order)
          .map((cb) => {
            if (cb.type === 'heading') {
              return `<div class="subhead"><h4 dir="ltr">${escapeHtml(cb.titleEn || cb.text || '')}</h4>${
                cb.titleAr ? `<p class="subhead-ar">${escapeHtml(cb.titleAr)}</p>` : ''
              }</div>`;
            }
            if (cb.type === 'paragraph') {
              return `<div class="para-wrap">${
                cb.text ? `<p class="para" dir="auto">${escapeHtml(cb.text)}</p>` : ''
              }${
                cb.textAr && cb.textAr !== cb.text
                  ? `<p class="para-ar">${escapeHtml(cb.textAr)}</p>`
                  : ''
              }</div>`;
            }
            if (cb.type === 'clinical_note') {
              return `<div class="clinical-note"><div class="note-head"><span dir="ltr">${escapeHtml(
                cb.titleEn || 'Clinical Note'
              )}</span><span>${escapeHtml(cb.titleAr || 'ملاحظة سريرية')}</span></div><p dir="auto">${escapeHtml(
                cb.text || ''
              )}</p></div>`;
            }
            if (cb.type === 'table') {
              const ths = (cb.tableHeaders || [])
                .map((h) => `<th>${escapeHtml(h)}</th>`)
                .join('');
              const trs = (cb.tableRows || [])
                .map(
                  (row) =>
                    `<tr>${row.map((c) => `<td dir="auto">${escapeHtml(c)}</td>`).join('')}</tr>`
                )
                .join('');
              return `<div class="table-card"><div class="table-title"><strong dir="ltr">${escapeHtml(
                cb.titleEn || ''
              )}</strong><span>${escapeHtml(cb.titleAr || '')}</span></div><div class="table-scroll"><table dir="ltr"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div></div>`;
            }
            if (cb.type === 'image') {
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'png'
              });
              return `<figure class="media-card">${
                resolved.resolvedSrc
                  ? `<img src="${escapeHtml(resolved.resolvedSrc)}" alt="${escapeHtml(
                      cb.captionEn || cb.captionAr || 'Medical Figure'
                    )}" loading="lazy" />`
                  : `<div class="omitted-media">صورة محلية غير مضمّنة (${escapeHtml(
                      cb.mediaFileName || 'Image'
                    )})</div>`
              }<figcaption>${escapeHtml(cb.captionEn || cb.captionAr || '')}${
                resolved.externalHref
                  ? ` · <a href="${escapeHtml(
                      resolved.externalHref
                    )}" target="_blank" rel="noopener noreferrer">فتح الرابط الأصلي ↗</a>`
                  : ''
              }</figcaption></figure>`;
            }
            if (cb.type === 'video' || cb.type === 'video_link') {
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'mp4'
              });
              const targetUrl = resolved.resolvedSrc || resolved.externalHref;
              const meta = detectExternalMediaKind(
                targetUrl,
                cb.mediaMimeType,
                cb.mediaFileName
              );
              return `<div class="media-card"><div class="media-header"><strong dir="ltr">${escapeHtml(
                cb.titleEn || cb.mediaFileName || 'Medical Video'
              )}</strong><span>${escapeHtml(cb.titleAr || cb.text || '')}</span></div>${
                meta.kind === 'video_embed' && meta.embedUrl
                  ? `<iframe src="${escapeHtml(
                      meta.embedUrl
                    )}" class="video-frame" allowfullscreen loading="lazy"></iframe>`
                  : targetUrl && (meta.kind === 'video_direct' || cb.type === 'video' || targetUrl.startsWith('data:video/') || targetUrl.startsWith('media/'))
                    ? `<video controls preload="metadata" src="${escapeHtml(targetUrl)}" class="video-player"></video>`
                    : ''
              }${
                resolved.externalHref
                  ? `<div class="media-actions"><a href="${escapeHtml(
                      resolved.externalHref
                    )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح الرابط الخارجي ↗</a></div>`
                  : resolved.isOmittedLocal
                    ? `<div class="omitted-media">فيديو محلي (${escapeHtml(
                        cb.mediaFileName || 'Video'
                      )}) — لم يتم تضمين الوسائط المحلية</div>`
                    : ''
              }</div>`;
            }
            if (cb.type === 'audio') {
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'webm'
              });
              const audioSrc = resolved.resolvedSrc || resolved.externalHref;
              return `<div class="media-card"><div class="media-header"><strong dir="ltr">${escapeHtml(
                cb.titleEn || cb.mediaFileName || 'Audio Recording'
              )}</strong><span>${escapeHtml(cb.titleAr || 'ملف صوتي')}</span></div>${
                audioSrc
                  ? `<audio controls preload="metadata" src="${escapeHtml(audioSrc)}" class="audio-player"></audio>`
                  : `<div class="omitted-media">ملف صوتي محلي غير مضمّن</div>`
              }${
                resolved.externalHref
                  ? `<div class="media-actions"><a href="${escapeHtml(
                      resolved.externalHref
                    )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح الرابط الصوتي الخارجي ↗</a></div>`
                  : ''
              }</div>`;
            }
            if (cb.type === 'attachment') {
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'pdf'
              });
              const fileHref = resolved.resolvedSrc || resolved.externalHref;
              return `<div class="media-card"><div class="media-header"><strong dir="ltr">${escapeHtml(
                cb.mediaFileName || cb.titleEn || 'PDF / Document'
              )}</strong><span>${escapeHtml(
                cb.mediaSizeBytes ? formatBytesLabel(cb.mediaSizeBytes) : cb.text || 'مرفق'
              )}</span></div>${
                fileHref
                  ? `<div class="media-actions"><a href="${escapeHtml(
                      fileHref
                    )}" download="${escapeHtml(
                      cb.mediaFileName || 'document.pdf'
                    )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح / تنزيل المستند (PDF) ↗</a></div>`
                  : `<div class="omitted-media">مرفق محلي (${escapeHtml(
                      cb.mediaFileName || 'Document'
                    )})</div>`
              }</div>`;
            }
            if (cb.type === 'diagram') {
              const safeSvg = cb.diagramSvg ? sanitizeSvgMarkup(cb.diagramSvg) : '';
              if (safeSvg) {
                return `<figure class="media-card"><div class="diagram-wrap">${safeSvg}</div><figcaption>${escapeHtml(
                  cb.captionEn || cb.titleEn || cb.titleAr || ''
                )}</figcaption></figure>`;
              }
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'svg'
              });
              return `<figure class="media-card">${
                resolved.resolvedSrc
                  ? `<img src="${escapeHtml(resolved.resolvedSrc)}" alt="${escapeHtml(
                      cb.titleEn || cb.captionEn || 'Medical Diagram'
                    )}" loading="lazy" />`
                  : `<div class="omitted-media">مخطط طبي (${escapeHtml(
                      cb.titleAr || cb.titleEn || 'Diagram'
                    )})</div>`
              }<figcaption>${escapeHtml(cb.titleAr || cb.titleEn || cb.captionEn || '')}</figcaption></figure>`;
            }
            if (cb.type === 'pdf_viewer') {
              const resolved = resolveMediaUrlForStandalone({
                rawUrl: cb.mediaUrl,
                externalUrl: cb.externalUrl,
                mediaIdbKey: cb.mediaIdbKey,
                fileName: cb.mediaFileName,
                fallbackExt: 'pdf'
              });
              const pdfHref = resolved.resolvedSrc || resolved.externalHref;
              return `<div class="media-card"><div class="media-header"><strong dir="ltr">${escapeHtml(
                cb.titleEn || cb.mediaFileName || 'PDF Document'
              )}</strong><span>${escapeHtml(cb.titleAr || 'عارض PDF')}</span></div>${
                pdfHref
                  ? `<iframe src="${escapeHtml(pdfHref)}" class="video-frame" title="${escapeHtml(
                      cb.titleEn || cb.mediaFileName || 'PDF Viewer'
                    )}"></iframe><div class="media-actions"><a href="${escapeHtml(
                      pdfHref
                    )}" download="${escapeHtml(
                      cb.mediaFileName || 'document.pdf'
                    )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح / تنزيل PDF ↗</a></div>`
                  : `<div class="omitted-media">مستند PDF محلي غير مضمّن (${escapeHtml(
                      cb.mediaFileName || 'Document'
                    )})</div>`
              }</div>`;
            }
            if (cb.type === 'book_reference') {
              const refBook = (params.books || []).find((bk) => bk.id === cb.bookId);
              const resolvedBookPdf = refBook?.pdfUrl || refBook?.mediaIdbKey
                ? resolveMediaUrlForStandalone({
                    rawUrl: refBook.pdfUrl,
                    externalUrl: refBook.pdfUrl,
                    mediaIdbKey: refBook.mediaIdbKey,
                    fileName: `${refBook.id}.pdf`,
                    fallbackExt: 'pdf'
                  })
                : { resolvedSrc: cb.externalUrl || '', externalHref: cb.externalUrl || '', isOmittedLocal: false };
              const bookHref = resolvedBookPdf.resolvedSrc || resolvedBookPdf.externalHref;
              return `<div class="clinical-note"><div class="note-head"><span dir="ltr">${escapeHtml(
                refBook?.titleEn || cb.titleEn || 'Book Reference'
              )}</span><span>${escapeHtml(
                refBook?.titleAr || cb.titleAr || 'مرجع كتاب'
              )}</span></div>${
                cb.text ? `<p dir="auto">${escapeHtml(cb.text)}</p>` : ''
              }${
                bookHref
                  ? `<div class="media-actions"><a href="${escapeHtml(
                      bookHref
                    )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح الكتاب / المرجع ↗</a></div>`
                  : ''
              }</div>`;
            }
            if (cb.type === 'exam_link') {
              const refExam = (params.exams || []).find((ex) => ex.id === cb.examId);
              return `<div class="quiz-card"><div class="quiz-badge">${escapeHtml(
                refExam?.titleAr || cb.titleAr || 'اختبار مرتبط'
              )}</div><p class="quiz-stem" dir="ltr">${escapeHtml(
                refExam?.titleEn || cb.titleEn || 'Linked Clinical Exam'
              )}</p>${
                cb.text ? `<p class="para">${escapeHtml(cb.text)}</p>` : ''
              }<a href="#standalone-quizzes" class="ext-btn">الانتقال إلى الاختبار التفاعلي ↓</a></div>`;
            }
            if (cb.type === 'question' && cb.inlineQuestion) {
              const iq = cb.inlineQuestion;
              const rightKey = (iq.correctOptionKeys || ['A'])[0];
              const optsHtml = (iq.options || [])
                .map(
                  (o) =>
                    `<button type="button" class="quiz-opt" onclick="checkQuizAnswer(this, '${escapeHtml(
                      o.key
                    )}', '${escapeHtml(rightKey)}')">${escapeHtml(o.key)}) ${escapeHtml(
                      o.textEn
                    )}</button>`
                )
                .join('');
              return `<div class="quiz-card"><div class="quiz-badge">سؤال تفاعلي مدمج · Self-Check</div><p class="quiz-stem" dir="ltr">${escapeHtml(
                iq.questionEn
              )}</p><div class="quiz-opts">${optsHtml}</div><div class="quiz-exp" hidden dir="ltr">${escapeHtml(
                iq.explanationEn
              )}</div></div>`;
            }
            return '';
          })
          .join('\n');

        return `<section class="topic-section" id="sec-${escapeHtml(topic.id)}-${sIdx}">
          <div class="section-header">
            <h3 dir="ltr">${escapeHtml(sec.headingEn || sec.heading || `Section ${sIdx + 1}`)}</h3>
            ${sec.headingAr ? `<span class="section-ar">${escapeHtml(sec.headingAr)}</span>` : ''}
          </div>
          ${paragraphsHtml}
          ${blocksHtml}
        </section>`;
      })
      .join('\n');

    // Topic-level external links
    const linksHtml =
      (topic.links || []).length > 0
        ? `<div class="links-box"><h4>الروابط والمراجع الخارجية (${topic.links.length})</h4><ul>${topic.links
            .map(
              (lnk) =>
                `<li><a href="${escapeHtml(lnk.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  lnk.title || lnk.url
                )} ↗</a>${lnk.description ? ` — <span>${escapeHtml(lnk.description)}</span>` : ''}</li>`
            )
            .join('')}</ul></div>`
        : '';

    return `<article class="topic-article" id="topic-${escapeHtml(topic.id)}" data-search="${escapeHtml(
      `${topic.titleEn || ''} ${topic.titleAr || ''} ${topic.title || ''} ${topic.subtitle || ''}`.toLowerCase()
    )}">
      <header class="topic-header">
        <div class="topic-badges">
          <span class="badge">#${idx + 1}</span>
          ${blk ? `<span class="badge">${escapeHtml(blk.code)} · ${escapeHtml(blk.titleAr)}</span>` : ''}
          ${subj ? `<span class="badge">${escapeHtml(subj.code)} · ${escapeHtml(subj.titleAr)}</span>` : ''}
          <span class="badge">${topic.readingTimeMinutes || 5} دقائق قراءة</span>
        </div>
        <h2 dir="ltr" class="topic-title-en">${escapeHtml(topic.titleEn || topic.title)}</h2>
        <p class="topic-title-ar">${escapeHtml(topic.titleAr || topic.subtitle)}</p>
      </header>
      ${sectionsHtml}
      ${linksHtml}
    </article>`;
  };

  const topicsBodyHtml = targetTopics
    .map((tp, idx) => renderSingleTopicHtml(tp, idx))
    .join('\n');

  const termsGlossaryHtml = linkedTerms
    .map(
      (t) => `<div class="term-card" data-search="${escapeHtml(
        `${t.term} ${t.translation} ${t.definitionAr} ${t.definitionEn}`.toLowerCase()
      )}">
        <div class="term-top">
          <strong dir="ltr" class="term-en">${escapeHtml(t.term)}</strong>
          <span class="term-ar">${escapeHtml(t.translation)}</span>
        </div>
        <p class="term-def">${escapeHtml(t.definitionAr)}</p>
        ${
          t.definitionEn
            ? `<p class="term-def-en" dir="ltr">${escapeHtml(t.definitionEn)}</p>`
            : ''
        }
      </div>`
    )
    .join('\n');

  const questionsBankHtml = linkedQuestions
    .map((q, qIdx) => {
      const rightKey = (q.correctOptionKeys || ['A'])[0];
      const opts = (q.options || [])
        .map(
          (o) =>
            `<button type="button" class="quiz-opt" onclick="checkQuizAnswer(this, '${escapeHtml(
              o.key
            )}', '${escapeHtml(rightKey)}')">${escapeHtml(o.key)}) ${escapeHtml(o.textEn)}</button>`
        )
        .join('');
      return `<div class="quiz-card">
        <div class="quiz-badge">السؤال #${qIdx + 1}</div>
        <p class="quiz-stem" dir="ltr">${escapeHtml(q.questionEn)}</p>
        <div class="quiz-opts">${opts}</div>
        <div class="quiz-exp" hidden dir="ltr">${escapeHtml(q.explanationEn)}</div>
      </div>`;
    })
    .join('\n');

  const rawHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(mainTitleAr)} — ${escapeHtml(mainTitleEn)} | UMEDT Standalone</title>
  <style>
    :root {
      --bg: #020617;
      --surface: #0f172a;
      --surface-2: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #10b981;
      --accent-soft: rgba(16, 185, 129, 0.14);
    }
    html[data-theme="light"] {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-2: #f1f5f9;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #475569;
      --accent: #059669;
      --accent-soft: rgba(5, 150, 105, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.75;
      padding-bottom: 4rem;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0.85rem 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .brand {
      font-weight: 800;
      font-size: 1rem;
      color: var(--accent);
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .search-input {
      background: var(--surface-2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.45rem 0.85rem;
      border-radius: 0.75rem;
      font-size: 0.85rem;
      min-width: 210px;
    }
    .btn {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 0.45rem 0.85rem;
      border-radius: 0.75rem;
      font-weight: 700;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .btn.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .container {
      max-width: 960px;
      margin: 1.25rem auto;
      padding: 0 1rem;
    }
    .hero {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .hero h1 { margin: 0 0 0.35rem 0; font-size: 1.35rem; }
    .hero p { margin: 0; color: var(--muted); font-size: 0.9rem; }
    .toc {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.85rem;
    }
    .toc a {
      text-decoration: none;
      background: var(--accent-soft);
      color: var(--accent);
      padding: 0.3rem 0.7rem;
      border-radius: 0.65rem;
      font-size: 0.78rem;
      font-weight: 700;
    }
    .topic-article {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 1.25rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }
    .topic-badges { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
    .badge {
      background: var(--surface-2);
      color: var(--accent);
      padding: 0.2rem 0.6rem;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .topic-title-en { margin: 0.2rem 0; font-size: 1.25rem; text-align: left; }
    .topic-title-ar { margin: 0 0 1rem 0; color: var(--muted); font-weight: 700; }
    .topic-section {
      border-top: 1px solid var(--border);
      padding-top: 1rem;
      margin-top: 1rem;
    }
    .section-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.65rem;
    }
    .section-header h3 { margin: 0; font-size: 1.05rem; color: var(--accent); }
    .section-ar { font-size: 0.85rem; color: var(--muted); font-weight: 700; }
    .para { margin: 0.5rem 0; white-space: pre-line; font-size: 0.95rem; }
    .para-ar { margin: 0.35rem 0; color: var(--muted); font-size: 0.88rem; }
    .clinical-note {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 1rem;
      padding: 0.9rem;
      margin: 0.75rem 0;
    }
    .note-head { display: flex; justify-content: space-between; font-weight: 800; color: #f59e0b; font-size: 0.82rem; margin-bottom: 0.35rem; }
    .table-card { border: 1px solid var(--border); border-radius: 0.9rem; overflow: hidden; margin: 0.85rem 0; }
    .table-title { background: var(--surface-2); padding: 0.6rem 0.9rem; display: flex; justify-content: space-between; font-size: 0.82rem; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left; }
    th, td { padding: 0.6rem 0.75rem; border-top: 1px solid var(--border); }
    th { background: var(--surface-2); font-weight: 800; }
    .media-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 0.85rem;
      margin: 0.85rem 0;
      text-align: center;
    }
    .media-card img, .video-player { max-width: 100%; max-height: 440px; border-radius: 0.75rem; }
    .diagram-wrap { overflow-x: auto; display: flex; justify-content: center; padding: 0.5rem; background: var(--surface); border-radius: 0.75rem; }
    .diagram-wrap svg { max-width: 100%; height: auto; }
    .video-frame { width: 100%; height: 340px; border: 0; border-radius: 0.75rem; }
    .audio-player { width: 100%; margin-top: 0.5rem; }
    .media-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.84rem; }
    .ext-btn {
      display: inline-block;
      margin-top: 0.45rem;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      padding: 0.4rem 0.85rem;
      border-radius: 0.65rem;
      font-size: 0.8rem;
      font-weight: 700;
    }
    .omitted-media {
      padding: 0.75rem;
      border-radius: 0.75rem;
      border: 1px dashed var(--border);
      color: var(--muted);
      font-size: 0.82rem;
    }
    .quiz-card {
      background: var(--accent-soft);
      border: 1px solid var(--accent);
      border-radius: 1rem;
      padding: 0.95rem;
      margin: 0.85rem 0;
    }
    .quiz-badge { font-size: 0.76rem; font-weight: 800; color: var(--accent); margin-bottom: 0.35rem; }
    .quiz-stem { font-weight: 800; margin: 0.3rem 0 0.65rem 0; text-align: left; }
    .quiz-opts { display: grid; gap: 0.45rem; }
    .quiz-opt {
      text-align: left;
      direction: ltr;
      padding: 0.55rem 0.8rem;
      border-radius: 0.65rem;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
    }
    .quiz-opt.correct { background: rgba(16, 185, 129, 0.25); border-color: #10b981; }
    .quiz-opt.wrong { background: rgba(244, 63, 94, 0.25); border-color: #f43f5e; }
    .quiz-exp { margin-top: 0.65rem; padding: 0.6rem; border-radius: 0.65rem; background: var(--surface); font-size: 0.83rem; text-align: left; }
    .grid-terms { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
    .term-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1rem; padding: 0.9rem; }
    .term-top { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem; }
    .term-en { color: var(--accent); font-size: 0.95rem; }
    .term-ar { font-weight: 800; font-size: 0.9rem; }
    .term-def { margin: 0.25rem 0; font-size: 0.82rem; color: var(--text); }
    .term-def-en { margin: 0.25rem 0 0 0; font-size: 0.76rem; color: var(--muted); }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">UMEDT · عارض المحتوى الطبي المستقل</div>
    <div class="controls">
      <input type="search" id="searchInput" class="search-input" placeholder="ابحث في الشرح أو المصطلحات..." oninput="filterStandaloneContent(this.value)" />
      <button type="button" class="btn" onclick="toggleStandaloneTheme()">تبديل المظهر</button>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h1>${escapeHtml(mainTitleAr)}</h1>
      <p dir="ltr">${escapeHtml(mainTitleEn)}</p>
      <p style="margin-top:0.4rem;font-size:0.8rem;">
        المواضيع: ${targetTopics.length} · المصطلحات المرتبطة: ${linkedTerms.length} · الأسئلة التفاعلية: ${linkedQuestions.length}${
          linkedBooks.length > 0 ? ` · الكتب: ${linkedBooks.length}` : ''
        } · الوسائط المحلية: ${
          params.includeLocalMedia ? 'مضمّنة داخل الحزمة' : 'روابط ومراجع خارجية فقط'
        }
      </p>
      <nav class="toc">
        ${targetTopics
          .map(
            (tp, i) =>
              `<a href="#topic-${escapeHtml(tp.id)}">${i + 1}. ${escapeHtml(
                tp.titleAr || tp.titleEn || tp.title
              )}</a>`
          )
          .join('')}
        ${linkedTerms.length > 0 ? `<a href="#standalone-glossary">المصطلحات (${linkedTerms.length})</a>` : ''}
        ${linkedBooks.length > 0 ? `<a href="#standalone-books">الكتب (${linkedBooks.length})</a>` : ''}
        ${linkedQuestions.length > 0 ? `<a href="#standalone-quizzes">الاختبارات (${linkedQuestions.length})</a>` : ''}
      </nav>
    </section>

    <div id="topicsContainer">
      ${topicsBodyHtml}
    </div>

    ${
      linkedTerms.length > 0
        ? `<section id="standalone-glossary" class="topic-article">
            <h2>قاموس المصطلحات الطبية المرتبطة (${linkedTerms.length})</h2>
            <div class="grid-terms">${termsGlossaryHtml}</div>
          </section>`
        : ''
    }

    ${
      linkedBooks.length > 0
        ? `<section id="standalone-books" class="topic-article">
            <h2>الكتب والمراجع الأكاديمية (${linkedBooks.length})</h2>
            <div class="grid-terms">${linkedBooks
              .map((bk) => {
                const resolvedPdf = resolveMediaUrlForStandalone({
                  rawUrl: bk.pdfUrl,
                  externalUrl: bk.pdfUrl,
                  mediaIdbKey: bk.mediaIdbKey,
                  fileName: `${bk.id}.pdf`,
                  fallbackExt: 'pdf'
                });
                const bookHref = resolvedPdf.resolvedSrc || resolvedPdf.externalHref;
                return `<div class="term-card" data-search="${escapeHtml(
                  `${bk.titleEn} ${bk.titleAr} ${(bk.authors || []).join(' ')}`.toLowerCase()
                )}">
                  <div class="term-top">
                    <strong dir="ltr" class="term-en">${escapeHtml(bk.titleEn)}</strong>
                    <span class="term-ar">${escapeHtml(bk.titleAr)}</span>
                  </div>
                  <p class="term-def">${escapeHtml((bk.authors || []).join(' · ') || 'UMEDT Reference')}${
                    bk.pageCount ? ` · ${bk.pageCount} صفحة` : ''
                  }</p>
                  ${
                    bookHref
                      ? `<a href="${escapeHtml(
                          bookHref
                        )}" target="_blank" rel="noopener noreferrer" class="ext-btn">فتح الكتاب PDF ↗</a>`
                      : ''
                  }
                </div>`;
              })
              .join('\n')}</div>
          </section>`
        : ''
    }

    ${
      linkedExams.length > 0
        ? `<section id="standalone-exams" class="topic-article">
            <h2>الاختبارات المرفقة (${linkedExams.length})</h2>
            <div class="grid-terms">${linkedExams
              .map(
                (ex) => `<div class="term-card">
                  <div class="term-top">
                    <strong dir="ltr" class="term-en">${escapeHtml(ex.titleEn)}</strong>
                    <span class="term-ar">${escapeHtml(ex.titleAr)}</span>
                  </div>
                  <p class="term-def">${escapeHtml(ex.descriptionAr || '')} · ${
                    (ex.questionIds || []).length
                  } سؤال</p>
                </div>`
              )
              .join('\n')}</div>
          </section>`
        : ''
    }

    ${
      linkedQuestions.length > 0
        ? `<section id="standalone-quizzes" class="topic-article">
            <h2>بنك الأسئلة والاختبارات التفاعلية (${linkedQuestions.length})</h2>
            ${questionsBankHtml}
          </section>`
        : ''
    }
  </main>

  <script>
    function toggleStandaloneTheme() {
      var html = document.documentElement;
      var next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
    }
    function checkQuizAnswer(btn, chosenKey, correctKey) {
      var parent = btn.parentElement;
      var buttons = parent.querySelectorAll('.quiz-opt');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('correct', 'wrong');
      }
      if (chosenKey === correctKey) {
        btn.classList.add('correct');
      } else {
        btn.classList.add('wrong');
      }
      var exp = parent.parentElement.querySelector('.quiz-exp');
      if (exp) exp.hidden = false;
    }
    function filterStandaloneContent(query) {
      var q = (query || '').trim().toLowerCase();
      var items = document.querySelectorAll('[data-search]');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var hay = el.getAttribute('data-search') || '';
        el.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
      }
    }
  </script>
</body>
</html>`;

  const htmlString = redactBotTokenFromText(rawHtml);
  const recordsCount =
    targetTopics.length + linkedTerms.length + linkedQuestions.length;

  return {
    htmlString,
    htmlText: htmlString,
    recordsCount,
    includedLocalMediaCount,
    collectedZipMediaEntries
  };
}

/**
 * Generates a standalone `.zip` archive containing:
 * - `index.html`: Self-contained interactive viewer that works outside UMEDT in any browser
 * - `package-data.json` & `data.json`: Structured JSON bundle (with external URLs & metadata)
 * - `README.txt`: Instructions for opening `index.html` outside UMEDT
 * - `media/*`: Included when `includeLocalMedia === true`
 */
export async function generateStandaloneZipArchiveBytes(
  params: StandaloneExportParams
): Promise<{
  zipBytes: Uint8Array;
  recordsCount: number;
  includedMediaFilesCount: number;
  entryNames: string[];
}> {
  const { htmlString, recordsCount, collectedZipMediaEntries } =
    await generateStandaloneHtmlDocument({
      ...params,
      useRelativeZipMediaPaths: true
    });

  const normalizedScope =
    params.scope === 'topic'
      ? 'single_topic'
      : params.scope === 'block'
        ? 'complete_block'
        : params.scope === 'subject'
          ? 'complete_subject'
          : params.scope;

  const allSubjects = params.allSubjects || params.subjects || [];
  const allTopics = params.allTopics || params.topics || [];

  const targetTopics: TopicArticle[] =
    normalizedScope === 'single_topic'
      ? params.topic
        ? [params.topic]
        : allTopics
      : normalizedScope === 'complete_subject' && params.subject
        ? allTopics.filter((t) => t.subjectId === params.subject!.id)
        : normalizedScope === 'complete_block' && params.block
          ? (() => {
              const blockSubjIds = new Set(
                allSubjects
                  .filter((s) => s.blockId === params.block!.id)
                  .map((s) => s.id)
              );
              const filtered = allTopics.filter(
                (t) =>
                  t.blockId === params.block!.id ||
                  (t.subjectId && blockSubjIds.has(t.subjectId))
              );
              return filtered.length > 0 ? filtered : allTopics;
            })()
          : allTopics;

  const sanitizedTopics = stripBinaryMediaFromTopicsForBackup(targetTopics);
  const linkedTerms = resolveTermsForTopics(sanitizedTopics, params.allTerms);
  const topicIdSet = new Set(sanitizedTopics.map((t) => t.id));
  const linkedQuestions = params.allQuestions.filter(
    (q) =>
      (q.topicId && topicIdSet.has(q.topicId)) ||
      (normalizedScope === 'complete_block' &&
        params.block &&
        q.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' &&
        params.subject &&
        q.subjectId === params.subject.id)
  );

  const linkedBooks = (params.books || []).filter(
    (bk) =>
      (bk.topicIds || []).some((tid) => topicIdSet.has(tid)) ||
      (normalizedScope === 'complete_block' && params.block && bk.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' && params.subject && bk.subjectId === params.subject.id)
  );
  const linkedExams = (params.exams || []).filter(
    (ex) =>
      (ex.topicIds || []).some((tid) => topicIdSet.has(tid)) ||
      (normalizedScope === 'complete_block' && params.block && ex.blockId === params.block.id) ||
      (normalizedScope === 'complete_subject' && params.subject && ex.subjectId === params.subject.id)
  );

  const dataJsonObject = {
    format: 'umed-granular-export-v1',
    exportType:
      normalizedScope === 'single_topic'
        ? 'UMEDT_STANDALONE_TOPIC_ZIP'
        : normalizedScope === 'complete_block'
          ? 'UMEDT_STANDALONE_BLOCK_ZIP'
          : 'UMEDT_STANDALONE_SUBJECT_ZIP',
    exportedAt: new Date().toISOString(),
    includeLocalMedia: params.includeLocalMedia,
    includedMediaFilesCount: collectedZipMediaEntries.length,
    data: {
      blocks: params.block ? [params.block] : [],
      subjects:
        normalizedScope === 'complete_block' && params.block
          ? allSubjects.filter((s) => s.blockId === params.block!.id)
          : params.subject
            ? [params.subject]
            : allSubjects,
      topics: sanitizedTopics,
      terms: linkedTerms,
      quizQuestions: linkedQuestions,
      books: linkedBooks,
      exams: linkedExams
    }
  };

  const encoder = new TextEncoder();
  const dataJsonBytes = encoder.encode(
    redactBotTokenFromText(JSON.stringify(dataJsonObject, null, 2))
  );
  const indexHtmlBytes = encoder.encode(htmlString);
  const readmeBytes = encoder.encode(
    [
      'UMEDT Standalone Medical Content Package',
      '========================================',
      '- Open "index.html" in any browser (Mobile or Desktop) to read the full content, view media, search terms, and solve interactive quizzes without needing UMEDT installed.',
      '- Import "package-data.json" / "data.json" or this entire ".zip" file inside UMEDT if you wish to add this content to your app library.',
      params.includeLocalMedia
        ? `- Local media files included inside "media/" (${collectedZipMediaEntries.length} files).`
        : '- Local binary media files were excluded by user choice; all external media URLs and metadata references are preserved.'
    ].join('\n')
  );

  const zipEntries: Array<{ name: string; data: Uint8Array }> = [
    { name: 'index.html', data: indexHtmlBytes },
    { name: 'package-data.json', data: dataJsonBytes },
    { name: 'data.json', data: dataJsonBytes },
    { name: 'README.txt', data: readmeBytes },
    ...collectedZipMediaEntries
  ];

  const zipBytes = buildZipBytesFromEntries(zipEntries);
  return {
    zipBytes,
    recordsCount,
    includedMediaFilesCount: collectedZipMediaEntries.length,
    entryNames: zipEntries.map((e) => e.name)
  };
}
