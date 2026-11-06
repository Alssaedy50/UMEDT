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
  shareFileOnAndroidOrDownload
} from '../utils/downloadHelper';
import { extractDetailedTermMatchesFromText } from '../engine/knowledgeLinker';

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
  fileName: string;
  format: 'json' | 'csv';
  byteSize: number;
  recordsCount: number;
  sharedViaNativeSheet: boolean;
  messageAr: string;
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
  content: string;
  format: 'json' | 'csv';
  recordsCount: number;
  deliveryMode: 'download' | 'share';
  titleAr: string;
}): Promise<VerifiedExportResult> {
  const cleanContent = (params.content || '').trim();
  if (!cleanContent || cleanContent.length < 2) {
    return {
      success: false,
      fileName: params.fileName,
      format: params.format,
      byteSize: 0,
      recordsCount: 0,
      sharedViaNativeSheet: false,
      messageAr: 'فشل التصدير: البيانات المحددة فارغة ولا يمكن إنشاء الملف.'
    };
  }

  const encodedBytes = new TextEncoder().encode(params.content);
  const byteSize = encodedBytes.byteLength;
  if (byteSize === 0) {
    return {
      success: false,
      fileName: params.fileName,
      format: params.format,
      byteSize: 0,
      recordsCount: 0,
      sharedViaNativeSheet: false,
      messageAr: 'تعذر إنشاء حزمة البيانات للتنزيل.'
    };
  }

  const mime =
    params.format === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/json;charset=utf-8';

  const sizeKb = Math.max(1, Math.round(byteSize / 1024));

  try {
    if (params.deliveryMode === 'share') {
      const shared = await shareFileOnAndroidOrDownload({
        filename: params.fileName,
        content: params.content,
        mime,
        title: params.titleAr,
        text: `${params.titleAr} (${params.recordsCount} سجل · ${sizeKb} KB)`
      });
      return {
        success: true,
        fileName: params.fileName,
        format: params.format,
        byteSize,
        recordsCount: params.recordsCount,
        sharedViaNativeSheet: shared,
        messageAr: shared
          ? `تم فتح نافذة مشاركة وحفظ الملف "${params.fileName}" (${sizeKb} KB) بنجاح.`
          : `تم تجهيز وتنزيل الملف "${params.fileName}" (${sizeKb} KB · ${params.recordsCount} سجل) مباشرة إلى الجهاز.`
      };
    }

    const res = await prepareAndDownloadFile({
      filename: params.fileName,
      content: params.content,
      mime
    });

    if (!res || !res.downloadUrl) {
      return {
        success: false,
        fileName: params.fileName,
        format: params.format,
        byteSize,
        recordsCount: params.recordsCount,
        sharedViaNativeSheet: false,
        messageAr: 'تعذر بدء عملية التنزيل على المتصفح الحالي. جرب خيار مشاركة الملف.'
      };
    }

    return {
      success: true,
      fileName: res.filename || params.fileName,
      format: params.format,
      byteSize,
      recordsCount: params.recordsCount,
      sharedViaNativeSheet: false,
      messageAr: `تم التحقق وتنزيل الملف "${params.fileName}" (${sizeKb} KB · ${params.recordsCount} سجل) بنجاح.`
    };
  } catch (err) {
    return {
      success: false,
      fileName: params.fileName,
      format: params.format,
      byteSize,
      recordsCount: params.recordsCount,
      sharedViaNativeSheet: false,
      messageAr: `حدث خطأ أثناء التنزيل: ${err instanceof Error ? err.message : 'Unknown error'}`
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
  const linkedTerms = resolveTermsForTopics([topic], allTerms);
  const linkedQuestions = allQuestions.filter((q) => q.topicId === topic.id);

  const bundle = {
    exportType: 'UMEDT_SINGLE_TOPIC_PACKAGE',
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
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
      sections: topic.sections.length,
      terms: linkedTerms.length,
      questions: linkedQuestions.length
    },
    topic,
    terms: linkedTerms,
    questions: linkedQuestions
  };

  return {
    jsonText: JSON.stringify(bundle, null, 2),
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
  const subjectTopics = topics.filter((t) => t.subjectId === subject.id);
  const linkedTerms = resolveTermsForTopics(subjectTopics, allTerms);
  const topicIds = new Set(subjectTopics.map((t) => t.id));
  const linkedQuestions = allQuestions.filter(
    (q) => q.subjectId === subject.id || (q.topicId && topicIds.has(q.topicId))
  );

  const bundle = {
    exportType: 'UMEDT_COMPLETE_SUBJECT_PACKAGE',
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
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
    jsonText: JSON.stringify(bundle, null, 2),
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
  const blockTopics = topics.filter(
    (t) => t.blockId === block.id || (t.subjectId && subjectIds.has(t.subjectId))
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
    jsonText: JSON.stringify(bundle, null, 2),
    recordsCount:
      blockSubjects.length + blockTopics.length + linkedTerms.length + linkedQuestions.length
  };
}
