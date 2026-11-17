import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  TopicSection,
  TopicContentBlock,
  TopicImageItem,
  TopicAttachmentItem,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord,
  StudyStats,
  VersionMetadata,
  AcademicBookResource,
  AcademicExamPackage,
  MediaAssetRecord,
  LocalMediaRecord,
  UserStudyNoteRecord
} from '../types/lexicon';
import {
  loadMedicalBlocks,
  loadMedicalSubjects,
  loadAcademicBooks,
  loadAcademicExams,
  loadMediaAssetsIndex,
  loadUserStudyNotes,
  normalizeAcademicBookResource
} from './learningHierarchyService';
import {
  loadQuizQuestions,
  loadQuizAttempts
} from './quizEngineService';
import { getAllLocalMediaRecordsMap } from './mediaStorageService';
import { base64ToUint8Array } from '../utils/downloadHelper';
import { createDefaultVersionMetadata } from './dataPlatformService';

export type TelegramBackupSchedule = 'off' | '6h' | 'daily' | 'weekly' | 'on_change';

export interface ConciseDataSummary {
  termsCount: number;
  topicsCount: number;
  blocksCount: number;
  subjectsCount: number;
  sentencesCount: number;
  questionsCount: number;
  booksCount?: number;
  examsCount?: number;
  favoritesCount: number;
  sizeKB: number;
  timestamp: string;
  sourceLabel: string;
  shortText: string;
}

export interface TelegramMediaSyncRecord {
  messageId: number;
  fileName: string;
  uploadedAt: string;
}

export interface TelegramBackupConfig {
  enabled: boolean;
  botToken: string;
  encryptedBotToken?: string;
  chatId: string;
  schedule: TelegramBackupSchedule;
  includeTopicsAndHierarchy: boolean;
  includeDictionaryAndTerms: boolean;
  includeQuizzesAndStats: boolean;
  includeMediaFilesOnSync?: boolean;
  syncedMediaSha256Map?: Record<string, TelegramMediaSyncRecord>;
  lastBackupAt?: string;
  lastBackupSummary?: ConciseDataSummary;
  lastBackupMessageId?: number;
  appBackupMessageIds?: number[];
}

const STORAGE_KEY_TELEGRAM_CONFIG = 'umed_telegram_backup_config_v1';
const STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP = 'umed_telegram_backup_credentials_v1';
const STORAGE_KEY_MAIN_BACKUP_HISTORY = 'dictengine_umd_backup_history_v2';
const STORAGE_KEY_LOCAL_CIPHER_SALT = 'umed_ks_device_salt_v1';

const DEFAULT_CONFIG: TelegramBackupConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  schedule: 'on_change',
  includeTopicsAndHierarchy: true,
  includeDictionaryAndTerms: true,
  includeQuizzesAndStats: true,
  includeMediaFilesOnSync: true,
  syncedMediaSha256Map: {},
  appBackupMessageIds: []
};

let memoryTelegramConfig: TelegramBackupConfig | null = null;

// ============================================================================
// BOT TOKEN PROTECTION (Android Keystore + Device-Bound Cipher Envelope)
// ============================================================================

interface AndroidKeystoreBridge {
  encryptSecretWithKeystore?: (plainText: string) => string;
  decryptSecretWithKeystore?: (encryptedPayload: string) => string;
}

function getAndroidKeystoreBridge(): AndroidKeystoreBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    UMEDAndroidBridge?: AndroidKeystoreBridge;
    UMEDNativeDownloader?: AndroidKeystoreBridge;
  };
  const candidate = w.UMEDAndroidBridge || w.UMEDNativeDownloader;
  if (
    candidate &&
    typeof candidate.encryptSecretWithKeystore === 'function' &&
    typeof candidate.decryptSecretWithKeystore === 'function'
  ) {
    return candidate;
  }
  return null;
}

let memoryDeviceSalt: string | null = null;

function getOrCreateDeviceSalt(): string {
  const existing = readRawFromStorage(STORAGE_KEY_LOCAL_CIPHER_SALT);
  if (existing && existing.length >= 16) {
    memoryDeviceSalt = existing;
    return existing;
  }
  if (memoryDeviceSalt && memoryDeviceSalt.length >= 16) {
    writeRawToStorageWithQuotaRecovery(STORAGE_KEY_LOCAL_CIPHER_SALT, memoryDeviceSalt);
    return memoryDeviceSalt;
  }
  const generated = `umedt-ks-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  memoryDeviceSalt = generated;
  writeRawToStorageWithQuotaRecovery(STORAGE_KEY_LOCAL_CIPHER_SALT, generated);
  return generated;
}

function xorCipherBytes(input: Uint8Array, keyStr: string): Uint8Array {
  const keyBytes = new TextEncoder().encode(keyStr || 'umedt-default-keystore-seed');
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 31) & 0xff);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Encrypts the Telegram Bot Token using Android Keystore (`aks_v1:...`) when running on Android APK,
 * or a device-bound local cipher envelope (`wks_v1:...`) so the raw token is never stored in plaintext.
 */
export function encryptBotTokenForStorage(plainToken: string): string {
  const clean = sanitizeTelegramInput(plainToken);
  if (!clean) return '';
  if (clean.startsWith('aks_v1:') || clean.startsWith('wks_v1:')) {
    return clean;
  }

  const bridge = getAndroidKeystoreBridge();
  if (bridge && bridge.encryptSecretWithKeystore) {
    try {
      const raw = bridge.encryptSecretWithKeystore(clean);
      const parsed = JSON.parse(raw) as { ok?: boolean; cipherText?: string };
      if (parsed.ok && parsed.cipherText && parsed.cipherText.startsWith('aks_v1:')) {
        return parsed.cipherText;
      }
    } catch {
      // Fallback to local envelope below
    }
  }

  const salt = getOrCreateDeviceSalt();
  const plainBytes = new TextEncoder().encode(clean);
  const cipherBytes = xorCipherBytes(plainBytes, salt);
  return `wks_v1:${bytesToBase64(cipherBytes)}`;
}

/**
 * Decrypts a stored Bot Token in memory only when needed for direct client->Telegram requests.
 */
export function decryptBotTokenFromStorage(storedPayload: string): string {
  const raw = (storedPayload || '').trim();
  if (!raw) return '';

  if (raw.startsWith('aks_v1:')) {
    const bridge = getAndroidKeystoreBridge();
    if (bridge && bridge.decryptSecretWithKeystore) {
      try {
        const res = bridge.decryptSecretWithKeystore(raw);
        const parsed = JSON.parse(res) as { ok?: boolean; plainText?: string };
        if (parsed.ok && typeof parsed.plainText === 'string') {
          return sanitizeTelegramInput(parsed.plainText);
        }
      } catch {
        return '';
      }
    }
    return '';
  }

  if (raw.startsWith('wks_v1:')) {
    try {
      const b64 = raw.slice('wks_v1:'.length);
      const salt = getOrCreateDeviceSalt();
      const cipherBytes = base64ToBytes(b64);
      const plainBytes = xorCipherBytes(cipherBytes, salt);
      return sanitizeTelegramInput(new TextDecoder().decode(plainBytes));
    } catch {
      return '';
    }
  }

  return sanitizeTelegramInput(raw);
}

/**
 * Masks the Bot Token for safe UI display without exposing the secret.
 */
export function maskBotTokenForDisplay(token: string): string {
  const clean = sanitizeTelegramInput(token);
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••••••••••${clean.slice(-3)}`;
}

/**
 * Ensures a Bot Token never leaks in error messages or logs.
 */
export function redactBotTokenFromText(text: string, token?: string): string {
  let output = String(text || '');
  const cleanToken = sanitizeTelegramInput(token || memoryTelegramConfig?.botToken || '');
  if (cleanToken && cleanToken.length >= 6) {
    output = output.split(cleanToken).join('[REDACTED_BOT_TOKEN]');
  }
  // Also redact any pattern matching Telegram bot<token> URLs
  output = output.replace(/bot\d{6,15}:[A-Za-z0-9_-]{20,}/g, 'bot[REDACTED_BOT_TOKEN]');
  output = output.replace(/\b\d{6,15}:[A-Za-z0-9_-]{25,}\b/g, '[REDACTED_BOT_TOKEN]');
  return output;
}

const memoryRawStorageMap = new Map<string, string>();

export function readRawTelegramConfigJsonForAudit(): string {
  return readRawFromStorage(STORAGE_KEY_TELEGRAM_CONFIG) || '';
}

function readRawFromStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val) return val;
    }
  } catch {
    // ignore localStorage read error
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const val = window.sessionStorage.getItem(key);
      if (val) return val;
    }
  } catch {
    // ignore sessionStorage read error
  }
  return memoryRawStorageMap.get(key) || null;
}

function writeRawToStorageWithQuotaRecovery(key: string, value: string): boolean {
  memoryRawStorageMap.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // ignore sessionStorage error
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const rawHistory = window.localStorage.getItem(STORAGE_KEY_MAIN_BACKUP_HISTORY);
        if (rawHistory) {
          const parsedHistory = JSON.parse(rawHistory);
          if (Array.isArray(parsedHistory) && parsedHistory.length > 1) {
            window.localStorage.setItem(
              STORAGE_KEY_MAIN_BACKUP_HISTORY,
              JSON.stringify(parsedHistory.slice(0, 1))
            );
          } else {
            window.localStorage.removeItem(STORAGE_KEY_MAIN_BACKUP_HISTORY);
          }
        }
        window.localStorage.setItem(key, value);
        return true;
      }
    } catch {
      // ignore if still full
    }
  }
  return true;
}

export function loadTelegramBackupConfig(): TelegramBackupConfig {
  try {
    const rawFull = readRawFromStorage(STORAGE_KEY_TELEGRAM_CONFIG);
    const rawCreds = readRawFromStorage(STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP);

    const parsedFull = rawFull ? (JSON.parse(rawFull) as Partial<TelegramBackupConfig>) : {};
    const parsedCreds = rawCreds ? (JSON.parse(rawCreds) as Partial<TelegramBackupConfig>) : {};

    const encryptedSource =
      parsedFull.encryptedBotToken ||
      parsedCreds.encryptedBotToken ||
      parsedFull.botToken ||
      parsedCreds.botToken ||
      '';

    const decryptedToken =
      decryptBotTokenFromStorage(encryptedSource) ||
      memoryTelegramConfig?.botToken ||
      '';

    const chatId =
      (typeof parsedFull.chatId === 'string' && parsedFull.chatId.trim()) ||
      (typeof parsedCreds.chatId === 'string' && parsedCreds.chatId.trim()) ||
      memoryTelegramConfig?.chatId ||
      '';
    const schedule: TelegramBackupSchedule =
      parsedFull.schedule ||
      parsedCreds.schedule ||
      memoryTelegramConfig?.schedule ||
      DEFAULT_CONFIG.schedule;

    const hasCredentials = Boolean(decryptedToken && chatId);
    const enabled =
      typeof parsedFull.enabled === 'boolean'
        ? parsedFull.enabled || (hasCredentials && schedule !== 'off')
        : typeof parsedCreds.enabled === 'boolean'
        ? parsedCreds.enabled || (hasCredentials && schedule !== 'off')
        : memoryTelegramConfig?.enabled ?? (hasCredentials && schedule !== 'off');

    const lastBackupMessageId =
      typeof parsedFull.lastBackupMessageId === 'number'
        ? parsedFull.lastBackupMessageId
        : typeof parsedCreds.lastBackupMessageId === 'number'
        ? parsedCreds.lastBackupMessageId
        : memoryTelegramConfig?.lastBackupMessageId;

    const appBackupMessageIds = Array.from(
      new Set([
        ...(Array.isArray(parsedFull.appBackupMessageIds) ? parsedFull.appBackupMessageIds : []),
        ...(Array.isArray(parsedCreds.appBackupMessageIds) ? parsedCreds.appBackupMessageIds : []),
        ...(Array.isArray(memoryTelegramConfig?.appBackupMessageIds)
          ? memoryTelegramConfig!.appBackupMessageIds!
          : []),
        ...(typeof lastBackupMessageId === 'number' ? [lastBackupMessageId] : [])
      ])
    );

    const resolved: TelegramBackupConfig = {
      ...DEFAULT_CONFIG,
      ...memoryTelegramConfig,
      ...parsedCreds,
      ...parsedFull,
      botToken: decryptedToken,
      encryptedBotToken: decryptedToken ? encryptBotTokenForStorage(decryptedToken) : '',
      chatId,
      schedule,
      enabled,
      lastBackupMessageId,
      appBackupMessageIds
    };

    memoryTelegramConfig = resolved;
    return resolved;
  } catch {
    return memoryTelegramConfig || DEFAULT_CONFIG;
  }
}

export function saveTelegramBackupConfig(config: TelegramBackupConfig): TelegramBackupConfig {
  const previous = memoryTelegramConfig || DEFAULT_CONFIG;
  const rawTokenInput =
    typeof config.botToken === 'string' ? config.botToken : previous.botToken;
  const plainToken = decryptBotTokenFromStorage(rawTokenInput);
  const encryptedBotToken = plainToken ? encryptBotTokenForStorage(plainToken) : '';
  const chatId = typeof config.chatId === 'string' ? config.chatId : previous.chatId;
  const schedule = config.schedule || previous.schedule || 'on_change';
  const hasCredentials = Boolean(plainToken.trim() && chatId.trim());

  const lastBackupMessageId =
    typeof config.lastBackupMessageId === 'number'
      ? config.lastBackupMessageId
      : previous.lastBackupMessageId;

  const appBackupMessageIds = Array.isArray(config.appBackupMessageIds)
    ? config.appBackupMessageIds
    : typeof lastBackupMessageId === 'number'
    ? [lastBackupMessageId]
    : previous.appBackupMessageIds || [];

  const normalized: TelegramBackupConfig = {
    ...DEFAULT_CONFIG,
    ...previous,
    ...config,
    botToken: plainToken,
    encryptedBotToken,
    chatId,
    schedule,
    enabled:
      schedule === 'off'
        ? false
        : hasCredentials
        ? true
        : Boolean(config.enabled),
    lastBackupMessageId,
    appBackupMessageIds
  };

  memoryTelegramConfig = normalized;

  const syncedMediaSha256Map: Record<string, TelegramMediaSyncRecord> = {
    ...(previous.syncedMediaSha256Map || {}),
    ...(config.syncedMediaSha256Map || {})
  };

  // Store ONLY the encrypted token in localStorage/sessionStorage (never plaintext botToken!)
  const persistedRecord = {
    enabled: normalized.enabled,
    botToken: '', // Never persist raw token in storage JSON
    encryptedBotToken,
    chatId: normalized.chatId,
    schedule: normalized.schedule,
    includeTopicsAndHierarchy: normalized.includeTopicsAndHierarchy,
    includeDictionaryAndTerms: normalized.includeDictionaryAndTerms,
    includeQuizzesAndStats: normalized.includeQuizzesAndStats,
    includeMediaFilesOnSync: normalized.includeMediaFilesOnSync !== false,
    syncedMediaSha256Map,
    lastBackupAt: normalized.lastBackupAt,
    lastBackupMessageId: normalized.lastBackupMessageId,
    appBackupMessageIds: normalized.appBackupMessageIds
  };

  writeRawToStorageWithQuotaRecovery(
    STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP,
    JSON.stringify(persistedRecord)
  );

  const fullPersisted = {
    ...persistedRecord,
    lastBackupSummary: normalized.lastBackupSummary
  };

  if (
    !writeRawToStorageWithQuotaRecovery(
      STORAGE_KEY_TELEGRAM_CONFIG,
      JSON.stringify(fullPersisted)
    )
  ) {
    writeRawToStorageWithQuotaRecovery(
      STORAGE_KEY_TELEGRAM_CONFIG,
      JSON.stringify(persistedRecord)
    );
  }

  return normalized;
}

// ============================================================================
// SEPARATION OF BINARY MEDIA FROM BACKUP PAYLOADS (Requirement #3)
// ============================================================================

function isInlineBinaryDataUrl(val?: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.startsWith('data:');
}

function estimateBytesFromDataUrl(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const payload = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.max(1, Math.floor((payload.length * 3) / 4));
}

function extractMimeFromDataUrl(dataUrl: string, fallback = 'application/octet-stream'): string {
  if (!dataUrl.startsWith('data:')) return fallback;
  const endIdx = dataUrl.indexOf(';');
  const commaIdx = dataUrl.indexOf(',');
  const cut = endIdx !== -1 && (commaIdx === -1 || endIdx < commaIdx) ? endIdx : commaIdx;
  if (cut > 5) {
    return dataUrl.slice(5, cut).trim() || fallback;
  }
  return fallback;
}

/**
 * Strips heavy binary payloads (`data:image/...`, `data:video/...`, `data:audio/...`, `data:application/pdf...`)
 * from Topics before placing them into a backup JSON, preserving all external URLs, `mediaIdbKey` references,
 * filenames, MIME types, sizes, captions, and metadata.
 */
export function stripBinaryMediaFromTopicsForBackup(topics: TopicArticle[]): TopicArticle[] {
  return (topics || []).map((topic) => {
    const cleanImages: TopicImageItem[] = (topic.images || []).map((img) => {
      if (isInlineBinaryDataUrl(img.url)) {
        const refKey = img.mediaIdbKey || `img-ref-${topic.id}-${img.id}`;
        return {
          ...img,
          url: img.externalUrl || `idb://${refKey}`,
          mediaIdbKey: refKey,
          mimeType: img.mimeType || extractMimeFromDataUrl(img.url, 'image/png'),
          sizeBytes: img.sizeBytes || estimateBytesFromDataUrl(img.url),
          isLocalMediaRef: true
        };
      }
      return img;
    });

    const cleanAttachments: TopicAttachmentItem[] = (topic.attachments || []).map((att) => {
      if (isInlineBinaryDataUrl(att.contentDataUrlOrText)) {
        const refKey = att.mediaIdbKey || `att-ref-${topic.id}-${att.id}`;
        return {
          ...att,
          contentDataUrlOrText: att.externalUrl || `idb://${refKey}`,
          mediaIdbKey: refKey,
          mimeType: att.mimeType || extractMimeFromDataUrl(att.contentDataUrlOrText, 'application/pdf'),
          sizeBytes: att.sizeBytes || estimateBytesFromDataUrl(att.contentDataUrlOrText),
          isLocalMediaRef: true
        };
      }
      return att;
    });

    const cleanSections: TopicSection[] = (topic.sections || []).map((sec) => {
      if (!Array.isArray(sec.contentBlocks) || sec.contentBlocks.length === 0) {
        return sec;
      }
      const cleanBlocks: TopicContentBlock[] = sec.contentBlocks.map((blk) => {
        if (isInlineBinaryDataUrl(blk.mediaUrl)) {
          const refKey = blk.mediaIdbKey || `blk-media-${blk.id}`;
          return {
            ...blk,
            mediaUrl: blk.externalUrl || `idb://${refKey}`,
            mediaIdbKey: refKey,
            mediaMimeType:
              blk.mediaMimeType || extractMimeFromDataUrl(blk.mediaUrl || '', 'application/octet-stream'),
            mediaSizeBytes:
              blk.mediaSizeBytes || estimateBytesFromDataUrl(blk.mediaUrl || ''),
            isLocalMediaRef: true
          };
        }
        return blk;
      });
      return {
        ...sec,
        contentBlocks: cleanBlocks
      };
    });

    return {
      ...topic,
      images: cleanImages,
      attachments: cleanAttachments,
      sections: cleanSections
    };
  });
}

export interface FullUnifiedBackupPayload {
  format: 'umed-unified-backup-v2.3';
  exportedAt: string;
  mediaStoragePolicy?: 'metadata_and_urls_only';
  summary: ConciseDataSummary;
  data: {
    terms: DictionaryTerm[];
    sentences: LinkedSentence[];
    topics: TopicArticle[];
    blocks: MedicalBlock[];
    subjects: MedicalSubject[];
    quizQuestions: UnifiedQuizQuestion[];
    quizAttempts: QuizAttemptRecord[];
    books?: AcademicBookResource[];
    exams?: AcademicExamPackage[];
    mediaAssets?: MediaAssetRecord[];
    userNotes?: UserStudyNoteRecord[];
    studyStats?: StudyStats;
    versionMetadata: VersionMetadata;
  };
}

function stripBinaryMediaFromBooksForBackup(books: AcademicBookResource[]): AcademicBookResource[] {
  return (books || []).map((rawBk) => {
    const bk = normalizeAcademicBookResource(
      rawBk as Partial<AcademicBookResource> & Record<string, unknown>
    );
    const idbFallback = `idb://${bk.mediaIdbKey || bk.id}`;
    return {
      ...bk,
      downloadUrl: isInlineBinaryDataUrl(bk.downloadUrl) ? idbFallback : bk.downloadUrl,
      pdfUrl: isInlineBinaryDataUrl(bk.pdfUrl) ? idbFallback : bk.pdfUrl,
      coverUrl: isInlineBinaryDataUrl(bk.coverUrl) ? undefined : bk.coverUrl,
      favorite: bk.favorite,
      bookmarks: bk.bookmarks,
      lastReadPage: bk.lastReadPage,
      readingProgressPercent: bk.readingProgressPercent,
      notes: bk.notes
    };
  });
}

export function buildConciseDataSummary(params: {
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  blocks?: MedicalBlock[];
  subjects?: MedicalSubject[];
  questions?: UnifiedQuizQuestion[];
  books?: AcademicBookResource[];
  exams?: AcademicExamPackage[];
  sourceLabel?: string;
  rawSizeBytes?: number;
}): ConciseDataSummary {
  const terms = params.terms || [];
  const sentences = params.sentences || [];
  const topics = params.topics || [];
  const blocks = params.blocks ?? loadMedicalBlocks();
  const subjects = params.subjects ?? loadMedicalSubjects();
  const questions = params.questions ?? loadQuizQuestions(topics, terms);
  const books = params.books ?? loadAcademicBooks();
  const exams = params.exams ?? loadAcademicExams();

  const favoritesCount =
    terms.filter((t) => t.favorite).length +
    sentences.filter((s) => s.favorite).length +
    topics.filter((t) => t.favorite).length;

  const estimatedBytes =
    params.rawSizeBytes ??
    new Blob([
      JSON.stringify({
        t: terms.length,
        s: sentences.length,
        tp: topics.length,
        bk: books.length,
        ex: exams.length
      })
    ]).size;

  const sizeKB = Math.max(1, Math.round((estimatedBytes / 1024) * 10) / 10);
  const timestamp = new Date().toISOString();
  const sourceLabel = params.sourceLabel || 'نسخة بيانات شاملة';

  const parts: string[] = [];
  if (terms.length > 0) parts.push(`${terms.length} مصطلح`);
  if (topics.length > 0) parts.push(`${topics.length} موضوع`);
  if (blocks.length > 0) parts.push(`${blocks.length} بلوك`);
  if (subjects.length > 0) parts.push(`${subjects.length} مادة`);
  if (sentences.length > 0) parts.push(`${sentences.length} جملة`);
  if (questions.length > 0) parts.push(`${questions.length} سؤال`);
  if (books.length > 0) parts.push(`${books.length} كتاب`);
  if (exams.length > 0) parts.push(`${exams.length} اختبار`);

  const shortText =
    parts.length > 0 ? parts.join(' · ') : 'لا توجد سجلات مضافة';

  return {
    termsCount: terms.length,
    topicsCount: topics.length,
    blocksCount: blocks.length,
    subjectsCount: subjects.length,
    sentencesCount: sentences.length,
    questionsCount: questions.length,
    booksCount: books.length,
    examsCount: exams.length,
    favoritesCount,
    sizeKB,
    timestamp,
    sourceLabel,
    shortText
  };
}

export function createUnifiedBackupPackage(
  terms: DictionaryTerm[],
  sentences: LinkedSentence[],
  topics: TopicArticle[],
  sourceLabel = 'نسخة احتياطية كاملة',
  studyStats?: StudyStats,
  versionMetadata?: VersionMetadata
): {
  payload: FullUnifiedBackupPayload;
  jsonString: string;
  summary: ConciseDataSummary;
} {
  const blocks = loadMedicalBlocks();
  const subjects = loadMedicalSubjects();
  // Always strip heavy binary media from backup topics & books while keeping URLs & metadata references
  const sanitizedTopics = stripBinaryMediaFromTopicsForBackup(topics);
  const sanitizedBooks = stripBinaryMediaFromBooksForBackup(loadAcademicBooks());
  const exams = loadAcademicExams();
  const mediaAssets = loadMediaAssetsIndex();
  const userNotes = loadUserStudyNotes();
  const quizQuestions = loadQuizQuestions(sanitizedTopics, terms);
  const quizAttempts = loadQuizAttempts();
  const resolvedMetadata = versionMetadata || createDefaultVersionMetadata();

  const tempPayload = {
    terms,
    sentences,
    topics: sanitizedTopics,
    blocks,
    subjects,
    quizQuestions,
    quizAttempts,
    books: sanitizedBooks,
    exams,
    mediaAssets,
    userNotes,
    studyStats,
    versionMetadata: resolvedMetadata
  };

  const rawJson = JSON.stringify(tempPayload);
  const summary = buildConciseDataSummary({
    terms,
    sentences,
    topics: sanitizedTopics,
    blocks,
    subjects,
    questions: quizQuestions,
    books: sanitizedBooks,
    exams,
    sourceLabel,
    rawSizeBytes: new Blob([rawJson]).size
  });

  const payload: FullUnifiedBackupPayload = {
    format: 'umed-unified-backup-v2.3',
    exportedAt: summary.timestamp,
    mediaStoragePolicy: 'metadata_and_urls_only',
    summary,
    data: tempPayload
  };

  const jsonString = redactBotTokenFromText(JSON.stringify(payload));
  return { payload, jsonString, summary };
}

function sanitizeTelegramInput(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\s]/g, '')
    .trim();
}

function formatTelegramErrorAr(rawDesc?: string, status?: number, tokenToRedact?: string): string {
  const desc = redactBotTokenFromText(String(rawDesc || '').trim(), tokenToRedact);
  const lower = desc.toLowerCase();
  if (lower.includes('chat not found')) {
    return 'لم يتم العثور على المحادثة أو القناة (Chat ID غير صحيح أو البوت غير مضاف كمشرف في القناة).';
  }
  if (lower.includes('unauthorized') || status === 401) {
    return 'رمز البوت (Bot Token) غير صالح. تأكد من نسخه كاملاً من @BotFather.';
  }
  if (lower.includes('not enough rights') || lower.includes('need administrator rights')) {
    return 'البوت لا يملك صلاحية نشر الرسائل والملفات في القناة. يرجى منحه صلاحية Post Messages.';
  }
  if (lower.includes('bot was kicked') || lower.includes('bot is not a member')) {
    return 'البوت غير موجود في القناة. يرجى إضافة البوت كمشرف (Admin) في القناة أولاً.';
  }
  if (desc) {
    return `خطأ من تليجرام: ${desc}`;
  }
  return status ? `فشل الإرسال إلى تليجرام (رمز الحالة ${status})` : 'تعذر الإرسال إلى تليجرام.';
}

export async function testTelegramConnection(
  botToken: string,
  chatId: string,
  options?: { customFetch?: typeof fetch }
): Promise<{ ok: boolean; message: string }> {
  const cleanToken = decryptBotTokenFromStorage(botToken);
  const cleanChatId = sanitizeTelegramInput(chatId);
  if (!cleanToken || !cleanChatId) {
    return { ok: false, message: 'يرجى إدخال Bot Token و Chat ID أولاً.' };
  }

  // Persist encrypted credentials immediately so they never disappear after clicking Check
  const currentCfg = loadTelegramBackupConfig();
  saveTelegramBackupConfig({
    ...currentCfg,
    botToken: cleanToken,
    chatId: cleanChatId,
    enabled: currentCfg.schedule !== 'off'
  });

  const messageText = '✅ تم ربط تطبيق UMEDT بنجاح لعمل النسخ الاحتياطية التلقائية واليدوية.';
  const fetchFn = options?.customFetch || fetch;

  // Direct client-to-Telegram Bot API call (Token NEVER leaves the device to any intermediate server)
  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: messageText
        })
      }
    );
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        message: formatTelegramErrorAr(data?.description, res.status, cleanToken)
      };
    }
    return {
      ok: true,
      message: 'تم الاتصال وإرسال رسالة تأكيد إلى قناة/محادثة تليجرام وحفظ البيانات بنجاح.'
    };
  } catch (err: unknown) {
    const rawErr = err instanceof Error ? err.message : 'تعذر الوصول إلى خادم تليجرام. تحقق من اتصال الإنترنت.';
    return {
      ok: false,
      message: redactBotTokenFromText(rawErr, cleanToken)
    };
  }
}

export async function computeFileSha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      );
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback to Node crypto below
  }
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
  } catch {
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

function extractBytesFromLocalMediaRecord(record: LocalMediaRecord): Uint8Array | null {
  const raw = String(record?.dataUrl || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const commaIdx = raw.indexOf(',');
    if (commaIdx === -1) return null;
    const header = raw.slice(0, commaIdx);
    const body = raw.slice(commaIdx + 1);
    try {
      if (header.includes(';base64')) {
        return base64ToUint8Array(body);
      }
      return new TextEncoder().encode(decodeURIComponent(body));
    } catch {
      return null;
    }
  }
  return new TextEncoder().encode(raw);
}

/**
 * Uploads any pending local media files (`LocalMediaRecord`) to the Telegram channel
 * with SHA-256 deduplication so identical files are never uploaded twice.
 * IMPORTANT: Uploaded media `message_id`s are stored only in `syncedMediaSha256Map`
 * and NEVER added to `appBackupMessageIds`, so backup rotation never deletes channel media.
 */
export async function uploadPendingMediaToTelegramChannel(
  config: TelegramBackupConfig,
  options?: {
    customFetch?: typeof fetch;
    mediaMapOverride?: Map<string, LocalMediaRecord>;
    skipIfSimulatedOffline?: boolean;
  }
): Promise<{
  ok: boolean;
  message: string;
  uploadedCount: number;
  skippedDeduplicatedCount: number;
  failedCount: number;
  syncedMediaSha256Map: Record<string, TelegramMediaSyncRecord>;
}> {
  const latestSaved = loadTelegramBackupConfig();
  const syncedMap: Record<string, TelegramMediaSyncRecord> = {
    ...(latestSaved.syncedMediaSha256Map || {}),
    ...(config.syncedMediaSha256Map || {})
  };

  if (options?.skipIfSimulatedOffline) {
    return {
      ok: true,
      message: 'تم تخطي مزامنة الوسائط في وضع عدم الاتصال.',
      uploadedCount: 0,
      skippedDeduplicatedCount: 0,
      failedCount: 0,
      syncedMediaSha256Map: syncedMap
    };
  }

  const cleanToken = decryptBotTokenFromStorage(
    config.botToken || config.encryptedBotToken || latestSaved.botToken || latestSaved.encryptedBotToken || ''
  );
  const cleanChatId = sanitizeTelegramInput(config.chatId || latestSaved.chatId || '');
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message: 'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) في إعدادات تليجرام.',
      uploadedCount: 0,
      skippedDeduplicatedCount: 0,
      failedCount: 0,
      syncedMediaSha256Map: syncedMap
    };
  }

  const fetchFn = options?.customFetch || fetch;
  const mediaMap = options?.mediaMapOverride || (await getAllLocalMediaRecordsMap());
  let uploadedCount = 0;
  let skippedDeduplicatedCount = 0;
  let failedCount = 0;
  let lastError = '';

  for (const [key, record] of mediaMap.entries()) {
    const bytes = extractBytesFromLocalMediaRecord(record);
    if (!bytes || bytes.byteLength === 0) continue;

    const sha = await computeFileSha256Hex(bytes);
    if (syncedMap[sha]) {
      skippedDeduplicatedCount += 1;
      continue;
    }

    const fileName = record.fileName || `${key}.bin`;
    const mimeType = record.mimeType || 'application/octet-stream';
    const caption = `📎 وسائط UMEDT (${fileName}) · SHA-256: ${sha.slice(0, 12)}`;

    try {
      const formData = new FormData();
      formData.append('chat_id', cleanChatId);
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
        type: mimeType
      });
      formData.append('document', blob, fileName);
      formData.append('caption', caption);

      const res = await fetchFn(
        `https://api.telegram.org/bot${cleanToken}/sendDocument`,
        {
          method: 'POST',
          body: formData
        }
      );
      const data = await res.json();
      if (res.ok && data?.ok === true && typeof data?.result?.message_id === 'number') {
        syncedMap[sha] = {
          messageId: data.result.message_id,
          fileName,
          uploadedAt: new Date().toISOString()
        };
        uploadedCount += 1;
      } else {
        failedCount += 1;
        lastError = data?.description || `HTTP ${res.status}`;
      }
    } catch (err) {
      failedCount += 1;
      if (err instanceof Error) {
        lastError = err.message;
      }
    }
  }

  saveTelegramBackupConfig({
    ...latestSaved,
    ...config,
    botToken: cleanToken,
    chatId: cleanChatId,
    syncedMediaSha256Map: syncedMap
  });

  if (failedCount > 0 && uploadedCount === 0 && skippedDeduplicatedCount === 0) {
    return {
      ok: false,
      message: formatTelegramErrorAr(lastError, undefined, cleanToken),
      uploadedCount,
      skippedDeduplicatedCount,
      failedCount,
      syncedMediaSha256Map: syncedMap
    };
  }

  return {
    ok: true,
    message:
      uploadedCount > 0
        ? `تم رفع ${uploadedCount} ملف وسائط إلى القناة${
            skippedDeduplicatedCount > 0 ? ` (تخطي ${skippedDeduplicatedCount} مكرر)` : ''
          }.`
        : skippedDeduplicatedCount > 0
          ? `جميع ملفات الوسائط (${skippedDeduplicatedCount}) مرفوعة مسبقاً ولا يوجد تكرار.`
          : 'لا توجد ملفات وسائط محلية جديدة للمزامنة.',
    uploadedCount,
    skippedDeduplicatedCount,
    failedCount,
    syncedMediaSha256Map: syncedMap
  };
}

export async function sendBackupToTelegram(
  config: TelegramBackupConfig,
  terms: DictionaryTerm[],
  sentences: LinkedSentence[],
  topics: TopicArticle[],
  reasonLabel = 'نسخة احتياطية يدوية',
  studyStats?: StudyStats,
  versionMetadata?: VersionMetadata,
  options?: { customFetch?: typeof fetch; simulatedOffline?: boolean }
): Promise<{
  ok: boolean;
  message: string;
  summary?: ConciseDataSummary;
  uploadedMessageId?: number;
  deletedPreviousMessageIds?: number[];
  mediaSyncResult?: {
    uploadedCount: number;
    skippedDeduplicatedCount: number;
    failedCount: number;
  };
}> {
  const latestSaved = loadTelegramBackupConfig();
  const cleanToken = decryptBotTokenFromStorage(
    config.botToken || config.encryptedBotToken || latestSaved.botToken || latestSaved.encryptedBotToken || ''
  );
  const cleanChatId = sanitizeTelegramInput(config.chatId || latestSaved.chatId || '');
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message:
        'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) في إعدادات تليجرام.'
    };
  }
  if (options?.simulatedOffline) {
    return {
      ok: false,
      message: 'الوضع الأوفلاين مفعل؛ تعذر إرسال النسخة الاحتياطية إلى تليجرام حالياً.'
    };
  }

  const mergedConfig = saveTelegramBackupConfig({
    ...latestSaved,
    ...config,
    botToken: cleanToken,
    chatId: cleanChatId
  });

  const fetchFn = options?.customFetch || fetch;

  try {
    const filteredTerms = mergedConfig.includeDictionaryAndTerms ? terms : [];
    const filteredSentences = mergedConfig.includeDictionaryAndTerms ? sentences : [];
    const filteredTopics = mergedConfig.includeTopicsAndHierarchy ? topics : [];

    const { jsonString, summary } = createUnifiedBackupPackage(
      filteredTerms,
      filteredSentences,
      filteredTopics,
      reasonLabel,
      studyStats,
      versionMetadata
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `UMEDT-Backup-${dateStr}.json`;
    const captionLines = [
      `📦 نسخة احتياطية UMEDT (${reasonLabel})`,
      `📋 تعريف البيانات: ${summary.shortText}`,
      `⭐ المفضلة: ${summary.favoritesCount} · الحجم: ${summary.sizeKB} KB`,
      `🕒 التاريخ: ${new Date(summary.timestamp).toLocaleString('ar-SA')}`
    ];
    const caption = captionLines.join('\n');

    let sentSuccessfully = false;
    let uploadedMessageId: number | undefined;
    let lastErrorDescription = '';

    // 1. Direct Telegram Bot API sendDocument upload (Token stays strictly inside client app)
    try {
      const formData = new FormData();
      formData.append('chat_id', cleanChatId);
      try {
        const fileObj = new File([jsonString], filename, { type: 'application/json' });
        formData.append('document', fileObj, filename);
      } catch {
        const blob = new Blob([jsonString], { type: 'application/json' });
        formData.append('document', blob, filename);
      }
      formData.append('caption', caption);

      const res = await fetchFn(
        `https://api.telegram.org/bot${cleanToken}/sendDocument`,
        {
          method: 'POST',
          body: formData
        }
      );

      const data = await res.json();
      // Verify upload succeeded and returned a valid message_id
      if (res.ok && data?.ok === true && typeof data?.result?.message_id === 'number') {
        sentSuccessfully = true;
        uploadedMessageId = data.result.message_id;
      } else {
        lastErrorDescription =
          data?.description || lastErrorDescription || `HTTP ${res.status}`;
      }
    } catch (directErr) {
      if (!lastErrorDescription && directErr instanceof Error) {
        lastErrorDescription = directErr.message;
      }
    }

    // 2. Smart fallback for slow mobile connections:
    const isAuthOrChatError =
      /unauthorized|chat not found|not enough rights|bot was kicked|bot is not a member/i.test(
        lastErrorDescription
      );
    if (!sentSuccessfully && !isAuthOrChatError) {
      const compactTerms = filteredTerms.filter(
        (t) =>
          t.favorite ||
          (t.collections && t.collections.length > 0) ||
          Boolean(t.lastStudiedAt) ||
          t.id.startsWith('custom-') ||
          t.id.startsWith('topic-term-') ||
          t.id.startsWith('imp-')
      );
      const compactSentences = filteredSentences.filter(
        (s) => s.favorite || s.id.startsWith('sent-topic-') || s.id.startsWith('custom-')
      );
      const compactPkg = createUnifiedBackupPackage(
        compactTerms,
        compactSentences,
        filteredTopics,
        `${reasonLabel} — مضغوط للشبكات الضعيفة`,
        studyStats,
        versionMetadata
      );

      try {
        const compactForm = new FormData();
        compactForm.append('chat_id', cleanChatId);
        const compactBlob = new Blob([compactPkg.jsonString], { type: 'application/json' });
        compactForm.append('document', compactBlob, filename);
        compactForm.append('caption', caption);
        const compactRes = await fetchFn(
          `https://api.telegram.org/bot${cleanToken}/sendDocument`,
          {
            method: 'POST',
            body: compactForm
          }
        );
        const compactData = await compactRes.json();
        if (
          compactRes.ok &&
          compactData?.ok === true &&
          typeof compactData?.result?.message_id === 'number'
        ) {
          sentSuccessfully = true;
          uploadedMessageId = compactData.result.message_id;
        } else if (compactData?.description) {
          lastErrorDescription = compactData.description;
        }
      } catch {
        // ignore
      }
    }

    // Requirement #2: Do NOT delete previous backup if the new upload failed or wasn't verified!
    if (!sentSuccessfully || typeof uploadedMessageId !== 'number') {
      return {
        ok: false,
        message: formatTelegramErrorAr(lastErrorDescription, undefined, cleanToken)
      };
    }

    // Requirement #2: Only AFTER the new backup is uploaded and verified, delete previous app-created backup(s)
    // while NEVER deleting media messages or other messages in the channel.
    const previousAppBackupIds = Array.from(
      new Set([
        ...(mergedConfig.appBackupMessageIds || []),
        ...(typeof mergedConfig.lastBackupMessageId === 'number'
          ? [mergedConfig.lastBackupMessageId]
          : [])
      ])
    ).filter((msgId) => typeof msgId === 'number' && msgId > 0 && msgId !== uploadedMessageId);

    const deletedPreviousMessageIds: number[] = [];
    for (const oldMessageId of previousAppBackupIds) {
      try {
        const delRes = await fetchFn(
          `https://api.telegram.org/bot${cleanToken}/deleteMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cleanChatId,
              message_id: oldMessageId
            })
          }
        );
        const delData = await delRes.json();
        if (delRes.ok && delData?.ok === true) {
          deletedPreviousMessageIds.push(oldMessageId);
        }
      } catch {
        // Ignore deletion failure for already-removed message
      }
    }

    // Keep only the single newest backup message_id recorded
    const updatedConfig: TelegramBackupConfig = {
      ...loadTelegramBackupConfig(),
      ...mergedConfig,
      botToken: cleanToken,
      chatId: cleanChatId,
      lastBackupAt: summary.timestamp,
      lastBackupSummary: summary,
      lastBackupMessageId: uploadedMessageId,
      appBackupMessageIds: [uploadedMessageId]
    };
    saveTelegramBackupConfig(updatedConfig);

    let mediaSyncResult:
      | { uploadedCount: number; skippedDeduplicatedCount: number; failedCount: number }
      | undefined;
    if (updatedConfig.includeMediaFilesOnSync !== false && !options?.simulatedOffline) {
      try {
        const mediaRes = await uploadPendingMediaToTelegramChannel(updatedConfig, {
          customFetch: fetchFn
        });
        mediaSyncResult = {
          uploadedCount: mediaRes.uploadedCount,
          skippedDeduplicatedCount: mediaRes.skippedDeduplicatedCount,
          failedCount: mediaRes.failedCount
        };
      } catch {
        // Keep JSON backup success intact even if media sync encounters an error
      }
    }

    return {
      ok: true,
      message: `تم إرسال ملف النسخة الاحتياطية (${filename}) إلى تليجرام بنجاح والاحتفاظ بنسخة حديثة واحدة.${
        mediaSyncResult && mediaSyncResult.uploadedCount > 0
          ? ` (+ رفع ${mediaSyncResult.uploadedCount} وسائط)`
          : ''
      }`,
      summary,
      uploadedMessageId,
      deletedPreviousMessageIds,
      mediaSyncResult
    };
  } catch (err: unknown) {
    const rawMsg =
      err instanceof Error
        ? err.message
        : 'حدث خطأ أثناء رفع النسخة الاحتياطية إلى تليجرام.';
    return {
      ok: false,
      message: redactBotTokenFromText(rawMsg, cleanToken)
    };
  }
}

// ============================================================================
// DEBOUNCED AUTOMATIC TELEGRAM SYNC ON TOPIC / SUBJECT / BLOCK CHANGE (Req #1)
// ============================================================================

let pendingAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoSyncReasons: string[] = [];
let pendingAutoSyncContext: {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  studyStats?: StudyStats;
  versionMetadata?: VersionMetadata;
  customFetch?: typeof fetch;
  onComplete?: (res: {
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
    uploadedMessageId?: number;
    deletedPreviousMessageIds?: number[];
  }) => void;
} | null = null;

/**
 * Schedules a debounced automatic full-backup sync to the configured Telegram channel
 * whenever a Topic, Subject, or Block is added or modified.
 * Batches closely-spaced edits into a single upload.
 */
export function scheduleDebouncedTelegramAutoSync(params: {
  reason?: string;
  triggerReason?: string;
  terms?: DictionaryTerm[];
  getTerms?: () => DictionaryTerm[];
  sentences?: LinkedSentence[];
  getSentences?: () => LinkedSentence[];
  topics?: TopicArticle[];
  getTopics?: () => TopicArticle[];
  studyStats?: StudyStats;
  getStudyStats?: () => StudyStats;
  versionMetadata?: VersionMetadata;
  getVersionMetadata?: () => VersionMetadata;
  debounceMs?: number;
  customFetch?: typeof fetch;
  onComplete?: (res: {
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
    uploadedMessageId?: number;
    deletedPreviousMessageIds?: number[];
  }) => void;
  onSyncCompleted?: (res: {
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
    uploadedMessageId?: number;
    deletedPreviousMessageIds?: number[];
  }) => void;
}): void {
  const cfg = loadTelegramBackupConfig();
  const cleanToken = decryptBotTokenFromStorage(cfg.botToken || cfg.encryptedBotToken || '');
  const cleanChatId = sanitizeTelegramInput(cfg.chatId);
  if (!cleanToken || !cleanChatId || cfg.schedule === 'off') {
    return;
  }

  const resolvedReason = params.reason || params.triggerReason || 'تحديث المحتوى';
  if (resolvedReason && !pendingAutoSyncReasons.includes(resolvedReason)) {
    pendingAutoSyncReasons.push(resolvedReason);
  }

  pendingAutoSyncContext = {
    terms: params.getTerms ? params.getTerms() : params.terms || [],
    sentences: params.getSentences ? params.getSentences() : params.sentences || [],
    topics: params.getTopics ? params.getTopics() : params.topics || [],
    studyStats: params.getStudyStats ? params.getStudyStats() : params.studyStats,
    versionMetadata: params.getVersionMetadata
      ? params.getVersionMetadata()
      : params.versionMetadata,
    customFetch: params.customFetch,
    onComplete: params.onComplete || params.onSyncCompleted
  };

  if (pendingAutoSyncTimer) {
    clearTimeout(pendingAutoSyncTimer);
  }

  const delay = typeof params.debounceMs === 'number' ? params.debounceMs : 2500;
  pendingAutoSyncTimer = setTimeout(() => {
    void flushPendingTelegramAutoSync();
  }, delay);
}

/**
 * Immediately executes any pending debounced Telegram auto-sync batch.
 */
export async function flushPendingTelegramAutoSync(): Promise<{
  ok: boolean;
  executed: boolean;
  batchedReasons: string[];
  result?: {
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
    uploadedMessageId?: number;
    deletedPreviousMessageIds?: number[];
  };
}> {
  if (pendingAutoSyncTimer) {
    clearTimeout(pendingAutoSyncTimer);
    pendingAutoSyncTimer = null;
  }

  const ctx = pendingAutoSyncContext;
  const reasons = [...pendingAutoSyncReasons];
  pendingAutoSyncContext = null;
  pendingAutoSyncReasons = [];

  if (!ctx) {
    return { ok: false, executed: false, batchedReasons: [] };
  }

  const cfg = loadTelegramBackupConfig();
  const combinedLabel =
    reasons.length > 1
      ? `مزامنة تلقائية مجمعة (${reasons.length} تعديلات: ${reasons.slice(0, 2).join(' + ')})`
      : reasons[0] || 'مزامنة تلقائية عند تحديث المحتوى';

  const result = await sendBackupToTelegram(
    cfg,
    ctx.terms,
    ctx.sentences,
    ctx.topics,
    combinedLabel,
    ctx.studyStats,
    ctx.versionMetadata,
    { customFetch: ctx.customFetch }
  );

  ctx.onComplete?.(result);
  return {
    ok: result.ok,
    executed: true,
    batchedReasons: reasons,
    result
  };
}

export function isTelegramScheduledBackupDue(
  config: TelegramBackupConfig
): boolean {
  const token = decryptBotTokenFromStorage(config.botToken || config.encryptedBotToken || '');
  if (!config.enabled || !token.trim() || !config.chatId.trim()) {
    return false;
  }
  if (config.schedule === 'off' || config.schedule === 'on_change') {
    return false;
  }
  if (!config.lastBackupAt) {
    return true;
  }

  const lastMs = new Date(config.lastBackupAt).getTime();
  if (Number.isNaN(lastMs)) return true;

  const elapsedHours = (Date.now() - lastMs) / (1000 * 60 * 60);
  if (config.schedule === '6h') return elapsedHours >= 6;
  if (config.schedule === 'daily') return elapsedHours >= 24;
  if (config.schedule === 'weekly') return elapsedHours >= 24 * 7;
  return false;
}

export const SCHEDULE_LABELS_AR: Record<TelegramBackupSchedule, string> = {
  off: 'يدوي فقط (إيقاف النسخ الدوري)',
  '6h': 'كل 6 ساعات تلقائياً',
  daily: 'يومياً تلقائياً',
  weekly: 'أسبوعياً تلقائياً',
  on_change: 'تلقائياً عند إضافة أو تعديل البيانات'
};
