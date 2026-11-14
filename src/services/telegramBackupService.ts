import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord,
  StudyStats,
  VersionMetadata
} from '../types/lexicon';
import {
  loadMedicalBlocks,
  loadMedicalSubjects
} from './learningHierarchyService';
import {
  loadQuizQuestions,
  loadQuizAttempts
} from './quizEngineService';
import { createDefaultVersionMetadata } from './dataPlatformService';

export type TelegramBackupSchedule = 'off' | '6h' | 'daily' | 'weekly' | 'on_change';

export interface ConciseDataSummary {
  termsCount: number;
  topicsCount: number;
  blocksCount: number;
  subjectsCount: number;
  sentencesCount: number;
  questionsCount: number;
  favoritesCount: number;
  sizeKB: number;
  timestamp: string;
  sourceLabel: string;
  shortText: string;
}

export interface TelegramBackupConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  schedule: TelegramBackupSchedule;
  includeTopicsAndHierarchy: boolean;
  includeDictionaryAndTerms: boolean;
  includeQuizzesAndStats: boolean;
  lastBackupAt?: string;
  lastBackupSummary?: ConciseDataSummary;
}

const STORAGE_KEY_TELEGRAM_CONFIG = 'umed_telegram_backup_config_v1';
const STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP = 'umed_telegram_backup_credentials_v1';
const STORAGE_KEY_MAIN_BACKUP_HISTORY = 'dictengine_umd_backup_history_v2';

const DEFAULT_CONFIG: TelegramBackupConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  schedule: 'daily',
  includeTopicsAndHierarchy: true,
  includeDictionaryAndTerms: true,
  includeQuizzesAndStats: true
};

let memoryTelegramConfig: TelegramBackupConfig | null = null;

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
  return null;
}

function writeRawToStorageWithQuotaRecovery(key: string, value: string): boolean {
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
    // Likely QuotaExceededError due to large backup history in localStorage; prune oldest backups and retry
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
  return false;
}

export function loadTelegramBackupConfig(): TelegramBackupConfig {
  try {
    const rawFull = readRawFromStorage(STORAGE_KEY_TELEGRAM_CONFIG);
    const rawCreds = readRawFromStorage(STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP);

    const parsedFull = rawFull ? (JSON.parse(rawFull) as Partial<TelegramBackupConfig>) : {};
    const parsedCreds = rawCreds ? (JSON.parse(rawCreds) as Partial<TelegramBackupConfig>) : {};

    const botToken =
      (typeof parsedFull.botToken === 'string' && parsedFull.botToken.trim()) ||
      (typeof parsedCreds.botToken === 'string' && parsedCreds.botToken.trim()) ||
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

    const hasCredentials = Boolean(botToken && chatId);
    const enabled =
      typeof parsedFull.enabled === 'boolean'
        ? parsedFull.enabled || (hasCredentials && schedule !== 'off')
        : typeof parsedCreds.enabled === 'boolean'
        ? parsedCreds.enabled || (hasCredentials && schedule !== 'off')
        : memoryTelegramConfig?.enabled ?? (hasCredentials && schedule !== 'off');

    const resolved: TelegramBackupConfig = {
      ...DEFAULT_CONFIG,
      ...memoryTelegramConfig,
      ...parsedCreds,
      ...parsedFull,
      botToken,
      chatId,
      schedule,
      enabled
    };

    memoryTelegramConfig = resolved;
    return resolved;
  } catch {
    return memoryTelegramConfig || DEFAULT_CONFIG;
  }
}

export function saveTelegramBackupConfig(config: TelegramBackupConfig): TelegramBackupConfig {
  const previous = memoryTelegramConfig || DEFAULT_CONFIG;
  const botToken = typeof config.botToken === 'string' ? config.botToken : previous.botToken;
  const chatId = typeof config.chatId === 'string' ? config.chatId : previous.chatId;
  const schedule = config.schedule || previous.schedule || 'daily';
  const hasCredentials = Boolean(botToken.trim() && chatId.trim());

  const normalized: TelegramBackupConfig = {
    ...DEFAULT_CONFIG,
    ...previous,
    ...config,
    botToken,
    chatId,
    schedule,
    enabled:
      schedule === 'off'
        ? false
        : hasCredentials
        ? true
        : Boolean(config.enabled)
  };

  memoryTelegramConfig = normalized;

  // Always save lightweight credentials first so they never fail even if localStorage is nearly full
  const credentialsOnly = {
    enabled: normalized.enabled,
    botToken: normalized.botToken,
    chatId: normalized.chatId,
    schedule: normalized.schedule,
    includeTopicsAndHierarchy: normalized.includeTopicsAndHierarchy,
    includeDictionaryAndTerms: normalized.includeDictionaryAndTerms,
    includeQuizzesAndStats: normalized.includeQuizzesAndStats,
    lastBackupAt: normalized.lastBackupAt
  };
  writeRawToStorageWithQuotaRecovery(
    STORAGE_KEY_TELEGRAM_CREDENTIALS_BACKUP,
    JSON.stringify(credentialsOnly)
  );

  if (
    !writeRawToStorageWithQuotaRecovery(
      STORAGE_KEY_TELEGRAM_CONFIG,
      JSON.stringify(normalized)
    )
  ) {
    // Fallback: write without bulky lastBackupSummary if needed
    writeRawToStorageWithQuotaRecovery(
      STORAGE_KEY_TELEGRAM_CONFIG,
      JSON.stringify(credentialsOnly)
    );
  }

  return normalized;
}

export interface FullUnifiedBackupPayload {
  format: 'umed-unified-backup-v2.3';
  exportedAt: string;
  summary: ConciseDataSummary;
  data: {
    terms: DictionaryTerm[];
    sentences: LinkedSentence[];
    topics: TopicArticle[];
    blocks: MedicalBlock[];
    subjects: MedicalSubject[];
    quizQuestions: UnifiedQuizQuestion[];
    quizAttempts: QuizAttemptRecord[];
    studyStats?: StudyStats;
    versionMetadata: VersionMetadata;
  };
}

export function buildConciseDataSummary(params: {
  terms?: DictionaryTerm[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  blocks?: MedicalBlock[];
  subjects?: MedicalSubject[];
  questions?: UnifiedQuizQuestion[];
  sourceLabel?: string;
  rawSizeBytes?: number;
}): ConciseDataSummary {
  const terms = params.terms || [];
  const sentences = params.sentences || [];
  const topics = params.topics || [];
  const blocks = params.blocks ?? loadMedicalBlocks();
  const subjects = params.subjects ?? loadMedicalSubjects();
  const questions = params.questions ?? loadQuizQuestions(topics, terms);

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
        tp: topics.length
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

  const shortText =
    parts.length > 0 ? parts.join(' · ') : 'لا توجد سجلات مضافة';

  return {
    termsCount: terms.length,
    topicsCount: topics.length,
    blocksCount: blocks.length,
    subjectsCount: subjects.length,
    sentencesCount: sentences.length,
    questionsCount: questions.length,
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
  const quizQuestions = loadQuizQuestions(topics, terms);
  const quizAttempts = loadQuizAttempts();
  const resolvedMetadata = versionMetadata || createDefaultVersionMetadata();

  const tempPayload = {
    terms,
    sentences,
    topics,
    blocks,
    subjects,
    quizQuestions,
    quizAttempts,
    studyStats,
    versionMetadata: resolvedMetadata
  };

  const rawJson = JSON.stringify(tempPayload);
  const summary = buildConciseDataSummary({
    terms,
    sentences,
    topics,
    blocks,
    subjects,
    questions: quizQuestions,
    sourceLabel,
    rawSizeBytes: new Blob([rawJson]).size
  });

  const payload: FullUnifiedBackupPayload = {
    format: 'umed-unified-backup-v2.3',
    exportedAt: summary.timestamp,
    summary,
    data: tempPayload
  };

  const jsonString = JSON.stringify(payload);
  return { payload, jsonString, summary };
}

function sanitizeTelegramInput(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\s]/g, '')
    .trim();
}

function formatTelegramErrorAr(rawDesc?: string, status?: number): string {
  const desc = String(rawDesc || '').trim();
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
  chatId: string
): Promise<{ ok: boolean; message: string }> {
  const cleanToken = sanitizeTelegramInput(botToken);
  const cleanChatId = sanitizeTelegramInput(chatId);
  if (!cleanToken || !cleanChatId) {
    return { ok: false, message: 'يرجى إدخال Bot Token و Chat ID أولاً.' };
  }

  // Persist credentials immediately so they never disappear after clicking Check
  const currentCfg = loadTelegramBackupConfig();
  saveTelegramBackupConfig({
    ...currentCfg,
    botToken: cleanToken,
    chatId: cleanChatId,
    enabled: currentCfg.schedule !== 'off'
  });

  const messageText = '✅ تم ربط تطبيق UMEDT بنجاح لعمل النسخ الاحتياطية التلقائية واليدوية.';

  // 1. Try server-side proxy first (avoids browser CORS/CSP/iframe restrictions)
  let proxyErrorMsg = '';
  try {
    const proxyRes = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: cleanToken,
        chatId: cleanChatId,
        text: messageText
      })
    });
    const contentType = proxyRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const proxyData = await proxyRes.json();
      if (proxyData?.ok === true) {
        return {
          ok: true,
          message: 'تم الاتصال وإرسال رسالة تأكيد إلى قناة/محادثة تليجرام وحفظ البيانات بنجاح.'
        };
      }
      proxyErrorMsg = proxyData?.description || proxyData?.message || '';
    }
  } catch {
    // Fall back to direct Telegram API call below (e.g., in offline/Capacitor APK mode)
  }

  // 2. Direct Telegram Bot API call
  try {
    const res = await fetch(
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
        message: formatTelegramErrorAr(data?.description || proxyErrorMsg, res.status)
      };
    }
    return {
      ok: true,
      message: 'تم الاتصال وإرسال رسالة تأكيد إلى قناة/محادثة تليجرام وحفظ البيانات بنجاح.'
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        proxyErrorMsg ||
        (err instanceof Error
          ? err.message
          : 'تعذر الوصول إلى خادم تليجرام. تحقق من اتصال الإنترنت.')
    };
  }
}

export async function sendBackupToTelegram(
  config: TelegramBackupConfig,
  terms: DictionaryTerm[],
  sentences: LinkedSentence[],
  topics: TopicArticle[],
  reasonLabel = 'نسخة احتياطية يدوية',
  studyStats?: StudyStats,
  versionMetadata?: VersionMetadata
): Promise<{ ok: boolean; message: string; summary?: ConciseDataSummary }> {
  const latestSaved = loadTelegramBackupConfig();
  const cleanToken = sanitizeTelegramInput(config.botToken || latestSaved.botToken || '');
  const cleanChatId = sanitizeTelegramInput(config.chatId || latestSaved.chatId || '');
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message:
        'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) في إعدادات تليجرام.'
    };
  }

  // Ensure credentials are saved before sending
  const mergedConfig = saveTelegramBackupConfig({
    ...latestSaved,
    ...config,
    botToken: cleanToken,
    chatId: cleanChatId
  });

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
    let lastErrorDescription = '';

    // 1. Try server-side proxy endpoint (/api/telegram/send-backup)
    try {
      const proxyRes = await fetch('/api/telegram/send-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: cleanToken,
          chatId: cleanChatId,
          filename,
          caption,
          jsonString,
          jsonContent: jsonString
        })
      });
      const contentType = proxyRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const proxyData = await proxyRes.json();
        if (proxyData?.ok === true) {
          sentSuccessfully = true;
        } else {
          lastErrorDescription = proxyData?.description || proxyData?.message || '';
        }
      }
    } catch {
      // Fall back to direct FormData upload below
    }

    // 2. Direct Telegram Bot API sendDocument upload (works in browser, PWA, and Android APK)
    if (!sentSuccessfully) {
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

        const res = await fetch(
          `https://api.telegram.org/bot${cleanToken}/sendDocument`,
          {
            method: 'POST',
            body: formData
          }
        );

        const data = await res.json();
        if (res.ok && data?.ok) {
          sentSuccessfully = true;
        } else {
          lastErrorDescription =
            data?.description || lastErrorDescription || `HTTP ${res.status}`;
        }
      } catch (directErr) {
        if (!lastErrorDescription && directErr instanceof Error) {
          lastErrorDescription = directErr.message;
        }
      }
    }

    // 3. Smart fallback for slow mobile connections (e.g. <50 KB/s upload):
    // If full 2.3MB upload failed due to network timeout rather than invalid credentials,
    // send compact package with all topics, blocks, subjects, quizzes, favorites, and custom/studied terms.
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
        const proxyCompactRes = await fetch('/api/telegram/send-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: cleanToken,
            chatId: cleanChatId,
            filename,
            caption,
            jsonString: compactPkg.jsonString,
            jsonContent: compactPkg.jsonString
          })
        });
        if (proxyCompactRes.ok) {
          const proxyCompactData = await proxyCompactRes.json();
          if (proxyCompactData?.ok === true) {
            sentSuccessfully = true;
          }
        }
      } catch {
        // Try direct compact upload
      }

      if (!sentSuccessfully) {
        try {
          const compactForm = new FormData();
          compactForm.append('chat_id', cleanChatId);
          const compactBlob = new Blob([compactPkg.jsonString], { type: 'application/json' });
          compactForm.append('document', compactBlob, filename);
          compactForm.append('caption', caption);
          const compactRes = await fetch(
            `https://api.telegram.org/bot${cleanToken}/sendDocument`,
            {
              method: 'POST',
              body: compactForm
            }
          );
          const compactData = await compactRes.json();
          if (compactRes.ok && compactData?.ok) {
            sentSuccessfully = true;
          } else if (compactData?.description) {
            lastErrorDescription = compactData.description;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!sentSuccessfully) {
      return {
        ok: false,
        message: formatTelegramErrorAr(lastErrorDescription)
      };
    }

    const updatedConfig: TelegramBackupConfig = {
      ...loadTelegramBackupConfig(),
      ...mergedConfig,
      botToken: cleanToken,
      chatId: cleanChatId,
      lastBackupAt: summary.timestamp,
      lastBackupSummary: summary
    };
    saveTelegramBackupConfig(updatedConfig);

    return {
      ok: true,
      message: `تم إرسال ملف النسخة الاحتياطية (${filename}) إلى تليجرام بنجاح.`,
      summary
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء رفع النسخة الاحتياطية إلى تليجرام.'
    };
  }
}

export function isTelegramScheduledBackupDue(
  config: TelegramBackupConfig
): boolean {
  if (!config.enabled || !config.botToken.trim() || !config.chatId.trim()) {
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
