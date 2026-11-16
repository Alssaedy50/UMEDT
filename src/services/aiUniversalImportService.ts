import {
  AcademicBookResource,
  AcademicExamPackage,
  ClinicalAbbreviation,
  ContentBlockType,
  DictionaryTerm,
  LexiconCategory,
  LinkedSentence,
  MediaAssetRecord,
  MedicalBlock,
  MedicalSubject,
  MorphologicalAffix,
  TopicArticle,
  TopicCategory,
  TopicContentBlock,
  TopicSection,
  UnifiedMatchingPair,
  UnifiedQuestionType,
  UnifiedQuizOption,
  UnifiedQuizQuestion
} from '../types/lexicon';
import {
  createDataBackupSnapshot,
  loadAppState,
  restoreDataBackupById,
  saveCustomAbbreviations,
  saveCustomAffixes,
  saveSentences,
  saveStudyStats,
  saveTerms,
  saveTopics,
  syncTermExamplesToSentences
} from './storageService';
import {
  enrichAllTopicsWithHierarchy,
  loadAcademicBooks,
  loadAcademicExams,
  loadMediaAssetsIndex,
  loadMedicalBlocks,
  loadMedicalSubjects,
  saveAcademicBooks,
  saveAcademicExams,
  saveMediaAssetsIndex,
  saveMedicalBlocks,
  saveMedicalSubjects
} from './learningHierarchyService';
import {
  loadQuizQuestions,
  saveQuizQuestions,
  validateSingleQuizQuestion
} from './quizEngineService';
import { autoEnrichAllTermsRelations } from '../engine/knowledgeLinker';
import {
  deduplicateTopicMediaAndAttachments,
  enqueueEntitiesForCloudSync,
  loadLocallyRemovedRegistry,
  loadUnifiedCloudMirror,
  mergeRecordsIntoCloudSnapshot,
  saveLocallyRemovedRegistry,
  saveUnifiedCloudMirror
} from './cloudLibrarySyncService';

export interface UniversalImportReport {
  success: boolean;
  sourceFormat: string;
  counts: {
    blocks: number;
    subjects: number;
    topics: number;
    terms: number;
    sentences: number;
    affixes: number;
    abbreviations: number;
    books: number;
    exams: number;
    questions: number;
    mediaAssets: number;
    skippedDuplicates: number;
  };
  warnings: string[];
  errors: string[];
  messageAr: string;
  summaryText: string;
  updatedTerms: DictionaryTerm[];
  updatedSentences: LinkedSentence[];
  updatedTopics: TopicArticle[];
  updatedAffixes: MorphologicalAffix[];
  updatedAbbreviations: ClinicalAbbreviation[];
  updatedState: {
    terms: DictionaryTerm[];
    sentences: LinkedSentence[];
    topics: TopicArticle[];
    customAffixes: MorphologicalAffix[];
    customAbbreviations: ClinicalAbbreviation[];
    blocks: MedicalBlock[];
    subjects: MedicalSubject[];
    books: AcademicBookResource[];
    exams: AcademicExamPackage[];
    questions: UnifiedQuizQuestion[];
    mediaAssets: MediaAssetRecord[];
  };
}

const VALID_BLOCK_TYPES = new Set<ContentBlockType>([
  'heading',
  'paragraph',
  'table',
  'image',
  'video',
  'video_link',
  'audio',
  'attachment',
  'question',
  'clinical_note',
  'diagram',
  'pdf_viewer',
  'book_reference',
  'exam_link'
]);

const VALID_QUESTION_TYPES = new Set<UnifiedQuestionType>([
  'single_choice',
  'multiple_select',
  'true_false',
  'matching',
  'fill_blank',
  'short_answer',
  'image_based'
]);

export function extractJsonCandidatesFromText(rawText: string): string[] {
  const clean = String(rawText || '').trim();
  if (!clean) return [];

  const candidates: string[] = [];

  // 1. Direct JSON object or array
  if (
    (clean.startsWith('{') && clean.endsWith('}')) ||
    (clean.startsWith('[') && clean.endsWith(']'))
  ) {
    try {
      JSON.parse(clean);
      return [clean];
    } catch {
      // Continue to fenced extraction
    }
  }

  // 2. Markdown ```json ... ``` or ``` ... ``` code blocks (ChatGPT / Gemini output)
  const fenceRegex = /```(?:json|JSON|javascript|js)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;
  while ((match = fenceRegex.exec(clean)) !== null) {
    const inner = match[1]?.trim();
    if (!inner) continue;
    try {
      JSON.parse(inner);
      candidates.push(inner);
    } catch {
      // Try trimmed bracket extraction inside fence
      const innerBracket = extractOuterJsonSubstring(inner);
      if (innerBracket) candidates.push(innerBracket);
    }
  }

  if (candidates.length > 0) return candidates;

  // 3. Raw prose wrapping a JSON object or array
  const outer = extractOuterJsonSubstring(clean);
  if (outer) {
    candidates.push(outer);
  }

  return candidates;
}

function extractOuterJsonSubstring(text: string): string | null {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  let start = -1;
  if (firstObj !== -1 && firstArr !== -1) {
    start = Math.min(firstObj, firstArr);
  } else {
    start = Math.max(firstObj, firstArr);
  }
  if (start === -1) return null;

  const openCh = text[start];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openCh) depth++;
    if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          JSON.parse(slice);
          return slice;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asLexiconCategory(raw: unknown): LexiconCategory {
  if (
    raw === 'Medical' ||
    raw === 'AI' ||
    raw === 'Programming' ||
    raw === 'General'
  ) {
    return raw;
  }
  return 'Medical';
}

function asTopicCategory(raw: unknown): TopicCategory {
  if (
    raw === 'Medical' ||
    raw === 'Technology' ||
    raw === 'AI' ||
    raw === 'History' ||
    raw === 'General'
  ) {
    return raw;
  }
  return 'Medical';
}

function normalizeQuestionItem(
  raw: Record<string, unknown>,
  idx: number
): UnifiedQuizQuestion | null {
  const baseQEn = String(
    raw.questionEn || raw.question || raw.stem || raw.prompt || ''
  ).trim();
  const vignette =
    typeof raw.clinicalVignetteEn === 'string'
      ? raw.clinicalVignetteEn.trim()
      : typeof raw.vignette === 'string'
        ? raw.vignette.trim()
        : '';
  const qEn = vignette && !baseQEn.includes(vignette)
    ? `${vignette}\n${baseQEn}`.trim()
    : baseQEn;
  if (!qEn) return null;

  const rawTypeStr = String(raw.type || 'single_choice');
  const mappedTypeStr =
    rawTypeStr === 'clinical_vignette' || rawTypeStr === 'term_definition'
      ? 'single_choice'
      : rawTypeStr;
  const qType: UnifiedQuestionType = VALID_QUESTION_TYPES.has(
    mappedTypeStr as UnifiedQuestionType
  )
    ? (mappedTypeStr as UnifiedQuestionType)
    : 'single_choice';

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let options: UnifiedQuizOption[] = [];
  const inferredCorrectFromFlags: string[] = [];
  if (Array.isArray(raw.options)) {
    options = raw.options
      .map((opt, oIdx): UnifiedQuizOption | null => {
        if (typeof opt === 'string') {
          const stripped = opt.replace(/^[A-Fa-f][).:\s]+/, '').trim();
          return {
            key: letters[oIdx] || String(oIdx + 1),
            textEn: stripped || opt
          };
        }
        if (opt && typeof opt === 'object') {
          const obj = opt as Record<string, unknown>;
          const textEn = String(obj.textEn || obj.text || obj.label || '').trim();
          if (!textEn) return null;
          const optKey = String(
            obj.key || obj.id || letters[oIdx] || String(oIdx + 1)
          ).toUpperCase();
          if (obj.isCorrect === true) {
            inferredCorrectFromFlags.push(optKey);
          }
          return {
            key: optKey,
            textEn,
            textAr: typeof obj.textAr === 'string' ? obj.textAr : undefined
          };
        }
        return null;
      })
      .filter((x): x is UnifiedQuizOption => x !== null);
  } else if (qType === 'true_false') {
    options = [
      { key: 'T', textEn: 'True', textAr: 'صحيح' },
      { key: 'F', textEn: 'False', textAr: 'خطأ' }
    ];
  }

  let correctKeys: string[] = [];
  if (Array.isArray(raw.correctOptionKeys)) {
    correctKeys = raw.correctOptionKeys
      .map((k) => String(k).trim().toUpperCase())
      .filter(Boolean);
  } else if (Array.isArray(raw.correctOptionIds) && raw.correctOptionIds.length > 0) {
    correctKeys = raw.correctOptionIds
      .map((k) => String(k).trim().toUpperCase())
      .filter(Boolean);
  } else if (inferredCorrectFromFlags.length > 0) {
    correctKeys = inferredCorrectFromFlags;
  } else if (typeof raw.correctAnswer === 'string' && raw.correctAnswer.trim()) {
    correctKeys = [raw.correctAnswer.trim().toUpperCase()];
  } else if (typeof raw.correctOptionIndex === 'number' && options[raw.correctOptionIndex]) {
    correctKeys = [options[raw.correctOptionIndex].key];
  } else if (options.length > 0) {
    correctKeys = [options[0].key];
  }

  const matchingPairs: UnifiedMatchingPair[] | undefined = Array.isArray(raw.matchingPairs)
    ? raw.matchingPairs
        .map((pair, pIdx): UnifiedMatchingPair | null => {
          if (!pair || typeof pair !== 'object') return null;
          const p = pair as Record<string, unknown>;
          const leftEn = String(p.leftEn || p.left || '').trim();
          const rightEn = String(p.rightEn || p.right || '').trim();
          if (!leftEn || !rightEn) return null;
          return {
            id: String(p.id || `mp-${idx}-${pIdx}`),
            leftEn,
            leftAr: typeof p.leftAr === 'string' ? p.leftAr : undefined,
            rightEn,
            rightAr: typeof p.rightAr === 'string' ? p.rightAr : undefined
          };
        })
        .filter((x): x is UnifiedMatchingPair => x !== null)
    : undefined;

  const rawAcceptable =
    Array.isArray(raw.acceptableAnswers)
      ? raw.acceptableAnswers
      : Array.isArray(raw.acceptedShortAnswers)
        ? raw.acceptedShortAnswers
        : typeof raw.correctAnswerText === 'string'
          ? [raw.correctAnswerText]
          : typeof raw.shortAnswer === 'string'
            ? [raw.shortAnswer]
            : undefined;
  const acceptableAnswers = rawAcceptable
    ? rawAcceptable.map((s) => String(s).trim()).filter(Boolean)
    : undefined;

  return {
    id: String(raw.id || `imp-q-${Date.now()}-${idx}`),
    type: qType,
    questionEn: qEn,
    questionAr: typeof raw.questionAr === 'string' ? raw.questionAr : undefined,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
    imageCaption: typeof raw.imageCaption === 'string' ? raw.imageCaption : undefined,
    options,
    correctOptionKeys: correctKeys,
    matchingPairs,
    acceptableAnswers,
    explanationEn: String(
      raw.explanationEn || raw.explanation || 'Refer to core clinical pathophysiology.'
    ),
    explanationAr: typeof raw.explanationAr === 'string' ? raw.explanationAr : undefined,
    difficulty:
      raw.difficulty === 'easy' ||
      raw.difficulty === 'medium' ||
      raw.difficulty === 'hard'
        ? raw.difficulty
        : 'medium',
    blockId: typeof raw.blockId === 'string' ? raw.blockId : undefined,
    subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : undefined,
    topicId: typeof raw.topicId === 'string' ? raw.topicId : undefined,
    sectionId: typeof raw.sectionId === 'string' ? raw.sectionId : undefined,
    linkedTermIds: Array.isArray(raw.linkedTermIds)
      ? raw.linkedTermIds.map((id) => String(id))
      : [],
    sourceLabel: typeof raw.sourceLabel === 'string' ? raw.sourceLabel : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString())
  };
}

function normalizeContentBlock(
  raw: Record<string, unknown>,
  secId: string,
  idx: number
): TopicContentBlock {
  const rawType = String(raw.type || 'paragraph') as ContentBlockType;
  const blkType: ContentBlockType = VALID_BLOCK_TYPES.has(rawType)
    ? rawType
    : 'paragraph';

  let inlineQ: UnifiedQuizQuestion | undefined = undefined;
  if (raw.inlineQuestion && typeof raw.inlineQuestion === 'object') {
    inlineQ =
      normalizeQuestionItem(
        raw.inlineQuestion as Record<string, unknown>,
        idx
      ) || undefined;
  }

  return {
    id: String(raw.id || `cblk-${secId}-${Date.now()}-${idx}`),
    type: blkType,
    order: typeof raw.order === 'number' ? raw.order : idx + 1,
    titleEn: typeof raw.titleEn === 'string' ? raw.titleEn : undefined,
    titleAr: typeof raw.titleAr === 'string' ? raw.titleAr : undefined,
    text:
      typeof raw.text === 'string'
        ? raw.text
        : typeof raw.content === 'string'
          ? raw.content
          : undefined,
    textAr: typeof raw.textAr === 'string' ? raw.textAr : undefined,
    noteSeverity:
      raw.noteSeverity === 'high-yield' ||
      raw.noteSeverity === 'clinical-correlation' ||
      raw.noteSeverity === 'warning' ||
      raw.noteSeverity === 'exam-trap'
        ? raw.noteSeverity
        : raw.noteSeverity === 'info'
          ? 'clinical-correlation'
          : undefined,
    tableHeaders: Array.isArray(raw.tableHeaders)
      ? raw.tableHeaders.map((h) => String(h))
      : Array.isArray(raw.headers)
        ? raw.headers.map((h) => String(h))
        : undefined,
    tableRows: Array.isArray(raw.tableRows)
      ? raw.tableRows.map((row) =>
          Array.isArray(row) ? row.map((c) => String(c)) : []
        )
      : Array.isArray(raw.rows)
        ? raw.rows.map((row) =>
            Array.isArray(row) ? row.map((c) => String(c)) : []
          )
        : undefined,
    mediaUrl:
      typeof raw.mediaUrl === 'string'
        ? raw.mediaUrl
        : typeof raw.url === 'string'
          ? raw.url
          : undefined,
    externalUrl:
      typeof raw.externalUrl === 'string'
        ? raw.externalUrl
        : typeof raw.url === 'string' && /^https?:\/\//i.test(raw.url)
          ? raw.url
          : undefined,
    mediaIdbKey: typeof raw.mediaIdbKey === 'string' ? raw.mediaIdbKey : undefined,
    mediaMimeType:
      typeof raw.mediaMimeType === 'string' ? raw.mediaMimeType : undefined,
    mediaFileName:
      typeof raw.mediaFileName === 'string' ? raw.mediaFileName : undefined,
    mediaSizeBytes:
      typeof raw.mediaSizeBytes === 'number' ? raw.mediaSizeBytes : undefined,
    mediaDurationSeconds:
      typeof raw.mediaDurationSeconds === 'number'
        ? raw.mediaDurationSeconds
        : undefined,
    isLocalMediaRef:
      typeof raw.isLocalMediaRef === 'boolean' ? raw.isLocalMediaRef : undefined,
    captionEn: typeof raw.captionEn === 'string' ? raw.captionEn : undefined,
    captionAr: typeof raw.captionAr === 'string' ? raw.captionAr : undefined,
    bookId: typeof raw.bookId === 'string' ? raw.bookId : undefined,
    examId: typeof raw.examId === 'string' ? raw.examId : undefined,
    diagramSvg: typeof raw.diagramSvg === 'string' ? raw.diagramSvg : undefined,
    diagramData:
      raw.diagramData && typeof raw.diagramData === 'object'
        ? (raw.diagramData as Record<string, unknown>)
        : undefined,
    sha256: typeof raw.sha256 === 'string' ? raw.sha256 : undefined,
    inlineQuestion: inlineQ
  };
}

function normalizeTopicArticle(
  raw: Record<string, unknown>,
  idx: number
): TopicArticle | null {
  const titleEn = String(raw.titleEn || raw.title || '').trim();
  const titleAr = String(raw.titleAr || raw.subtitle || raw.title || '').trim();
  if (!titleEn && !titleAr) return null;

  const topicId = String(raw.id || `topic-ai-${Date.now()}-${idx}`);

  let sections: TopicSection[] = [];
  if (Array.isArray(raw.sections) && raw.sections.length > 0) {
    sections = raw.sections.map((secRaw, sIdx) => {
      const sObj = (secRaw && typeof secRaw === 'object'
        ? secRaw
        : {}) as Record<string, unknown>;
      const secId = String(sObj.id || `${topicId}-sec-${sIdx + 1}`);
      const rawParagraphs = Array.isArray(sObj.paragraphs)
        ? sObj.paragraphs.map((p) => String(p)).filter(Boolean)
        : typeof sObj.content === 'string'
          ? [sObj.content]
          : [];

      let contentBlocks: TopicContentBlock[] = [];
      if (Array.isArray(sObj.contentBlocks) && sObj.contentBlocks.length > 0) {
        contentBlocks = sObj.contentBlocks.map((cb, cbIdx) =>
          normalizeContentBlock(
            (cb && typeof cb === 'object' ? cb : {}) as Record<string, unknown>,
            secId,
            cbIdx
          )
        );
      } else {
        contentBlocks = rawParagraphs.map((p, pIdx) => ({
          id: `cblk-${secId}-${pIdx + 1}`,
          type: 'paragraph' as const,
          order: pIdx + 1,
          text: p
        }));
      }

      const paragraphs =
        rawParagraphs.length > 0
          ? rawParagraphs
          : contentBlocks
              .filter(
                (cb) => cb.type === 'paragraph' || cb.type === 'clinical_note'
              )
              .map((cb) => cb.text || '')
              .filter(Boolean);

      return {
        id: secId,
        heading: String(
          sObj.heading || sObj.headingEn || sObj.headingAr || `Section ${sIdx + 1}`
        ),
        headingEn:
          typeof sObj.headingEn === 'string'
            ? sObj.headingEn
            : typeof sObj.heading === 'string'
              ? sObj.heading
              : undefined,
        headingAr: typeof sObj.headingAr === 'string' ? sObj.headingAr : undefined,
        paragraphs,
        contentBlocks
      };
    });
  } else {
    const body = String(raw.content || raw.body || raw.summary || titleAr || titleEn);
    const secId = `${topicId}-sec-1`;
    sections = [
      {
        id: secId,
        heading: 'Core Overview',
        headingEn: 'Core Overview',
        headingAr: 'الملخص العلمي',
        paragraphs: [body],
        contentBlocks: [
          {
            id: `cblk-${secId}-1`,
            type: 'paragraph',
            order: 1,
            text: body
          }
        ]
      }
    ];
  }

  return deduplicateTopicMediaAndAttachments({
    id: topicId,
    title: String(raw.title || titleAr || titleEn),
    titleEn: titleEn || titleAr,
    titleAr: titleAr || titleEn,
    subtitle: String(raw.subtitle || titleAr || titleEn),
    category: asTopicCategory(raw.category),
    blockId: typeof raw.blockId === 'string' ? raw.blockId : undefined,
    subjectId: typeof raw.subjectId === 'string' ? raw.subjectId : undefined,
    author: String(raw.author || 'استيراد UMEDT'),
    publishedAt: String(raw.publishedAt || new Date().toISOString().slice(0, 10)),
    readingTimeMinutes: Math.max(1, Number(raw.readingTimeMinutes) || 5),
    favorite: Boolean(raw.favorite),
    sections,
    images: Array.isArray(raw.images) ? (raw.images as TopicArticle['images']) : [],
    links: Array.isArray(raw.links) ? (raw.links as TopicArticle['links']) : [],
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as TopicArticle['attachments'])
      : []
  });
}

function normalizeDictionaryTerm(
  raw: Record<string, unknown>,
  idx: number
): DictionaryTerm | null {
  const termEn = String(
    raw.term || raw.en || raw.word || raw.titleEn || ''
  ).trim();
  if (!termEn) return null;
  const translation = String(
    raw.translation || raw.ar || raw.meaning || raw.titleAr || 'مصطلح طبي'
  ).trim();
  const defAr = String(
    raw.definitionAr || raw.definition || `مصطلح طبي سريري يعني ${translation}.`
  ).trim();
  const defEn = String(
    raw.definitionEn || `Clinical medical concept referring to ${termEn}.`
  ).trim();

  return {
    id: String(raw.id || `u-imp-${Date.now()}-${idx}`),
    term: termEn,
    termNormalized: termEn.toLowerCase(),
    translation,
    phonetic: String(raw.phonetic || `/${termEn.toLowerCase()}/`),
    pos: String(raw.pos || (termEn.includes(' ') ? 'phrase' : 'noun')),
    category: asLexiconCategory(raw.category),
    umdCode: typeof raw.umdCode === 'string' ? raw.umdCode : undefined,
    keepEnglish: typeof raw.keepEnglish === 'boolean' ? raw.keepEnglish : true,
    favorite: Boolean(raw.favorite),
    collections: Array.isArray(raw.collections)
      ? raw.collections.map((c) => String(c))
      : ['استيراد ذكي'],
    ingestedAt: String(raw.ingestedAt || 'مستورد الآن'),
    definitionAr: defAr,
    definitionEn: defEn,
    examples: Array.isArray(raw.examples)
      ? (raw.examples as DictionaryTerm['examples'])
      : [],
    relations:
      raw.relations && typeof raw.relations === 'object'
        ? (raw.relations as DictionaryTerm['relations'])
        : { synonyms: [], broader: [], related: [] },
    linkedTopicIds: Array.isArray(raw.linkedTopicIds)
      ? raw.linkedTopicIds.map((s) => String(s))
      : undefined,
    linkedSubjectIds: Array.isArray(raw.linkedSubjectIds)
      ? raw.linkedSubjectIds.map((s) => String(s))
      : undefined,
    linkedBlockIds: Array.isArray(raw.linkedBlockIds)
      ? raw.linkedBlockIds.map((s) => String(s))
      : undefined
  };
}

interface ParsedBuckets {
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  affixes: MorphologicalAffix[];
  abbreviations: ClinicalAbbreviation[];
  books: AcademicBookResource[];
  exams: AcademicExamPackage[];
  questions: UnifiedQuizQuestion[];
  mediaAssets: MediaAssetRecord[];
  sourceFormat: string;
}

function collectFromParsedJson(parsed: unknown, buckets: ParsedBuckets): void {
  if (!parsed) return;

  if (Array.isArray(parsed)) {
    buckets.sourceFormat =
      buckets.sourceFormat === 'unknown' ? 'json-array' : buckets.sourceFormat;
    parsed.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      const obj = item as Record<string, unknown>;
      if (Array.isArray(obj.sections) || (obj.titleEn && obj.readingTimeMinutes)) {
        const tp = normalizeTopicArticle(obj, idx);
        if (tp) buckets.topics.push(tp);
      } else if (obj.questionEn || obj.options || obj.correctOptionKeys) {
        const q = normalizeQuestionItem(obj, idx);
        if (q) buckets.questions.push(q);
      } else if (obj.questionIds && (obj.titleEn || obj.titleAr)) {
        buckets.exams.push(obj as unknown as AcademicExamPackage);
      } else if (obj.pdfUrl || obj.fileFormat || obj.chapters) {
        buckets.books.push(obj as unknown as AcademicBookResource);
      } else if (obj.blockId && obj.code && !obj.sections && !obj.term) {
        buckets.subjects.push(obj as unknown as MedicalSubject);
      } else if (
        (obj.code || String(obj.id || '').startsWith('block-')) &&
        obj.titleEn &&
        !obj.blockId &&
        !obj.term
      ) {
        buckets.blocks.push(obj as unknown as MedicalBlock);
      } else if (obj.cleanKey && obj.meaningAr && obj.type) {
        buckets.affixes.push(obj as unknown as MorphologicalAffix);
      } else if (obj.abbr && obj.expansionEn) {
        buckets.abbreviations.push(obj as unknown as ClinicalAbbreviation);
      } else if (obj.en && obj.ar && !obj.term) {
        buckets.sentences.push({
          id: String(obj.id || `sen-imp-${Date.now()}-${idx}`),
          en: String(obj.en),
          ar: String(obj.ar),
          category: asLexiconCategory(obj.category),
          sourceType: 'manual',
          linkedTermIds: Array.isArray(obj.linkedTermIds)
            ? (obj.linkedTermIds as string[])
            : [],
          tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : [],
          favorite: Boolean(obj.favorite),
          createdAt: String(obj.createdAt || new Date().toISOString())
        });
      } else if (obj.term || obj.en || obj.word) {
        const tm = normalizeDictionaryTerm(obj, idx);
        if (tm) buckets.terms.push(tm);
      }
    });
    return;
  }

  if (typeof parsed !== 'object') return;
  const root = parsed as Record<string, unknown>;

  if (typeof root.format === 'string') {
    buckets.sourceFormat = root.format;
  } else if (root.catalog || root.collections) {
    buckets.sourceFormat = 'umedt-data-bundle';
  } else if (buckets.sourceFormat === 'unknown') {
    buckets.sourceFormat = 'umedt-json-object';
  }

  const inner =
    (root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.payload && typeof root.payload === 'object'
        ? (root.payload as Record<string, unknown>)
        : root.collections && typeof root.collections === 'object'
          ? (root.collections as Record<string, unknown>)
          : root);

  const pushBlocks = Array.isArray(inner.blocks) ? inner.blocks : [];
  for (const b of pushBlocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>).id) {
      const obj = b as Record<string, unknown>;
      buckets.blocks.push({
        id: String(obj.id),
        code: String(obj.code || 'BLK-MED').toUpperCase(),
        titleEn: String(obj.titleEn || obj.titleAr || obj.id),
        titleAr: String(obj.titleAr || obj.titleEn || obj.id),
        descriptionEn: String(obj.descriptionEn || obj.titleEn || ''),
        descriptionAr: String(obj.descriptionAr || obj.titleAr || ''),
        colorAccent: String(obj.colorAccent || 'emerald'),
        order: typeof obj.order === 'number' ? obj.order : buckets.blocks.length + 1,
        createdAt: String(obj.createdAt || new Date().toISOString()),
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
    }
  }

  const pushSubjects = Array.isArray(inner.subjects) ? inner.subjects : [];
  for (const s of pushSubjects) {
    if (s && typeof s === 'object' && (s as Record<string, unknown>).id) {
      const obj = s as Record<string, unknown>;
      buckets.subjects.push({
        id: String(obj.id),
        blockId: String(obj.blockId || buckets.blocks[0]?.id || 'block-general'),
        code: String(obj.code || 'SUBJ-MED').toUpperCase(),
        titleEn: String(obj.titleEn || obj.titleAr || obj.id),
        titleAr: String(obj.titleAr || obj.titleEn || obj.id),
        descriptionEn: String(obj.descriptionEn || obj.titleEn || obj.id),
        descriptionAr: String(obj.descriptionAr || obj.titleAr || ''),
        order: typeof obj.order === 'number' ? obj.order : buckets.subjects.length + 1,
        createdAt: String(obj.createdAt || new Date().toISOString()),
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
    }
  }

  const pushTopics = Array.isArray(inner.topics) ? inner.topics : [];
  pushTopics.forEach((tp, idx) => {
    if (tp && typeof tp === 'object') {
      const norm = normalizeTopicArticle(tp as Record<string, unknown>, idx);
      if (norm) buckets.topics.push(norm);
    }
  });

  const pushTerms = Array.isArray(inner.terms) ? inner.terms : [];
  pushTerms.forEach((tm, idx) => {
    if (tm && typeof tm === 'object') {
      const norm = normalizeDictionaryTerm(tm as Record<string, unknown>, idx);
      if (norm) buckets.terms.push(norm);
    }
  });

  const pushSentences = Array.isArray(inner.sentences) ? inner.sentences : [];
  pushSentences.forEach((sn, idx) => {
    if (sn && typeof sn === 'object') {
      const obj = sn as Record<string, unknown>;
      if (!obj.en) return;
      buckets.sentences.push({
        id: String(obj.id || `sen-imp-${Date.now()}-${idx}`),
        en: String(obj.en),
        ar: String(obj.ar || ''),
        category: asLexiconCategory(obj.category),
        sourceType: 'manual',
        linkedTermIds: Array.isArray(obj.linkedTermIds)
          ? obj.linkedTermIds.map((id) => String(id))
          : [],
        tags: Array.isArray(obj.tags) ? obj.tags.map((t) => String(t)) : [],
        favorite: Boolean(obj.favorite),
        createdAt: String(obj.createdAt || new Date().toISOString())
      });
    }
  });

  const pushAffixes = Array.isArray(inner.customAffixes || inner.affixes)
    ? ((inner.customAffixes || inner.affixes) as unknown[])
    : [];
  for (const af of pushAffixes) {
    if (af && typeof af === 'object') {
      const obj = af as Record<string, unknown>;
      if (obj.cleanKey && obj.meaningAr) {
        buckets.affixes.push(obj as unknown as MorphologicalAffix);
      }
    }
  }

  const pushAbbrs = Array.isArray(
    inner.customAbbreviations || inner.abbreviations
  )
    ? ((inner.customAbbreviations || inner.abbreviations) as unknown[])
    : [];
  for (const ab of pushAbbrs) {
    if (ab && typeof ab === 'object') {
      const obj = ab as Record<string, unknown>;
      if (obj.abbr && obj.expansionEn) {
        buckets.abbreviations.push(obj as unknown as ClinicalAbbreviation);
      }
    }
  }

  const pushBooks = Array.isArray(inner.books) ? inner.books : [];
  for (const bk of pushBooks) {
    if (bk && typeof bk === 'object') {
      const obj = bk as Record<string, unknown>;
      if (!obj.id && !obj.titleEn && !obj.titleAr) continue;
      buckets.books.push({
        id: String(obj.id || `book-imp-${Date.now()}-${buckets.books.length}`),
        blockId: typeof obj.blockId === 'string' ? obj.blockId : undefined,
        subjectId: typeof obj.subjectId === 'string' ? obj.subjectId : undefined,
        topicIds: Array.isArray(obj.topicIds) ? (obj.topicIds as string[]) : undefined,
        titleEn: String(obj.titleEn || obj.titleAr || 'Medical Book'),
        titleAr: String(obj.titleAr || obj.titleEn || 'كتاب طبي'),
        authors: Array.isArray(obj.authors)
          ? obj.authors.map((a) => String(a))
          : typeof obj.authors === 'string'
            ? [obj.authors]
            : [],
        edition: typeof obj.edition === 'string' ? obj.edition : undefined,
        year:
          typeof obj.year === 'number'
            ? obj.year
            : typeof obj.publishYear === 'number'
              ? obj.publishYear
              : undefined,
        language:
          obj.language === 'ar' || obj.language === 'en' || obj.language === 'bilingual'
            ? obj.language
            : 'en',
        fileFormat:
          obj.fileFormat === 'pdf' || obj.fileFormat === 'epub' || obj.fileFormat === 'html'
            ? obj.fileFormat
            : 'pdf',
        pdfUrl: typeof obj.pdfUrl === 'string' ? obj.pdfUrl : undefined,
        mediaUrl: typeof obj.mediaUrl === 'string' ? obj.mediaUrl : undefined,
        externalUrl: typeof obj.externalUrl === 'string' ? obj.externalUrl : undefined,
        coverUrl: typeof obj.coverUrl === 'string' ? obj.coverUrl : undefined,
        sizeBytes: typeof obj.sizeBytes === 'number' ? obj.sizeBytes : undefined,
        pageCount: typeof obj.pageCount === 'number' ? obj.pageCount : undefined,
        chapters: Array.isArray(obj.chapters)
          ? (obj.chapters as AcademicBookResource['chapters'])
          : undefined,
        descriptionAr:
          typeof obj.descriptionAr === 'string'
            ? obj.descriptionAr
            : typeof obj.summaryAr === 'string'
              ? obj.summaryAr
              : undefined,
        sha256: typeof obj.sha256 === 'string' ? obj.sha256 : undefined,
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
    }
  }

  const pushExams = Array.isArray(inner.exams) ? inner.exams : [];
  for (const ex of pushExams) {
    if (ex && typeof ex === 'object') {
      const obj = ex as Record<string, unknown>;
      if (!obj.id && !obj.titleEn && !obj.titleAr) continue;
      const inlineQs: UnifiedQuizQuestion[] = Array.isArray(obj.questions)
        ? obj.questions
            .map((q, qIdx) =>
              normalizeQuestionItem(
                (q && typeof q === 'object' ? q : {}) as Record<string, unknown>,
                qIdx
              )
            )
            .filter((q): q is UnifiedQuizQuestion => q !== null)
        : [];
      for (const iq of inlineQs) {
        buckets.questions.push(iq);
      }
      buckets.exams.push({
        id: String(obj.id || `exam-imp-${Date.now()}-${buckets.exams.length}`),
        titleEn: String(obj.titleEn || obj.titleAr || 'Medical Exam'),
        titleAr: String(obj.titleAr || obj.titleEn || 'اختبار طبي'),
        blockId: typeof obj.blockId === 'string' ? obj.blockId : undefined,
        subjectId: typeof obj.subjectId === 'string' ? obj.subjectId : undefined,
        topicIds: Array.isArray(obj.topicIds) ? (obj.topicIds as string[]) : undefined,
        durationMinutes:
          typeof obj.durationMinutes === 'number'
            ? obj.durationMinutes
            : typeof obj.timeLimitMinutes === 'number'
              ? obj.timeLimitMinutes
              : undefined,
        passingPercent:
          typeof obj.passingPercent === 'number'
            ? obj.passingPercent
            : typeof obj.passingScorePercent === 'number'
              ? obj.passingScorePercent
              : undefined,
        questionIds: Array.isArray(obj.questionIds)
          ? obj.questionIds.map((id) => String(id))
          : inlineQs.map((q) => q.id),
        questions: inlineQs.length > 0 ? inlineQs : undefined,
        sha256: typeof obj.sha256 === 'string' ? obj.sha256 : undefined,
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
    }
  }

  const pushQuestions = Array.isArray(inner.quizQuestions || inner.questions)
    ? ((inner.quizQuestions || inner.questions) as unknown[])
    : [];
  pushQuestions.forEach((q, idx) => {
    if (q && typeof q === 'object') {
      const norm = normalizeQuestionItem(q as Record<string, unknown>, idx);
      if (norm) buckets.questions.push(norm);
    }
  });

  const pushMediaAssets = Array.isArray(inner.mediaAssets) ? inner.mediaAssets : [];
  for (const ma of pushMediaAssets) {
    if (ma && typeof ma === 'object') {
      const obj = ma as Record<string, unknown>;
      if (obj.id && (obj.url || obj.fileName)) {
        buckets.mediaAssets.push(obj as unknown as MediaAssetRecord);
      }
    }
  }

  // Also allow single top-level entity object if no array wrapper matched
  if (
    pushBlocks.length === 0 &&
    pushSubjects.length === 0 &&
    pushTopics.length === 0 &&
    pushTerms.length === 0 &&
    pushSentences.length === 0 &&
    pushBooks.length === 0 &&
    pushExams.length === 0 &&
    pushQuestions.length === 0
  ) {
    collectFromParsedJson([inner], buckets);
  }
}

/**
 * Deterministic universal importer supporting:
 * - JSON / Markdown ```json code blocks generated by ChatGPT or Gemini
 * - UMEDT-DATA catalog/master entities (Blocks, Subjects, Topics, Books, Exams, Questions, Terms, Sentences, Affixes, Abbreviations, MediaAssets)
 * - UMEDT backup & granular packages
 * - Structured CSV / TSV / dash-delimited term lists
 */
export function importUniversalAiOrLocalContent(params: {
  rawText: string;
  conflictPolicy?: 'ignore' | 'merge' | 'overwrite';
  sourceLabel?: string;
  syncToCloud?: boolean;
}): UniversalImportReport {
  const mode = params.conflictPolicy || 'merge';
  const currentState = loadAppState();
  const currentBlocks = loadMedicalBlocks();
  const currentSubjects = loadMedicalSubjects();
  const currentBooks = loadAcademicBooks();
  const currentExams = loadAcademicExams();
  const currentQuestions = loadQuizQuestions(currentState.topics, currentState.terms);
  const currentMediaAssets = loadMediaAssetsIndex();

  const emptyStateReturn = {
    terms: currentState.terms,
    sentences: currentState.sentences,
    topics: currentState.topics,
    customAffixes: currentState.customAffixes,
    customAbbreviations: currentState.customAbbreviations,
    blocks: currentBlocks,
    subjects: currentSubjects,
    books: currentBooks,
    exams: currentExams,
    questions: currentQuestions,
    mediaAssets: currentMediaAssets
  };

  const buckets: ParsedBuckets = {
    blocks: [],
    subjects: [],
    topics: [],
    terms: [],
    sentences: [],
    affixes: [],
    abbreviations: [],
    books: [],
    exams: [],
    questions: [],
    mediaAssets: [],
    sourceFormat: 'unknown'
  };

  const warnings: string[] = [];
  const errors: string[] = [];

  const jsonCandidates = extractJsonCandidatesFromText(params.rawText);
  if (jsonCandidates.length > 0) {
    for (const candidate of jsonCandidates) {
      try {
        const parsed = JSON.parse(candidate);
        collectFromParsedJson(parsed, buckets);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'JSON parse error');
      }
    }
  } else {
    // Delimited text fallback (CSV / TSV / Markdown lines)
    buckets.sourceFormat = 'delimited-text';
    const lines = params.rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 1 && !l.startsWith('```') && !l.startsWith('#'));

    lines.forEach((line, idx) => {
      const cleaned = line.replace(/^[-*•\d.)]+\s*/, '');
      const parts = cleaned.includes('\t')
        ? cleaned.split('\t')
        : cleaned.includes(' - ')
          ? cleaned.split(' - ')
          : cleaned.includes(' : ')
            ? cleaned.split(' : ')
            : cleaned.split(',');
      const tEn = (parts[0] || '').trim().replace(/^["']|["']$/g, '');
      if (!tEn || /^(term|term_en|english)$/i.test(tEn)) return;
      const tAr = (parts[1] || '').trim().replace(/^["']|["']$/g, '') || 'مصطلح طبي';
      const defAr =
        (parts[2] || '').trim().replace(/^["']|["']$/g, '') ||
        `مصطلح طبي سريري يعني ${tAr}.`;
      const defEn =
        (parts[3] || '').trim().replace(/^["']|["']$/g, '') ||
        `Clinical medical term: ${tEn}.`;
      const tm = normalizeDictionaryTerm(
        {
          id: `u-txt-${Date.now()}-${idx}`,
          term: tEn,
          translation: tAr,
          definitionAr: defAr,
          definitionEn: defEn
        },
        idx
      );
      if (tm) buckets.terms.push(tm);
    });
  }

  const totalParsed =
    buckets.blocks.length +
    buckets.subjects.length +
    buckets.topics.length +
    buckets.terms.length +
    buckets.sentences.length +
    buckets.affixes.length +
    buckets.abbreviations.length +
    buckets.books.length +
    buckets.exams.length +
    buckets.questions.length +
    buckets.mediaAssets.length;

  if (totalParsed === 0) {
    return {
      success: false,
      sourceFormat: buckets.sourceFormat,
      counts: {
        blocks: 0,
        subjects: 0,
        topics: 0,
        terms: 0,
        sentences: 0,
        affixes: 0,
        abbreviations: 0,
        books: 0,
        exams: 0,
        questions: 0,
        mediaAssets: 0,
        skippedDuplicates: 0
      },
      warnings,
      errors: errors.length > 0 ? errors : ['لم يتم العثور على بيانات متوافقة مع بنية UMEDT.'],
      messageAr: 'لم يتم العثور على سجلات صالحة متوافقة مع UMEDT في النص أو الملف.',
      summaryText: 'لا توجد عناصر مستوردة',
      updatedTerms: emptyStateReturn.terms,
      updatedSentences: emptyStateReturn.sentences,
      updatedTopics: emptyStateReturn.topics,
      updatedAffixes: emptyStateReturn.customAffixes,
      updatedAbbreviations: emptyStateReturn.customAbbreviations,
      updatedState: emptyStateReturn
    };
  }

  // Create pre-import safety backup snapshot
  let preBackupId = '';
  try {
    void createDataBackupSnapshot({
      trigger: 'manual',
      label: params.sourceLabel || 'نسخ تلقائي قبل الاستيراد الشامل'
    }).then((snap) => {
      preBackupId = snap.backupId;
    });
  } catch {
    // Non-fatal in constrained test environments
  }

  let skippedDuplicates = 0;
  const counts = {
    blocks: 0,
    subjects: 0,
    topics: 0,
    terms: 0,
    sentences: 0,
    affixes: 0,
    abbreviations: 0,
    books: 0,
    exams: 0,
    questions: 0,
    mediaAssets: 0,
    skippedDuplicates: 0
  };

  try {
    const removed = loadLocallyRemovedRegistry();

    // 1. Merge Blocks
    const blocksMap = new Map(currentBlocks.map((b) => [b.id, b]));
    for (const blk of buckets.blocks) {
      removed.blocks = removed.blocks.filter((id) => id !== blk.id);
      const exists = blocksMap.get(blk.id);
      if (exists && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      blocksMap.set(blk.id, exists && mode === 'merge' ? { ...exists, ...blk } : blk);
      counts.blocks++;
    }
    const nextBlocks = Array.from(blocksMap.values()).sort((a, b) => a.order - b.order);

    // 2. Merge Subjects
    const subjectsMap = new Map(currentSubjects.map((s) => [s.id, s]));
    for (const subj of buckets.subjects) {
      removed.subjects = removed.subjects.filter((id) => id !== subj.id);
      const exists = subjectsMap.get(subj.id);
      if (exists && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      subjectsMap.set(
        subj.id,
        exists && mode === 'merge' ? { ...exists, ...subj } : subj
      );
      counts.subjects++;
    }
    const nextSubjects = Array.from(subjectsMap.values()).sort((a, b) => a.order - b.order);

    // 3. Merge Topics (preserve existing favorite state)
    const topicsMap = new Map(currentState.topics.map((t) => [t.id, t]));
    const topicTitleToId = new Map(
      currentState.topics.map((t) => [(t.titleEn || t.title).toLowerCase(), t.id])
    );
    const mergedTopicsBatch: TopicArticle[] = [];
    for (const tp of buckets.topics) {
      removed.topics = removed.topics.filter((id) => id !== tp.id);
      const matchedId = topicsMap.has(tp.id)
        ? tp.id
        : topicTitleToId.get((tp.titleEn || tp.title).toLowerCase());
      const existing = matchedId ? topicsMap.get(matchedId) : undefined;
      if (existing && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      const nextTp: TopicArticle = existing
        ? {
            ...tp,
            id: existing.id,
            favorite: existing.favorite || tp.favorite
          }
        : tp;
      topicsMap.set(nextTp.id, nextTp);
      topicTitleToId.set((nextTp.titleEn || nextTp.title).toLowerCase(), nextTp.id);
      mergedTopicsBatch.push(nextTp);
      counts.topics++;
    }
    const nextTopics = enrichAllTopicsWithHierarchy(Array.from(topicsMap.values()));

    // 4. Merge Terms (strict user-state preservation: favorite, collections, srsData)
    const termsMap = new Map(currentState.terms.map((t) => [t.id, t]));
    const termNormToId = new Map(
      currentState.terms.map((t) => [(t.termNormalized || t.term).toLowerCase(), t.id])
    );
    const mergedTermsBatch: DictionaryTerm[] = [];
    for (const tm of buckets.terms) {
      const normKey = tm.term.trim().toLowerCase();
      const matchedId = termsMap.has(tm.id) ? tm.id : termNormToId.get(normKey);
      const existing = matchedId ? termsMap.get(matchedId) : undefined;
      if (existing && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      const preservedCollections = existing
        ? Array.from(new Set([...(existing.collections || []), ...(tm.collections || [])]))
        : tm.collections;
      const mergedExamples = existing && mode === 'merge'
        ? [
            ...existing.examples,
            ...tm.examples.filter(
              (nex) =>
                !existing.examples.some(
                  (eex) => eex.en.trim().toLowerCase() === nex.en.trim().toLowerCase()
                )
            )
          ]
        : tm.examples;
      const nextTerm: DictionaryTerm = existing
        ? {
            ...existing,
            ...tm,
            id: existing.id,
            termNormalized: normKey,
            favorite: Boolean(existing.favorite || tm.favorite),
            collections: preservedCollections,
            srsData: existing.srsData || tm.srsData,
            lastStudiedAt: existing.lastStudiedAt || tm.lastStudiedAt,
            studyCount: existing.studyCount ?? tm.studyCount,
            examples: mergedExamples
          }
        : tm;
      termsMap.set(nextTerm.id, nextTerm);
      termNormToId.set(normKey, nextTerm.id);
      mergedTermsBatch.push(nextTerm);
      counts.terms++;
    }
    const nextTerms = autoEnrichAllTermsRelations(Array.from(termsMap.values()));

    // 5. Merge Sentences (preserve favorite & srsData)
    const sentencesMap = new Map(currentState.sentences.map((s) => [s.id, s]));
    const sentEnToId = new Map(
      currentState.sentences.map((s) => [s.en.trim().toLowerCase(), s.id])
    );
    for (const sn of buckets.sentences) {
      const normEn = sn.en.trim().toLowerCase();
      const matchedId = sentencesMap.has(sn.id) ? sn.id : sentEnToId.get(normEn);
      const existing = matchedId ? sentencesMap.get(matchedId) : undefined;
      if (existing && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      const nextSn: LinkedSentence = existing
        ? {
            ...existing,
            ...sn,
            id: existing.id,
            favorite: Boolean(existing.favorite || sn.favorite),
            srsData: existing.srsData || sn.srsData
          }
        : sn;
      sentencesMap.set(nextSn.id, nextSn);
      sentEnToId.set(normEn, nextSn.id);
      counts.sentences++;
    }
    const nextSentences = syncTermExamplesToSentences(
      nextTerms,
      Array.from(sentencesMap.values())
    );

    // 6. Merge Affixes & Abbreviations
    const affixMap = new Map(
      currentState.customAffixes.map((a) => [`${a.cleanKey.toLowerCase()}_${a.type}`, a])
    );
    for (const af of buckets.affixes) {
      const key = `${af.cleanKey.toLowerCase()}_${af.type}`;
      if (affixMap.has(key) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      affixMap.set(key, af);
      counts.affixes++;
    }
    const nextAffixes = Array.from(affixMap.values());

    const abbrMap = new Map(
      currentState.customAbbreviations.map((a) => [a.abbr.toLowerCase(), a])
    );
    for (const ab of buckets.abbreviations) {
      const key = ab.abbr.toLowerCase();
      if (abbrMap.has(key) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      abbrMap.set(key, ab);
      counts.abbreviations++;
    }
    const nextAbbrs = Array.from(abbrMap.values());

    // 7. Merge Books, Exams, Validated Questions, and MediaAssets
    const booksMap = new Map(currentBooks.map((b) => [b.id, b]));
    for (const bk of buckets.books) {
      removed.books = (removed.books || []).filter((id) => id !== bk.id);
      if (booksMap.has(bk.id) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      booksMap.set(bk.id, bk);
      counts.books++;
    }
    const nextBooks = Array.from(booksMap.values());

    const examsMap = new Map(currentExams.map((e) => [e.id, e]));
    for (const ex of buckets.exams) {
      removed.exams = (removed.exams || []).filter((id) => id !== ex.id);
      if (examsMap.has(ex.id) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      examsMap.set(ex.id, ex);
      counts.exams++;
    }
    const nextExams = Array.from(examsMap.values());

    const qMap = new Map(currentQuestions.map((q) => [q.id, q]));
    for (const q of buckets.questions) {
      const v = validateSingleQuizQuestion(q);
      if (!v.valid) {
        const errIssue = v.issues.find((iss) => iss.severity === 'error');
        warnings.push(`تم تجاوز سؤال (${q.id}): ${errIssue?.messageAr || v.issues[0]?.messageAr || 'غير مكتمل'}`);
        continue;
      }
      if (qMap.has(q.id) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      qMap.set(q.id, q);
      counts.questions++;
    }
    const nextQuestions = Array.from(qMap.values());

    const maMap = new Map(currentMediaAssets.map((m) => [m.id, m]));
    for (const ma of buckets.mediaAssets) {
      if (maMap.has(ma.id) && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      maMap.set(ma.id, ma);
      counts.mediaAssets++;
    }
    const nextMediaAssets = Array.from(maMap.values());

    counts.skippedDuplicates = skippedDuplicates;

    // Persist atomically to local stores
    saveMedicalBlocks(nextBlocks);
    saveMedicalSubjects(nextSubjects);
    saveTopics(nextTopics);
    saveTerms(nextTerms);
    saveSentences(nextSentences);
    saveCustomAffixes(nextAffixes);
    saveCustomAbbreviations(nextAbbrs);
    saveAcademicBooks(nextBooks);
    saveAcademicExams(nextExams);
    saveQuizQuestions(nextQuestions);
    saveMediaAssetsIndex(nextMediaAssets);
    saveStudyStats(currentState.studyStats);
    saveLocallyRemovedRegistry(removed);

    // Update Unified Cloud Mirror & Queue
    const updatedMirror = mergeRecordsIntoCloudSnapshot(loadUnifiedCloudMirror(), {
      blocks: buckets.blocks,
      subjects: buckets.subjects,
      topics: mergedTopicsBatch,
      terms: mergedTermsBatch,
      sentences: buckets.sentences,
      books: buckets.books,
      exams: buckets.exams,
      quizQuestions: buckets.questions,
      mediaAssets: buckets.mediaAssets,
      customAffixes: buckets.affixes,
      customAbbreviations: buckets.abbreviations
    });
    saveUnifiedCloudMirror(updatedMirror.snapshot);

    if (params.syncToCloud !== false) {
      void enqueueEntitiesForCloudSync({
        blocks: buckets.blocks,
        subjects: buckets.subjects,
        topics: mergedTopicsBatch,
        terms: mergedTermsBatch,
        sentences: buckets.sentences
      });
    }

    const summaryParts: string[] = [];
    if (counts.blocks > 0) summaryParts.push(`${counts.blocks} بلوك`);
    if (counts.subjects > 0) summaryParts.push(`${counts.subjects} مادة`);
    if (counts.topics > 0) summaryParts.push(`${counts.topics} موضوع`);
    if (counts.books > 0) summaryParts.push(`${counts.books} كتاب`);
    if (counts.exams > 0) summaryParts.push(`${counts.exams} اختبار`);
    if (counts.questions > 0) summaryParts.push(`${counts.questions} سؤال`);
    if (counts.terms > 0) summaryParts.push(`${counts.terms} مصطلح`);
    if (counts.sentences > 0) summaryParts.push(`${counts.sentences} جملة`);
    if (counts.affixes > 0) summaryParts.push(`${counts.affixes} جذر`);
    if (counts.abbreviations > 0) summaryParts.push(`${counts.abbreviations} اختصار`);

    const summaryLabel =
      summaryParts.length > 0 ? summaryParts.join(' · ') : 'محتوى مطابق مسبقاً';

    return {
      success: true,
      sourceFormat: buckets.sourceFormat,
      counts,
      warnings,
      errors,
      messageAr:
        summaryParts.length > 0
          ? `تم الاستيراد بنجاح (${summaryLabel})`
          : 'جميع العناصر المستوردة مطابقة للمحتوى المحلي مسبقاً.',
      summaryText: summaryLabel,
      updatedTerms: nextTerms,
      updatedSentences: nextSentences,
      updatedTopics: nextTopics,
      updatedAffixes: nextAffixes,
      updatedAbbreviations: nextAbbrs,
      updatedState: {
        terms: nextTerms,
        sentences: nextSentences,
        topics: nextTopics,
        customAffixes: nextAffixes,
        customAbbreviations: nextAbbrs,
        blocks: nextBlocks,
        subjects: nextSubjects,
        books: nextBooks,
        exams: nextExams,
        questions: nextQuestions,
        mediaAssets: nextMediaAssets
      }
    };
  } catch (err) {
    if (preBackupId) {
      void restoreDataBackupById(preBackupId);
    }
    const msg =
      err instanceof Error ? err.message : 'فشل الاستيراد — تم التراجع عن التغييرات.';
    return {
      success: false,
      sourceFormat: buckets.sourceFormat,
      counts,
      warnings,
      errors: [msg],
      messageAr: msg,
      summaryText: msg,
      updatedTerms: emptyStateReturn.terms,
      updatedSentences: emptyStateReturn.sentences,
      updatedTopics: emptyStateReturn.topics,
      updatedAffixes: emptyStateReturn.customAffixes,
      updatedAbbreviations: emptyStateReturn.customAbbreviations,
      updatedState: emptyStateReturn
    };
  }
}
