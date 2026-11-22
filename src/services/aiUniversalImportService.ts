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
  QuizAttemptRecord,
  StudyStats,
  TopicArticle,
  TopicCategory,
  TopicContentBlock,
  TopicSection,
  UnifiedMatchingPair,
  UnifiedQuestionType,
  UnifiedQuizOption,
  UnifiedQuizQuestion,
  UserStudyNoteRecord,
  DynamicCatalogCollection,
  DynamicCatalogItem
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
  LEARNING_STORAGE_KEYS,
  enrichAllTopicsWithHierarchy,
  loadAcademicBooks,
  loadAcademicExams,
  loadMediaAssetsIndex,
  loadMedicalBlocks,
  loadMedicalSubjects,
  loadUserStudyNotes,
  saveAcademicBooks,
  saveAcademicExams,
  saveMediaAssetsIndex,
  saveMedicalBlocks,
  saveMedicalSubjects,
  saveUserStudyNotes,
  normalizeAcademicBookResource,
  normalizeAcademicExamPackage,
  normalizeMediaAssetRecord
} from './learningHierarchyService';
import {
  loadQuizAttempts,
  loadQuizQuestions,
  saveQuizQuestions,
  validateSingleQuizQuestion
} from './quizEngineService';
import { autoEnrichAllTermsRelations } from '../engine/knowledgeLinker';
import {
  deduplicateTopicMediaAndAttachments,
  enqueueEntitiesForCloudSync,
  loadLocallyRemovedRegistry,
  loadPermanentlyDeletedRegistry,
  loadUnifiedCloudMirror,
  mergeRecordsIntoCloudSnapshot,
  saveLocallyRemovedRegistry,
  savePermanentlyDeletedRegistry,
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

function repairLooseJsonString(input: string): string {
  // Strip UTF-8 BOM if present and remove trailing commas before } or ]
  return input
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function tryParseJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const repaired = repairLooseJsonString(trimmed);
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }
}

export function extractJsonCandidatesFromText(rawText: string): string[] {
  const clean = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const candidates: string[] = [];

  // 1. Direct JSON object or array
  if (
    (clean.startsWith('{') && clean.endsWith('}')) ||
    (clean.startsWith('[') && clean.endsWith(']'))
  ) {
    const direct = tryParseJsonCandidate(clean);
    if (direct) return [direct];
  }

  // 2. Markdown ```json ... ``` or ``` ... ``` code blocks (ChatGPT / Gemini output)
  const fenceRegex = /```(?:json|JSON|jsonl|JSONL|javascript|js|ts)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;
  while ((match = fenceRegex.exec(clean)) !== null) {
    const inner = match[1]?.trim();
    if (!inner) continue;
    const directInner = tryParseJsonCandidate(inner);
    if (directInner) {
      candidates.push(directInner);
      continue;
    }
    const innerSubstrings = extractAllOuterJsonSubstrings(inner);
    if (innerSubstrings.length > 0) {
      candidates.push(...innerSubstrings);
    }
  }

  if (candidates.length > 0) return candidates;

  // 3. JSONL / NDJSON (each line is a standalone JSON object)
  const nonEmptyLines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}'));
  if (nonEmptyLines.length >= 2) {
    const jsonlMatches: string[] = [];
    for (const line of nonEmptyLines) {
      const validLine = tryParseJsonCandidate(line);
      if (validLine) jsonlMatches.push(validLine);
    }
    if (jsonlMatches.length >= 2) {
      return [`[${jsonlMatches.join(',')}]`];
    }
  }

  // 4. Raw prose wrapping one or more JSON objects or arrays
  const allOuter = extractAllOuterJsonSubstrings(clean);
  if (allOuter.length > 0) {
    candidates.push(...allOuter);
  }

  return candidates;
}

function extractAllOuterJsonSubstrings(text: string): string[] {
  const results: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextObj = text.indexOf('{', cursor);
    const nextArr = text.indexOf('[', cursor);
    let start = -1;
    if (nextObj !== -1 && nextArr !== -1) {
      start = Math.min(nextObj, nextArr);
    } else {
      start = Math.max(nextObj, nextArr);
    }
    if (start === -1) break;

    const openCh = text[start];
    const closeCh = openCh === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let matchedEnd = -1;

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
          matchedEnd = i;
          break;
        }
      }
    }

    if (matchedEnd !== -1) {
      const slice = text.slice(start, matchedEnd + 1);
      const valid = tryParseJsonCandidate(slice);
      if (valid) {
        results.push(valid);
        cursor = matchedEnd + 1;
        continue;
      }
    }
    cursor = start + 1;
  }

  return results;
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

  const rawTypeStr = String(raw.type || 'single_choice').toLowerCase();
  const mappedTypeStr =
    rawTypeStr === 'clinical_vignette' ||
    rawTypeStr === 'term_definition' ||
    rawTypeStr === 'term_meaning' ||
    rawTypeStr === 'mcq_single' ||
    rawTypeStr === 'mcq' ||
    rawTypeStr === 'clinical_case'
      ? 'single_choice'
      : rawTypeStr === 'mcq_multi' || rawTypeStr === 'multiple_choice'
        ? 'multiple_select'
        : rawTypeStr === 'image_question'
          ? 'image_based'
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
    const rawAns = raw.correctAnswer.trim().toUpperCase();
    if (qType === 'true_false') {
      correctKeys = [rawAns.startsWith('F') || rawAns === 'خطأ' ? 'F' : 'T'];
    } else {
      correctKeys = rawAns
        .split(/[,;|]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
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

function normalizeTermIdentity(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^a-z0-9'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDictionaryTerm(
  raw: Record<string, unknown>,
  idx: number
): DictionaryTerm | null {
  const termEn = String(
    raw.term || raw.en || raw.word || raw.titleEn || ''
  ).trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/\s+/g, ' ');
  const termWords = termEn ? termEn.split(' ') : [];
  const validTermWord = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$/;
  if (
    termWords.length < 1 ||
    termWords.length > 2 ||
    termWords.some((word) => !validTermWord.test(word))
  ) return null;
  const translation = String(
    raw.translation || raw.arabicTranslation || raw.ar || raw.meaning || raw.titleAr || ''
  ).trim();
  if (!translation || !/[\u0600-\u06FF]/.test(translation) || /^(مصطلح طبي|ترجمة عربية|غير معروف)$/i.test(translation)) return null;
  const defAr = String(raw.definitionAr || raw.arabicDefinition || raw.definition || '').trim();
  const defEn = String(raw.definitionEn || raw.englishDefinition || '').trim();

  const rawExamples = Array.isArray(raw.examples) ? raw.examples : [];
  const examples: DictionaryTerm['examples'] = rawExamples
    .map((ex) => {
      if (!ex || typeof ex !== 'object') return null;
      const exObj = ex as Record<string, unknown>;
      const en = String(exObj.en || exObj.sentenceEn || '').trim();
      if (!en) return null;
      return {
        en,
        ar: String(exObj.ar || exObj.sentenceAr || '')
      };
    })
    .filter((x): x is DictionaryTerm['examples'][number] => x !== null);

  if (
    examples.length === 0 &&
    typeof raw.exampleEn === 'string' &&
    raw.exampleEn.trim()
  ) {
    examples.push({
      en: raw.exampleEn.trim(),
      ar: typeof raw.exampleAr === 'string' ? raw.exampleAr.trim() : ''
    });
  }

  return {
    id: String(raw.id || `u-imp-${Date.now()}-${idx}`),
    term: termEn,
    termNormalized: normalizeTermIdentity(termEn),
    translation,
    phonetic: String(raw.phonetic || raw.pronunciation || ''),
    pos: 'term',
    category: 'General',
    keepEnglish: typeof raw.keepEnglish === 'boolean' ? raw.keepEnglish : true,
    favorite: Boolean(raw.favorite),
    collections: Array.isArray(raw.collections)
      ? raw.collections.map((c) => String(c))
      : [],
    ingestedAt: String(raw.ingestedAt || 'مستورد الآن'),
    definitionAr: defAr,
    definitionEn: defEn,
    examples,
    relations:
      raw.relations && typeof raw.relations === 'object'
        ? {
            synonyms: Array.isArray((raw.relations as Record<string, unknown>).synonyms)
              ? ((raw.relations as Record<string, unknown>).synonyms as unknown[]).map((s) => String(s))
              : [],
            broader: Array.isArray((raw.relations as Record<string, unknown>).broader)
              ? ((raw.relations as Record<string, unknown>).broader as unknown[]).map((s) => String(s))
              : [],
            related: Array.isArray((raw.relations as Record<string, unknown>).related)
              ? ((raw.relations as Record<string, unknown>).related as unknown[]).map((s) => String(s))
              : []
          }
        : { synonyms: [], broader: [], related: [] },
    linkedTopicIds: Array.isArray(raw.linkedTopicIds)
      ? raw.linkedTopicIds.map((s) => String(s))
      : typeof raw.topicId === 'string' && raw.topicId
        ? [raw.topicId]
        : undefined,
    linkedSubjectIds: Array.isArray(raw.linkedSubjectIds)
      ? raw.linkedSubjectIds.map((s) => String(s))
      : typeof raw.subjectId === 'string' && raw.subjectId
        ? [raw.subjectId]
        : undefined,
    linkedBlockIds: Array.isArray(raw.linkedBlockIds)
      ? raw.linkedBlockIds.map((s) => String(s))
      : typeof raw.blockId === 'string' && raw.blockId
        ? [raw.blockId]
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
  userNotes: UserStudyNoteRecord[];
  quizAttempts: QuizAttemptRecord[];
  studyStats: Partial<StudyStats> | null;
  dynamicCollections: DynamicCatalogCollection[];
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
        if (tp) {
          buckets.topics.push(tp);
          // Also harvest any inline nested arrays inside a Topic object
          if (Array.isArray(obj.terms) || Array.isArray(obj.questions) || Array.isArray(obj.sentences)) {
            collectFromParsedJson(
              {
                terms: Array.isArray(obj.terms)
                  ? obj.terms.map((t) =>
                      t && typeof t === 'object'
                        ? { ...(t as Record<string, unknown>), topicId: tp.id, subjectId: tp.subjectId, blockId: tp.blockId }
                        : t
                    )
                  : undefined,
                questions: Array.isArray(obj.questions)
                  ? obj.questions.map((q) =>
                      q && typeof q === 'object'
                        ? { ...(q as Record<string, unknown>), topicId: tp.id, subjectId: tp.subjectId, blockId: tp.blockId }
                        : q
                    )
                  : undefined,
                sentences: obj.sentences
              },
              buckets
            );
          }
        }
      } else if (obj.questionEn || obj.options || obj.correctOptionKeys) {
        const q = normalizeQuestionItem(obj, idx);
        if (q) buckets.questions.push(q);
      } else if (obj.questionIds && (obj.titleEn || obj.titleAr)) {
        buckets.exams.push(
          normalizeAcademicExamPackage(
            obj as Partial<AcademicExamPackage> & Record<string, unknown>
          )
        );
      } else if (
        obj.downloadUrl ||
        obj.pdfUrl ||
        obj.fileFormat ||
        obj.resourceKind ||
        obj.chapters
      ) {
        buckets.books.push(
          normalizeAcademicBookResource(
            obj as Partial<AcademicBookResource> & Record<string, unknown>
          )
        );
      } else if (
        obj.linkedEntityType ||
        obj.linkedEntityId ||
        obj.rawUrl ||
        (obj.mediaType && obj.url)
      ) {
        buckets.mediaAssets.push(
          normalizeMediaAssetRecord(
            obj as Partial<MediaAssetRecord> & Record<string, unknown>
          )
        );
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
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root.payload && typeof root.payload === 'object'
        ? (root.payload as Record<string, unknown>)
        : root.collections && typeof root.collections === 'object'
          ? (root.collections as Record<string, unknown>)
          : root.state && typeof root.state === 'object'
            ? (root.state as Record<string, unknown>)
            : root.snapshot && typeof root.snapshot === 'object'
              ? (root.snapshot as Record<string, unknown>)
              : root;

  const pushBlocks = Array.isArray(inner.blocks || inner.modules)
    ? ((inner.blocks || inner.modules) as unknown[])
    : [];
  for (const b of pushBlocks) {
    if (b && typeof b === 'object') {
      const obj = b as Record<string, unknown>;
      const blkId = String(obj.id || `block-ai-${Date.now()}-${buckets.blocks.length + 1}`);
      if (!obj.id && !obj.titleEn && !obj.titleAr) continue;
      buckets.blocks.push({
        id: blkId,
        code: String(obj.code || 'BLK-MED').toUpperCase(),
        titleEn: String(obj.titleEn || obj.titleAr || blkId),
        titleAr: String(obj.titleAr || obj.titleEn || blkId),
        descriptionEn: String(obj.descriptionEn || obj.titleEn || ''),
        descriptionAr: String(obj.descriptionAr || obj.titleAr || ''),
        colorAccent: String(obj.colorAccent || 'emerald'),
        order: typeof obj.order === 'number' ? obj.order : buckets.blocks.length + 1,
        createdAt: String(obj.createdAt || new Date().toISOString()),
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
      // Support nested subjects/topics/terms/questions inside a Block object
      if (
        Array.isArray(obj.subjects) ||
        Array.isArray(obj.topics) ||
        Array.isArray(obj.terms) ||
        Array.isArray(obj.questions) ||
        Array.isArray(obj.books) ||
        Array.isArray(obj.exams)
      ) {
        collectFromParsedJson(
          {
            subjects: Array.isArray(obj.subjects)
              ? obj.subjects.map((s) =>
                  s && typeof s === 'object'
                    ? { blockId: blkId, ...(s as Record<string, unknown>) }
                    : s
                )
              : undefined,
            topics: Array.isArray(obj.topics)
              ? obj.topics.map((t) =>
                  t && typeof t === 'object'
                    ? { blockId: blkId, ...(t as Record<string, unknown>) }
                    : t
                )
              : undefined,
            terms: obj.terms,
            questions: obj.questions,
            books: obj.books,
            exams: obj.exams
          },
          buckets
        );
      }
    }
  }

  const pushSubjects = Array.isArray(inner.subjects || inner.courses)
    ? ((inner.subjects || inner.courses) as unknown[])
    : [];
  for (const s of pushSubjects) {
    if (s && typeof s === 'object') {
      const obj = s as Record<string, unknown>;
      const subjId = String(obj.id || `subj-ai-${Date.now()}-${buckets.subjects.length + 1}`);
      if (!obj.id && !obj.titleEn && !obj.titleAr) continue;
      const parentBlkId = String(obj.blockId || buckets.blocks[0]?.id || 'block-general');
      buckets.subjects.push({
        id: subjId,
        blockId: parentBlkId,
        code: String(obj.code || 'SUBJ-MED').toUpperCase(),
        titleEn: String(obj.titleEn || obj.titleAr || subjId),
        titleAr: String(obj.titleAr || obj.titleEn || subjId),
        descriptionEn: String(obj.descriptionEn || obj.titleEn || subjId),
        descriptionAr: String(obj.descriptionAr || obj.titleAr || ''),
        order: typeof obj.order === 'number' ? obj.order : buckets.subjects.length + 1,
        createdAt: String(obj.createdAt || new Date().toISOString()),
        updatedAt: String(obj.updatedAt || new Date().toISOString())
      });
      // Support nested topics/terms/questions inside a Subject object
      if (
        Array.isArray(obj.topics) ||
        Array.isArray(obj.terms) ||
        Array.isArray(obj.questions) ||
        Array.isArray(obj.books) ||
        Array.isArray(obj.exams)
      ) {
        collectFromParsedJson(
          {
            topics: Array.isArray(obj.topics)
              ? obj.topics.map((t) =>
                  t && typeof t === 'object'
                    ? { blockId: parentBlkId, subjectId: subjId, ...(t as Record<string, unknown>) }
                    : t
                )
              : undefined,
            terms: obj.terms,
            questions: obj.questions,
            books: obj.books,
            exams: obj.exams
          },
          buckets
        );
      }
    }
  }

  const pushTopics = Array.isArray(inner.topics || inner.articles)
    ? ((inner.topics || inner.articles) as unknown[])
    : [];
  pushTopics.forEach((tp, idx) => {
    if (tp && typeof tp === 'object') {
      const tpObj = tp as Record<string, unknown>;
      const norm = normalizeTopicArticle(tpObj, idx);
      if (norm) {
        buckets.topics.push(norm);
        if (
          Array.isArray(tpObj.terms) ||
          Array.isArray(tpObj.questions) ||
          Array.isArray(tpObj.sentences)
        ) {
          collectFromParsedJson(
            {
              terms: Array.isArray(tpObj.terms)
                ? tpObj.terms.map((t) =>
                    t && typeof t === 'object'
                      ? { ...(t as Record<string, unknown>), topicId: norm.id, subjectId: norm.subjectId, blockId: norm.blockId }
                      : t
                  )
                : undefined,
              questions: Array.isArray(tpObj.questions)
                ? tpObj.questions.map((q) =>
                    q && typeof q === 'object'
                      ? { ...(q as Record<string, unknown>), topicId: norm.id, subjectId: norm.subjectId, blockId: norm.blockId }
                      : q
                  )
                : undefined,
              sentences: tpObj.sentences
            },
            buckets
          );
        }
      }
    }
  });

  const pushTerms = Array.isArray(
    inner.terms || inner.dictionary || inner.lexicon || inner.vocabulary || inner.words
  )
    ? ((inner.terms ||
        inner.dictionary ||
        inner.lexicon ||
        inner.vocabulary ||
        inner.words) as unknown[])
    : [];
  pushTerms.forEach((tm, idx) => {
    if (tm && typeof tm === 'object') {
      const norm = normalizeDictionaryTerm(tm as Record<string, unknown>, idx);
      if (norm) buckets.terms.push(norm);
    }
  });

  const pushSentences = Array.isArray(inner.sentences || inner.linkedSentences)
    ? ((inner.sentences || inner.linkedSentences) as unknown[])
    : [];
  pushSentences.forEach((sn, idx) => {
    if (sn && typeof sn === 'object') {
      const obj = sn as Record<string, unknown>;
      const enText = String(obj.en || obj.sentenceEn || '').trim();
      if (!enText) return;
      buckets.sentences.push({
        id: String(obj.id || `sen-imp-${Date.now()}-${idx}`),
        en: enText,
        ar: String(obj.ar || obj.sentenceAr || ''),
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
  pushAffixes.forEach((af, idx) => {
    if (af && typeof af === 'object') {
      const obj = af as Record<string, unknown>;
      const cleanKey = String(obj.cleanKey || obj.affix || '')
        .replace(/^-|-$/g, '')
        .trim();
      const meaningAr = String(obj.meaningAr || obj.meaning || '').trim();
      if (cleanKey && meaningAr) {
        const affixType: MorphologicalAffix['type'] =
          obj.type === 'suffix'
            ? 'suffix'
            : obj.type === 'root'
              ? 'root'
              : 'prefix';
        buckets.affixes.push({
          id: String(obj.id || `aff-imp-${Date.now()}-${idx}`),
          affix:
            typeof obj.affix === 'string' && obj.affix.trim()
              ? obj.affix.trim()
              : affixType === 'prefix'
                ? `${cleanKey}-`
                : affixType === 'suffix'
                  ? `-${cleanKey}`
                  : cleanKey,
          cleanKey,
          type: affixType,
          meaningAr,
          meaningEn: String(obj.meaningEn || meaningAr),
          combiningRule: String(obj.combiningRule || 'Standard medical morphology'),
          examples: Array.isArray(obj.examples)
            ? obj.examples.map((e) => String(e))
            : []
        });
      }
    }
  });

  const pushAbbrs = Array.isArray(
    inner.customAbbreviations || inner.abbreviations
  )
    ? ((inner.customAbbreviations || inner.abbreviations) as unknown[])
    : [];
  pushAbbrs.forEach((ab, idx) => {
    if (ab && typeof ab === 'object') {
      const obj = ab as Record<string, unknown>;
      const abbr = String(obj.abbr || '').trim();
      const defaultExpansionEn = String(
        obj.defaultExpansionEn || obj.expansionEn || ''
      ).trim();
      if (abbr && defaultExpansionEn) {
        const defaultTranslationAr = String(
          obj.defaultTranslationAr || obj.meaningAr || defaultExpansionEn
        ).trim();
        const spec = String(obj.specialty || 'General Medicine');
        buckets.abbreviations.push({
          id: String(obj.id || `abbr-imp-${Date.now()}-${idx}`),
          abbr,
          isAmbiguous: Boolean(obj.isAmbiguous),
          defaultExpansionEn,
          defaultTranslationAr,
          category: 'Ward & Hx',
          priority: typeof obj.priority === 'number' ? obj.priority : 90,
          candidates: Array.isArray(obj.candidates)
            ? (obj.candidates as ClinicalAbbreviation['candidates'])
            : [
                {
                  expansionEn: defaultExpansionEn,
                  translationAr: defaultTranslationAr,
                  specialty: spec,
                  triggers: []
                }
              ]
        });
      }
    }
  });

  const pushBooks = Array.isArray(inner.books) ? inner.books : [];
  for (const bk of pushBooks) {
    if (bk && typeof bk === 'object') {
      const obj = bk as Record<string, unknown>;
      if (!obj.id && !obj.titleEn && !obj.titleAr) continue;
      buckets.books.push(
        normalizeAcademicBookResource({
          ...obj,
          id: String(obj.id || `book-imp-${Date.now()}-${buckets.books.length}`),
          authors: Array.isArray(obj.authors)
            ? obj.authors.map((a) => String(a))
            : typeof obj.authors === 'string'
              ? [obj.authors]
              : [],
          year:
            typeof obj.year === 'number'
              ? obj.year
              : typeof obj.publicationYear === 'number'
                ? obj.publicationYear
                : typeof obj.publishYear === 'number'
                  ? obj.publishYear
                  : undefined,
          descriptionAr:
            typeof obj.descriptionAr === 'string'
              ? obj.descriptionAr
              : typeof obj.summaryAr === 'string'
                ? obj.summaryAr
                : undefined,
          updatedAt: String(obj.updatedAt || new Date().toISOString())
        })
      );
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
      buckets.exams.push(
        normalizeAcademicExamPackage({
          ...obj,
          id: String(obj.id || `exam-imp-${Date.now()}-${buckets.exams.length}`),
          durationMinutes:
            typeof obj.durationMinutes === 'number'
              ? obj.durationMinutes
              : typeof obj.timeLimitMinutes === 'number'
                ? obj.timeLimitMinutes
                : undefined,
          questionIds: Array.isArray(obj.questionIds)
            ? obj.questionIds.map((id) => String(id))
            : inlineQs.map((q) => q.id),
          questions: inlineQs.length > 0 ? inlineQs : undefined,
          updatedAt: String(obj.updatedAt || new Date().toISOString())
        })
      );
    }
  }

  const pushQuestions = Array.isArray(
    inner.quizQuestions || inner.questions || inner.mcqs || inner.questionBank
  )
    ? ((inner.quizQuestions ||
        inner.questions ||
        inner.mcqs ||
        inner.questionBank) as unknown[])
    : [];
  pushQuestions.forEach((q, idx) => {
    if (q && typeof q === 'object') {
      const norm = normalizeQuestionItem(q as Record<string, unknown>, idx);
      if (norm) buckets.questions.push(norm);
    }
  });

  const pushMediaAssets = Array.isArray(
    inner.mediaAssets || inner.mediaIndex || inner.assets
  )
    ? ((inner.mediaAssets || inner.mediaIndex || inner.assets) as unknown[])
    : [];
  for (const ma of pushMediaAssets) {
    if (ma && typeof ma === 'object') {
      const obj = ma as Record<string, unknown>;
      if (obj.id && (obj.url || obj.rawUrl || obj.fileName)) {
        buckets.mediaAssets.push(
          normalizeMediaAssetRecord(
            obj as Partial<MediaAssetRecord> & Record<string, unknown>
          )
        );
      }
    }
  }

  // Backup-specific user records: userNotes, quizAttempts, studyStats
  const pushUserNotes = Array.isArray(inner.userNotes) ? inner.userNotes : [];
  for (const un of pushUserNotes) {
    if (un && typeof un === 'object') {
      const obj = un as Record<string, unknown>;
      if (obj.id && typeof obj.content === 'string') {
        buckets.userNotes.push(obj as unknown as UserStudyNoteRecord);
      }
    }
  }

  const pushQuizAttempts = Array.isArray(inner.quizAttempts) ? inner.quizAttempts : [];
  for (const qa of pushQuizAttempts) {
    if (qa && typeof qa === 'object') {
      const obj = qa as Record<string, unknown>;
      if (obj.id && typeof obj.totalQuestions === 'number') {
        buckets.quizAttempts.push(obj as unknown as QuizAttemptRecord);
      }
    }
  }

  if (inner.studyStats && typeof inner.studyStats === 'object') {
    buckets.studyStats = inner.studyStats as Partial<StudyStats>;
  }

  // Auto-discover any extensible/unknown custom array collections cleanly as `generic_card`
  const knownInnerKeys = new Set([
    'blocks',
    'modules',
    'subjects',
    'courses',
    'topics',
    'articles',
    'terms',
    'dictionary',
    'lexicon',
    'vocabulary',
    'words',
    'sentences',
    'linkedSentences',
    'customAffixes',
    'affixes',
    'customAbbreviations',
    'abbreviations',
    'books',
    'exams',
    'quizQuestions',
    'questions',
    'mcqs',
    'questionBank',
    'mediaAssets',
    'mediaIndex',
    'assets',
    'mediaRecords',
    'userNotes',
    'quizAttempts',
    'studyStats',
    'settings',
    'versionMetadata',
    'contentTypesRegistry',
    'changelog',
    'tags'
  ]);
  for (const [key, val] of Object.entries(inner)) {
    if (knownInnerKeys.has(key) || !Array.isArray(val) || val.length === 0) continue;
    const dynItems: DynamicCatalogItem[] = [];
    val.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') return;
      const obj = entry as Record<string, unknown>;
      if (!obj.id && !obj.title && !obj.titleEn && !obj.titleAr && !obj.name) return;
      dynItems.push({
        id: String(obj.id || `${key}-${idx + 1}`),
        titleEn: typeof obj.titleEn === 'string' ? obj.titleEn : typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : `${key} #${idx + 1}`,
        titleAr: typeof obj.titleAr === 'string' ? obj.titleAr : typeof obj.title === 'string' ? obj.title : undefined,
        summaryEn: typeof obj.summaryEn === 'string' ? obj.summaryEn : typeof obj.descriptionEn === 'string' ? obj.descriptionEn : undefined,
        summaryAr: typeof obj.summaryAr === 'string' ? obj.summaryAr : typeof obj.descriptionAr === 'string' ? obj.descriptionAr : undefined,
        downloadUrl: typeof obj.downloadUrl === 'string' ? obj.downloadUrl : undefined,
        rawUrl: typeof obj.rawUrl === 'string' ? obj.rawUrl : typeof obj.url === 'string' ? obj.url : undefined,
        rawPayload: obj
      });
    });
    if (dynItems.length > 0) {
      buckets.dynamicCollections.push({
        id: key,
        name: key,
        contentType: key,
        rendererType: 'generic_card',
        displayNameAr: key,
        displayNameEn: key,
        recordCount: dynItems.length,
        items: dynItems
      });
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
    pushQuestions.length === 0 &&
    pushMediaAssets.length === 0 &&
    buckets.dynamicCollections.length === 0
  ) {
    collectFromParsedJson([inner], buckets);
  }
}

/**
 * Parses high-density structured text, Markdown hierarchy (# Block / ## Subject / ### Topic),
 * Markdown tables (| Term | Translation | ... |), and CSV/TSV/Pipe/Dash lines.
 */
function collectFromStructuredTextFallback(rawText: string, buckets: ParsedBuckets): void {
  buckets.sourceFormat = 'structured-text';
  const rawLines = rawText.split(/\r?\n/);

  let activeBlockId: string | undefined = undefined;
  let activeSubjectId: string | undefined = undefined;
  let activeTopic: TopicArticle | null = null;
  let activeSection: TopicSection | null = null;

  const flushActiveTopic = () => {
    if (activeTopic) {
      if (activeSection && activeSection.paragraphs.length > 0) {
        activeTopic.sections.push(activeSection);
        activeSection = null;
      }
      if (activeTopic.sections.length === 0) {
        const secId = `${activeTopic.id}-sec-1`;
        activeTopic.sections.push({
          id: secId,
          heading: 'Core Overview',
          headingEn: 'Core Overview',
          headingAr: 'الملخص العلمي',
          paragraphs: [activeTopic.subtitle || activeTopic.titleAr || activeTopic.titleEn],
          contentBlocks: [
            {
              id: `cblk-${secId}-1`,
              type: 'paragraph',
              order: 1,
              text: activeTopic.subtitle || activeTopic.titleAr || activeTopic.titleEn
            }
          ]
        });
      }
      buckets.topics.push(deduplicateTopicMediaAndAttachments(activeTopic));
      activeTopic = null;
    }
  };

  rawLines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('```')) return;

    // 1. High-density tagged lines: BLOCK || ..., SUBJECT || ..., TOPIC || ..., TERM || ..., SENTENCE || ..., QUESTION || ..., AFFIX || ..., ABBR || ...
    if (line.includes('||')) {
      const cols = line.split('||').map((c) => c.trim());
      const tag = (cols[0] || '').toUpperCase();

      if (tag === 'BLOCK' && cols.length >= 3) {
        const code = (cols[1] || `BLK-${buckets.blocks.length + 1}`).toUpperCase();
        const titleEn = cols[2] || code;
        const titleAr = cols[3] || titleEn;
        const descAr = cols[4] || titleAr;
        const blkId = `block-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        activeBlockId = blkId;
        buckets.blocks.push({
          id: blkId,
          code,
          titleEn,
          titleAr,
          descriptionEn: titleEn,
          descriptionAr: descAr,
          colorAccent: 'emerald',
          order: buckets.blocks.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return;
      }

      if (tag === 'SUBJECT' && cols.length >= 4) {
        const parentRef = cols[1] || activeBlockId || 'block-general';
        const matchedBlk = buckets.blocks.find(
          (b) => b.id === parentRef || b.code.toLowerCase() === parentRef.toLowerCase()
        );
        const blockId = matchedBlk?.id || activeBlockId || parentRef;
        const code = (cols[2] || `SUBJ-${buckets.subjects.length + 1}`).toUpperCase();
        const titleEn = cols[3] || code;
        const titleAr = cols[4] || titleEn;
        const descAr = cols[5] || titleAr;
        const subjId = `subj-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        activeSubjectId = subjId;
        buckets.subjects.push({
          id: subjId,
          blockId,
          code,
          titleEn,
          titleAr,
          descriptionEn: titleEn,
          descriptionAr: descAr,
          order: buckets.subjects.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return;
      }

      if (tag === 'TOPIC' && cols.length >= 3) {
        flushActiveTopic();
        const hasHierarchyCols = cols.length >= 5;
        const blockId = hasHierarchyCols ? cols[1] || activeBlockId : activeBlockId;
        const subjectId = hasHierarchyCols ? cols[2] || activeSubjectId : activeSubjectId;
        const titleEn = (hasHierarchyCols ? cols[3] : cols[1]) || `Topic ${buckets.topics.length + 1}`;
        const titleAr = (hasHierarchyCols ? cols[4] : cols[2]) || titleEn;
        const bodyText = (hasHierarchyCols ? cols[5] : cols[3]) || `${titleEn} — ${titleAr}`;
        const topicId = `topic-hd-${Date.now()}-${idx}`;
        const secId = `${topicId}-sec-1`;
        const paragraphs = bodyText
          .split(/\\n|;;/)
          .map((p) => p.trim())
          .filter(Boolean);
        buckets.topics.push({
          id: topicId,
          title: titleAr || titleEn,
          titleEn,
          titleAr,
          subtitle: titleAr,
          category: 'Medical',
          blockId,
          subjectId,
          author: 'استيراد UMEDT',
          publishedAt: new Date().toISOString().slice(0, 10),
          readingTimeMinutes: 6,
          favorite: false,
          sections: [
            {
              id: secId,
              heading: titleEn,
              headingEn: titleEn,
              headingAr: titleAr,
              paragraphs,
              contentBlocks: paragraphs.map((p, pIdx) => ({
                id: `cblk-${secId}-${pIdx + 1}`,
                type: 'paragraph' as const,
                order: pIdx + 1,
                text: p
              }))
            }
          ],
          images: [],
          links: [],
          attachments: []
        });
        return;
      }

      if (tag === 'TERM' && cols.length >= 3) {
        const termEn = cols[1] || '';
        const translation = cols[2] || 'مصطلح طبي';
        const pos = cols[3] || (termEn.includes(' ') ? 'phrase' : 'noun');
        const category = cols[4] || 'Medical';
        const defAr = cols[5] || `مصطلح طبي سريري يعني ${translation}.`;
        const defEn = cols[6] || `Clinical medical term: ${termEn}.`;
        const exEn = cols[7] || '';
        const exAr = cols[8] || '';
        const tm = normalizeDictionaryTerm(
          {
            id: `u-hd-term-${Date.now()}-${idx}`,
            term: termEn,
            translation,
            pos,
            category,
            definitionAr: defAr,
            definitionEn: defEn,
            exampleEn: exEn,
            exampleAr: exAr,
            blockId: activeBlockId,
            subjectId: activeSubjectId,
            topicId: activeTopic?.id
          },
          idx
        );
        if (tm) buckets.terms.push(tm);
        return;
      }

      if (tag === 'SENTENCE' && cols.length >= 3) {
        const en = cols[1] || '';
        const ar = cols[2] || '';
        const cat = cols[3] || 'Medical';
        if (en) {
          buckets.sentences.push({
            id: `sen-hd-${Date.now()}-${idx}`,
            en,
            ar,
            category: asLexiconCategory(cat),
            sourceType: 'manual',
            linkedTermIds: [],
            tags: [],
            favorite: false,
            createdAt: new Date().toISOString()
          });
        }
        return;
      }

      if (tag === 'QUESTION' && cols.length >= 5) {
        const qType = cols[1] || 'single_choice';
        const qEn = cols[2] || '';
        const qAr = cols[3] || '';
        const rawOpts = (cols[4] || '')
          .split(';')
          .map((o) => o.trim())
          .filter(Boolean);
        const ans = cols[5] || 'A';
        const expAr = cols[6] || '';
        const expEn = cols[7] || expAr || 'Core clinical explanation.';
        const q = normalizeQuestionItem(
          {
            id: `q-hd-${Date.now()}-${idx}`,
            type: qType,
            questionEn: qEn,
            questionAr: qAr,
            options: rawOpts,
            correctAnswer: ans,
            explanationAr: expAr,
            explanationEn: expEn,
            blockId: activeBlockId,
            subjectId: activeSubjectId,
            topicId: activeTopic?.id
          },
          idx
        );
        if (q) buckets.questions.push(q);
        return;
      }

      if (tag === 'AFFIX' && cols.length >= 4) {
        const cleanKey = cols[1].replace(/^-|-$/g, '').trim();
        const affixType = (cols[2] || 'prefix').toLowerCase();
        const meaningAr = cols[3] || '';
        const meaningEn = cols[4] || meaningAr;
        if (cleanKey && meaningAr) {
          buckets.affixes.push({
            id: `aff-hd-${Date.now()}-${idx}`,
            affix:
              affixType === 'prefix'
                ? `${cleanKey}-`
                : affixType === 'suffix'
                  ? `-${cleanKey}`
                  : cleanKey,
            cleanKey,
            type:
              affixType === 'suffix'
                ? 'suffix'
                : affixType === 'root'
                  ? 'root'
                  : 'prefix',
            meaningAr,
            meaningEn,
            combiningRule: 'Standard medical morphology',
            examples: cols[5] ? cols[5].split(';').map((s) => s.trim()) : []
          });
        }
        return;
      }

      if (tag === 'ABBR' && cols.length >= 3) {
        const abbr = cols[1].trim();
        const expansionEn = cols[2].trim();
        const meaningAr = cols[3]?.trim() || expansionEn;
        const spec = cols[4]?.trim() || 'General Medicine';
        if (abbr && expansionEn) {
          buckets.abbreviations.push({
            id: `abbr-hd-${Date.now()}-${idx}`,
            abbr,
            isAmbiguous: false,
            defaultExpansionEn: expansionEn,
            defaultTranslationAr: meaningAr,
            category: 'Ward & Hx',
            priority: 90,
            candidates: [
              {
                expansionEn,
                translationAr: meaningAr,
                specialty: spec,
                triggers: []
              }
            ]
          });
        }
        return;
      }
    }

    // 2. Markdown hierarchy headings (# Block:, ## Subject:, ### Topic:, #### Section:)
    if (line.startsWith('#')) {
      const hMatch = /^(#{1,4})\s*(.+)$/.exec(line);
      if (hMatch) {
        const hashes = hMatch[1].length;
        const headingBody = hMatch[2].trim();
        const bilingualParts = headingBody.split(/\s*(?:\||—|-)\s*/);

        if (/^block\s*:/i.test(headingBody)) {
          flushActiveTopic();
          const cleanTitle = headingBody.replace(/^block\s*:\s*/i, '').trim();
          const parts = cleanTitle.split(/\s*(?:\||—)\s*/);
          const titleEn = parts[0] || cleanTitle;
          const titleAr = parts[1] || titleEn;
          const blkId = `block-md-${Date.now()}-${idx}`;
          activeBlockId = blkId;
          buckets.blocks.push({
            id: blkId,
            code: `BLK-${buckets.blocks.length + 1}`,
            titleEn,
            titleAr,
            descriptionEn: titleEn,
            descriptionAr: titleAr,
            colorAccent: 'emerald',
            order: buckets.blocks.length + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          return;
        }

        if (/^subject\s*:/i.test(headingBody)) {
          flushActiveTopic();
          const cleanTitle = headingBody.replace(/^subject\s*:\s*/i, '').trim();
          const parts = cleanTitle.split(/\s*(?:\||—)\s*/);
          const titleEn = parts[0] || cleanTitle;
          const titleAr = parts[1] || titleEn;
          const subjId = `subj-md-${Date.now()}-${idx}`;
          activeSubjectId = subjId;
          buckets.subjects.push({
            id: subjId,
            blockId: activeBlockId || buckets.blocks[0]?.id || 'block-general',
            code: `SUBJ-${buckets.subjects.length + 1}`,
            titleEn,
            titleAr,
            descriptionEn: titleEn,
            descriptionAr: titleAr,
            order: buckets.subjects.length + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          return;
        }

        if (/^topic\s*:/i.test(headingBody) || hashes <= 2) {
          flushActiveTopic();
          const cleanTitle = headingBody.replace(/^topic\s*:\s*/i, '').trim();
          const parts = cleanTitle.split(/\s*(?:\||—)\s*/);
          const titleEn = parts[0] || cleanTitle;
          const titleAr = parts[1] || titleEn;
          const topicId = `topic-md-${Date.now()}-${idx}`;
          activeTopic = {
            id: topicId,
            title: titleAr || titleEn,
            titleEn,
            titleAr,
            subtitle: titleAr || titleEn,
            category: 'Medical',
            blockId: activeBlockId,
            subjectId: activeSubjectId,
            author: 'استيراد UMEDT',
            publishedAt: new Date().toISOString().slice(0, 10),
            readingTimeMinutes: 5,
            favorite: false,
            sections: [],
            images: [],
            links: [],
            attachments: []
          };
          activeSection = {
            id: `${topicId}-sec-1`,
            heading: titleEn,
            headingEn: titleEn,
            headingAr: titleAr,
            paragraphs: [],
            contentBlocks: []
          };
          return;
        }

        if (activeTopic && hashes >= 3) {
          if (activeSection && activeSection.paragraphs.length > 0) {
            activeTopic.sections.push(activeSection);
          }
          const secId = `${activeTopic.id}-sec-${activeTopic.sections.length + 1}`;
          activeSection = {
            id: secId,
            heading: bilingualParts[0] || headingBody,
            headingEn: bilingualParts[0] || headingBody,
            headingAr: bilingualParts[1] || bilingualParts[0] || headingBody,
            paragraphs: [],
            contentBlocks: []
          };
          return;
        }
      }
      return;
    }

    // 3. Markdown Table rows: | col1 | col2 | col3 | ... |
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.length < 2) return;
      // Skip separator row |---|---|
      if (cells.every((c) => /^[-:\s]+$/.test(c))) return;
      // Skip header row
      if (/^(term|term_en|english|word|المصطلح|#)$/i.test(cells[0])) return;

      const tEn = cells[0].replace(/^\*\*|\*\*$/g, '').trim();
      const tAr = (cells[1] || '').replace(/^\*\*|\*\*$/g, '').trim() || 'مصطلح طبي';
      if (!tEn) return;
      const defAr = cells[2] || `مصطلح طبي سريري يعني ${tAr}.`;
      const defEn = cells[3] || `Clinical medical term: ${tEn}.`;
      const exEn = cells[4] || '';
      const exAr = cells[5] || '';
      const tm = normalizeDictionaryTerm(
        {
          id: `u-tbl-${Date.now()}-${idx}`,
          term: tEn,
          translation: tAr,
          definitionAr: defAr,
          definitionEn: defEn,
          exampleEn: exEn,
          exampleAr: exAr,
          blockId: activeBlockId,
          subjectId: activeSubjectId,
          topicId: activeTopic?.id
        },
        idx
      );
      if (tm) buckets.terms.push(tm);
      return;
    }

    // 4. Delimited term/sentence line or paragraph inside an active Markdown Topic
    const cleaned = line.replace(/^[-*•\d.)]+\s*/, '');
    const firstCommaSeg = cleaned.split(',')[0]?.trim() || '';
    const isShortCsvTermRow =
      cleaned.includes(',') &&
      firstCommaSeg.length > 0 &&
      firstCommaSeg.length <= 40 &&
      firstCommaSeg.split(/\s+/).length <= 5;
    const hasExplicitTermDelimiter =
      cleaned.includes('\t') ||
      cleaned.includes(' | ') ||
      cleaned.includes(' - ') ||
      cleaned.includes(' : ') ||
      (!activeTopic && isShortCsvTermRow);

    if (activeTopic && !hasExplicitTermDelimiter && cleaned.length > 25) {
      if (!activeSection) {
        const secId = `${activeTopic.id}-sec-1`;
        activeSection = {
          id: secId,
          heading: activeTopic.titleEn,
          headingEn: activeTopic.titleEn,
          headingAr: activeTopic.titleAr,
          paragraphs: [],
          contentBlocks: []
        };
      }
      activeSection.paragraphs.push(cleaned);
      activeSection.contentBlocks = activeSection.contentBlocks || [];
      activeSection.contentBlocks.push({
        id: `cblk-${activeSection.id}-${activeSection.paragraphs.length}`,
        type: 'paragraph',
        order: activeSection.paragraphs.length,
        text: cleaned
      });
      return;
    }

    const parts = cleaned.includes('\t')
      ? cleaned.split('\t')
      : cleaned.includes(' | ')
        ? cleaned.split(' | ')
        : cleaned.includes(' - ')
          ? cleaned.split(' - ')
          : cleaned.includes(' : ')
            ? cleaned.split(' : ')
            : cleaned.split(',');
    const tEn = (parts[0] || '').trim().replace(/^["']|["']$/g, '');
    if (!tEn || /^(term|term_en|english|word|المصطلح)$/i.test(tEn)) return;
    const tAr = (parts[1] || '').trim().replace(/^["']|["']$/g, '') || 'مصطلح طبي';
    const defAr =
      (parts[2] || '').trim().replace(/^["']|["']$/g, '') ||
      `مصطلح طبي سريري يعني ${tAr}.`;
    const defEn =
      (parts[3] || '').trim().replace(/^["']|["']$/g, '') ||
      `Clinical medical term: ${tEn}.`;
    const exEn = (parts[4] || '').trim().replace(/^["']|["']$/g, '');
    const exAr = (parts[5] || '').trim().replace(/^["']|["']$/g, '');
    const tm = normalizeDictionaryTerm(
      {
        id: `u-txt-${Date.now()}-${idx}`,
        term: tEn,
        translation: tAr,
        definitionAr: defAr,
        definitionEn: defEn,
        exampleEn: exEn || undefined,
        exampleAr: exAr || undefined,
        blockId: activeBlockId,
        subjectId: activeSubjectId,
        topicId: activeTopic?.id
      },
      idx
    );
    if (tm) buckets.terms.push(tm);
  });

  flushActiveTopic();
}

/**
 * Deterministic universal importer supporting:
 * - JSON / Markdown ```json code blocks generated by ChatGPT or Gemini
 * - Loose AI JSON (with trailing commas or multiple consecutive JSON objects/arrays) and .jsonl
 * - UMEDT-DATA catalog/master entities (Blocks, Subjects, Topics, Books, Exams, Questions, Terms, Sentences, Affixes, Abbreviations, MediaAssets)
 * - UMEDT backup & granular packages (including userNotes, quizAttempts, studyStats)
 * - High-density pipe lines (BLOCK || ..., SUBJECT || ..., TOPIC || ..., TERM || ..., SENTENCE || ..., QUESTION || ...)
 * - Markdown hierarchy (# Block:, ## Subject:, ### Topic:) & Markdown tables (| Term | Translation | ... |)
 * - Structured CSV / TSV / dash-delimited term lists
 */
export type UniversalImportTargetType = 'all' | 'terms' | 'topics';

export function importUniversalAiOrLocalContent(params: {
  rawText: string;
  conflictPolicy?: 'ignore' | 'merge' | 'overwrite';
  sourceLabel?: string;
  syncToCloud?: boolean;
  allowHierarchyCreation?: boolean;
  importTargetType?: UniversalImportTargetType;
}): UniversalImportReport {
  const mode = params.conflictPolicy || 'merge';
  const targetType: UniversalImportTargetType = params.importTargetType || 'all';
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
    userNotes: [],
    quizAttempts: [],
    studyStats: null,
    dynamicCollections: [],
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
    collectFromStructuredTextFallback(params.rawText, buckets);
  }

  if (targetType === 'terms') {
    const ignoredTopicsCount = buckets.topics.length;
    buckets.blocks = [];
    buckets.subjects = [];
    buckets.topics = [];
    buckets.sentences = [];
    buckets.affixes = [];
    buckets.abbreviations = [];
    buckets.books = [];
    buckets.exams = [];
    buckets.questions = [];
    buckets.mediaAssets = [];
    buckets.userNotes = [];
    buckets.quizAttempts = [];
    buckets.studyStats = null;
    buckets.dynamicCollections = [];
    if (ignoredTopicsCount > 0 && buckets.terms.length > 0) {
      warnings.push(`تم تجاهل ${ignoredTopicsCount} موضوع لأن نوع الاستيراد المحدد هو «مصطلحات».`);
    }
  } else if (targetType === 'topics') {
    const ignoredTermsCount = buckets.terms.length;
    buckets.blocks = [];
    buckets.subjects = [];
    buckets.terms = [];
    buckets.sentences = [];
    buckets.affixes = [];
    buckets.abbreviations = [];
    buckets.books = [];
    buckets.exams = [];
    buckets.userNotes = [];
    buckets.quizAttempts = [];
    buckets.studyStats = null;
    buckets.dynamicCollections = [];
    if (buckets.topics.length === 0) {
      buckets.questions = [];
      buckets.mediaAssets = [];
    }
    if (ignoredTermsCount > 0 && buckets.topics.length > 0) {
      warnings.push(`تم تجاهل ${ignoredTermsCount} مصطلح لأن نوع الاستيراد المحدد هو «مواضيع».`);
    }
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
    buckets.mediaAssets.length +
    buckets.userNotes.length +
    buckets.quizAttempts.length +
    buckets.dynamicCollections.reduce((acc, dc) => acc + dc.items.length, 0);

  if (totalParsed === 0) {
    const emptyMsg =
      targetType === 'terms'
        ? 'لم يتم العثور على أي مصطلحات صالحة في المحتوى. تأكد من اختيار «مصطلحات» أو «مواضيع» بشكل مطابق للبيانات.'
        : targetType === 'topics'
        ? 'لم يتم العثور على أي مواضيع صالحة في المحتوى. تأكد من اختيار «مواضيع» أو «مصطلحات» بشكل مطابق للبيانات.'
        : 'لم يتم العثور على سجلات صالحة متوافقة مع UMEDT في النص أو الملف.';
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
      errors: errors.length > 0 ? errors : [emptyMsg],
      messageAr: emptyMsg,
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
    const permDeleted = loadPermanentlyDeletedRegistry();

    // Blocks and Subjects are device-local by default. Only trusted internal
    // maintenance/test callers may explicitly opt into hierarchy creation.
    let nextBlocks = currentBlocks;
    let nextSubjects = currentSubjects;
    if (params.allowHierarchyCreation === true) {
      const blocksMap = new Map(currentBlocks.map((b) => [b.id, b]));
      for (const blk of buckets.blocks) {
        removed.blocks = removed.blocks.filter((id) => id !== blk.id);
        permDeleted.blocks = permDeleted.blocks.filter((id) => id !== blk.id);
        const exists = blocksMap.get(blk.id);
        if (exists && mode === 'ignore') {
          skippedDuplicates++;
          continue;
        }
        blocksMap.set(blk.id, exists && mode === 'merge' ? { ...exists, ...blk } : blk);
        counts.blocks++;
      }
      nextBlocks = Array.from(blocksMap.values()).sort((a, b) => a.order - b.order);

      const subjectsMap = new Map(currentSubjects.map((s) => [s.id, s]));
      for (const subj of buckets.subjects) {
        removed.subjects = removed.subjects.filter((id) => id !== subj.id);
        permDeleted.subjects = permDeleted.subjects.filter((id) => id !== subj.id);
        const exists = subjectsMap.get(subj.id);
        if (exists && mode === 'ignore') {
          skippedDuplicates++;
          continue;
        }
        subjectsMap.set(subj.id, exists && mode === 'merge' ? { ...exists, ...subj } : subj);
        counts.subjects++;
      }
      nextSubjects = Array.from(subjectsMap.values()).sort((a, b) => a.order - b.order);
    } else {
      if (buckets.blocks.length > 0) {
        warnings.push('تم تجاهل سجلات البلوكات الواردة؛ تُنشأ البلوكات محلياً من إدارة البلوكات داخل التطبيق فقط.');
      }
      if (buckets.subjects.length > 0) {
        warnings.push('تم تجاهل سجلات المواد الواردة؛ تُنشأ المواد محلياً من إدارة المواد داخل التطبيق فقط.');
      }
    }

    // 3. Merge Topics (preserve existing favorite state)
    const topicsMap = new Map(currentState.topics.map((t) => [t.id, t]));
    const topicTitleToId = new Map(
      currentState.topics.map((t) => [(t.titleEn || t.title).toLowerCase(), t.id])
    );
    const mergedTopicsBatch: TopicArticle[] = [];
    const localBlockIds = new Set(nextBlocks.map((block) => block.id));
    const localSubjectsById = new Map(nextSubjects.map((subject) => [subject.id, subject]));
    for (const tp of buckets.topics) {
      const topicBlockId = String(tp.blockId || '').trim();
      const topicSubjectId = String(tp.subjectId || '').trim();
      const localSubject = localSubjectsById.get(topicSubjectId);
      if (
        !topicBlockId ||
        !topicSubjectId ||
        !localBlockIds.has(topicBlockId) ||
        !localSubject ||
        String(localSubject.blockId || '') !== topicBlockId
      ) {
        warnings.push('تم تجاوز الموضوع "' + String(tp.titleEn || tp.title || tp.id) + '" لأن البلوك أو المادة غير موجودين محلياً أو لا يتبعان التسلسل الهرمي المحدد. أنشئ البلوك والمادة محلياً ثم أعد الاستيراد.');
        continue;
      }
      removed.topics = removed.topics.filter((id) => id !== tp.id);
      permDeleted.topics = permDeleted.topics.filter((id) => id !== tp.id);
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
      currentState.terms.map((t) => [normalizeTermIdentity(t.termNormalized || t.term), t.id])
    );
    const mergedTermsBatch: DictionaryTerm[] = [];
    for (const tm of buckets.terms) {
      permDeleted.terms = permDeleted.terms.filter((id) => id !== tm.id);
      const normKey = normalizeTermIdentity(tm.term);
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
      permDeleted.sentences = permDeleted.sentences.filter((id) => id !== sn.id);
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
      permDeleted.books = permDeleted.books.filter((id) => id !== bk.id);
      const existingBook = booksMap.get(bk.id);
      if (existingBook && mode === 'ignore') {
        skippedDuplicates++;
        continue;
      }
      booksMap.set(
        bk.id,
        existingBook
          ? {
              ...bk,
              favorite: existingBook.favorite ?? bk.favorite,
              bookmarks: existingBook.bookmarks?.length
                ? existingBook.bookmarks
                : bk.bookmarks,
              lastReadPage: existingBook.lastReadPage ?? bk.lastReadPage,
              readingProgressPercent:
                existingBook.readingProgressPercent ?? bk.readingProgressPercent,
              notes: existingBook.notes ?? bk.notes,
              mediaIdbKey: existingBook.mediaIdbKey || bk.mediaIdbKey,
              coverIdbKey: existingBook.coverIdbKey || bk.coverIdbKey
            }
          : bk
      );
      counts.books++;
    }
    const nextBooks = Array.from(booksMap.values());

    const examsMap = new Map(currentExams.map((e) => [e.id, e]));
    for (const ex of buckets.exams) {
      removed.exams = (removed.exams || []).filter((id) => id !== ex.id);
      permDeleted.exams = permDeleted.exams.filter((id) => id !== ex.id);
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

    // 8. Merge Backup-specific User Notes, Quiz Attempts, and Study Stats if present
    if (buckets.userNotes.length > 0) {
      const notesMap = new Map(loadUserStudyNotes().map((n) => [n.id, n]));
      for (const un of buckets.userNotes) {
        if (!notesMap.has(un.id) || mode !== 'ignore') {
          notesMap.set(un.id, un);
        }
      }
      saveUserStudyNotes(Array.from(notesMap.values()));
    }

    if (buckets.quizAttempts.length > 0) {
      const attemptsMap = new Map(loadQuizAttempts().map((a) => [a.id, a]));
      for (const qa of buckets.quizAttempts) {
        if (!attemptsMap.has(qa.id) || mode !== 'ignore') {
          attemptsMap.set(qa.id, qa);
        }
      }
      try {
        localStorage.setItem(
          LEARNING_STORAGE_KEYS.QUIZ_ATTEMPTS,
          JSON.stringify(Array.from(attemptsMap.values()))
        );
      } catch {
        // Ignore storage quota warning
      }
    }

    const nextStudyStats: StudyStats = buckets.studyStats
      ? {
          ...currentState.studyStats,
          ...buckets.studyStats,
          gotIt: Math.max(
            currentState.studyStats.gotIt || 0,
            buckets.studyStats.gotIt || 0
          ),
          needsReview: Math.max(
            currentState.studyStats.needsReview || 0,
            buckets.studyStats.needsReview || 0
          ),
          lastStudiedAt:
            buckets.studyStats.lastStudiedAt || currentState.studyStats.lastStudiedAt
        }
      : currentState.studyStats;

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
    saveStudyStats(nextStudyStats);
    saveLocallyRemovedRegistry(removed);
    savePermanentlyDeletedRegistry(permDeleted);

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
      customAbbreviations: buckets.abbreviations,
      dynamicCollections: buckets.dynamicCollections
    });
    saveUnifiedCloudMirror(updatedMirror.snapshot);

    if (params.syncToCloud === true) {
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

/**
 * Pure zero-dependency ZIP builder (Store method 0) for creating universal archives.
 */
export function buildSimpleStoreZipBytes(
  files: Record<string, Uint8Array | string>
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
  const computeCrc = (buf: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const entries: Array<{
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc32: number;
    offset: number;
  }> = [];

  let totalSize = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    entries.push({
      nameBytes,
      data,
      crc32: computeCrc(data),
      offset: 0
    });
    totalSize += 30 + nameBytes.length + data.length;
  }

  let cdSize = 0;
  for (const entry of entries) {
    cdSize += 46 + entry.nameBytes.length;
  }
  totalSize += cdSize + 22;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  for (const entry of entries) {
    entry.offset = pos;
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint32(pos + 14, entry.crc32, true);
    view.setUint32(pos + 18, entry.data.length, true);
    view.setUint32(pos + 22, entry.data.length, true);
    view.setUint16(pos + 26, entry.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    pos += 30;
    output.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;
    output.set(entry.data, pos);
    pos += entry.data.length;
  }

  const cdOffset = pos;
  for (const entry of entries) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0, true);
    view.setUint32(pos + 16, entry.crc32, true);
    view.setUint32(pos + 20, entry.data.length, true);
    view.setUint32(pos + 24, entry.data.length, true);
    view.setUint16(pos + 28, entry.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, entry.offset, true);
    pos += 46;
    output.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, cdSize, true);
  view.setUint32(pos + 16, cdOffset, true);
  view.setUint16(pos + 20, 0, true);

  return output;
}

function extractStoreEntriesFromZipBytes(
  zipBytes: Uint8Array
): Record<string, Uint8Array> {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );
  const decoder = new TextDecoder();
  const result: Record<string, Uint8Array> = {};
  const blockedExtensions = [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.sh',
    '.bash',
    '.bat',
    '.cmd',
    '.ps1',
    '.vbs',
    '.js',
    '.mjs',
    '.cjs',
    '.wasm',
    '.php',
    '.py',
    '.rb',
    '.pl',
    '.jar',
    '.apk',
    '.dex',
    '.html',
    '.htm',
    '.scr',
    '.com'
  ];

  let pos = 0;
  while (pos + 30 <= zipBytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;

    const compression = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 18, true);
    const uncompressedSize = view.getUint32(pos + 22, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);

    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > zipBytes.length) break;

    const rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
    // Reject Zip Slip path traversal or dangerous executable/HTML extensions
    if (
      rawName.includes('..') ||
      rawName.startsWith('/') ||
      rawName.startsWith('\\') ||
      /^[a-zA-Z]:/.test(rawName)
    ) {
      throw new Error(`مسار ملف غير آمن (Zip Slip) داخل الحزمة: "${rawName}".`);
    }
    const lowerRaw = rawName.toLowerCase();
    for (const ext of blockedExtensions) {
      if (lowerRaw.endsWith(ext)) {
        throw new Error(`امتداد ملف خطير أو تنفيذي محظور داخل الحزمة: "${rawName}".`);
      }
    }

    const safeName = rawName.replace(/\\/g, '/').replace(/^\/+/, '');

    const dataStart = nameEnd + extraLen;
    const sizeToRead = compressedSize || uncompressedSize;
    const dataEnd = dataStart + sizeToRead;
    if (dataEnd > zipBytes.length) break;

    if (compression === 0) {
      const entryBytes = zipBytes.slice(dataStart, dataEnd);
      if (lowerRaw.endsWith('.svg')) {
        const svgText = decoder.decode(entryBytes);
        if (
          /<script[\s>]/i.test(svgText) ||
          /<foreignObject[\s>]/i.test(svgText) ||
          /\son[a-z]+\s*=/i.test(svgText) ||
          /javascript\s*:/i.test(svgText)
        ) {
          throw new Error(`ملف الرسم الاتجاهي "${rawName}" يحتوي على نص برمجي محظور.`);
        }
      }
      result[safeName] = entryBytes;
    }
    pos = dataEnd;
  }

  return result;
}

/**
 * Unzips any .zip or .umedpack archive (including AI-generated .zip files without manifest.json
 * or full UMEDT-DATA repository archives) and merges all .json, .jsonl, .md, .csv, .tsv, .txt files.
 */
export function importUniversalZipArchiveBytes(
  zipBytes: Uint8Array,
  options?: {
    conflictPolicy?: 'ignore' | 'merge' | 'overwrite';
    sourceLabel?: string;
    syncToCloud?: boolean;
    importTargetType?: UniversalImportTargetType;
  }
): UniversalImportReport {
  const unzipped = extractStoreEntriesFromZipBytes(zipBytes);
  const decoder = new TextDecoder();
  const combinedJsonObjects: unknown[] = [];
  const textFallbacks: string[] = [];

  for (const [entryPath, fileBytes] of Object.entries(unzipped)) {
    const cleanPath = entryPath.toLowerCase();
    // Skip directory entries, macOS metadata, or schema/contract files
    if (
      cleanPath.endsWith('/') ||
      cleanPath.includes('__macosx') ||
      cleanPath.includes('schemas/') ||
      cleanPath.endsWith('schema.json') ||
      cleanPath.endsWith('manifest.json')
    ) {
      continue;
    }

    if (
      cleanPath.endsWith('.json') ||
      cleanPath.endsWith('.jsonl') ||
      cleanPath.endsWith('.md') ||
      cleanPath.endsWith('.csv') ||
      cleanPath.endsWith('.tsv') ||
      cleanPath.endsWith('.txt')
    ) {
      const textContent = decoder.decode(fileBytes).trim();
      if (!textContent) continue;

      const jsonCandidates = extractJsonCandidatesFromText(textContent);
      if (jsonCandidates.length > 0) {
        for (const cand of jsonCandidates) {
          try {
            combinedJsonObjects.push(JSON.parse(cand));
          } catch {
            // Ignore malformed fragment
          }
        }
      } else {
        textFallbacks.push(textContent);
      }
    }
  }

  if (combinedJsonObjects.length === 0 && textFallbacks.length === 0) {
    return importUniversalAiOrLocalContent({
      rawText: '',
      conflictPolicy: options?.conflictPolicy || 'merge',
      sourceLabel: options?.sourceLabel || 'استيراد أرشيف ZIP شامل',
      syncToCloud: options?.syncToCloud,
      importTargetType: options?.importTargetType
    });
  }

  const tempBuckets: ParsedBuckets = {
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
    userNotes: [],
    quizAttempts: [],
    studyStats: null,
    dynamicCollections: [],
    sourceFormat: 'umedt-zip-archive'
  };

  for (const obj of combinedJsonObjects) {
    collectFromParsedJson(obj, tempBuckets);
  }
  for (const txt of textFallbacks) {
    collectFromStructuredTextFallback(txt, tempBuckets);
  }

  const mergedWrapper = {
    format: 'umedt-zip-universal-bundle',
    blocks: tempBuckets.blocks,
    subjects: tempBuckets.subjects,
    topics: tempBuckets.topics,
    terms: tempBuckets.terms,
    sentences: tempBuckets.sentences,
    customAffixes: tempBuckets.affixes,
    customAbbreviations: tempBuckets.abbreviations,
    books: tempBuckets.books,
    exams: tempBuckets.exams,
    quizQuestions: tempBuckets.questions,
    mediaAssets: tempBuckets.mediaAssets,
    userNotes: tempBuckets.userNotes,
    quizAttempts: tempBuckets.quizAttempts
  };

  return importUniversalAiOrLocalContent({
    rawText: JSON.stringify(mergedWrapper),
    conflictPolicy: options?.conflictPolicy || 'merge',
    sourceLabel: options?.sourceLabel || 'استيراد أرشيف ZIP شامل',
    syncToCloud: options?.syncToCloud,
    importTargetType: options?.importTargetType
  });
}
