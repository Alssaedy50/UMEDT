import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  LocalMediaRecord,
  TopicImageItem,
  TopicAttachmentItem,
  AcademicBookResource,
  AcademicExamPackage,
  MediaAssetRecord,
  DataCatalogDocument,
  UnifiedQuizQuestion,
  MorphologicalAffix,
  ClinicalAbbreviation,
  ContentTypeRegistryEntry,
  DynamicCatalogCollection,
  DynamicCatalogItem
} from '../types/lexicon';
import {
  INITIAL_TERMS,
  INITIAL_LINKED_SENTENCES
} from '../data/medicalLexiconData';
import { INITIAL_TOPICS } from '../data/topicsSeedData';
import {
  INITIAL_MEDICAL_BLOCKS,
  INITIAL_MEDICAL_SUBJECTS,
  loadMedicalBlocks,
  saveMedicalBlocks,
  loadMedicalSubjects,
  saveMedicalSubjects,
  loadAcademicBooks,
  saveAcademicBooks,
  loadAcademicExams,
  saveAcademicExams,
  loadMediaAssetsIndex,
  saveMediaAssetsIndex,
  enrichAllTopicsWithHierarchy,
  normalizeAcademicBookResource,
  normalizeAcademicExamPackage,
  normalizeMediaAssetRecord,
  normalizeQuizQuestionRecord
} from './learningHierarchyService';
import { loadQuizQuestions, saveQuizQuestions } from './quizEngineService';
import { computeSha256Hex } from './dataPlatformService';
import {
  getLocalMediaRecord,
  saveLocalMediaRecord,
  deleteLocalMediaRecordsByTopicId,
  deleteLocalMediaRecordsByKeys,
  deleteLocalMediaRecord,
  getMediaRecordsByTopicId,
  downloadRemoteMediaToOfflineCache,
  isDownloadableMediaUrl,
  formatBytesLabel
} from './mediaStorageService';

export const UMEDT_DATA_CATALOG_URL =
  'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/catalog.json';

export type CloudEntityType =
  | 'block'
  | 'subject'
  | 'topic'
  | 'term'
  | 'sentence'
  | 'media'
  | 'book'
  | 'exam'
  | 'question'
  | 'media_asset';
export type SyncItemStatus = 'synced' | 'pending' | 'syncing' | 'failed';

export interface SyncQueueItem {
  id: string;
  entityType: CloudEntityType;
  entityId: string;
  title: string;
  sha256: string;
  sizeBytes: number;
  updatedAt: string;
  status: SyncItemStatus;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
  payload: unknown;
}

export interface LocallyRemovedRegistry {
  blocks: string[];
  subjects: string[];
  topics: string[];
  terms: string[];
  sentences: string[];
  books?: string[];
  exams?: string[];
}

export interface CloudCatalogTopicEntry {
  id: string;
  blockId: string;
  subjectId: string;
  title: string;
  titleEn: string;
  titleAr: string;
  subtitle: string;
  sha256: string;
  sizeBytes: number;
  sizeLabel: string;
  updatedAt: string;
  isDownloaded: boolean;
  hasNewerCloudVersion: boolean;
  syncStatus: SyncItemStatus;
  termsCount: number;
  mediaCount: number;
}

export interface CloudCatalogSubjectEntry {
  id: string;
  blockId: string;
  code: string;
  titleEn: string;
  titleAr: string;
  descriptionAr: string;
  sha256: string;
  sizeBytes: number;
  sizeLabel: string;
  updatedAt: string;
  isDownloaded: boolean;
  isPartiallyDownloaded: boolean;
  downloadedTopicsCount: number;
  totalTopicsCount: number;
  termsCount: number;
  syncStatus: SyncItemStatus;
  topics: CloudCatalogTopicEntry[];
}

export interface CloudCatalogBlockEntry {
  id: string;
  code: string;
  titleEn: string;
  titleAr: string;
  descriptionAr: string;
  colorAccent: string;
  sha256: string;
  sizeBytes: number;
  sizeLabel: string;
  updatedAt: string;
  isDownloaded: boolean;
  isPartiallyDownloaded: boolean;
  downloadedTopicsCount: number;
  totalTopicsCount: number;
  subjectsCount: number;
  termsCount: number;
  syncStatus: SyncItemStatus;
  subjects: CloudCatalogSubjectEntry[];
}

export interface CloudCatalogBookEntry {
  id: string;
  blockId?: string;
  subjectId?: string;
  titleEn: string;
  titleAr: string;
  authorsLabel: string;
  resourceKind?: string;
  fileFormat: string;
  sizeBytes: number;
  sizeLabel: string;
  pageCount?: number;
  downloadUrl?: string;
  pdfUrl?: string;
  coverUrl?: string;
  isDownloaded: boolean;
  hasOfflineMediaCached: boolean;
  favorite?: boolean;
  readingProgressPercent?: number;
  sha256?: string;
  updatedAt?: string;
}

export interface UnifiedCloudStoreSnapshot {
  version: string;
  updatedAt: string;
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  mediaRecords: LocalMediaRecord[];
  books?: AcademicBookResource[];
  exams?: AcademicExamPackage[];
  quizQuestions?: UnifiedQuizQuestion[];
  mediaAssets?: MediaAssetRecord[];
  customAffixes?: MorphologicalAffix[];
  customAbbreviations?: ClinicalAbbreviation[];
  contentTypesRegistry?: ContentTypeRegistryEntry[];
  dynamicCollections?: DynamicCatalogCollection[];
  collectionHashes?: Record<string, string>;
  catalogVersion?: string;
  hashes: Record<string, string>;
}

export interface CloudLibraryStateSummary {
  overallSyncStatus: SyncItemStatus;
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  localTotalBytes: number;
  localTotalLabel: string;
  cloudTotalBytes: number;
  cloudTotalLabel: string;
  downloadedTopicsCount: number;
  totalCloudTopicsCount: number;
  downloadedBlocksCount: number;
  totalCloudBlocksCount: number;
  downloadedBooksCount?: number;
  totalCloudBooksCount?: number;
  downloadedExamIds?: string[];
  downloadedExamsCount?: number;
  totalCloudExamsCount?: number;
  cloudDictionaryTotalCount?: number;
  cloudDictionaryDownloadedCount?: number;
  catalogVersion?: string;
  books?: CloudCatalogBookEntry[];
  exams?: AcademicExamPackage[];
  contentTypesRegistry?: ContentTypeRegistryEntry[];
  dynamicCollections?: DynamicCatalogCollection[];
  blocks: CloudCatalogBlockEntry[];
  queue: SyncQueueItem[];
}

export const CLOUD_LIBRARY_STORAGE_KEYS = {
  SYNC_QUEUE: 'umed_cloud_sync_queue_v1',
  CLOUD_SNAPSHOT_MIRROR: 'umed_unified_cloud_mirror_v1',
  LOCALLY_REMOVED_IDS: 'umed_locally_removed_cloud_ids_v1',
  PERMANENTLY_DELETED_IDS: 'umed_permanently_deleted_cloud_ids_v1',
  KNOWN_HASHES: 'umed_cloud_known_hashes_v1',
  LAST_SYNCED_AT: 'umed_cloud_last_synced_at_v1',
  CATALOG_COLLECTION_HASHES: 'umed_catalog_collection_hashes_v1'
} as const;

const memoryStorageFallback = ((
  globalThis as unknown as { __UMED_SHARED_MEMORY_STORAGE__?: Map<string, string> }
).__UMED_SHARED_MEMORY_STORAGE__ ??= new Map<string, string>());
let inMemoryCloudMirror: UnifiedCloudStoreSnapshot | null = null;
let isSyncLoopRunning = false;
let simulatedOfflineOverride = false;
let customCloudFetchOverride: typeof fetch | null = null;
const syncListeners = new Set<() => void>();

function getSafeStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      getItem: (k: string): string | null => {
        try {
          return window.localStorage.getItem(k);
        } catch {
          return memoryStorageFallback.get(k) ?? null;
        }
      },
      setItem: (k: string, v: string): void => {
        try {
          window.localStorage.setItem(k, v);
        } catch {
          // quota fallback
        }
        memoryStorageFallback.set(k, v);
      },
      removeItem: (k: string): void => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          // ignore
        }
        memoryStorageFallback.delete(k);
      }
    };
  }
  return {
    getItem: (k: string) => memoryStorageFallback.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStorageFallback.set(k, v);
    },
    removeItem: (k: string) => {
      memoryStorageFallback.delete(k);
    }
  };
}

export function subscribeToCloudLibraryChanges(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifyCloudLibraryListeners(): void {
  for (const listener of syncListeners) {
    try {
      listener();
    } catch {
      // ignore listener error
    }
  }
}

export function setCloudSyncSimulatedOffline(
  offline: boolean,
  options?: { autoFlush?: boolean }
): void {
  const wasOffline = simulatedOfflineOverride;
  simulatedOfflineOverride = offline;
  notifyCloudLibraryListeners();
  if (wasOffline && !offline && options?.autoFlush !== false) {
    void processCloudSyncQueue();
  }
}

export function setCustomCloudFetchForTesting(fn: typeof fetch | null): void {
  customCloudFetchOverride = fn;
}

export function isCloudSyncOnline(): boolean {
  if (simulatedOfflineOverride) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !customCloudFetchOverride) {
    return false;
  }
  return true;
}

/**
 * Deterministic UTF-8 byte size calculation for any entity or JSON payload.
 */
export function computeEntitySizeBytes(entity: unknown): number {
  if (entity === null || entity === undefined) return 0;
  const serialized = typeof entity === 'string' ? entity : JSON.stringify(entity);
  return new TextEncoder().encode(serialized).byteLength;
}

/**
 * Canonical JSON serialization for stable SHA-256 content hashing (ignores transient UI fields like lastOpenedAt).
 */
const TRANSIENT_HASH_KEYS = new Set([
  'lastOpenedAt',
  'lastStudiedAt',
  'studyCount',
  'srsData',
  'mediaIdbKey',
  'coverIdbKey',
  'localCachedPath'
]);

export function canonicalizeForHash(entityType: CloudEntityType, entity: unknown): string {
  if (!entity || typeof entity !== 'object') {
    return String(entity ?? '');
  }

  const sortKeysDeep = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(sortKeysDeep);
    }
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) {
        if (TRANSIENT_HASH_KEYS.has(k)) continue;
        sorted[k] = sortKeysDeep(obj[k]);
      }
      return sorted;
    }
    return val;
  };

  return `${entityType}:${JSON.stringify(sortKeysDeep(entity))}`;
}

/**
 * Fast synchronous deterministic hash fallback used alongside full WebCrypto SHA-256
 * when synchronous catalog rendering is needed.
 */
export function computeDeterministicFastHashHex(canonicalText: string): string {
  let h1 = 0xdeadbeef ^ canonicalText.length;
  let h2 = 0x41c6ce57 ^ canonicalText.length;
  let h3 = 0x9e3779b9 ^ canonicalText.length;
  let h4 = 0x85ebca6b ^ canonicalText.length;

  for (let i = 0; i < canonicalText.length; i++) {
    const ch = canonicalText.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822519);
    h4 = Math.imul(h4 ^ ch, 3266489917);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);

  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}${hex(h1 ^ h3)}${hex(h2 ^ h4)}${hex(
    h1 ^ h4
  )}${hex(h2 ^ h3)}`;
}

/**
 * Computes real cryptographic SHA-256 hex digest for any entity.
 */
export async function computeEntitySha256(
  entityType: CloudEntityType,
  entity: unknown
): Promise<string> {
  const canonical = canonicalizeForHash(entityType, entity);
  const bytes = new TextEncoder().encode(canonical);
  return computeSha256Hex(bytes);
}

/**
 * Deduplicates images, attachments, and inline media blocks within a TopicArticle using SHA-256/content hashes
 * so duplicate images or attachments are never stored or uploaded twice.
 */
export function deduplicateTopicMediaAndAttachments(topic: TopicArticle): TopicArticle {
  const seenImageHashes = new Set<string>();
  const dedupedImages: TopicImageItem[] = [];
  for (const img of topic.images || []) {
    if (!img || !img.url) continue;
    const hash = computeDeterministicFastHashHex(`img:${img.url.trim()}`);
    if (!seenImageHashes.has(hash)) {
      seenImageHashes.add(hash);
      dedupedImages.push(img);
    }
  }

  const seenAttachmentHashes = new Set<string>();
  const dedupedAttachments: TopicAttachmentItem[] = [];
  for (const att of topic.attachments || []) {
    if (!att || (!att.contentDataUrlOrText && !att.fileName)) continue;
    const hash = computeDeterministicFastHashHex(
      `att:${att.fileName || ''}:${att.contentDataUrlOrText || ''}`
    );
    if (!seenAttachmentHashes.has(hash)) {
      seenAttachmentHashes.add(hash);
      dedupedAttachments.push(att);
    }
  }

  const dedupedSections = (topic.sections || []).map((sec) => {
    if (!Array.isArray(sec.contentBlocks) || sec.contentBlocks.length === 0) {
      return sec;
    }
    const seenBlockMediaHashes = new Set<string>();
    const filteredBlocks = sec.contentBlocks.filter((blk) => {
      if (blk.type === 'image' || blk.type === 'attachment' || blk.type === 'audio') {
        const anyBlk = blk as unknown as {
          mediaIdbKey?: string;
          mediaUrl?: string;
          imageUrl?: string;
        };
        const mediaKey = anyBlk.mediaIdbKey || anyBlk.mediaUrl || anyBlk.imageUrl || '';
        if (!mediaKey) return true;
        const mHash = computeDeterministicFastHashHex(`${blk.type}:${mediaKey}`);
        if (seenBlockMediaHashes.has(mHash)) {
          return false;
        }
        seenBlockMediaHashes.add(mHash);
      }
      return true;
    });
    return {
      ...sec,
      contentBlocks: filteredBlocks
    };
  });

  return {
    ...topic,
    images: dedupedImages,
    attachments: dedupedAttachments,
    sections: dedupedSections
  };
}

export function loadLocallyRemovedRegistry(): LocallyRemovedRegistry {
  try {
    const raw = getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.LOCALLY_REMOVED_IDS);
    if (!raw) {
      return { blocks: [], subjects: [], topics: [], terms: [], sentences: [], books: [], exams: [] };
    }
    const parsed = JSON.parse(raw) as Partial<LocallyRemovedRegistry>;
    return {
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
      books: Array.isArray(parsed.books) ? parsed.books : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : []
    };
  } catch {
    return { blocks: [], subjects: [], topics: [], terms: [], sentences: [], books: [], exams: [] };
  }
}

export function saveLocallyRemovedRegistry(reg: LocallyRemovedRegistry): void {
  const deduped: LocallyRemovedRegistry = {
    blocks: Array.from(new Set(reg.blocks)),
    subjects: Array.from(new Set(reg.subjects)),
    topics: Array.from(new Set(reg.topics)),
    terms: Array.from(new Set(reg.terms)),
    sentences: Array.from(new Set(reg.sentences)),
    books: Array.from(new Set(reg.books || [])),
    exams: Array.from(new Set(reg.exams || []))
  };
  getSafeStorage().setItem(
    CLOUD_LIBRARY_STORAGE_KEYS.LOCALLY_REMOVED_IDS,
    JSON.stringify(deduped)
  );
}

export function clearLocallyRemovedRegistry(): void {
  getSafeStorage().removeItem(CLOUD_LIBRARY_STORAGE_KEYS.LOCALLY_REMOVED_IDS);
  getSafeStorage().removeItem(CLOUD_LIBRARY_STORAGE_KEYS.PERMANENTLY_DELETED_IDS);
}

export function loadPermanentlyDeletedRegistry(): LocallyRemovedRegistry {
  try {
    const raw = getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.PERMANENTLY_DELETED_IDS);
    if (!raw) {
      return { blocks: [], subjects: [], topics: [], terms: [], sentences: [], books: [], exams: [] };
    }
    const parsed = JSON.parse(raw) as Partial<LocallyRemovedRegistry>;
    return {
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
      books: Array.isArray(parsed.books) ? parsed.books : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : []
    };
  } catch {
    return { blocks: [], subjects: [], topics: [], terms: [], sentences: [], books: [], exams: [] };
  }
}

export function savePermanentlyDeletedRegistry(reg: LocallyRemovedRegistry): void {
  const deduped: LocallyRemovedRegistry = {
    blocks: Array.from(new Set(reg.blocks)),
    subjects: Array.from(new Set(reg.subjects)),
    topics: Array.from(new Set(reg.topics)),
    terms: Array.from(new Set(reg.terms)),
    sentences: Array.from(new Set(reg.sentences)),
    books: Array.from(new Set(reg.books || [])),
    exams: Array.from(new Set(reg.exams || []))
  };
  getSafeStorage().setItem(
    CLOUD_LIBRARY_STORAGE_KEYS.PERMANENTLY_DELETED_IDS,
    JSON.stringify(deduped)
  );
}

export function clearPermanentlyDeletedRegistry(): void {
  getSafeStorage().removeItem(CLOUD_LIBRARY_STORAGE_KEYS.PERMANENTLY_DELETED_IDS);
}

export function loadKnownCloudHashes(): Record<string, string> {
  try {
    const raw = getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.KNOWN_HASHES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveKnownCloudHashes(hashes: Record<string, string>): void {
  getSafeStorage().setItem(CLOUD_LIBRARY_STORAGE_KEYS.KNOWN_HASHES, JSON.stringify(hashes));
}

export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.SYNC_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveSyncQueue(queue: SyncQueueItem[]): void {
  getSafeStorage().setItem(CLOUD_LIBRARY_STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
  notifyCloudLibraryListeners();
}

/**
 * Builds the canonical remote cloud seed snapshot (for server `/api/cloud-library` and online sync).
 */
export function buildCanonicalCloudSeedSnapshot(): UnifiedCloudStoreSnapshot {
  const enrichedTopics = enrichAllTopicsWithHierarchy([...INITIAL_TOPICS]);
  const hashes: Record<string, string> = {};

  for (const b of INITIAL_MEDICAL_BLOCKS) {
    hashes[`block:${b.id}`] = computeDeterministicFastHashHex(canonicalizeForHash('block', b));
  }
  for (const s of INITIAL_MEDICAL_SUBJECTS) {
    hashes[`subject:${s.id}`] = computeDeterministicFastHashHex(
      canonicalizeForHash('subject', s)
    );
  }
  for (const t of enrichedTopics) {
    hashes[`topic:${t.id}`] = computeDeterministicFastHashHex(canonicalizeForHash('topic', t));
  }
  for (const tm of INITIAL_TERMS) {
    hashes[`term:${tm.id}`] = computeDeterministicFastHashHex(canonicalizeForHash('term', tm));
  }
  for (const sn of INITIAL_LINKED_SENTENCES) {
    hashes[`sentence:${sn.id}`] = computeDeterministicFastHashHex(
      canonicalizeForHash('sentence', sn)
    );
  }

  return {
    version: '2.4.0-cloud',
    updatedAt: new Date().toISOString(),
    blocks: [...INITIAL_MEDICAL_BLOCKS],
    subjects: [...INITIAL_MEDICAL_SUBJECTS],
    topics: enrichedTopics,
    terms: [...INITIAL_TERMS],
    sentences: [...INITIAL_LINKED_SENTENCES],
    mediaRecords: [],
    books: [],
    exams: [],
    quizQuestions: [],
    mediaAssets: [],
    collectionHashes: {},
    hashes
  };
}

/**
 * Loads the client-side Unified Cloud Mirror.
 * IMPORTANT: Never pre-populates blocks, subjects, or topics offline before an internet sync occurs.
 */
export function loadUnifiedCloudMirror(): UnifiedCloudStoreSnapshot {
  if (inMemoryCloudMirror) {
    return inMemoryCloudMirror;
  }

  try {
    const raw = getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.CLOUD_SNAPSHOT_MIRROR);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UnifiedCloudStoreSnapshot>;
      if (
        parsed &&
        Array.isArray(parsed.blocks) &&
        Array.isArray(parsed.subjects) &&
        Array.isArray(parsed.topics)
      ) {
        const isBrowserRuntime = typeof window !== 'undefined';
        inMemoryCloudMirror = {
          version: parsed.version || '2.4.0-cloud',
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          blocks: parsed.blocks,
          subjects: parsed.subjects,
          topics: enrichAllTopicsWithHierarchy(
            parsed.topics,
            parsed.blocks,
            parsed.subjects
          ),
          terms: Array.isArray(parsed.terms)
            ? parsed.terms
            : isBrowserRuntime
              ? []
              : [...INITIAL_TERMS],
          sentences: Array.isArray(parsed.sentences)
            ? parsed.sentences
            : isBrowserRuntime
              ? []
              : [...INITIAL_LINKED_SENTENCES],
          mediaRecords: Array.isArray(parsed.mediaRecords) ? parsed.mediaRecords : [],
          books: Array.isArray(parsed.books) ? parsed.books : [],
          exams: Array.isArray(parsed.exams) ? parsed.exams : [],
          quizQuestions: Array.isArray(parsed.quizQuestions) ? parsed.quizQuestions : [],
          mediaAssets: Array.isArray(parsed.mediaAssets) ? parsed.mediaAssets : [],
          customAffixes: Array.isArray(parsed.customAffixes) ? parsed.customAffixes : [],
          customAbbreviations: Array.isArray(parsed.customAbbreviations)
            ? parsed.customAbbreviations
            : [],
          contentTypesRegistry: Array.isArray(parsed.contentTypesRegistry)
            ? parsed.contentTypesRegistry
            : [],
          dynamicCollections: Array.isArray(parsed.dynamicCollections)
            ? parsed.dynamicCollections
            : [],
          collectionHashes:
            parsed.collectionHashes && typeof parsed.collectionHashes === 'object'
              ? parsed.collectionHashes
              : {},
          catalogVersion: parsed.catalogVersion,
          hashes: parsed.hashes && typeof parsed.hashes === 'object' ? parsed.hashes : {}
        };
        return inMemoryCloudMirror;
      }
    }
  } catch {
    // ignore parse errors
  }

  const isBrowserRuntime = typeof window !== 'undefined';
  const defaultTerms = isBrowserRuntime ? [] : [...INITIAL_TERMS];
  const defaultSentences = isBrowserRuntime ? [] : [...INITIAL_LINKED_SENTENCES];
  const hashes: Record<string, string> = {};
  for (const tm of defaultTerms) {
    hashes[`term:${tm.id}`] = computeDeterministicFastHashHex(canonicalizeForHash('term', tm));
  }
  for (const sn of defaultSentences) {
    hashes[`sentence:${sn.id}`] = computeDeterministicFastHashHex(
      canonicalizeForHash('sentence', sn)
    );
  }

  const emptyClientMirror: UnifiedCloudStoreSnapshot = {
    version: '2.4.0-cloud',
    updatedAt: new Date().toISOString(),
    blocks: [],
    subjects: [],
    topics: [],
    terms: defaultTerms,
    sentences: defaultSentences,
    mediaRecords: [],
    books: [],
    exams: [],
    quizQuestions: [],
    mediaAssets: [],
    customAffixes: [],
    customAbbreviations: [],
    contentTypesRegistry: [],
    dynamicCollections: [],
    collectionHashes: {},
    hashes
  };

  inMemoryCloudMirror = emptyClientMirror;
  return emptyClientMirror;
}

export function saveUnifiedCloudMirror(snapshot: UnifiedCloudStoreSnapshot): void {
  inMemoryCloudMirror = snapshot;
  // Store lightweight mirror in localStorage (avoiding huge base64 media overflow if quota is tight)
  try {
    getSafeStorage().setItem(
      CLOUD_LIBRARY_STORAGE_KEYS.CLOUD_SNAPSHOT_MIRROR,
      JSON.stringify(snapshot)
    );
  } catch {
    // If quota is exceeded, save without bulky inline mediaRecords while keeping full in-memory mirror
    try {
      getSafeStorage().setItem(
        CLOUD_LIBRARY_STORAGE_KEYS.CLOUD_SNAPSHOT_MIRROR,
        JSON.stringify({ ...snapshot, mediaRecords: [] })
      );
    } catch {
      // ignore
    }
  }
}

/**
 * Applies incoming upsert records into a UnifiedCloudStoreSnapshot with strict ID + SHA-256 deduplication.
 */
export function mergeRecordsIntoCloudSnapshot(
  current: UnifiedCloudStoreSnapshot,
  incoming: {
    blocks?: MedicalBlock[];
    subjects?: MedicalSubject[];
    topics?: TopicArticle[];
    terms?: DictionaryTerm[];
    sentences?: LinkedSentence[];
    mediaRecords?: LocalMediaRecord[];
    books?: AcademicBookResource[];
    exams?: AcademicExamPackage[];
    quizQuestions?: UnifiedQuizQuestion[];
    mediaAssets?: MediaAssetRecord[];
    customAffixes?: MorphologicalAffix[];
    customAbbreviations?: ClinicalAbbreviation[];
    contentTypesRegistry?: ContentTypeRegistryEntry[];
    dynamicCollections?: DynamicCatalogCollection[];
    collectionHashes?: Record<string, string>;
    catalogVersion?: string;
  }
): {
  snapshot: UnifiedCloudStoreSnapshot;
  appliedCount: number;
  skippedIdenticalCount: number;
} {
  let appliedCount = 0;
  let skippedIdenticalCount = 0;
  const nextHashes = { ...(current.hashes || {}) };

  const blocksMap = new Map(current.blocks.map((b) => [b.id, b]));
  for (const blk of incoming.blocks || []) {
    if (!blk || !blk.id) continue;
    const key = `block:${blk.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('block', blk));
    if (nextHashes[key] === hash && blocksMap.has(blk.id)) {
      skippedIdenticalCount += 1;
      continue;
    }
    blocksMap.set(blk.id, blk);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const subjectsMap = new Map(current.subjects.map((s) => [s.id, s]));
  for (const subj of incoming.subjects || []) {
    if (!subj || !subj.id) continue;
    const key = `subject:${subj.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('subject', subj));
    if (nextHashes[key] === hash && subjectsMap.has(subj.id)) {
      skippedIdenticalCount += 1;
      continue;
    }
    subjectsMap.set(subj.id, subj);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const topicsMap = new Map(current.topics.map((t) => [t.id, t]));
  for (const rawTopic of incoming.topics || []) {
    if (!rawTopic || !rawTopic.id) continue;
    const cleanTopic = deduplicateTopicMediaAndAttachments(rawTopic);
    const existingTopic = topicsMap.get(cleanTopic.id);
    const preservedTopic: TopicArticle = existingTopic
      ? { ...cleanTopic, favorite: existingTopic.favorite || cleanTopic.favorite }
      : cleanTopic;
    const key = `topic:${preservedTopic.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('topic', preservedTopic));
    if (nextHashes[key] === hash && existingTopic) {
      skippedIdenticalCount += 1;
      continue;
    }
    topicsMap.set(preservedTopic.id, preservedTopic);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const termsMap = new Map(current.terms.map((t) => [t.id, t]));
  const termByNormName = new Map(
    current.terms.map((t) => [(t.termNormalized || t.term).toLowerCase(), t.id])
  );
  for (const term of incoming.terms || []) {
    if (!term || !term.term) continue;
    const norm = (term.termNormalized || term.term).trim().toLowerCase();
    const resolvedId = termsMap.has(term.id)
      ? term.id
      : termByNormName.get(norm) || term.id;
    const existingTerm = termsMap.get(resolvedId);
    const rawAny = term as unknown as Record<string, unknown>;
    const normalizedExamples = Array.isArray(term.examples)
      ? term.examples
      : Array.isArray(rawAny.examples)
        ? (rawAny.examples as DictionaryTerm['examples'])
        : [];
    const normalizedRelations = {
      synonyms: Array.isArray(term.relations?.synonyms) ? term.relations.synonyms : [],
      broader: Array.isArray(term.relations?.broader) ? term.relations.broader : [],
      related: Array.isArray(term.relations?.related) ? term.relations.related : []
    };
    const normalizedTerm: DictionaryTerm = {
      ...term,
      id: resolvedId,
      termNormalized: norm,
      translation:
        typeof term.translation === 'string'
          ? term.translation
          : typeof rawAny.arabicTranslation === 'string'
            ? rawAny.arabicTranslation
            : typeof rawAny.ar === 'string'
              ? rawAny.ar
              : existingTerm?.translation || '',
      phonetic: typeof term.phonetic === 'string' ? term.phonetic : existingTerm?.phonetic || '',
      pos: typeof term.pos === 'string' ? term.pos : existingTerm?.pos || 'noun',
      category: term.category || existingTerm?.category || 'Medical',
      keepEnglish: term.keepEnglish ?? existingTerm?.keepEnglish ?? true,
      ingestedAt: term.ingestedAt || existingTerm?.ingestedAt || new Date().toISOString().slice(0, 10),
      definitionAr:
        typeof term.definitionAr === 'string'
          ? term.definitionAr
          : typeof rawAny.arabicDefinition === 'string'
            ? rawAny.arabicDefinition
            : existingTerm?.definitionAr || '',
      definitionEn:
        typeof term.definitionEn === 'string'
          ? term.definitionEn
          : typeof rawAny.englishDefinition === 'string'
            ? rawAny.englishDefinition
            : typeof rawAny.definition === 'string'
              ? rawAny.definition
              : existingTerm?.definitionEn || '',
      examples: normalizedExamples,
      relations: normalizedRelations,
      favorite: existingTerm ? Boolean(existingTerm.favorite || term.favorite) : Boolean(term.favorite),
      collections: existingTerm
        ? Array.from(new Set([...(existingTerm.collections || []), ...(Array.isArray(term.collections) ? term.collections : [])]))
        : Array.isArray(term.collections)
          ? term.collections
          : [],
      srsData: existingTerm?.srsData || term.srsData,
      lastStudiedAt: existingTerm?.lastStudiedAt || term.lastStudiedAt,
      studyCount: existingTerm?.studyCount ?? term.studyCount
    };
    const key = `term:${resolvedId}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('term', normalizedTerm));
    if (nextHashes[key] === hash && existingTerm) {
      skippedIdenticalCount += 1;
      continue;
    }
    termsMap.set(resolvedId, normalizedTerm);
    termByNormName.set(norm, resolvedId);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const sentencesMap = new Map(current.sentences.map((s) => [s.id, s]));
  const sentenceByEn = new Map(
    current.sentences.map((s) => [s.en.trim().toLowerCase(), s.id])
  );
  for (const sen of incoming.sentences || []) {
    if (!sen || !sen.en) continue;
    const normEn = sen.en.trim().toLowerCase();
    const resolvedId = sentencesMap.has(sen.id)
      ? sen.id
      : sentenceByEn.get(normEn) || sen.id;
    const existingSen = sentencesMap.get(resolvedId);
    const normalizedSen: LinkedSentence = {
      ...sen,
      id: resolvedId,
      favorite: existingSen ? Boolean(existingSen.favorite || sen.favorite) : Boolean(sen.favorite),
      srsData: existingSen?.srsData || sen.srsData
    };
    const key = `sentence:${resolvedId}`;
    const hash = computeDeterministicFastHashHex(
      canonicalizeForHash('sentence', normalizedSen)
    );
    if (nextHashes[key] === hash && existingSen) {
      skippedIdenticalCount += 1;
      continue;
    }
    sentencesMap.set(resolvedId, normalizedSen);
    sentenceByEn.set(normEn, resolvedId);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const mediaMap = new Map(current.mediaRecords.map((m) => [m.id, m]));
  const mediaHashSet = new Set(
    current.mediaRecords.map((m) => computeDeterministicFastHashHex(`media:${m.dataUrl}`))
  );
  for (const media of incoming.mediaRecords || []) {
    if (!media || !media.id || !media.dataUrl) continue;
    const contentHash = computeDeterministicFastHashHex(`media:${media.dataUrl}`);
    const key = `media:${media.id}`;
    if ((nextHashes[key] === contentHash && mediaMap.has(media.id)) || mediaHashSet.has(contentHash)) {
      skippedIdenticalCount += 1;
      continue;
    }
    mediaMap.set(media.id, media);
    mediaHashSet.add(contentHash);
    nextHashes[key] = contentHash;
    appliedCount += 1;
  }

  const booksMap = new Map((current.books || []).map((b) => [b.id, b]));
  for (const rawBook of incoming.books || []) {
    if (!rawBook || !rawBook.id) continue;
    const normalizedBook = normalizeAcademicBookResource(
      rawBook as Partial<AcademicBookResource> & Record<string, unknown>
    );
    const existingBook = booksMap.get(normalizedBook.id);
    const preservedBook: AcademicBookResource = existingBook
      ? {
          ...normalizedBook,
          favorite: existingBook.favorite ?? normalizedBook.favorite,
          bookmarks: existingBook.bookmarks?.length ? existingBook.bookmarks : normalizedBook.bookmarks,
          lastReadPage: existingBook.lastReadPage ?? normalizedBook.lastReadPage,
          readingProgressPercent:
            existingBook.readingProgressPercent ?? normalizedBook.readingProgressPercent,
          notes: existingBook.notes ?? normalizedBook.notes,
          mediaIdbKey: existingBook.mediaIdbKey || normalizedBook.mediaIdbKey,
          coverIdbKey: existingBook.coverIdbKey || normalizedBook.coverIdbKey
        }
      : normalizedBook;
    const key = `book:${preservedBook.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('book', preservedBook));
    if (nextHashes[key] === hash && existingBook) {
      skippedIdenticalCount += 1;
      continue;
    }
    booksMap.set(preservedBook.id, preservedBook);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const examsMap = new Map((current.exams || []).map((ex) => [ex.id, ex]));
  for (const rawEx of incoming.exams || []) {
    if (!rawEx || !rawEx.id) continue;
    const ex = normalizeAcademicExamPackage(
      rawEx as Partial<AcademicExamPackage> & Record<string, unknown>
    );
    const key = `exam:${ex.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('exam', ex));
    if (nextHashes[key] === hash && examsMap.has(ex.id)) {
      skippedIdenticalCount += 1;
      continue;
    }
    examsMap.set(ex.id, ex);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const questionsMap = new Map((current.quizQuestions || []).map((q) => [q.id, q]));
  for (const q of incoming.quizQuestions || []) {
    if (!q || !q.id) continue;
    const key = `question:${q.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('question', q));
    if (nextHashes[key] === hash && questionsMap.has(q.id)) {
      skippedIdenticalCount += 1;
      continue;
    }
    questionsMap.set(q.id, q);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const mediaAssetsMap = new Map((current.mediaAssets || []).map((ma) => [ma.id, ma]));
  for (const rawMa of incoming.mediaAssets || []) {
    if (!rawMa || !rawMa.id) continue;
    const ma = normalizeMediaAssetRecord(
      rawMa as Partial<MediaAssetRecord> & Record<string, unknown>
    );
    const key = `media_asset:${ma.id}`;
    const hash = computeDeterministicFastHashHex(canonicalizeForHash('media_asset', ma));
    if (nextHashes[key] === hash && mediaAssetsMap.has(ma.id)) {
      skippedIdenticalCount += 1;
      continue;
    }
    mediaAssetsMap.set(ma.id, ma);
    nextHashes[key] = hash;
    appliedCount += 1;
  }

  const normalizeMirrorAffix = (rawAf: MorphologicalAffix & { morpheme?: string }): MorphologicalAffix | null => {
    if (!rawAf) return null;
    const rawAffix = String(rawAf.affix || rawAf.morpheme || '').trim();
    const cleanKey = String(rawAf.cleanKey || rawAffix.replace(/^-+|-+$/g, '') || rawAf.id || '').trim();
    if (!cleanKey) return null;
    return {
      ...rawAf,
      affix: rawAffix || cleanKey,
      cleanKey
    };
  };

  const affixMap = new Map<string, MorphologicalAffix>();
  for (const existingAf of current.customAffixes || []) {
    const norm = normalizeMirrorAffix(existingAf as MorphologicalAffix & { morpheme?: string });
    if (norm) affixMap.set(`${norm.cleanKey.toLowerCase()}_${norm.type}`, norm);
  }
  for (const incomingAf of incoming.customAffixes || []) {
    const norm = normalizeMirrorAffix(incomingAf as MorphologicalAffix & { morpheme?: string });
    if (norm) affixMap.set(`${norm.cleanKey.toLowerCase()}_${norm.type}`, norm);
  }

  const abbrMap = new Map(
    (current.customAbbreviations || []).map((ab) => [ab.abbr.toLowerCase(), ab])
  );
  for (const ab of incoming.customAbbreviations || []) {
    if (!ab || !ab.abbr) continue;
    abbrMap.set(ab.abbr.toLowerCase(), ab);
  }

  const dynamicColMap = new Map(
    (current.dynamicCollections || []).map((dc) => [dc.id, dc])
  );
  for (const dc of incoming.dynamicCollections || []) {
    if (!dc || !dc.id) continue;
    dynamicColMap.set(dc.id, dc);
    appliedCount += 1;
  }

  const nextRegistry =
    incoming.contentTypesRegistry && incoming.contentTypesRegistry.length > 0
      ? incoming.contentTypesRegistry
      : current.contentTypesRegistry || [];

  const mergedBlocks = Array.from(blocksMap.values()).sort((a, b) => a.order - b.order);
  const mergedSubjects = Array.from(subjectsMap.values()).sort((a, b) => a.order - b.order);

  const snapshot: UnifiedCloudStoreSnapshot = {
    version: current.version,
    updatedAt: appliedCount > 0 ? new Date().toISOString() : current.updatedAt,
    blocks: mergedBlocks,
    subjects: mergedSubjects,
    topics: enrichAllTopicsWithHierarchy(
      Array.from(topicsMap.values()),
      mergedBlocks,
      mergedSubjects
    ),
    terms: Array.from(termsMap.values()),
    sentences: Array.from(sentencesMap.values()),
    mediaRecords: Array.from(mediaMap.values()),
    books: Array.from(booksMap.values()),
    exams: Array.from(examsMap.values()),
    quizQuestions: Array.from(questionsMap.values()),
    mediaAssets: Array.from(mediaAssetsMap.values()),
    customAffixes: Array.from(affixMap.values()),
    customAbbreviations: Array.from(abbrMap.values()),
    contentTypesRegistry: nextRegistry,
    dynamicCollections: Array.from(dynamicColMap.values()),
    collectionHashes: {
      ...(current.collectionHashes || {}),
      ...(incoming.collectionHashes || {})
    },
    catalogVersion: incoming.catalogVersion || current.catalogVersion,
    hashes: nextHashes
  };

  return { snapshot, appliedCount, skippedIdenticalCount };
}

/**
 * Enqueues one or more added/updated entities into the persistent Automatic Sync Queue.
 * Skips any item whose SHA-256 matches the already-synced cloud hash (preventing duplicate uploads).
 * Immediately triggers background sync if online.
 */
export async function enqueueEntitiesForCloudSync(params: {
  blocks?: MedicalBlock[];
  subjects?: MedicalSubject[];
  topics?: TopicArticle[];
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  mediaRecords?: LocalMediaRecord[];
  triggerImmediateSync?: boolean;
}): Promise<{
  enqueuedCount: number;
  skippedDuplicateCount: number;
  queueLength: number;
}> {
  const knownHashes = loadKnownCloudHashes();
  const mirror = loadUnifiedCloudMirror();
  const queue = loadSyncQueue();
  let enqueuedCount = 0;
  let skippedDuplicateCount = 0;
  const nowIso = new Date().toISOString();

  const upsertQueueItem = async (
    entityType: CloudEntityType,
    entityId: string,
    title: string,
    payload: unknown
  ) => {
    const sha256 = await computeEntitySha256(entityType, payload);
    const fastHash = computeDeterministicFastHashHex(canonicalizeForHash(entityType, payload));
    const hashKey = `${entityType}:${entityId}`;

    // Check if already synced with exact same SHA-256 or fast hash
    const existingQueueIdx = queue.findIndex(
      (q) => q.entityType === entityType && q.entityId === entityId
    );
    if (
      existingQueueIdx === -1 &&
      (knownHashes[hashKey] === sha256 || mirror.hashes[hashKey] === fastHash)
    ) {
      skippedDuplicateCount += 1;
      return;
    }

    if (existingQueueIdx !== -1 && queue[existingQueueIdx].sha256 === sha256) {
      skippedDuplicateCount += 1;
      return;
    }

    const sizeBytes = computeEntitySizeBytes(payload);
    const nextItem: SyncQueueItem = {
      id: `sync-${entityType}-${entityId}-${Date.now()}`,
      entityType,
      entityId,
      title,
      sha256,
      sizeBytes,
      updatedAt: nowIso,
      status: 'pending',
      attempts: 0,
      payload
    };

    if (existingQueueIdx !== -1) {
      queue[existingQueueIdx] = nextItem;
    } else {
      queue.push(nextItem);
    }
    enqueuedCount += 1;
  };

  for (const b of params.blocks || []) {
    if (!b || !b.id) continue;
    await upsertQueueItem('block', b.id, b.titleAr || b.titleEn || b.code, b);
  }

  for (const s of params.subjects || []) {
    if (!s || !s.id) continue;
    await upsertQueueItem('subject', s.id, s.titleAr || s.titleEn || s.code, s);
  }

  for (const t of params.topics || []) {
    if (!t || !t.id) continue;
    const dedupedTopic = deduplicateTopicMediaAndAttachments(t);
    await upsertQueueItem(
      'topic',
      dedupedTopic.id,
      dedupedTopic.titleAr || dedupedTopic.title || dedupedTopic.titleEn || dedupedTopic.id,
      dedupedTopic
    );

    // Also enqueue any associated IndexedDB audio/media records for this topic
    const topicMedia = await getMediaRecordsByTopicId(dedupedTopic.id);
    for (const m of topicMedia) {
      await upsertQueueItem('media', m.id, m.fileName || m.id, m);
    }
  }

  for (const tm of params.terms || []) {
    if (!tm || !tm.id) continue;
    await upsertQueueItem('term', tm.id, `${tm.term} (${tm.translation})`, tm);
  }

  for (const sn of params.sentences || []) {
    if (!sn || !sn.id) continue;
    await upsertQueueItem('sentence', sn.id, sn.en.slice(0, 50), sn);
  }

  for (const m of params.mediaRecords || []) {
    if (!m || !m.id) continue;
    await upsertQueueItem('media', m.id, m.fileName || m.id, m);
  }

  saveSyncQueue(queue);

  if (params.triggerImmediateSync !== false && isCloudSyncOnline()) {
    await processCloudSyncQueue();
  }

  return {
    enqueuedCount,
    skippedDuplicateCount,
    queueLength: loadSyncQueue().filter((q) => q.status !== 'synced').length
  };
}

/**
 * Processes pending and retryable items in the Automatic Sync Queue:
 * - Pushes batch updates to `/api/cloud-library` when reachable AND updates the local Cloud Mirror.
 * - Handles offline state gracefully (keeps items `pending`).
 * - Handles upload errors by marking items `failed` with automatic exponential backoff retry.
 */
export async function processCloudSyncQueue(options?: {
  forceRetryFailed?: boolean;
  customFetch?: typeof fetch;
}): Promise<{
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  status: SyncItemStatus;
  error?: string;
}> {
  const queue = loadSyncQueue();
  const actionable = queue.filter((item) => {
    if (item.status === 'pending') return true;
    if (item.status === 'failed') {
      if (options?.forceRetryFailed) return true;
      if (!item.nextRetryAt || Date.now() >= item.nextRetryAt) return true;
    }
    return false;
  });

  if (actionable.length === 0) {
    const failed = queue.filter((q) => q.status === 'failed').length;
    const pending = queue.filter((q) => q.status === 'pending').length;
    return {
      syncedCount: 0,
      pendingCount: pending,
      failedCount: failed,
      status: failed > 0 ? 'failed' : pending > 0 ? 'pending' : 'synced'
    };
  }

  if (!isCloudSyncOnline()) {
    return {
      syncedCount: 0,
      pendingCount: queue.filter((q) => q.status !== 'synced').length,
      failedCount: queue.filter((q) => q.status === 'failed').length,
      status: 'pending'
    };
  }

  if (isSyncLoopRunning) {
    return {
      syncedCount: 0,
      pendingCount: queue.filter((q) => q.status === 'pending').length,
      failedCount: queue.filter((q) => q.status === 'failed').length,
      status: 'syncing'
    };
  }

  isSyncLoopRunning = true;
  try {
    // Mark actionable items as syncing
    const actionableIds = new Set(actionable.map((a) => a.id));
    for (const q of queue) {
      if (actionableIds.has(q.id)) {
        q.status = 'syncing';
      }
    }
    saveSyncQueue(queue);

    const batchPayload = {
      blocks: actionable
        .filter((i) => i.entityType === 'block')
        .map((i) => i.payload as MedicalBlock),
      subjects: actionable
        .filter((i) => i.entityType === 'subject')
        .map((i) => i.payload as MedicalSubject),
      topics: actionable
        .filter((i) => i.entityType === 'topic')
        .map((i) => i.payload as TopicArticle),
      terms: actionable
        .filter((i) => i.entityType === 'term')
        .map((i) => i.payload as DictionaryTerm),
      sentences: actionable
        .filter((i) => i.entityType === 'sentence')
        .map((i) => i.payload as LinkedSentence),
      mediaRecords: actionable
        .filter((i) => i.entityType === 'media')
        .map((i) => i.payload as LocalMediaRecord)
    };

    const fetchFn = options?.customFetch || customCloudFetchOverride;
    let remoteError: string | null = null;

    if (fetchFn) {
      const res = await fetchFn('/api/cloud-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_push', ...batchPayload })
      });
      if (!res.ok) {
        remoteError = `HTTP ${res.status} ${res.statusText}`.trim();
      }
    } else if (
      typeof window !== 'undefined' &&
      typeof window.location?.protocol === 'string' &&
      /^https?:$/i.test(window.location.protocol) &&
      typeof globalThis.fetch === 'function'
    ) {
      try {
        const res = await globalThis.fetch('/api/cloud-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_push', ...batchPayload })
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok && !ct.includes('text/html') && res.status >= 500) {
          remoteError = `HTTP ${res.status}`;
        }
      } catch {
        // When running on standalone static/APK without local express endpoint, mirror persists locally and via GitHub fallback
      }
    }

    if (remoteError) {
      for (const q of queue) {
        if (actionableIds.has(q.id)) {
          q.status = 'failed';
          q.attempts = (q.attempts || 0) + 1;
          q.lastError = `تعذر الرفع إلى المكتبة السحابية (${remoteError})`;
          q.nextRetryAt = Date.now() + Math.min(60000, 2000 * Math.pow(2, q.attempts));
        }
      }
      saveSyncQueue(queue);
      return {
        syncedCount: 0,
        pendingCount: queue.filter((q) => q.status === 'pending').length,
        failedCount: queue.filter((q) => q.status === 'failed').length,
        status: 'failed',
        error: remoteError
      };
    }

    // Merge into unified cloud mirror and record verified SHA-256 hashes
    const currentMirror = loadUnifiedCloudMirror();
    const merged = mergeRecordsIntoCloudSnapshot(currentMirror, batchPayload);
    saveUnifiedCloudMirror(merged.snapshot);

    const knownHashes = loadKnownCloudHashes();
    for (const item of actionable) {
      knownHashes[`${item.entityType}:${item.entityId}`] = item.sha256;
    }
    saveKnownCloudHashes(knownHashes);

    const remainingQueue = queue.filter((q) => !actionableIds.has(q.id));
    saveSyncQueue(remainingQueue);
    getSafeStorage().setItem(
      CLOUD_LIBRARY_STORAGE_KEYS.LAST_SYNCED_AT,
      new Date().toISOString()
    );
    notifyCloudLibraryListeners();

    return {
      syncedCount: actionable.length,
      pendingCount: remainingQueue.filter((q) => q.status === 'pending').length,
      failedCount: remainingQueue.filter((q) => q.status === 'failed').length,
      status: remainingQueue.some((q) => q.status === 'failed')
        ? 'failed'
        : remainingQueue.length > 0
        ? 'pending'
        : 'synced'
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const currentQueue = loadSyncQueue();
    for (const q of currentQueue) {
      if (q.status === 'syncing') {
        q.status = 'failed';
        q.attempts = (q.attempts || 0) + 1;
        q.lastError = errMsg;
        q.nextRetryAt = Date.now() + Math.min(60000, 2000 * Math.pow(2, q.attempts));
      }
    }
    saveSyncQueue(currentQueue);
    return {
      syncedCount: 0,
      pendingCount: currentQueue.filter((q) => q.status === 'pending').length,
      failedCount: currentQueue.filter((q) => q.status === 'failed').length,
      status: 'failed',
      error: errMsg
    };
  } finally {
    isSyncLoopRunning = false;
  }
}

async function fetchUmedtDataJsonWithFallback(
  url: string,
  fetchFn: typeof fetch
): Promise<Response | null> {
  try {
    const direct = await fetchFn(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (direct.ok) return direct;
  } catch {
    // Try relay below
  }
  if (
    typeof window !== 'undefined' &&
    /^https?:$/i.test(window.location?.protocol || '') &&
    !customCloudFetchOverride
  ) {
    try {
      const relay = await fetchFn(`/api/remote-fetch?url=${encodeURIComponent(url)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (relay.ok) return relay;
    } catch {
      // ignore relay failure
    }
  }
  return null;
}

function extractCollectionArray<T>(raw: unknown, keyHint: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj[keyHint])) return obj[keyHint] as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.records)) return obj.records as T[];
    if (Array.isArray(obj.assets)) return obj.assets as T[];
    if (Array.isArray(obj.files)) return obj.files as T[];
  }
  return [];
}

function toDynamicCatalogItem(raw: unknown, idx: number): DynamicCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = String(obj.id || obj.code || obj.slug || `dyn-${Date.now()}-${idx}`);
  return {
    id,
    titleEn: typeof obj.titleEn === 'string' ? obj.titleEn : typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : id,
    titleAr: typeof obj.titleAr === 'string' ? obj.titleAr : typeof obj.nameAr === 'string' ? obj.nameAr : typeof obj.title === 'string' ? obj.title : undefined,
    subtitleEn: typeof obj.subtitleEn === 'string' ? obj.subtitleEn : typeof obj.subtitle === 'string' ? obj.subtitle : undefined,
    subtitleAr: typeof obj.subtitleAr === 'string' ? obj.subtitleAr : undefined,
    summaryEn: typeof obj.summaryEn === 'string' ? obj.summaryEn : typeof obj.descriptionEn === 'string' ? obj.descriptionEn : undefined,
    summaryAr: typeof obj.summaryAr === 'string' ? obj.summaryAr : typeof obj.descriptionAr === 'string' ? obj.descriptionAr : undefined,
    descriptionEn: typeof obj.descriptionEn === 'string' ? obj.descriptionEn : undefined,
    descriptionAr: typeof obj.descriptionAr === 'string' ? obj.descriptionAr : undefined,
    blockId: typeof obj.blockId === 'string' ? obj.blockId : undefined,
    subjectId: typeof obj.subjectId === 'string' ? obj.subjectId : undefined,
    topicId: typeof obj.topicId === 'string' ? obj.topicId : undefined,
    downloadUrl: typeof obj.downloadUrl === 'string' ? obj.downloadUrl : typeof obj.pdfUrl === 'string' ? obj.pdfUrl : undefined,
    rawUrl: typeof obj.rawUrl === 'string' ? obj.rawUrl : typeof obj.url === 'string' ? obj.url : undefined,
    url: typeof obj.url === 'string' ? obj.url : typeof obj.rawUrl === 'string' ? obj.rawUrl : undefined,
    mimeType: typeof obj.mimeType === 'string' ? obj.mimeType : undefined,
    sha256: typeof obj.sha256 === 'string' ? obj.sha256 : undefined,
    sizeBytes: typeof obj.sizeBytes === 'number' ? obj.sizeBytes : undefined,
    tags: Array.isArray(obj.tags) ? obj.tags.map((t) => String(t)) : undefined,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
    rawPayload: obj
  };
}

/**
 * Reads the external GitHub UMEDT-DATA repository via its canonical `data/catalog.json` entrypoint,
 * compares collection SHA-256 digests against cached hashes so unchanged files are skipped,
 * dynamically inspects `contentTypesRegistry` + `collections`, and returns parsed collections for all
 * core and newly discovered UMEDT-DATA schemas.
 */
export async function syncFromUmedtDataRepository(options?: {
  catalogUrl?: string;
  currentCollectionHashes?: Record<string, string>;
  customFetch?: typeof fetch;
}): Promise<{
  fetched: boolean;
  catalogVersion?: string;
  contentTypesRegistry?: ContentTypeRegistryEntry[];
  updatedCollectionsCount: number;
  skippedCollectionsCount: number;
  collectionHashes: Record<string, string>;
  incoming: {
    blocks?: MedicalBlock[];
    subjects?: MedicalSubject[];
    topics?: TopicArticle[];
    terms?: DictionaryTerm[];
    sentences?: LinkedSentence[];
    customAffixes?: MorphologicalAffix[];
    customAbbreviations?: ClinicalAbbreviation[];
    books?: AcademicBookResource[];
    exams?: AcademicExamPackage[];
    quizQuestions?: UnifiedQuizQuestion[];
    mediaAssets?: MediaAssetRecord[];
    contentTypesRegistry?: ContentTypeRegistryEntry[];
    dynamicCollections?: DynamicCatalogCollection[];
  };
}> {
  const fetchFn =
    options?.customFetch ||
    customCloudFetchOverride ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
  const prevHashes = { ...(options?.currentCollectionHashes || {}) };

  if (!fetchFn || !isCloudSyncOnline()) {
    return {
      fetched: false,
      updatedCollectionsCount: 0,
      skippedCollectionsCount: 0,
      collectionHashes: prevHashes,
      incoming: {}
    };
  }

  const targetCatalogUrl = options?.catalogUrl || UMEDT_DATA_CATALOG_URL;
  const catalogRes = await fetchUmedtDataJsonWithFallback(targetCatalogUrl, fetchFn);
  if (!catalogRes || !catalogRes.ok) {
    return {
      fetched: false,
      updatedCollectionsCount: 0,
      skippedCollectionsCount: 0,
      collectionHashes: prevHashes,
      incoming: {}
    };
  }

  const catalog = (await catalogRes.json()) as Partial<DataCatalogDocument>;
  if (!catalog || !Array.isArray(catalog.collections)) {
    return {
      fetched: false,
      updatedCollectionsCount: 0,
      skippedCollectionsCount: 0,
      collectionHashes: prevHashes,
      incoming: {}
    };
  }

  const registryEntries: ContentTypeRegistryEntry[] = Array.isArray(
    catalog.contentTypesRegistry
  )
    ? catalog.contentTypesRegistry
    : [];
  const registryByType = new Map(
    registryEntries.map((r) => [r.contentType.toLowerCase(), r])
  );

  const nextHashes = { ...prevHashes };
  const incoming: {
    blocks?: MedicalBlock[];
    subjects?: MedicalSubject[];
    topics?: TopicArticle[];
    terms?: DictionaryTerm[];
    sentences?: LinkedSentence[];
    customAffixes?: MorphologicalAffix[];
    customAbbreviations?: ClinicalAbbreviation[];
    books?: AcademicBookResource[];
    exams?: AcademicExamPackage[];
    quizQuestions?: UnifiedQuizQuestion[];
    mediaAssets?: MediaAssetRecord[];
    contentTypesRegistry?: ContentTypeRegistryEntry[];
    dynamicCollections?: DynamicCatalogCollection[];
  } = {
    contentTypesRegistry: registryEntries
  };

  let updatedCollectionsCount = 0;
  let skippedCollectionsCount = 0;

  const resolveRepoRelativeUrl = (rawOrRel: string, baseCatalogUrl: string): string => {
    const clean = (rawOrRel || '').trim();
    if (!clean) return '';
    if (/^(?:https?:|data:|blob:)/i.test(clean)) return clean;
    try {
      // Base repo root when catalog URL is .../data/catalog.json -> .../
      const repoRootUrl = baseCatalogUrl.replace(/\/data\/catalog\.json(?:[?#].*)?$/i, '/');
      return new URL(clean.replace(/^\/+/, ''), repoRootUrl).toString();
    } catch {
      return clean;
    }
  };

  for (const col of catalog.collections) {
    if (!col || !col.id || !col.rawUrl) continue;
    const resolvedColUrl = resolveRepoRelativeUrl(col.rawUrl, targetCatalogUrl);
    const expectedHash = (col.sha256 || '').trim();
    if (expectedHash && prevHashes[col.id] === expectedHash) {
      skippedCollectionsCount += 1;
      continue;
    }

    const colRes = await fetchUmedtDataJsonWithFallback(resolvedColUrl, fetchFn);
    if (!colRes || !colRes.ok) continue;

    const rawText = await colRes.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      continue;
    }

    // Verify per-collection SHA-256: reject explicit corrupt placeholder digests ('000...000'),
    // and accept valid parsed JSON when a collection file was edited directly on GitHub without regenerating catalog.json
    if (expectedHash && /^[0-9a-f]{64}$/i.test(expectedHash)) {
      const actualHash = await computeSha256Hex(new TextEncoder().encode(rawText));
      if (/^0{64}$/.test(expectedHash)) {
        console.warn(
          `[UMEDT-DATA] SHA-256 mismatch for collection "${col.id}": expected ${expectedHash}, got ${actualHash}. Skipping corrupted payload.`
        );
        continue;
      }
      nextHashes[col.id] = actualHash;
    } else if (expectedHash) {
      nextHashes[col.id] = expectedHash;
    }

    const idLower = col.id.toLowerCase();
    const ctLower = (col.contentType || '').toLowerCase();
    const regEntry = registryByType.get(ctLower);
    const rtLower = (
      col.rendererType ||
      regEntry?.rendererType ||
      ''
    ).toLowerCase();

    if (
      idLower === 'blocks' ||
      ctLower === 'block' ||
      ctLower === 'blocks' ||
      rtLower === 'block_hub' ||
      rtLower === 'hierarchy_grid'
    ) {
      incoming.blocks = extractCollectionArray<MedicalBlock>(parsedJson, 'blocks');
    } else if (
      idLower === 'subjects' ||
      ctLower === 'subject' ||
      ctLower === 'subjects' ||
      rtLower === 'subject_list'
    ) {
      incoming.subjects = extractCollectionArray<MedicalSubject>(parsedJson, 'subjects');
    } else if (
      idLower === 'topics' ||
      ctLower === 'topic' ||
      ctLower === 'topics' ||
      rtLower === 'topic_article' ||
      rtLower === 'rich_article'
    ) {
      incoming.topics = extractCollectionArray<TopicArticle>(parsedJson, 'topics');
    } else if (
      idLower === 'terms' ||
      ctLower === 'term' ||
      ctLower === 'terms' ||
      rtLower === 'lexicon_term' ||
      rtLower === 'lexicon_entry'
    ) {
      incoming.terms = extractCollectionArray<DictionaryTerm>(parsedJson, 'terms');
    } else if (
      idLower === 'sentences' ||
      ctLower === 'sentence' ||
      ctLower === 'sentences' ||
      rtLower === 'bilingual_sentence' ||
      rtLower === 'sentence_pair'
    ) {
      incoming.sentences = extractCollectionArray<LinkedSentence>(parsedJson, 'sentences');
    } else if (
      idLower.includes('affix') ||
      ctLower === 'affix' ||
      ctLower === 'affixes' ||
      rtLower === 'morphology_rule'
    ) {
      incoming.customAffixes = extractCollectionArray<
        MorphologicalAffix & { morpheme?: string }
      >(parsedJson, 'affixes').map((af) => {
        const rawAffix = String(af.affix || af.morpheme || '').trim();
        const cleanKey = String(af.cleanKey || rawAffix.replace(/^-+|-+$/g, '') || af.id || '').trim();
        return {
          ...af,
          affix: rawAffix || cleanKey,
          cleanKey
        };
      });
    } else if (
      idLower.includes('abbr') ||
      ctLower === 'abbreviation' ||
      ctLower === 'abbreviations' ||
      rtLower === 'clinical_abbr' ||
      rtLower === 'abbreviation_rule'
    ) {
      incoming.customAbbreviations = extractCollectionArray<ClinicalAbbreviation>(
        parsedJson,
        'abbreviations'
      );
    } else if (
      idLower === 'books' ||
      ctLower === 'book' ||
      ctLower === 'books' ||
      rtLower === 'book_pdf_reader'
    ) {
      incoming.books = extractCollectionArray<
        Partial<AcademicBookResource> & Record<string, unknown>
      >(parsedJson, 'books').map((b) => {
        const norm = normalizeAcademicBookResource(b);
        return {
          ...norm,
          downloadUrl: norm.downloadUrl
            ? resolveRepoRelativeUrl(norm.downloadUrl, targetCatalogUrl)
            : undefined,
          pdfUrl: norm.pdfUrl
            ? resolveRepoRelativeUrl(norm.pdfUrl, targetCatalogUrl)
            : undefined
        };
      });
    } else if (
      idLower === 'questions' ||
      ctLower === 'question' ||
      ctLower === 'questions' ||
      rtLower === 'quiz_runner' ||
      rtLower === 'quiz_question'
    ) {
      incoming.quizQuestions = extractCollectionArray<Record<string, unknown>>(
        parsedJson,
        'questions'
      ).map((q, qIdx) => {
        const norm = normalizeQuizQuestionRecord(q, qIdx);
        return norm.imageUrl
          ? { ...norm, imageUrl: resolveRepoRelativeUrl(norm.imageUrl, targetCatalogUrl) }
          : norm;
      });
    } else if (
      idLower === 'exams' ||
      ctLower === 'exam' ||
      ctLower === 'exams' ||
      rtLower === 'exam_blueprint'
    ) {
      incoming.exams = extractCollectionArray<
        Partial<AcademicExamPackage> & Record<string, unknown>
      >(parsedJson, 'exams').map((ex) => normalizeAcademicExamPackage(ex));
    } else if (
      idLower.includes('media') ||
      ctLower === 'media' ||
      ctLower === 'media_asset' ||
      rtLower === 'media_gallery'
    ) {
      incoming.mediaAssets = extractCollectionArray<
        Partial<MediaAssetRecord> & Record<string, unknown>
      >(parsedJson, 'mediaAssets').map((ma) => {
        const norm = normalizeMediaAssetRecord(ma);
        const absUrl = norm.url
          ? resolveRepoRelativeUrl(norm.url, targetCatalogUrl)
          : norm.relativePath
            ? resolveRepoRelativeUrl(norm.relativePath, targetCatalogUrl)
            : '';
        return {
          ...norm,
          url: absUrl || norm.url,
          rawUrl: (norm.rawUrl ? resolveRepoRelativeUrl(norm.rawUrl, targetCatalogUrl) : absUrl) || norm.rawUrl
        };
      });
    } else {
      // Unknown or extensible future collection type -> auto-discover as dynamicCollection (`generic_card` fallback)
      const rawItems = extractCollectionArray<unknown>(parsedJson, col.id);
      const dynItems = rawItems
        .map((item, idx) => toDynamicCatalogItem(item, idx))
        .filter((x): x is DynamicCatalogItem => x !== null);
      if (!incoming.dynamicCollections) incoming.dynamicCollections = [];
      incoming.dynamicCollections.push({
        id: col.id,
        name: col.name,
        contentType: col.contentType || col.id,
        rendererType: (col.rendererType || regEntry?.rendererType || 'generic_card') as
          | 'generic_card'
          | string,
        displayNameAr: regEntry?.displayNameAr || col.name || col.id,
        displayNameEn: regEntry?.displayNameEn || col.name || col.id,
        rawUrl: col.rawUrl,
        sha256: expectedHash || undefined,
        recordCount: col.recordCount ?? dynItems.length,
        sizeBytes: col.sizeBytes,
        items: dynItems
      });
    }

    updatedCollectionsCount += 1;
  }

  return {
    fetched: true,
    catalogVersion: catalog.catalogVersion,
    contentTypesRegistry: registryEntries,
    updatedCollectionsCount,
    skippedCollectionsCount,
    collectionHashes: nextHashes,
    incoming
  };
}

/**
 * Pulls latest cloud changes from `UMEDT-DATA` (`catalog.json` + `master/*.json`) and `/api/cloud-library`
 * into the Unified Cloud Mirror, and automatically merges new/updated cloud items into local state UNLESS
 * the user explicitly deleted those items locally (so locally deleted items remain in the Cloud Library
 * ready for selective re-download).
 */
export async function syncWithRemoteCloudLibrary(params: {
  localTerms: DictionaryTerm[];
  localSentences: LinkedSentence[];
  localTopics: TopicArticle[];
  customFetch?: typeof fetch;
}): Promise<{
  mirror: UnifiedCloudStoreSnapshot;
  autoMergedTopics: TopicArticle[];
  autoMergedTerms: DictionaryTerm[];
  autoMergedSentences: LinkedSentence[];
  autoMergedBlocks: MedicalBlock[];
  autoMergedSubjects: MedicalSubject[];
  autoMergedAffixes: MorphologicalAffix[];
  autoMergedAbbreviations: ClinicalAbbreviation[];
  newUpdatesApplied: number;
}> {
  const loadLocalAffixes = (): MorphologicalAffix[] => {
    try {
      const raw = getSafeStorage().getItem('dictengine_umd_custom_affixes_v2');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const loadLocalAbbreviations = (): ClinicalAbbreviation[] => {
    try {
      const raw = getSafeStorage().getItem('dictengine_umd_custom_abbreviations_v2');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  if (!isCloudSyncOnline()) {
    const offlineMirror = loadUnifiedCloudMirror();
    return {
      mirror: offlineMirror,
      autoMergedTopics: params.localTopics,
      autoMergedTerms: params.localTerms,
      autoMergedSentences: params.localSentences,
      autoMergedBlocks: loadMedicalBlocks(),
      autoMergedSubjects: loadMedicalSubjects(),
      autoMergedAffixes: loadLocalAffixes(),
      autoMergedAbbreviations: loadLocalAbbreviations(),
      newUpdatesApplied: 0
    };
  }

  await processCloudSyncQueue({ customFetch: params.customFetch });

  const fetchFn =
    params.customFetch ||
    customCloudFetchOverride ||
    (typeof window !== 'undefined' &&
    /^https?:$/i.test(window.location?.protocol || '') &&
    typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null);

  const isBrowserRuntime = typeof window !== 'undefined';
  let fetchedRemoteSnapshot = false;

  // 1. Primary remote source: external GitHub UMEDT-DATA catalog.json
  try {
    const currentBeforeUmedt = loadUnifiedCloudMirror();
    const umedtRes = await syncFromUmedtDataRepository({
      currentCollectionHashes: currentBeforeUmedt.collectionHashes || {},
      customFetch: params.customFetch
    });
    if (umedtRes.fetched) {
      const baseBeforeMerge: UnifiedCloudStoreSnapshot = isBrowserRuntime
        ? {
            ...currentBeforeUmedt,
            blocks: umedtRes.incoming.blocks !== undefined ? [] : currentBeforeUmedt.blocks,
            subjects: umedtRes.incoming.subjects !== undefined ? [] : currentBeforeUmedt.subjects,
            topics: umedtRes.incoming.topics !== undefined ? [] : currentBeforeUmedt.topics,
            terms: umedtRes.incoming.terms !== undefined ? [] : currentBeforeUmedt.terms,
            sentences: umedtRes.incoming.sentences !== undefined ? [] : currentBeforeUmedt.sentences,
            books: umedtRes.incoming.books !== undefined ? [] : currentBeforeUmedt.books,
            exams: umedtRes.incoming.exams !== undefined ? [] : currentBeforeUmedt.exams,
            quizQuestions:
              umedtRes.incoming.quizQuestions !== undefined ? [] : currentBeforeUmedt.quizQuestions,
            mediaAssets:
              umedtRes.incoming.mediaAssets !== undefined ? [] : currentBeforeUmedt.mediaAssets
          }
        : currentBeforeUmedt;
      const mergedUmedt = mergeRecordsIntoCloudSnapshot(baseBeforeMerge, {
        ...umedtRes.incoming,
        collectionHashes: umedtRes.collectionHashes,
        catalogVersion: umedtRes.catalogVersion
      });
      saveUnifiedCloudMirror(mergedUmedt.snapshot);
      if (mergedUmedt.snapshot.mediaAssets && mergedUmedt.snapshot.mediaAssets.length > 0) {
        saveMediaAssetsIndex(mergedUmedt.snapshot.mediaAssets);
      }
      fetchedRemoteSnapshot = true;
    }
  } catch {
    // Continue to fallback below when running in Node/test environment
  }

  // 2. Only when NOT in browser runtime and UMEDT-DATA was not fetched, query /api/cloud-library snapshot
  if (!isBrowserRuntime && !fetchedRemoteSnapshot && fetchFn) {
    try {
      const res = await fetchFn('/api/cloud-library?action=snapshot', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const data = (await res.json()) as Partial<UnifiedCloudStoreSnapshot>;
        if (data && Array.isArray(data.topics)) {
          const currentMirror = loadUnifiedCloudMirror();
          const mergedMirror = mergeRecordsIntoCloudSnapshot(currentMirror, {
            blocks: data.blocks,
            subjects: data.subjects,
            topics: data.topics,
            terms: data.terms,
            sentences: data.sentences,
            mediaRecords: data.mediaRecords,
            books: data.books,
            exams: data.exams,
            quizQuestions: data.quizQuestions,
            mediaAssets: data.mediaAssets
          });
          saveUnifiedCloudMirror(mergedMirror.snapshot);
          fetchedRemoteSnapshot = true;
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 3. Only in Node CLI/test environment when neither UMEDT-DATA nor /api/cloud-library responded
  const currentAfterPull = loadUnifiedCloudMirror();
  if (
    !isBrowserRuntime &&
    !fetchedRemoteSnapshot &&
    currentAfterPull.blocks.length === 0 &&
    isCloudSyncOnline()
  ) {
    const seed = buildCanonicalCloudSeedSnapshot();
    const mergedMirror = mergeRecordsIntoCloudSnapshot(currentAfterPull, {
      blocks: seed.blocks,
      subjects: seed.subjects,
      topics: seed.topics,
      terms: seed.terms,
      sentences: seed.sentences,
      mediaRecords: seed.mediaRecords
    });
    saveUnifiedCloudMirror(mergedMirror.snapshot);
  }

  getSafeStorage().setItem(
    CLOUD_LIBRARY_STORAGE_KEYS.LAST_SYNCED_AT,
    new Date().toISOString()
  );

  // Also ensure any local items that aren't in the cloud mirror yet are represented in the catalog mirror
  const localBlocks = loadMedicalBlocks();
  const localSubjects = loadMedicalSubjects();

  const currentMirror = loadUnifiedCloudMirror();
  const syncedMirrorRes = mergeRecordsIntoCloudSnapshot(currentMirror, {
    blocks: localBlocks,
    subjects: localSubjects,
    topics: params.localTopics,
    terms: params.localTerms,
    sentences: params.localSentences
  });
  const mirror = syncedMirrorRes.snapshot;
  saveUnifiedCloudMirror(mirror);

  // STRICT POLICY: Never auto-download or auto-merge cloud data into local app storage/state.
  // Syncing with the remote catalog only updates the Unified Cloud Mirror index so the user
  // can browse available items and download them ONLY when clicking Download explicitly.
  notifyCloudLibraryListeners();
  return {
    mirror,
    autoMergedTopics: params.localTopics,
    autoMergedTerms: params.localTerms,
    autoMergedSentences: params.localSentences,
    autoMergedBlocks: localBlocks,
    autoMergedSubjects: localSubjects,
    autoMergedAffixes: loadLocalAffixes(),
    autoMergedAbbreviations: loadLocalAbbreviations(),
    newUpdatesApplied: 0
  };
}

/**
 * Builds the complete hierarchical Cloud Library State Summary for `LibraryView.tsx`
 * showing all Blocks, Subjects, and Topics, what is downloaded on the phone (`المكتبة المحلية`)
 * vs what is in the cloud (`المكتبة السحابية`), exact byte sizes, and sync status.
 */
export function buildCloudLibraryCatalogView(params: {
  localTopics: TopicArticle[];
  localTerms: DictionaryTerm[];
  localSentences: LinkedSentence[];
}): CloudLibraryStateSummary {
  const mirror = loadUnifiedCloudMirror();
  const localBlocks = loadMedicalBlocks();
  const localSubjects = loadMedicalSubjects();
  const queue = loadSyncQueue();
  const removed = loadLocallyRemovedRegistry();
  const permDeleted = loadPermanentlyDeletedRegistry();
  const permBlocks = new Set(permDeleted.blocks);
  const permSubjects = new Set(permDeleted.subjects);
  const permTopics = new Set(permDeleted.topics);
  const permBooks = new Set(permDeleted.books || []);
  const permExams = new Set(permDeleted.exams || []);

  const localBlockIds = new Set(
    localBlocks
      .filter((b) => !removed.blocks.includes(b.id) && !permBlocks.has(b.id))
      .map((b) => b.id)
  );
  const localSubjectIds = new Set(
    localSubjects
      .filter((s) => !removed.subjects.includes(s.id) && !permSubjects.has(s.id))
      .map((s) => s.id)
  );
  const localTopicMap = new Map(
    params.localTopics
      .filter((t) => !removed.topics.includes(t.id) && !permTopics.has(t.id))
      .map((t) => [t.id, t])
  );

  // Combine cloud blocks + any new local blocks (excluding permanently deleted)
  const allBlocksMap = new Map<string, MedicalBlock>();
  for (const b of mirror.blocks) {
    if (!permBlocks.has(b.id)) allBlocksMap.set(b.id, b);
  }
  for (const b of localBlocks) {
    if (!removed.blocks.includes(b.id) && !permBlocks.has(b.id)) allBlocksMap.set(b.id, b);
  }

  // Combine cloud subjects + any new local subjects (excluding permanently deleted)
  const allSubjectsMap = new Map<string, MedicalSubject>();
  for (const s of mirror.subjects) {
    if (!permSubjects.has(s.id) && !permBlocks.has(s.blockId || '')) {
      allSubjectsMap.set(s.id, s);
    }
  }
  for (const s of localSubjects) {
    if (
      !removed.subjects.includes(s.id) &&
      !permSubjects.has(s.id) &&
      !permBlocks.has(s.blockId || '')
    ) {
      allSubjectsMap.set(s.id, s);
    }
  }

  const combinedBlocksList = Array.from(allBlocksMap.values());
  const combinedSubjectsList = Array.from(allSubjectsMap.values());

  // Combine cloud topics + any new local topics (excluding permanently deleted)
  const allTopicsMap = new Map<string, TopicArticle>();
  for (const t of enrichAllTopicsWithHierarchy(
    mirror.topics,
    combinedBlocksList,
    combinedSubjectsList
  )) {
    if (
      !permTopics.has(t.id) &&
      !permSubjects.has(t.subjectId || '') &&
      !permBlocks.has(t.blockId || '')
    ) {
      allTopicsMap.set(t.id, t);
    }
  }
  for (const t of enrichAllTopicsWithHierarchy(
    params.localTopics,
    combinedBlocksList,
    combinedSubjectsList
  )) {
    if (
      !removed.topics.includes(t.id) &&
      !permTopics.has(t.id) &&
      !permSubjects.has(t.subjectId || '') &&
      !permBlocks.has(t.blockId || '')
    ) {
      allTopicsMap.set(t.id, t);
    }
  }

  const queueByEntityKey = new Map<string, SyncQueueItem>();
  for (const q of queue) {
    queueByEntityKey.set(`${q.entityType}:${q.entityId}`, q);
  }

  // Group terms by topicId / subjectId / blockId for accurate size and count attribution
  const allTerms = mirror.terms.length >= params.localTerms.length ? mirror.terms : params.localTerms;

  let localTotalBytes = 0;
  let cloudTotalBytes = 0;
  let downloadedTopicsCount = 0;
  let totalCloudTopicsCount = 0;

  const blockEntries: CloudCatalogBlockEntry[] = [];

  const sortedBlocks = Array.from(allBlocksMap.values()).sort((a, b) => a.order - b.order);

  for (const blk of sortedBlocks) {
    const blockSubjects = Array.from(allSubjectsMap.values())
      .filter((s) => s.blockId === blk.id)
      .sort((a, b) => a.order - b.order);

    const subjectEntries: CloudCatalogSubjectEntry[] = [];
    let blockBytes = computeEntitySizeBytes(blk);
    let blockDownloadedTopics = 0;
    let blockTotalTopics = 0;
    let blockTermsCount = 0;
    let blockHasPending = queueByEntityKey.get(`block:${blk.id}`)?.status === 'pending';
    let blockHasFailed = queueByEntityKey.get(`block:${blk.id}`)?.status === 'failed';

    for (const subj of blockSubjects) {
      const subjTopics = Array.from(allTopicsMap.values()).filter(
        (t) => t.subjectId === subj.id || (!t.subjectId && t.blockId === blk.id)
      );

      let subjBytes = computeEntitySizeBytes(subj);
      let subjDownloadedTopics = 0;
      const topicEntries: CloudCatalogTopicEntry[] = [];

      const subjLinkedTerms = allTerms.filter(
        (tm) =>
          (tm.linkedSubjectIds || []).includes(subj.id) ||
          subjTopics.some((tp) => (tm.linkedTopicIds || []).includes(tp.id))
      );
      const subjTermsBytes = computeEntitySizeBytes(subjLinkedTerms);
      subjBytes += subjTermsBytes;

      let subjHasPending = queueByEntityKey.get(`subject:${subj.id}`)?.status === 'pending';
      let subjHasFailed = queueByEntityKey.get(`subject:${subj.id}`)?.status === 'failed';

      for (const tp of subjTopics) {
        const localTp = localTopicMap.get(tp.id);
        const isTpDownloaded =
          Boolean(localTp) &&
          !removed.topics.includes(tp.id) &&
          !removed.subjects.includes(subj.id) &&
          !removed.blocks.includes(blk.id);

        const tpTerms = allTerms.filter(
          (tm) =>
            (tm.linkedTopicIds || []).includes(tp.id) ||
            (tp.titleEn &&
              tm.collections?.some((c) =>
                tp.titleEn!.toLowerCase().includes(c.toLowerCase())
              ))
        );
        const tpMediaCount =
          (tp.images?.length || 0) +
          (tp.attachments?.length || 0) +
          (tp.sections || []).reduce(
            (acc, s) =>
              acc +
              (s.contentBlocks || []).filter(
                (cb) =>
                  cb.type === 'audio' ||
                  cb.type === 'image' ||
                  cb.type === 'attachment'
              ).length,
            0
          );

        const tpBytes = computeEntitySizeBytes(tp) + computeEntitySizeBytes(tpTerms);
        subjBytes += computeEntitySizeBytes(tp);

        const cloudHash = computeDeterministicFastHashHex(canonicalizeForHash('topic', tp));
        const localHash = localTp
          ? computeDeterministicFastHashHex(canonicalizeForHash('topic', localTp))
          : '';

        const qItem = queueByEntityKey.get(`topic:${tp.id}`);
        const tpSyncStatus: SyncItemStatus = qItem ? qItem.status : 'synced';
        if (tpSyncStatus === 'pending') subjHasPending = true;
        if (tpSyncStatus === 'failed') subjHasFailed = true;

        if (isTpDownloaded) {
          subjDownloadedTopics += 1;
          downloadedTopicsCount += 1;
          localTotalBytes += tpBytes;
        }
        totalCloudTopicsCount += 1;

        topicEntries.push({
          id: tp.id,
          blockId: blk.id,
          subjectId: subj.id,
          title: tp.title,
          titleEn: tp.titleEn || tp.title,
          titleAr: tp.titleAr || tp.subtitle || tp.title,
          subtitle: tp.subtitle,
          sha256: cloudHash.slice(0, 16),
          sizeBytes: tpBytes,
          sizeLabel: formatBytesLabel(tpBytes),
          updatedAt: tp.publishedAt || '2026-11-15',
          isDownloaded: isTpDownloaded,
          hasNewerCloudVersion: Boolean(localTp && localHash !== cloudHash),
          syncStatus: tpSyncStatus,
          termsCount: tpTerms.length,
          mediaCount: tpMediaCount
        });
      }

      const isSubjDownloaded =
        subjTopics.length > 0
          ? subjDownloadedTopics === subjTopics.length
          : localSubjectIds.has(subj.id) && !removed.subjects.includes(subj.id);
      const isSubjPartial = subjDownloadedTopics > 0 && subjDownloadedTopics < subjTopics.length;

      if (subjHasPending) blockHasPending = true;
      if (subjHasFailed) blockHasFailed = true;

      blockBytes += subjBytes;
      blockDownloadedTopics += subjDownloadedTopics;
      blockTotalTopics += subjTopics.length;
      blockTermsCount += subjLinkedTerms.length;

      subjectEntries.push({
        id: subj.id,
        blockId: blk.id,
        code: subj.code,
        titleEn: subj.titleEn,
        titleAr: subj.titleAr,
        descriptionAr: subj.descriptionAr,
        sha256: computeDeterministicFastHashHex(canonicalizeForHash('subject', subj)).slice(0, 16),
        sizeBytes: subjBytes,
        sizeLabel: formatBytesLabel(subjBytes),
        updatedAt: subj.updatedAt,
        isDownloaded: isSubjDownloaded,
        isPartiallyDownloaded: isSubjPartial,
        downloadedTopicsCount: subjDownloadedTopics,
        totalTopicsCount: subjTopics.length,
        termsCount: subjLinkedTerms.length,
        syncStatus: subjHasFailed ? 'failed' : subjHasPending ? 'pending' : 'synced',
        topics: topicEntries
      });
    }

    const isBlockDownloaded =
      blockTotalTopics > 0
        ? blockDownloadedTopics === blockTotalTopics
        : localBlockIds.has(blk.id) && !removed.blocks.includes(blk.id);
    const isBlockPartial = blockDownloadedTopics > 0 && blockDownloadedTopics < blockTotalTopics;

    cloudTotalBytes += blockBytes;
    if (isBlockDownloaded) {
      localTotalBytes += computeEntitySizeBytes(blk);
    }

    blockEntries.push({
      id: blk.id,
      code: blk.code,
      titleEn: blk.titleEn,
      titleAr: blk.titleAr,
      descriptionAr: blk.descriptionAr,
      colorAccent: blk.colorAccent || 'emerald',
      sha256: computeDeterministicFastHashHex(canonicalizeForHash('block', blk)).slice(0, 16),
      sizeBytes: blockBytes,
      sizeLabel: formatBytesLabel(blockBytes),
      updatedAt: blk.updatedAt,
      isDownloaded: isBlockDownloaded,
      isPartiallyDownloaded: isBlockPartial,
      downloadedTopicsCount: blockDownloadedTopics,
      totalTopicsCount: blockTotalTopics,
      subjectsCount: subjectEntries.length,
      termsCount: blockTermsCount,
      syncStatus: blockHasFailed ? 'failed' : blockHasPending ? 'pending' : 'synced',
      subjects: subjectEntries
    });
  }

  // Books & Exams integration for Cloud Library UI
  const localBooks = loadAcademicBooks();
  const localBookIds = new Set(
    localBooks.filter((b) => !permBooks.has(b.id)).map((b) => b.id)
  );
  const cloudBooksMap = new Map<string, AcademicBookResource>();
  for (const bk of mirror.books || []) {
    if (!permBooks.has(bk.id) && !permBlocks.has(bk.blockId || '')) {
      cloudBooksMap.set(bk.id, bk);
    }
  }
  for (const bk of localBooks) {
    if (
      !(removed.books || []).includes(bk.id) &&
      !permBooks.has(bk.id) &&
      !permBlocks.has(bk.blockId || '')
    ) {
      cloudBooksMap.set(bk.id, bk);
    }
  }
  const bookEntries: CloudCatalogBookEntry[] = Array.from(cloudBooksMap.values()).map((bk) => {
    const isDl = localBookIds.has(bk.id) && !(removed.books || []).includes(bk.id);
    const localBk = localBooks.find((lb) => lb.id === bk.id);
    const sz = bk.sizeBytes || computeEntitySizeBytes(bk);
    if (isDl) localTotalBytes += computeEntitySizeBytes(localBk || bk);
    cloudTotalBytes += sz;
    const resolvedDocUrl =
      localBk?.downloadUrl ||
      localBk?.pdfUrl ||
      bk.downloadUrl ||
      bk.pdfUrl ||
      bk.mediaUrl ||
      bk.externalUrl;
    const resolvedFormat = (
      bk.format ||
      bk.fileFormat ||
      (resolvedDocUrl?.toLowerCase().includes('.epub') ? 'epub' : 'pdf')
    ).toUpperCase();
    return {
      id: bk.id,
      blockId: bk.blockId,
      subjectId: bk.subjectId,
      titleEn: bk.titleEn,
      titleAr: bk.titleAr || bk.titleEn,
      authorsLabel: Array.isArray(bk.authors) ? bk.authors.join('، ') : '',
      resourceKind: bk.resourceKind,
      fileFormat: resolvedFormat,
      sizeBytes: sz,
      sizeLabel: formatBytesLabel(sz),
      pageCount: bk.pageCount,
      downloadUrl: resolvedDocUrl,
      pdfUrl: resolvedDocUrl,
      coverUrl: bk.coverUrl,
      isDownloaded: isDl,
      hasOfflineMediaCached: Boolean(localBk?.mediaIdbKey),
      favorite: localBk?.favorite ?? bk.favorite,
      readingProgressPercent: localBk?.readingProgressPercent ?? bk.readingProgressPercent,
      sha256: bk.sha256,
      updatedAt: bk.updatedAt
    };
  });

  // Add general dictionary terms size to totals
  const dictTermsBytes = computeEntitySizeBytes(params.localTerms) + computeEntitySizeBytes(params.localSentences);
  localTotalBytes += dictTermsBytes;
  cloudTotalBytes += computeEntitySizeBytes(mirror.terms) + computeEntitySizeBytes(mirror.sentences);

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'syncing').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;
  const lastError = queue.find((q) => q.status === 'failed')?.lastError || null;
  const overallSyncStatus: SyncItemStatus = isSyncLoopRunning
    ? 'syncing'
    : failedCount > 0
    ? 'failed'
    : pendingCount > 0
    ? 'pending'
    : 'synced';

  const downloadedBlocksCount = blockEntries.filter((b) => b.isDownloaded).length;

  const localExams = loadAcademicExams();
  const localExamIdsSet = new Set(
    localExams
      .filter(
        (ex) =>
          !(removed.exams || []).includes(ex.id) &&
          !permExams.has(ex.id) &&
          !permBlocks.has(ex.blockId || '')
      )
      .map((ex) => ex.id)
  );
  const cloudExamsMap = new Map<string, AcademicExamPackage>();
  for (const ex of mirror.exams || []) {
    if (!permExams.has(ex.id) && !permBlocks.has(ex.blockId || '')) {
      cloudExamsMap.set(ex.id, ex);
    }
  }
  for (const ex of localExams) {
    if (
      !(removed.exams || []).includes(ex.id) &&
      !permExams.has(ex.id) &&
      !permBlocks.has(ex.blockId || '')
    ) {
      cloudExamsMap.set(ex.id, ex);
    }
  }
  const visibleExams = Array.from(cloudExamsMap.values());
  const downloadedExamIds = visibleExams
    .filter((ex) => localExamIdsSet.has(ex.id))
    .map((ex) => ex.id);

  // Cloud Dictionary Pack counts (Terms, Sentences, Affixes, Abbreviations in mirror vs local)
  const localTermIdsSet = new Set(params.localTerms.map((t) => t.id));
  const localSentenceIdsSet = new Set(params.localSentences.map((s) => s.id));
  const cloudDictTerms = (mirror.terms || []).filter(
    (tm) => !(permDeleted.terms || []).includes(tm.id)
  );
  const cloudDictSentences = mirror.sentences || [];
  const cloudDictAffixes = mirror.customAffixes || [];
  const cloudDictAbbrs = mirror.customAbbreviations || [];

  let localAffixKeysSet = new Set<string>();
  try {
    const rawAf = getSafeStorage().getItem('dictengine_umd_custom_affixes_v2');
    const parsedAf = rawAf ? (JSON.parse(rawAf) as MorphologicalAffix[]) : [];
    if (Array.isArray(parsedAf)) {
      localAffixKeysSet = new Set(
        parsedAf.map((a) => `${(a.cleanKey || a.affix).toLowerCase()}_${a.type}`)
      );
    }
  } catch {
    // ignore
  }
  let localAbbrKeysSet = new Set<string>();
  try {
    const rawAb = getSafeStorage().getItem('dictengine_umd_custom_abbreviations_v2');
    const parsedAb = rawAb ? (JSON.parse(rawAb) as ClinicalAbbreviation[]) : [];
    if (Array.isArray(parsedAb)) {
      localAbbrKeysSet = new Set(parsedAb.map((a) => a.abbr.toLowerCase()));
    }
  } catch {
    // ignore
  }

  const cloudDictionaryTotalCount =
    cloudDictTerms.length +
    cloudDictSentences.length +
    cloudDictAffixes.length +
    cloudDictAbbrs.length;
  const cloudDictionaryDownloadedCount =
    cloudDictTerms.filter((t) => localTermIdsSet.has(t.id)).length +
    cloudDictSentences.filter((s) => localSentenceIdsSet.has(s.id)).length +
    cloudDictAffixes.filter((a) =>
      localAffixKeysSet.has(`${(a.cleanKey || a.affix).toLowerCase()}_${a.type}`)
    ).length +
    cloudDictAbbrs.filter((a) => localAbbrKeysSet.has(a.abbr.toLowerCase())).length;

  return {
    overallSyncStatus,
    pendingCount,
    failedCount,
    syncedCount: Object.keys(mirror.hashes || {}).length,
    lastSyncedAt: getSafeStorage().getItem(CLOUD_LIBRARY_STORAGE_KEYS.LAST_SYNCED_AT),
    lastError,
    localTotalBytes,
    localTotalLabel: formatBytesLabel(localTotalBytes),
    cloudTotalBytes,
    cloudTotalLabel: formatBytesLabel(cloudTotalBytes),
    downloadedTopicsCount,
    totalCloudTopicsCount,
    downloadedBlocksCount,
    totalCloudBlocksCount: blockEntries.length,
    downloadedBooksCount: bookEntries.filter((b) => b.isDownloaded).length,
    totalCloudBooksCount: bookEntries.length,
    downloadedExamIds,
    downloadedExamsCount: downloadedExamIds.length,
    totalCloudExamsCount: visibleExams.length,
    cloudDictionaryTotalCount,
    cloudDictionaryDownloadedCount,
    catalogVersion: mirror.catalogVersion,
    books: bookEntries,
    exams: visibleExams,
    contentTypesRegistry: mirror.contentTypesRegistry || [],
    dynamicCollections: mirror.dynamicCollections || [],
    blocks: blockEntries,
    queue
  };
}

async function resolveAndCacheRemoteUrlForEntity(params: {
  url?: string;
  preferredIdbKey?: string;
  topicId?: string;
  blockId?: string;
  fileName?: string;
  mimeType?: string;
  mediaAssets?: MediaAssetRecord[];
  customFetch?: typeof fetch;
}): Promise<{ idbKey?: string; sizeBytes: number; cachedNew: boolean; skippedDuplicate: boolean }> {
  const cleanUrl = (params.url || '').trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return { sizeBytes: 0, cachedNew: false, skippedDuplicate: false };
  }

  const matchedAsset = (params.mediaAssets || []).find(
    (ma) => ma.url === cleanUrl || ma.rawUrl === cleanUrl || ma.id === params.preferredIdbKey
  );
  const effectiveFileName = params.fileName || matchedAsset?.fileName;
  const effectiveMime = params.mimeType || matchedAsset?.mimeType;

  if (!isDownloadableMediaUrl(cleanUrl, effectiveMime, effectiveFileName)) {
    return { sizeBytes: 0, cachedNew: false, skippedDuplicate: false };
  }

  const stableId =
    params.preferredIdbKey ||
    matchedAsset?.mediaIdbKey ||
    `idb-${computeDeterministicFastHashHex(cleanUrl).slice(0, 16)}`;

  const existing = await getLocalMediaRecord(stableId);
  if (existing && existing.dataUrl && existing.sizeBytes > 0) {
    const existingMime = (existing.mimeType || '').toLowerCase();
    const isPollutedHtml =
      existingMime === 'text/html' ||
      existingMime === 'application/xhtml+xml' ||
      existing.dataUrl.startsWith('data:text/html');
    if (isPollutedHtml) {
      await deleteLocalMediaRecord(stableId);
    } else {
      return {
        idbKey: stableId,
        sizeBytes: 0,
        cachedNew: false,
        skippedDuplicate: true
      };
    }
  }

  const cached = await downloadRemoteMediaToOfflineCache({
    id: stableId,
    remoteUrl: cleanUrl,
    topicId: params.topicId,
    blockId: params.blockId,
    fileName: effectiveFileName,
    mimeType: effectiveMime,
    customFetch: params.customFetch
  });

  if (cached.success) {
    return {
      idbKey: cached.mediaIdbKey,
      sizeBytes: cached.sizeBytes,
      cachedNew: true,
      skippedDuplicate: false
    };
  }
  return { sizeBytes: 0, cachedNew: false, skippedDuplicate: false };
}

/**
 * Selective Granular Download:
 * Downloads ONLY when the user explicitly clicks Download on a Block, Subject, Topic, Book, Exam, or Dictionary pack
 * from the Unified Cloud Library into local device storage.
 * Prefetches referenced remote media/PDFs into IndexedDB and enforces SHA-256 deduplication so identical
 * local content/media is never downloaded twice.
 */
export async function downloadCloudLibraryTarget(params: {
  targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam' | 'dictionary';
  targetId: string;
  currentTopics: TopicArticle[];
  currentTerms: DictionaryTerm[];
  currentSentences: LinkedSentence[];
  customFetch?: typeof fetch;
}): Promise<{
  success: boolean;
  downloadedTopicsCount: number;
  downloadedTermsCount: number;
  downloadedMediaCount: number;
  skippedIdenticalCount: number;
  bytesDownloaded: number;
  updatedTopics: TopicArticle[];
  updatedTerms: DictionaryTerm[];
  updatedSentences: LinkedSentence[];
  updatedBlocks: MedicalBlock[];
  updatedSubjects: MedicalSubject[];
  updatedAffixes?: MorphologicalAffix[];
  updatedAbbreviations?: ClinicalAbbreviation[];
  messageAr: string;
}> {
  // STRICT REQUIREMENT: Cloud downloads require an active internet connection
  if (!isCloudSyncOnline()) {
    return {
      success: false,
      downloadedTopicsCount: 0,
      downloadedTermsCount: 0,
      downloadedMediaCount: 0,
      skippedIdenticalCount: 0,
      bytesDownloaded: 0,
      updatedTopics: params.currentTopics,
      updatedTerms: params.currentTerms,
      updatedSentences: params.currentSentences,
      updatedBlocks: loadMedicalBlocks(),
      updatedSubjects: loadMedicalSubjects(),
      messageAr: 'يلزم الاتصال بالإنترنت للتنزيل من المكتبة السحابية'
    };
  }

  let mirror = loadUnifiedCloudMirror();
  if (
    mirror.topics.length === 0 &&
    (mirror.books || []).length === 0 &&
    (mirror.exams || []).length === 0 &&
    mirror.terms.length === 0 &&
    mirror.blocks.length === 0
  ) {
    const syncRes = await syncWithRemoteCloudLibrary({
      localTopics: params.currentTopics,
      localTerms: params.currentTerms,
      localSentences: params.currentSentences,
      customFetch: params.customFetch
    });
    mirror = syncRes.mirror;
  }

  const removed = loadLocallyRemovedRegistry();
  const permDeleted = loadPermanentlyDeletedRegistry();
  const localBlocks = loadMedicalBlocks();
  const localSubjects = loadMedicalSubjects();

  // Handle Cloud Dictionary Pack (Terms, Sentences, Affixes & Abbreviations) explicit download
  if (params.targetType === 'dictionary') {
    const permTermIds = new Set(permDeleted.terms || []);
    const permSentenceIds = new Set(permDeleted.sentences || []);
    let downloadedTermsCount = 0;
    let skippedIdenticalCount = 0;
    let bytesDownloaded = 0;

    const nextTermsMap = new Map(params.currentTerms.map((t) => [t.id, t]));
    for (const ctm of mirror.terms || []) {
      if (permTermIds.has(ctm.id)) continue;
      removed.terms = removed.terms.filter((id) => id !== ctm.id);
      const existing = nextTermsMap.get(ctm.id);
      const incomingHash = await computeEntitySha256('term', ctm);
      const existingHash = existing ? await computeEntitySha256('term', existing) : '';
      if (existing && existingHash === incomingHash) {
        skippedIdenticalCount += 1;
      } else {
        nextTermsMap.set(
          ctm.id,
          existing
            ? {
                ...ctm,
                favorite: existing.favorite,
                collections: Array.from(
                  new Set([...(existing.collections || []), ...(ctm.collections || [])])
                ),
                srsData: existing.srsData || ctm.srsData,
                lastStudiedAt: existing.lastStudiedAt || ctm.lastStudiedAt,
                studyCount: existing.studyCount ?? ctm.studyCount
              }
            : ctm
        );
        downloadedTermsCount += 1;
        bytesDownloaded += computeEntitySizeBytes(ctm);
      }
    }
    const updatedTerms = Array.from(nextTermsMap.values());

    const nextSentenceMap = new Map(params.currentSentences.map((s) => [s.id, s]));
    for (const csn of mirror.sentences || []) {
      if (permSentenceIds.has(csn.id)) continue;
      removed.sentences = removed.sentences.filter((id) => id !== csn.id);
      const existing = nextSentenceMap.get(csn.id);
      if (!existing) {
        nextSentenceMap.set(csn.id, csn);
        bytesDownloaded += computeEntitySizeBytes(csn);
      } else if (existing.favorite || existing.srsData) {
        nextSentenceMap.set(csn.id, {
          ...csn,
          favorite: existing.favorite,
          srsData: existing.srsData || csn.srsData
        });
      }
    }
    const updatedSentences = Array.from(nextSentenceMap.values());

    let localAffixesList: MorphologicalAffix[] = [];
    try {
      const rawAf = getSafeStorage().getItem('dictengine_umd_custom_affixes_v2');
      const parsedAf = rawAf ? JSON.parse(rawAf) : [];
      if (Array.isArray(parsedAf)) localAffixesList = parsedAf;
    } catch {
      // ignore
    }
    const affixMap = new Map<string, MorphologicalAffix>(
      localAffixesList.map((a) => [`${(a.cleanKey || a.affix).toLowerCase()}_${a.type}`, a])
    );
    let affixesChanged = false;
    for (const af of mirror.customAffixes || []) {
      if (!af || !af.affix) continue;
      const key = `${(af.cleanKey || af.affix).toLowerCase()}_${af.type}`;
      if (!affixMap.has(key)) {
        affixMap.set(key, af);
        affixesChanged = true;
        downloadedTermsCount += 1;
        bytesDownloaded += computeEntitySizeBytes(af);
      }
    }
    const updatedAffixes = Array.from(affixMap.values());
    if (affixesChanged) {
      getSafeStorage().setItem(
        'dictengine_umd_custom_affixes_v2',
        JSON.stringify(updatedAffixes)
      );
    }

    let localAbbrsList: ClinicalAbbreviation[] = [];
    try {
      const rawAb = getSafeStorage().getItem('dictengine_umd_custom_abbreviations_v2');
      const parsedAb = rawAb ? JSON.parse(rawAb) : [];
      if (Array.isArray(parsedAb)) localAbbrsList = parsedAb;
    } catch {
      // ignore
    }
    const abbrMap = new Map<string, ClinicalAbbreviation>(
      localAbbrsList.map((a) => [a.abbr.toLowerCase(), a])
    );
    let abbrsChanged = false;
    for (const ab of mirror.customAbbreviations || []) {
      if (!ab || !ab.abbr) continue;
      const key = ab.abbr.toLowerCase();
      if (!abbrMap.has(key)) {
        abbrMap.set(key, ab);
        abbrsChanged = true;
        downloadedTermsCount += 1;
        bytesDownloaded += computeEntitySizeBytes(ab);
      }
    }
    const updatedAbbreviations = Array.from(abbrMap.values());
    if (abbrsChanged) {
      getSafeStorage().setItem(
        'dictengine_umd_custom_abbreviations_v2',
        JSON.stringify(updatedAbbreviations)
      );
    }

    saveLocallyRemovedRegistry(removed);
    notifyCloudLibraryListeners();

    return {
      success: true,
      downloadedTopicsCount: 0,
      downloadedTermsCount,
      downloadedMediaCount: 0,
      skippedIdenticalCount,
      bytesDownloaded,
      updatedTopics: params.currentTopics,
      updatedTerms,
      updatedSentences,
      updatedBlocks: localBlocks,
      updatedSubjects: localSubjects,
      updatedAffixes,
      updatedAbbreviations,
      messageAr:
        downloadedTermsCount === 0 && skippedIdenticalCount > 0
          ? 'بيانات القاموس منزّلة ومحدّثة مسبقاً'
          : `تم تنزيل بيانات القاموس السحابية (${formatBytesLabel(bytesDownloaded)})`
    };
  }

  // Handle single Exam explicit download
  if (params.targetType === 'exam') {
    const targetExam = (mirror.exams || []).find((e) => e.id === params.targetId);
    if (!targetExam) {
      return {
        success: false,
        downloadedTopicsCount: 0,
        downloadedTermsCount: 0,
        downloadedMediaCount: 0,
        skippedIdenticalCount: 0,
        bytesDownloaded: 0,
        updatedTopics: params.currentTopics,
        updatedTerms: params.currentTerms,
        updatedSentences: params.currentSentences,
        updatedBlocks: localBlocks,
        updatedSubjects: localSubjects,
        messageAr: 'الاختبار غير موجود في الفهرس السحابي'
      };
    }

    let downloadedMediaCount = 0;
    let skippedIdenticalCount = 0;
    let bytesDownloaded = computeEntitySizeBytes(targetExam);

    const targetQIds = new Set(targetExam.questionIds || []);
    const targetTopicIds = new Set(targetExam.topicIds || []);
    const matchingQuestions = (mirror.quizQuestions || []).filter(
      (q) =>
        targetQIds.has(q.id) ||
        (targetExam.subjectId && q.subjectId === targetExam.subjectId) ||
        (targetExam.blockId && q.blockId === targetExam.blockId) ||
        (q.topicId && targetTopicIds.has(q.topicId))
    );
    const embeddedQuestions = Array.isArray(targetExam.questions) ? targetExam.questions : [];
    const allLinkedQuestions = [...matchingQuestions, ...embeddedQuestions];

    if (allLinkedQuestions.length > 0) {
      const existingQuestions = loadQuizQuestions(params.currentTopics, params.currentTerms);
      const qMap = new Map(existingQuestions.map((q) => [q.id, q]));
      for (const q of allLinkedQuestions) {
        qMap.set(q.id, q);
        bytesDownloaded += computeEntitySizeBytes(q);
        if (q.imageUrl && /^https?:\/\//i.test(q.imageUrl)) {
          const qImgRes = await resolveAndCacheRemoteUrlForEntity({
            url: q.imageUrl,
            topicId: q.topicId,
            fileName: `${q.id}-diagram`,
            mediaAssets: mirror.mediaAssets,
            customFetch: params.customFetch
          });
          if (qImgRes.cachedNew) {
            downloadedMediaCount += 1;
            bytesDownloaded += qImgRes.sizeBytes;
          } else if (qImgRes.skippedDuplicate) {
            skippedIdenticalCount += 1;
          }
        }
      }
      saveQuizQuestions(Array.from(qMap.values()));
    }

    const existingExams = loadAcademicExams();
    const updatedExams = [
      ...existingExams.filter((e) => e.id !== targetExam.id),
      targetExam
    ];
    removed.exams = (removed.exams || []).filter((id) => id !== targetExam.id);
    saveLocallyRemovedRegistry(removed);
    saveAcademicExams(updatedExams);
    notifyCloudLibraryListeners();

    return {
      success: true,
      downloadedTopicsCount: 0,
      downloadedTermsCount: 0,
      downloadedMediaCount,
      skippedIdenticalCount,
      bytesDownloaded,
      updatedTopics: params.currentTopics,
      updatedTerms: params.currentTerms,
      updatedSentences: params.currentSentences,
      updatedBlocks: localBlocks,
      updatedSubjects: localSubjects,
      messageAr: `تم تنزيل الاختبار (${formatBytesLabel(bytesDownloaded)}) للعمل دون إنترنت`
    };
  }

  // Handle single Book download cleanly
  if (params.targetType === 'book') {
    const targetBook = (mirror.books || []).find((b) => b.id === params.targetId);
    if (!targetBook) {
      return {
        success: false,
        downloadedTopicsCount: 0,
        downloadedTermsCount: 0,
        downloadedMediaCount: 0,
        skippedIdenticalCount: 0,
        bytesDownloaded: 0,
        updatedTopics: params.currentTopics,
        updatedTerms: params.currentTerms,
        updatedSentences: params.currentSentences,
        updatedBlocks: localBlocks,
        updatedSubjects: localSubjects,
        messageAr: 'الكتاب غير موجود في الفهرس السحابي'
      };
    }

    const existingBooks = loadAcademicBooks();
    const existingBook = existingBooks.find((b) => b.id === targetBook.id);
    let downloadedMediaCount = 0;
    let skippedIdenticalCount = 0;
    let bytesDownloaded = 0;
    const nextBook: AcademicBookResource = {
      ...targetBook,
      ...(existingBook
        ? {
            favorite: existingBook.favorite ?? targetBook.favorite,
            bookmarks: existingBook.bookmarks?.length ? existingBook.bookmarks : targetBook.bookmarks,
            lastReadPage: existingBook.lastReadPage ?? targetBook.lastReadPage,
            readingProgressPercent:
              existingBook.readingProgressPercent ?? targetBook.readingProgressPercent,
            notes: existingBook.notes ?? targetBook.notes
          }
        : {})
    };

    const mainDocUrl =
      targetBook.downloadUrl || targetBook.pdfUrl || targetBook.mediaUrl || targetBook.externalUrl;
    if (mainDocUrl && /^https?:\/\//i.test(mainDocUrl)) {
      const pdfCacheRes = await resolveAndCacheRemoteUrlForEntity({
        url: mainDocUrl,
        preferredIdbKey: targetBook.mediaIdbKey,
        fileName: `${targetBook.id}.${(targetBook.format || targetBook.fileFormat || 'pdf').toLowerCase()}`,
        mimeType:
          targetBook.mimeType ||
          ((targetBook.format || targetBook.fileFormat) === 'epub'
            ? 'application/epub+zip'
            : 'application/pdf'),
        mediaAssets: mirror.mediaAssets,
        customFetch: params.customFetch
      });
      if (pdfCacheRes.idbKey) {
        nextBook.mediaIdbKey = pdfCacheRes.idbKey;
        if (pdfCacheRes.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += pdfCacheRes.sizeBytes;
        } else if (pdfCacheRes.skippedDuplicate) {
          skippedIdenticalCount += 1;
        }
      }
    }

    if (targetBook.coverUrl && /^https?:\/\//i.test(targetBook.coverUrl)) {
      const coverCacheRes = await resolveAndCacheRemoteUrlForEntity({
        url: targetBook.coverUrl,
        preferredIdbKey: targetBook.coverIdbKey,
        mediaAssets: mirror.mediaAssets,
        customFetch: params.customFetch
      });
      if (coverCacheRes.idbKey) {
        nextBook.coverIdbKey = coverCacheRes.idbKey;
        if (coverCacheRes.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += coverCacheRes.sizeBytes;
        }
      }
    }

    const updatedBooks = [
      ...existingBooks.filter((b) => b.id !== nextBook.id),
      nextBook
    ];
    bytesDownloaded += computeEntitySizeBytes(nextBook);
    removed.books = (removed.books || []).filter((id) => id !== nextBook.id);
    saveLocallyRemovedRegistry(removed);
    saveAcademicBooks(updatedBooks);
    notifyCloudLibraryListeners();

    return {
      success: true,
      downloadedTopicsCount: 0,
      downloadedTermsCount: 0,
      downloadedMediaCount,
      skippedIdenticalCount,
      bytesDownloaded,
      updatedTopics: params.currentTopics,
      updatedTerms: params.currentTerms,
      updatedSentences: params.currentSentences,
      updatedBlocks: localBlocks,
      updatedSubjects: localSubjects,
      messageAr: `تم تنزيل الكتاب (${formatBytesLabel(bytesDownloaded)}) للعمل دون إنترنت`
    };
  }

  const enrichedMirrorTopics = enrichAllTopicsWithHierarchy(
    mirror.topics,
    mirror.blocks,
    mirror.subjects
  );

  let targetBlocks: MedicalBlock[] = [];
  let targetSubjects: MedicalSubject[] = [];
  let targetTopics: TopicArticle[] = [];

  if (params.targetType === 'block') {
    const blk = mirror.blocks.find((b) => b.id === params.targetId);
    if (blk) targetBlocks.push(blk);
    targetSubjects = mirror.subjects.filter((s) => s.blockId === params.targetId);
    const subjIds = new Set(targetSubjects.map((s) => s.id));
    targetTopics = enrichedMirrorTopics.filter(
      (t) => t.blockId === params.targetId || (t.subjectId && subjIds.has(t.subjectId))
    );
    removed.blocks = removed.blocks.filter((id) => id !== params.targetId);
    for (const s of targetSubjects) {
      removed.subjects = removed.subjects.filter((id) => id !== s.id);
    }
    for (const t of targetTopics) {
      removed.topics = removed.topics.filter((id) => id !== t.id);
    }
  } else if (params.targetType === 'subject') {
    const subj = mirror.subjects.find((s) => s.id === params.targetId);
    if (subj) {
      targetSubjects.push(subj);
      if (subj.blockId) {
        const parentBlk = mirror.blocks.find((b) => b.id === subj.blockId);
        if (parentBlk) targetBlocks.push(parentBlk);
        removed.blocks = removed.blocks.filter((id) => id !== subj.blockId);
      }
    }
    targetTopics = enrichedMirrorTopics.filter((t) => t.subjectId === params.targetId);
    removed.subjects = removed.subjects.filter((id) => id !== params.targetId);
    for (const t of targetTopics) {
      removed.topics = removed.topics.filter((id) => id !== t.id);
    }
  } else {
    const tp = enrichedMirrorTopics.find((t) => t.id === params.targetId);
    if (tp) {
      targetTopics.push(tp);
      let resolvedParentBlockId = tp.blockId || '';
      if (tp.subjectId) {
        const parentSubj = mirror.subjects.find((s) => s.id === tp.subjectId);
        if (parentSubj) {
          targetSubjects.push(parentSubj);
          if (!resolvedParentBlockId && parentSubj.blockId) {
            resolvedParentBlockId = parentSubj.blockId;
          }
        }
        removed.subjects = removed.subjects.filter((id) => id !== tp.subjectId);
      }
      if (resolvedParentBlockId) {
        const parentBlk = mirror.blocks.find((b) => b.id === resolvedParentBlockId);
        if (parentBlk) targetBlocks.push(parentBlk);
        removed.blocks = removed.blocks.filter((id) => id !== resolvedParentBlockId);
      }
    }
    removed.topics = removed.topics.filter((id) => id !== params.targetId);
  }

  let downloadedTopicsCount = 0;
  let downloadedTermsCount = 0;
  let downloadedMediaCount = 0;
  let skippedIdenticalCount = 0;
  let bytesDownloaded = 0;

  // 1. Merge Blocks with SHA-256 deduplication
  const nextBlocksMap = new Map(localBlocks.map((b) => [b.id, b]));
  for (const blk of targetBlocks) {
    const existing = nextBlocksMap.get(blk.id);
    const incomingHash = await computeEntitySha256('block', blk);
    const existingHash = existing ? await computeEntitySha256('block', existing) : '';
    if (existing && existingHash === incomingHash) {
      skippedIdenticalCount += 1;
    } else {
      nextBlocksMap.set(blk.id, blk);
      bytesDownloaded += computeEntitySizeBytes(blk);
    }
  }
  const updatedBlocks = Array.from(nextBlocksMap.values()).sort((a, b) => a.order - b.order);
  saveMedicalBlocks(updatedBlocks);

  // 2. Merge Subjects with SHA-256 deduplication
  const nextSubjectsMap = new Map(localSubjects.map((s) => [s.id, s]));
  for (const subj of targetSubjects) {
    const existing = nextSubjectsMap.get(subj.id);
    const incomingHash = await computeEntitySha256('subject', subj);
    const existingHash = existing ? await computeEntitySha256('subject', existing) : '';
    if (existing && existingHash === incomingHash) {
      skippedIdenticalCount += 1;
    } else {
      nextSubjectsMap.set(subj.id, subj);
      bytesDownloaded += computeEntitySizeBytes(subj);
    }
  }
  const updatedSubjects = Array.from(nextSubjectsMap.values()).sort((a, b) => a.order - b.order);
  saveMedicalSubjects(updatedSubjects);

  // 3. Merge Topics with SHA-256 & media deduplication + offline remote media prefetching
  const nextTopicsMap = new Map(params.currentTopics.map((t) => [t.id, t]));
  const targetTopicIds = new Set(targetTopics.map((t) => t.id));

  for (const rawTp of targetTopics) {
    const tp = deduplicateTopicMediaAndAttachments(rawTp);

    // Prefetch external images, diagrams, PDFs, audio, attachments referenced inside sections/images/attachments
    const updatedSections = await Promise.all(
      (tp.sections || []).map(async (sec) => {
        if (!Array.isArray(sec.contentBlocks)) return sec;
        const nextBlocks = await Promise.all(
          sec.contentBlocks.map(async (cb) => {
            const candidateUrl =
              cb.mediaUrl && /^https?:\/\//i.test(cb.mediaUrl)
                ? cb.mediaUrl
                : cb.externalUrl &&
                    /^https?:\/\//i.test(cb.externalUrl) &&
                    (cb.type === 'pdf_viewer' ||
                      cb.type === 'attachment' ||
                      cb.type === 'image' ||
                      cb.type === 'diagram' ||
                      cb.type === 'audio' ||
                      cb.type === 'video')
                  ? cb.externalUrl
                  : '';
            if (!candidateUrl) return cb;

            const cached = await resolveAndCacheRemoteUrlForEntity({
              url: candidateUrl,
              preferredIdbKey: cb.mediaIdbKey,
              topicId: tp.id,
              blockId: cb.id,
              fileName: cb.mediaFileName || cb.titleEn,
              mimeType: cb.mediaMimeType,
              mediaAssets: mirror.mediaAssets,
              customFetch: params.customFetch
            });
            if (cached.cachedNew) {
              downloadedMediaCount += 1;
              bytesDownloaded += cached.sizeBytes;
            } else if (cached.skippedDuplicate) {
              skippedIdenticalCount += 1;
            }
            return cached.idbKey ? { ...cb, mediaIdbKey: cached.idbKey } : cb;
          })
        );
        return { ...sec, contentBlocks: nextBlocks };
      })
    );

    // Prefetch external images & attachments on topic level as well
    const updatedImages = await Promise.all(
      (tp.images || []).map(async (img) => {
        const candidateUrl =
          img.externalUrl && /^https?:\/\//i.test(img.externalUrl)
            ? img.externalUrl
            : /^https?:\/\//i.test(img.url || '')
              ? img.url
              : '';
        if (!candidateUrl) return img;
        const cached = await resolveAndCacheRemoteUrlForEntity({
          url: candidateUrl,
          preferredIdbKey: img.mediaIdbKey,
          topicId: tp.id,
          fileName: img.fileName || img.caption,
          mimeType: img.mimeType,
          mediaAssets: mirror.mediaAssets,
          customFetch: params.customFetch
        });
        if (cached.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += cached.sizeBytes;
        } else if (cached.skippedDuplicate) {
          skippedIdenticalCount += 1;
        }
        return cached.idbKey ? { ...img, mediaIdbKey: cached.idbKey } : img;
      })
    );

    const updatedAttachments = await Promise.all(
      (tp.attachments || []).map(async (att) => {
        const candidateUrl =
          att.externalUrl && /^https?:\/\//i.test(att.externalUrl)
            ? att.externalUrl
            : /^https?:\/\//i.test(att.contentDataUrlOrText || '')
              ? att.contentDataUrlOrText
              : '';
        if (!candidateUrl) return att;
        const cached = await resolveAndCacheRemoteUrlForEntity({
          url: candidateUrl,
          preferredIdbKey: att.mediaIdbKey,
          topicId: tp.id,
          fileName: att.fileName,
          mimeType: att.mimeType || att.fileType,
          mediaAssets: mirror.mediaAssets,
          customFetch: params.customFetch
        });
        if (cached.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += cached.sizeBytes;
        } else if (cached.skippedDuplicate) {
          skippedIdenticalCount += 1;
        }
        return cached.idbKey ? { ...att, mediaIdbKey: cached.idbKey } : att;
      })
    );

    const updatedLinks = await Promise.all(
      (tp.links || []).map(async (lnk) => {
        const candidateUrl = (lnk.url || '').trim();
        if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl) || !isDownloadableMediaUrl(candidateUrl)) {
          return lnk;
        }
        const cached = await resolveAndCacheRemoteUrlForEntity({
          url: candidateUrl,
          preferredIdbKey: lnk.mediaIdbKey,
          topicId: tp.id,
          fileName: lnk.title || tp.id,
          mediaAssets: mirror.mediaAssets,
          customFetch: params.customFetch
        });
        if (cached.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += cached.sizeBytes;
        } else if (cached.skippedDuplicate) {
          skippedIdenticalCount += 1;
        }
        return cached.idbKey ? { ...lnk, mediaIdbKey: cached.idbKey } : lnk;
      })
    );

    // Prefetch any media-index assets linked to this topic via linkedEntityType/linkedEntityId or topicId
    const linkedMediaAssets = (mirror.mediaAssets || []).filter(
      (ma) =>
        ma.topicId === tp.id ||
        (ma.linkedEntityType === 'topic' && ma.linkedEntityId === tp.id)
    );
    for (const ma of linkedMediaAssets) {
      const assetUrl = ma.url || ma.rawUrl || '';
      if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) continue;
      const cached = await resolveAndCacheRemoteUrlForEntity({
        url: assetUrl,
        preferredIdbKey: ma.mediaIdbKey,
        topicId: tp.id,
        fileName: ma.fileName || ma.titleEn || ma.id,
        mimeType: ma.mimeType,
        mediaAssets: mirror.mediaAssets,
        customFetch: params.customFetch
      });
      if (cached.cachedNew) {
        downloadedMediaCount += 1;
        bytesDownloaded += cached.sizeBytes;
      } else if (cached.skippedDuplicate) {
        skippedIdenticalCount += 1;
      }
    }

    const updatedTopicWithCachedMedia: TopicArticle = {
      ...tp,
      sections: updatedSections,
      images: updatedImages,
      links: updatedLinks,
      attachments: updatedAttachments
    };

    const existing = nextTopicsMap.get(updatedTopicWithCachedMedia.id);
    const incomingHash = await computeEntitySha256('topic', updatedTopicWithCachedMedia);
    const existingHash = existing ? await computeEntitySha256('topic', existing) : '';

    if (existing && existingHash === incomingHash) {
      skippedIdenticalCount += 1;
    } else {
      nextTopicsMap.set(
        updatedTopicWithCachedMedia.id,
        existing
          ? { ...updatedTopicWithCachedMedia, favorite: existing.favorite }
          : updatedTopicWithCachedMedia
      );
      downloadedTopicsCount += 1;
      bytesDownloaded += computeEntitySizeBytes(updatedTopicWithCachedMedia);
    }

    // Restore any associated media records into IndexedDB if not already present with matching SHA-256
    const cloudMediaForTopic = mirror.mediaRecords.filter((m) => m.topicId === tp.id);
    for (const mediaRec of cloudMediaForTopic) {
      const localMedia = await getLocalMediaRecord(mediaRec.id);
      const incomingMediaHash = await computeEntitySha256('media', mediaRec);
      const localMediaHash = localMedia ? await computeEntitySha256('media', localMedia) : '';
      if (localMedia && localMediaHash === incomingMediaHash) {
        skippedIdenticalCount += 1;
      } else {
        const saved = await saveLocalMediaRecord(mediaRec);
        if (saved.success) {
          downloadedMediaCount += 1;
          bytesDownloaded += mediaRec.sizeBytes || computeEntitySizeBytes(mediaRec);
        }
      }
    }
  }
  const updatedTopics = Array.from(nextTopicsMap.values());

  if ((mirror.mediaAssets || []).length > 0) {
    saveMediaAssetsIndex(mirror.mediaAssets || []);
  }

  // 4. Merge Linked Terms & Sentences for these topics/subjects/blocks with SHA-256 deduplication
  const targetSubjIds = new Set(targetSubjects.map((s) => s.id));
  const targetBlockIds = new Set(targetBlocks.map((b) => b.id));
  const cloudTermsForTarget = mirror.terms.filter(
    (tm) =>
      (tm.linkedTopicIds || []).some((id) => targetTopicIds.has(id)) ||
      (tm.linkedSubjectIds || []).some((id) => targetSubjIds.has(id)) ||
      (tm.linkedBlockIds || []).some((id) => targetBlockIds.has(id))
  );

  const nextTermsMap = new Map(params.currentTerms.map((t) => [t.id, t]));
  for (const ctm of cloudTermsForTarget) {
    removed.terms = removed.terms.filter((id) => id !== ctm.id);
    const existing = nextTermsMap.get(ctm.id);
    const incomingHash = await computeEntitySha256('term', ctm);
    const existingHash = existing ? await computeEntitySha256('term', existing) : '';
    if (existing && existingHash === incomingHash) {
      skippedIdenticalCount += 1;
    } else {
      nextTermsMap.set(
        ctm.id,
        existing ? { ...ctm, favorite: existing.favorite, srsData: existing.srsData } : ctm
      );
      downloadedTermsCount += 1;
      bytesDownloaded += computeEntitySizeBytes(ctm);
    }
  }
  const updatedTerms = Array.from(nextTermsMap.values());

  // 4b. Sync linked Questions, Exams & Books associated with this Block/Subject/Topic + prefetch offline media
  const matchingCloudQuestions = (mirror.quizQuestions || []).filter(
    (q) =>
      (q.topicId && targetTopicIds.has(q.topicId)) ||
      (q.subjectId && targetSubjIds.has(q.subjectId)) ||
      (q.blockId && targetBlockIds.has(q.blockId))
  );
  if (matchingCloudQuestions.length > 0) {
    const existingQuestions = loadQuizQuestions(updatedTopics, updatedTerms);
    const qMap = new Map(existingQuestions.map((q) => [q.id, q]));
    for (const q of matchingCloudQuestions) {
      qMap.set(q.id, q);
      if (q.imageUrl && /^https?:\/\//i.test(q.imageUrl)) {
        const qImgRes = await resolveAndCacheRemoteUrlForEntity({
          url: q.imageUrl,
          topicId: q.topicId,
          fileName: `${q.id}-diagram`,
          mediaAssets: mirror.mediaAssets,
          customFetch: params.customFetch
        });
        if (qImgRes.cachedNew) {
          downloadedMediaCount += 1;
          bytesDownloaded += qImgRes.sizeBytes;
        } else if (qImgRes.skippedDuplicate) {
          skippedIdenticalCount += 1;
        }
      }
    }
    saveQuizQuestions(Array.from(qMap.values()));
  }

  // Prefetch subject/block/question-level mediaAssets from media-index.json
  const targetQuestionIds = new Set(matchingCloudQuestions.map((q) => q.id));
  const extraHierarchyMedia = (mirror.mediaAssets || []).filter((ma) => {
    const lt = (ma.linkedEntityType || '').toLowerCase();
    const lid = ma.linkedEntityId || '';
    return (
      (ma.subjectId && targetSubjIds.has(ma.subjectId)) ||
      (ma.blockId && targetBlockIds.has(ma.blockId)) ||
      (lt === 'subject' && targetSubjIds.has(lid)) ||
      (lt === 'block' && targetBlockIds.has(lid)) ||
      (lt === 'question' && targetQuestionIds.has(lid))
    );
  });
  for (const ma of extraHierarchyMedia) {
    const assetUrl = ma.url || ma.rawUrl || '';
    if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) continue;
    const cached = await resolveAndCacheRemoteUrlForEntity({
      url: assetUrl,
      preferredIdbKey: ma.mediaIdbKey,
      topicId: ma.topicId,
      fileName: ma.fileName || ma.titleEn || ma.id,
      mimeType: ma.mimeType,
      mediaAssets: mirror.mediaAssets,
      customFetch: params.customFetch
    });
    if (cached.cachedNew) {
      downloadedMediaCount += 1;
      bytesDownloaded += cached.sizeBytes;
    } else if (cached.skippedDuplicate) {
      skippedIdenticalCount += 1;
    }
  }

  const matchingCloudExams = (mirror.exams || []).filter(
    (ex) =>
      (ex.blockId && targetBlockIds.has(ex.blockId)) ||
      (ex.subjectId && targetSubjIds.has(ex.subjectId)) ||
      (ex.topicIds || []).some((tid) => targetTopicIds.has(tid))
  );
  if (matchingCloudExams.length > 0) {
    const existingExams = loadAcademicExams();
    const exMap = new Map(existingExams.map((e) => [e.id, e]));
    for (const ex of matchingCloudExams) {
      removed.exams = (removed.exams || []).filter((id) => id !== ex.id);
      exMap.set(ex.id, ex);
    }
    saveAcademicExams(Array.from(exMap.values()));
  }

  const matchingCloudBooks = (mirror.books || []).filter(
    (bk) =>
      (bk.blockId && targetBlockIds.has(bk.blockId)) ||
      (bk.subjectId && targetSubjIds.has(bk.subjectId)) ||
      (bk.topicIds || []).some((tid) => targetTopicIds.has(tid))
  );
  if (matchingCloudBooks.length > 0) {
    const existingBooks = loadAcademicBooks();
    const bkMap = new Map(existingBooks.map((b) => [b.id, b]));
    for (const bk of matchingCloudBooks) {
      removed.books = (removed.books || []).filter((id) => id !== bk.id);
      bkMap.set(bk.id, bk);
    }
    saveAcademicBooks(Array.from(bkMap.values()));
  }

  // Also merge cloud sentences linked to the downloaded terms or topics
  const downloadedTermIds = new Set(cloudTermsForTarget.map((tm) => tm.id));
  const nextSentenceMap = new Map(params.currentSentences.map((s) => [s.id, s]));
  for (const csn of mirror.sentences || []) {
    const matchesTarget =
      (csn.linkedTermIds || []).some((id) => downloadedTermIds.has(id)) ||
      targetTopics.some((tp) => tp.category === csn.category);
    if (!matchesTarget) continue;
    removed.sentences = removed.sentences.filter((id) => id !== csn.id);
    if (!nextSentenceMap.has(csn.id)) {
      nextSentenceMap.set(csn.id, csn);
      bytesDownloaded += computeEntitySizeBytes(csn);
    }
  }
  const updatedSentences = Array.from(nextSentenceMap.values());

  saveLocallyRemovedRegistry(removed);
  notifyCloudLibraryListeners();

  const messageAr =
    downloadedTopicsCount === 0 && downloadedTermsCount === 0 && skippedIdenticalCount > 0
      ? 'منزّل مسبقاً'
      : `تم التنزيل (${formatBytesLabel(bytesDownloaded)})`;

  return {
    success: true,
    downloadedTopicsCount,
    downloadedTermsCount,
    downloadedMediaCount,
    skippedIdenticalCount,
    bytesDownloaded,
    updatedTopics,
    updatedTerms,
    updatedSentences,
    updatedBlocks,
    updatedSubjects,
    messageAr
  };
}

/**
 * Local-Only Deletion:
 * Completely deletes a Block, Subject, Topic, Book, or Exam (and its associated media in IndexedDB)
 * from local device storage while preserving it in the Unified Cloud Mirror so it appears
 * under `المكتبة السحابية` and can be re-downloaded at any time.
 */
export async function deleteCloudLibraryTargetLocally(params: {
  targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam';
  targetId: string;
  currentTopics: TopicArticle[];
  currentTerms: DictionaryTerm[];
  currentSentences: LinkedSentence[];
}): Promise<{
  success: boolean;
  removedTopicsCount: number;
  freedBytes: number;
  updatedTopics: TopicArticle[];
  updatedTerms: DictionaryTerm[];
  updatedBlocks: MedicalBlock[];
  updatedSubjects: MedicalSubject[];
  messageAr: string;
}> {
  const localBlocks = loadMedicalBlocks();
  const localSubjects = loadMedicalSubjects();
  const localBooks = loadAcademicBooks();

  // First ensure current local state is backed up into the Unified Cloud Mirror so it is never lost
  const currentMirror = loadUnifiedCloudMirror();
  const preservedMirror = mergeRecordsIntoCloudSnapshot(currentMirror, {
    blocks: localBlocks,
    subjects: localSubjects,
    topics: params.currentTopics,
    terms: params.currentTerms,
    sentences: params.currentSentences,
    books: localBooks
  });
  saveUnifiedCloudMirror(preservedMirror.snapshot);

  const removed = loadLocallyRemovedRegistry();

  if (params.targetType === 'exam') {
    const localExams = loadAcademicExams();
    const targetExam = localExams.find((e) => e.id === params.targetId);
    const freed = targetExam ? computeEntitySizeBytes(targetExam) : 0;
    removed.exams = [...(removed.exams || []), params.targetId];
    saveAcademicExams(localExams.filter((e) => e.id !== params.targetId));
    saveLocallyRemovedRegistry(removed);
    notifyCloudLibraryListeners();

    return {
      success: true,
      removedTopicsCount: 0,
      freedBytes: freed,
      updatedTopics: params.currentTopics,
      updatedTerms: params.currentTerms,
      updatedBlocks: localBlocks,
      updatedSubjects: localSubjects,
      messageAr: `تم حذف الاختبار محلياً (${formatBytesLabel(freed)})`
    };
  }

  if (params.targetType === 'book') {
    const targetBook = localBooks.find((b) => b.id === params.targetId);
    const freed = targetBook ? computeEntitySizeBytes(targetBook) : 0;
    if (targetBook) {
      const mediaKeys = [targetBook.mediaIdbKey, targetBook.coverIdbKey].filter(
        (k): k is string => Boolean(k)
      );
      if (mediaKeys.length > 0) {
        await deleteLocalMediaRecordsByKeys(mediaKeys);
      }
    }
    removed.books = [...(removed.books || []), params.targetId];
    saveAcademicBooks(localBooks.filter((b) => b.id !== params.targetId));
    saveLocallyRemovedRegistry(removed);
    notifyCloudLibraryListeners();

    return {
      success: true,
      removedTopicsCount: 0,
      freedBytes: freed,
      updatedTopics: params.currentTopics,
      updatedTerms: params.currentTerms,
      updatedBlocks: localBlocks,
      updatedSubjects: localSubjects,
      messageAr: `تم حذف الكتاب (${formatBytesLabel(freed)})`
    };
  }

  let topicsToRemoveIds = new Set<string>();
  let subjectsToRemoveIds = new Set<string>();
  let blocksToRemoveIds = new Set<string>();

  const enrichedLocalTopics = enrichAllTopicsWithHierarchy(params.currentTopics);

  if (params.targetType === 'block') {
    blocksToRemoveIds.add(params.targetId);
    removed.blocks.push(params.targetId);
    for (const s of localSubjects) {
      if (s.blockId === params.targetId) {
        subjectsToRemoveIds.add(s.id);
        removed.subjects.push(s.id);
      }
    }
    for (const t of enrichedLocalTopics) {
      if (t.blockId === params.targetId || (t.subjectId && subjectsToRemoveIds.has(t.subjectId))) {
        topicsToRemoveIds.add(t.id);
        removed.topics.push(t.id);
      }
    }
  } else if (params.targetType === 'subject') {
    subjectsToRemoveIds.add(params.targetId);
    removed.subjects.push(params.targetId);
    for (const t of enrichedLocalTopics) {
      if (t.subjectId === params.targetId) {
        topicsToRemoveIds.add(t.id);
        removed.topics.push(t.id);
      }
    }
  } else {
    topicsToRemoveIds.add(params.targetId);
    removed.topics.push(params.targetId);
  }

  let freedBytes = 0;

  // Delete media from IndexedDB for all removed topics (preserving a copy in the cloud mirror if needed)
  for (const topicId of topicsToRemoveIds) {
    const targetTopic = params.currentTopics.find((t) => t.id === topicId);
    if (targetTopic) {
      freedBytes += computeEntitySizeBytes(targetTopic);
      const mediaRecords = await getMediaRecordsByTopicId(topicId);
      if (mediaRecords.length > 0) {
        const withMedia = mergeRecordsIntoCloudSnapshot(loadUnifiedCloudMirror(), {
          mediaRecords
        });
        saveUnifiedCloudMirror(withMedia.snapshot);
      }
      const inlineKeys: string[] = [];
      for (const sec of targetTopic.sections || []) {
        for (const cb of sec.contentBlocks || []) {
          if (cb.mediaIdbKey) inlineKeys.push(cb.mediaIdbKey);
        }
      }
      if (inlineKeys.length > 0) {
        await deleteLocalMediaRecordsByKeys(inlineKeys);
      }
      await deleteLocalMediaRecordsByTopicId(topicId);
    }
  }

  const updatedBlocks = localBlocks.filter((b) => {
    if (blocksToRemoveIds.has(b.id)) {
      freedBytes += computeEntitySizeBytes(b);
      return false;
    }
    return true;
  });

  const updatedSubjects = localSubjects.filter((s) => {
    if (subjectsToRemoveIds.has(s.id)) {
      freedBytes += computeEntitySizeBytes(s);
      return false;
    }
    return true;
  });

  const updatedTopics = params.currentTopics.filter((t) => !topicsToRemoveIds.has(t.id));

  saveMedicalBlocks(updatedBlocks);
  saveMedicalSubjects(updatedSubjects);
  saveLocallyRemovedRegistry(removed);
  notifyCloudLibraryListeners();

  return {
    success: true,
    removedTopicsCount: topicsToRemoveIds.size,
    freedBytes,
    updatedTopics,
    updatedTerms: params.currentTerms,
    updatedBlocks,
    updatedSubjects,
    messageAr: `تم الحذف (${formatBytesLabel(freedBytes)})`
  };
}

/**
 * Permanent Deletion from Both App & Cloud Mirror:
 * Permanently deletes a Block (and all its Subjects, Topics, Books, Exams, Questions, Media),
 * Subject, Topic, Book, Exam, Term, Sentence, or All Data from both local device storage
 * AND the Unified Cloud Mirror, recording permanent deletion tombstones.
 */
export async function deleteCloudLibraryTargetPermanently(params: {
  targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam' | 'term' | 'sentence' | 'all_data';
  targetId: string;
  currentTopics: TopicArticle[];
  currentTerms: DictionaryTerm[];
  currentSentences: LinkedSentence[];
  deleteLinkedTerms?: boolean;
}): Promise<{
  success: boolean;
  removedBlocksCount: number;
  removedSubjectsCount: number;
  removedTopicsCount: number;
  removedBooksCount: number;
  removedExamsCount: number;
  removedQuestionsCount: number;
  removedTermsCount: number;
  removedSentencesCount: number;
  freedBytes: number;
  updatedTopics: TopicArticle[];
  updatedTerms: DictionaryTerm[];
  updatedSentences: LinkedSentence[];
  updatedBlocks: MedicalBlock[];
  updatedSubjects: MedicalSubject[];
  messageAr: string;
}> {
  const mirror = loadUnifiedCloudMirror();
  const localBlocks = loadMedicalBlocks();
  const localSubjects = loadMedicalSubjects();
  const localBooks = loadAcademicBooks();
  const localExams = loadAcademicExams();
  const localQuestions = loadQuizQuestions(params.currentTopics, params.currentTerms);
  const localMediaAssets = loadMediaAssetsIndex();
  const removed = loadLocallyRemovedRegistry();
  const permDeleted = loadPermanentlyDeletedRegistry();

  if (params.targetType === 'all_data') {
    let freedBytes =
      computeEntitySizeBytes(localBlocks) +
      computeEntitySizeBytes(localSubjects) +
      computeEntitySizeBytes(params.currentTopics) +
      computeEntitySizeBytes(params.currentTerms) +
      computeEntitySizeBytes(params.currentSentences) +
      computeEntitySizeBytes(localBooks) +
      computeEntitySizeBytes(localExams) +
      computeEntitySizeBytes(localQuestions);

    for (const tp of [...params.currentTopics, ...(mirror.topics || [])]) {
      await deleteLocalMediaRecordsByTopicId(tp.id);
    }

    const allBlockIds = Array.from(
      new Set([...localBlocks.map((b) => b.id), ...mirror.blocks.map((b) => b.id)])
    );
    const allSubjectIds = Array.from(
      new Set([...localSubjects.map((s) => s.id), ...mirror.subjects.map((s) => s.id)])
    );
    const allTopicIds = Array.from(
      new Set([...params.currentTopics.map((t) => t.id), ...mirror.topics.map((t) => t.id)])
    );
    const allBookIds = Array.from(
      new Set([...localBooks.map((b) => b.id), ...(mirror.books || []).map((b) => b.id)])
    );
    const allExamIds = Array.from(
      new Set([...localExams.map((e) => e.id), ...(mirror.exams || []).map((e) => e.id)])
    );
    const allTermIds = Array.from(
      new Set([...params.currentTerms.map((t) => t.id), ...mirror.terms.map((t) => t.id)])
    );

    saveMedicalBlocks([]);
    saveMedicalSubjects([]);
    saveAcademicBooks([]);
    saveAcademicExams([]);
    saveQuizQuestions([]);
    saveMediaAssetsIndex([]);
    saveSyncQueue([]);

    const emptyMirror: UnifiedCloudStoreSnapshot = {
      ...mirror,
      updatedAt: new Date().toISOString(),
      blocks: [],
      subjects: [],
      topics: [],
      terms: [],
      sentences: [],
      mediaRecords: [],
      books: [],
      exams: [],
      quizQuestions: [],
      mediaAssets: [],
      customAffixes: [],
      customAbbreviations: [],
      dynamicCollections: [],
      hashes: {}
    };
    saveUnifiedCloudMirror(emptyMirror);
    savePermanentlyDeletedRegistry({
      blocks: [...permDeleted.blocks, ...allBlockIds],
      subjects: [...permDeleted.subjects, ...allSubjectIds],
      topics: [...permDeleted.topics, ...allTopicIds],
      terms: [...permDeleted.terms, ...allTermIds],
      sentences: permDeleted.sentences,
      books: [...(permDeleted.books || []), ...allBookIds],
      exams: [...(permDeleted.exams || []), ...allExamIds]
    });
    notifyCloudLibraryListeners();

    return {
      success: true,
      removedBlocksCount: allBlockIds.length,
      removedSubjectsCount: allSubjectIds.length,
      removedTopicsCount: allTopicIds.length,
      removedBooksCount: allBookIds.length,
      removedExamsCount: allExamIds.length,
      removedQuestionsCount: localQuestions.length,
      removedTermsCount: allTermIds.length,
      removedSentencesCount: params.currentSentences.length,
      freedBytes,
      updatedTopics: [],
      updatedTerms: [],
      updatedSentences: [],
      updatedBlocks: [],
      updatedSubjects: [],
      messageAr: `تم حذف جميع البيانات نهائياً من التطبيق والسحابة (${formatBytesLabel(freedBytes)})`
    };
  }

  const blocksToRemove = new Set<string>();
  const subjectsToRemove = new Set<string>();
  const topicsToRemove = new Set<string>();
  const booksToRemove = new Set<string>();
  const examsToRemove = new Set<string>();
  const termsToRemove = new Set<string>();
  const sentencesToRemove = new Set<string>();

  const combinedSubjects = [
    ...mirror.subjects,
    ...localSubjects.filter((ls) => !mirror.subjects.some((ms) => ms.id === ls.id))
  ];
  const combinedTopics = enrichAllTopicsWithHierarchy([
    ...mirror.topics,
    ...params.currentTopics.filter((lt) => !mirror.topics.some((mt) => mt.id === lt.id))
  ]);
  const combinedBooks = [
    ...(mirror.books || []),
    ...localBooks.filter((lb) => !(mirror.books || []).some((mb) => mb.id === lb.id))
  ];
  const combinedExams = [
    ...(mirror.exams || []),
    ...localExams.filter((le) => !(mirror.exams || []).some((me) => me.id === le.id))
  ];

  if (params.targetType === 'block') {
    blocksToRemove.add(params.targetId);
    for (const s of combinedSubjects) {
      if (s.blockId === params.targetId) {
        subjectsToRemove.add(s.id);
      }
    }
    for (const t of combinedTopics) {
      if (t.blockId === params.targetId || (t.subjectId && subjectsToRemove.has(t.subjectId))) {
        topicsToRemove.add(t.id);
      }
    }
    for (const bk of combinedBooks) {
      if (
        bk.blockId === params.targetId ||
        (bk.subjectId && subjectsToRemove.has(bk.subjectId)) ||
        (bk.topicIds || []).some((tid) => topicsToRemove.has(tid))
      ) {
        booksToRemove.add(bk.id);
      }
    }
    for (const ex of combinedExams) {
      if (
        ex.blockId === params.targetId ||
        (ex.subjectId && subjectsToRemove.has(ex.subjectId)) ||
        (ex.topicIds || []).some((tid) => topicsToRemove.has(tid))
      ) {
        examsToRemove.add(ex.id);
      }
    }
  } else if (params.targetType === 'subject') {
    subjectsToRemove.add(params.targetId);
    for (const t of combinedTopics) {
      if (t.subjectId === params.targetId) {
        topicsToRemove.add(t.id);
      }
    }
    for (const bk of combinedBooks) {
      if (
        bk.subjectId === params.targetId ||
        (bk.topicIds || []).some((tid) => topicsToRemove.has(tid))
      ) {
        booksToRemove.add(bk.id);
      }
    }
    for (const ex of combinedExams) {
      if (
        ex.subjectId === params.targetId ||
        (ex.topicIds || []).some((tid) => topicsToRemove.has(tid))
      ) {
        examsToRemove.add(ex.id);
      }
    }
  } else if (params.targetType === 'topic') {
    topicsToRemove.add(params.targetId);
  } else if (params.targetType === 'book') {
    booksToRemove.add(params.targetId);
  } else if (params.targetType === 'exam') {
    examsToRemove.add(params.targetId);
  } else if (params.targetType === 'term') {
    termsToRemove.add(params.targetId);
  } else if (params.targetType === 'sentence') {
    sentencesToRemove.add(params.targetId);
  }

  if (
    params.deleteLinkedTerms !== false &&
    (blocksToRemove.size > 0 || subjectsToRemove.size > 0 || topicsToRemove.size > 0)
  ) {
    for (const tm of [...params.currentTerms, ...mirror.terms]) {
      const linkedToTarget =
        (tm.linkedBlockIds || []).some((id) => blocksToRemove.has(id)) ||
        (tm.linkedSubjectIds || []).some((id) => subjectsToRemove.has(id)) ||
        (tm.linkedTopicIds || []).some((id) => topicsToRemove.has(id));
      if (linkedToTarget) {
        termsToRemove.add(tm.id);
      }
    }
  }

  let freedBytes = 0;

  // Delete IndexedDB media for removed topics & books
  for (const topicId of topicsToRemove) {
    const tp =
      params.currentTopics.find((t) => t.id === topicId) ||
      mirror.topics.find((t) => t.id === topicId);
    if (tp) {
      freedBytes += computeEntitySizeBytes(tp);
      const inlineKeys: string[] = [];
      for (const sec of tp.sections || []) {
        for (const cb of sec.contentBlocks || []) {
          if (cb.mediaIdbKey) inlineKeys.push(cb.mediaIdbKey);
        }
      }
      if (inlineKeys.length > 0) {
        await deleteLocalMediaRecordsByKeys(inlineKeys);
      }
    }
    await deleteLocalMediaRecordsByTopicId(topicId);
  }

  for (const bookId of booksToRemove) {
    const bk =
      localBooks.find((b) => b.id === bookId) ||
      (mirror.books || []).find((b) => b.id === bookId);
    if (bk) {
      freedBytes += bk.sizeBytes || computeEntitySizeBytes(bk);
      const keys = [bk.mediaIdbKey, bk.coverIdbKey].filter((k): k is string => Boolean(k));
      if (keys.length > 0) {
        await deleteLocalMediaRecordsByKeys(keys);
      }
    }
  }

  const updatedBlocks = localBlocks.filter((b) => {
    if (blocksToRemove.has(b.id)) {
      freedBytes += computeEntitySizeBytes(b);
      return false;
    }
    return true;
  });
  const updatedSubjects = localSubjects.filter((s) => {
    if (subjectsToRemove.has(s.id)) {
      freedBytes += computeEntitySizeBytes(s);
      return false;
    }
    return true;
  });
  const updatedTopics = params.currentTopics.filter((t) => !topicsToRemove.has(t.id));
  const updatedBooks = localBooks.filter((b) => !booksToRemove.has(b.id));
  const updatedExams = localExams.filter((e) => !examsToRemove.has(e.id));

  const isQuestionRemoved = (q: UnifiedQuizQuestion) =>
    (q.blockId && blocksToRemove.has(q.blockId)) ||
    (q.subjectId && subjectsToRemove.has(q.subjectId)) ||
    (q.topicId && topicsToRemove.has(q.topicId));

  const removedQuestionsCount = localQuestions.filter(isQuestionRemoved).length;
  const updatedQuestions = localQuestions.filter((q) => !isQuestionRemoved(q));

  const isAssetRemoved = (ma: MediaAssetRecord) =>
    (ma.blockId && blocksToRemove.has(ma.blockId)) ||
    (ma.subjectId && subjectsToRemove.has(ma.subjectId)) ||
    (ma.topicId && topicsToRemove.has(ma.topicId)) ||
    (ma.linkedEntityType === 'block' && ma.linkedEntityId && blocksToRemove.has(ma.linkedEntityId)) ||
    (ma.linkedEntityType === 'subject' && ma.linkedEntityId && subjectsToRemove.has(ma.linkedEntityId)) ||
    (ma.linkedEntityType === 'topic' && ma.linkedEntityId && topicsToRemove.has(ma.linkedEntityId)) ||
    (ma.linkedEntityType === 'book' && ma.linkedEntityId && booksToRemove.has(ma.linkedEntityId));

  const updatedMediaAssets = localMediaAssets.filter((ma) => !isAssetRemoved(ma));

  const updatedTerms = params.currentTerms.filter((tm) => {
    if (termsToRemove.has(tm.id)) {
      freedBytes += computeEntitySizeBytes(tm);
      return false;
    }
    return true;
  });

  const updatedSentences = params.currentSentences.filter((sn) => {
    const snTopicId = (sn as unknown as { topicId?: string }).topicId;
    if (
      sentencesToRemove.has(sn.id) ||
      (snTopicId && topicsToRemove.has(snTopicId))
    ) {
      freedBytes += computeEntitySizeBytes(sn);
      return false;
    }
    return true;
  });

  // Persist local stores
  saveMedicalBlocks(updatedBlocks);
  saveMedicalSubjects(updatedSubjects);
  saveAcademicBooks(updatedBooks);
  saveAcademicExams(updatedExams);
  saveQuizQuestions(updatedQuestions);
  saveMediaAssetsIndex(updatedMediaAssets);

  // Remove from Cloud Mirror as well
  const nextHashes = { ...(mirror.hashes || {}) };
  for (const id of blocksToRemove) delete nextHashes[`block:${id}`];
  for (const id of subjectsToRemove) delete nextHashes[`subject:${id}`];
  for (const id of topicsToRemove) delete nextHashes[`topic:${id}`];
  for (const id of termsToRemove) delete nextHashes[`term:${id}`];
  for (const id of sentencesToRemove) delete nextHashes[`sentence:${id}`];

  const updatedMirror: UnifiedCloudStoreSnapshot = {
    ...mirror,
    updatedAt: new Date().toISOString(),
    blocks: mirror.blocks.filter((b) => !blocksToRemove.has(b.id)),
    subjects: mirror.subjects.filter((s) => !subjectsToRemove.has(s.id)),
    topics: mirror.topics.filter((t) => !topicsToRemove.has(t.id)),
    terms: mirror.terms.filter((tm) => !termsToRemove.has(tm.id)),
    sentences: mirror.sentences.filter((sn) => {
      const snTopicId = (sn as unknown as { topicId?: string }).topicId;
      return !sentencesToRemove.has(sn.id) && !(snTopicId && topicsToRemove.has(snTopicId));
    }),
    mediaRecords: mirror.mediaRecords.filter(
      (mr) => !(mr.topicId && topicsToRemove.has(mr.topicId))
    ),
    books: (mirror.books || []).filter((b) => !booksToRemove.has(b.id)),
    exams: (mirror.exams || []).filter((e) => !examsToRemove.has(e.id)),
    quizQuestions: (mirror.quizQuestions || []).filter((q) => !isQuestionRemoved(q)),
    mediaAssets: (mirror.mediaAssets || []).filter((ma) => !isAssetRemoved(ma)),
    hashes: nextHashes
  };
  saveUnifiedCloudMirror(updatedMirror);

  // Clean sync queue
  const currentQueue = loadSyncQueue();
  saveSyncQueue(
    currentQueue.filter((q) => {
      if (q.entityType === 'block' && blocksToRemove.has(q.entityId)) return false;
      if (q.entityType === 'subject' && subjectsToRemove.has(q.entityId)) return false;
      if (q.entityType === 'topic' && topicsToRemove.has(q.entityId)) return false;
      if (q.entityType === 'book' && booksToRemove.has(q.entityId)) return false;
      if (q.entityType === 'exam' && examsToRemove.has(q.entityId)) return false;
      if (q.entityType === 'term' && termsToRemove.has(q.entityId)) return false;
      if (q.entityType === 'sentence' && sentencesToRemove.has(q.entityId)) return false;
      return true;
    })
  );

  // Record tombstones in both registries
  saveLocallyRemovedRegistry({
    blocks: [...removed.blocks, ...Array.from(blocksToRemove)],
    subjects: [...removed.subjects, ...Array.from(subjectsToRemove)],
    topics: [...removed.topics, ...Array.from(topicsToRemove)],
    terms: [...removed.terms, ...Array.from(termsToRemove)],
    sentences: [...removed.sentences, ...Array.from(sentencesToRemove)],
    books: [...(removed.books || []), ...Array.from(booksToRemove)],
    exams: [...(removed.exams || []), ...Array.from(examsToRemove)]
  });

  savePermanentlyDeletedRegistry({
    blocks: [...permDeleted.blocks, ...Array.from(blocksToRemove)],
    subjects: [...permDeleted.subjects, ...Array.from(subjectsToRemove)],
    topics: [...permDeleted.topics, ...Array.from(topicsToRemove)],
    terms: [...permDeleted.terms, ...Array.from(termsToRemove)],
    sentences: [...permDeleted.sentences, ...Array.from(sentencesToRemove)],
    books: [...(permDeleted.books || []), ...Array.from(booksToRemove)],
    exams: [...(permDeleted.exams || []), ...Array.from(examsToRemove)]
  });

  notifyCloudLibraryListeners();

  const labelMap: Record<string, string> = {
    block: 'البلوك ومحتوياته',
    subject: 'المادة ومواضيعها',
    topic: 'الموضوع',
    book: 'الكتاب',
    exam: 'الاختبار',
    term: 'المصطلح',
    sentence: 'الجملة'
  };

  return {
    success: true,
    removedBlocksCount: blocksToRemove.size,
    removedSubjectsCount: subjectsToRemove.size,
    removedTopicsCount: topicsToRemove.size,
    removedBooksCount: booksToRemove.size,
    removedExamsCount: examsToRemove.size,
    removedQuestionsCount,
    removedTermsCount: termsToRemove.size,
    removedSentencesCount: sentencesToRemove.size,
    freedBytes,
    updatedTopics,
    updatedTerms,
    updatedSentences,
    updatedBlocks,
    updatedSubjects,
    messageAr: `تم حذف ${labelMap[params.targetType] || 'العنصر'} نهائياً من التطبيق والسحابة`
  };
}

