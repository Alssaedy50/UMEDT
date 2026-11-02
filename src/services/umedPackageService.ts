import {
  UmedPackageManifest,
  UmedPackagePayload,
  UmedPackageCounts,
  InstalledPackageRecord,
  UmedMcqQuestion,
  UmedClinicalCase
} from '../types/umedPackage';
import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MorphologicalAffix,
  ClinicalAbbreviation
} from '../types/lexicon';
import {
  APP_VERSION,
  DB_SCHEMA_VERSION,
  computeSha256Hex,
  verifyPackageSignature,
  assertNotSqlitePayload
} from './dataPlatformService';

export const UMED_PACK_EXTENSION = '.umedpack';
export const INSTALLED_PACKAGES_STORAGE_KEY = 'umed2_installed_packages_v1';
export const MCQ_QUESTIONS_STORAGE_KEY = 'umed2_mcq_questions_v1';
export const CLINICAL_CASES_STORAGE_KEY = 'umed2_clinical_cases_v1';

/**
 * Validates a UMED Medical Package manifest against the official UMED-2 schema.
 */
export function validateUmedPackageManifest(manifestRaw: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: UmedPackageManifest;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifestRaw || typeof manifestRaw !== 'object') {
    return { valid: false, errors: ['ملف manifest.json مفقود أو بتنسيق غير صالح.'], warnings };
  }

  const m = manifestRaw as Record<string, any>;

  if (!m.package_id || typeof m.package_id !== 'string') {
    errors.push('حقل package_id إلزامي ويجب أن يكون نصاً فريداً.');
  }
  if (!m.package_name || typeof m.package_name !== 'string') {
    errors.push('حقل package_name إلزامي.');
  }
  if (m.schema_version !== DB_SCHEMA_VERSION) {
    errors.push(
      `إصدار المخطط غير متوافق: الحزمة تستخدم schema_version=${m.schema_version}، بينما التطبيق يتطلب schema_version=${DB_SCHEMA_VERSION}.`
    );
  }

  // Version check
  if (m.minimum_app_version && typeof m.minimum_app_version === 'string') {
    if (compareSemver(m.minimum_app_version, APP_VERSION) > 0) {
      errors.push(
        `إصدار التطبيق الحالي (${APP_VERSION}) أقدم من الحد الأدنى المطلوب للحزمة (${m.minimum_app_version}).`
      );
    }
  }

  if (!m.records_count || typeof m.records_count !== 'object') {
    warnings.push('حقل records_count غير متوفر، سيتم احتساب السجلات آلياً.');
  }

  const counts: UmedPackageCounts = {
    terms: Number(m.records_count?.terms || 0),
    questions: Number(m.records_count?.questions || 0),
    sentences: Number(m.records_count?.sentences || 0),
    topics: Number(m.records_count?.topics || 0),
    affixes: Number(m.records_count?.affixes || 0),
    abbreviations: Number(m.records_count?.abbreviations || 0),
    clinicalCases: Number(m.records_count?.clinicalCases || 0)
  };

  const manifest: UmedPackageManifest = {
    package_id: String(m.package_id || `umed-pkg-${Date.now().toString(36)}`),
    package_name: String(m.package_name || 'حزمة طبية غير معنونة'),
    description: String(m.description || ''),
    category: String(m.category || 'General Medicine'),
    subject: String(m.subject || 'Clinical Sciences'),
    language: m.language === 'ar' || m.language === 'en' || m.language === 'bilingual' ? m.language : 'bilingual',
    package_version: String(m.package_version || '1.0.0'),
    schema_version: Number(m.schema_version || DB_SCHEMA_VERSION),
    minimum_app_version: String(m.minimum_app_version || '2.2.0'),
    created_at: String(m.created_at || new Date().toISOString()),
    updated_at: String(m.updated_at || new Date().toISOString()),
    author: String(m.author || 'UMED Community'),
    source: String(m.source || 'Local Creation'),
    license: m.license ? String(m.license) : undefined,
    records_count: counts,
    files: Array.isArray(m.files) ? m.files : [],
    checksums: typeof m.checksums === 'object' && m.checksums !== null ? m.checksums : {},
    signature: m.signature ? String(m.signature) : undefined,
    signature_algorithm: m.signature_algorithm || 'ECDSA-P256-SHA256',
    key_fingerprint: m.key_fingerprint ? String(m.key_fingerprint) : undefined
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest
  };
}

/**
 * Builds a valid .umedpack ZIP file in memory conforming to the UMED-2 packaging standard.
 */
export async function buildUmedPackageZipBytes(payload: {
  manifest: Partial<UmedPackageManifest>;
  terms?: DictionaryTerm[];
  questions?: UmedMcqQuestion[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  customAffixes?: MorphologicalAffix[];
  customAbbreviations?: ClinicalAbbreviation[];
  clinicalCases?: UmedClinicalCase[];
}): Promise<{
  packageBytes: Uint8Array;
  manifest: UmedPackageManifest;
  sha256Hex: string;
}> {
  const encoder = new TextEncoder();
  const terms = payload.terms || [];
  const questions = payload.questions || [];
  const sentences = payload.sentences || [];
  const topics = payload.topics || [];
  const customAffixes = payload.customAffixes || [];
  const customAbbreviations = payload.customAbbreviations || [];
  const clinicalCases = payload.clinicalCases || [];

  const counts: UmedPackageCounts = {
    terms: terms.length,
    questions: questions.length,
    sentences: sentences.length,
    topics: topics.length,
    affixes: customAffixes.length,
    abbreviations: customAbbreviations.length,
    clinicalCases: clinicalCases.length
  };

  const nowIso = new Date().toISOString();
  const fullManifest: UmedPackageManifest = {
    package_id: payload.manifest.package_id || `umed-pkg-${Date.now().toString(36)}`,
    package_name: payload.manifest.package_name || 'حزمة طبية جديدة',
    description: payload.manifest.description || '',
    category: payload.manifest.category || 'Medical',
    subject: payload.manifest.subject || 'Internal Medicine',
    language: payload.manifest.language || 'bilingual',
    package_version: payload.manifest.package_version || '1.0.0',
    schema_version: DB_SCHEMA_VERSION,
    minimum_app_version: APP_VERSION,
    created_at: payload.manifest.created_at || nowIso,
    updated_at: nowIso,
    author: payload.manifest.author || 'UMED Physician',
    source: payload.manifest.source || 'UMED Package Studio',
    license: payload.manifest.license || 'Medical Educational Open License',
    records_count: counts,
    files: [
      'manifest.json',
      'data/terms.json',
      'data/questions.json',
      'data/sentences.json',
      'data/topics.json',
      'data/affixes.json',
      'data/abbreviations.json',
      'data/clinical_cases.json',
      'integrity/checksums.json'
    ],
    checksums: {}
  };

  // Prepare data files
  const fileMap: Record<string, Uint8Array> = {
    'data/terms.json': encoder.encode(JSON.stringify(terms, null, 2)),
    'data/questions.json': encoder.encode(JSON.stringify(questions, null, 2)),
    'data/sentences.json': encoder.encode(JSON.stringify(sentences, null, 2)),
    'data/topics.json': encoder.encode(JSON.stringify(topics, null, 2)),
    'data/affixes.json': encoder.encode(JSON.stringify(customAffixes, null, 2)),
    'data/abbreviations.json': encoder.encode(JSON.stringify(customAbbreviations, null, 2)),
    'data/clinical_cases.json': encoder.encode(JSON.stringify(clinicalCases, null, 2))
  };

  // Compute checksums for each data file
  const checksums: Record<string, string> = {};
  for (const [filePath, bytes] of Object.entries(fileMap)) {
    checksums[filePath] = await computeSha256Hex(bytes);
  }
  fullManifest.checksums = checksums;

  const checksumsFileBytes = encoder.encode(JSON.stringify(checksums, null, 2));
  fileMap['integrity/checksums.json'] = checksumsFileBytes;

  const manifestFileBytes = encoder.encode(JSON.stringify(fullManifest, null, 2));
  fileMap['manifest.json'] = manifestFileBytes;

  // Build standard uncompressed ZIP container
  const zipBytes = assembleStandardZip(fileMap);
  assertNotSqlitePayload(zipBytes, `${fullManifest.package_id}.umedpack`);

  const sha256Hex = await computeSha256Hex(zipBytes);

  return {
    packageBytes: zipBytes,
    manifest: fullManifest,
    sha256Hex
  };
}

/**
 * Inspects, decompresses, and validates a .umedpack or .zip package.
 */
export async function inspectAndReadUmedPackage(
  packageBytes: Uint8Array,
  options?: { trustedPublicKeyPem?: string }
): Promise<{
  valid: boolean;
  manifest: UmedPackageManifest;
  payload: UmedPackagePayload;
  integrity: {
    checksumsVerified: boolean;
    filesCount: number;
    signatureVerified: boolean;
    unverifiedReason?: string;
  };
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  assertNotSqlitePayload(packageBytes);

  // Extract all files from ZIP archive
  const extractedFiles = extractEntriesFromZip(packageBytes);

  if (!extractedFiles['manifest.json']) {
    return {
      valid: false,
      manifest: null as any,
      payload: null as any,
      integrity: { checksumsVerified: false, filesCount: 0, signatureVerified: false },
      errors: ['الحزمة لا تحتوي على ملف manifest.json في الجذر.'],
      warnings
    };
  }

  // Parse and validate manifest
  const decoder = new TextDecoder();
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(decoder.decode(extractedFiles['manifest.json']));
  } catch (err) {
    return {
      valid: false,
      manifest: null as any,
      payload: null as any,
      integrity: { checksumsVerified: false, filesCount: 0, signatureVerified: false },
      errors: ['تعذر قراءة ملف manifest.json: صيغة JSON تالفة.'],
      warnings
    };
  }

  const manifestValidation = validateUmedPackageManifest(manifestJson);
  if (!manifestValidation.valid) {
    return {
      valid: false,
      manifest: manifestValidation.manifest!,
      payload: null as any,
      integrity: { checksumsVerified: false, filesCount: Object.keys(extractedFiles).length, signatureVerified: false },
      errors: manifestValidation.errors,
      warnings: manifestValidation.warnings
    };
  }

  const manifest = manifestValidation.manifest!;
  warnings.push(...manifestValidation.warnings);

  // Verify internal checksums
  let checksumsVerified = true;
  let unverifiedReason: string | undefined;

  for (const [filePath, expectedChecksum] of Object.entries(manifest.checksums || {})) {
    const fileBytes = extractedFiles[filePath];
    if (!fileBytes) {
      warnings.push(`الملف ${filePath} مدرج في جدول البصمات لكنه غير موجود داخل الحزمة.`);
      checksumsVerified = false;
      unverifiedReason = `ملف مفقود: ${filePath}`;
      continue;
    }
    const actualChecksum = await computeSha256Hex(fileBytes);
    if (actualChecksum !== expectedChecksum) {
      errors.push(`خطأ سلامة البيانات: بصمة الملف ${filePath} لا تطابق البصمة المعتمدة في الحزمة.`);
      checksumsVerified = false;
      unverifiedReason = `تلف في بصمة ${filePath}`;
    }
  }

  // Verify digital signature if present
  let signatureVerified = false;
  if (manifest.signature && options?.trustedPublicKeyPem) {
    try {
      const sigResult = await verifyPackageSignature({
        bytes: packageBytes,
        signature: manifest.signature,
        publicKeyPem: options.trustedPublicKeyPem,
        algorithm: manifest.signature_algorithm || 'ECDSA-P256-SHA256'
      });
      signatureVerified = sigResult.verified;
      if (!sigResult.verified) {
        warnings.push('التوقيع الرقمي للحزمة غير متطابق مع المفتاح العام المعتمد.');
      }
    } catch {
      warnings.push('تعذر التحقق من التوقيع الرقمي للحزمة.');
    }
  }

  // Parse package data contents
  const parseJsonFile = <T>(path: string, fallback: T): T => {
    // Try multiple possible paths for compatibility
    const candidates = [
      path,
      path.replace(/^data\//, ''),
      `data/${path}`
    ];
    for (const c of candidates) {
      if (extractedFiles[c]) {
        try {
          return JSON.parse(decoder.decode(extractedFiles[c])) as T;
        } catch {
          warnings.push(`تعذر تحليل الملف ${c} كـ JSON سليم.`);
        }
      }
    }
    return fallback;
  };

  const terms = parseJsonFile<DictionaryTerm[]>('data/terms.json', []);
  const questions = parseJsonFile<UmedMcqQuestion[]>('data/questions.json', []);
  const sentences = parseJsonFile<LinkedSentence[]>('data/sentences.json', []);
  const topics = parseJsonFile<TopicArticle[]>('data/topics.json', []);
  const customAffixes = parseJsonFile<MorphologicalAffix[]>('data/affixes.json', []);
  const customAbbreviations = parseJsonFile<ClinicalAbbreviation[]>('data/abbreviations.json', []);
  const clinicalCases = parseJsonFile<UmedClinicalCase[]>('data/clinical_cases.json', []);

  const payload: UmedPackagePayload = {
    manifest,
    terms,
    questions,
    sentences,
    topics,
    customAffixes,
    customAbbreviations,
    clinicalCases
  };

  return {
    valid: errors.length === 0,
    manifest,
    payload,
    integrity: {
      checksumsVerified,
      filesCount: Object.keys(extractedFiles).length,
      signatureVerified,
      unverifiedReason
    },
    errors,
    warnings
  };
}

/**
 * Storage helpers for Installed Packages management
 */
const memoryFallbackStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return memoryFallbackStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
  } else {
    memoryFallbackStore.set(key, value);
  }
}

export function loadInstalledPackages(): InstalledPackageRecord[] {
  try {
    const stored = getStorageItem(INSTALLED_PACKAGES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as InstalledPackageRecord[];
    }
  } catch {
    // ignore
  }

  // Default initial built-in package record representing the core seed lexicon
  return [
    {
      packageId: 'umed-core-seed',
      packageName: 'UMED-2 Core Medical Lexicon',
      version: '2026.10.0-umd',
      installedAt: '2026-10-31T00:00:00.000Z',
      subject: 'General & Clinical Medicine',
      category: 'Core System Dataset',
      author: 'UMED Foundation',
      source: 'Built-in Offline Seed',
      recordsCount: {
        terms: 50,
        questions: 10,
        sentences: 30,
        topics: 5,
        affixes: 20,
        abbreviations: 15,
        clinicalCases: 5
      },
      sizeBytes: 154000,
      isBuiltIn: true,
      status: 'active',
      checksumVerified: true,
      signatureVerified: true,
      notes: 'حزمة النظام الأساسية المدمجة مع التطبيق دون الحاجة لاتصال بالإنترنت.'
    }
  ];
}

export function saveInstalledPackages(packages: InstalledPackageRecord[]): void {
  try {
    setStorageItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify(packages));
  } catch (err) {
    console.warn('[UmedPackageService] Failed to persist installed packages:', err);
  }
}

/**
 * Loads additional standalone MCQ questions stored locally.
 */
export function loadStoredMcqQuestions(): UmedMcqQuestion[] {
  try {
    const stored = getStorageItem(MCQ_QUESTIONS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UmedMcqQuestion[];
    }
  } catch {
    // ignore
  }
  return [
    {
      id: 'mcq-seed-1',
      questionEn: 'Which medication is the first-line treatment for an acute anaphylactic reaction?',
      questionAr: 'ما هو الدواء الذي يمثل خط العلاج الأول في حالات الصدمة التأقية (Anaphylaxis) الحادة؟',
      options: [
        { key: 'A', textEn: 'Intramuscular Epinephrine', textAr: 'الأدرينالين داخل العضل' },
        { key: 'B', textEn: 'Intravenous Diphenhydramine', textAr: 'مضاد الهيستامين وريدياً' },
        { key: 'C', textEn: 'Oral Hydrocortisone', textAr: 'الهيدروكورتيزون الفموي' },
        { key: 'D', textEn: 'Inhaled Albuterol only', textAr: 'موسع القصبات بالاستنشاق فقط' }
      ],
      correctAnswerKey: 'A',
      explanationEn: 'Epinephrine administered intramuscularly into the anterolateral mid-thigh is the immediate first-line drug of choice for anaphylaxis.',
      explanationAr: 'يعد الأدرينالين (الإبينفرين) المحقون في الفخذ خط العلاج الأساسي الفوري لإنقاذ حياة المريض في الصدمة التأقية.',
      specialty: 'Emergency Medicine',
      subject: 'Pharmacology',
      confidence: 100,
      isVerified: true
    },
    {
      id: 'mcq-seed-2',
      questionEn: 'What is the characteristic electrocardiogram (ECG) finding in acute transmural myocardial infarction?',
      questionAr: 'ما هو التغير المميز في تخطيط القلب الكهربائي (ECG) عند حدوث احتشاء حاد في عضلة القلب عبر كامل الجدار؟',
      options: [
        { key: 'A', textEn: 'ST-segment elevation', textAr: 'ارتفاع وصلة ST (ST Elevation)' },
        { key: 'B', textEn: 'Prolonged PR interval', textAr: 'استطالة فترة PR' },
        { key: 'C', textEn: 'Sinus arrhythmia', textAr: 'عدم انتظام الجيب الأذيني' },
        { key: 'D', textEn: 'Isolated tall T waves in lead III', textAr: 'موجات T معزولة في الاتجاه III' }
      ],
      correctAnswerKey: 'A',
      explanationEn: 'STEMI (ST-Elevation Myocardial Infarction) is characterized by contiguous ST elevations reflecting acute transmural ischemia.',
      explanationAr: 'يدل ارتفاع وصلة ST على نقص تروية ونخر حاد عبر كامل سمك عضلة القلب يستوجب فتح الشريان التاجي عاجلاً.',
      specialty: 'Cardiology',
      subject: 'Cardiovascular Medicine',
      confidence: 100,
      isVerified: true
    }
  ];
}

export function saveStoredMcqQuestions(questions: UmedMcqQuestion[]): void {
  try {
    setStorageItem(MCQ_QUESTIONS_STORAGE_KEY, JSON.stringify(questions));
  } catch (err) {
    console.warn('[UmedPackageService] Failed to save MCQ questions:', err);
  }
}

/**
 * Loads additional clinical cases stored locally.
 */
export function loadStoredClinicalCases(): UmedClinicalCase[] {
  try {
    const stored = getStorageItem(CLINICAL_CASES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UmedClinicalCase[];
    }
  } catch {
    // ignore
  }
  return [
    {
      id: 'case-seed-1',
      titleEn: 'Acute Chest Pain in a 58-Year-Old Diabetic Patient',
      titleAr: 'ألم صدري حاد لدى مريض سكري يبلغ من العمر 58 عاماً',
      patientProfile: '58 y/o male with history of Type 2 DM, HTN, and 30-pack-year smoking history.',
      presentationEn: 'Patient presents to ED with 2 hours of substernal crushing chest pain radiating to left arm and jaw, accompanied by diaphoresis and nausea.',
      presentationAr: 'حضر المريض إلى الطوارئ يعاني من ألم صدري عاصر خلف القص منذ ساعتين ينتشر للذراع اليسرى والفك مترافقاً مع تعرق بارد وغثيان.',
      investigations: 'ECG shows 3mm ST elevation in leads V1-V4. Troponin I is significantly elevated.',
      diagnosisEn: 'Acute Anterior STEMI (ST-Elevation Myocardial Infarction)',
      diagnosisAr: 'احتشاء عضلة القلب الحاد بالجدار الأمامي مع ارتفاع ST',
      discussion: 'Emergency primary percutaneous coronary intervention (PPCI) indicated within 90 minutes. Dual antiplatelet and anticoagulation initiated.',
      specialty: 'Cardiology'
    }
  ];
}

export function saveStoredClinicalCases(cases: UmedClinicalCase[]): void {
  try {
    setStorageItem(CLINICAL_CASES_STORAGE_KEY, JSON.stringify(cases));
  } catch (err) {
    console.warn('[UmedPackageService] Failed to save Clinical Cases:', err);
  }
}

/**
 * Pure TypeScript ZIP file assembler (uncompressed Store mode, CRC32, ZIP standard).
 */
function assembleStandardZip(files: Record<string, Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const fileEntries: Array<{
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc32: number;
    offset: number;
  }> = [];

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  const computeCrc = (buf: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  let totalSize = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    fileEntries.push({
      nameBytes,
      data,
      crc32: computeCrc(data),
      offset: 0
    });
    // Local header (30) + name + data
    totalSize += 30 + nameBytes.length + data.length;
  }

  // Central directory headers
  let cdSize = 0;
  for (const entry of fileEntries) {
    cdSize += 46 + entry.nameBytes.length;
  }
  totalSize += cdSize + 22; // + EOCD (22)

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // 1. Write Local File Headers and Data
  for (const entry of fileEntries) {
    entry.offset = pos;

    view.setUint32(pos, 0x04034b50, true); // Local header signature
    view.setUint16(pos + 4, 20, true); // Version needed
    view.setUint16(pos + 6, 0, true); // General purpose bit flag
    view.setUint16(pos + 8, 0, true); // Compression (0 = Store)
    view.setUint16(pos + 10, 0, true); // Last mod time
    view.setUint16(pos + 12, 0, true); // Last mod date
    view.setUint32(pos + 14, entry.crc32, true); // CRC-32
    view.setUint32(pos + 18, entry.data.length, true); // Compressed size
    view.setUint32(pos + 22, entry.data.length, true); // Uncompressed size
    view.setUint16(pos + 26, entry.nameBytes.length, true); // File name length
    view.setUint16(pos + 28, 0, true); // Extra field length
    pos += 30;

    output.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;

    output.set(entry.data, pos);
    pos += entry.data.length;
  }

  // 2. Write Central Directory
  const cdOffset = pos;
  for (const entry of fileEntries) {
    view.setUint32(pos, 0x02014b50, true); // Central header signature
    view.setUint16(pos + 4, 20, true); // Version made by
    view.setUint16(pos + 6, 20, true); // Version needed
    view.setUint16(pos + 8, 0, true); // Flag
    view.setUint16(pos + 10, 0, true); // Compression
    view.setUint16(pos + 12, 0, true); // Mod time
    view.setUint16(pos + 14, 0, true); // Mod date
    view.setUint32(pos + 16, entry.crc32, true); // CRC-32
    view.setUint32(pos + 20, entry.data.length, true); // Compressed size
    view.setUint32(pos + 24, entry.data.length, true); // Uncompressed size
    view.setUint16(pos + 28, entry.nameBytes.length, true); // Name length
    view.setUint16(pos + 30, 0, true); // Extra length
    view.setUint16(pos + 32, 0, true); // Comment length
    view.setUint16(pos + 34, 0, true); // Disk number start
    view.setUint16(pos + 36, 0, true); // Internal file attributes
    view.setUint32(pos + 38, 0, true); // External file attributes
    view.setUint32(pos + 42, entry.offset, true); // Relative offset
    pos += 46;

    output.set(entry.nameBytes, pos);
    pos += entry.nameBytes.length;
  }

  // 3. Write End of Central Directory Record (EOCD)
  view.setUint32(pos, 0x06054b50, true); // EOCD signature
  view.setUint16(pos + 4, 0, true); // Disk number
  view.setUint16(pos + 6, 0, true); // Start disk
  view.setUint16(pos + 8, fileEntries.length, true); // Total entries this disk
  view.setUint16(pos + 10, fileEntries.length, true); // Total entries
  view.setUint32(pos + 12, cdSize, true); // Size of central dir
  view.setUint32(pos + 16, cdOffset, true); // Offset of central dir
  view.setUint16(pos + 20, 0, true); // Comment length

  return output;
}

/**
 * Pure TypeScript ZIP parser with Zip-Slip path sanitization.
 */
function extractEntriesFromZip(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder();
  const result: Record<string, Uint8Array> = {};

  let pos = 0;
  while (pos + 30 < zipBytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) {
      break; // End of local headers or reached central directory
    }

    const compression = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 18, true);
    const uncompressedSize = view.getUint32(pos + 22, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);

    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLen;
    const rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
    const safeName = rawName.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.\//g, '');

    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + (compressedSize || uncompressedSize);

    if (compression === 0 && dataEnd <= zipBytes.length) {
      result[safeName] = zipBytes.slice(dataStart, dataEnd);
    }

    pos = dataEnd;
  }

  return result;
}

function compareSemver(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
