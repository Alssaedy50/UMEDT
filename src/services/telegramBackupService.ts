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
  UserStudyNoteRecord,
  MorphologicalAffix,
  ClinicalAbbreviation,
  DataPackagePayload
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
import {
  APP_VERSION,
  DB_SCHEMA_VERSION,
  buildDataPackageZipBytes,
  createDefaultVersionMetadata
} from './dataPlatformService';

export type TelegramBackupSchedule =
  | 'off'
  | '1h'
  | '6h'
  | '12h'
  | 'daily'
  | 'weekly'
  | 'custom_hours'
  | 'on_change';

export type TelegramBackupMode =
  | 'single_complete_file'
  | 'with_separate_media'
  | 'notes_and_scheduled_full';

export type TelegramBackupFileFormat = 'json' | 'zip';

export type TelegramChangeAction = 'add' | 'update' | 'delete' | 'import';

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
  backupMode?: TelegramBackupMode;
  backupFileFormat?: TelegramBackupFileFormat;
  sendInstantChangeNotes?: boolean;
  customIntervalHours?: number;
  includeTopicsAndHierarchy: boolean;
  includeDictionaryAndTerms: boolean;
  includeQuizzesAndStats: boolean;
  includeMediaFilesOnSync?: boolean;
  syncedMediaSha256Map?: Record<string, TelegramMediaSyncRecord>;
  lastBackupAt?: string;
  lastBackupSummary?: ConciseDataSummary;
  lastBackupMessageId?: number;
  lastBackupFileId?: string;
  lastBackupFileName?: string;
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
  schedule: 'daily',
  backupMode: 'single_complete_file',
  backupFileFormat: 'json',
  sendInstantChangeNotes: true,
  customIntervalHours: 4,
  includeTopicsAndHierarchy: true,
  includeDictionaryAndTerms: true,
  includeQuizzesAndStats: true,
  includeMediaFilesOnSync: false,
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

    const backupMode: TelegramBackupMode =
      parsedFull.backupMode ||
      parsedCreds.backupMode ||
      memoryTelegramConfig?.backupMode ||
      'single_complete_file';

    const includeMediaFilesOnSync =
      backupMode === 'with_separate_media'
        ? true
        : parsedFull.backupMode || parsedCreds.backupMode
          ? false
          : false;

    const backupFileFormat: TelegramBackupFileFormat =
      parsedFull.backupFileFormat ||
      parsedCreds.backupFileFormat ||
      memoryTelegramConfig?.backupFileFormat ||
      'json';

    const sendInstantChangeNotes =
      typeof parsedFull.sendInstantChangeNotes === 'boolean'
        ? parsedFull.sendInstantChangeNotes
        : typeof parsedCreds.sendInstantChangeNotes === 'boolean'
          ? parsedCreds.sendInstantChangeNotes
          : memoryTelegramConfig?.sendInstantChangeNotes ?? true;

    const customIntervalHoursRaw =
      typeof parsedFull.customIntervalHours === 'number'
        ? parsedFull.customIntervalHours
        : typeof parsedCreds.customIntervalHours === 'number'
          ? parsedCreds.customIntervalHours
          : memoryTelegramConfig?.customIntervalHours ?? 4;
    const customIntervalHours = Math.max(0.25, Math.min(720, customIntervalHoursRaw));

    const resolved: TelegramBackupConfig = {
      ...DEFAULT_CONFIG,
      ...memoryTelegramConfig,
      ...parsedCreds,
      ...parsedFull,
      botToken: decryptedToken,
      encryptedBotToken: decryptedToken ? encryptBotTokenForStorage(decryptedToken) : '',
      chatId,
      schedule,
      backupMode,
      backupFileFormat,
      sendInstantChangeNotes,
      customIntervalHours,
      includeMediaFilesOnSync,
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
  const schedule = config.schedule || previous.schedule || 'daily';
  const hasCredentials = Boolean(plainToken.trim() && chatId.trim());

  const resolvedBackupMode: TelegramBackupMode =
    config.backupMode !== undefined
      ? config.backupMode
      : config.includeMediaFilesOnSync === true && config.backupMode === undefined
        ? 'with_separate_media'
        : config.includeMediaFilesOnSync === false
          ? previous.backupMode === 'notes_and_scheduled_full'
            ? 'notes_and_scheduled_full'
            : 'single_complete_file'
          : previous.backupMode || 'single_complete_file';

  const resolvedIncludeMedia =
    resolvedBackupMode === 'with_separate_media'
      ? config.includeMediaFilesOnSync !== false
      : false;

  const resolvedFormat: TelegramBackupFileFormat =
    config.backupFileFormat || previous.backupFileFormat || 'json';

  const resolvedInstantNotes =
    typeof config.sendInstantChangeNotes === 'boolean'
      ? config.sendInstantChangeNotes
      : typeof previous.sendInstantChangeNotes === 'boolean'
        ? previous.sendInstantChangeNotes
        : true;

  const resolvedCustomHours = Math.max(
    0.25,
    Math.min(
      720,
      typeof config.customIntervalHours === 'number' && !Number.isNaN(config.customIntervalHours)
        ? config.customIntervalHours
        : previous.customIntervalHours || 4
    )
  );

  const lastBackupMessageId =
    typeof config.lastBackupMessageId === 'number'
      ? config.lastBackupMessageId
      : previous.lastBackupMessageId;

  const appBackupMessageIds = Array.from(
    new Set([
      ...(Array.isArray(config.appBackupMessageIds)
        ? config.appBackupMessageIds
        : previous.appBackupMessageIds || []),
      ...(typeof lastBackupMessageId === 'number' ? [lastBackupMessageId] : [])
    ])
  );

  const normalized: TelegramBackupConfig = {
    ...DEFAULT_CONFIG,
    ...previous,
    ...config,
    botToken: plainToken,
    encryptedBotToken,
    chatId,
    schedule,
    backupMode: resolvedBackupMode,
    backupFileFormat: resolvedFormat,
    sendInstantChangeNotes: resolvedInstantNotes,
    customIntervalHours: resolvedCustomHours,
    includeMediaFilesOnSync: resolvedIncludeMedia,
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
    backupMode: normalized.backupMode,
    backupFileFormat: normalized.backupFileFormat,
    sendInstantChangeNotes: normalized.sendInstantChangeNotes,
    customIntervalHours: normalized.customIntervalHours,
    includeTopicsAndHierarchy: normalized.includeTopicsAndHierarchy,
    includeDictionaryAndTerms: normalized.includeDictionaryAndTerms,
    includeQuizzesAndStats: normalized.includeQuizzesAndStats,
    includeMediaFilesOnSync: normalized.includeMediaFilesOnSync === true,
    syncedMediaSha256Map,
    lastBackupAt: normalized.lastBackupAt,
    lastBackupMessageId: normalized.lastBackupMessageId,
    lastBackupFileId: normalized.lastBackupFileId,
    lastBackupFileName: normalized.lastBackupFileName,
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
    customAffixes?: MorphologicalAffix[];
    customAbbreviations?: ClinicalAbbreviation[];
    studyStats?: StudyStats;
    versionMetadata: VersionMetadata;
  };
}

export function stripBinaryMediaFromBooksForBackup(books: AcademicBookResource[]): AcademicBookResource[] {
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

function readPersistedAffixesAndAbbreviations(): {
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
} {
  try {
    const rawAffixes = readRawFromStorage('dictengine_umd_affixes_v1');
    const rawAbbr = readRawFromStorage('dictengine_umd_abbreviations_v1');
    const customAffixes = rawAffixes ? (JSON.parse(rawAffixes) as MorphologicalAffix[]) : [];
    const customAbbreviations = rawAbbr ? (JSON.parse(rawAbbr) as ClinicalAbbreviation[]) : [];
    return {
      customAffixes: Array.isArray(customAffixes) ? customAffixes : [],
      customAbbreviations: Array.isArray(customAbbreviations) ? customAbbreviations : []
    };
  } catch {
    return { customAffixes: [], customAbbreviations: [] };
  }
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
  const { customAffixes, customAbbreviations } = readPersistedAffixesAndAbbreviations();
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
    customAffixes,
    customAbbreviations,
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

export function createUnifiedZipBackupBytes(
  terms: DictionaryTerm[],
  sentences: LinkedSentence[],
  topics: TopicArticle[],
  sourceLabel = 'نسخة احتياطية كاملة (ZIP)',
  studyStats?: StudyStats,
  versionMetadata?: VersionMetadata
): {
  zipBytes: Uint8Array;
  summary: ConciseDataSummary;
} {
  const { payload, summary } = createUnifiedBackupPackage(
    terms,
    sentences,
    topics,
    sourceLabel,
    studyStats,
    versionMetadata
  );

  const meta = payload.data.versionMetadata;
  const dataPkg: DataPackagePayload = {
    manifest: {
      packageId: meta.packageId || `umedt-tg-zip-${Date.now()}`,
      dataVersion: meta.dataVersion || '2026.10.0-umd',
      minAppVersion: APP_VERSION,
      schemaVersion: DB_SCHEMA_VERSION,
      releasedAt: summary.timestamp,
      channel: meta.remoteChannel || 'stable',
      packageFormat: 'umedt-unified-zip-v2',
      counts: {
        terms: payload.data.terms.length,
        sentences: payload.data.sentences.length,
        topics: payload.data.topics.length,
        affixes: (payload.data.customAffixes || []).length,
        abbreviations: (payload.data.customAbbreviations || []).length
      },
      extendedCounts: {
        blocks: payload.data.blocks.length,
        subjects: payload.data.subjects.length,
        topics: payload.data.topics.length,
        terms: payload.data.terms.length,
        sentences: payload.data.sentences.length,
        books: (payload.data.books || []).length,
        questions: payload.data.quizQuestions.length,
        quizAttempts: payload.data.quizAttempts.length,
        exams: (payload.data.exams || []).length,
        mediaAssets: (payload.data.mediaAssets || []).length,
        userNotes: (payload.data.userNotes || []).length
      }
    },
    terms: payload.data.terms,
    sentences: payload.data.sentences,
    topics: payload.data.topics,
    customAffixes: payload.data.customAffixes || [],
    customAbbreviations: payload.data.customAbbreviations || [],
    blocks: payload.data.blocks,
    subjects: payload.data.subjects,
    books: payload.data.books || [],
    questions: payload.data.quizQuestions,
    quizAttempts: payload.data.quizAttempts,
    exams: payload.data.exams || [],
    mediaAssets: payload.data.mediaAssets || [],
    userNotes: payload.data.userNotes || [],
    studyStats: payload.data.studyStats
  };

  const zipBytes = buildDataPackageZipBytes(dataPkg);
  return {
    zipBytes,
    summary: {
      ...summary,
      sizeKB: Math.max(1, Math.round((zipBytes.byteLength / 1024) * 10) / 10)
    }
  };
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
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable in this environment; refusing to use a non-cryptographic fallback.');
  }

  const digest = await subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

    const useZipFormat = mergedConfig.backupFileFormat === 'zip';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = useZipFormat
      ? `UMEDT-Backup-${dateStr}.zip`
      : `UMEDT-Backup-${dateStr}.json`;

    let summary: ConciseDataSummary;
    let jsonString = '';
    let zipBytes: Uint8Array | null = null;

    if (useZipFormat) {
      const zipPkg = createUnifiedZipBackupBytes(
        filteredTerms,
        filteredSentences,
        filteredTopics,
        reasonLabel,
        studyStats,
        versionMetadata
      );
      zipBytes = zipPkg.zipBytes;
      summary = zipPkg.summary;
    } else {
      const jsonPkg = createUnifiedBackupPackage(
        filteredTerms,
        filteredSentences,
        filteredTopics,
        reasonLabel,
        studyStats,
        versionMetadata
      );
      jsonString = jsonPkg.jsonString;
      summary = jsonPkg.summary;
    }

    const mediaPolicyLabel =
      mergedConfig.backupMode === 'with_separate_media'
        ? 'ملف شامل + مزامنة الوسائط منفصلة'
        : 'ملف واحد شامل (روابط الوسائط فقط)';

    const captionLines = [
      `📦 نسخة احتياطية UMEDT (${reasonLabel})`,
      `🗂️ النمط: ${mediaPolicyLabel}`,
      `📋 تعريف البيانات: ${summary.shortText}`,
      `⭐ المفضلة: ${summary.favoritesCount} · الحجم: ${summary.sizeKB} KB`,
      `🕒 التاريخ: ${new Date(summary.timestamp).toLocaleString('ar-SA')}`,
      `♻️ قابلة للاستيراد والدمج مباشرة من داخل التطبيق أو عبر رفع الملف.`
    ];
    const caption = captionLines.join('\n');

    let sentSuccessfully = false;
    let uploadedMessageId: number | undefined;
    let uploadedFileId: string | undefined;
    let lastErrorDescription = '';

    // 1. Direct Telegram Bot API sendDocument upload (Token stays strictly inside client app)
    try {
      const formData = new FormData();
      formData.append('chat_id', cleanChatId);
      const mimeType = useZipFormat ? 'application/zip' : 'application/json';
      const payloadData = zipBytes
        ? zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer
        : jsonString;
      try {
        const fileObj = new File([payloadData], filename, { type: mimeType });
        formData.append('document', fileObj, filename);
      } catch {
        const blob = new Blob([payloadData], { type: mimeType });
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
        uploadedFileId = data.result?.document?.file_id;
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
    if (!sentSuccessfully && !isAuthOrChatError && !useZipFormat) {
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
          uploadedFileId = compactData.result?.document?.file_id;
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
    // while NEVER deleting media messages, change notes, shared interactive files, or other messages in the channel.
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
      lastBackupFileId: uploadedFileId || mergedConfig.lastBackupFileId,
      lastBackupFileName: filename,
      appBackupMessageIds: [uploadedMessageId]
    };
    saveTelegramBackupConfig(updatedConfig);

    // Strictly respect backupMode: ONLY upload separate binary media files if user chose 'with_separate_media'
    // (or explicitly passed includeMediaFilesOnSync: true with undefined backupMode)
    const shouldUploadSeparateMedia =
      updatedConfig.backupMode === 'with_separate_media' &&
      updatedConfig.includeMediaFilesOnSync === true &&
      !options?.simulatedOffline;

    let mediaSyncResult:
      | { uploadedCount: number; skippedDeduplicatedCount: number; failedCount: number }
      | undefined;
    if (shouldUploadSeparateMedia) {
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
        // Keep unified backup success intact even if media sync encounters an error
      }
    }

    return {
      ok: true,
      message: `تم إرسال ملف النسخة الشاملة (${filename}) إلى تليجرام بنجاح والاحتفاظ بنسخة حديثة واحدة.${
        mediaSyncResult && mediaSyncResult.uploadedCount > 0
          ? ` (+ رفع ${mediaSyncResult.uploadedCount} وسائط منفصلة)`
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
// INSTANT CHANNEL CHANGE NOTES ON UPDATE / ADDITION / DELETION
// ============================================================================

export interface TelegramChangeNoteEntry {
  action: TelegramChangeAction;
  label: string;
}

const ACTION_BADGE_MAP: Record<TelegramChangeAction, string> = {
  add: '➕ إضافة',
  update: '✏️ تحديث',
  delete: '🗑️ حذف',
  import: '📥 استيراد'
};

let pendingChangeNotesTimer: ReturnType<typeof setTimeout> | null = null;
let pendingChangeNoteEntries: TelegramChangeNoteEntry[] = [];
let pendingChangeNotesContext: {
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  getTerms?: () => DictionaryTerm[];
  getSentences?: () => LinkedSentence[];
  getTopics?: () => TopicArticle[];
  customFetch?: typeof fetch;
  onNoteSent?: (res: { ok: boolean; messageId?: number }) => void;
} | null = null;

/**
 * Publishes an immediate change note to the configured Telegram channel
 * WITHOUT deleting any backups or sending redundant files.
 */
export async function sendChangeNotesToTelegram(
  config: TelegramBackupConfig,
  entries: TelegramChangeNoteEntry[],
  summaryContext?: {
    terms?: DictionaryTerm[];
    sentences?: LinkedSentence[];
    topics?: TopicArticle[];
  },
  options?: { customFetch?: typeof fetch; simulatedOffline?: boolean }
): Promise<{ ok: boolean; messageId?: number; message: string }> {
  if (!entries || entries.length === 0) {
    return { ok: false, message: 'لا توجد تغييرات لإرسالها.' };
  }
  if (options?.simulatedOffline) {
    return { ok: false, message: 'تم تأجيل النوتة في وضع عدم الاتصال.' };
  }
  const latestSaved = loadTelegramBackupConfig();
  const cleanToken = decryptBotTokenFromStorage(
    config.botToken || config.encryptedBotToken || latestSaved.botToken || latestSaved.encryptedBotToken || ''
  );
  const cleanChatId = sanitizeTelegramInput(config.chatId || latestSaved.chatId || '');
  if (!cleanToken || !cleanChatId) {
    return { ok: false, message: 'إعدادات تليجرام غير مكتملة.' };
  }

  const uniqueEntries: TelegramChangeNoteEntry[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const k = `${e.action}:${e.label}`.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniqueEntries.push(e);
  }

  const lines = [
    `📝 نوتة تحديث فورية — UMEDT`,
    ...uniqueEntries.slice(0, 12).map((e) => `• ${ACTION_BADGE_MAP[e.action] || '✏️'} ${e.label}`),
    ...(uniqueEntries.length > 12 ? [`• ... و ${uniqueEntries.length - 12} تعديلات إضافية`] : [])
  ];

  if (summaryContext) {
    const summary = buildConciseDataSummary({
      terms: summaryContext.terms,
      sentences: summaryContext.sentences,
      topics: summaryContext.topics
    });
    lines.push(`📊 الملخص الحالي: ${summary.shortText}`);
  }
  lines.push(`🕒 ${new Date().toLocaleString('ar-SA')}`);

  const fetchFn = options?.customFetch || fetch;
  try {
    const res = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: redactBotTokenFromText(lines.join('\n'), cleanToken),
          disable_notification: true
        })
      }
    );
    const data = await res.json();
    if (res.ok && data?.ok === true) {
      return {
        ok: true,
        messageId: data?.result?.message_id,
        message: 'تم نشر نوتة التحديث في قناة تليجرام.'
      };
    }
    return {
      ok: false,
      message: formatTelegramErrorAr(data?.description, res.status, cleanToken)
    };
  } catch (err) {
    return {
      ok: false,
      message: redactBotTokenFromText(
        err instanceof Error ? err.message : 'تعذر إرسال نوتة التحديث.',
        cleanToken
      )
    };
  }
}

export function scheduleDebouncedTelegramChangeNote(params: {
  action: TelegramChangeAction;
  label: string;
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  getTerms?: () => DictionaryTerm[];
  getSentences?: () => LinkedSentence[];
  getTopics?: () => TopicArticle[];
  debounceMs?: number;
  customFetch?: typeof fetch;
  simulatedOffline?: boolean;
  onNoteSent?: (res: { ok: boolean; messageId?: number }) => void;
}): void {
  if (params.simulatedOffline) return;
  const cfg = loadTelegramBackupConfig();
  if (cfg.sendInstantChangeNotes === false) return;
  const cleanToken = decryptBotTokenFromStorage(cfg.botToken || cfg.encryptedBotToken || '');
  const cleanChatId = sanitizeTelegramInput(cfg.chatId);
  if (!cleanToken || !cleanChatId) return;

  pendingChangeNoteEntries.push({
    action: params.action,
    label: params.label
  });

  pendingChangeNotesContext = {
    terms: params.terms,
    sentences: params.sentences,
    topics: params.topics,
    getTerms: params.getTerms,
    getSentences: params.getSentences,
    getTopics: params.getTopics,
    customFetch: params.customFetch,
    onNoteSent: params.onNoteSent
  };

  if (pendingChangeNotesTimer) {
    clearTimeout(pendingChangeNotesTimer);
  }
  const delay = typeof params.debounceMs === 'number' ? params.debounceMs : 1800;
  pendingChangeNotesTimer = setTimeout(() => {
    void flushPendingTelegramChangeNotes();
  }, delay);
}

export async function flushPendingTelegramChangeNotes(): Promise<{
  ok: boolean;
  executed: boolean;
  sentCount: number;
  messageId?: number;
}> {
  if (pendingChangeNotesTimer) {
    clearTimeout(pendingChangeNotesTimer);
    pendingChangeNotesTimer = null;
  }
  const entries = [...pendingChangeNoteEntries];
  const ctx = pendingChangeNotesContext;
  pendingChangeNoteEntries = [];
  pendingChangeNotesContext = null;

  if (!ctx || entries.length === 0) {
    return { ok: false, executed: false, sentCount: 0 };
  }

  const cfg = loadTelegramBackupConfig();
  const res = await sendChangeNotesToTelegram(
    cfg,
    entries,
    {
      terms: ctx.getTerms ? ctx.getTerms() : ctx.terms,
      sentences: ctx.getSentences ? ctx.getSentences() : ctx.sentences,
      topics: ctx.getTopics ? ctx.getTopics() : ctx.topics
    },
    { customFetch: ctx.customFetch }
  );
  ctx.onNoteSent?.({ ok: res.ok, messageId: res.messageId });
  return {
    ok: res.ok,
    executed: true,
    sentCount: entries.length,
    messageId: res.messageId
  };
}

// ============================================================================
// DIRECT IN-APP RESTORE / MERGE FROM TELEGRAM & INTERACTIVE FILE SHARING
// ============================================================================

async function fetchTelegramBinaryViaNativeOrFetch(
  fileUrl: string,
  customFetch?: typeof fetch
): Promise<Uint8Array> {
  if (typeof window !== 'undefined') {
    const w = window as unknown as {
      UMEDNativeDownloader?: {
        fetchRemoteUrlBase64?: (url: string) => string;
      };
    };
    if (
      w.UMEDNativeDownloader &&
      typeof w.UMEDNativeDownloader.fetchRemoteUrlBase64 === 'function'
    ) {
      const rawRes = w.UMEDNativeDownloader.fetchRemoteUrlBase64(fileUrl);
      const parsed = JSON.parse(rawRes) as {
        ok?: boolean;
        base64?: string;
        error?: string;
      };
      if (parsed.ok && parsed.base64) {
        return base64ToUint8Array(parsed.base64);
      }
    }
  }

  const fetchFn = customFetch || fetch;
  const res = await fetchFn(fileUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

function normalizeChatIdMatch(a: string | number | undefined, b: string | number | undefined): boolean {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  if (!sa || !sb) return false;
  return sa === sb;
}

function isUmedtBackupDocument(doc?: { file_name?: string; file_id?: string }): boolean {
  if (!doc || !doc.file_id) return false;
  const name = (doc.file_name || '').toLowerCase();
  return (
    name.includes('umedt-backup') ||
    name.includes('umed2-data-package') ||
    name.includes('dictengine-umd') ||
    name.endsWith('.json') ||
    name.endsWith('.zip')
  );
}

/**
 * Discovers the latest importable UMEDT backup (.json or .zip) from the configured Telegram channel
 * (checking pinned message, recent channel updates, and saved file_id) and downloads its bytes directly
 * so it can be imported/merged inside the app without losing user progress.
 */
export async function fetchLatestBackupPayloadFromTelegram(
  config?: Partial<TelegramBackupConfig>,
  options?: { customFetch?: typeof fetch; simulatedOffline?: boolean }
): Promise<{
  ok: boolean;
  bytes?: Uint8Array;
  fileName?: string;
  format?: 'json' | 'zip';
  message: string;
  discoveredMessageId?: number;
}> {
  if (options?.simulatedOffline) {
    return {
      ok: false,
      message: 'الوضع الأوفلاين مفعل؛ لا يمكن الجلب من تليجرام حالياً.'
    };
  }
  const latestSaved = loadTelegramBackupConfig();
  const cleanToken = decryptBotTokenFromStorage(
    config?.botToken ||
      config?.encryptedBotToken ||
      latestSaved.botToken ||
      latestSaved.encryptedBotToken ||
      ''
  );
  const cleanChatId = sanitizeTelegramInput(config?.chatId || latestSaved.chatId || '');
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message: 'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة/القناة (Chat ID) أولاً.'
    };
  }

  const fetchFn = options?.customFetch || fetch;
  let candidateFileId = config?.lastBackupFileId || latestSaved.lastBackupFileId || '';
  let candidateFileName =
    config?.lastBackupFileName || latestSaved.lastBackupFileName || 'UMEDT-Backup.json';
  let discoveredMessageId =
    config?.lastBackupMessageId || latestSaved.lastBackupMessageId;

  // 1. Check getUpdates for newest matching backup document in this chat
  try {
    const updRes = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/getUpdates?limit=50&allowed_updates=${encodeURIComponent(
        JSON.stringify(['channel_post', 'message', 'edited_channel_post'])
      )}`
    );
    const updData = await updRes.json();
    if (updRes.ok && updData?.ok === true && Array.isArray(updData.result)) {
      let bestMsgId = -1;
      for (const upd of updData.result) {
        const msg = upd.channel_post || upd.message || upd.edited_channel_post;
        if (!msg) continue;
        if (!normalizeChatIdMatch(msg.chat?.id, cleanChatId)) continue;
        const doc = msg.document as { file_id?: string; file_name?: string } | undefined;
        if (!isUmedtBackupDocument(doc)) continue;
        const fname = (doc?.file_name || '').toLowerCase();
        // Prefer official backup files over standalone shared HTML/topic exports
        const isBackupFile =
          fname.includes('umedt-backup') ||
          fname.includes('umed2-data-package') ||
          fname.includes('dictengine-umd');
        if (!isBackupFile) continue;
        const msgId = typeof msg.message_id === 'number' ? msg.message_id : 0;
        if (msgId >= bestMsgId && doc?.file_id) {
          bestMsgId = msgId;
          candidateFileId = doc.file_id;
          candidateFileName = doc.file_name || candidateFileName;
          discoveredMessageId = msgId;
        }
      }
    }
  } catch {
    // Fallback to getChat / saved lastBackupFileId
  }

  // 2. Also inspect getChat pinned_message if no newer backup came from getUpdates
  if (!candidateFileId) {
    try {
      const chatRes = await fetchFn(
        `https://api.telegram.org/bot${cleanToken}/getChat?chat_id=${encodeURIComponent(cleanChatId)}`
      );
      const chatData = await chatRes.json();
      const pinnedDoc = chatData?.result?.pinned_message?.document as
        | { file_id?: string; file_name?: string }
        | undefined;
      if (isUmedtBackupDocument(pinnedDoc) && pinnedDoc?.file_id) {
        candidateFileId = pinnedDoc.file_id;
        candidateFileName = pinnedDoc.file_name || candidateFileName;
        discoveredMessageId = chatData?.result?.pinned_message?.message_id;
      }
    } catch {
      // ignore
    }
  }

  if (!candidateFileId) {
    return {
      ok: false,
      message:
        'لم يتم العثور على ملف نسخة احتياطية حديث في سجل التحديثات. يمكنك تنزيل ملف النسخة (.json أو .zip) من قناة تليجرام واستيراده مباشرة من جهازك.'
    };
  }

  try {
    const fileMetaRes = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/getFile?file_id=${encodeURIComponent(
        candidateFileId
      )}`
    );
    const fileMeta = await fileMetaRes.json();
    const filePath = fileMeta?.result?.file_path;
    if (!fileMetaRes.ok || !fileMeta?.ok || !filePath) {
      return {
        ok: false,
        message: formatTelegramErrorAr(fileMeta?.description, fileMetaRes.status, cleanToken)
      };
    }

    const downloadUrl = `https://api.telegram.org/file/bot${cleanToken}/${filePath}`;
    const bytes = await fetchTelegramBinaryViaNativeOrFetch(downloadUrl, fetchFn);
    if (!bytes || bytes.byteLength < 2) {
      return {
        ok: false,
        message: 'تم استلام ملف فارغ من تليجرام.'
      };
    }

    const detectedZip =
      candidateFileName.toLowerCase().endsWith('.zip') ||
      (bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);

    return {
      ok: true,
      bytes,
      fileName: candidateFileName,
      format: detectedZip ? 'zip' : 'json',
      discoveredMessageId,
      message: `تم تنزيل النسخة (${candidateFileName}) من تليجرام بنجاح.`
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCorsOrNetwork = /failed to fetch|cors|network|load failed/i.test(msg);
    return {
      ok: false,
      message: isCorsOrNetwork
        ? 'المتصفح يمنع تنزيل ملفات Telegram مباشرة عبر CORS. حمّل ملف النسخة من قناة تليجرام إلى هاتفك ثم استخدم زر «استيراد بيانات أوفلاين» (أو افتح عبر تطبيق أندرويد للتنزيل المباشر).'
        : redactBotTokenFromText(`تعذر جلب النسخة من تليجرام: ${msg}`, cleanToken)
    };
  }
}

/**
 * Shares any generated interactive file (Topic HTML/ZIP, Subject HTML/ZIP, Block HTML/ZIP,
 * Interactive Exam HTML/JSON, Terms JSON/CSV) directly to the configured Telegram channel.
 * Does NOT alter `appBackupMessageIds` so periodic backups never delete shared interactive files.
 */
export async function sendInteractiveFileToTelegram(params: {
  config?: Partial<TelegramBackupConfig>;
  fileName: string;
  content: string | Uint8Array;
  mimeType: string;
  titleAr: string;
  scopeLabel?: string;
  recordsCount?: number;
  customFetch?: typeof fetch;
  simulatedOffline?: boolean;
}): Promise<{
  ok: boolean;
  message: string;
  uploadedMessageId?: number;
}> {
  if (params.simulatedOffline) {
    return {
      ok: false,
      message: 'الوضع الأوفلاين مفعل؛ تعذر إرسال الملف إلى تليجرام حالياً.'
    };
  }

  const latestSaved = loadTelegramBackupConfig();
  const cleanToken = decryptBotTokenFromStorage(
    params.config?.botToken ||
      params.config?.encryptedBotToken ||
      latestSaved.botToken ||
      latestSaved.encryptedBotToken ||
      ''
  );
  const cleanChatId = sanitizeTelegramInput(
    params.config?.chatId || latestSaved.chatId || ''
  );
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message:
        'يرجى ضبط رمز البوت (Bot Token) ومعرف القناة (Chat ID) في الإعدادات > النسخ الاحتياطي لتليجرام أولاً.'
    };
  }

  const isBinary = params.content instanceof Uint8Array;
  const payloadData: string | ArrayBuffer = isBinary
    ? ((params.content as Uint8Array).buffer.slice(
        (params.content as Uint8Array).byteOffset,
        (params.content as Uint8Array).byteOffset + (params.content as Uint8Array).byteLength
      ) as ArrayBuffer)
    : redactBotTokenFromText(String(params.content || ''), cleanToken);

  const byteSize = isBinary
    ? (params.content as Uint8Array).byteLength
    : new TextEncoder().encode(payloadData as string).byteLength;

  if (byteSize < 2) {
    return {
      ok: false,
      message: 'الملف المولّد فارغ ولا يمكن إرساله.'
    };
  }

  const sizeKB = Math.max(1, Math.round(byteSize / 1024));
  const captionLines = [
    `📘 ملف تفاعلي UMEDT · ${params.titleAr}`,
    ...(params.scopeLabel ? [`📂 النوع: ${params.scopeLabel}`] : []),
    ...(typeof params.recordsCount === 'number'
      ? [`📊 المحتوى: ${params.recordsCount} عنصر · الحجم: ${sizeKB} KB`]
      : [`📊 الحجم: ${sizeKB} KB`]),
    `🕒 ${new Date().toLocaleString('ar-SA')}`
  ];

  const fetchFn = params.customFetch || fetch;
  try {
    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    try {
      const fileObj = new File([payloadData], params.fileName, {
        type: params.mimeType
      });
      formData.append('document', fileObj, params.fileName);
    } catch {
      const blob = new Blob([payloadData], { type: params.mimeType });
      formData.append('document', blob, params.fileName);
    }
    formData.append('caption', redactBotTokenFromText(captionLines.join('\n'), cleanToken));

    const res = await fetchFn(
      `https://api.telegram.org/bot${cleanToken}/sendDocument`,
      {
        method: 'POST',
        body: formData
      }
    );
    const data = await res.json();
    if (res.ok && data?.ok === true && typeof data?.result?.message_id === 'number') {
      return {
        ok: true,
        uploadedMessageId: data.result.message_id,
        message: `تم إرسال "${params.fileName}" (${sizeKB} KB) مباشرة إلى قناة تليجرام بنجاح.`
      };
    }
    return {
      ok: false,
      message: formatTelegramErrorAr(data?.description, res.status, cleanToken)
    };
  } catch (err) {
    return {
      ok: false,
      message: redactBotTokenFromText(
        err instanceof Error ? err.message : 'تعذر إرسال الملف إلى قناة تليجرام.',
        cleanToken
      )
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
  if (config.schedule === '1h') return elapsedHours >= 1;
  if (config.schedule === '6h') return elapsedHours >= 6;
  if (config.schedule === '12h') return elapsedHours >= 12;
  if (config.schedule === 'daily') return elapsedHours >= 24;
  if (config.schedule === 'weekly') return elapsedHours >= 24 * 7;
  if (config.schedule === 'custom_hours') {
    const hrs = Math.max(0.25, config.customIntervalHours || 4);
    return elapsedHours >= hrs;
  }
  return false;
}

export const SCHEDULE_LABELS_AR: Record<TelegramBackupSchedule, string> = {
  off: 'يدوي',
  '1h': 'كل ساعة',
  '6h': 'كل 6 ساعات',
  '12h': 'كل 12 ساعة',
  daily: 'يومياً',
  weekly: 'أسبوعياً',
  custom_hours: 'مخصص',
  on_change: 'عند التغيير'
};

export const BACKUP_MODE_LABELS_AR: Record<
  TelegramBackupMode,
  { title: string; desc: string }
> = {
  single_complete_file: {
    title: 'ملف شامل',
    desc: 'يرسل ملفاً واحداً شاملاً لكل البيانات مع حفظ روابط ومراجع الوسائط فقط دون إرسال ملفات وسائط إضافية.'
  },
  notes_and_scheduled_full: {
    title: 'فوري + مجدول',
    desc: 'ينشر نوتات فورية في القناة عند كل إضافة أو تعديل أو حذف، ويرسل النسخة الشاملة الكاملة تلقائياً حسب التوقيت المحدد.'
  },
  with_separate_media: {
    title: 'ملف + وسائط',
    desc: 'يرسل ملف النسخة الشاملة بالإضافة إلى رفع ملفات الوسائط المحلية المخزنة منفصلة ببصمة SHA-256.'
  }
};
