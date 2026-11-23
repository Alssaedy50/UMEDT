import type { MindMapDocument } from './mindMap';

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'image'
  | 'diagram'
  | 'mind_map'
  | 'video'
  | 'video_link'
  | 'audio'
  | 'attachment'
  | 'pdf_viewer'
  | 'book_reference'
  | 'exam_link'
  | 'question'
  | 'clinical_note';

export type UnifiedQuestionType =
  | 'single_choice'
  | 'multiple_select'
  | 'true_false'
  | 'matching'
  | 'fill_blank'
  | 'short_answer'
  | 'image_based';

export interface UnifiedQuizOption {
  key: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'T' | 'F'
  textEn: string;
  textAr?: string;
}

export interface UnifiedMatchingPair {
  id: string;
  leftEn: string;
  leftAr?: string;
  rightEn: string;
  rightAr?: string;
}

export interface UnifiedQuizQuestion {
  id: string;
  type: UnifiedQuestionType;
  questionEn: string;
  questionAr?: string;
  imageUrl?: string;
  imageCaption?: string;
  options: UnifiedQuizOption[];
  correctOptionKeys: string[]; // e.g. ['B'] for SBA, ['A','C'] for multiple_select, ['T'] for true_false
  matchingPairs?: UnifiedMatchingPair[];
  acceptableAnswers?: string[]; // for fill_blank and short_answer
  explanationEn: string;
  explanationAr?: string;
  blockId?: string;
  subjectId?: string;
  topicId?: string;
  sectionId?: string;
  linkedTermIds: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  sourceLabel?: string;
  createdAt: string;
}

export interface TopicContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  titleEn?: string;
  titleAr?: string;
  headingLevel?: 'h2' | 'h3' | 'h4';
  text?: string;
  textAr?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  mediaUrl?: string;
  mediaIdbKey?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaSizeBytes?: number;
  mediaDurationSeconds?: number;
  mediaSha256?: string;
  isLocalMediaRef?: boolean;
  captionEn?: string;
  captionAr?: string;
  externalUrl?: string;
  noteSeverity?: 'high-yield' | 'clinical-correlation' | 'warning' | 'exam-trap';
  inlineQuestion?: UnifiedQuizQuestion;
  bookId?: string;
  examId?: string;
  diagramSvg?: string;
  diagramData?: unknown;
  mindMapId?: string;
  mindMapData?: MindMapDocument;
  sha256?: string;
}

export interface MedicalBlock {
  id: string;
  code: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  colorAccent: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalSubject {
  id: string;
  code: string;
  blockId?: string; // optional so standalone subjects are supported
  isStandalone?: boolean;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizValidationIssue {
  lineOrIndex: number;
  field: string;
  severity: 'error' | 'warning';
  messageAr: string;
  rawSnippet?: string;
}

export interface QuizValidationReport {
  valid: boolean;
  questions: UnifiedQuizQuestion[];
  issues: QuizValidationReportIssue[];
}

export type QuizValidationReportIssue = QuizValidationIssue;

export interface QuizAttemptAnswer {
  questionId: string;
  selectedKeys: string[];
  textAnswer?: string;
  matchingMap?: Record<string, string>;
  isCorrect: boolean;
  timeSpentSeconds?: number;
}

export interface QuizAttemptRecord {
  id: string;
  title: string;
  scopeType: 'topic' | 'subject' | 'block' | 'multi-topic' | 'mistakes-retry';
  blockId?: string;
  subjectId?: string;
  topicIds: string[];
  mode: 'instant' | 'exam';
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
  durationSeconds: number;
  completedAt: string;
  answers: QuizAttemptAnswer[];
  questionIds: string[];
}

export interface RecentLearningItem {
  id: string;
  entityType: 'topic' | 'subject' | 'block' | 'quiz';
  entityId: string;
  titleEn: string;
  titleAr: string;
  subtitle?: string;
  blockId?: string;
  subjectId?: string;
  accessedAt: string;
  progressPercent?: number;
}

export interface StudiedTermLogEntry {
  id: string;
  termId: string;
  term: string;
  translationAr: string;
  topicId?: string;
  subjectId?: string;
  blockId?: string;
  studiedAt: string;
  action: 'viewed' | 'saved_from_topic' | 'quiz_linked' | 'flashcard_reviewed';
}

export interface LocalMediaRecord {
  id: string;
  topicId?: string;
  sectionId?: string;
  blockId?: string;
  mediaType:
    | 'audio_recording'
    | 'audio_file'
    | 'video_file'
    | 'pdf_document'
    | 'image'
    | 'attachment';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  sourceExternalUrl?: string;
  dataUrl: string;
  createdAt: string;
}

export interface AcademicBookChapter {
  id: string;
  titleEn: string;
  titleAr?: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface AcademicBookResource {
  id: string;
  titleEn: string;
  titleAr: string;
  subtitleEn?: string;
  subtitleAr?: string;
  authors?: string[];
  publisher?: string;
  edition?: string;
  year?: number;
  publicationYear?: number;
  language?: string;
  resourceKind?: 'textbook' | 'atlas' | 'clinical_guideline' | 'study_notes' | string;
  blockId?: string;
  subjectId?: string;
  topicIds?: string[];
  fileFormat?: 'pdf' | 'epub' | 'html' | 'link' | string;
  format?: 'pdf' | 'epub' | 'html' | 'link' | string;
  mimeType?: string;
  pdfUrl?: string;
  downloadUrl?: string;
  relativePath?: string;
  mediaAssetId?: string;
  epubUrl?: string;
  coverUrl?: string;
  mediaUrl?: string;
  externalUrl?: string;
  mediaIdbKey?: string;
  coverIdbKey?: string;
  sha256?: string;
  sizeBytes?: number;
  pageCount?: number;
  chapters?: AcademicBookChapter[];
  tags?: string[];
  descriptionEn?: string;
  descriptionAr?: string;
  favorite?: boolean;
  bookmarks?: number[];
  lastReadPage?: number;
  readingProgressPercent?: number;
  notes?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AcademicExamPackage {
  id: string;
  titleEn: string;
  titleAr: string;
  examType?: 'comprehensive' | 'subject_quiz' | 'topic_drill' | 'mock_exam' | string;
  blockId?: string;
  subjectId?: string;
  topicIds?: string[];
  questionIds?: string[];
  questions?: UnifiedQuizQuestion[];
  durationMinutes?: number;
  passingPercent?: number;
  passingScorePercent?: number;
  totalPoints?: number;
  shuffleQuestions?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  descriptionEn?: string;
  descriptionAr?: string;
  sha256?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaAssetRecord {
  id: string;
  mediaType?: 'image' | 'diagram' | 'audio' | 'video' | 'pdf' | 'book' | 'attachment' | string;
  kind?: string;
  format?: string;
  mediaIdbKey?: string;
  titleEn?: string;
  titleAr?: string;
  fileName?: string;
  relativePath?: string;
  mimeType?: string;
  url: string;
  rawUrl?: string;
  sha256?: string;
  sizeBytes?: number;
  linkedEntityType?: 'topic' | 'book' | 'subject' | 'block' | 'question' | 'exam' | 'term' | string;
  linkedEntityId?: string;
  topicId?: string;
  subjectId?: string;
  blockId?: string;
  bookId?: string;
  captionEn?: string;
  captionAr?: string;
  downloadable?: boolean;
  width?: number;
  height?: number;
  pageCount?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ContentTypeRegistryEntry {
  contentType: string;
  rendererType: string;
  displayNameAr: string;
  displayNameEn: string;
  supportsDownload?: boolean;
  supportsOfflineCache?: boolean;
}

export interface DynamicCatalogItem {
  id: string;
  titleEn?: string;
  titleAr?: string;
  subtitleEn?: string;
  subtitleAr?: string;
  summaryEn?: string;
  summaryAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  blockId?: string;
  subjectId?: string;
  topicId?: string;
  downloadUrl?: string;
  rawUrl?: string;
  url?: string;
  mimeType?: string;
  sha256?: string;
  sizeBytes?: number;
  tags?: string[];
  updatedAt?: string;
  rawPayload?: Record<string, unknown>;
}

export interface DynamicCatalogCollection {
  id: string;
  name?: string;
  contentType: string;
  rendererType: UmedtDataRendererType;
  displayNameAr?: string;
  displayNameEn?: string;
  rawUrl?: string;
  sha256?: string;
  recordCount?: number;
  sizeBytes?: number;
  items: DynamicCatalogItem[];
}

export interface UserStudyNoteRecord {
  id: string;
  entityType: 'topic' | 'book' | 'term' | 'subject' | 'block';
  entityId: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type UmedtDataRendererType =
  | 'block_hub'
  | 'hierarchy_grid'
  | 'subject_list'
  | 'topic_article'
  | 'rich_article'
  | 'lexicon_term'
  | 'lexicon_entry'
  | 'bilingual_sentence'
  | 'sentence_pair'
  | 'morphology_rule'
  | 'clinical_abbr'
  | 'abbreviation_rule'
  | 'book_pdf_reader'
  | 'quiz_runner'
  | 'quiz_question'
  | 'exam_blueprint'
  | 'media_gallery'
  | 'generic_card'
  | string;

export interface CatalogCollectionDescriptor {
  id: string;
  name?: string;
  contentType: string;
  rendererType: UmedtDataRendererType;
  rawUrl: string;
  apiPath?: string;
  schemaUrl?: string;
  sha256?: string;
  recordCount?: number;
  sizeBytes?: number;
  mergeStrategy?: 'merge' | 'replace' | 'ignore' | string;
  userProtectedFields?: string[];
}

export interface DataCatalogDocument {
  catalogSchemaVersion?: number | string;
  catalogVersion?: string;
  schemaVersion?: number | string;
  minAppVersion?: string;
  repository?: string;
  branch?: string;
  generatedAt?: string;
  updatedAt?: string;
  latestStableManifestUrl?: string;
  latestBetaManifestUrl?: string;
  contentTypesRegistry?: ContentTypeRegistryEntry[];
  collections: CatalogCollectionDescriptor[];
}


