import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord
} from '../types/lexicon';
import {
  prepareAndDownloadFile,
  shareFileWithVerification,
  LocalDownloadRecord
} from '../utils/downloadHelper';
import { extractDetailedTermMatchesFromText } from '../engine/knowledgeLinker';
import {
  stripBinaryMediaFromTopicsForBackup,
  redactBotTokenFromText
} from './telegramBackupService';

export const GITHUB_DIRECT_RELEASE_LINKS = {
  latestApkReleasePage: 'https://github.com/Alssaedy50/UMEDT/releases/latest',
  stableManifestJson:
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json',
  masterTermsJson:
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/master/terms.json',
  masterTopicsJson:
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/master/topics.json',
  masterSentencesJson:
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/master/sentences.json'
} as const;

export interface VerifiedExportResult {
  success: boolean;
  verifiedOnDisk: boolean;
  fileName: string;
  savedPath?: string;
  format: 'json' | 'csv' | 'html' | 'zip';
  byteSize: number;
  recordsCount: number;
  sharedViaNativeSheet: boolean;
  messageAr: string;
  record?: LocalDownloadRecord;
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTermsCsvContent(terms: DictionaryTerm[]): string {
  const headers = [
    'ID',
    'Term (English)',
    'Translation (Arabic)',
    'Phonetic',
    'Part of Speech',
    'Category',
    'Specialty',
    'Definition (Arabic)',
    'Definition (English)',
    'Linked Topics',
    'Linked Subjects',
    'Favorite'
  ];
  const rows = terms.map((t) => [
    t.id,
    t.term,
    t.translation,
    t.phonetic,
    t.pos,
    t.category,
    t.specialty || '',
    t.definitionAr,
    t.definitionEn,
    (t.linkedTopicIds || []).join('; '),
    (t.linkedSubjectIds || []).join('; '),
    t.favorite ? 'Yes' : 'No'
  ]);

  // Add UTF-8 BOM so Excel/Android spreadsheet viewers render Arabic cleanly
  const csvBody = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(','))
  ].join('\r\n');

  return `\uFEFF${csvBody}`;
}

export function buildQuestionsAndResultsCsvContent(
  questions: UnifiedQuizQuestion[],
  attempts: QuizAttemptRecord[]
): string {
  const qHeaders = [
    'Question ID',
    'Type',
    'Question (English)',
    'Question (Arabic)',
    'Options',
    'Correct Answer',
    'Explanation',
    'Block ID',
    'Subject ID',
    'Topic ID'
  ];

  const qRows = questions.map((q) => [
    q.id,
    q.type,
    q.questionEn,
    q.questionAr || '',
    (q.options || []).map((o) => `${o.key}) ${o.textEn}`).join(' | '),
    q.correctOptionKeys?.length
      ? q.correctOptionKeys.join(', ')
      : (q.acceptableAnswers || []).join(' | '),
    q.explanationEn,
    q.blockId || '',
    q.subjectId || '',
    q.topicId || ''
  ]);

  const aHeaders = [
    'Attempt ID',
    'Title',
    'Scope',
    'Score (%)',
    'Correct',
    'Wrong',
    'Total Questions',
    'Duration (s)',
    'Completed At'
  ];
  const aRows = attempts.map((a) => [
    a.id,
    a.title,
    a.scopeType,
    `${a.scorePercent}%`,
    a.correctCount,
    a.wrongCount,
    a.totalQuestions,
    a.durationSeconds,
    a.completedAt
  ]);

  const csvBody = [
    '=== QUIZ QUESTION BANK ===',
    qHeaders.map(escapeCsvCell).join(','),
    ...qRows.map((r) => r.map(escapeCsvCell).join(',')),
    '',
    '=== QUIZ ATTEMPT RESULTS ===',
    aHeaders.map(escapeCsvCell).join(','),
    ...aRows.map((r) => r.map(escapeCsvCell).join(','))
  ].join('\r\n');

  return `\uFEFF${csvBody}`;
}

/**
 * Finds all dictionary terms linked to or detected within a set of topics.
 */
export function resolveTermsForTopics(
  targetTopics: TopicArticle[],
  allTerms: DictionaryTerm[]
): DictionaryTerm[] {
  const topicIdSet = new Set(targetTopics.map((t) => t.id));
  const subjectIdSet = new Set(
    targetTopics.map((t) => t.subjectId).filter((s): s is string => Boolean(s))
  );
  const blockIdSet = new Set(
    targetTopics.map((t) => t.blockId).filter((b): b is string => Boolean(b))
  );

  const matchedIds = new Set<string>();

  for (const term of allTerms) {
    if ((term.linkedTopicIds || []).some((id) => topicIdSet.has(id))) {
      matchedIds.add(term.id);
    }
    if ((term.linkedSubjectIds || []).some((id) => subjectIdSet.has(id))) {
      matchedIds.add(term.id);
    }
    if ((term.linkedBlockIds || []).some((id) => blockIdSet.has(id))) {
      matchedIds.add(term.id);
    }
  }

  for (const topic of targetTopics) {
    const corpus = [
      topic.title,
      topic.titleEn || '',
      topic.subtitle || '',
      ...topic.sections.map((s) => `${s.heading || ''}\n${(s.paragraphs || []).join('\n')}`)
    ].join('\n');
    const detected = extractDetailedTermMatchesFromText(corpus, allTerms);
    for (const d of detected) {
      matchedIds.add(d.termId);
    }
  }

  return allTerms.filter((t) => matchedIds.has(t.id));
}

/**
 * Verifies payload non-emptiness and triggers either direct download or native Android share.
 */
export async function executeVerifiedExportDownload(params: {
  fileName: string;
  content: string | Uint8Array;
  format: 'json' | 'csv' | 'html' | 'zip';
  recordsCount: number;
  deliveryMode: 'download' | 'share';
  titleAr: string;
}): Promise<VerifiedExportResult> {
  const isBinary = params.content instanceof Uint8Array;
  const sanitizedPayload: string | Uint8Array = isBinary
    ? (params.content as Uint8Array)
    : redactBotTokenFromText(String(params.content || ''));

  const byteSize = isBinary
    ? (sanitizedPayload as Uint8Array).byteLength
    : new TextEncoder().encode((sanitizedPayload as string).trim()).byteLength;

  if (byteSize < 2) {
    return {
      success: false,
      verifiedOnDisk: false,
      fileName: params.fileName,
      format: params.format,
      byteSize: 0,
      recordsCount: 0,
      sharedViaNativeSheet: false,
      messageAr: 'فشل التصدير: البيانات المحددة فارغة ولا يمكن إنشاء الملف.'
    };
  }

  const mime =
    params.format === 'csv'
      ? 'text/csv;charset=utf-8'
      : params.format === 'html'
        ? 'text/html;charset=utf-8'
        : params.format === 'zip'
          ? 'application/zip'
          : 'application/json;charset=utf-8';

  const sizeKb = Math.max(1, Math.round(byteSize / 1024));

  try {
    if (params.deliveryMode === 'share') {
      const shareRes = await shareFileWithVerification({
        filename: params.fileName,
        content: sanitizedPayload,
        mime,
        title: params.titleAr,
        text: `${params.titleAr} (${params.recordsCount} سجل · ${sizeKb} KB)`
      });
      return {
        success: shareRes.initiated,
        verifiedOnDisk: shareRes.verifiedOnDisk,
        fileName: params.fileName,
        savedPath: shareRes.savedPath,
        format: params.format,
        byteSize,
        recordsCount: params.recordsCount,
        sharedViaNativeSheet: shareRes.sharedViaNativeSheet,
        record: shareRes.record,
        messageAr: shareRes.messageAr
      };
    }

    const res = await prepareAndDownloadFile({
      filename: params.fileName,
      content: sanitizedPayload,
      mime
    });

    if (!res || !res.initiated || !res.downloadUrl) {
      return {
        success: false,
        verifiedOnDisk: false,
        fileName: params.fileName,
        savedPath: res?.savedPath || `Download/UMEDT/${params.fileName}`,
        format: params.format,
        byteSize,
        recordsCount: params.recordsCount,
        sharedViaNativeSheet: false,
        messageAr:
          res?.error ||
          'تعذر تجهيز أو حفظ الملف على الجهاز. جرب خيار مشاركة الملف.'
      };
    }

    return {
      success: true,
      verifiedOnDisk: res.verifiedOnDisk,
      fileName: res.filename || params.fileName,
      savedPath: res.savedPath,
      format: params.format,
      byteSize,
      recordsCount: params.recordsCount,
      sharedViaNativeSheet: false,
      record: res.record,
      messageAr: res.verifiedOnDisk
        ? `تم التحقق وحفظ الملف فعلياً في "${res.savedPath}" (${sizeKb} KB · ${params.recordsCount} سجل) بنجاح.`
        : `تم تجهيز الملف "${res.filename}" (${sizeKb} KB · ${params.recordsCount} سجل) وإرساله إلى تنزيلات المتصفح.`
    };
  } catch (err) {
    return {
      success: false,
      verifiedOnDisk: false,
      fileName: params.fileName,
      savedPath: `Download/UMEDT/${params.fileName}`,
      format: params.format,
      byteSize,
      recordsCount: params.recordsCount,
      sharedViaNativeSheet: false,
      messageAr: `حدث خطأ أثناء حفظ الملف: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

export function buildSingleTopicExportBundle(
  topic: TopicArticle,
  allTerms: DictionaryTerm[],
  allQuestions: UnifiedQuizQuestion[],
  block?: MedicalBlock,
  subject?: MedicalSubject
): { jsonText: string; recordsCount: number } {
  const [strippedTopic] = stripBinaryMediaFromTopicsForBackup([topic]);
  const linkedTerms = resolveTermsForTopics([strippedTopic], allTerms);
  const linkedQuestions = allQuestions.filter((q) => q.topicId === topic.id);

  const bundle = {
    exportType: 'UMEDT_SINGLE_TOPIC_PACKAGE',
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    mediaStoragePolicy: 'metadata_and_urls_only',
    hierarchy: {
      block: block
        ? { id: block.id, code: block.code, titleEn: block.titleEn, titleAr: block.titleAr }
        : null,
      subject: subject
        ? {
            id: subject.id,
            code: subject.code,
            titleEn: subject.titleEn,
            titleAr: subject.titleAr
          }
        : null
    },
    counts: {
      topics: 1,
      sections: strippedTopic.sections.length,
      terms: linkedTerms.length,
      questions: linkedQuestions.length
    },
    topic: strippedTopic,
    terms: linkedTerms,
    questions: linkedQuestions
  };

  return {
    jsonText: redactBotTokenFromText(JSON.stringify(bundle, null, 2)),
    recordsCount: 1 + linkedTerms.length + linkedQuestions.length
  };
}

export function buildSubjectExportBundle(
  subject: MedicalSubject,
  topics: TopicArticle[],
  allTerms: DictionaryTerm[],
  allQuestions: UnifiedQuizQuestion[],
  block?: MedicalBlock
): { jsonText: string; recordsCount: number } {
  const subjectTopics = stripBinaryMediaFromTopicsForBackup(
    topics.filter((t) => t.subjectId === subject.id)
  );
  const linkedTerms = resolveTermsForTopics(subjectTopics, allTerms);
  const topicIds = new Set(subjectTopics.map((t) => t.id));
  const linkedQuestions = allQuestions.filter(
    (q) => q.subjectId === subject.id || (q.topicId && topicIds.has(q.topicId))
  );

  const bundle = {
    exportType: 'UMEDT_COMPLETE_SUBJECT_PACKAGE',
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    mediaStoragePolicy: 'metadata_and_urls_only',
    block: block || null,
    subject,
    counts: {
      topics: subjectTopics.length,
      terms: linkedTerms.length,
      questions: linkedQuestions.length
    },
    topics: subjectTopics,
    terms: linkedTerms,
    questions: linkedQuestions
  };

  return {
    jsonText: redactBotTokenFromText(JSON.stringify(bundle, null, 2)),
    recordsCount: subjectTopics.length + linkedTerms.length + linkedQuestions.length
  };
}

export function buildBlockExportBundle(
  block: MedicalBlock,
  subjects: MedicalSubject[],
  topics: TopicArticle[],
  allTerms: DictionaryTerm[],
  allQuestions: UnifiedQuizQuestion[]
): { jsonText: string; recordsCount: number } {
  const blockSubjects = subjects.filter((s) => s.blockId === block.id);
  const subjectIds = new Set(blockSubjects.map((s) => s.id));
  const blockTopics = stripBinaryMediaFromTopicsForBackup(
    topics.filter(
      (t) => t.blockId === block.id || (t.subjectId && subjectIds.has(t.subjectId))
    )
  );
  const linkedTerms = resolveTermsForTopics(blockTopics, allTerms);
  const topicIds = new Set(blockTopics.map((t) => t.id));
  const linkedQuestions = allQuestions.filter(
    (q) =>
      q.blockId === block.id ||
      (q.subjectId && subjectIds.has(q.subjectId)) ||
      (q.topicId && topicIds.has(q.topicId))
  );

  const bundle = {
    exportType: 'UMEDT_COMPLETE_BLOCK_PACKAGE',
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    mediaStoragePolicy: 'metadata_and_urls_only',
    block,
    subjects: blockSubjects,
    counts: {
      subjects: blockSubjects.length,
      topics: blockTopics.length,
      terms: linkedTerms.length,
      questions: linkedQuestions.length
    },
    topics: blockTopics,
    terms: linkedTerms,
    questions: linkedQuestions
  };

  return {
    jsonText: redactBotTokenFromText(JSON.stringify(bundle, null, 2)),
    recordsCount:
      blockSubjects.length + blockTopics.length + linkedTerms.length + linkedQuestions.length
  };
}
