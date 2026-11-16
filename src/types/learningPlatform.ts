export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'image'
  | 'diagram'
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
  edition?: string;
  year?: number;
  language?: string;
  blockId?: string;
  subjectId?: string;
  topicIds?: string[];
  fileFormat?: 'pdf' | 'epub' | 'html' | 'link' | string;
  pdfUrl?: string;
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
  lastReadPage?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AcademicExamPackage {
  id: string;
  titleEn: string;
  titleAr: string;
  blockId?: string;
  subjectId?: string;
  topicIds?: string[];
  questionIds?: string[];
  questions?: UnifiedQuizQuestion[];
  durationMinutes?: number;
  passingPercent?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  descriptionEn?: string;
  descriptionAr?: string;
  sha256?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaAssetRecord {
  id: string;
  mediaType?: 'image' | 'diagram' | 'audio' | 'video' | 'pdf' | 'book' | 'attachment' | string;
  kind?: string;
  titleEn?: string;
  titleAr?: string;
  fileName?: string;
  mimeType?: string;
  url: string;
  sha256?: string;
  sizeBytes?: number;
  topicId?: string;
  subjectId?: string;
  blockId?: string;
  bookId?: string;
  captionEn?: string;
  captionAr?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type UmedtDataRendererType =
  | 'block_hub'
  | 'subject_list'
  | 'topic_article'
  | 'lexicon_term'
  | 'bilingual_sentence'
  | 'morphology_rule'
  | 'clinical_abbr'
  | 'book_pdf_reader'
  | 'quiz_runner'
  | 'exam_blueprint'
  | 'media_gallery'
  | string;

export interface CatalogCollectionDescriptor {
  id: string;
  name?: string;
  contentType: string;
  rendererType: UmedtDataRendererType;
  rawUrl: string;
  sha256?: string;
  recordCount?: number;
  sizeBytes?: number;
  mergeStrategy?: 'merge' | 'replace' | 'ignore' | string;
  userProtectedFields?: string[];
}

export interface DataCatalogDocument {
  catalogVersion?: string;
  repository?: string;
  branch?: string;
  updatedAt?: string;
  latestStableManifestUrl?: string;
  latestBetaManifestUrl?: string;
  collections: CatalogCollectionDescriptor[];
}

