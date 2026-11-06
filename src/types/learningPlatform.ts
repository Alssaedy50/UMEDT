export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'table'
  | 'image'
  | 'video_link'
  | 'audio'
  | 'attachment'
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
  captionEn?: string;
  captionAr?: string;
  externalUrl?: string;
  noteSeverity?: 'high-yield' | 'clinical-correlation' | 'warning' | 'exam-trap';
  inlineQuestion?: UnifiedQuizQuestion;
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
  mediaType: 'audio_recording' | 'audio_file' | 'pdf_document' | 'image' | 'attachment';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  dataUrl: string;
  createdAt: string;
}
