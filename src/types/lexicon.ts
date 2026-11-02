export interface TermExample {
  en: string;
  ar: string;
}

export interface TermMorphology {
  prefix?: { affix: string; meaningAr: string; meaningEn: string };
  root: { affix: string; meaningAr: string; meaningEn: string };
  suffix?: { affix: string; meaningAr: string; meaningEn: string };
  literalSynthesisAr: string;
}

export interface SpacedRepetitionData {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAt: number;
}

export type LexiconCategory = 'Medical' | 'AI' | 'Programming' | 'General';

export interface DictionaryTerm {
  id: string;
  term: string;
  termNormalized: string;
  translation: string;
  phonetic: string;
  pos: string;
  category: LexiconCategory;
  specialty?: string;
  umdCode?: string;
  keepEnglish: boolean;
  favorite: boolean;
  collections: string[];
  ingestedAt: string;
  definitionAr: string;
  definitionEn: string;
  clinicalNote?: string;
  morphology?: TermMorphology;
  examples: TermExample[];
  relations: {
    synonyms: string[];
    broader: string[];
    related: string[];
  };
  srsData?: SpacedRepetitionData;
}

export type SentenceSourceType = 'manual' | 'file' | 'long_text' | 'termux' | 'seed';

export interface LinkedSentence {
  id: string;
  en: string;
  ar: string;
  category: LexiconCategory;
  specialty?: string;
  sourceType: SentenceSourceType;
  linkedTermIds: string[];
  tags: string[];
  favorite: boolean;
  createdAt: string;
  notes?: string;
  srsData?: SpacedRepetitionData;
}

export interface AmbiguousCandidate {
  expansionEn: string;
  translationAr: string;
  specialty: string;
  triggers: { token: string; weight: number }[];
}

export type AbbreviationCategory =
  | 'Ward & Hx'
  | 'Prescription (Rx)'
  | 'Cardiopulmonary'
  | 'Neurology & Labs';

export interface ClinicalAbbreviation {
  id: string;
  abbr: string;
  isAmbiguous: boolean;
  defaultExpansionEn: string;
  defaultTranslationAr: string;
  category: AbbreviationCategory;
  priority: number;
  candidates: AmbiguousCandidate[];
}

export interface MorphologicalAffix {
  id: string;
  affix: string;
  cleanKey: string;
  type: 'prefix' | 'root' | 'suffix';
  meaningAr: string;
  meaningEn: string;
  combiningRule: string;
  examples: string[];
}

export interface ClinicalBenchmarkCase {
  id: string;
  titleAr: string;
  specialty: string;
  sourceEn: string;
  highlightFocus: string;
}

export interface StudyStats {
  gotIt: number;
  needsReview: number;
  lastStudiedAt?: string;
}

export interface AppSettings {
  isDark: boolean;
  conflictPolicy: 'ignore' | 'overwrite' | 'merge';
  sharedStoragePath: string;
  lastBackupTime: string;
}

export type TopicCategory = 'Medical' | 'Technology' | 'AI' | 'History' | 'General';

export interface TopicSection {
  id: string;
  heading?: string;
  paragraphs: string[];
}

export interface TopicImageItem {
  id: string;
  url: string;
  caption: string;
}

export interface TopicLinkItem {
  id: string;
  title: string;
  url: string;
  description?: string;
}

export interface TopicAttachmentItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeLabel: string;
  contentDataUrlOrText: string;
}

export interface TopicArticle {
  id: string;
  title: string;
  subtitle: string;
  category: TopicCategory;
  author: string;
  publishedAt: string;
  readingTimeMinutes: number;
  favorite: boolean;
  sections: TopicSection[];
  images: TopicImageItem[];
  links: TopicLinkItem[];
  attachments: TopicAttachmentItem[];
}

export type DataSourceType =
  | 'bundled-seed'
  | 'local-json'
  | 'local-zip'
  | 'remote-cdn'
  | 'manual-mixed';

export interface VersionMetadata {
  appVersion: string;
  schemaVersion: number;
  dataVersion: string;
  lastDataUpdateAt: string;
  dataSource: DataSourceType;
  packageId?: string;
  remoteManifestUrl?: string;
  remoteChannel?: 'stable' | 'beta';
}

export interface DataPackageCounts {
  terms: number;
  sentences: number;
  topics: number;
  affixes: number;
  abbreviations: number;
}

export interface DataPackageManifest {
  packageId: string;
  dataVersion: string;
  minAppVersion: string;
  schemaVersion: number;
  releasedAt: string;
  channel: 'stable' | 'beta';
  checksum?: string;
  sha256?: string;
  signature?: string;
  signatureAlgorithm?: SignatureAlgorithm;
  keyFingerprint?: string;
  description?: string;
  releaseNotes?: string;
  changelog?: string[];
  packageSizeKb?: number;
  author?: string;
  downloadUrl?: string;
  counts: DataPackageCounts;
}

export type SignatureAlgorithm =
  | 'ECDSA-P256-SHA256'
  | 'RSASSA-PKCS1-v1_5-SHA256'
  | 'Ed25519';

export type AutoUpdatePolicy = 'auto-install' | 'notify-only' | 'manual';

export interface OnlineUpdateConfig {
  manifestUrl: string;
  autoCheckOnStartup: boolean;
  autoUpdatePolicy: AutoUpdatePolicy;
  channel: 'stable' | 'beta';
  publicKeyPem: string;
  requireSignature: boolean;
  signatureAlgorithm: SignatureAlgorithm;
  lastCheckedAt?: string;
  lastAvailableVersion?: string;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'incompatible'
  | 'offline'
  | 'unconfigured'
  | 'error';

export interface OnlineUpdateStatus {
  phase: UpdatePhase;
  progressPercent: number | null;
  installedDataVersion: string;
  availableDataVersion: string | null;
  availableManifest: DataPackageManifest | null;
  message: string;
  error: string | null;
  lastCheckedAt: string | null;
  checksumVerified?: boolean;
  signatureVerified?: boolean;
}

export interface DataPackagePayload {
  manifest: DataPackageManifest;
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  studyStats?: StudyStats;
  settings?: AppSettings;
}

export interface DataValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest: DataPackageManifest;
  payload?: DataPackagePayload;
}

export type DataImportMode = 'merge' | 'replace' | 'ignore';

export interface AtomicImportResult {
  success: boolean;
  rolledBack: boolean;
  mode: DataImportMode;
  sourceFormat: 'json' | 'zip';
  summary: {
    termsImported: number;
    sentencesImported: number;
    topicsImported: number;
    affixesImported: number;
    abbreviationsImported: number;
    totalTermsAfter: number;
    totalSentencesAfter: number;
  };
  versionMetadata: VersionMetadata;
  errors: string[];
  warnings: string[];
}

export interface PersistedAppState {
  version: number;
  versionMetadata: VersionMetadata;
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  studyStats: StudyStats;
  settings: AppSettings;
}

export type BackupTriggerType =
  | 'auto-pre-update'
  | 'auto-pre-import'
  | 'manual'
  | 'pre-rollback';

export interface BackupConfig {
  maxBackups: number;
  autoBackupBeforeUpdate: boolean;
  preservePersonalDataOnRestore: boolean;
}

export interface DataBackupRecord {
  backupId: string;
  createdAt: string;
  trigger: BackupTriggerType;
  label: string;
  targetDataVersion?: string;
  versionMetadata: VersionMetadata;
  manifest: DataPackageManifest;
  sha256Checksum: string;
  sizeKb: number;
  payload: DataPackagePayload;
}

export interface BackupVerificationResult {
  valid: boolean;
  backupId: string;
  dataVersion: string;
  expectedSha256: string;
  actualSha256: string;
  schemaCompatible: boolean;
  errors: string[];
}

export interface BackupRestoreResult {
  success: boolean;
  rolledBackTransaction: boolean;
  restoredBackupId: string;
  previousDataVersion: string;
  restoredDataVersion: string;
  preservedFavoritesCount: number;
  preservedSrsCount: number;
  preservedPersonalTermsCount: number;
  checksumVerified: boolean;
  versionMetadata: VersionMetadata;
  errors: string[];
}

/**
 * ============================================================================
 * STAGE 4: DATA PUBLISHING & RELEASE MANAGEMENT TYPES
 * ============================================================================
 */

export type VersionBumpStrategy = 'calver-auto' | 'major' | 'minor' | 'patch' | 'custom';

export interface PublisherSigningKeyPair {
  keyId: string;
  algorithm: SignatureAlgorithm;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
  createdAt: string;
}

export interface PublisherReleaseConfig {
  cdnBaseUrl: string;
  defaultChannel: 'stable' | 'beta';
  packageFormat: 'zip' | 'json';
  author: string;
  requireSignatureGate: boolean;
  signatureAlgorithm: SignatureAlgorithm;
  publicKeyPem: string;
  keyFingerprintSha256?: string;
}

export interface ReleaseChangelogEntry {
  releaseId: string;
  version: string;
  previousVersion: string;
  releasedAt: string;
  channel: 'stable' | 'beta';
  summary: string;
  changes: string[];
  counts: DataPackageCounts;
  minAppVersion: string;
  schemaVersion: number;
  packageFileName: string;
  packageSizeKb: number;
  downloadUrl: string;
  manifestUrl: string;
  sha256: string;
  signature: string;
  signatureAlgorithm: SignatureAlgorithm;
  keyFingerprintSha256: string;
  author?: string;
}

export interface ReleasePrePublishGateResult {
  allowed: boolean;
  compatibilityPassed: boolean;
  schemaPassed: boolean;
  dataValidationPassed: boolean;
  versionOrderPassed: boolean;
  signatureKeyReady: boolean;
  blockingErrors: string[];
  warnings: string[];
  evaluatedVersion: string;
  counts: DataPackageCounts;
}

export interface PublishedReleaseBundle {
  releaseId: string;
  publishedAt: string;
  manifest: DataPackageManifest;
  manifestJsonText: string;
  packageFileName: string;
  packageBytes: Uint8Array;
  packageSizeKb: number;
  sha256: string;
  signature: string;
  signatureAlgorithm: SignatureAlgorithm;
  publicKeyPem: string;
  keyFingerprintSha256: string;
  changelogEntry: ReleaseChangelogEntry;
  changelogMarkdown: string;
  gateResult: ReleasePrePublishGateResult;
  endpoints: {
    manifestUrl: string;
    packageDownloadUrl: string;
    gitTag: string;
  };
}

/**
 * ============================================================================
 * STAGE 5: SECURITY & RELIABILITY (DIGITAL SIGNATURES, ZIP HARDENING, WAL & QUOTA)
 * ============================================================================
 */

export interface ZipSecurityPolicy {
  maxDownloadBytes: number;
  maxCompressedArchiveBytes: number;
  maxTotalUncompressedBytes: number;
  maxSingleEntryUncompressedBytes: number;
  maxCompressionRatio: number;
  maxEntryCount: number;
  maxPathDepth: number;
}

export type ZipSecurityViolationCode =
  | 'ARCHIVE_TOO_LARGE'
  | 'TOO_MANY_ENTRIES'
  | 'ZIP_SLIP_TRAVERSAL'
  | 'DANGEROUS_FILE_TYPE'
  | 'ZIP_BOMB_RATIO'
  | 'ENTRY_TOO_LARGE'
  | 'TOTAL_UNCOMPRESSED_EXCEEDED'
  | 'CORRUPT_HEADER'
  | 'CRC32_MISMATCH'
  | 'SQLITE_FORBIDDEN';

export interface ZipSecurityInspectionResult {
  safe: boolean;
  archiveSizeBytes: number;
  totalUncompressedBytes: number;
  entryCount: number;
  maxObservedCompressionRatio: number;
  blockedEntryName?: string;
  violationCode?: ZipSecurityViolationCode;
  reason?: string;
}

export interface TransactionJournalRecord {
  txId: string;
  operation:
    | 'import'
    | 'online-update'
    | 'restore-backup'
    | 'partial-update'
    | 'deduplicate-resolve';
  status: 'pending' | 'committed' | 'rolled-back';
  startedAt: string;
  previousDataVersion: string;
  targetDataVersion: string;
  snapshot: Record<string, string | null>;
}

export interface StorageReliabilityStatus {
  usedBytes: number;
  estimatedQuotaBytes: number;
  freeBytes: number;
  usagePercent: number;
  walHealthy: boolean;
  pendingWalTxId: string | null;
  lastCrashRecoveryAt: string | null;
  lastCrashRecoveredVersion: string | null;
}

export interface SecurityDiagnosticCaseResult {
  id: string;
  category: 'crypto-signature' | 'zip-hardening' | 'crash-storage-safety';
  titleAr: string;
  descriptionAr: string;
  passed: boolean;
  durationMs: number;
  detailsAr: string;
  technicalProof: string;
}

export interface SecurityAuditReport {
  auditId: string;
  executedAt: string;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  totalDurationMs: number;
  zipPolicy: ZipSecurityPolicy;
  storageReliability: StorageReliabilityStatus;
  cases: SecurityDiagnosticCaseResult[];
}

/**
 * ============================================================================
 * STAGE 6: DATA MANAGEMENT, PARTIAL DATABASE UPDATES & CONFLICT DETECTION
 * ============================================================================
 */

export type DataDomainKey =
  | 'terms'
  | 'sentences'
  | 'topics'
  | 'abbreviations'
  | 'affixes';

export type ConflictResolutionStrategy =
  | 'smart-merge'
  | 'overwrite-existing'
  | 'keep-existing';

export interface DuplicateGroupItem {
  id: string;
  domain: DataDomainKey;
  normalizedKey: string;
  displayLabel: string;
  duplicateType: 'exact-duplicate' | 'normalized-key-duplicate' | 'id-collision';
  recordIds: string[];
  count: number;
  summaryAr: string;
}

export interface RecordFieldDiff {
  field: string;
  labelAr: string;
  existingValue: string;
  incomingValue: string;
}

export interface RecordConflictItem {
  conflictId: string;
  domain: DataDomainKey;
  normalizedKey: string;
  recordId: string;
  incomingRecordId: string;
  titleEn: string;
  subtitleAr: string;
  severity: 'warning' | 'critical';
  conflictReasonAr: string;
  diffs: RecordFieldDiff[];
}

export interface DuplicateAndConflictReport {
  reportId: string;
  scannedAt: string;
  durationMs: number;
  isHealthy: boolean;
  totalRecordsScanned: number;
  totalDuplicatesFound: number;
  totalConflictsFound: number;
  domainCounts: Record<DataDomainKey, number>;
  duplicates: DuplicateGroupItem[];
  conflicts: RecordConflictItem[];
}

export interface PartialDatabasePatchPayload {
  patchId?: string;
  targetDataVersion?: string;
  sourceLabel?: string;
  domains: DataDomainKey[];
  conflictStrategy?: ConflictResolutionStrategy;
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  abbreviations?: ClinicalAbbreviation[];
  affixes?: MorphologicalAffix[];
  deleteIds?: Partial<Record<DataDomainKey, string[]>>;
}

export interface DomainPartialUpdateMetrics {
  domain: DataDomainKey;
  touched: boolean;
  beforeCount: number;
  afterCount: number;
  inserted: number;
  updated: number;
  merged: number;
  skipped: number;
  deleted: number;
  conflictsResolved: number;
}

export interface PartialUpdateExecutionResult {
  success: boolean;
  rolledBack: boolean;
  patchId: string;
  executedAt: string;
  durationMs: number;
  conflictStrategy: ConflictResolutionStrategy;
  domainsTargeted: DataDomainKey[];
  domainsUntouched: DataDomainKey[];
  storageKeysWritten: string[];
  storageKeysSkipped: string[];
  domainMetrics: Record<DataDomainKey, DomainPartialUpdateMetrics>;
  versionMetadata: VersionMetadata;
  errors: string[];
  warnings: string[];
}

export interface DataManagementDiagnosticCase {
  id: string;
  titleAr: string;
  descriptionAr: string;
  passed: boolean;
  durationMs: number;
  detailsAr: string;
  technicalProof: string;
}

export interface DataManagementDiagnosticReport {
  reportId: string;
  executedAt: string;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  totalDurationMs: number;
  cases: DataManagementDiagnosticCase[];
}

/**
 * ============================================================================
 * STAGE 7: FINAL TESTING, ANDROID OFFLINE, COLD-RESTART & PRODUCTION RELEASE
 * ============================================================================
 */

export type LargeDatabaseScalePreset = 1000 | 2500 | 5000;

export interface LargeDatabaseBenchmarkMetrics {
  scaleRecords: number;
  totalRecords: number;
  termsGenerated: number;
  syntheticTermsCount: number;
  sentencesGenerated: number;
  syntheticSentencesCount: number;
  topicsGenerated: number;
  abbreviationsGenerated: number;
  affixesGenerated: number;
  generationDurationMs: number;
  searchLatencyEnMs: number;
  searchLatencyArMs: number;
  searchLatencyExamplesMs: number;
  knowledgeGraphSyncDurationMs: number;
  graphLinkDurationMs: number;
  translatorPipelineDurationMs: number;
  gcNmtPipelineMs: number;
  partialDeltaUpdateDurationMs: number;
  memoryPayloadKb: number;
  estimatedMemoryKb: number;
  throughputRecordsPerSec: number;
  passedPerformanceSla: boolean;
}

export interface ColdRestartVerificationResult {
  verifiedAt: string;
  passed: boolean;
  allPassed: boolean;
  updatePersistedAfterRestart: boolean;
  updateSurvivedRestart: boolean;
  crashWalRecoveredOnRestart: boolean;
  walMidUpdateCrashRecoveredOnBoot: boolean;
  restorePersistedAfterRestart: boolean;
  restoreSurvivedRestart: boolean;
  personalFavoritesPreserved: boolean;
  personalSrsPreserved: boolean;
  installedVersionBefore: string;
  installedVersionAfterRestart: string;
  checksumAfterColdBoot: string;
  durationMs: number;
  summaryAr: string;
  detailsAr: string;
  technicalProof: string;
}

export interface StorageMigrationResult {
  migrated: boolean;
  idempotentNoOp: boolean;
  rolledBack: boolean;
  previousSchemaVersion: number;
  targetSchemaVersion: number;
  backupCreatedId?: string;
  preservedFavoritesCount: number;
  preservedCollectionsCount: number;
  preservedSrsCount: number;
  preservedTermsCount: number;
  preservedSentencesCount: number;
  error?: string;
}

export type Stage7TestCategory =
  | 'android-offline'
  | 'restart-persistence'
  | 'large-db-performance'
  | 'production-release';

export interface Stage7DiagnosticCase {
  id: string;
  category: Stage7TestCategory;
  titleAr: string;
  descriptionAr: string;
  passed: boolean;
  durationMs: number;
  detailsAr: string;
  technicalProof: string;
}

export interface Stage7FinalReleaseReport {
  reportId: string;
  executedAt: string;
  appVersion: string;
  dataVersion: string;
  schemaVersion: number;
  productionReady: boolean;
  allPassed: boolean;
  productionScorePercent: number;
  passedCount: number;
  totalCount: number;
  totalDurationMs: number;
  androidOfflinePassed: boolean;
  coldRestartPersistencePassed: boolean;
  largeDbBenchmark: LargeDatabaseBenchmarkMetrics;
  coldRestartResult: ColdRestartVerificationResult;
  coldRestartVerification: ColdRestartVerificationResult;
  signedReleaseBundle?: PublishedReleaseBundle;
  cases: Stage7DiagnosticCase[];
  releaseCertificateMarkdown: string;
}

export * from './umedPackage';
