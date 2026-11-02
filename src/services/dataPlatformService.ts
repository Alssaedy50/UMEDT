import {
  AbbreviationCategory,
  BackupVerificationResult,
  ClinicalAbbreviation,
  ConflictResolutionStrategy,
  DataBackupRecord,
  DataDomainKey,
  DataPackageManifest,
  DataPackagePayload,
  DataValidationResult,
  DictionaryTerm,
  DomainPartialUpdateMetrics,
  DuplicateAndConflictReport,
  DuplicateGroupItem,
  LexiconCategory,
  LinkedSentence,
  MorphologicalAffix,
  PartialDatabasePatchPayload,
  PublishedReleaseBundle,
  PublisherSigningKeyPair,
  RecordConflictItem,
  RecordFieldDiff,
  ReleaseChangelogEntry,
  ReleasePrePublishGateResult,
  SignatureAlgorithm,
  TopicArticle,
  TopicCategory,
  VersionBumpStrategy,
  VersionMetadata,
  ZipSecurityInspectionResult,
  ZipSecurityPolicy,
  ZipSecurityViolationCode
} from '../types/lexicon';

/**
 * UMED-2 Separated Version Architecture
 * 1. APP_VERSION: Binary / Android APK & UI logic version
 * 2. DB_SCHEMA_VERSION: Structural storage contract version
 * 3. BUNDLED_DATA_VERSION: Default offline seed lexicon version shipped with the build
 */
export const APP_VERSION = '2.2.0';
export const DB_SCHEMA_VERSION = 2;
export const BUNDLED_DATA_VERSION = '2026.10.0-umd';

export const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.zip'] as const;
const SQLITE_MAGIC_HEADER = 'SQLite format 3';

/**
 * Stage 5 Default ZIP & Download Security Policy:
 * Protects against oversized downloads, Zip Bombs (extreme decompression ratios),
 * Zip Slip path traversal (`../`), and dangerous executable/script payloads.
 */
export const DEFAULT_ZIP_SECURITY_POLICY: ZipSecurityPolicy = {
  maxDownloadBytes: 25 * 1024 * 1024, // 25 MB max network download
  maxCompressedArchiveBytes: 25 * 1024 * 1024, // 25 MB max compressed archive
  maxTotalUncompressedBytes: 50 * 1024 * 1024, // 50 MB max total extracted bytes
  maxSingleEntryUncompressedBytes: 20 * 1024 * 1024, // 20 MB max per single JSON entry
  maxCompressionRatio: 80, // 80:1 max expansion ratio to block Zip Bombs
  maxEntryCount: 64, // Max 64 files in a medical package archive
  maxPathDepth: 4 // Max 4 directory levels deep
};

const DANGEROUS_ARCHIVE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.wasm',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.apk',
  '.dex',
  '.html',
  '.htm',
  '.svg',
  '.scr',
  '.com'
];

const VALID_LEXICON_CATEGORIES = new Set<LexiconCategory>([
  'Medical',
  'AI',
  'Programming',
  'General'
]);

const VALID_TOPIC_CATEGORIES = new Set<TopicCategory>([
  'Medical',
  'Technology',
  'AI',
  'History',
  'General'
]);

const VALID_AFFIX_TYPES = new Set<MorphologicalAffix['type']>(['prefix', 'root', 'suffix']);

const VALID_ABBR_CATEGORIES = new Set<AbbreviationCategory>([
  'Ward & Hx',
  'Prescription (Rx)',
  'Cardiopulmonary',
  'Neurology & Labs'
]);

/**
 * Compares two semantic version strings (e.g. "2.1.0" vs "2.0.0").
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = a
    .replace(/^v/i, '')
    .split(/[+-]/)[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const cleanB = b
    .replace(/^v/i, '')
    .split(/[+-]/)[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(cleanA.length, cleanB.length, 3);
  for (let i = 0; i < len; i++) {
    const va = cleanA[i] ?? 0;
    const vb = cleanB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * Compares two data version identifiers (CalVer / SemVer such as "2026.11.0-umd" vs "2026.10.0-umd").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareDataVersions(a: string, b: string): number {
  const normA = a.trim().replace(/^v/i, '');
  const normB = b.trim().replace(/^v/i, '');
  if (normA === normB) return 0;
  const sem = compareSemver(normA, normB);
  if (sem !== 0) return sem;
  return normA.localeCompare(normB);
}

/**
 * Checks whether a remote or local DataPackageManifest is compatible with the running App & Schema.
 */
export function checkManifestCompatibility(manifest: Partial<DataPackageManifest>): {
  compatible: boolean;
  reason?: string;
} {
  if (typeof manifest.schemaVersion === 'number' && manifest.schemaVersion !== DB_SCHEMA_VERSION) {
    return {
      compatible: false,
      reason: `عدم توافق إصدار المخطط (Schema): الحزمة تتطلب المخطط v${manifest.schemaVersion} بينما التطبيق يعمل بالمخطط v${DB_SCHEMA_VERSION}.`
    };
  }
  if (typeof manifest.minAppVersion === 'string' && manifest.minAppVersion.trim() !== '') {
    if (compareSemver(APP_VERSION, manifest.minAppVersion) < 0) {
      return {
        compatible: false,
        reason: `إصدار التطبيق قديم: تتطلب الحزمة إصدار التطبيق v${manifest.minAppVersion} على الأقل (الإصدار الحالي v${APP_VERSION}).`
      };
    }
  }
  return { compatible: true };
}


export function createDefaultVersionMetadata(
  overrides?: Partial<VersionMetadata>
): VersionMetadata {
  return {
    appVersion: APP_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    dataVersion: BUNDLED_DATA_VERSION,
    lastDataUpdateAt: new Date().toISOString(),
    dataSource: 'bundled-seed',
    packageId: `umed2-seed-${BUNDLED_DATA_VERSION}`,
    remoteChannel: 'stable',
    ...overrides
  };
}

/**
 * Guard against SQLite binary imports (.db, .sqlite, .sqlite3).
 * User-facing imports are strictly restricted to JSON and ZIP packages.
 */
export function assertNotSqlitePayload(bytesOrText: Uint8Array | string, fileName?: string): void {
  if (fileName) {
    const lower = fileName.toLowerCase().trim();
    if (
      lower.endsWith('.sqlite') ||
      lower.endsWith('.sqlite3') ||
      lower.endsWith('.db') ||
      lower.endsWith('.db3')
    ) {
      throw new Error(
        'ملفات قواعد بيانات SQLite (.db / .sqlite) غير مدعومة كصيغة استيراد للمستخدم. يرجى استخدام حزم البيانات المعتمدة بصيغة JSON أو ZIP فقط.'
      );
    }
  }

  if (typeof bytesOrText === 'string') {
    if (bytesOrText.startsWith(SQLITE_MAGIC_HEADER)) {
      throw new Error(
        'تم رفض ملف SQLite ثنائي. يُسمح فقط باستيراد حزم البيانات الطبية بصيغة JSON (.json) أو ZIP (.zip).'
      );
    }
  } else if (bytesOrText.byteLength >= 15) {
    const header = new TextDecoder('ascii').decode(bytesOrText.subarray(0, 15));
    if (header === SQLITE_MAGIC_HEADER) {
      throw new Error(
        'تم رفض ملف SQLite ثنائي. يُسمح فقط باستيراد حزم البيانات الطبية بصيغة JSON (.json) أو ZIP (.zip).'
      );
    }
  }
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function normalizeLexiconCategory(val: unknown): LexiconCategory {
  if (typeof val === 'string' && VALID_LEXICON_CATEGORIES.has(val as LexiconCategory)) {
    return val as LexiconCategory;
  }
  return 'Medical';
}

function validateTermEntry(raw: unknown, index: number, errors: string[]): DictionaryTerm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`terms[${index}]: العنصر ليس كائناً صالحاً.`);
    return null;
  }
  const item = raw as Record<string, unknown>;
  const itemErrors: string[] = [];

  if (!isNonEmptyString(item.term)) {
    itemErrors.push(`terms[${index}]: الحقل 'term' مفقود أو فارغ.`);
  }
  if (!isNonEmptyString(item.translation)) {
    itemErrors.push(`terms[${index}] (${String(item.term || '')}): الحقل 'translation' مفقود أو فارغ.`);
  }

  if (item.category !== undefined && typeof item.category === 'string') {
    if (!VALID_LEXICON_CATEGORIES.has(item.category as LexiconCategory)) {
      itemErrors.push(
        `terms[${index}] (${String(item.term || '')}): التصنيف '${item.category}' غير صالح.`
      );
    }
  }

  if (item.examples !== undefined) {
    if (!Array.isArray(item.examples)) {
      itemErrors.push(`terms[${index}] (${String(item.term || '')}): الحقل 'examples' يجب أن يكون مصفوفة.`);
    } else {
      item.examples.forEach((ex, exIdx) => {
        if (!ex || typeof ex !== 'object' || !isNonEmptyString((ex as Record<string, unknown>).en)) {
          itemErrors.push(
            `terms[${index}].examples[${exIdx}]: المثال السياقي يجب أن يحتوي على نص إنجليزي 'en' صالح.`
          );
        }
      });
    }
  }

  if (item.relations !== undefined && (!item.relations || typeof item.relations !== 'object' || Array.isArray(item.relations))) {
    itemErrors.push(`terms[${index}] (${String(item.term || '')}): الحقل 'relations' يجب أن يكون كائناً.`);
  }

  if (itemErrors.length > 0) {
    errors.push(...itemErrors);
    return null;
  }

  const termStr = String(item.term).trim();
  const translationStr = String(item.translation).trim();
  const relObj = (item.relations as Record<string, unknown>) || {};

  return {
    id: isNonEmptyString(item.id) ? item.id.trim() : `pkg-term-${index + 1}-${termStr.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    term: termStr,
    termNormalized: isNonEmptyString(item.termNormalized)
      ? item.termNormalized.trim().toLowerCase()
      : termStr.toLowerCase(),
    translation: translationStr,
    phonetic: isNonEmptyString(item.phonetic) ? item.phonetic.trim() : '/.../',
    pos: isNonEmptyString(item.pos) ? item.pos.trim() : 'Noun · مصطلح طبي',
    category: normalizeLexiconCategory(item.category),
    specialty: isNonEmptyString(item.specialty) ? item.specialty.trim() : undefined,
    umdCode: isNonEmptyString(item.umdCode) ? item.umdCode.trim() : undefined,
    keepEnglish: item.keepEnglish !== undefined ? Boolean(item.keepEnglish) : true,
    favorite: Boolean(item.favorite),
    collections: Array.isArray(item.collections) ? item.collections.map(String) : [],
    ingestedAt: isNonEmptyString(item.ingestedAt) ? item.ingestedAt.trim() : 'حزمة بيانات محدثة',
    definitionAr: isNonEmptyString(item.definitionAr) ? item.definitionAr.trim() : translationStr,
    definitionEn: isNonEmptyString(item.definitionEn) ? item.definitionEn.trim() : termStr,
    clinicalNote: isNonEmptyString(item.clinicalNote) ? item.clinicalNote.trim() : undefined,
    morphology:
      item.morphology && typeof item.morphology === 'object'
        ? (item.morphology as DictionaryTerm['morphology'])
        : undefined,
    examples: Array.isArray(item.examples)
      ? item.examples.map((ex) => {
          const e = ex as Record<string, unknown>;
          return {
            en: String(e.en).trim(),
            ar: isNonEmptyString(e.ar) ? e.ar.trim() : ''
          };
        })
      : [],
    relations: {
      synonyms: Array.isArray(relObj.synonyms) ? relObj.synonyms.map(String) : [],
      broader: Array.isArray(relObj.broader) ? relObj.broader.map(String) : [],
      related: Array.isArray(relObj.related) ? relObj.related.map(String) : []
    },
    srsData:
      item.srsData && typeof item.srsData === 'object'
        ? (item.srsData as DictionaryTerm['srsData'])
        : undefined
  };
}

function validateSentenceEntry(
  raw: unknown,
  index: number,
  errors: string[]
): LinkedSentence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`sentences[${index}]: العنصر ليس كائناً صالحاً.`);
    return null;
  }
  const item = raw as Record<string, unknown>;
  const itemErrors: string[] = [];

  if (!isNonEmptyString(item.en)) {
    itemErrors.push(`sentences[${index}]: النص الإنجليزي 'en' مفقود أو فارغ.`);
  }
  if (!isNonEmptyString(item.ar)) {
    itemErrors.push(`sentences[${index}]: الترجمة العربية 'ar' مفقودة أو فارغة.`);
  }
  if (item.category !== undefined && typeof item.category === 'string') {
    if (!VALID_LEXICON_CATEGORIES.has(item.category as LexiconCategory)) {
      itemErrors.push(`sentences[${index}]: التصنيف '${item.category}' غير صالح.`);
    }
  }

  if (itemErrors.length > 0) {
    errors.push(...itemErrors);
    return null;
  }

  return {
    id: isNonEmptyString(item.id) ? item.id.trim() : `pkg-sent-${index + 1}`,
    en: String(item.en).trim(),
    ar: String(item.ar).trim(),
    category: normalizeLexiconCategory(item.category),
    specialty: isNonEmptyString(item.specialty) ? item.specialty.trim() : undefined,
    sourceType:
      item.sourceType === 'manual' ||
      item.sourceType === 'file' ||
      item.sourceType === 'long_text' ||
      item.sourceType === 'termux' ||
      item.sourceType === 'seed'
        ? item.sourceType
        : 'file',
    linkedTermIds: Array.isArray(item.linkedTermIds) ? item.linkedTermIds.map(String) : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    favorite: Boolean(item.favorite),
    createdAt: isNonEmptyString(item.createdAt) ? item.createdAt.trim() : 'حزمة بيانات محدثة',
    notes: isNonEmptyString(item.notes) ? item.notes.trim() : undefined,
    srsData:
      item.srsData && typeof item.srsData === 'object'
        ? (item.srsData as LinkedSentence['srsData'])
        : undefined
  };
}

function validateTopicEntry(raw: unknown, index: number, errors: string[]): TopicArticle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`topics[${index}]: العنصر ليس كائناً صالحاً.`);
    return null;
  }
  const item = raw as Record<string, unknown>;
  const itemErrors: string[] = [];

  if (!isNonEmptyString(item.id)) {
    itemErrors.push(`topics[${index}]: المعرف 'id' مفقود.`);
  }
  if (!isNonEmptyString(item.title)) {
    itemErrors.push(`topics[${index}]: العنوان 'title' مفقود.`);
  }
  if (!Array.isArray(item.sections)) {
    itemErrors.push(`topics[${index}]: الحقل 'sections' يجب أن يكون مصفوفة.`);
  }

  if (itemErrors.length > 0) {
    errors.push(...itemErrors);
    return null;
  }

  const cat =
    typeof item.category === 'string' && VALID_TOPIC_CATEGORIES.has(item.category as TopicCategory)
      ? (item.category as TopicCategory)
      : 'Medical';

  return {
    id: String(item.id).trim(),
    title: String(item.title).trim(),
    subtitle: isNonEmptyString(item.subtitle) ? item.subtitle.trim() : '',
    category: cat,
    author: isNonEmptyString(item.author) ? item.author.trim() : 'UMED-2 Editorial',
    publishedAt: isNonEmptyString(item.publishedAt)
      ? item.publishedAt.trim()
      : new Date().toISOString().slice(0, 10),
    readingTimeMinutes:
      typeof item.readingTimeMinutes === 'number' && item.readingTimeMinutes > 0
        ? item.readingTimeMinutes
        : 5,
    favorite: Boolean(item.favorite),
    sections: (item.sections as Array<Record<string, unknown>>).map((sec, sIdx) => ({
      id: isNonEmptyString(sec?.id) ? String(sec.id).trim() : `sec-${index}-${sIdx}`,
      heading: isNonEmptyString(sec?.heading) ? String(sec.heading).trim() : undefined,
      paragraphs: Array.isArray(sec?.paragraphs) ? sec.paragraphs.map(String) : []
    })),
    images: Array.isArray(item.images) ? (item.images as TopicArticle['images']) : [],
    links: Array.isArray(item.links) ? (item.links as TopicArticle['links']) : [],
    attachments: Array.isArray(item.attachments)
      ? (item.attachments as TopicArticle['attachments'])
      : []
  };
}

function validateAffixEntry(
  raw: unknown,
  index: number,
  errors: string[]
): MorphologicalAffix | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`customAffixes[${index}]: العنصر ليس كائناً صالحاً.`);
    return null;
  }
  const item = raw as Record<string, unknown>;
  const itemErrors: string[] = [];

  if (!isNonEmptyString(item.affix)) {
    itemErrors.push(`customAffixes[${index}]: الحقل 'affix' مفقود.`);
  }
  if (!isNonEmptyString(item.meaningAr)) {
    itemErrors.push(`customAffixes[${index}]: الحقل 'meaningAr' مفقود.`);
  }
  const type = isNonEmptyString(item.type) ? item.type.trim().toLowerCase() : '';
  if (!VALID_AFFIX_TYPES.has(type as MorphologicalAffix['type'])) {
    itemErrors.push(`customAffixes[${index}]: النوع '${String(item.type)}' غير صالح.`);
  }

  if (itemErrors.length > 0) {
    errors.push(...itemErrors);
    return null;
  }

  const cleanKey = isNonEmptyString(item.cleanKey)
    ? item.cleanKey.trim().toLowerCase()
    : String(item.affix)
        .replace(/[^a-zA-Z]/g, '')
        .toLowerCase();

  return {
    id: isNonEmptyString(item.id) ? item.id.trim() : `pkg-affix-${index + 1}-${cleanKey}`,
    affix: String(item.affix).trim(),
    cleanKey: cleanKey || 'root',
    type: type as MorphologicalAffix['type'],
    meaningAr: String(item.meaningAr).trim(),
    meaningEn: isNonEmptyString(item.meaningEn) ? item.meaningEn.trim() : String(item.affix).trim(),
    combiningRule: isNonEmptyString(item.combiningRule)
      ? item.combiningRule.trim()
      : 'دمج قياسي للمركبات الطبية (WHO UMD)',
    examples: Array.isArray(item.examples) ? item.examples.map(String) : []
  };
}

function validateAbbreviationEntry(
  raw: unknown,
  index: number,
  errors: string[]
): ClinicalAbbreviation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`customAbbreviations[${index}]: العنصر ليس كائناً صالحاً.`);
    return null;
  }
  const item = raw as Record<string, unknown>;
  const itemErrors: string[] = [];

  if (!isNonEmptyString(item.abbr)) {
    itemErrors.push(`customAbbreviations[${index}]: الاختصار 'abbr' مفقود.`);
  }
  if (!isNonEmptyString(item.defaultExpansionEn)) {
    itemErrors.push(`customAbbreviations[${index}]: الحقل 'defaultExpansionEn' مفقود.`);
  }
  if (!isNonEmptyString(item.defaultTranslationAr)) {
    itemErrors.push(`customAbbreviations[${index}]: الحقل 'defaultTranslationAr' مفقود.`);
  }

  if (itemErrors.length > 0) {
    errors.push(...itemErrors);
    return null;
  }

  const cat: AbbreviationCategory =
    typeof item.category === 'string' &&
    VALID_ABBR_CATEGORIES.has(item.category as AbbreviationCategory)
      ? (item.category as AbbreviationCategory)
      : 'Ward & Hx';

  return {
    id: isNonEmptyString(item.id)
      ? item.id.trim()
      : `pkg-abbr-${index + 1}-${String(item.abbr).trim().toUpperCase()}`,
    abbr: String(item.abbr).trim(),
    isAmbiguous: Boolean(item.isAmbiguous),
    defaultExpansionEn: String(item.defaultExpansionEn).trim(),
    defaultTranslationAr: String(item.defaultTranslationAr).trim(),
    category: cat,
    priority: typeof item.priority === 'number' ? item.priority : 90,
    candidates: Array.isArray(item.candidates)
      ? (item.candidates as ClinicalAbbreviation['candidates'])
      : [
          {
            expansionEn: String(item.defaultExpansionEn).trim(),
            translationAr: String(item.defaultTranslationAr).trim(),
            specialty: cat,
            triggers: []
          }
        ]
  };
}

/**
 * Strictly validates a raw parsed JSON payload (either full backup format, DataPackagePayload format,
 * raw terms array, or modular ZIP collection format) and returns a unified DataValidationResult.
 * Enforces all-or-nothing validation: if ANY single item in the batch is malformed, `valid` is false.
 */
export function validateDataPackageObject(raw: unknown): DataValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['جذر ملف البيانات يجب أن يكون كائن JSON أو مصفوفة مصطلحات صالحة.'],
      warnings: [],
      manifest: {
        packageId: 'invalid',
        dataVersion: '0.0.0',
        minAppVersion: APP_VERSION,
        schemaVersion: DB_SCHEMA_VERSION,
        releasedAt: new Date().toISOString(),
        channel: 'stable',
        counts: { terms: 0, sentences: 0, topics: 0, affixes: 0, abbreviations: 0 }
      }
    };
  }

  // Support legacy top-level array of terms as a valid package object
  const obj: Record<string, unknown> = Array.isArray(raw) ? { terms: raw } : (raw as Record<string, unknown>);

  const rawManifest =
    obj.manifest && typeof obj.manifest === 'object' && !Array.isArray(obj.manifest)
      ? (obj.manifest as Record<string, unknown>)
      : {};
  const rawVersionMeta =
    obj.versionMetadata &&
    typeof obj.versionMetadata === 'object' &&
    !Array.isArray(obj.versionMetadata)
      ? (obj.versionMetadata as Record<string, unknown>)
      : {};

  const incomingSchemaVersion =
    typeof rawManifest.schemaVersion === 'number'
      ? rawManifest.schemaVersion
      : typeof rawVersionMeta.schemaVersion === 'number'
      ? rawVersionMeta.schemaVersion
      : typeof obj.schemaVersion === 'number'
      ? obj.schemaVersion
      : typeof obj.version === 'number'
      ? obj.version
      : DB_SCHEMA_VERSION;

  const incomingMinAppVersion =
    typeof rawManifest.minAppVersion === 'string'
      ? rawManifest.minAppVersion
      : APP_VERSION;

  const compat = checkManifestCompatibility({
    schemaVersion: incomingSchemaVersion,
    minAppVersion: incomingMinAppVersion
  });

  if (!compat.compatible && compat.reason) {
    errors.push(compat.reason);
  }

  if (obj.terms !== undefined && !Array.isArray(obj.terms)) {
    errors.push("الحقل 'terms' يجب أن يكون مصفوفة.");
  }
  if (obj.sentences !== undefined && !Array.isArray(obj.sentences)) {
    errors.push("الحقل 'sentences' يجب أن يكون مصفوفة.");
  }
  if (obj.topics !== undefined && !Array.isArray(obj.topics)) {
    errors.push("الحقل 'topics' يجب أن يكون مصفوفة.");
  }
  if (obj.customAffixes !== undefined && !Array.isArray(obj.customAffixes)) {
    errors.push("الحقل 'customAffixes' يجب أن يكون مصفوفة.");
  }
  if (obj.customAbbreviations !== undefined && !Array.isArray(obj.customAbbreviations)) {
    errors.push("الحقل 'customAbbreviations' يجب أن يكون مصفوفة.");
  }

  const rawTerms = Array.isArray(obj.terms) ? obj.terms : [];
  const rawSentences = Array.isArray(obj.sentences) ? obj.sentences : [];
  const rawTopics = Array.isArray(obj.topics) ? obj.topics : [];
  const rawAffixes = Array.isArray(obj.customAffixes)
    ? obj.customAffixes
    : Array.isArray(obj.morphologicalAffixes)
    ? obj.morphologicalAffixes
    : Array.isArray(obj.affixes)
    ? obj.affixes
    : [];
  const rawAbbreviations = Array.isArray(obj.customAbbreviations)
    ? obj.customAbbreviations
    : Array.isArray(obj.clinicalAbbreviations)
    ? obj.clinicalAbbreviations
    : Array.isArray(obj.abbreviations)
    ? obj.abbreviations
    : [];

  const totalItems =
    rawTerms.length +
    rawSentences.length +
    rawTopics.length +
    rawAffixes.length +
    rawAbbreviations.length;

  if (totalItems === 0 && errors.length === 0) {
    errors.push(
      'حزمة البيانات فارغة ولا تحتوي على أي سجلات طبية (مصطلحات، جمل، مواضيع، جذور صرفية، أو اختصارات).'
    );
  }

  const validatedTerms: DictionaryTerm[] = [];
  const validatedSentences: LinkedSentence[] = [];
  const validatedTopics: TopicArticle[] = [];
  const validatedAffixes: MorphologicalAffix[] = [];
  const validatedAbbreviations: ClinicalAbbreviation[] = [];

  for (let i = 0; i < rawTerms.length; i++) {
    const entry = validateTermEntry(rawTerms[i], i, errors);
    if (entry) validatedTerms.push(entry);
  }

  for (let i = 0; i < rawSentences.length; i++) {
    const entry = validateSentenceEntry(rawSentences[i], i, errors);
    if (entry) validatedSentences.push(entry);
  }

  for (let i = 0; i < rawTopics.length; i++) {
    const entry = validateTopicEntry(rawTopics[i], i, errors);
    if (entry) validatedTopics.push(entry);
  }

  for (let i = 0; i < rawAffixes.length; i++) {
    const entry = validateAffixEntry(rawAffixes[i], i, errors);
    if (entry) validatedAffixes.push(entry);
  }

  for (let i = 0; i < rawAbbreviations.length; i++) {
    const entry = validateAbbreviationEntry(rawAbbreviations[i], i, errors);
    if (entry) validatedAbbreviations.push(entry);
  }

  // Verify declared manifest counts if present
  if (rawManifest.counts && typeof rawManifest.counts === 'object') {
    const declared = rawManifest.counts as Record<string, unknown>;
    if (typeof declared.terms === 'number' && declared.terms !== validatedTerms.length) {
      errors.push(
        `عدم تطابق عدد المصطلحات مع بيان الحزمة (Manifest): المتوقع ${declared.terms}، والفعلي الصالح ${validatedTerms.length}.`
      );
    }
    if (
      typeof declared.sentences === 'number' &&
      declared.sentences !== validatedSentences.length
    ) {
      errors.push(
        `عدم تطابق عدد الجمل مع بيان الحزمة (Manifest): المتوقع ${declared.sentences}، والفعلي الصالح ${validatedSentences.length}.`
      );
    }
  }

  const dataVersion =
    isNonEmptyString(rawManifest.dataVersion)
      ? rawManifest.dataVersion.trim()
      : isNonEmptyString(rawVersionMeta.dataVersion)
      ? rawVersionMeta.dataVersion.trim()
      : isNonEmptyString(obj.dataVersion)
      ? String(obj.dataVersion).trim()
      : `${BUNDLED_DATA_VERSION}+local.${new Date().toISOString().slice(0, 10)}`;

  const manifest: DataPackageManifest = {
    packageId: isNonEmptyString(rawManifest.packageId)
      ? rawManifest.packageId.trim()
      : `umed2-pkg-${dataVersion}`,
    dataVersion,
    minAppVersion: incomingMinAppVersion,
    schemaVersion: incomingSchemaVersion,
    releasedAt: isNonEmptyString(rawManifest.releasedAt)
      ? rawManifest.releasedAt.trim()
      : isNonEmptyString(obj.exportedAt)
      ? String(obj.exportedAt).trim()
      : new Date().toISOString(),
    channel: rawManifest.channel === 'beta' ? 'beta' : 'stable',
    checksum: isNonEmptyString(rawManifest.checksum) ? rawManifest.checksum.trim() : undefined,
    description: isNonEmptyString(rawManifest.description)
      ? rawManifest.description.trim()
      : undefined,
    counts: {
      terms: validatedTerms.length,
      sentences: validatedSentences.length,
      topics: validatedTopics.length,
      affixes: validatedAffixes.length,
      abbreviations: validatedAbbreviations.length
    }
  };

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      manifest
    };
  }

  const payload: DataPackagePayload = {
    manifest,
    terms: validatedTerms,
    sentences: validatedSentences,
    topics: validatedTopics,
    customAffixes: validatedAffixes,
    customAbbreviations: validatedAbbreviations,
    studyStats:
      obj.studyStats && typeof obj.studyStats === 'object' && !Array.isArray(obj.studyStats)
        ? (obj.studyStats as DataPackagePayload['studyStats'])
        : undefined,
    settings:
      obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)
        ? (obj.settings as DataPackagePayload['settings'])
        : undefined
  };

  return {
    valid: true,
    errors: [],
    warnings,
    manifest,
    payload
  };
}

const CRC32_LOOKUP_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function computeCrc32Checksum(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_LOOKUP_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates a ZIP entry path against Zip Slip (`../`), null bytes, absolute paths,
 * Windows drive letters, excessive directory depth, and executable/malicious file extensions.
 */
export function validateSafeZipEntryPath(
  rawFileName: string,
  maxPathDepth: number = DEFAULT_ZIP_SECURITY_POLICY.maxPathDepth
): {
  safe: boolean;
  violationCode?: ZipSecurityViolationCode;
  reason?: string;
} {
  if (!rawFileName || rawFileName.includes('\0')) {
    return {
      safe: false,
      violationCode: 'ZIP_SLIP_TRAVERSAL',
      reason: `تم حظر ملف مشبوه داخل الأرشيف يحتوي على محارف غير صالحة (Null Byte).`
    };
  }

  if (
    rawFileName.startsWith('/') ||
    rawFileName.startsWith('\\') ||
    rawFileName.includes('\\') ||
    /^[a-zA-Z]:/.test(rawFileName)
  ) {
    return {
      safe: false,
      violationCode: 'ZIP_SLIP_TRAVERSAL',
      reason: `حماية Zip Slip: تم رفض المسار المطلق أو غير الآمن '${rawFileName}' داخل ملف ZIP.`
    };
  }

  const segments = rawFileName.split('/').filter((s) => s.length > 0);
  if (segments.some((seg) => seg === '..' || seg === '.' || seg.includes('..'))) {
    return {
      safe: false,
      violationCode: 'ZIP_SLIP_TRAVERSAL',
      reason: `حماية Zip Slip: تم اكتشاف محاولة اختراق مسارات (Path Traversal '../') في المدخل '${rawFileName}'.`
    };
  }

  if (segments.length > maxPathDepth) {
    return {
      safe: false,
      violationCode: 'ZIP_SLIP_TRAVERSAL',
      reason: `تم رفض المدخل '${rawFileName}': عمق المجلدات (${segments.length}) يتجاوز الحد الأمني المسموح (${maxPathDepth}).`
    };
  }

  const lower = rawFileName.toLowerCase().trim();
  for (const ext of DANGEROUS_ARCHIVE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return {
        safe: false,
        violationCode: 'DANGEROUS_FILE_TYPE',
        reason: `حماية أمنية: تم حظر ملف تنفيذي أو برمجي ضار ('${rawFileName}') داخل أرشيف البيانات.`
      };
    }
  }

  return { safe: true };
}

/**
 * Bounded Streaming DEFLATE Decompressor (Stage 5 Anti-Zip-Bomb Engine):
 * Reads decompressed chunks incrementally and aborts immediately if:
 * - Total decompressed bytes for the entry exceed `maxUncompressedBytes`, OR
 * - The real-time expansion ratio (`decompressed / compressed`) exceeds `maxRatio` (for payloads > 2 KB),
 * even if the attacker spoofed the uncompressed size in the ZIP header.
 */
async function inflateRawBytesBounded(
  compressed: Uint8Array,
  options: {
    entryName: string;
    maxUncompressedBytes: number;
    maxCompressionRatio: number;
  }
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream غير متوفر في هذه البيئة لفك ضغط ملفات ZIP.');
  }

  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const writePromise = writer
    .write(new Uint8Array(compressed))
    .then(() => writer.close())
    .catch(() => {
      // Handled by reader stream
    });

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalOut = 0;
  const compressedLen = Math.max(1, compressed.byteLength);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalOut += value.byteLength;

        if (totalOut > options.maxUncompressedBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `حماية Zip Bomb: تجاوز الملف '${options.entryName}' الحد الأقصى للحجم بعد فك الضغط (${Math.round(
              options.maxUncompressedBytes / 1024
            )} KB). تم إجهاض العملية فوراً.`
          );
        }

        const currentRatio = totalOut / compressedLen;
        if (totalOut > 2048 && currentRatio > options.maxCompressionRatio) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `حماية Zip Bomb: تم اكتشاف نسبة تمدد خطيرة (${Math.round(
              currentRatio
            )}:1) في الملف '${options.entryName}' تتجاوز الحد الآمن (${
              options.maxCompressionRatio
            }:1).`
          );
        }

        chunks.push(value);
      }
    }
  } finally {
    await writePromise;
  }

  const out = new Uint8Array(totalOut);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Inspects and extracts all `.json` files from a `.zip` archive while enforcing strict
 * Stage 5 Security & Reliability guards:
 * 1. SQLite binary rejection
 * 2. Compressed archive byte limit (`maxCompressedArchiveBytes`)
 * 3. Maximum entry count limit (`maxEntryCount`)
 * 4. Zip Slip / Path Traversal (`../`, absolute paths, deep nesting) & Executable payload blocklist
 * 5. Zip Bomb defense (header + real-time streaming decompression ratio & byte cap)
 * 6. CRC-32 cryptographic integrity verification per entry
 */
export async function inspectAndExtractSafeZipPackage(
  zipBytes: Uint8Array,
  customPolicy?: Partial<ZipSecurityPolicy>
): Promise<{
  inspection: ZipSecurityInspectionResult;
  jsonFiles: Record<string, unknown>;
}> {
  const policy: ZipSecurityPolicy = {
    ...DEFAULT_ZIP_SECURITY_POLICY,
    ...(customPolicy || {})
  };

  try {
    assertNotSqlitePayload(zipBytes);
  } catch (err) {
    return {
      inspection: {
        safe: false,
        archiveSizeBytes: zipBytes.byteLength,
        totalUncompressedBytes: 0,
        entryCount: 0,
        maxObservedCompressionRatio: 0,
        violationCode: 'SQLITE_FORBIDDEN',
        reason: err instanceof Error ? err.message : String(err)
      },
      jsonFiles: {}
    };
  }

  if (zipBytes.byteLength > policy.maxCompressedArchiveBytes) {
    return {
      inspection: {
        safe: false,
        archiveSizeBytes: zipBytes.byteLength,
        totalUncompressedBytes: 0,
        entryCount: 0,
        maxObservedCompressionRatio: 0,
        violationCode: 'ARCHIVE_TOO_LARGE',
        reason: `حجم أرشيف ZIP المضغوط (${(zipBytes.byteLength / (1024 * 1024)).toFixed(
          2
        )} MB) يتجاوز الحد الأمني المسموح (${(
          policy.maxCompressedArchiveBytes /
          (1024 * 1024)
        ).toFixed(1)} MB).`
      },
      jsonFiles: {}
    };
  }

  if (
    zipBytes.byteLength < 22 ||
    zipBytes[0] !== 0x50 ||
    zipBytes[1] !== 0x4b
  ) {
    return {
      inspection: {
        safe: false,
        archiveSizeBytes: zipBytes.byteLength,
        totalUncompressedBytes: 0,
        entryCount: 0,
        maxObservedCompressionRatio: 0,
        violationCode: 'CORRUPT_HEADER',
        reason: 'ملف ZIP غير صالح: ترويسة PK مفقودة.'
      },
      jsonFiles: {}
    };
  }

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

  // Locate End of Central Directory (EOCD) signature 0x06054b50 from the end of the buffer
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, zipBytes.byteLength - 65557);
  for (let i = zipBytes.byteLength - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return {
      inspection: {
        safe: false,
        archiveSizeBytes: zipBytes.byteLength,
        totalUncompressedBytes: 0,
        entryCount: 0,
        maxObservedCompressionRatio: 0,
        violationCode: 'CORRUPT_HEADER',
        reason: 'ملف ZIP تالف أو غير مكتمل: لم يتم العثور على دليل الأرشيف المركزي (EOCD).'
      },
      jsonFiles: {}
    };
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > policy.maxEntryCount) {
    return {
      inspection: {
        safe: false,
        archiveSizeBytes: zipBytes.byteLength,
        totalUncompressedBytes: 0,
        entryCount: totalEntries,
        maxObservedCompressionRatio: 0,
        violationCode: 'TOO_MANY_ENTRIES',
        reason: `تم رفض أرشيف ZIP: عدد الملفات بداخله (${totalEntries}) يتجاوز الحد الأقصى المسموح به (${policy.maxEntryCount} ملف).`
      },
      jsonFiles: {}
    };
  }

  const jsonFiles: Record<string, unknown> = {};
  const decoder = new TextDecoder('utf-8');
  let ptr = centralDirOffset;
  let cumulativeUncompressedBytes = 0;
  let maxObservedRatio = 1;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (ptr + 46 > zipBytes.byteLength || view.getUint32(ptr, true) !== 0x02014b50) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          violationCode: 'CORRUPT_HEADER',
          reason: 'ترويسة الدليل المركزي داخل ملف ZIP تالفة.'
        },
        jsonFiles: {}
      };
    }

    const compressionMethod = view.getUint16(ptr + 10, true);
    const expectedCrc32 = view.getUint32(ptr + 16, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const declaredUncompressedSize = view.getUint32(ptr + 24, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    if (ptr + 46 + fileNameLen > zipBytes.byteLength) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          violationCode: 'CORRUPT_HEADER',
          reason: 'اسم ملف مقطوع أو تالف في الدليل المركزي لأرشيف ZIP.'
        },
        jsonFiles: {}
      };
    }

    const rawFileName = decoder.decode(
      zipBytes.subarray(ptr + 46, ptr + 46 + fileNameLen)
    );
    ptr += 46 + fileNameLen + extraLen + commentLen;

    // 1. Validate EVERY entry path against Zip Slip & dangerous executables BEFORE ignoring or extracting
    const pathCheck = validateSafeZipEntryPath(rawFileName, policy.maxPathDepth);
    if (!pathCheck.safe) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: pathCheck.violationCode,
          reason: pathCheck.reason
        },
        jsonFiles: {}
      };
    }

    // 2. Check declared header sizes & ratios against Zip Bomb thresholds
    const headerRatio =
      compressedSize > 0 ? declaredUncompressedSize / compressedSize : declaredUncompressedSize;
    if (headerRatio > maxObservedRatio) {
      maxObservedRatio = Number(headerRatio.toFixed(1));
    }

    if (declaredUncompressedSize > policy.maxSingleEntryUncompressedBytes) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'ENTRY_TOO_LARGE',
          reason: `حماية Zip Bomb: الحجم المعلن للملف '${rawFileName}' (${(
            declaredUncompressedSize /
            (1024 * 1024)
          ).toFixed(2)} MB) يتجاوز الحد الأقصى المسموح للملف الواحد (${(
            policy.maxSingleEntryUncompressedBytes /
            (1024 * 1024)
          ).toFixed(1)} MB).`
        },
        jsonFiles: {}
      };
    }

    if (declaredUncompressedSize > 2048 && headerRatio > policy.maxCompressionRatio) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'ZIP_BOMB_RATIO',
          reason: `حماية Zip Bomb: نسبة الضغط للملف '${rawFileName}' (${Math.round(
            headerRatio
          )}:1) تتجاوز الحد الأمني المسموح (${policy.maxCompressionRatio}:1).`
        },
        jsonFiles: {}
      };
    }

    if (
      cumulativeUncompressedBytes + declaredUncompressedSize >
      policy.maxTotalUncompressedBytes
    ) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes + declaredUncompressedSize,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'TOTAL_UNCOMPRESSED_EXCEEDED',
          reason: `حماية Zip Bomb: إجمالي حجم البيانات بعد فك الضغط يتجاوز الحد الأقصى المسموح به (${(
            policy.maxTotalUncompressedBytes /
            (1024 * 1024)
          ).toFixed(1)} MB).`
        },
        jsonFiles: {}
      };
    }

    if (
      rawFileName.endsWith('/') ||
      rawFileName.includes('__MACOSX') ||
      rawFileName.split('/').pop()?.startsWith('._')
    ) {
      continue;
    }

    const baseName = (rawFileName.split('/').pop() || rawFileName).toLowerCase();
    try {
      assertNotSqlitePayload(new Uint8Array(0), baseName);
    } catch (err) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'SQLITE_FORBIDDEN',
          reason: err instanceof Error ? err.message : String(err)
        },
        jsonFiles: {}
      };
    }

    if (!baseName.endsWith('.json')) {
      continue;
    }

    if (
      localHeaderOffset + 30 > zipBytes.byteLength ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'CORRUPT_HEADER',
          reason: `ترويسة الملف المحلي داخل ZIP تالفة للملف '${rawFileName}'.`
        },
        jsonFiles: {}
      };
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBytes.byteLength) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'CORRUPT_HEADER',
          reason: `بيانات الملف '${rawFileName}' داخل ZIP تتجاوز حدود الأرشيف.`
        },
        jsonFiles: {}
      };
    }

    const compressedSlice = zipBytes.subarray(dataStart, dataEnd);
    let uncompressedBytes: Uint8Array;

    const remainingTotalAllowance = Math.min(
      policy.maxSingleEntryUncompressedBytes,
      policy.maxTotalUncompressedBytes - cumulativeUncompressedBytes
    );

    if (compressionMethod === 0) {
      if (compressedSlice.byteLength > remainingTotalAllowance) {
        return {
          inspection: {
            safe: false,
            archiveSizeBytes: zipBytes.byteLength,
            totalUncompressedBytes: cumulativeUncompressedBytes,
            entryCount: totalEntries,
            maxObservedCompressionRatio: maxObservedRatio,
            blockedEntryName: rawFileName,
            violationCode: 'ENTRY_TOO_LARGE',
            reason: `حجم الملف '${rawFileName}' يتجاوز الحد الأقصى المسموح.`
          },
          jsonFiles: {}
        };
      }
      uncompressedBytes = compressedSlice;
    } else if (compressionMethod === 8) {
      try {
        uncompressedBytes = await inflateRawBytesBounded(compressedSlice, {
          entryName: rawFileName,
          maxUncompressedBytes: remainingTotalAllowance,
          maxCompressionRatio: policy.maxCompressionRatio
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          inspection: {
            safe: false,
            archiveSizeBytes: zipBytes.byteLength,
            totalUncompressedBytes: cumulativeUncompressedBytes,
            entryCount: totalEntries,
            maxObservedCompressionRatio: maxObservedRatio,
            blockedEntryName: rawFileName,
            violationCode: msg.includes('نسبة تمدد') ? 'ZIP_BOMB_RATIO' : 'ENTRY_TOO_LARGE',
            reason: msg
          },
          jsonFiles: {}
        };
      }
    } else {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'CORRUPT_HEADER',
          reason: `طريقة ضغط ZIP غير مدعومة (${compressionMethod}) في الملف '${rawFileName}'. يرجى استخدام Store أو Deflate القياسي.`
        },
        jsonFiles: {}
      };
    }

    // 3. Verify actual extracted byte length & CRC-32 integrity
    const actualRatio =
      compressedSlice.byteLength > 0
        ? uncompressedBytes.byteLength / compressedSlice.byteLength
        : uncompressedBytes.byteLength;
    if (actualRatio > maxObservedRatio) {
      maxObservedRatio = Number(actualRatio.toFixed(1));
    }

    cumulativeUncompressedBytes += uncompressedBytes.byteLength;
    if (cumulativeUncompressedBytes > policy.maxTotalUncompressedBytes) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'TOTAL_UNCOMPRESSED_EXCEEDED',
          reason: `حماية Zip Bomb: تجاوز إجمالي البيانات المستخرجة الحد الأقصى المسموح (${Math.round(
            policy.maxTotalUncompressedBytes / 1024
          )} KB).`
        },
        jsonFiles: {}
      };
    }

    const actualCrc32 = computeCrc32Checksum(uncompressedBytes);
    if (expectedCrc32 !== 0 && actualCrc32 !== expectedCrc32) {
      return {
        inspection: {
          safe: false,
          archiveSizeBytes: zipBytes.byteLength,
          totalUncompressedBytes: cumulativeUncompressedBytes,
          entryCount: totalEntries,
          maxObservedCompressionRatio: maxObservedRatio,
          blockedEntryName: rawFileName,
          violationCode: 'CRC32_MISMATCH',
          reason: `فشل التحقق من سلامة الملف '${rawFileName}' داخل الأرشيف (CRC-32 Mismatch: المتوقع 0x${expectedCrc32.toString(
            16
          )}، والفعلي 0x${actualCrc32.toString(16)}).`
        },
        jsonFiles: {}
      };
    }

    assertNotSqlitePayload(uncompressedBytes, rawFileName);

    const jsonText = decoder.decode(uncompressedBytes);
    try {
      jsonFiles[baseName] = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(
        `خطأ في بناء JSON داخل ملف الأرشيف '${rawFileName}': ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  if (Object.keys(jsonFiles).length === 0) {
    throw new Error('أرشيف ZIP لا يحتوي على أي ملفات بيانات طبية بصيغة .json.');
  }

  return {
    inspection: {
      safe: true,
      archiveSizeBytes: zipBytes.byteLength,
      totalUncompressedBytes: cumulativeUncompressedBytes,
      entryCount: totalEntries,
      maxObservedCompressionRatio: maxObservedRatio
    },
    jsonFiles
  };
}

/**
 * Zero-dependency ZIP Archive Reader for UMED-2 Data Packages.
 * Extracts all `.json` files from a standard `.zip` archive while enforcing
 * Stage 5 security guards (Zip Bomb, Zip Slip, executable blocklist, CRC-32).
 */
export async function extractJsonFilesFromZipBytes(
  zipBytes: Uint8Array,
  customPolicy?: Partial<ZipSecurityPolicy>
): Promise<Record<string, unknown>> {
  const { inspection, jsonFiles } = await inspectAndExtractSafeZipPackage(zipBytes, customPolicy);
  if (!inspection.safe) {
    throw new Error(
      inspection.reason || 'تم رفض ملف ZIP بواسطة درع الحماية الأمنية (ZIP Security Guard).'
    );
  }
  return jsonFiles;
}

/**
 * Combines modular JSON files from a ZIP archive (`manifest.json`, `terms.json`, `sentences.json`,
 * `topics.json`, `affixes.json`, `abbreviations.json`) OR a single unified JSON file inside the ZIP
 * into a unified object ready for `validateDataPackageObject`.
 */
export function assemblePackageFromZipJsonMap(
  jsonFiles: Record<string, unknown>
): Record<string, unknown> {
  const fileNames = Object.keys(jsonFiles);
  if (fileNames.length === 1) {
    const single = jsonFiles[fileNames[0]];
    if (single && typeof single === 'object') {
      return Array.isArray(single)
        ? { terms: single }
        : (single as Record<string, unknown>);
    }
  }

  const combined: Record<string, unknown> = {};

  for (const [name, content] of Object.entries(jsonFiles)) {
    if (name === 'manifest.json' && content && typeof content === 'object') {
      combined.manifest = content;
    } else if (name === 'terms.json' && Array.isArray(content)) {
      combined.terms = content;
    } else if (name === 'sentences.json' && Array.isArray(content)) {
      combined.sentences = content;
    } else if (name === 'topics.json' && Array.isArray(content)) {
      combined.topics = content;
    } else if (
      (name === 'affixes.json' || name === 'customaffixes.json' || name === 'morphology.json') &&
      Array.isArray(content)
    ) {
      combined.customAffixes = content;
    } else if (
      (name === 'abbreviations.json' || name === 'customabbreviations.json') &&
      Array.isArray(content)
    ) {
      combined.customAbbreviations = content;
    } else if (
      (name === 'data.json' ||
        name === 'package.json' ||
        name === 'database.json' ||
        name.includes('dictengine')) &&
      content &&
      typeof content === 'object' &&
      !Array.isArray(content)
    ) {
      Object.assign(combined, content);
    }
  }

  if (
    !combined.terms &&
    !combined.sentences &&
    !combined.topics &&
    !combined.customAffixes &&
    !combined.customAbbreviations
  ) {
    for (const content of Object.values(jsonFiles)) {
      if (content && typeof content === 'object' && !Array.isArray(content)) {
        const candidate = content as Record<string, unknown>;
        if (
          Array.isArray(candidate.terms) ||
          Array.isArray(candidate.sentences) ||
          Array.isArray(candidate.topics)
        ) {
          Object.assign(combined, candidate);
        }
      }
    }
  }

  return combined;
}

/**
 * Parses and validates either a `.json` or `.zip` File / Uint8Array / JSON string.
 * Enforces the JSON/ZIP-only policy, Stage 5 ZIP security limits, and rejects SQLite or malformed files before any storage mutation.
 */
export async function parseAndValidateImportInput(
  input: File | Uint8Array | string,
  fileNameHint?: string,
  zipPolicy?: Partial<ZipSecurityPolicy>
): Promise<{
  sourceFormat: 'json' | 'zip';
  validation: DataValidationResult;
}> {
  const effectivePolicy: ZipSecurityPolicy = {
    ...DEFAULT_ZIP_SECURITY_POLICY,
    ...(zipPolicy || {})
  };

  const fileName =
    typeof input !== 'string' && 'name' in input ? input.name : fileNameHint || '';

  if (fileName) {
    const lower = fileName.toLowerCase().trim();
    assertNotSqlitePayload(new Uint8Array(0), lower);
    if (!lower.endsWith('.json') && !lower.endsWith('.zip')) {
      throw new Error(
        `صيغة الملف '${fileName}' غير مدعومة لحزم البيانات الموحدة. يُسمح فقط بملفات .json و .zip.`
      );
    }
  }

  if (typeof input === 'string') {
    const byteLen = new TextEncoder().encode(input).byteLength;
    if (byteLen > effectivePolicy.maxTotalUncompressedBytes) {
      throw new Error(
        `حجم ملف JSON (${(byteLen / (1024 * 1024)).toFixed(
          2
        )} MB) يتجاوز الحد الأقصى المسموح به (${(
          effectivePolicy.maxTotalUncompressedBytes /
          (1024 * 1024)
        ).toFixed(1)} MB).`
      );
    }
    assertNotSqlitePayload(input, fileName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      throw new Error(
        `ملف JSON غير صالح: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return {
      sourceFormat: 'json',
      validation: validateDataPackageObject(parsed)
    };
  }

  if (
    typeof File !== 'undefined' &&
    input instanceof File &&
    input.size > effectivePolicy.maxDownloadBytes
  ) {
    throw new Error(
      `حجم الملف '${input.name}' (${(input.size / (1024 * 1024)).toFixed(
        2
      )} MB) يتجاوز الحد الأمني الأقصى المسموح (${(
        effectivePolicy.maxDownloadBytes /
        (1024 * 1024)
      ).toFixed(1)} MB).`
    );
  }

  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(await (input as File).arrayBuffer());

  assertNotSqlitePayload(bytes, fileName);

  const isZipSignature =
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05);

  if (isZipSignature || fileName.toLowerCase().endsWith('.zip')) {
    const jsonMap = await extractJsonFilesFromZipBytes(bytes, effectivePolicy);
    const combinedObject = assemblePackageFromZipJsonMap(jsonMap);
    return {
      sourceFormat: 'zip',
      validation: validateDataPackageObject(combinedObject)
    };
  }

  if (bytes.byteLength > effectivePolicy.maxTotalUncompressedBytes) {
    throw new Error(
      `حجم ملف JSON (${(bytes.byteLength / (1024 * 1024)).toFixed(
        2
      )} MB) يتجاوز الحد الأقصى المسموح (${(
        effectivePolicy.maxTotalUncompressedBytes /
        (1024 * 1024)
      ).toFixed(1)} MB).`
    );
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  assertNotSqlitePayload(text, fileName);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `ملف JSON تالف أو غير صالح: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    sourceFormat: 'json',
    validation: validateDataPackageObject(parsed)
  };
}

/**
 * Creates a standard, uncompressed (Store method 0) ZIP archive in memory containing modular
 * UMED-2 JSON files (`manifest.json`, `terms.json`, `sentences.json`, `topics.json`, `affixes.json`, `abbreviations.json`).
 * Zero external dependencies.
 */
export function buildDataPackageZipBytes(payload: DataPackagePayload): Uint8Array {
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const encoder = new TextEncoder();

  const fileMap: Record<string, unknown> = {
    'manifest.json': payload.manifest,
    'terms.json': payload.terms,
    'sentences.json': payload.sentences,
    'topics.json': payload.topics,
    'affixes.json': payload.customAffixes,
    'abbreviations.json': payload.customAbbreviations
  };

  for (const [name, content] of Object.entries(fileMap)) {
    files.push({
      name,
      data: encoder.encode(JSON.stringify(content, null, 2))
    });
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  const computeCrc32 = (buf: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(file.data);
    const size = file.data.byteLength;

    const local = new Uint8Array(30 + nameBytes.byteLength + size);
    const lView = new DataView(local.buffer);
    lView.setUint32(0, 0x04034b50, true);
    lView.setUint16(4, 20, true);
    lView.setUint16(6, 0x0800, true);
    lView.setUint16(8, 0, true);
    lView.setUint16(10, 0, true);
    lView.setUint16(12, 0, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true);
    lView.setUint32(22, size, true);
    lView.setUint16(26, nameBytes.byteLength, true);
    lView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.byteLength);
    localHeaders.push(local);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const cView = new DataView(central.buffer);
    cView.setUint32(0, 0x02014b50, true);
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0x0800, true);
    cView.setUint16(10, 0, true);
    cView.setUint16(12, 0, true);
    cView.setUint16(14, 0, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, size, true);
    cView.setUint32(24, size, true);
    cView.setUint16(28, nameBytes.byteLength, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.byteLength;
  }

  const centralDirSize = centralHeaders.reduce((acc, b) => acc + b.byteLength, 0);
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, files.length, true);
  eView.setUint16(10, files.length, true);
  eView.setUint32(12, centralDirSize, true);
  eView.setUint32(16, offset, true);
  eView.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const l of localHeaders) {
    out.set(l, pos);
    pos += l.byteLength;
  }
  for (const c of centralHeaders) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  out.set(eocd, pos);
  return out;
}

/**
 * Computes the lowercase 64-character hexadecimal SHA-256 digest of a byte buffer
 * using the standard Web Crypto API (`crypto.subtle.digest`).
 */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('واجهة Web Crypto API غير متوفرة لحساب بصمة التحقق SHA-256.');
  }
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', slice);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/\s+/g, '');
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  throw new Error('فك ترميز Base64 غير مدعوم في هذه البيئة.');
}

function normalizeExpectedSha256Hex(rawExpected: string): string {
  const trimmed = rawExpected
    .trim()
    .replace(/^sha-?256:/i, '')
    .trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Support base64-encoded 32-byte SHA-256 digest if provided
  try {
    const decoded = decodeBase64ToBytes(trimmed);
    if (decoded.byteLength === 32) {
      return Array.from(decoded)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall through
  }

  return trimmed.toLowerCase();
}

/**
 * Verifies the SHA-256 checksum of downloaded package bytes before importing.
 */
export async function verifyPackageChecksum(
  bytes: Uint8Array,
  expectedChecksum?: string
): Promise<{
  valid: boolean;
  actualHex: string;
  expectedHex: string;
  reason?: string;
}> {
  const actualHex = await computeSha256Hex(bytes);

  if (!expectedChecksum || !expectedChecksum.trim()) {
    return {
      valid: false,
      actualHex,
      expectedHex: '',
      reason:
        'بيان التحديث السحابي (Manifest) لا يحتوي على بصمة التحقق الإلزامية SHA-256 (checksum / sha256).'
    };
  }

  const expectedHex = normalizeExpectedSha256Hex(expectedChecksum);
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) {
    return {
      valid: false,
      actualHex,
      expectedHex,
      reason: `صيغة بصمة SHA-256 في بيان التحديث غير صالحة (${expectedChecksum}).`
    };
  }

  if (actualHex !== expectedHex) {
    return {
      valid: false,
      actualHex,
      expectedHex,
      reason: `فشل التحقق من تكامل الحزمة (SHA-256 Mismatch): البصمة المتوقعة ${expectedHex.slice(
        0,
        12
      )}... لا تطابق البصمة الفعلية للملف المحمّل ${actualHex.slice(0, 12)}...`
    };
  }

  return {
    valid: true,
    actualHex,
    expectedHex
  };
}

/**
 * Supported signature algorithms, with ECDSA-P256-SHA256 as the authoritative production standard.
 */
export const PRODUCTION_SIGNATURE_ALGORITHM: SignatureAlgorithm = 'ECDSA-P256-SHA256';
const SUPPORTED_SIGNATURE_ALGORITHMS = new Set<string>([
  'ECDSA-P256-SHA256',
  'RSASSA-PKCS1-v1_5-SHA256',
  'Ed25519'
]);

export function assertValidSignatureAlgorithm(
  algorithm: unknown,
  options?: { requireProductionEcdsa?: boolean }
): SignatureAlgorithm {
  const algoStr = typeof algorithm === 'string' ? algorithm.trim() : '';
  if (!algoStr || !SUPPORTED_SIGNATURE_ALGORITHMS.has(algoStr)) {
    throw new Error(
      `خوارزمية التوقيع الرقمي غير مدعومة أو غير صالحة (${String(
        algorithm || 'فارغة'
      )}). الخوارزمية المعتمدة للإنتاج هي ECDSA-P256-SHA256.`
    );
  }
  if (options?.requireProductionEcdsa && algoStr !== PRODUCTION_SIGNATURE_ALGORITHM) {
    throw new Error(
      `يُشترط استخدام خوارزمية التوقيع القياسية ${PRODUCTION_SIGNATURE_ALGORITHM} حصراً لإصدارات الإنتاج (تم تمرير: ${algoStr}).`
    );
  }
  return algoStr as SignatureAlgorithm;
}

/**
 * Normalizes a PEM string (handling escaped "\\n" sequences from environment variables or secrets).
 */
export function normalizePemString(rawPem: string): string {
  return (rawPem || '').replace(/\\n/g, '\n').trim();
}

/**
 * Parses an SPKI PEM public key (`-----BEGIN PUBLIC KEY-----`) or raw base64 SPKI string into an ArrayBuffer.
 * Note: Only PUBLIC keys are ever parsed or used by the client. Private keys are explicitly rejected.
 */
export function parsePublicKeyPemToSpkiBuffer(
  publicKeyPem: string,
  options?: { strictPemHeaders?: boolean }
): ArrayBuffer {
  const trimmed = normalizePemString(publicKeyPem);
  if (!trimmed) {
    throw new Error('المفتاح العام (Public Key PEM) فارغ أو غير صالح.');
  }
  if (trimmed.includes('PRIVATE KEY')) {
    throw new Error(
      'خطأ أمني: يُمنع إدخال مفاتيح خاصة (Private Keys) داخل التطبيق أو حقل المفتاح العام. يرجى استخدام المفتاح العام (PUBLIC KEY) فقط.'
    );
  }
  if (
    trimmed.includes('-----BEGIN RSA PUBLIC KEY-----') ||
    trimmed.includes('-----BEGIN EC PUBLIC KEY-----')
  ) {
    throw new Error(
      'صيغة المفتاح العام غير مدعومة: يجب تصدير المفتاح العام بصيغة SPKI PEM القياسية (-----BEGIN PUBLIC KEY-----).'
    );
  }
  if (
    options?.strictPemHeaders &&
    (!trimmed.includes('-----BEGIN PUBLIC KEY-----') ||
      !trimmed.includes('-----END PUBLIC KEY-----'))
  ) {
    throw new Error(
      'صيغة المفتاح العام غير صالحة: يجب أن يكون بصيغة SPKI PEM ويحتوي على الترويسة -----BEGIN PUBLIC KEY----- و -----END PUBLIC KEY-----.'
    );
  }
  const stripped = trimmed
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!stripped || !/^[A-Za-z0-9+/=_-]+$/.test(stripped)) {
    throw new Error('المفتاح العام (Public Key PEM) فارغ أو يحتوي على محارف غير صالحة.');
  }
  const bytes = decodeBase64ToBytes(stripped);
  if (bytes.byteLength < 32) {
    throw new Error('بيانات المفتاح العام (SPKI) قصيرة جداً أو تالفة.');
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeSignatureToBytes(signatureStr: string): Uint8Array {
  const clean = signatureStr.trim().replace(/^sig:/i, '').trim();
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0 && clean.length >= 128) {
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return decodeBase64ToBytes(clean);
}

/**
 * Converts an ASN.1 DER-encoded ECDSA signature (as produced by OpenSSL CLI)
 * into IEEE P1363 64-byte (r || s) format expected by Web Crypto `ECDSA` verification.
 * If the signature is already 64 bytes (P1363), returns it unchanged.
 */
function ecdsaDerToP1363IfNeeded(sigBytes: Uint8Array, componentLength = 32): Uint8Array {
  if (sigBytes.byteLength === componentLength * 2) {
    return sigBytes;
  }
  if (sigBytes.byteLength < 8 || sigBytes[0] !== 0x30) {
    return sigBytes;
  }
  try {
    let offset = 2;
    if (sigBytes[1] & 0x80) {
      const lenBytes = sigBytes[1] & 0x7f;
      offset = 2 + lenBytes;
    }
    if (sigBytes[offset] !== 0x02) return sigBytes;
    const rLen = sigBytes[offset + 1];
    const rBytes = sigBytes.subarray(offset + 2, offset + 2 + rLen);
    offset = offset + 2 + rLen;

    if (sigBytes[offset] !== 0x02) return sigBytes;
    const sLen = sigBytes[offset + 1];
    const sBytes = sigBytes.subarray(offset + 2, offset + 2 + sLen);

    const normalizeInt = (slice: Uint8Array): Uint8Array => {
      let clean = slice;
      while (clean.length > componentLength && clean[0] === 0x00) {
        clean = clean.subarray(1);
      }
      if (clean.length > componentLength) return clean;
      const padded = new Uint8Array(componentLength);
      padded.set(clean, componentLength - clean.length);
      return padded;
    };

    const rNorm = normalizeInt(rBytes);
    const sNorm = normalizeInt(sBytes);
    if (rNorm.length !== componentLength || sNorm.length !== componentLength) {
      return sigBytes;
    }

    const out = new Uint8Array(componentLength * 2);
    out.set(rNorm, 0);
    out.set(sNorm, componentLength);
    return out;
  } catch {
    return sigBytes;
  }
}

/**
 * Verifies the cryptographic digital signature of a downloaded data package using a configurable Public Key.
 * Never invents, stores, or exposes private signing keys.
 */
export async function verifyPackageSignature(options: {
  bytes: Uint8Array;
  signature?: string;
  publicKeyPem?: string;
  requireSignature?: boolean;
  algorithm?: SignatureAlgorithm;
}): Promise<{
  verified: boolean;
  skipped: boolean;
  reason?: string;
}> {
  const hasPublicKey = Boolean(options.publicKeyPem && options.publicKeyPem.trim().length > 0);
  const mustVerify = Boolean(options.requireSignature || hasPublicKey);

  if (!mustVerify) {
    return {
      verified: false,
      skipped: true
    };
  }

  if (!hasPublicKey) {
    return {
      verified: false,
      skipped: false,
      reason:
        'تم تفعيل اشتراط التوقيع الرقمي للحزم السحابية ولكن لم يتم تكوين المفتاح العام (Public Key PEM) في إعدادات التحديث.'
    };
  }

  if (!options.signature || !options.signature.trim()) {
    return {
      verified: false,
      skipped: false,
      reason:
        'تم رفض التحديث: المفتاح العام مفعّل ولكن بيان الحزمة (Manifest) لا يحتوي على توقيع رقمي (signature).'
    };
  }

  try {
    const algo = assertValidSignatureAlgorithm(options.algorithm || 'ECDSA-P256-SHA256');
    const spkiBuffer = parsePublicKeyPemToSpkiBuffer(options.publicKeyPem!);
    const rawSigBytes = decodeSignatureToBytes(options.signature);
    const dataBuffer = options.bytes.buffer.slice(
      options.bytes.byteOffset,
      options.bytes.byteOffset + options.bytes.byteLength
    ) as ArrayBuffer;

    let isValid = false;

    if (algo === 'ECDSA-P256-SHA256') {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const p1363Sig = ecdsaDerToP1363IfNeeded(rawSigBytes, 32);
      const sigBuf = p1363Sig.buffer.slice(
        p1363Sig.byteOffset,
        p1363Sig.byteOffset + p1363Sig.byteLength
      ) as ArrayBuffer;
      isValid = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        cryptoKey,
        sigBuf,
        dataBuffer
      );
    } else if (algo === 'RSASSA-PKCS1-v1_5-SHA256') {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
        false,
        ['verify']
      );
      const sigBuf = rawSigBytes.buffer.slice(
        rawSigBytes.byteOffset,
        rawSigBytes.byteOffset + rawSigBytes.byteLength
      ) as ArrayBuffer;
      isValid = await globalThis.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        sigBuf,
        dataBuffer
      );
    } else if (algo === 'Ed25519') {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'Ed25519' },
        false,
        ['verify']
      );
      const sigBuf = rawSigBytes.buffer.slice(
        rawSigBytes.byteOffset,
        rawSigBytes.byteOffset + rawSigBytes.byteLength
      ) as ArrayBuffer;
      isValid = await globalThis.crypto.subtle.verify(
        { name: 'Ed25519' },
        cryptoKey,
        sigBuf,
        dataBuffer
      );
    }

    if (!isValid) {
      return {
        verified: false,
        skipped: false,
        reason:
          'فشل التحقق من التوقيع الرقمي للحزمة باستخدام المفتاح العام المُعدّ. تم رفض الحزمة لحماية سلامة البيانات.'
      };
    }

    return {
      verified: true,
      skipped: false
    };
  } catch (err) {
    return {
      verified: false,
      skipped: false,
      reason: `خطأ أثناء التحقق من التوقيع الرقمي بالمفتاح العام: ${
        err instanceof Error ? err.message : String(err)
      }`
    };
  }
}

function resolveDownloadUrl(manifestUrl: string, downloadUrl?: string): string | undefined {
  if (!downloadUrl || !downloadUrl.trim()) return undefined;
  const trimmed = downloadUrl.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    return new URL(trimmed, manifestUrl).toString();
  } catch {
    return trimmed;
  }
}

/**
 * Connects to a configurable GitHub/CDN manifest endpoint, validates App & Schema compatibility,
 * and compares the remote `dataVersion` against the currently installed `dataVersion`.
 */
export async function checkRemoteDataManifest(
  manifestUrl: string,
  options?: {
    installedDataVersion?: string;
    channel?: 'stable' | 'beta';
    customFetch?: typeof fetch;
  }
): Promise<{
  updateAvailable: boolean;
  compatible: boolean;
  installedDataVersion: string;
  manifest: DataPackageManifest;
  reason?: string;
}> {
  const cleanUrl = manifestUrl.trim();
  if (!cleanUrl) {
    throw new Error('لم يتم تحديد رابط بيان التحديث السحابي (Manifest URL).');
  }

  const fetchFn = options?.customFetch || globalThis.fetch;
  const response = await fetchFn(cleanUrl, {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب بيان التحديث من الخادم (${response.status} ${response.statusText}).`
    );
  }

  const raw = (await response.json()) as Partial<DataPackageManifest> & Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || !isNonEmptyString(raw.dataVersion)) {
    throw new Error('صيغة ملف بيان التحديث (manifest.json) غير صالحة: الحقل dataVersion مفقود.');
  }

  const compat = checkManifestCompatibility(raw);
  const checksumVal = isNonEmptyString(raw.sha256)
    ? raw.sha256.trim()
    : isNonEmptyString(raw.checksum)
    ? raw.checksum.trim()
    : undefined;

  const sigAlgo: SignatureAlgorithm | undefined =
    raw.signatureAlgorithm === 'ECDSA-P256-SHA256' ||
    raw.signatureAlgorithm === 'RSASSA-PKCS1-v1_5-SHA256' ||
    raw.signatureAlgorithm === 'Ed25519'
      ? raw.signatureAlgorithm
      : undefined;

  const manifest: DataPackageManifest = {
    packageId: isNonEmptyString(raw.packageId)
      ? raw.packageId.trim()
      : `umed2-remote-${raw.dataVersion.trim()}`,
    dataVersion: raw.dataVersion.trim(),
    minAppVersion: isNonEmptyString(raw.minAppVersion) ? raw.minAppVersion.trim() : APP_VERSION,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : DB_SCHEMA_VERSION,
    releasedAt: isNonEmptyString(raw.releasedAt)
      ? raw.releasedAt.trim()
      : new Date().toISOString(),
    channel: raw.channel === 'beta' ? 'beta' : 'stable',
    checksum: checksumVal,
    sha256: checksumVal,
    signature: isNonEmptyString(raw.signature) ? raw.signature.trim() : undefined,
    signatureAlgorithm: sigAlgo,
    description: isNonEmptyString(raw.description) ? raw.description.trim() : undefined,
    downloadUrl: resolveDownloadUrl(cleanUrl, raw.downloadUrl),
    counts:
      raw.counts && typeof raw.counts === 'object'
        ? {
            terms: Number(raw.counts.terms) || 0,
            sentences: Number(raw.counts.sentences) || 0,
            topics: Number(raw.counts.topics) || 0,
            affixes: Number(raw.counts.affixes) || 0,
            abbreviations: Number(raw.counts.abbreviations) || 0
          }
        : { terms: 0, sentences: 0, topics: 0, affixes: 0, abbreviations: 0 }
  };

  const installedDataVersion = options?.installedDataVersion || BUNDLED_DATA_VERSION;
  const isNewer = compareDataVersions(manifest.dataVersion, installedDataVersion) > 0;

  return {
    updateAvailable: isNewer,
    compatible: compat.compatible,
    installedDataVersion,
    manifest,
    reason: compat.reason
  };
}

/**
 * Downloads a remote `.zip` or `.json` medical data package with streaming byte progress
 * and strict Stage 5 download size protection (`maxDownloadBytes`).
 * Immediately cancels the stream if `Content-Length` or actual streamed bytes exceed `maxDownloadBytes`.
 */
export async function downloadRemotePackageBytes(
  downloadUrl: string,
  options?: {
    onProgress?: (progressPercent: number | null) => void;
    customFetch?: typeof fetch;
    maxDownloadBytes?: number;
  }
): Promise<Uint8Array> {
  const cleanUrl = downloadUrl.trim();
  if (!cleanUrl) {
    throw new Error('بيان التحديث لا يحتوي على رابط تنزيل صالح (downloadUrl).');
  }

  const maxDownloadBytes =
    options?.maxDownloadBytes && options.maxDownloadBytes > 0
      ? options.maxDownloadBytes
      : DEFAULT_ZIP_SECURITY_POLICY.maxDownloadBytes;

  assertNotSqlitePayload(new Uint8Array(0), cleanUrl.split('?')[0]);

  const fetchFn = options?.customFetch || globalThis.fetch;
  const response = await fetchFn(cleanUrl, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      `فشل تنزيل حزمة البيانات الطبية (${response.status} ${response.statusText}).`
    );
  }

  const contentLengthHeader = response.headers?.get?.('content-length');
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  if (totalBytes > maxDownloadBytes) {
    if (response.body && typeof response.body.cancel === 'function') {
      await response.body.cancel().catch(() => {});
    }
    throw new Error(
      `حماية التنزيل الأمني: حجم الحزمة المعلن في الترويسة (${(
        totalBytes /
        (1024 * 1024)
      ).toFixed(2)} MB) يتجاوز الحد الأقصى المسموح للتنزيل (${(
        maxDownloadBytes /
        (1024 * 1024)
      ).toFixed(2)} MB).`
    );
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedLength += value.byteLength;
        if (receivedLength > maxDownloadBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `حماية التنزيل المتدفق: تم قطع الاتصال فوراً لأن البيانات المتدفقة (${Math.round(
              receivedLength / 1024
            )} KB) تجاوزت السقف الأمني المسموح (${Math.round(maxDownloadBytes / 1024)} KB).`
          );
        }
        chunks.push(value);
        if (totalBytes > 0 && options?.onProgress) {
          const pct = Math.min(99, Math.round((receivedLength / totalBytes) * 100));
          options.onProgress(pct);
        }
      }
    }

    const combined = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.byteLength;
    }
    options?.onProgress?.(100);
    assertNotSqlitePayload(combined, cleanUrl.split('?')[0]);
    return combined;
  }

  const ab = await response.arrayBuffer();
  const bytes = new Uint8Array(ab);
  if (bytes.byteLength > maxDownloadBytes) {
    throw new Error(
      `حماية التنزيل الأمني: حجم الحزمة المحمّلة (${Math.round(
        bytes.byteLength / 1024
      )} KB) يتجاوز الحد الأقصى المسموح (${Math.round(maxDownloadBytes / 1024)} KB).`
    );
  }
  options?.onProgress?.(100);
  assertNotSqlitePayload(bytes, cleanUrl.split('?')[0]);
  return bytes;
}

/**
 * Serializes a DataPackagePayload into canonical JSON bytes and computes its SHA-256 hex digest.
 * Used for creating tamper-evident local backups before updates and verifying them before rollback.
 */
export async function computeBackupPayloadSha256(
  payload: DataPackagePayload
): Promise<{
  sha256Hex: string;
  sizeKb: number;
}> {
  const { checksum: _c, sha256: _s, ...manifestWithoutHash } = payload.manifest || ({} as DataPackageManifest);
  const canonical = {
    manifest: manifestWithoutHash,
    terms: payload.terms,
    sentences: payload.sentences,
    topics: payload.topics,
    customAffixes: payload.customAffixes,
    customAbbreviations: payload.customAbbreviations
  };
  const jsonString = JSON.stringify(canonical);
  const bytes = new TextEncoder().encode(jsonString);
  const sha256Hex = await computeSha256Hex(bytes);
  const sizeKb = Number((bytes.byteLength / 1024).toFixed(1));
  return { sha256Hex, sizeKb };
}

/**
 * Verifies the cryptographic SHA-256 integrity, schema compatibility, and item-level validity
 * of a stored DataBackupRecord before allowing rollback or restoration.
 */
export async function verifyBackupRecordIntegrity(
  record: DataBackupRecord
): Promise<BackupVerificationResult> {
  const errors: string[] = [];

  if (!record || typeof record !== 'object' || !record.payload) {
    return {
      valid: false,
      backupId: record?.backupId || 'unknown',
      dataVersion: record?.versionMetadata?.dataVersion || '0.0.0',
      expectedSha256: record?.sha256Checksum || '',
      actualSha256: '',
      schemaCompatible: false,
      errors: ['سجل النسخة الاحتياطية مفقود أو تالف هيكلياً.']
    };
  }

  const { sha256Hex: actualSha256 } = await computeBackupPayloadSha256(record.payload);
  const expectedSha256 = (record.sha256Checksum || '').trim().toLowerCase();

  if (!expectedSha256 || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    errors.push('بصمة التحقق SHA-256 المخزنة في النسخة الاحتياطية مفقودة أو غير صالحة.');
  } else if (actualSha256 !== expectedSha256) {
    errors.push(
      `فشل التحقق من سلامة النسخة الاحتياطية (SHA-256 Mismatch): البصمة المتوقعة ${expectedSha256.slice(
        0,
        12
      )}... لا تطابق البصمة الفعلية ${actualSha256.slice(0, 12)}...`
    );
  }

  const compat = checkManifestCompatibility(record.manifest || {});
  if (!compat.compatible && compat.reason) {
    errors.push(compat.reason);
  }

  const validation = validateDataPackageObject(record.payload);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  return {
    valid: errors.length === 0,
    backupId: record.backupId,
    dataVersion: record.versionMetadata?.dataVersion || record.manifest?.dataVersion || '0.0.0',
    expectedSha256,
    actualSha256,
    schemaCompatible: compat.compatible,
    errors
  };
}

/**
 * ============================================================================
 * STAGE 4: DATA PUBLISHING, AUTOMATIC MANIFEST, VERSIONING & RELEASE GATEKEEPER
 * ============================================================================
 */

export const DEFAULT_CDN_RELEASE_BASE_URL = 'https://raw.githubusercontent.com/Alssaedy50/UMED-2/main/releases';

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return globalThis.btoa(binary);
  }
  const nodeBuf = (
    globalThis as unknown as {
      Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } };
    }
  ).Buffer;
  if (nodeBuf) {
    return nodeBuf.from(bytes).toString('base64');
  }
  throw new Error('تعذر ترميز Base64 في بيئة التشغيل الحالية.');
}

function formatPemBlock(base64Str: string, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  const clean = base64Str.replace(/\s+/g, '');
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += 64) {
    lines.push(clean.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/**
 * Parses a PKCS#8 PEM private key (`-----BEGIN PRIVATE KEY-----`) for the Release Publisher Studio.
 * Note: Private keys are used strictly in the Publisher tool to sign outgoing releases and are never sent to update clients.
 */
export function parsePrivateKeyPemToPkcs8Buffer(
  privateKeyPem: string,
  options?: { strictPemHeaders?: boolean }
): ArrayBuffer {
  const trimmed = normalizePemString(privateKeyPem);
  if (!trimmed) {
    throw new Error('مفتاح التوقيع الخاص (Private Key PEM) فارغ.');
  }
  if (trimmed.includes('BEGIN PUBLIC KEY') && !trimmed.includes('PRIVATE KEY')) {
    throw new Error(
      'تم تمرير مفتاح عام (PUBLIC KEY) بدلاً من مفتاح التوقيع الخاص (PRIVATE KEY).'
    );
  }
  if (
    trimmed.includes('-----BEGIN EC PRIVATE KEY-----') ||
    trimmed.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    trimmed.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')
  ) {
    throw new Error(
      'صيغة المفتاح الخاص غير مدعومة: يجب أن يكون بصيغة PKCS#8 PEM غير المشفرة (-----BEGIN PRIVATE KEY-----).'
    );
  }
  if (
    options?.strictPemHeaders &&
    (!trimmed.includes('-----BEGIN PRIVATE KEY-----') ||
      !trimmed.includes('-----END PRIVATE KEY-----'))
  ) {
    throw new Error(
      'صيغة مفتاح التوقيع الخاص غير صالحة: يجب أن يكون بصيغة PKCS#8 PEM ويحتوي على الترويسة -----BEGIN PRIVATE KEY----- و -----END PRIVATE KEY-----.'
    );
  }
  const stripped = trimmed
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!stripped || !/^[A-Za-z0-9+/=_-]+$/.test(stripped)) {
    throw new Error('صيغة مفتاح التوقيع الخاص (PKCS#8 PEM) غير صالحة.');
  }
  const bytes = decodeBase64ToBytes(stripped);
  if (bytes.byteLength < 32) {
    throw new Error('بيانات مفتاح التوقيع الخاص (PKCS#8) قصيرة جداً أو تالفة.');
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Computes the full 64-character lowercase SHA-256 hex digest of an SPKI Public Key PEM.
 */
export async function computePublicKeyFullSha256Hex(publicKeyPem: string): Promise<string> {
  const spkiBuffer = parsePublicKeyPemToSpkiBuffer(publicKeyPem);
  return computeSha256Hex(new Uint8Array(spkiBuffer));
}

/**
 * Computes a short SHA-256 fingerprint (first 16 hex chars) for a Public Key PEM to identify which key signed a release.
 */
export async function computePublicKeyFingerprintSha256(publicKeyPem: string): Promise<string> {
  const fullHex = await computePublicKeyFullSha256Hex(publicKeyPem);
  return fullHex.slice(0, 16);
}

/**
 * Verifies that a PKCS#8 Private Key PEM and an SPKI Public Key PEM are valid, use the expected algorithm,
 * and cryptographically match by signing and verifying a deterministic test challenge payload.
 */
export async function verifyPublisherKeyPairMatch(options: {
  privateKeyPem: string;
  publicKeyPem: string;
  algorithm?: SignatureAlgorithm;
  requireProductionEcdsa?: boolean;
  strictPemHeaders?: boolean;
}): Promise<{
  valid: boolean;
  algorithm: SignatureAlgorithm;
  keyId: string;
  fingerprintSha256: string;
  fullFingerprintSha256: string;
  reason?: string;
}> {
  try {
    const privTrimmed = normalizePemString(options.privateKeyPem || '');
    const pubTrimmed = normalizePemString(options.publicKeyPem || '');

    if (!privTrimmed) {
      return {
        valid: false,
        algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
        keyId: '',
        fingerprintSha256: '',
        fullFingerprintSha256: '',
        reason: 'مفتاح التوقيع الخاص (UMED_PUBLISHER_PRIVATE_KEY_PEM) مفقود أو فارغ.'
      };
    }

    if (!pubTrimmed) {
      return {
        valid: false,
        algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
        keyId: '',
        fingerprintSha256: '',
        fullFingerprintSha256: '',
        reason: 'المفتاح العام (VITE_UMED_PUBLIC_KEY_PEM) مفقود أو فارغ.'
      };
    }

    const algo = assertValidSignatureAlgorithm(
      options.algorithm || PRODUCTION_SIGNATURE_ALGORITHM,
      { requireProductionEcdsa: options.requireProductionEcdsa }
    );

    // Strictly validate PEM structures first
    parsePrivateKeyPemToPkcs8Buffer(privTrimmed, {
      strictPemHeaders: options.strictPemHeaders ?? true
    });
    parsePublicKeyPemToSpkiBuffer(pubTrimmed, {
      strictPemHeaders: options.strictPemHeaders ?? true
    });

    const fullFingerprintSha256 = await computePublicKeyFullSha256Hex(pubTrimmed);
    const fingerprintSha256 = fullFingerprintSha256.slice(0, 16);
    const keyId = `umed-key-${fingerprintSha256.slice(0, 8)}`;

    const testPayload = new TextEncoder().encode(
      `umed2-permanent-keypair-verification:${algo}:${fullFingerprintSha256}`
    );

    const signed = await signPackageBytesWithPrivateKey({
      bytes: testPayload,
      privateKeyPem: privTrimmed,
      publicKeyPem: pubTrimmed,
      algorithm: algo
    });

    const verified = await verifyPackageSignature({
      bytes: testPayload,
      signature: signed.signature,
      publicKeyPem: pubTrimmed,
      requireSignature: true,
      algorithm: algo
    });

    if (!verified.verified) {
      return {
        valid: false,
        algorithm: algo,
        keyId,
        fingerprintSha256,
        fullFingerprintSha256,
        reason:
          verified.reason ||
          'فشل التحقق التشفيري المتقاطع: المفتاح الخاص لا يطابق المفتاح العام المحدد.'
      };
    }

    return {
      valid: true,
      algorithm: algo,
      keyId,
      fingerprintSha256,
      fullFingerprintSha256
    };
  } catch (err) {
    return {
      valid: false,
      algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
      keyId: '',
      fingerprintSha256: '',
      fullFingerprintSha256: '',
      reason: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Generates a fresh cryptographic signing keypair (SPKI Public Key PEM + PKCS#8 Private Key PEM)
 * for signing UMED-2 data releases before publishing to GitHub/CDN.
 */
export async function generatePublisherSigningKeyPair(
  algorithm: SignatureAlgorithm = 'ECDSA-P256-SHA256'
): Promise<PublisherSigningKeyPair> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('واجهة التشفير القياسية Web Crypto API غير متوفرة لتوليد مفاتيح التوقيع.');
  }

  const validatedAlgo = assertValidSignatureAlgorithm(algorithm);

  let keyPair: CryptoKeyPair;
  if (validatedAlgo === 'ECDSA-P256-SHA256') {
    keyPair = (await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
  } else if (validatedAlgo === 'RSASSA-PKCS1-v1_5-SHA256') {
    keyPair = (await globalThis.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: 'SHA-256' }
      },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
  } else {
    keyPair = (await globalThis.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
  }

  const spkiBuffer = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8Buffer = await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  const publicKeyPem = formatPemBlock(
    encodeBytesToBase64(new Uint8Array(spkiBuffer)),
    'PUBLIC KEY'
  );
  const privateKeyPem = formatPemBlock(
    encodeBytesToBase64(new Uint8Array(pkcs8Buffer)),
    'PRIVATE KEY'
  );
  const fingerprintSha256 = await computePublicKeyFingerprintSha256(publicKeyPem);

  return {
    keyId: `umed-key-${fingerprintSha256.slice(0, 8)}`,
    algorithm: validatedAlgo,
    publicKeyPem,
    privateKeyPem,
    fingerprintSha256,
    createdAt: new Date().toISOString()
  };
}

/**
 * Cryptographically signs a release package byte array using the publisher's PKCS#8 Private Key
 * and optionally verifies the resulting signature against the corresponding SPKI Public Key.
 */
export async function signPackageBytesWithPrivateKey(options: {
  bytes: Uint8Array;
  privateKeyPem: string;
  publicKeyPem?: string;
  algorithm?: SignatureAlgorithm;
}): Promise<{
  signature: string;
  algorithm: SignatureAlgorithm;
}> {
  const algo = assertValidSignatureAlgorithm(options.algorithm || 'ECDSA-P256-SHA256');
  const pkcs8Buffer = parsePrivateKeyPemToPkcs8Buffer(options.privateKeyPem);
  const dataBuffer = options.bytes.buffer.slice(
    options.bytes.byteOffset,
    options.bytes.byteOffset + options.bytes.byteLength
  ) as ArrayBuffer;

  let sigBuffer: ArrayBuffer;

  if (algo === 'ECDSA-P256-SHA256') {
    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      pkcs8Buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    sigBuffer = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privateKey,
      dataBuffer
    );
  } else if (algo === 'RSASSA-PKCS1-v1_5-SHA256') {
    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      pkcs8Buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    sigBuffer = await globalThis.crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      dataBuffer
    );
  } else {
    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      pkcs8Buffer,
      { name: 'Ed25519' },
      false,
      ['sign']
    );
    sigBuffer = await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey,
      dataBuffer
    );
  }

  const signature = encodeBytesToBase64(new Uint8Array(sigBuffer));

  if (options.publicKeyPem && options.publicKeyPem.trim()) {
    const check = await verifyPackageSignature({
      bytes: options.bytes,
      signature,
      publicKeyPem: options.publicKeyPem,
      requireSignature: true,
      algorithm: algo
    });
    if (!check.verified) {
      throw new Error(
        check.reason ||
          'فشل التحقق المتقاطع من التوقيع الرقمي: المفتاح الخاص لا يطابق المفتاح العام المحدد.'
      );
    }
  }

  return {
    signature,
    algorithm: algo
  };
}

/**
 * Calculates the next sequential data version string based on the chosen bump strategy
 * (`calver-auto`, `major`, `minor`, `patch`, or `custom`), ensuring monotonic progression.
 */
export function suggestNextDataVersion(
  currentVersion: string,
  strategy: VersionBumpStrategy = 'patch',
  channel: 'stable' | 'beta' = 'stable',
  existingVersions: string[] = []
): string {
  const cleanCurrent = (currentVersion || BUNDLED_DATA_VERSION).trim();
  const suffix = channel === 'beta' ? '-beta' : '-umd';

  // Find the highest version across currentVersion and existingVersions
  let highestVersion = cleanCurrent;
  for (const v of existingVersions) {
    if (v && compareDataVersions(v, highestVersion) > 0) {
      highestVersion = v.trim();
    }
  }

  const corePart = highestVersion.replace(/^v/i, '').split('-')[0];
  const segments = corePart.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });

  const seg0 = segments[0] ?? 2026;
  const seg1 = segments[1] ?? 10;
  const seg2 = segments[2] ?? 0;

  if (strategy === 'calver-auto') {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    if (seg0 > year || (seg0 === year && seg1 > month)) {
      return `${seg0}.${seg1}.${seg2 + 1}${suffix}`;
    }
    if (seg0 === year && seg1 === month) {
      return `${year}.${month}.${seg2 + 1}${suffix}`;
    }
    return `${year}.${month}.0${suffix}`;
  }

  if (strategy === 'major') {
    return `${seg0 + 1}.0.0${suffix}`;
  }

  if (strategy === 'minor') {
    return `${seg0}.${seg1 + 1}.0${suffix}`;
  }

  // Default: 'patch' or fallback
  return `${seg0}.${seg1}.${seg2 + 1}${suffix}`;
}

/**
 * Stage 4 Pre-Publish Gatekeeper:
 * Strictly blocks the creation or publication of any release package that is:
 * 1. Incompatible with the application version (`minAppVersion`) or database schema (`schemaVersion`).
 * 2. Unsigned or missing a valid cryptographic keypair (`privateKeyPem` + `publicKeyPem`).
 * 3. Structurally invalid or empty according to `validateDataPackageObject`.
 * 4. Using a duplicate, older, or malformed version number compared to the installed version or release history.
 */
export async function evaluateReleasePrePublishGate(options: {
  payload: DataPackagePayload;
  targetVersion: string;
  installedDataVersion: string;
  minAppVersion?: string;
  schemaVersion?: number;
  privateKeyPem?: string;
  publicKeyPem?: string;
  signatureAlgorithm?: SignatureAlgorithm;
  requireSignatureGate?: boolean;
  existingReleases?: ReleaseChangelogEntry[];
}): Promise<ReleasePrePublishGateResult> {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  const targetVersion = (options.targetVersion || '').trim();
  const installedVersion = (options.installedDataVersion || BUNDLED_DATA_VERSION).trim();
  const minAppVersion = (options.minAppVersion || APP_VERSION).trim();
  const schemaVersion =
    typeof options.schemaVersion === 'number' ? options.schemaVersion : DB_SCHEMA_VERSION;
  const algo: SignatureAlgorithm = options.signatureAlgorithm || 'ECDSA-P256-SHA256';
  const mustBeSigned = options.requireSignatureGate !== false;

  // 1. Version Format, Monotonicity & Duplicate Check
  let versionOrderPassed = true;
  if (!targetVersion || !/^[vV]?\d+\.\d+\.\d+(-[a-zA-Z0-9._-]+)?$/.test(targetVersion)) {
    versionOrderPassed = false;
    blockingErrors.push(
      `رقم الإصدار المستهدف (${targetVersion || 'فارغ'}) غير صالح. يجب أن يتبع الصيغة القياسية مثل 2026.10.1-umd.`
    );
  } else {
    if (compareDataVersions(targetVersion, installedVersion) <= 0) {
      versionOrderPassed = false;
      blockingErrors.push(
        `منع النشر: رقم الإصدار الجديد (${targetVersion}) يجب أن يكون أحدث من الإصدار المثبت حالياً (${installedVersion}).`
      );
    }

    const existingList = options.existingReleases || [];
    const duplicate = existingList.find(
      (r) => r.version.trim().toLowerCase() === targetVersion.toLowerCase()
    );
    if (duplicate) {
      versionOrderPassed = false;
      blockingErrors.push(
        `منع النشر: الإصدار (${targetVersion}) تم نشره مسبقاً في سجل الإصدارات بتاريخ ${duplicate.releasedAt}.`
      );
    }

    for (const rel of existingList) {
      if (compareDataVersions(targetVersion, rel.version) <= 0) {
        versionOrderPassed = false;
        blockingErrors.push(
          `منع النشر: الإصدار المستهدف (${targetVersion}) أقدم أو مساوٍ لإصدار منشور سابقاً (${rel.version}).`
        );
        break;
      }
    }
  }

  // 2. App Version & Database Schema Compatibility Gate
  let compatibilityPassed = true;
  let schemaPassed = true;

  if (!/^\d+\.\d+\.\d+/.test(minAppVersion)) {
    compatibilityPassed = false;
    blockingErrors.push(
      `منع النشر: صيغة الحد الأدنى لإصدار التطبيق (minAppVersion: "${minAppVersion}") غير صالحة.`
    );
  }

  if (schemaVersion !== DB_SCHEMA_VERSION) {
    schemaPassed = false;
    compatibilityPassed = false;
    blockingErrors.push(
      `منع النشر: مخطط قاعدة البيانات للحزمة (Schema v${schemaVersion}) غير متوافق مع مخطط المنصة المعتمد (Schema v${DB_SCHEMA_VERSION}).`
    );
  }

  const compatCheck = checkManifestCompatibility({
    dataVersion: targetVersion || BUNDLED_DATA_VERSION,
    minAppVersion,
    schemaVersion
  });
  if (!compatCheck.compatible) {
    compatibilityPassed = false;
    if (compatCheck.reason && !blockingErrors.includes(compatCheck.reason)) {
      blockingErrors.push(`منع النشر (عدم توافق): ${compatCheck.reason}`);
    }
  }

  // 3. Full Medical Data Validation Gate
  const candidatePayload: DataPackagePayload = {
    ...options.payload,
    manifest: {
      ...(options.payload?.manifest || {}),
      packageId: `umed2-pkg-${targetVersion || 'draft'}`,
      dataVersion: targetVersion || BUNDLED_DATA_VERSION,
      minAppVersion,
      schemaVersion,
      releasedAt: new Date().toISOString(),
      channel: options.payload?.manifest?.channel || 'stable',
      counts: {
        terms: options.payload?.terms?.length || 0,
        sentences: options.payload?.sentences?.length || 0,
        topics: options.payload?.topics?.length || 0,
        affixes: options.payload?.customAffixes?.length || 0,
        abbreviations: options.payload?.customAbbreviations?.length || 0
      }
    }
  };

  const validation = validateDataPackageObject(candidatePayload);
  const dataValidationPassed = validation.valid;
  if (!validation.valid) {
    for (const err of validation.errors) {
      blockingErrors.push(`منع النشر (خلل في البيانات): ${err}`);
    }
  }
  warnings.push(...validation.warnings);

  // 4. Cryptographic Signature Readiness Gate (Blocks Unsigned Releases)
  let signatureKeyReady = false;
  const privPem = (options.privateKeyPem || '').trim();
  const pubPem = (options.publicKeyPem || '').trim();

  if (!privPem || !pubPem) {
    signatureKeyReady = false;
    if (mustBeSigned) {
      blockingErrors.push(
        'منع النشر: يُحظر نشر حزم غير موقعة رقمياً. يجب توفير زوج مفاتيح التوقيع (Private Key + Public Key PEM) أو توليد مفتاح معتمد قبل النشر.'
      );
    } else {
      warnings.push('تنبيه: لم يتم إرفاق مفتاح توقيع رقمي للحزمة.');
    }
  } else {
    try {
      const probeBytes = new TextEncoder().encode(`umed2-gate-probe:${targetVersion}:${schemaVersion}`);
      const signedProbe = await signPackageBytesWithPrivateKey({
        bytes: probeBytes,
        privateKeyPem: privPem,
        publicKeyPem: pubPem,
        algorithm: algo
      });
      signatureKeyReady = Boolean(signedProbe.signature);
    } catch (err) {
      signatureKeyReady = false;
      blockingErrors.push(
        `منع النشر (فشل التوقيع الرقمي): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const counts = candidatePayload.manifest.counts;
  const allowed =
    compatibilityPassed &&
    schemaPassed &&
    dataValidationPassed &&
    versionOrderPassed &&
    (mustBeSigned ? signatureKeyReady : true) &&
    blockingErrors.length === 0;

  return {
    allowed,
    compatibilityPassed,
    schemaPassed,
    dataValidationPassed,
    versionOrderPassed,
    signatureKeyReady,
    blockingErrors,
    warnings,
    evaluatedVersion: targetVersion,
    counts
  };
}

/**
 * Formats a Markdown release notes & changelog document (`CHANGELOG.md`) for GitHub Releases / CDN.
 */
export function formatReleaseChangelogMarkdown(
  entries: ReleaseChangelogEntry[]
): string {
  const header = [
    '# UMED-2 Medical Data Platform — سجل إصدارات البيانات الطبية (Release Changelog)',
    '',
    '> يتم إنشاء هذا السجل وملفات `manifest.json` تلقائياً عبر نظام إدارة الإصدارات الموحد مع التحقق الإلزامي من التوافق والتوقيع الرقمي.',
    ''
  ];

  if (entries.length === 0) {
    return [...header, '_لا توجد إصدارات منشورة بعد._', ''].join('\n');
  }

  const sections = entries.map((entry) => {
    const changeLines =
      entry.changes && entry.changes.length > 0
        ? entry.changes.map((c) => `- ${c}`).join('\n')
        : `- ${entry.summary}`;

    return [
      `## [${entry.version}] — ${entry.releasedAt.slice(0, 10)} (${entry.channel.toUpperCase()})`,
      '',
      `**ملخص الإصدار:** ${entry.summary}`,
      '',
      '### التغييرات والتحديثات:',
      changeLines,
      '',
      '### إحصائيات الحزمة والتوافق التقني:',
      `- **الإصدار السابق:** \`${entry.previousVersion}\``,
      `- **الحد الأدنى لإصدار التطبيق (minAppVersion):** \`v${entry.minAppVersion}\``,
      `- **إصدار مخطط قاعدة البيانات (schemaVersion):** \`v${entry.schemaVersion}\``,
      `- **المحتويات:** ${entry.counts.terms} مصطلح · ${entry.counts.sentences} جملة سريرية · ${entry.counts.topics} موضوع · ${entry.counts.affixes} جذر صرفي · ${entry.counts.abbreviations} اختصار`,
      `- **ملف الحزمة:** \`${entry.packageFileName}\` (${entry.packageSizeKb} KB)`,
      `- **رابط التنزيل المباشر (CDN):** \`${entry.downloadUrl}\``,
      `- **بصمة التكامل (SHA-256):** \`${entry.sha256}\``,
      `- **خوارزمية التوقيع الرقمي:** \`${entry.signatureAlgorithm}\` (Key ID: \`${entry.keyFingerprintSha256}\`)`,
      ''
    ].join('\n');
  });

  return [...header, ...sections].join('\n');
}

/**
 * Unified Stage 4 Release Builder & Publisher:
 * 1. Enforces the Pre-Publish Gatekeeper (blocks incompatible, invalid, duplicate, or unsigned packages).
 * 2. Builds the deterministic `.zip` (or `.json`) release package.
 * 3. Computes the SHA-256 checksum and signs the exact package bytes using the Publisher Private Key.
 * 4. Verifies the digital signature against the Public Key.
 * 5. Automatically generates `manifest.json` containing the version, counts, compatibility rules, downloadUrl, SHA-256, and cryptographic signature.
 */
export async function buildAndSignReleaseBundle(options: {
  payload: DataPackagePayload;
  targetVersion: string;
  installedDataVersion: string;
  channel?: 'stable' | 'beta';
  minAppVersion?: string;
  schemaVersion?: number;
  cdnBaseUrl?: string;
  packageDownloadUrl?: string;
  manifestUrl?: string;
  packageFormat?: 'zip' | 'json';
  summary?: string;
  changes?: string[];
  author?: string;
  privateKeyPem: string;
  publicKeyPem: string;
  signatureAlgorithm?: SignatureAlgorithm;
  existingReleases?: ReleaseChangelogEntry[];
}): Promise<PublishedReleaseBundle> {
  const targetVersion = options.targetVersion.trim();
  const previousVersion = (options.installedDataVersion || BUNDLED_DATA_VERSION).trim();
  const channel: 'stable' | 'beta' = options.channel === 'beta' ? 'beta' : 'stable';
  const minAppVersion = (options.minAppVersion || APP_VERSION).trim();
  const schemaVersion =
    typeof options.schemaVersion === 'number' ? options.schemaVersion : DB_SCHEMA_VERSION;
  const packageFormat: 'zip' | 'json' = options.packageFormat === 'json' ? 'json' : 'zip';
  const signatureAlgorithm: SignatureAlgorithm =
    options.signatureAlgorithm || 'ECDSA-P256-SHA256';
  const publishedAt = new Date().toISOString();

  // 1. Run strict Pre-Publish Gatekeeper (blocks incompatible or unsigned releases)
  const gateResult = await evaluateReleasePrePublishGate({
    payload: options.payload,
    targetVersion,
    installedDataVersion: previousVersion,
    minAppVersion,
    schemaVersion,
    privateKeyPem: options.privateKeyPem,
    publicKeyPem: options.publicKeyPem,
    signatureAlgorithm,
    requireSignatureGate: true,
    existingReleases: options.existingReleases
  });

  if (!gateResult.allowed) {
    throw new Error(
      gateResult.blockingErrors[0] ||
        'تم منع نشر الحزمة بواسطة بوابة الفحص الأمني والتوافق (Pre-Publish Gatekeeper).'
    );
  }

  const cleanBaseUrl = (options.cdnBaseUrl || DEFAULT_CDN_RELEASE_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  const packageFileName = `umed2-data-${targetVersion}.${packageFormat}`;
  const packageDownloadUrl = options.packageDownloadUrl || `${cleanBaseUrl}/${packageFileName}`;
  const manifestUrl = options.manifestUrl || `${cleanBaseUrl}/manifest.json`;
  const gitTag = `data-v${targetVersion}`;

  const summary =
    (options.summary || '').trim() ||
    `إصدار البيانات الطبية الموحد ${targetVersion} (${gateResult.counts.terms} مصطلح و ${gateResult.counts.sentences} جملة سريرية)`;
  const cleanChanges = (options.changes || [])
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const changes =
    cleanChanges.length > 0
      ? cleanChanges
      : [
          `تحديث حزمة المعجم الطبي إلى الإصدار ${targetVersion}`,
          `تضمين ${gateResult.counts.terms} مصطلح طبي و ${gateResult.counts.sentences} جملة سياقية و ${gateResult.counts.topics} موضوع سريري`
        ];
  const author = (options.author || 'UMED-2 Data Release Engineering').trim();

  const keyFingerprintSha256 = await computePublicKeyFingerprintSha256(options.publicKeyPem);

  // 2. Construct inner package manifest & build deterministic package bytes (.zip or .json)
  const innerManifest: DataPackageManifest = {
    packageId: `umed2-pkg-${targetVersion}`,
    dataVersion: targetVersion,
    minAppVersion,
    schemaVersion,
    releasedAt: publishedAt,
    channel,
    signatureAlgorithm,
    keyFingerprint: keyFingerprintSha256,
    description: summary,
    releaseNotes: summary,
    changelog: changes,
    author,
    downloadUrl: packageDownloadUrl,
    counts: gateResult.counts
  };

  const packagePayload: DataPackagePayload = {
    manifest: innerManifest,
    terms: options.payload.terms,
    sentences: options.payload.sentences,
    topics: options.payload.topics,
    customAffixes: options.payload.customAffixes,
    customAbbreviations: options.payload.customAbbreviations
  };

  const packageBytes =
    packageFormat === 'zip'
      ? buildDataPackageZipBytes(packagePayload)
      : new TextEncoder().encode(JSON.stringify(packagePayload, null, 2));

  assertNotSqlitePayload(packageBytes, packageFileName);

  const packageSizeKb = Math.max(1, Number((packageBytes.byteLength / 1024).toFixed(1)));

  // 3. Compute SHA-256 Checksum & Cryptographic Signature over the exact package bytes
  const sha256 = await computeSha256Hex(packageBytes);
  const { signature } = await signPackageBytesWithPrivateKey({
    bytes: packageBytes,
    privateKeyPem: options.privateKeyPem,
    publicKeyPem: options.publicKeyPem,
    algorithm: signatureAlgorithm
  });

  // 4. Automatically generate the standalone release `manifest.json` for GitHub / CDN
  const publishedManifest: DataPackageManifest = {
    ...innerManifest,
    packageSizeKb,
    checksum: sha256,
    sha256,
    signature,
    signatureAlgorithm
  };

  const manifestJsonText = JSON.stringify(publishedManifest, null, 2);
  const releaseId = `rel-${targetVersion}-${Date.now().toString(36)}`;

  const changelogEntry: ReleaseChangelogEntry = {
    releaseId,
    version: targetVersion,
    previousVersion,
    releasedAt: publishedAt,
    channel,
    summary,
    changes,
    counts: gateResult.counts,
    minAppVersion,
    schemaVersion,
    packageFileName,
    packageSizeKb,
    downloadUrl: packageDownloadUrl,
    manifestUrl,
    sha256,
    signature,
    signatureAlgorithm,
    keyFingerprintSha256,
    author
  };

  const allEntries = [changelogEntry, ...(options.existingReleases || [])];
  const changelogMarkdown = formatReleaseChangelogMarkdown(allEntries);

  return {
    releaseId,
    publishedAt,
    manifest: publishedManifest,
    manifestJsonText,
    packageFileName,
    packageBytes,
    packageSizeKb,
    sha256,
    signature,
    signatureAlgorithm,
    publicKeyPem: options.publicKeyPem.trim(),
    keyFingerprintSha256,
    changelogEntry,
    changelogMarkdown,
    gateResult,
    endpoints: {
      manifestUrl,
      packageDownloadUrl,
      gitTag
    }
  };
}

/**
 * ============================================================================
 * STAGE 5: SYNTHETIC SECURITY TEST ARCHIVE BUILDERS (FOR PRACTICAL SELF-TESTS)
 * ============================================================================
 */

async function deflateRawBytes(uncompressed: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    await writer.write(new Uint8Array(uncompressed));
    await writer.close();
    const response = new Response(cs.readable);
    const ab = await response.arrayBuffer();
    return new Uint8Array(ab);
  }
  return uncompressed;
}

/**
 * Builds specialized in-memory ZIP test vectors to practically test and verify Stage 5
 * defenses against Zip Bombs, Zip Slip (`../`), dangerous executables (`.sh`), and CRC-32 corruption.
 */
export async function buildSecurityTestZipArchive(
  vector:
    | 'zip-bomb-ratio'
    | 'zip-slip-traversal'
    | 'dangerous-executable'
    | 'crc32-corrupted'
): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  let fileName = 'terms.json';
  let uncompressedData: Uint8Array = encoder.encode('[{"term":"Test","translation":"اختبار"}]');
  let compressedData: Uint8Array = uncompressedData;
  let compressionMethod = 0;
  let crc = computeCrc32Checksum(uncompressedData);

  if (vector === 'zip-slip-traversal') {
    fileName = '../../etc/malicious-traversal.json';
  } else if (vector === 'dangerous-executable') {
    fileName = 'dropper-exploit.sh';
    uncompressedData = encoder.encode('#!/bin/sh\necho "malicious payload"');
    compressedData = uncompressedData;
    crc = computeCrc32Checksum(uncompressedData);
  } else if (vector === 'zip-bomb-ratio') {
    // 300 KB of highly repetitive 'A' characters compresses down to ~400 bytes (> 700:1 ratio!)
    fileName = 'terms.json';
    const hugeRepetitive = 'A'.repeat(300 * 1024);
    uncompressedData = encoder.encode(hugeRepetitive);
    crc = computeCrc32Checksum(uncompressedData);
    compressedData = await deflateRawBytes(uncompressedData);
    compressionMethod = compressedData.byteLength < uncompressedData.byteLength ? 8 : 0;
  } else if (vector === 'crc32-corrupted') {
    fileName = 'terms.json';
    crc = (crc ^ 0xdeadbeef) >>> 0; // Deliberately corrupt expected CRC-32
  }

  const nameBytes = encoder.encode(fileName);
  const compSize = compressedData.byteLength;
  const uncompSize = uncompressedData.byteLength;

  const local = new Uint8Array(30 + nameBytes.byteLength + compSize);
  const lView = new DataView(local.buffer);
  lView.setUint32(0, 0x04034b50, true);
  lView.setUint16(4, 20, true);
  lView.setUint16(6, 0x0800, true);
  lView.setUint16(8, compressionMethod, true);
  lView.setUint16(10, 0, true);
  lView.setUint16(12, 0, true);
  lView.setUint32(14, crc, true);
  lView.setUint32(18, compSize, true);
  lView.setUint32(22, uncompSize, true);
  lView.setUint16(26, nameBytes.byteLength, true);
  lView.setUint16(28, 0, true);
  local.set(nameBytes, 30);
  local.set(compressedData, 30 + nameBytes.byteLength);

  const central = new Uint8Array(46 + nameBytes.byteLength);
  const cView = new DataView(central.buffer);
  cView.setUint32(0, 0x02014b50, true);
  cView.setUint16(4, 20, true);
  cView.setUint16(6, 20, true);
  cView.setUint16(8, 0x0800, true);
  cView.setUint16(10, compressionMethod, true);
  cView.setUint16(12, 0, true);
  cView.setUint16(14, 0, true);
  cView.setUint32(16, crc, true);
  cView.setUint32(20, compSize, true);
  cView.setUint32(24, uncompSize, true);
  cView.setUint16(28, nameBytes.byteLength, true);
  cView.setUint16(30, 0, true);
  cView.setUint16(32, 0, true);
  cView.setUint16(34, 0, true);
  cView.setUint16(36, 0, true);
  cView.setUint32(38, 0, true);
  cView.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, 1, true);
  eView.setUint16(10, 1, true);
  eView.setUint32(12, central.byteLength, true);
  eView.setUint32(16, local.byteLength, true);
  eView.setUint16(20, 0, true);

  const out = new Uint8Array(local.byteLength + central.byteLength + eocd.byteLength);
  out.set(local, 0);
  out.set(central, local.byteLength);
  out.set(eocd, local.byteLength + central.byteLength);
  return out;
}

/**
 * ============================================================================
 * STAGE 6: DATA MANAGEMENT, PARTIAL DOMAIN UPDATES & CONFLICT RESOLUTION
 * ============================================================================
 */

export function normalizeTermNaturalKey(term: Pick<DictionaryTerm, 'term' | 'termNormalized'>): string {
  return (term.termNormalized || term.term || '').trim().toLowerCase();
}

export function normalizeSentenceNaturalKey(sentence: Pick<LinkedSentence, 'en'>): string {
  return (sentence.en || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTopicNaturalKey(topic: Pick<TopicArticle, 'title'>): string {
  return (topic.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeAbbreviationNaturalKey(abbr: Pick<ClinicalAbbreviation, 'abbr'>): string {
  return (abbr.abbr || '').trim().toUpperCase();
}

export function normalizeAffixNaturalKey(
  affix: Pick<MorphologicalAffix, 'cleanKey' | 'affix' | 'type'>
): string {
  const clean = (affix.cleanKey || affix.affix || '')
    .replace(/^-|-$/g, '')
    .trim()
    .toLowerCase();
  return `${clean}_${affix.type || 'prefix'}`;
}

export function compareTermRecordConflicts(
  existing: DictionaryTerm,
  incoming: DictionaryTerm
): RecordFieldDiff[] {
  const diffs: RecordFieldDiff[] = [];
  const norm = (v?: string) => (v || '').trim();

  if (
    norm(existing.translation) &&
    norm(incoming.translation) &&
    norm(existing.translation) !== norm(incoming.translation)
  ) {
    diffs.push({
      field: 'translation',
      labelAr: 'الترجمة الطبية (UMD)',
      existingValue: norm(existing.translation),
      incomingValue: norm(incoming.translation)
    });
  }
  if (
    norm(existing.definitionAr) &&
    norm(incoming.definitionAr) &&
    norm(existing.definitionAr) !== norm(incoming.definitionAr)
  ) {
    diffs.push({
      field: 'definitionAr',
      labelAr: 'التعريف السريري العربي',
      existingValue: norm(existing.definitionAr),
      incomingValue: norm(incoming.definitionAr)
    });
  }
  if (
    norm(existing.definitionEn) &&
    norm(incoming.definitionEn) &&
    norm(existing.definitionEn) !== norm(incoming.definitionEn)
  ) {
    diffs.push({
      field: 'definitionEn',
      labelAr: 'التعريف الإنجليزي',
      existingValue: norm(existing.definitionEn),
      incomingValue: norm(incoming.definitionEn)
    });
  }
  if (
    norm(existing.umdCode) &&
    norm(incoming.umdCode) &&
    norm(existing.umdCode) !== norm(incoming.umdCode)
  ) {
    diffs.push({
      field: 'umdCode',
      labelAr: 'كود المعجم الموحد (UMD Code)',
      existingValue: norm(existing.umdCode),
      incomingValue: norm(incoming.umdCode)
    });
  }
  if (existing.category !== incoming.category) {
    diffs.push({
      field: 'category',
      labelAr: 'التخصص المعجمي',
      existingValue: existing.category,
      incomingValue: incoming.category
    });
  }
  return diffs;
}

export function compareSentenceRecordConflicts(
  existing: LinkedSentence,
  incoming: LinkedSentence
): RecordFieldDiff[] {
  const diffs: RecordFieldDiff[] = [];
  const norm = (v?: string) => (v || '').trim();
  if (norm(existing.ar) && norm(incoming.ar) && norm(existing.ar) !== norm(incoming.ar)) {
    diffs.push({
      field: 'ar',
      labelAr: 'الترجمة العربية للجملة السريرية',
      existingValue: norm(existing.ar),
      incomingValue: norm(incoming.ar)
    });
  }
  if (
    norm(existing.specialty) &&
    norm(incoming.specialty) &&
    norm(existing.specialty) !== norm(incoming.specialty)
  ) {
    diffs.push({
      field: 'specialty',
      labelAr: 'التخصص السريري',
      existingValue: norm(existing.specialty),
      incomingValue: norm(incoming.specialty)
    });
  }
  return diffs;
}

export function compareTopicRecordConflicts(
  existing: TopicArticle,
  incoming: TopicArticle
): RecordFieldDiff[] {
  const diffs: RecordFieldDiff[] = [];
  const norm = (v?: string) => (v || '').trim();
  if (
    norm(existing.subtitle) &&
    norm(incoming.subtitle) &&
    norm(existing.subtitle) !== norm(incoming.subtitle)
  ) {
    diffs.push({
      field: 'subtitle',
      labelAr: 'العنوان الفرعي للموضوع',
      existingValue: norm(existing.subtitle),
      incomingValue: norm(incoming.subtitle)
    });
  }
  const exSecSummary = (existing.sections || [])
    .map((s) => `${s.heading || ''}:${(s.paragraphs || []).join(' ')}`)
    .join(' | ');
  const incSecSummary = (incoming.sections || [])
    .map((s) => `${s.heading || ''}:${(s.paragraphs || []).join(' ')}`)
    .join(' | ');
  if (exSecSummary && incSecSummary && exSecSummary !== incSecSummary) {
    diffs.push({
      field: 'sections',
      labelAr: 'أقسام ومحتوى الموضوع السريري',
      existingValue: `${existing.sections?.length || 0} أقسام (${(existing.sections?.[0]?.paragraphs?.[0] || '').slice(0, 50)}...)`,
      incomingValue: `${incoming.sections?.length || 0} أقسام (${(incoming.sections?.[0]?.paragraphs?.[0] || '').slice(0, 50)}...)`
    });
  }
  return diffs;
}

export function compareAbbreviationRecordConflicts(
  existing: ClinicalAbbreviation,
  incoming: ClinicalAbbreviation
): RecordFieldDiff[] {
  const diffs: RecordFieldDiff[] = [];
  const norm = (v?: string) => (v || '').trim();
  if (
    norm(existing.defaultExpansionEn) &&
    norm(incoming.defaultExpansionEn) &&
    norm(existing.defaultExpansionEn).toLowerCase() !==
      norm(incoming.defaultExpansionEn).toLowerCase()
  ) {
    diffs.push({
      field: 'defaultExpansionEn',
      labelAr: 'المفكوك الإنجليزي الافتراضي',
      existingValue: norm(existing.defaultExpansionEn),
      incomingValue: norm(incoming.defaultExpansionEn)
    });
  }
  if (
    norm(existing.defaultTranslationAr) &&
    norm(incoming.defaultTranslationAr) &&
    norm(existing.defaultTranslationAr) !== norm(incoming.defaultTranslationAr)
  ) {
    diffs.push({
      field: 'defaultTranslationAr',
      labelAr: 'الترجمة العربية للاختصار',
      existingValue: norm(existing.defaultTranslationAr),
      incomingValue: norm(incoming.defaultTranslationAr)
    });
  }
  return diffs;
}

export function compareAffixRecordConflicts(
  existing: MorphologicalAffix,
  incoming: MorphologicalAffix
): RecordFieldDiff[] {
  const diffs: RecordFieldDiff[] = [];
  const norm = (v?: string) => (v || '').trim();
  if (
    norm(existing.meaningAr) &&
    norm(incoming.meaningAr) &&
    norm(existing.meaningAr) !== norm(incoming.meaningAr)
  ) {
    diffs.push({
      field: 'meaningAr',
      labelAr: 'المعنى الصرفي العربي',
      existingValue: norm(existing.meaningAr),
      incomingValue: norm(incoming.meaningAr)
    });
  }
  if (
    norm(existing.meaningEn) &&
    norm(incoming.meaningEn) &&
    norm(existing.meaningEn).toLowerCase() !== norm(incoming.meaningEn).toLowerCase()
  ) {
    diffs.push({
      field: 'meaningEn',
      labelAr: 'المعنى الصرفي الإنجليزي',
      existingValue: norm(existing.meaningEn),
      incomingValue: norm(incoming.meaningEn)
    });
  }
  return diffs;
}

/**
 * Scans the database collections (and optional incoming patch records) in O(N) time
 * to detect exact duplicates, normalized natural-key collisions, ID collisions,
 * and field-level semantic conflicts across all 5 medical domains.
 */
export function scanDatabaseDuplicatesAndConflicts(
  current: {
    terms: DictionaryTerm[];
    sentences: LinkedSentence[];
    topics: TopicArticle[];
    abbreviations: ClinicalAbbreviation[];
    affixes: MorphologicalAffix[];
  },
  incomingPatch?: Partial<PartialDatabasePatchPayload>
): DuplicateAndConflictReport {
  const t0 = Date.now();
  const duplicates: DuplicateGroupItem[] = [];
  const conflicts: RecordConflictItem[] = [];

  // 1. Scan Terms
  {
    const byKey = new Map<string, DictionaryTerm[]>();
    const byId = new Map<string, DictionaryTerm[]>();
    const allTerms = [...current.terms, ...(incomingPatch?.terms || [])];

    for (const t of allTerms) {
      const k = normalizeTermNaturalKey(t);
      if (k) {
        const list = byKey.get(k) || [];
        list.push(t);
        byKey.set(k, list);
      }
      if (t.id) {
        const idList = byId.get(t.id) || [];
        idList.push(t);
        byId.set(t.id, idList);
      }
    }

    for (const [k, group] of byKey.entries()) {
      if (group.length > 1) {
        const first = group[0];
        let hasFieldConflict = false;
        for (let i = 1; i < group.length; i++) {
          const diffs = compareTermRecordConflicts(first, group[i]);
          if (diffs.length > 0) {
            hasFieldConflict = true;
            conflicts.push({
              conflictId: `conf-term-${k}-${i}`,
              domain: 'terms',
              normalizedKey: k,
              recordId: first.id,
              incomingRecordId: group[i].id,
              titleEn: first.term,
              subtitleAr: `${first.translation} ⇄ ${group[i].translation}`,
              severity: diffs.some((d) => d.field === 'translation') ? 'critical' : 'warning',
              conflictReasonAr: `تعارض في ${diffs.map((d) => d.labelAr).join('، ')} للمصطلح "${first.term}".`,
              diffs
            });
          }
        }

        duplicates.push({
          id: `dup-term-${k}`,
          domain: 'terms',
          normalizedKey: k,
          displayLabel: `${first.term} (${first.translation})`,
          duplicateType: hasFieldConflict ? 'normalized-key-duplicate' : 'exact-duplicate',
          recordIds: group.map((g) => g.id),
          count: group.length,
          summaryAr: hasFieldConflict
            ? `تكرار للمصطلح "${first.term}" (${group.length} سجلات) مع اختلاف في الحقول التعريفية.`
            : `تكرار مطابق للمصطلح "${first.term}" (${group.length} سجلات).`
        });
      }
    }

    for (const [id, idGroup] of byId.entries()) {
      if (idGroup.length > 1) {
        const distinctNames = new Set(idGroup.map((t) => normalizeTermNaturalKey(t)));
        if (distinctNames.size > 1) {
          duplicates.push({
            id: `dup-term-id-${id}`,
            domain: 'terms',
            normalizedKey: id,
            displayLabel: `تصادم المعرف ${id}: ${idGroup.map((t) => t.term).join(' / ')}`,
            duplicateType: 'id-collision',
            recordIds: idGroup.map((t) => t.id),
            count: idGroup.length,
            summaryAr: `تصادم في المعرف الفريد (${id}) بين مصطلحات مختلفة.`
          });
        }
      }
    }
  }

  // 2. Scan Sentences
  {
    const byKey = new Map<string, LinkedSentence[]>();
    const allSentences = [...current.sentences, ...(incomingPatch?.sentences || [])];
    for (const s of allSentences) {
      const k = normalizeSentenceNaturalKey(s);
      if (!k) continue;
      const list = byKey.get(k) || [];
      list.push(s);
      byKey.set(k, list);
    }

    for (const [k, group] of byKey.entries()) {
      if (group.length > 1) {
        const first = group[0];
        let hasFieldConflict = false;
        for (let i = 1; i < group.length; i++) {
          const diffs = compareSentenceRecordConflicts(first, group[i]);
          if (diffs.length > 0) {
            hasFieldConflict = true;
            conflicts.push({
              conflictId: `conf-sent-${first.id}-${i}`,
              domain: 'sentences',
              normalizedKey: k,
              recordId: first.id,
              incomingRecordId: group[i].id,
              titleEn: first.en.slice(0, 70),
              subtitleAr: first.ar.slice(0, 70),
              severity: 'warning',
              conflictReasonAr: `اختلاف في الترجمة العربية لنفس الجملة الإنجليزية.`,
              diffs
            });
          }
        }
        duplicates.push({
          id: `dup-sent-${first.id}`,
          domain: 'sentences',
          normalizedKey: k,
          displayLabel: first.en.slice(0, 65),
          duplicateType: hasFieldConflict ? 'normalized-key-duplicate' : 'exact-duplicate',
          recordIds: group.map((g) => g.id),
          count: group.length,
          summaryAr: `تكرار للجملة السريرية (${group.length} مرات).`
        });
      }
    }
  }

  // 3. Scan Topics
  {
    const byKey = new Map<string, TopicArticle[]>();
    const allTopics = [...current.topics, ...(incomingPatch?.topics || [])];
    for (const tp of allTopics) {
      const k = normalizeTopicNaturalKey(tp);
      if (!k) continue;
      const list = byKey.get(k) || [];
      list.push(tp);
      byKey.set(k, list);
    }

    for (const [k, group] of byKey.entries()) {
      if (group.length > 1) {
        const first = group[0];
        let hasFieldConflict = false;
        for (let i = 1; i < group.length; i++) {
          const diffs = compareTopicRecordConflicts(first, group[i]);
          if (diffs.length > 0) {
            hasFieldConflict = true;
            conflicts.push({
              conflictId: `conf-topic-${first.id}-${i}`,
              domain: 'topics',
              normalizedKey: k,
              recordId: first.id,
              incomingRecordId: group[i].id,
              titleEn: first.title,
              subtitleAr: first.subtitle,
              severity: 'warning',
              conflictReasonAr: `تعارض في أقسام ومحتوى الموضوع "${first.title}".`,
              diffs
            });
          }
        }
        duplicates.push({
          id: `dup-topic-${first.id}`,
          domain: 'topics',
          normalizedKey: k,
          displayLabel: first.title,
          duplicateType: hasFieldConflict ? 'normalized-key-duplicate' : 'exact-duplicate',
          recordIds: group.map((g) => g.id),
          count: group.length,
          summaryAr: `تكرار للموضوع الموسوعي "${first.title}" (${group.length} سجلات).`
        });
      }
    }
  }

  // 4. Scan Abbreviations
  {
    const byKey = new Map<string, ClinicalAbbreviation[]>();
    const allAbbrs = [...current.abbreviations, ...(incomingPatch?.abbreviations || [])];
    for (const ab of allAbbrs) {
      const k = normalizeAbbreviationNaturalKey(ab);
      if (!k) continue;
      const list = byKey.get(k) || [];
      list.push(ab);
      byKey.set(k, list);
    }

    for (const [k, group] of byKey.entries()) {
      if (group.length > 1) {
        const first = group[0];
        let hasFieldConflict = false;
        for (let i = 1; i < group.length; i++) {
          const diffs = compareAbbreviationRecordConflicts(first, group[i]);
          if (diffs.length > 0) {
            hasFieldConflict = true;
            conflicts.push({
              conflictId: `conf-abbr-${k}-${i}`,
              domain: 'abbreviations',
              normalizedKey: k,
              recordId: first.id,
              incomingRecordId: group[i].id,
              titleEn: `${first.abbr} (${first.defaultExpansionEn})`,
              subtitleAr: `${first.defaultTranslationAr} ⇄ ${group[i].defaultTranslationAr}`,
              severity: 'critical',
              conflictReasonAr: `تعارض في المفكوك الافتراضي للاختصار الطبي "${first.abbr}".`,
              diffs
            });
          }
        }
        duplicates.push({
          id: `dup-abbr-${k}`,
          domain: 'abbreviations',
          normalizedKey: k,
          displayLabel: `${first.abbr} · ${first.defaultExpansionEn}`,
          duplicateType: hasFieldConflict ? 'normalized-key-duplicate' : 'exact-duplicate',
          recordIds: group.map((g) => g.id),
          count: group.length,
          summaryAr: `تكرار للاختصار السريري "${first.abbr}" (${group.length} سجلات).`
        });
      }
    }
  }

  // 5. Scan Affixes
  {
    const byKey = new Map<string, MorphologicalAffix[]>();
    const allAffixes = [...current.affixes, ...(incomingPatch?.affixes || [])];
    for (const af of allAffixes) {
      const k = normalizeAffixNaturalKey(af);
      if (!k) continue;
      const list = byKey.get(k) || [];
      list.push(af);
      byKey.set(k, list);
    }

    for (const [k, group] of byKey.entries()) {
      if (group.length > 1) {
        const first = group[0];
        let hasFieldConflict = false;
        for (let i = 1; i < group.length; i++) {
          const diffs = compareAffixRecordConflicts(first, group[i]);
          if (diffs.length > 0) {
            hasFieldConflict = true;
            conflicts.push({
              conflictId: `conf-affix-${k}-${i}`,
              domain: 'affixes',
              normalizedKey: k,
              recordId: first.id,
              incomingRecordId: group[i].id,
              titleEn: first.affix,
              subtitleAr: `${first.meaningAr} ⇄ ${group[i].meaningAr}`,
              severity: 'warning',
              conflictReasonAr: `تعارض في المعنى الصرفي للجذر/البادئة "${first.affix}".`,
              diffs
            });
          }
        }
        duplicates.push({
          id: `dup-affix-${k}`,
          domain: 'affixes',
          normalizedKey: k,
          displayLabel: `${first.affix} (${first.meaningAr})`,
          duplicateType: hasFieldConflict ? 'normalized-key-duplicate' : 'exact-duplicate',
          recordIds: group.map((g) => g.id),
          count: group.length,
          summaryAr: `تكرار للجذر/البادئة "${first.affix}" (${group.length} سجلات).`
        });
      }
    }
  }

  const domainCounts: Record<DataDomainKey, number> = {
    terms: current.terms.length,
    sentences: current.sentences.length,
    topics: current.topics.length,
    abbreviations: current.abbreviations.length,
    affixes: current.affixes.length
  };

  const totalRecordsScanned =
    domainCounts.terms +
    domainCounts.sentences +
    domainCounts.topics +
    domainCounts.abbreviations +
    domainCounts.affixes;

  return {
    reportId: `scan-${Date.now().toString(36)}`,
    scannedAt: new Date().toISOString(),
    durationMs: Math.max(1, Date.now() - t0),
    isHealthy: duplicates.length === 0 && conflicts.length === 0,
    totalRecordsScanned,
    totalDuplicatesFound: duplicates.length,
    totalConflictsFound: conflicts.length,
    domainCounts,
    duplicates,
    conflicts
  };
}

/**
 * Merges two DictionaryTerm records according to the selected conflict resolution strategy,
 * always preserving personal user state (`favorite`, `collections`, `srsData`).
 */
export function resolveTermConflictRecord(
  existing: DictionaryTerm,
  incoming: DictionaryTerm,
  strategy: ConflictResolutionStrategy
): DictionaryTerm {
  if (strategy === 'keep-existing') {
    return {
      ...existing,
      favorite: Boolean(existing.favorite || incoming.favorite),
      collections: Array.from(
        new Set([...(existing.collections || []), ...(incoming.collections || [])])
      ),
      srsData: existing.srsData || incoming.srsData
    };
  }

  const mergedExamples = [...(existing.examples || [])];
  const seenEx = new Set(mergedExamples.map((e) => e.en.trim().toLowerCase()));
  for (const ex of incoming.examples || []) {
    const k = ex.en.trim().toLowerCase();
    if (k && !seenEx.has(k)) {
      seenEx.add(k);
      mergedExamples.push(ex);
    }
  }

  const mergedRelations = {
    synonyms: Array.from(
      new Set([...(existing.relations?.synonyms || []), ...(incoming.relations?.synonyms || [])])
    ),
    broader: Array.from(
      new Set([...(existing.relations?.broader || []), ...(incoming.relations?.broader || [])])
    ),
    related: Array.from(
      new Set([...(existing.relations?.related || []), ...(incoming.relations?.related || [])])
    )
  };

  if (strategy === 'overwrite-existing') {
    return {
      ...existing,
      ...incoming,
      id: existing.id,
      termNormalized: normalizeTermNaturalKey(incoming),
      favorite: Boolean(existing.favorite || incoming.favorite),
      collections: Array.from(
        new Set([...(existing.collections || []), ...(incoming.collections || [])])
      ),
      srsData: existing.srsData || incoming.srsData,
      examples: mergedExamples,
      relations: mergedRelations
    };
  }

  // 'smart-merge': keep non-empty incoming fields while enriching definitions, examples, and relations
  return {
    ...existing,
    term: incoming.term || existing.term,
    termNormalized: normalizeTermNaturalKey(existing),
    translation: incoming.translation?.trim() || existing.translation,
    phonetic: incoming.phonetic?.trim() || existing.phonetic,
    pos: incoming.pos?.trim() || existing.pos,
    category: incoming.category || existing.category,
    specialty: incoming.specialty || existing.specialty,
    umdCode: incoming.umdCode || existing.umdCode,
    definitionAr:
      incoming.definitionAr && incoming.definitionAr.length >= (existing.definitionAr?.length || 0)
        ? incoming.definitionAr
        : existing.definitionAr || incoming.definitionAr,
    definitionEn:
      incoming.definitionEn && incoming.definitionEn.length >= (existing.definitionEn?.length || 0)
        ? incoming.definitionEn
        : existing.definitionEn || incoming.definitionEn,
    favorite: Boolean(existing.favorite || incoming.favorite),
    collections: Array.from(
      new Set([...(existing.collections || []), ...(incoming.collections || [])])
    ),
    srsData: existing.srsData || incoming.srsData,
    examples: mergedExamples,
    relations: mergedRelations
  };
}

export function resolveSentenceConflictRecord(
  existing: LinkedSentence,
  incoming: LinkedSentence,
  strategy: ConflictResolutionStrategy
): LinkedSentence {
  if (strategy === 'keep-existing') {
    return {
      ...existing,
      favorite: Boolean(existing.favorite || incoming.favorite)
    };
  }

  const mergedLinkedIds = Array.from(
    new Set([...(existing.linkedTermIds || []), ...(incoming.linkedTermIds || [])])
  );
  const mergedTags = Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])]));

  if (strategy === 'overwrite-existing') {
    return {
      ...existing,
      ...incoming,
      id: existing.id,
      linkedTermIds: mergedLinkedIds,
      tags: mergedTags,
      favorite: Boolean(existing.favorite || incoming.favorite),
      srsData: existing.srsData || incoming.srsData
    };
  }

  return {
    ...existing,
    ar: incoming.ar?.trim() || existing.ar,
    category: incoming.category || existing.category,
    specialty: incoming.specialty || existing.specialty,
    linkedTermIds: mergedLinkedIds,
    tags: mergedTags,
    favorite: Boolean(existing.favorite || incoming.favorite),
    srsData: existing.srsData || incoming.srsData
  };
}

export function resolveTopicConflictRecord(
  existing: TopicArticle,
  incoming: TopicArticle,
  strategy: ConflictResolutionStrategy
): TopicArticle {
  if (strategy === 'keep-existing') {
    return {
      ...existing,
      favorite: Boolean(existing.favorite || incoming.favorite)
    };
  }

  if (strategy === 'overwrite-existing') {
    return {
      ...existing,
      ...incoming,
      id: existing.id,
      favorite: Boolean(existing.favorite || incoming.favorite)
    };
  }

  // Smart merge sections by heading or id
  const sectionMap = new Map<string, TopicArticle['sections'][number]>();
  for (const sec of existing.sections || []) {
    const k = (sec.heading || sec.id || '').trim().toLowerCase();
    sectionMap.set(k, sec);
  }
  for (const incSec of incoming.sections || []) {
    const k = (incSec.heading || incSec.id || '').trim().toLowerCase();
    sectionMap.set(k, incSec);
  }

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    subtitle: incoming.subtitle?.trim() || existing.subtitle,
    sections: Array.from(sectionMap.values()),
    favorite: Boolean(existing.favorite || incoming.favorite)
  };
}

export function resolveAbbreviationConflictRecord(
  existing: ClinicalAbbreviation,
  incoming: ClinicalAbbreviation,
  strategy: ConflictResolutionStrategy
): ClinicalAbbreviation {
  if (strategy === 'keep-existing') {
    return existing;
  }

  // Merge ambiguous candidates without duplicates
  const candMap = new Map<string, ClinicalAbbreviation['candidates'][number]>();
  for (const c of existing.candidates || []) {
    candMap.set(c.expansionEn.trim().toLowerCase(), c);
  }
  for (const incC of incoming.candidates || []) {
    const k = incC.expansionEn.trim().toLowerCase();
    const prev = candMap.get(k);
    if (prev) {
      const triggerMap = new Map<string, { token: string; weight: number }>();
      for (const tr of prev.triggers || []) {
        triggerMap.set(tr.token.toLowerCase(), tr);
      }
      for (const tr of incC.triggers || []) {
        triggerMap.set(tr.token.toLowerCase(), tr);
      }
      candMap.set(k, {
        ...prev,
        ...incC,
        triggers: Array.from(triggerMap.values())
      });
    } else {
      candMap.set(k, incC);
    }
  }

  // If incoming default expansion differs from existing in smart-merge, also preserve the existing default as a candidate
  if (
    strategy === 'smart-merge' &&
    existing.defaultExpansionEn &&
    incoming.defaultExpansionEn &&
    existing.defaultExpansionEn.trim().toLowerCase() !==
      incoming.defaultExpansionEn.trim().toLowerCase()
  ) {
    const prevDefKey = existing.defaultExpansionEn.trim().toLowerCase();
    if (!candMap.has(prevDefKey)) {
      candMap.set(prevDefKey, {
        expansionEn: existing.defaultExpansionEn,
        translationAr: existing.defaultTranslationAr,
        specialty: existing.category,
        triggers: []
      });
    }
  }

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    abbr: normalizeAbbreviationNaturalKey(incoming),
    candidates: Array.from(candMap.values())
  };
}

export function resolveAffixConflictRecord(
  existing: MorphologicalAffix,
  incoming: MorphologicalAffix,
  strategy: ConflictResolutionStrategy
): MorphologicalAffix {
  if (strategy === 'keep-existing') {
    return existing;
  }
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    examples: Array.from(new Set([...(existing.examples || []), ...(incoming.examples || [])]))
  };
}

/**
 * Deduplicates an in-memory domain collection using O(N) normalized key indexing
 * and merges colliding records according to `strategy`.
 */
export function deduplicateDomainRecords<T>(
  records: T[],
  getNaturalKey: (item: T) => string,
  getId: (item: T) => string,
  setId: (item: T, nextId: string) => T,
  mergeColliding: (existing: T, incoming: T, strategy: ConflictResolutionStrategy) => T,
  strategy: ConflictResolutionStrategy
): {
  deduplicated: T[];
  duplicatesRemoved: number;
  conflictsResolved: number;
} {
  const byKey = new Map<string, T>();
  const usedIds = new Set<string>();
  let duplicatesRemoved = 0;
  let conflictsResolved = 0;

  for (let i = 0; i < records.length; i++) {
    const item = records[i];
    const key = getNaturalKey(item);
    if (!key) continue;

    const existing = byKey.get(key);
    if (existing) {
      duplicatesRemoved += 1;
      conflictsResolved += 1;
      byKey.set(key, mergeColliding(existing, item, strategy));
    } else {
      let id = getId(item) || `rec-${i + 1}`;
      if (usedIds.has(id)) {
        id = `${id}-u${i + 1}`;
      }
      usedIds.add(id);
      byKey.set(key, setId(item, id));
    }
  }

  return {
    deduplicated: Array.from(byKey.values()),
    duplicatesRemoved,
    conflictsResolved
  };
}

export function createEmptyDomainMetrics(
  domain: DataDomainKey,
  beforeCount: number
): DomainPartialUpdateMetrics {
  return {
    domain,
    touched: false,
    beforeCount,
    afterCount: beforeCount,
    inserted: 0,
    updated: 0,
    merged: 0,
    skipped: 0,
    deleted: 0,
    conflictsResolved: 0
  };
}

export function normalizeTermPunctuationSkeleton(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[-_./\\()[\]{},:;'"`~!?@#$%^&*+=|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArabicMedicalText(text: string): string {
  return (text || '')
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFabricatedOrPlaceholderUmdCode(code?: string): boolean {
  if (!code || !code.trim()) return false;
  const clean = code.trim().toUpperCase();
  if (
    /^UMD[-_]?(?:X+|0+|1234|9999|TEST|FAKE|TEMP|NULL|NONE|N\/A)$/i.test(clean) ||
    clean.includes('XXXX') ||
    clean === 'UMD-'
  ) {
    return true;
  }
  return false;
}

export function validateMedicalTermCompletenessAndCodes(
  candidate: Partial<DictionaryTerm>,
  options?: { strict?: boolean }
): {
  valid: boolean;
  errors: string[];
  sanitizedUmdCode?: string;
  fabricatedUmdCodeRejected?: boolean;
} {
  const errors: string[] = [];
  const term = (candidate.term || '').trim();
  const translation = (candidate.translation || '').trim();
  const definitionAr = (candidate.definitionAr || '').trim();
  const definitionEn = (candidate.definitionEn || '').trim();

  if (!term) {
    errors.push('حقل المصطلح الطبي الإنجليزي (term) فارغ.');
  }
  if (!translation) {
    errors.push(`الترجمة العربية للمصطلح "${term || '?'}" فارغة.`);
  }
  if (options?.strict !== false) {
    if (!definitionAr || definitionAr.length < 5) {
      errors.push(`التعريف العربي للمصطلح "${term || '?'}" ناقص أو قصير جداً.`);
    }
    if (!definitionEn || definitionEn.length < 5) {
      errors.push(`التعريف الإنجليزي للمصطلح "${term || '?'}" ناقص أو قصير جداً.`);
    }
  }

  let sanitizedUmdCode: string | undefined = candidate.umdCode?.trim() || undefined;
  let fabricatedUmdCodeRejected = false;
  if (sanitizedUmdCode && isFabricatedOrPlaceholderUmdCode(sanitizedUmdCode)) {
    fabricatedUmdCodeRejected = true;
    sanitizedUmdCode = undefined;
    if (options?.strict) {
      errors.push(`رمز المعجم الطبي الموحد (${candidate.umdCode}) وهمي أو غير صالح.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedUmdCode,
    fabricatedUmdCodeRejected
  };
}

export function classifyMedicalTermCandidate(
  candidate: Partial<DictionaryTerm>,
  existingTerms: DictionaryTerm[],
  existingAbbreviations: ClinicalAbbreviation[] = [],
  options?: { includeBuiltInAbbreviations?: boolean }
): {
  status: 'New' | 'Possible Duplicate' | 'Duplicate';
  classification: 'New' | 'Possible Duplicate' | 'Duplicate';
  matchedTerm?: DictionaryTerm;
  matchedTermName?: string;
  matchedAbbreviation?: ClinicalAbbreviation;
  similarityScore: number;
  reasonAr: string;
} {
  const candNorm = normalizeTermNaturalKey({
    term: candidate.term || '',
    termNormalized: candidate.termNormalized || ''
  });
  const candSkeleton = normalizeTermPunctuationSkeleton(candidate.term || '');
  const candNoSpace = candSkeleton.replace(/\s+/g, '');
  const candAr = normalizeArabicMedicalText(candidate.translation || '');
  const candUmd =
    candidate.umdCode && !isFabricatedOrPlaceholderUmdCode(candidate.umdCode)
      ? candidate.umdCode.trim().toUpperCase()
      : '';

  if (!candNorm) {
    return {
      status: 'Duplicate',
      classification: 'Duplicate',
      similarityScore: 1,
      reasonAr: 'المصطلح فارغ أو غير صالح.'
    };
  }

  for (const existing of existingTerms) {
    const exNorm = normalizeTermNaturalKey(existing);
    const exSkeleton = normalizeTermPunctuationSkeleton(existing.term);
    const exNoSpace = exSkeleton.replace(/\s+/g, '');
    const exAr = normalizeArabicMedicalText(existing.translation);
    const exUmd =
      existing.umdCode && !isFabricatedOrPlaceholderUmdCode(existing.umdCode)
        ? existing.umdCode.trim().toUpperCase()
        : '';

    if (
      candNorm === exNorm ||
      (candSkeleton && candSkeleton === exSkeleton) ||
      (candNoSpace.length >= 4 && candNoSpace === exNoSpace)
    ) {
      return {
        status: 'Duplicate',
        classification: 'Duplicate',
        matchedTerm: existing,
        matchedTermName: existing.term,
        similarityScore: 1,
        reasonAr: `تطابق مباشر في المصطلح الإنجليزي مع "${existing.term}".`
      };
    }

    if (candUmd && exUmd && candUmd === exUmd) {
      return {
        status: 'Duplicate',
        classification: 'Duplicate',
        matchedTerm: existing,
        matchedTermName: existing.term,
        similarityScore: 1,
        reasonAr: `تطابق في رمز المعجم الطبي الموحد (${candUmd}) مع "${existing.term}".`
      };
    }

    const existingSynonyms = (existing.relations?.synonyms || []).map((s) =>
      normalizeTermPunctuationSkeleton(s)
    );
    const candSynonyms = (candidate.relations?.synonyms || []).map((s) =>
      normalizeTermPunctuationSkeleton(s)
    );

    if (
      existingSynonyms.includes(candSkeleton) ||
      candSynonyms.includes(exSkeleton)
    ) {
      return {
        status: 'Possible Duplicate',
        classification: 'Possible Duplicate',
        matchedTerm: existing,
        matchedTermName: existing.term,
        similarityScore: 0.92,
        reasonAr: `تطابق عبر المرادفات المسجلة مع المصطلح "${existing.term}".`
      };
    }

    // Check initialism match (e.g. "MI" vs "Myocardial Infarction")
    const exWords = exSkeleton.split(' ').filter(Boolean);
    const exInitials = exWords.map((w) => w[0]).join('');
    const candWords = candSkeleton.split(' ').filter(Boolean);
    const candInitials = candWords.map((w) => w[0]).join('');
    if (
      (candNoSpace.length >= 2 &&
        candNoSpace.length <= 6 &&
        exWords.length >= 2 &&
        candNoSpace === exInitials) ||
      (exNoSpace.length >= 2 &&
        exNoSpace.length <= 6 &&
        candWords.length >= 2 &&
        exNoSpace === candInitials)
    ) {
      return {
        status: 'Possible Duplicate',
        classification: 'Possible Duplicate',
        matchedTerm: existing,
        matchedTermName: existing.term,
        similarityScore: 0.9,
        reasonAr: `تطابق اختصار الحروف الأولى مع المصطلح "${existing.term}".`
      };
    }

    if (candAr && exAr && candAr.length >= 4 && candAr === exAr) {
      return {
        status: 'Possible Duplicate',
        classification: 'Possible Duplicate',
        matchedTerm: existing,
        matchedTermName: existing.term,
        similarityScore: 0.88,
        reasonAr: `نفس الترجمة العربية الدقيقة مسجلة للمصطلح "${existing.term}".`
      };
    }
  }

  if (options?.includeBuiltInAbbreviations !== false && existingAbbreviations.length > 0) {
    for (const abbr of existingAbbreviations) {
      const abbrKey = normalizeTermPunctuationSkeleton(abbr.abbr);
      const expKey = normalizeTermPunctuationSkeleton(abbr.defaultExpansionEn);
      if (candSkeleton === abbrKey || (expKey && candSkeleton === expKey)) {
        return {
          status: 'Possible Duplicate',
          classification: 'Possible Duplicate',
          matchedAbbreviation: abbr,
          matchedTermName: abbr.abbr,
          similarityScore: 0.9,
          reasonAr: `يتطابق مع الاختصار السريري المسجل "${abbr.abbr}" (${abbr.defaultExpansionEn}).`
        };
      }
    }
  }

  return {
    status: 'New',
    classification: 'New',
    similarityScore: 0,
    reasonAr: 'مصطلح طبي جديد غير مكرر.'
  };
}



