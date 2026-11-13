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

const DEFAULT_CONFIG: TelegramBackupConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  schedule: 'daily',
  includeTopicsAndHierarchy: true,
  includeDictionaryAndTerms: true,
  includeQuizzesAndStats: true
};

export function loadTelegramBackupConfig(): TelegramBackupConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CONFIG;
    const raw = window.localStorage.getItem(STORAGE_KEY_TELEGRAM_CONFIG);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveTelegramBackupConfig(config: TelegramBackupConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_TELEGRAM_CONFIG, JSON.stringify(config));
    }
  } catch {
    // ignore storage errors
  }
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

  const jsonString = JSON.stringify(payload, null, 2);
  return { payload, jsonString, summary };
}

export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<{ ok: boolean; message: string }> {
  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();
  if (!cleanToken || !cleanChatId) {
    return { ok: false, message: 'يرجى إدخال Bot Token و Chat ID أولاً.' };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cleanToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: '✅ تم ربط تطبيق UMEDT بنجاح لعمل النسخ الاحتياطية التلقائية واليدوية.'
        })
      }
    );
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.description || `فشل الاتصال بتليجرام (${res.status})`
      };
    }
    return {
      ok: true,
      message: 'تم الاتصال وإرسال رسالة تأكيد إلى تليجرام بنجاح.'
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'تعذر الوصول إلى خادم تليجرام. تحقق من اتصال الإنترنت.'
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
  const cleanToken = config.botToken.trim();
  const cleanChatId = config.chatId.trim();
  if (!cleanToken || !cleanChatId) {
    return {
      ok: false,
      message:
        'يرجى إدخال رمز البوت (Bot Token) ومعرف المحادثة (Chat ID) في إعدادات تليجرام.'
    };
  }

  try {
    const filteredTerms = config.includeDictionaryAndTerms ? terms : [];
    const filteredSentences = config.includeDictionaryAndTerms ? sentences : [];
    const filteredTopics = config.includeTopicsAndHierarchy ? topics : [];

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
    const blob = new Blob([jsonString], { type: 'application/json' });

    const captionLines = [
      `📦 نسخة احتياطية UMEDT (${reasonLabel})`,
      `📋 تعريف البيانات: ${summary.shortText}`,
      `⭐ المفضلة: ${summary.favoritesCount} · الحجم: ${summary.sizeKB} KB`,
      `🕒 التاريخ: ${new Date(summary.timestamp).toLocaleString('ar-SA')}`
    ];

    const formData = new FormData();
    formData.append('chat_id', cleanChatId);
    formData.append('document', blob, filename);
    formData.append('caption', captionLines.join('\n'));

    const res = await fetch(
      `https://api.telegram.org/bot${cleanToken}/sendDocument`,
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        message:
          data?.description || `تعذر إرسال النسخة إلى تليجرام (${res.status})`
      };
    }

    const updatedConfig: TelegramBackupConfig = {
      ...config,
      lastBackupAt: summary.timestamp,
      lastBackupSummary: summary
    };
    saveTelegramBackupConfig(updatedConfig);

    return {
      ok: true,
      message: 'تم إرسال النسخة الاحتياطية إلى تليجرام بنجاح.',
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
