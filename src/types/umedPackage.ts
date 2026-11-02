import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MorphologicalAffix,
  ClinicalAbbreviation,
  SignatureAlgorithm
} from './lexicon';

/**
 * UMED-2 Official Medical Package (.umedpack) Specification
 * Standard ZIP package with manifest.json, data/, media/, and integrity/
 */

export interface UmedMcqQuestion {
  id: string;
  questionEn: string;
  questionAr?: string;
  options: Array<{
    key: string; // 'A' | 'B' | 'C' | 'D' | 'E'
    textEn: string;
    textAr?: string;
  }>;
  correctAnswerKey: string;
  explanationEn?: string;
  explanationAr?: string;
  specialty?: string;
  subject?: string;
  sourcePage?: number;
  sourceReference?: string;
  confidence?: number; // 0 - 100 estimated AI extraction confidence
  isVerified?: boolean;
}

export interface UmedClinicalCase {
  id: string;
  titleEn: string;
  titleAr: string;
  patientProfile?: string;
  presentationEn: string;
  presentationAr?: string;
  investigations?: string;
  diagnosisEn?: string;
  diagnosisAr?: string;
  discussion?: string;
  specialty: string;
  sourcePage?: number;
  sourceReference?: string;
  linkedTermIds?: string[];
}

export interface UmedPackageCounts {
  terms: number;
  questions: number;
  sentences: number;
  topics: number;
  affixes: number;
  abbreviations: number;
  clinicalCases: number;
}

export interface UmedPackageManifest {
  package_id: string;
  package_name: string;
  description: string;
  category: string;
  subject: string;
  language: 'en' | 'ar' | 'bilingual';
  package_version: string;
  schema_version: number; // Must be 2 for UMED-2
  minimum_app_version: string; // e.g. "2.2.0"
  created_at: string;
  updated_at: string;
  author: string;
  source: string;
  license?: string;
  records_count: UmedPackageCounts;
  files: string[];
  checksums: Record<string, string>; // relative path -> sha256 lowercase hex
  signature?: string;
  signature_algorithm?: SignatureAlgorithm;
  key_fingerprint?: string;
}

export interface UmedPackageMediaItem {
  id: string;
  fileName: string;
  relativePath: string;
  mediaType: 'image' | 'diagram' | 'table';
  mimeType: string;
  captionAr?: string;
  captionEn?: string;
  dataBase64?: string;
  sizeBytes?: number;
}

export interface UmedPackagePayload {
  manifest: UmedPackageManifest;
  terms: DictionaryTerm[];
  questions: UmedMcqQuestion[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  clinicalCases: UmedClinicalCase[];
  media?: UmedPackageMediaItem[];
}

export interface InstalledPackageRecord {
  packageId: string;
  packageName: string;
  version: string;
  installedAt: string;
  updatedAt?: string;
  subject: string;
  category: string;
  author: string;
  source: string;
  recordsCount: UmedPackageCounts;
  sizeBytes: number;
  isBuiltIn: boolean;
  status: 'active' | 'outdated' | 'incompatible';
  checksumVerified: boolean;
  signatureVerified: boolean;
  notes?: string;
}

/**
 * Universal File Import Engine Types
 */
export type SupportedOriginalFileType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'txt'
  | 'md'
  | 'json'
  | 'zip'
  | 'umedpack'
  | 'sqlite'
  | 'jpg'
  | 'png';

export interface ParsedFilePage {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface ParsedFileTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface ParsedFileResult {
  fileName: string;
  fileType: SupportedOriginalFileType;
  fileSizeBytes: number;
  extractedText: string;
  pagesCount: number;
  pages: ParsedFilePage[];
  detectedTables: ParsedFileTable[];
  detectedImages: Array<{ name: string; dataUrl: string; mimeType: string }>;
  rawMetadata: Record<string, string | number | boolean>;
  parseWarnings: string[];
  isTruncated: boolean;
  parsedAt: string;
}

/**
 * Cloud AI Data Assistant Types (Strictly Cloud-Only, No Local LLMs)
 */
export type AiAssistantTask =
  | 'extract_terms'
  | 'extract_mcqs'
  | 'extract_clinical_cases'
  | 'extract_lecture'
  | 'classify_and_format'
  | 'detect_conflicts'
  | 'analyze_medical_image';

export interface AiExtractionRequest {
  task: AiAssistantTask;
  sourceFileName: string;
  sourceText: string;
  pageRange?: { startPage: number; endPage: number };
  imageDataUrl?: string;
  subjectHint?: string;
  specialtyHint?: string;
  language?: 'en' | 'ar' | 'bilingual';
}

export interface StagedExtractionItem<T> {
  id: string;
  data: T;
  sourceReference: string;
  sourcePage?: number;
  confidenceScore: number; // 0 - 100
  provenance: string;
  isDuplicate: boolean;
  hasConflicts: boolean;
  warnings: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
}

export interface AiExtractionResponse {
  taskId: string;
  task: AiAssistantTask;
  sourceFileName: string;
  extractedAt: string;
  modelUsed: string;
  confidenceScore: number;
  provenanceSummary: string;
  terms: StagedExtractionItem<DictionaryTerm>[];
  questions: StagedExtractionItem<UmedMcqQuestion>[];
  sentences: StagedExtractionItem<LinkedSentence>[];
  clinicalCases: StagedExtractionItem<UmedClinicalCase>[];
  topics: StagedExtractionItem<TopicArticle>[];
  rawResponseText?: string;
  warnings: string[];
  suggestedCorrections: string[];
}

/**
 * Import Audit & Provenance History
 */
export interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  sourceName: string;
  sourceType: SupportedOriginalFileType | 'ai_assistant' | 'package_manager';
  packageId?: string;
  summary: {
    termsAdded: number;
    termsUpdated: number;
    questionsAdded: number;
    sentencesAdded: number;
    topicsAdded: number;
    clinicalCasesAdded: number;
    affixesAdded: number;
    abbreviationsAdded: number;
    ignoredDuplicates: number;
  };
  conflictPolicyUsed: 'ignore' | 'overwrite' | 'merge';
  status: 'success' | 'rolled_back' | 'failed';
  rollbackSnapshotId?: string;
  error?: string;
  notes?: string;
}
