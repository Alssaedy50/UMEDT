import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  APP_VERSION,
  BUNDLED_DATA_VERSION,
  DB_SCHEMA_VERSION,
  SUPPORTED_IMPORT_EXTENSIONS,
  assertNotSqlitePayload,
  checkRemoteDataManifest,
  downloadRemotePackageBytes,
  verifyPublisherKeyPairMatch,
  signPackageBytesWithPrivateKey,
  verifyPackageSignature,
  assemblePackageFromZipJsonMap,
  inspectAndExtractSafeZipPackage,
  validateDataPackageObject,
  buildDataPackageZipBytes,
  computeSha256Hex
} from '../src/services/dataPlatformService';
import {
  DEFAULT_ONLINE_UPDATE_CONFIG,
  STORAGE_KEYS,
  executeAtomicPackageImport,
  exportFullDatabaseJson,
  exportFullDatabaseZipBytes,
  loadAppState,
  saveTerms,
  saveTopics,
  saveCustomAffixes,
  saveCustomAbbreviations,
  loadOnlineUpdateConfig,
  saveOnlineUpdateConfig,
  loadPublisherReleaseConfig,
  setEmbeddedTrustedPublicKeyOverrideForTesting,
  runOnlineUpdateCycle,
  rollbackToPreviousDataVersion,
  runSafeVersionedStorageMigration,
  runSecurityAndReliabilityAuditSuite,
  runStage6DataManagementDiagnosticSuite,
  runStage7FinalReleaseReadinessSuite
} from '../src/services/storageService';
import { generateAndVerifyPermanentSigningKeys } from './generate-signing-keys';
import { executeProductionDataReleasePublish } from './publish-data-release';
import { uploadReleaseBundleToR2 } from './upload-release-to-r2';
import {
  validateUmedPackageManifest,
  buildUmedPackageZipBytes,
  inspectAndReadUmedPackage,
  loadInstalledPackages,
  saveInstalledPackages
} from '../src/services/umedPackageService';
import {
  executeAtomicMedicalImport,
  rollbackImportByHistoryId,
  loadImportHistory
} from '../src/services/importManagerService';
import {
  prepareAndDownloadFile,
  verifyLocalStoragePersistence,
  getLastLocalDownloadRecord
} from '../src/utils/downloadHelper';
import {
  loadMedicalBlocks,
  saveMedicalBlocks,
  loadMedicalSubjects,
  saveMedicalSubjects,
  loadAcademicBooks,
  loadAcademicExams,
  saveAcademicExams,
  loadMediaAssetsIndex,
  loadUserStudyNotes,
  saveUserStudyNotes,
  saveBookReadingProgress,
  toggleBookFavorite,
  normalizeMediaAssetRecord,
  saveAcademicBooks,
  buildContextualContentBlocksForTopic,
  enrichAllTopicsWithHierarchy,
  resolveEffectiveTopicHierarchy
} from '../src/services/learningHierarchyService';
import {
  saveLocalMediaRecord,
  getLocalMediaRecord,
  clearMemoryMediaCacheForTesting,
  detectExternalMediaKind,
  downloadRemoteMediaToOfflineCache,
  openMediaInExternalApp,
  isDownloadableMediaUrl,
  normalizeMediaMimeType
} from '../src/services/mediaStorageService';
import { sanitizeSvgMarkup } from '../src/components/TopicContentBlockEditor';
import {
  UMEDT_DATA_CATALOG_URL,
  computeDeterministicFastHashHex,
  computeEntitySha256,
  deduplicateTopicMediaAndAttachments,
  enqueueEntitiesForCloudSync,
  processCloudSyncQueue,
  loadSyncQueue,
  setCloudSyncSimulatedOffline,
  syncWithRemoteCloudLibrary,
  syncFromUmedtDataRepository,
  loadUnifiedCloudMirror,
  saveUnifiedCloudMirror,
  mergeRecordsIntoCloudSnapshot,
  buildCloudLibraryCatalogView,
  downloadCloudLibraryTarget,
  deleteCloudLibraryTargetLocally,
  deleteCloudLibraryTargetPermanently,
  clearLocallyRemovedRegistry,
  clearPermanentlyDeletedRegistry,
  canonicalizeForHash
} from '../src/services/cloudLibrarySyncService';
import {
  buildSimpleStoreZipBytes,
  importUniversalAiOrLocalContent,
  importUniversalZipArchiveBytes
} from '../src/services/aiUniversalImportService';
import {
  encryptBotTokenForStorage,
  decryptBotTokenFromStorage,
  redactBotTokenFromText,
  stripBinaryMediaFromTopicsForBackup,
  loadTelegramBackupConfig,
  saveTelegramBackupConfig,
  readRawTelegramConfigJsonForAudit,
  createUnifiedBackupPackage,
  createUnifiedZipBackupBytes,
  sendBackupToTelegram,
  scheduleDebouncedTelegramAutoSync,
  flushPendingTelegramAutoSync,
  scheduleDebouncedTelegramChangeNote,
  flushPendingTelegramChangeNotes,
  fetchLatestBackupPayloadFromTelegram,
  sendInteractiveFileToTelegram,
  uploadPendingMediaToTelegramChannel
} from '../src/services/telegramBackupService';
import {
  generateStandaloneHtmlDocument,
  generateStandaloneZipArchiveBytes,
  generateStandaloneExamHtmlDocument,
  generateStandaloneExamZipArchiveBytes,
  inspectZipEntriesList
} from '../src/services/standaloneExportService';
import {
  saveQuizAttempt,
  loadQuizAttempts,
  loadQuizQuestions
} from '../src/services/quizEngineService';
import type { TopicArticle } from '../src/types/lexicon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('UMED-2 — Independent Web, PWA & Android APK Verification Suite');
  console.log('================================================================');

  // 1. Verify Architecture & Versioning Separation (Stage 6 APK v2.5.0)
  assertCondition(APP_VERSION === '2.5.0', `Expected APP_VERSION 2.5.0, got ${APP_VERSION}`);
  assertCondition(DB_SCHEMA_VERSION === 2, `Expected DB_SCHEMA_VERSION 2, got ${DB_SCHEMA_VERSION}`);
  assertCondition(
    BUNDLED_DATA_VERSION === '2026.10.0-umd',
    `Expected BUNDLED_DATA_VERSION 2026.10.0-umd, got ${BUNDLED_DATA_VERSION}`
  );
  assertCondition(
    SUPPORTED_IMPORT_EXTENSIONS.length === 2 &&
      SUPPORTED_IMPORT_EXTENSIONS.includes('.json') &&
      SUPPORTED_IMPORT_EXTENSIONS.includes('.zip'),
    'Only .json and .zip import formats must be supported'
  );
  assertCondition(
    DEFAULT_ONLINE_UPDATE_CONFIG.autoCheckOnStartup === false &&
      (DEFAULT_ONLINE_UPDATE_CONFIG.manifestUrl === '' ||
        DEFAULT_ONLINE_UPDATE_CONFIG.manifestUrl.includes('Alssaedy50/UMEDT-DATA')),
    'Optional CDN medical-data auto-check on startup must NOT be activated by default'
  );
  assertCondition(
    DEFAULT_ONLINE_UPDATE_CONFIG.autoUpdatePolicy === 'notify-only',
    'Default update policy must remain notify-only'
  );
  console.log('[PASS] 1. Separated App/Schema/Data Versioning & Non-Activated Default CDN Policy');

  // 2. Verify package-lock.json and production web/PWA assets used by the Android bundle.
  // Cloudflare Pages deployment is intentionally not part of the supported release pipeline.
  const packageLockPath = path.join(ROOT_DIR, 'package-lock.json');
  const headersPath = path.join(ROOT_DIR, 'public', '_headers');
  const distIndexPath = path.join(ROOT_DIR, 'dist', 'index.html');
  const distSwPath = path.join(ROOT_DIR, 'dist', 'sw.js');
  const distManifestPath = path.join(ROOT_DIR, 'dist', 'manifest.webmanifest');

  assertCondition(fs.existsSync(packageLockPath), 'package-lock.json must exist for npm ci');
  const lockfileJson = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  assertCondition(
    typeof lockfileJson.lockfileVersion === 'number' && lockfileJson.lockfileVersion >= 2,
    'package-lock.json must have a valid lockfileVersion >= 2'
  );
  // Keep the headers file because its policy is independently verified below.
  assertCondition(fs.existsSync(headersPath), 'public/_headers must exist');
  assertCondition(fs.existsSync(distIndexPath), 'dist/index.html must exist');
  assertCondition(fs.existsSync(distSwPath), 'dist/sw.js PWA service worker must exist');
  assertCondition(fs.existsSync(distManifestPath), 'dist/manifest.webmanifest must exist');
  console.log('[PASS] 2. package-lock.json & Production Web/PWA Build Assets');

  // 3. Verify Capacitor Android Native Project & APK GitHub Actions Workflow
  const capConfigPath = path.join(ROOT_DIR, 'capacitor.config.ts');
  const androidBuildGradlePath = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
  const androidManifestPath = path.join(
    ROOT_DIR,
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml'
  );
  const androidBundledIndexPath = path.join(
    ROOT_DIR,
    'android',
    'app',
    'src',
    'main',
    'assets',
    'public',
    'index.html'
  );
  const apkWorkflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'android-apk-release.yml');

  assertCondition(fs.existsSync(capConfigPath), 'capacitor.config.ts must exist');
  assertCondition(fs.existsSync(androidBuildGradlePath), 'android/app/build.gradle must exist');
  assertCondition(fs.existsSync(androidManifestPath), 'AndroidManifest.xml must exist');
  assertCondition(
    fs.existsSync(androidBundledIndexPath),
    'Bundled local web assets must be synced into android/app/src/main/assets/public/index.html'
  );
  assertCondition(fs.existsSync(apkWorkflowPath), 'android-apk-release.yml workflow must exist');
  const apkWorkflowContent = fs.readFileSync(apkWorkflowPath, 'utf8');
  assertCondition(
    apkWorkflowContent.includes('assembleDebug') &&
      apkWorkflowContent.includes('assembleRelease') &&
      apkWorkflowContent.includes('UMED-2-v2.5.0-debug-apk') &&
      apkWorkflowContent.includes('UMED-2-v2.5.0-release-apk') &&
      apkWorkflowContent.includes('VITE_UMED_MANIFEST_URL') &&
      apkWorkflowContent.includes('VITE_UMED_PUBLIC_KEY_PEM'),
    'android-apk-release.yml must build v2.5.0 Debug/Release APKs with Cloud OTA env vars'
  );

  const gradleContent = fs.readFileSync(androidBuildGradlePath, 'utf8');
  assertCondition(
    gradleContent.includes('org.umed2.dictengine') &&
      gradleContent.includes('versionCode 20500') &&
      gradleContent.includes('versionName "2.5.0"'),
    'android/app/build.gradle must use applicationId "org.umed2.dictengine", versionCode 20500, and versionName "2.5.0"'
  );
  console.log('[PASS] 3. Capacitor Native Android Project (v2.5.0 / 20500) & Bundled Local Web Assets Synced');

  // 3b. Verify the two-path AI generator and local-only hierarchy/import contract.
  const aiGeneratorPath = path.join(ROOT_DIR, 'src', 'components', 'AiContentGuideModal.tsx');
  const aiImporterPath = path.join(ROOT_DIR, 'src', 'services', 'aiUniversalImportService.ts');
  const libraryImportPath = path.join(ROOT_DIR, 'src', 'components', 'LibraryView.tsx');
  const aiGeneratorContent = fs.readFileSync(aiGeneratorPath, 'utf8');
  const aiImporterContent = fs.readFileSync(aiImporterPath, 'utf8');
  const libraryImportContent = fs.readFileSync(libraryImportPath, 'utf8');
  assertCondition(
    aiGeneratorContent.includes("type GeneratorMode = 'topic' | 'terms'") &&
      aiGeneratorContent.includes('Do not include "blocks" or "subjects" arrays') &&
      aiGeneratorContent.includes('Do not include blockId, subjectId, topicId, linkedBlockIds, linkedSubjectIds, linkedTopicIds') &&
      aiGeneratorContent.includes('selectedBlock.id') &&
      aiGeneratorContent.includes('selectedSubject.id'),
    'AI generator must expose only topic/global-terms modes, use selected local hierarchy IDs, and keep global terms unlinked'
  );
  assertCondition(
    aiImporterContent.includes('const nextBlocks = currentBlocks;') &&
      aiImporterContent.includes('const nextSubjects = currentSubjects;') &&
      aiImporterContent.includes('localBlockIds.has(topicBlockId)') &&
      aiImporterContent.includes("if (params.syncToCloud === true)"),
    'Universal importer must preserve local blocks/subjects, validate topic hierarchy, and default to local-only imports'
  );
  assertCondition(
    libraryImportContent.includes('syncToCloud: false'),
    'AI/file import from LibraryView must not enqueue imported content for cloud synchronization'
  );
  console.log('[PASS] 3b. Two-path AI generator, local hierarchy enforcement, and local-only import verified');

  // 4. Verify Safe, Versioned, Idempotent Storage Migration + Backup & Rollback
  const initialState = loadAppState();
  const idempotentCheck = runSafeVersionedStorageMigration();
  assertCondition(
    idempotentCheck.idempotentNoOp === true && idempotentCheck.rolledBack === false,
    'Repeated migration call must be an idempotent no-op'
  );

  // Test migration failure rollback: ensure corrupted partial write is 100% rolled back
  const termsCountBeforeFail = loadAppState().terms.length;
  const failedMigration = runSafeVersionedStorageMigration({ simulateFailure: true });
  const termsCountAfterRollback = loadAppState().terms.length;
  assertCondition(
    failedMigration.rolledBack === true && termsCountAfterRollback === termsCountBeforeFail,
    'Failed storage migration must roll back safely without losing user data'
  );
  console.log('[PASS] 4. Safe, Versioned, Idempotent Storage Migration & Automatic Rollback Verified');

  // 5. Verify Cross-Environment Data Transfer (.ZIP & .JSON Export/Import) & SQLite Rejection
  let sqliteBlocked = false;
  try {
    assertNotSqlitePayload('SQLite format 3\0', 'bad.sqlite');
  } catch {
    sqliteBlocked = true;
  }
  assertCondition(sqliteBlocked, 'SQLite binary files must be rejected');

  // Use an isolated synthetic record when the clean app state has no bundled
  // academic content. This exercises JSON/ZIP serialization without restoring
  // medical seed data to the application bundle or modifying production data.
  const transferTerms = initialState.terms.length > 0 ? initialState.terms : [{
    id: 'release-transfer-fixture-term',
    term: 'ReleaseTransferFixture',
    termNormalized: 'releasetransferfixture',
    translation: 'سجل اختبار نقل البيانات',
    phonetic: '/ˈfiːktʃər/',
    pos: 'noun',
    category: 'General' as const,
    keepEnglish: true,
    favorite: false,
    collections: [],
    ingestedAt: new Date(0).toISOString(),
    definitionAr: 'سجل اصطناعي لاختبار استيراد وتصدير النسخ الاحتياطية.',
    definitionEn: 'Synthetic record used only to verify backup import/export.',
    examples: [],
    relations: { synonyms: [], broader: [], related: [] }
  }];

  const exportedJson = exportFullDatabaseJson({
    terms: transferTerms,
    sentences: initialState.sentences,
    topics: initialState.topics,
    customAffixes: initialState.customAffixes,
    customAbbreviations: initialState.customAbbreviations,
    studyStats: { gotIt: 42, needsReview: 7 },
    versionMetadata: initialState.versionMetadata
  });
  const exportedZipBytes = exportFullDatabaseZipBytes({
    terms: transferTerms,
    sentences: initialState.sentences,
    topics: initialState.topics,
    customAffixes: initialState.customAffixes,
    customAbbreviations: initialState.customAbbreviations,
    studyStats: { gotIt: 42, needsReview: 7 },
    versionMetadata: initialState.versionMetadata
  });

  const jsonImportRes = await executeAtomicPackageImport(exportedJson, {
    mode: 'merge',
    fileNameHint: 'umed2-backup.json'
  });
  const zipImportRes = await executeAtomicPackageImport(exportedZipBytes, {
    mode: 'merge',
    fileNameHint: 'umed2-package.zip'
  });
  assertCondition(
    jsonImportRes.result.success && zipImportRes.result.success,
    [
      'Both JSON and ZIP cross-environment data transfer packages must import cleanly.',
      `JSON: ${jsonImportRes.result.errors?.join(' | ') || jsonImportRes.result.summary.failureReasons?.join(' | ') || (jsonImportRes.result.success ? 'OK' : 'No detailed error returned')}`,
      `ZIP: ${zipImportRes.result.errors?.join(' | ') || zipImportRes.result.summary.failureReasons?.join(' | ') || (zipImportRes.result.success ? 'OK' : 'No detailed error returned')}`
    ].join(' ')
  );
  assertCondition(
    Boolean(STORAGE_KEYS.TERMS && STORAGE_KEYS.BACKUP_HISTORY),
    'Storage keys must remain intact'
  );
  console.log('[PASS] 5. Cross-Environment .ZIP & .JSON Export/Import & SQLite Rejection Verified');

  // 6. Run Stage 5 Security Audit (6/6), Stage 6 Diagnostics (6/6), and Stage 7 Final Release Suite (8/8)
  const stage5Report = await runSecurityAndReliabilityAuditSuite();
  assertCondition(
    stage5Report.allPassed,
    `Stage 5 Security Audit failed: ${stage5Report.passedCount}/${stage5Report.totalCount}`
  );
  console.log(`[PASS] 6. Stage 5 Security & Reliability Audit (${stage5Report.passedCount}/${stage5Report.totalCount})`);

  const stage6Report = await runStage6DataManagementDiagnosticSuite();
  assertCondition(
    stage6Report.allPassed,
    `Stage 6 Data Management Diagnostics failed: ${stage6Report.passedCount}/${stage6Report.totalCount}`
  );
  console.log(`[PASS] 7. Stage 6 Data Management & Partial Delta Suite (${stage6Report.passedCount}/${stage6Report.totalCount})`);

  const stage7Report = await runStage7FinalReleaseReadinessSuite(2500);
  const failedStage7Cases = stage7Report.cases
    .filter((c) => !c.passed)
    .map((c) => `${c.id} (${c.technicalProof})`);
  assertCondition(
    stage7Report.productionReady,
    `Stage 7 Final Release Suite failed: ${stage7Report.passedCount}/${stage7Report.totalCount} — Failed: ${failedStage7Cases.join(', ')}`
  );
  console.log(`[PASS] 8. Stage 7 Final Release Readiness Suite (${stage7Report.passedCount}/${stage7Report.totalCount})`);

  // 7. Verify Stage 2 Permanent Signing-Key Architecture (7 Mandatory Checks)
  const keyGenA = await generateAndVerifyPermanentSigningKeys({ writeFiles: false });
  const keyGenB = await generateAndVerifyPermanentSigningKeys({ writeFiles: false });

  // 7.1 Key-pair generation
  assertCondition(
    keyGenA.algorithm === 'ECDSA-P256-SHA256' &&
      keyGenA.privateKeyPem.includes('-----BEGIN PRIVATE KEY-----') &&
      keyGenA.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----') &&
      /^[0-9a-f]{16}$/.test(keyGenA.fingerprintSha256) &&
      /^[0-9a-f]{64}$/.test(keyGenA.fullFingerprintSha256) &&
      keyGenA.selfTestVerified === true,
    'Stage 2 key-pair generation must produce valid PKCS#8 private key, SPKI public key, and SHA-256 fingerprint'
  );

  // 7.2 Private/public key matching & mismatch detection
  const validMatch = await verifyPublisherKeyPairMatch({
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenA.publicKeyPem,
    algorithm: 'ECDSA-P256-SHA256',
    requireProductionEcdsa: true
  });
  const mismatchedCheck = await verifyPublisherKeyPairMatch({
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenB.publicKeyPem,
    algorithm: 'ECDSA-P256-SHA256',
    requireProductionEcdsa: true
  });
  assertCondition(
    validMatch.valid === true && mismatchedCheck.valid === false,
    'verifyPublisherKeyPairMatch must accept matching keys and reject mismatched keys'
  );

  // 7.3 Valid signature verification & 7.4 Invalid signature rejection
  const sampleBytes = new TextEncoder().encode('UMED-2 Stage 2 Cryptographic Verification Payload');
  const signedSample = await signPackageBytesWithPrivateKey({
    bytes: sampleBytes,
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenA.publicKeyPem,
    algorithm: 'ECDSA-P256-SHA256'
  });
  const validSigCheck = await verifyPackageSignature({
    bytes: sampleBytes,
    signature: signedSample.signature,
    publicKeyPem: keyGenA.publicKeyPem,
    requireSignature: true,
    algorithm: 'ECDSA-P256-SHA256'
  });
  const invalidSigCheck = await verifyPackageSignature({
    bytes: sampleBytes,
    signature: signedSample.signature,
    publicKeyPem: keyGenB.publicKeyPem,
    requireSignature: true,
    algorithm: 'ECDSA-P256-SHA256'
  });
  assertCondition(
    validSigCheck.verified === true && invalidSigCheck.verified === false,
    'Valid signature must pass verification and invalid/wrong-key signature must be rejected'
  );

  // 7.5 Missing private-key rejection in Release Publisher
  let missingPrivKeyRejected = false;
  try {
    await executeProductionDataReleasePublish({
      privateKeyPem: '',
      publicKeyPem: keyGenA.publicKeyPem,
      writeArtifacts: false
    });
  } catch (err) {
    missingPrivKeyRejected =
      err instanceof Error && err.message.includes('UMED_PUBLISHER_PRIVATE_KEY_PEM');
  }
  assertCondition(
    missingPrivKeyRejected,
    'Publisher must fail immediately when UMED_PUBLISHER_PRIVATE_KEY_PEM is missing'
  );

  // 7.6 Missing public-key rejection in Release Publisher
  let missingPubKeyRejected = false;
  try {
    await executeProductionDataReleasePublish({
      privateKeyPem: keyGenA.privateKeyPem,
      publicKeyPem: '',
      writeArtifacts: false
    });
  } catch (err) {
    missingPubKeyRejected =
      err instanceof Error && err.message.includes('VITE_UMED_PUBLIC_KEY_PEM');
  }
  assertCondition(
    missingPubKeyRejected,
    'Publisher must fail immediately when VITE_UMED_PUBLIC_KEY_PEM is missing'
  );

  // Exercise the production publisher against an isolated temporary UMEDT-DATA
  // repository. The application repository intentionally contains no academic
  // master data, and the publisher must never treat app-local empty data as its source.
  const publisherFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'umedt-publisher-fixture-'));
  process.once('exit', () => fs.rmSync(publisherFixtureRoot, { recursive: true, force: true }));
  const publisherFixtureMasterDir = path.join(publisherFixtureRoot, 'data', 'master');
  fs.mkdirSync(publisherFixtureMasterDir, { recursive: true });
  const publisherFixtureEnv: NodeJS.ProcessEnv = {
    ...process.env,
    UMED_DATA_REPOSITORY_ROOT: publisherFixtureRoot,
    UMED_DATA_REPOSITORY: 'Alssaedy50/UMEDT-DATA'
  };

  // Preserve and explicitly test the production safeguard against empty repositories.
  let emptyRepositoryRejected = false;
  try {
    await executeProductionDataReleasePublish({
      env: publisherFixtureEnv,
      privateKeyPem: keyGenA.privateKeyPem,
      publicKeyPem: keyGenA.publicKeyPem,
      writeArtifacts: false
    });
  } catch (err) {
    emptyRepositoryRejected =
      err instanceof Error &&
      err.message.includes('Refusing to publish an empty medical data repository');
  }
  assertCondition(
    emptyRepositoryRejected,
    'Publisher must reject an empty UMEDT-DATA repository even when signing keys are valid'
  );

  // Synthetic data exists only in the temporary test repository, never in the app or live data repository.
  const publisherFixtureTerm = {
    id: 'publisher-fixture-term',
    term: 'PublisherFixtureTerm',
    termNormalized: 'publisherfixtureterm',
    translation: 'مصطلح اصطناعي لاختبار الناشر',
    phonetic: '/ˈfɪkstʃər/',
    pos: 'noun',
    category: 'General',
    keepEnglish: true,
    favorite: false,
    collections: [],
    ingestedAt: new Date(0).toISOString(),
    definitionAr: 'سجل اصطناعي معزول لاختبار نشر حزمة البيانات.',
    definitionEn: 'Isolated synthetic record used only to test release publishing.',
    examples: [],
    relations: { synonyms: [], broader: [], related: [] }
  };
  const publisherFixtureFiles: Record<string, unknown[]> = {
    'terms.json': [publisherFixtureTerm],
    'sentences.json': [],
    'topics.json': [],
    'custom-affixes.json': [],
    'custom-abbreviations.json': []
  };
  for (const [fileName, records] of Object.entries(publisherFixtureFiles)) {
    fs.writeFileSync(
      path.join(publisherFixtureMasterDir, fileName),
      JSON.stringify(records, null, 2),
      'utf8'
    );
  }

  // Verify publisher succeeds with valid matching keys and isolated source data (without writing artifacts).
  const publishedTest = await executeProductionDataReleasePublish({
    env: publisherFixtureEnv,
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenA.publicKeyPem,
    writeArtifacts: false
  });
  assertCondition(
    publishedTest.bundle.signatureAlgorithm === 'ECDSA-P256-SHA256' &&
      publishedTest.bundle.keyFingerprintSha256 === keyGenA.fingerprintSha256 &&
      Boolean(publishedTest.bundle.signature) &&
      publishedTest.bundle.manifest.counts.terms === 1,
    'Publisher must build and sign a one-record test release from the isolated UMEDT-DATA fixture'
  );

  // 7.7 Confirmation that localStorage cannot replace the embedded trusted key (VITE_UMED_PUBLIC_KEY_PEM)
  try {
    // Simulate older installation with empty or outdated key in localStorage
    saveOnlineUpdateConfig({
      ...DEFAULT_ONLINE_UPDATE_CONFIG,
      publicKeyPem: '',
      requireSignature: false,
      autoUpdatePolicy: 'notify-only'
    });

    // Activate embedded production key (VITE_UMED_PUBLIC_KEY_PEM)
    setEmbeddedTrustedPublicKeyOverrideForTesting(keyGenA.publicKeyPem);

    // Upgrade check: empty localStorage config must adopt the embedded key
    const upgradedConfig = loadOnlineUpdateConfig();
    assertCondition(
      upgradedConfig.publicKeyPem === keyGenA.publicKeyPem &&
        upgradedConfig.requireSignature === true &&
        upgradedConfig.signatureAlgorithm === 'ECDSA-P256-SHA256' &&
        upgradedConfig.autoUpdatePolicy === 'notify-only',
      'Older installation with empty localStorage publicKeyPem must adopt embedded VITE_UMED_PUBLIC_KEY_PEM'
    );

    // Tamper check: attempting to overwrite publicKeyPem in localStorage with keyGenB or empty string must be blocked
    saveOnlineUpdateConfig({
      ...upgradedConfig,
      publicKeyPem: keyGenB.publicKeyPem,
      requireSignature: false
    });
    const afterTamperAttempt = loadOnlineUpdateConfig();
    const pubConfigAfterTamper = loadPublisherReleaseConfig();
    assertCondition(
      afterTamperAttempt.publicKeyPem === keyGenA.publicKeyPem &&
        afterTamperAttempt.requireSignature === true &&
        pubConfigAfterTamper.publicKeyPem === keyGenA.publicKeyPem,
      'localStorage must NEVER override the embedded VITE_UMED_PUBLIC_KEY_PEM'
    );
  } finally {
    setEmbeddedTrustedPublicKeyOverrideForTesting(null);
  }

  console.log(
    '[PASS] 9. Stage 2 Permanent Signing-Key Architecture (Keygen, Pair Match, Sign/Verify, Missing-Key Rejection & Embedded Key Lock)'
  );

  // 8. Stage 5, Stage 6 & Stage 7 End-to-End Live HTTP Server-to-App OTA Update Test
  const preOtaVersion = loadAppState().versionMetadata.dataVersion;
  // Keep the isolated test key authoritative for the complete OTA lifecycle.
  // The build-embedded production key must remain locked in real app builds;
  // this override only simulates a matching trusted key inside this test process.
  setEmbeddedTrustedPublicKeyOverrideForTesting(keyGenA.publicKeyPem);
  let otaHttpServer: http.Server | null = null;
  try {
    const liveTargetVersion = '2026.12.0-umd';
    // Start an ephemeral local HTTP server on an OS-assigned port
    let serverBaseUrl = '';
    let liveBundleBytes: Uint8Array = new Uint8Array(0);
    let liveManifestText = '';
    let livePackageFileName = '';

    otaHttpServer = http.createServer((req, res) => {
      const reqUrl = (req.url || '').split('?')[0];
      if (reqUrl === '/releases/manifest.json') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(liveManifestText);
        return;
      }
      if (reqUrl === `/releases/${livePackageFileName}`) {
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': String(liveBundleBytes.byteLength),
          'Cache-Control': 'no-store'
        });
        res.end(Buffer.from(liveBundleBytes));
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>((resolve, reject) => {
      otaHttpServer!.once('error', reject);
      otaHttpServer!.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = otaHttpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    serverBaseUrl = `http://127.0.0.1:${port}/releases`;

    const livePublished = await executeProductionDataReleasePublish({
      env: publisherFixtureEnv,
      targetVersion: liveTargetVersion,
      cdnBaseUrl: serverBaseUrl,
      privateKeyPem: keyGenA.privateKeyPem,
      publicKeyPem: keyGenA.publicKeyPem,
      writeArtifacts: false
    });

    liveBundleBytes = livePublished.bundle.packageBytes;
    liveManifestText = livePublished.bundle.manifestJsonText;
    livePackageFileName = livePublished.bundle.packageFileName;

    const liveConfig = {
      ...DEFAULT_ONLINE_UPDATE_CONFIG,
      manifestUrl: `${serverBaseUrl}/manifest.json`,
      publicKeyPem: keyGenA.publicKeyPem,
      requireSignature: true,
      signatureAlgorithm: 'ECDSA-P256-SHA256' as const,
      autoUpdatePolicy: 'notify-only' as const
    };

    // Step A: Check for updates in notify-only mode -> must report 'update-available'
    const checkOnlyRes = await runOnlineUpdateCycle({
      config: liveConfig,
      forceInstall: false
    });
    assertCondition(
      checkOnlyRes.status.phase === 'update-available' &&
        checkOnlyRes.status.availableDataVersion === liveTargetVersion,
      `Expected notify-only OTA check to report update-available (${liveTargetVersion}), got ${checkOnlyRes.status.phase}`
    );

    // Step B: Trigger download & atomic install from the live HTTP server -> must verify SHA-256 + ECDSA-P256-SHA256 and install
    const installRes = await runOnlineUpdateCycle({
      config: liveConfig,
      forceInstall: true
    });
    assertCondition(
      installRes.status.phase === 'completed' &&
        installRes.status.checksumVerified === true &&
        installRes.status.signatureVerified === true &&
        installRes.updatedState?.versionMetadata.dataVersion === liveTargetVersion &&
        loadAppState().versionMetadata.dataVersion === liveTargetVersion,
      `Expected live HTTP Server-to-App OTA install to complete with verified SHA-256 & ECDSA signature (${liveTargetVersion}), got ${installRes.status.phase}: ${installRes.status.message}`
    );

    // Step C: Rollback to the pre-OTA version and restore default config
    const rollbackRes = await rollbackToPreviousDataVersion();
    assertCondition(
      rollbackRes.result.success &&
        rollbackRes.state.versionMetadata.dataVersion === preOtaVersion,
      'Rollback after live HTTP OTA update must restore exact previous dataVersion'
    );
  } finally {
    // Always restore the production-key behavior and default updater config,
    // including when any OTA assertion fails.
    setEmbeddedTrustedPublicKeyOverrideForTesting(null);
    saveOnlineUpdateConfig(DEFAULT_ONLINE_UPDATE_CONFIG);
    if (otaHttpServer) {
      await new Promise<void>((resolve) => otaHttpServer!.close(() => resolve()));
    }
  }

  console.log(
    '[PASS] 10. Local Integration: HTTP Server-to-App Cloud OTA Update (Check -> Download -> SHA-256 & ECDSA Verify -> Atomic Install -> Rollback)'
  );

  // 11. [R2 Integration Tests] Stage 3 Cloudflare R2 Repository Architecture, Immutable Package Protection & Workflow
  const r2CorsPath = path.join(ROOT_DIR, 'r2', 'cors-policy.json');
  const publishWorkflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'publish-data-release.yml');

  assertCondition(fs.existsSync(r2CorsPath), 'r2/cors-policy.json must exist');
  const corsJson = JSON.parse(fs.readFileSync(r2CorsPath, 'utf8'));
  assertCondition(Array.isArray(corsJson) && corsJson.length > 0, 'r2/cors-policy.json must contain CORS rules array');
  const allowedMethods = corsJson[0].AllowedMethods || [];
  assertCondition(
    allowedMethods.includes('GET') &&
      allowedMethods.includes('HEAD') &&
      !allowedMethods.includes('PUT') &&
      !allowedMethods.includes('POST') &&
      !allowedMethods.includes('DELETE'),
    'r2/cors-policy.json must restrict AllowedMethods to GET and HEAD only (no browser write access)'
  );

  assertCondition(fs.existsSync(publishWorkflowPath), '.github/workflows/publish-data-release.yml must exist');
  const publishWfContent = fs.readFileSync(publishWorkflowPath, 'utf8');
  assertCondition(
    publishWfContent.includes('workflow_dispatch:') &&
      publishWfContent.includes('channel:') &&
      publishWfContent.includes('cancel-in-progress: false') &&
      publishWfContent.includes('UMED_PUBLISHER_PRIVATE_KEY_PEM') &&
      publishWfContent.includes('CLOUDFLARE_API_TOKEN') &&
      publishWfContent.includes('CLOUDFLARE_ACCOUNT_ID') &&
      publishWfContent.includes('UMED_R2_BUCKET') &&
      publishWfContent.includes('scripts/upload-release-to-r2.ts'),
    'publish-data-release.yml must configure manual dispatch, concurrency lock, and required R2 secrets'
  );

  // 11.1 Test R2 Dry Run and Logical Key Layout
  const dryRunR2Result = await uploadReleaseBundleToR2(publishedTest.bundle, {
    dryRun: true,
    channel: 'stable',
    publicBaseUrl: 'https://data.umed2.org',
    bucketName: 'umed2-medical-data'
  });

  assertCondition(
    dryRunR2Result.packageKey === `stable/packages/${publishedTest.bundle.packageFileName}` &&
      dryRunR2Result.manifestKey === 'stable/manifest.json' &&
      dryRunR2Result.releaseKey === `stable/releases/${publishedTest.bundle.manifest.dataVersion}/release.json` &&
      dryRunR2Result.packageUrl === `https://data.umed2.org/${dryRunR2Result.packageKey}` &&
      dryRunR2Result.manifestUrl === 'https://data.umed2.org/stable/manifest.json',
    'R2 Uploader must follow exact logical layout: {channel}/packages, {channel}/releases, and {channel}/manifest.json'
  );

  // 11.2 Verify Step Ordering: package upload MUST precede manifest upload
  const pkgUploadStepIdx = dryRunR2Result.stepsExecuted.findIndex((s) => s.includes('Simulated package upload'));
  const manifestUploadStepIdx = dryRunR2Result.stepsExecuted.findIndex((s) => s.includes('Simulated manifest upload LAST'));
  assertCondition(
    pkgUploadStepIdx !== -1 && manifestUploadStepIdx !== -1 && pkgUploadStepIdx < manifestUploadStepIdx,
    'R2 Uploader MUST upload and verify the immutable package BEFORE uploading the manifest'
  );

  // 11.3 Test Immutable Package Protection (Rejecting Overwriting with Different Content)
  let immutableViolationThrown = false;
  try {
    await uploadReleaseBundleToR2(publishedTest.bundle, {
      dryRun: false,
      channel: 'stable',
      accountId: 'mock-account-id',
      apiToken: 'mock-api-token',
      bucketName: 'mock-bucket',
      customFetch: async (input, init) => {
        const urlStr = String(input);
        const method = init?.method || 'GET';
        // Simulate an existing object with different bytes
        if (urlStr.includes(publishedTest.bundle.packageFileName) && method === 'GET') {
          return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
            status: 200,
            headers: { 'Content-Type': 'application/zip' }
          });
        }
        return new Response('Not found', { status: 404 });
      }
    });
  } catch (err) {
    immutableViolationThrown =
      err instanceof Error && err.message.includes('Immutable Package Protection');
  }
  assertCondition(
    immutableViolationThrown,
    'R2 Uploader MUST throw an error when attempting to overwrite an existing immutable package with different content'
  );

  // 11.4 Test Simulated Successful R2 Upload with customFetch (Verifying HTTP Request Sequence & Headers)
  const putRequestsIssued: Array<{ url: string; contentType: string | null; authHeader: string | null }> = [];
  const simulatedR2Result = await uploadReleaseBundleToR2(publishedTest.bundle, {
    dryRun: false,
    channel: 'stable',
    accountId: 'mock-account-1234567890abcdef',
    apiToken: 'mock-token-secret-xyz',
    bucketName: 'umed2-medical-data',
    publicBaseUrl: 'https://data.umed2.org',
    customFetch: async (input, init) => {
      const urlStr = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      const headers = (init?.headers || {}) as Record<string, string>;

      if (method === 'PUT') {
        putRequestsIssued.push({
          url: urlStr,
          contentType: headers['Content-Type'] || null,
          authHeader: headers['Authorization'] || null
        });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (method === 'GET') {
        if (urlStr.includes(publishedTest.bundle.packageFileName)) {
          // After PUT, verify returns the exact uploaded bytes
          return new Response(Buffer.from(publishedTest.bundle.packageBytes), {
            status: 200,
            headers: { 'Content-Type': 'application/zip' }
          });
        }
        if (urlStr.includes('manifest.json')) {
          return new Response(publishedTest.bundle.manifestJsonText, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response('Mock Not Found', { status: 404 });
    }
  });

  assertCondition(
    simulatedR2Result.success === true &&
      putRequestsIssued.length === 3 &&
      putRequestsIssued[0].url.includes(publishedTest.bundle.packageFileName) &&
      putRequestsIssued[1].url.includes('release.json') &&
      putRequestsIssued[2].url.includes('manifest.json') &&
      putRequestsIssued[0].contentType === 'application/zip' &&
      putRequestsIssued[0].authHeader === 'Bearer mock-token-secret-xyz',
    'R2 Uploader must successfully execute ordered PUT requests (Package -> Release -> Manifest LAST) with Bearer token'
  );
  console.log(
    '[PASS] 11. R2 Integration: Cloudflare R2 Repository Architecture, Immutable Guard, CORS & Publishing Workflow'
  );

  // 12. [Security Verification] Client Bundle & Native APK Secret Leakage Prevention
  const filesToScanForSecrets = [
    path.join(ROOT_DIR, 'src', 'App.tsx'),
    path.join(ROOT_DIR, 'src', 'components', 'LibraryView.tsx'),
    path.join(ROOT_DIR, 'src', 'services', 'storageService.ts'),
    path.join(ROOT_DIR, 'src', 'services', 'dataPlatformService.ts'),
    path.join(ROOT_DIR, 'android', 'app', 'build.gradle'),
    path.join(ROOT_DIR, 'wrangler.toml'),
    path.join(ROOT_DIR, '.env.example')
  ];

  const actualPrivateKeyPattern =
    /-----BEGIN (?:EC\s+|RSA\s+)?PRIVATE KEY-----[\r\n\s]*[A-Za-z0-9+/=]{20,}[\s\S]*?-----END (?:EC\s+|RSA\s+)?PRIVATE KEY-----/;

  for (const filePath of filesToScanForSecrets) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      assertCondition(
        !actualPrivateKeyPattern.test(content),
        `CRITICAL SECURITY VIOLATION: Actual private key found in frontend/committed file: ${filePath}`
      );
      assertCondition(
        !/CLOUDFLARE_API_TOKEN[ \t]*=[ \t]*[a-zA-Z0-9_-]{10,}/.test(content),
        `CRITICAL SECURITY VIOLATION: Real Cloudflare API token detected in: ${filePath}`
      );
    }
  }

  // Verify dist output if present
  const distDir = path.join(ROOT_DIR, 'dist');
  if (fs.existsSync(distDir)) {
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
          const distContent = fs.readFileSync(fullPath, 'utf8');
          assertCondition(
            !actualPrivateKeyPattern.test(distContent),
            `CRITICAL SECURITY VIOLATION: Private key leaked in built dist asset: ${entry.name}`
          );
          assertCondition(
            !/CLOUDFLARE_API_TOKEN/.test(distContent),
            `CRITICAL SECURITY VIOLATION: Cloudflare credentials leaked in built dist asset: ${entry.name}`
          );
        }
      }
    };
    scanDir(distDir);
  }

  console.log('[PASS] 12. Security Verification: Zero Secret/Private-Key Leakage in Frontend Bundles & APK Assets');

  // 13. [Stage 8 & 9: UMED Medical Package (.umedpack), Universal File Import Engine & Cloud AI Assistant Architecture]
  // 13.1 Validate UMED package manifest validation rules
  const validManifestResult = validateUmedPackageManifest({
    package_id: 'umed-cardiology-core',
    package_name: 'Cardiology Core Lexicon',
    schema_version: DB_SCHEMA_VERSION,
    minimum_app_version: APP_VERSION,
    category: 'Cardiology',
    subject: 'Cardiovascular'
  });
  assertCondition(validManifestResult.valid, 'Valid manifest should pass validation');
  assertCondition(
    validManifestResult.manifest?.package_id === 'umed-cardiology-core',
    'Manifest package_id should match'
  );

  const invalidSchemaResult = validateUmedPackageManifest({
    package_id: 'umed-invalid-schema',
    package_name: 'Invalid Schema Pack',
    schema_version: 999
  });
  assertCondition(!invalidSchemaResult.valid, 'Manifest with schema_version != 2 should be rejected');

  // 13.2 Build & inspect a real .umedpack in memory
  const builtPack = await buildUmedPackageZipBytes({
    manifest: {
      package_id: 'umed-test-hematology',
      package_name: 'Test Hematology Pack',
      package_version: '1.0.0',
      subject: 'Hematology'
    },
    terms: [
      {
        id: 'term-hema-1',
        term: 'Thrombocytopenia',
        termNormalized: 'thrombocytopenia',
        translation: 'نقص الصفيحات الدموية',
        phonetic: '/ˌθrɒmboʊˌsaɪtoʊˈpiːniə/',
        pos: 'Noun',
        category: 'Medical',
        specialty: 'Hematology',
        definitionAr: 'انخفاض غير طبيعي في عدد الصفيحات الدموية في الدورة الدموية.',
        definitionEn: 'Abnormally low level of platelets in the blood.',
        keepEnglish: false,
        favorite: false,
        collections: ['Hematology'],
        ingestedAt: new Date().toISOString(),
        examples: [],
        relations: { synonyms: [], broader: [], related: [] }
      }
    ],
    questions: [
      {
        id: 'mcq-hema-1',
        questionEn: 'Which cell type is the precursor to blood platelets?',
        questionAr: 'ما هي الخلية السلفية التي تنشأ منها الصفيحات الدموية؟',
        options: [
          { key: 'A', textEn: 'Megakaryocyte', textAr: 'الخلية النوّاءة' },
          { key: 'B', textEn: 'Erythroblast', textAr: 'أرومة كريات الدم الحمراء' },
          { key: 'C', textEn: 'Myeloblast', textAr: 'أرومة نقوية' },
          { key: 'D', textEn: 'Monocyte', textAr: 'خلية وحيدة' }
        ],
        correctAnswerKey: 'A',
        explanationEn: 'Platelets are formed in the bone marrow by fragmentation of megakaryocyte cytoplasm.',
        specialty: 'Hematology',
        confidence: 100
      }
    ],
    clinicalCases: [
      {
        id: 'case-hema-1',
        titleEn: 'Isolated Thrombocytopenia in a 24-Year-Old Female',
        titleAr: 'نقص صفيحات معزول لدى شابة تبلغ من العمر 24 عاماً',
        presentationEn: 'Patient presents with petechiae and mucosal bleeding with normal hemoglobin and WBC.',
        diagnosisEn: 'Immune Thrombocytopenic Purpura (ITP)',
        specialty: 'Hematology'
      }
    ]
  });

  assertCondition(builtPack.packageBytes.byteLength > 100, 'Built .umedpack should contain bytes');
  assertCondition(Boolean(builtPack.sha256Hex), 'Built .umedpack must have SHA-256 hash');

  const inspectedPack = await inspectAndReadUmedPackage(builtPack.packageBytes);
  assertCondition(inspectedPack.valid, 'Inspected .umedpack must be valid');
  assertCondition(inspectedPack.integrity.checksumsVerified, 'Internal SHA-256 checksums must verify');
  assertCondition(inspectedPack.payload.terms.length === 1, 'Inspected pack must contain 1 term');
  assertCondition(inspectedPack.payload.questions.length === 1, 'Inspected pack must contain 1 question');
  assertCondition(inspectedPack.payload.clinicalCases.length === 1, 'Inspected pack must contain 1 clinical case');

  // 13.3 Zero Local LLM Weights Policy Verification
  // Scan repository to guarantee no local neural network weight files are committed or packaged
  const forbiddenWeightExtensions = ['.gguf', '.onnx', '.tflite', '.bin', '.safetensors', '.pt', '.pth'];
  const scanForLocalModels = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForLocalModels(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        assertCondition(
          !forbiddenWeightExtensions.includes(ext),
          `CRITICAL ARCHITECTURAL VIOLATION: Local AI model weight file found: ${entry.name}. Target phone has limited memory and local LLMs are strictly forbidden.`
        );
      }
    }
  };
  scanForLocalModels(ROOT_DIR);

  // 13.4 Atomic Import & 1-Click Rollback Verification
  const importResult = await executeAtomicMedicalImport({
    sourceName: 'Verify-Automated-Test-Pack',
    sourceType: 'umedpack',
    packageManifest: builtPack.manifest,
    terms: builtPack.manifest.records_count.terms > 0 ? inspectedPack.payload.terms : [],
    questions: inspectedPack.payload.questions,
    clinicalCases: inspectedPack.payload.clinicalCases,
    conflictPolicy: 'merge'
  });

  assertCondition(importResult.success, 'Atomic import must succeed');
  assertCondition(Boolean(importResult.historyEntry.id), 'Import must generate history audit entry');
  assertCondition(Boolean(importResult.historyEntry.rollbackSnapshotId), 'Import must create rollback snapshot');

  // Test 1-click rollback
  const rollbackRes = await rollbackImportByHistoryId(importResult.historyEntry.id);
  assertCondition(rollbackRes.success, 'Rollback by history ID must succeed');

  console.log(
    '[PASS] 13. UMED Medical Package (.umedpack), Universal File Import Engine, Zero-Local-LLM Guard & Rollback Verified'
  );

  // 14. Verify Download/UMEDT System, Native Android Bridge, Storage Persistence & Full Arabic Block/Subject Titles
  const mainActivityPath = path.join(
    ROOT_DIR,
    'android',
    'app',
    'src',
    'main',
    'java',
    'org',
    'umed2',
    'dictengine',
    'MainActivity.java'
  );
  assertCondition(fs.existsSync(mainActivityPath), 'MainActivity.java must exist');
  const mainActivityJava = fs.readFileSync(mainActivityPath, 'utf8');
  assertCondition(
    mainActivityJava.includes('UMEDNativeDownloader') &&
      mainActivityJava.includes('saveBase64FileToDownloads') &&
      mainActivityJava.includes('openDownloadedFile') &&
      mainActivityJava.includes('shareDownloadedFile') &&
      mainActivityJava.includes('Download/UMEDT'),
    'MainActivity.java must implement UMEDNativeDownloader saving to Download/UMEDT with Open & Share methods'
  );

  const emptyDownloadAttempt = await prepareAndDownloadFile({
    content: '',
    filename: 'empty.json',
    mime: 'application/json'
  });
  assertCondition(
    emptyDownloadAttempt.verified === false,
    'Empty file download must return verified === false so no false success message is shown'
  );

  const jsonDownloadRecord = await prepareAndDownloadFile({
    content: exportedJson,
    filename: 'umed2-test-backup.json',
    mime: 'application/json'
  });
  assertCondition(
    jsonDownloadRecord.verified === true &&
      jsonDownloadRecord.savedPath === 'Download/UMEDT/umed2-test-backup.json' &&
      jsonDownloadRecord.filename === 'umed2-test-backup.json' &&
      jsonDownloadRecord.sizeBytes > 1000 &&
      jsonDownloadRecord.sizeKB > 1,
    'prepareAndDownloadFile must verify and record Download/UMEDT/umed2-test-backup.json'
  );

  const zipDownloadRecord = await prepareAndDownloadFile({
    content: exportedZipBytes,
    filename: 'umed2-test-package.zip',
    mime: 'application/zip'
  });
  assertCondition(
    zipDownloadRecord.verified === true &&
      zipDownloadRecord.savedPath === 'Download/UMEDT/umed2-test-package.zip' &&
      zipDownloadRecord.filename === 'umed2-test-package.zip' &&
      zipDownloadRecord.sizeBytes === exportedZipBytes.byteLength &&
      zipDownloadRecord.sizeKB > 1,
    'prepareAndDownloadFile must verify and record Download/UMEDT/umed2-test-package.zip'
  );

  const storageCheck = verifyLocalStoragePersistence();
  assertCondition(
    storageCheck.ok === true && storageCheck.keysCount >= 0,
    'verifyLocalStoragePersistence must pass read/write verification'
  );

  const initialBlocksSnapshot = loadMedicalBlocks();
  saveMedicalBlocks([
    ...initialBlocksSnapshot,
    {
      id: 'block-test-dot',
      code: 'BLD',
      titleEn: 'Hematology Block',
      titleAr: '.',
      descriptionEn: '',
      descriptionAr: '',
      colorAccent: 'rose',
      order: 98,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'block-test-full-ar',
      code: 'BLK-NEURO',
      titleEn: 'Neurology & Neurosurgery Block',
      titleAr: 'بلوك طب وجراحة الأعصاب والعمود الفقري المتقدم',
      descriptionEn: '',
      descriptionAr: '',
      colorAccent: 'emerald',
      order: 99,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);
  const sanitizedBlocks = loadMedicalBlocks();
  const bldBlock = sanitizedBlocks.find((b) => b.id === 'block-test-dot');
  const neuroBlock = sanitizedBlocks.find((b) => b.id === 'block-test-full-ar');
  assertCondition(
    Boolean(
      bldBlock &&
        bldBlock.titleAr === 'بلوك أمراض الدم والجهاز اللمفاوي' &&
        neuroBlock &&
        neuroBlock.titleAr === 'بلوك طب وجراحة الأعصاب والعمود الفقري المتقدم'
    ),
    `Expected full Arabic titles to be restored and preserved without truncation, got '${bldBlock?.titleAr}' and '${neuroBlock?.titleAr}'`
  );
  saveMedicalBlocks(initialBlocksSnapshot);
  void getLastLocalDownloadRecord();

  console.log(
    `[PASS] 14. Download/UMEDT Native Bridge, File Verification (JSON: ${jsonDownloadRecord.sizeKB} KB, ZIP: ${zipDownloadRecord.sizeKB} KB) & Full Arabic Block/Subject Names Verified`
  );

  // --------------------------------------------------------------------------
  // 15. Audio Mic Permissions, PWA Manifest, Media IDB Honesty & Download Honesty
  // --------------------------------------------------------------------------
  const manifestXmlPath = path.join(
    ROOT_DIR,
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml'
  );
  const manifestXml = fs.readFileSync(manifestXmlPath, 'utf8');
  assertCondition(
    manifestXml.includes('android.permission.RECORD_AUDIO') &&
      manifestXml.includes('android.permission.MODIFY_AUDIO_SETTINGS'),
    'AndroidManifest.xml must declare RECORD_AUDIO and MODIFY_AUDIO_SETTINGS'
  );

  assertCondition(
    mainActivityJava.includes('hasMicrophonePermission') &&
      mainActivityJava.includes('requestMicrophonePermission'),
    'MainActivity.java must expose hasMicrophonePermission and requestMicrophonePermission'
  );

  const audioHeadersPath = path.join(ROOT_DIR, 'public', '_headers');
  const audioHeadersContent = fs.readFileSync(audioHeadersPath, 'utf8');
  assertCondition(
    audioHeadersContent.includes('microphone=(self)'),
    'public/_headers must allow microphone=(self) in Permissions-Policy'
  );

  const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  assertCondition(
    indexHtml.includes('href="/manifest.webmanifest"') &&
      !indexHtml.includes('href="/manifest.json"'),
    'index.html must reference /manifest.webmanifest and not /manifest.json'
  );

  const distIndexHtmlPath = path.join(ROOT_DIR, 'dist', 'index.html');
  if (fs.existsSync(distIndexHtmlPath)) {
    const distIndexHtml = fs.readFileSync(distIndexHtmlPath, 'utf8');
    const manifestLinks = distIndexHtml.match(/rel="manifest"/g) || [];
    assertCondition(
      manifestLinks.length === 1 &&
        distIndexHtml.includes('href="/manifest.webmanifest"'),
      'dist/index.html must contain exactly one manifest link pointing to /manifest.webmanifest'
    );
  }

  const webManifestPath = path.join(ROOT_DIR, 'public', 'manifest.webmanifest');
  assertCondition(fs.existsSync(webManifestPath), 'public/manifest.webmanifest must exist');

  const idbUnavailableRes = await saveLocalMediaRecord({
    id: 'test-audio-no-idb',
    topicId: 'test-topic',
    mediaType: 'audio_recording',
    mimeType: 'audio/webm',
    fileName: 'test.webm',
    dataUrl: 'data:audio/webm;base64,AAAA',
    sizeBytes: 4,
    createdAt: new Date().toISOString()
  });
  assertCondition(
    idbUnavailableRes.success === false && !idbUnavailableRes.verifiedInIdb,
    'saveLocalMediaRecord must return success === false (never fake true) when IndexedDB is unavailable'
  );

  assertCondition(
    jsonDownloadRecord.verifiedOnDisk === false &&
      zipDownloadRecord.verifiedOnDisk === false,
    'prepareAndDownloadFile on Web/Node must report verifiedOnDisk === false instead of claiming verified physical disk write'
  );

  const stylesV35Path = path.join(
    ROOT_DIR,
    'android',
    'app',
    'src',
    'main',
    'res',
    'values-v35',
    'styles.xml'
  );
  assertCondition(
    fs.existsSync(stylesV35Path) &&
      fs.readFileSync(stylesV35Path, 'utf8').includes('windowOptOutEdgeToEdgeEnforcement'),
    'android/app/src/main/res/values-v35/styles.xml must opt out of forced edge-to-edge overlap'
  );
  assertCondition(
    mainActivityJava.includes('applySafeSystemBarInsets') &&
      mainActivityJava.includes('ViewCompat.setOnApplyWindowInsetsListener'),
    'MainActivity.java must apply WindowInsets safe-area padding on system bars'
  );
  const blockEditorPath = path.join(ROOT_DIR, 'src', 'components', 'TopicContentBlockEditor.tsx');
  const blockEditorSrc = fs.readFileSync(blockEditorPath, 'utf8');
  assertCondition(
    blockEditorSrc.includes('flex-1 min-w-0 w-full'),
    'TopicContentBlockEditor.tsx inline option inputs must enforce flex-1 min-w-0 w-full to avoid mobile clipping'
  );

  // 15b. Verify Android fetchRemoteUrlBase64, Express & Cloudflare Pages /api/remote-fetch relays,
  // and automatic GitHub Releases API 404 fallback for UMEDT cloud updates
  assertCondition(
    mainActivityJava.includes('fetchRemoteUrlBase64'),
    'MainActivity.java UMEDNativeDownloader must expose fetchRemoteUrlBase64 for CORS-free GitHub Release downloads'
  );

  const serverTsPath = path.join(ROOT_DIR, 'server.ts');
  const cfRemoteFetchPath = path.join(ROOT_DIR, 'functions', 'api', 'remote-fetch.ts');
  assertCondition(
    fs.existsSync(serverTsPath) &&
      fs.readFileSync(serverTsPath, 'utf8').includes("'/api/remote-fetch'") &&
      fs.readFileSync(serverTsPath, 'utf8').includes('release-assets.githubusercontent.com'),
    'server.ts must expose /api/remote-fetch relay allowlisting GitHub Release asset hosts'
  );
  assertCondition(
    fs.existsSync(cfRemoteFetchPath) &&
      fs.readFileSync(cfRemoteFetchPath, 'utf8').includes('onRequestGet') &&
      fs.readFileSync(cfRemoteFetchPath, 'utf8').includes('release-assets.githubusercontent.com'),
    'functions/api/remote-fetch.ts must expose Cloudflare Pages CORS relay for GitHub Releases'
  );

  const ghFallbackVersion = '2026.12.5-umd';
  const ghPublishedBundle = await executeProductionDataReleasePublish({
    env: publisherFixtureEnv,
    targetVersion: ghFallbackVersion,
    cdnBaseUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable',
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenA.publicKeyPem,
    writeArtifacts: false
  });
  const ghMockCustomFetch: typeof fetch = async (input) => {
    const urlStr = String(input);
    if (urlStr.startsWith('https://raw.githubusercontent.com/Alssaedy50/UMEDT/')) {
      return new Response('404: Not Found', { status: 404, statusText: 'Not Found' });
    }
    if (urlStr.startsWith('https://api.github.com/repos/Alssaedy50/UMEDT/releases')) {
      return new Response(
        JSON.stringify([
          {
            tag_name: `data-v${ghFallbackVersion}`,
            draft: false,
            prerelease: false,
            published_at: '2026-11-15T00:00:00Z',
            assets: [
              {
                name: 'manifest.json',
                url: 'https://api.github.com/repos/Alssaedy50/UMEDT/releases/assets/1001',
                browser_download_url: `https://github.com/Alssaedy50/UMEDT/releases/download/data-v${ghFallbackVersion}/manifest.json`
              },
              {
                name: ghPublishedBundle.bundle.packageFileName,
                url: 'https://api.github.com/repos/Alssaedy50/UMEDT/releases/assets/1002',
                browser_download_url: `https://github.com/Alssaedy50/UMEDT/releases/download/data-v${ghFallbackVersion}/${ghPublishedBundle.bundle.packageFileName}`
              }
            ]
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.endsWith('/manifest.json') && urlStr.includes('/releases/download/')) {
      return new Response(ghPublishedBundle.bundle.manifestJsonText, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (
      urlStr.includes(ghPublishedBundle.bundle.packageFileName) &&
      urlStr.includes('/releases/download/')
    ) {
      return new Response(Buffer.from(ghPublishedBundle.bundle.packageBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(ghPublishedBundle.bundle.packageBytes.byteLength)
        }
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  const ghFallbackManifestRes = await checkRemoteDataManifest(
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json',
    {
      installedDataVersion: BUNDLED_DATA_VERSION,
      channel: 'stable',
      customFetch: ghMockCustomFetch
    }
  );
  assertCondition(
    ghFallbackManifestRes.updateAvailable &&
      ghFallbackManifestRes.compatible &&
      ghFallbackManifestRes.manifest.dataVersion === ghFallbackVersion,
    `Expected checkRemoteDataManifest 404 fallback to discover GitHub Release ${ghFallbackVersion}`
  );

  // Also test direct raw ZIP URL 404 fallback in downloadRemotePackageBytes
  const ghDownloadedBytes = await downloadRemotePackageBytes(
    `https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/${ghPublishedBundle.bundle.packageFileName}`,
    { customFetch: ghMockCustomFetch }
  );
  assertCondition(
    ghDownloadedBytes.byteLength === ghPublishedBundle.bundle.packageBytes.byteLength,
    'downloadRemotePackageBytes must fall back from 404 raw.githubusercontent.com ZIP URL to GitHub Release asset bytes'
  );

  // Full end-to-end signed OTA cycle through 404 raw URL -> GitHub Releases fallback -> ECDSA verify -> atomic install -> rollback
  setEmbeddedTrustedPublicKeyOverrideForTesting(keyGenA.publicKeyPem);
  try {
    const preFallbackVersion = loadAppState().versionMetadata.dataVersion;
    const ghOtaInstall = await runOnlineUpdateCycle({
      config: {
        ...DEFAULT_ONLINE_UPDATE_CONFIG,
        manifestUrl:
          'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json',
        publicKeyPem: keyGenA.publicKeyPem,
        requireSignature: true,
        signatureAlgorithm: 'ECDSA-P256-SHA256',
        autoUpdatePolicy: 'notify-only'
      },
      forceInstall: true,
      customFetch: ghMockCustomFetch
    });
    assertCondition(
      ghOtaInstall.status.phase === 'completed' &&
        ghOtaInstall.status.checksumVerified === true &&
        ghOtaInstall.status.signatureVerified === true &&
        loadAppState().versionMetadata.dataVersion === ghFallbackVersion,
      `Expected GitHub Releases fallback OTA install to complete cleanly, got ${ghOtaInstall.status.phase}: ${ghOtaInstall.status.message}`
    );
    const ghRollback = await rollbackToPreviousDataVersion();
    assertCondition(
      ghRollback.result.success &&
        ghRollback.state.versionMetadata.dataVersion === preFallbackVersion,
      'Rollback after GitHub Releases fallback OTA test must restore previous dataVersion'
    );
  } finally {
    setEmbeddedTrustedPublicKeyOverrideForTesting(null);
    saveOnlineUpdateConfig(DEFAULT_ONLINE_UPDATE_CONFIG);
  }

  console.log(
    '[PASS] 15. Mic Permissions, PWA Manifest Link, Media IDB Failure Honesty, Download Honesty, Android Safe Area, Mobile Input Layout & GitHub Releases 404 Fallback Verified'
  );

  // 16. [Post-Install Dictionary-Only State, Unified Cloud Library, Offline Sync Queue, SHA-256 Deduplication, Selective Download & Local Deletion]
  clearLocallyRemovedRegistry();
  saveTopics([]);
  saveMedicalBlocks([]);
  setCloudSyncSimulatedOffline(true);

  const initialStateForCloud = loadAppState();
  assertCondition(
    initialStateForCloud.terms.length >= 1 &&
      initialStateForCloud.topics.length === 0 &&
      loadMedicalBlocks().length === 0,
    `Expected post-install state to retain local dictionary records from the backup-import test (terms>=1) without bundled topics or blocks, got terms=${initialStateForCloud.terms.length}, topics=${initialStateForCloud.topics.length}, blocks=${loadMedicalBlocks().length}`
  );

  // Verify update notification banner is removed from App.tsx, Updates modal is removed from SettingsView.tsx,
  // dynamic font scale is 75-125, multiple fonts exist, and full-system themes override --color-slate-*
  const appTsxContent = fs.readFileSync(path.join(ROOT_DIR, 'src', 'App.tsx'), 'utf8');
  const settingsTsxContent = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'SettingsView.tsx'),
    'utf8'
  );
  const indexCssContent = fs.readFileSync(path.join(ROOT_DIR, 'src', 'index.css'), 'utf8');
  assertCondition(
    !appTsxContent.includes('تنزيل وتثبيت التحديث الآن') &&
      appTsxContent.includes('fontScalePercent') &&
      appTsxContent.includes('--app-font-scale') &&
      !settingsTsxContent.includes("setActiveModal('updates')") &&
      !settingsTsxContent.includes("activeModal === 'updates'") &&
      settingsTsxContent.includes('min={75}') &&
      settingsTsxContent.includes('max={100}') &&
      settingsTsxContent.includes("id: 'auto'") &&
      settingsTsxContent.includes("id: 'almarai'") &&
      settingsTsxContent.includes("id: 'readex'") &&
      settingsTsxContent.includes("id: 'kufi'") &&
      indexCssContent.includes('--color-slate-950'),
    'App.tsx, SettingsView.tsx, and index.css must enforce no Updates modal in Settings, 75-100 font scale + auto system font, multiple fonts, and full-system themes'
  );

  const testCloudTopic = {
    id: 'topic-cloud-test-sync-1',
    title: 'موضوع اختبار المكتبة السحابية الموحدة',
    titleAr: 'موضوع اختبار المكتبة السحابية الموحدة',
    titleEn: 'Unified Cloud Library Test Topic',
    subtitle: 'اختبار المزامنة السحابية ومنع التكرار',
    category: 'Medical' as const,
    blockId: 'block-hematology',
    subjectId: 'subj-hematology',
    author: 'UMEDT Cloud Sync',
    publishedAt: '2026-11-16',
    readingTimeMinutes: 5,
    favorite: false,
    links: [],
    images: [
      { id: 'img-1', url: 'https://example.com/ecg-lead.png', caption: 'تخطيط 1' },
      { id: 'img-2', url: 'https://example.com/ecg-lead.png', caption: 'تخطيط مكرر' }
    ],
    attachments: [
      {
        id: 'att-1',
        fileName: 'guideline.pdf',
        fileType: 'pdf' as const,
        fileSizeLabel: '120 KB',
        addedAt: '2026-11-15',
        contentDataUrlOrText: 'data:application/pdf;base64,JVBERi0xLjQK'
      },
      {
        id: 'att-2',
        fileName: 'guideline.pdf',
        fileType: 'pdf' as const,
        fileSizeLabel: '120 KB',
        addedAt: '2026-11-15',
        contentDataUrlOrText: 'data:application/pdf;base64,JVBERi0xLjQK'
      }
    ],
    sections: [
      {
        id: 'sec-test-1',
        heading: 'Section 1',
        paragraphs: ['Testing SHA-256 deduplication and selective download.'],
        contentBlocks: [
          {
            id: 'cb-img-dup-1',
            type: 'image' as const,
            order: 1,
            mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            captionAr: 'Duplicate Image 1'
          },
          {
            id: 'cb-img-dup-2',
            type: 'image' as const,
            order: 2,
            mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            captionAr: 'Duplicate Image 2 (identical payload)'
          }
        ]
      }
    ]
  };

  // 16.1 Media & Attachment SHA-256 Deduplication inside Topics
  const dedupedTopic = deduplicateTopicMediaAndAttachments(testCloudTopic);
  assertCondition(
    dedupedTopic.sections[0].contentBlocks?.length === 1 &&
      dedupedTopic.images?.length === 1 &&
      dedupedTopic.attachments?.length === 1,
    'Identical images and attachments inside a topic must be deduplicated by hash without storing duplicates'
  );

  // 16.2 Offline Enqueue -> Sync Queue Pending Status & SHA-256 Duplicate Prevention
  const enqueueOfflineRes = await enqueueEntitiesForCloudSync({
    topics: [dedupedTopic]
  });
  assertCondition(
    enqueueOfflineRes.enqueuedCount === 1 && enqueueOfflineRes.queueLength >= 1,
    `Expected offline enqueue to queue 1 item in SyncQueue, got enqueued=${enqueueOfflineRes.enqueuedCount}, queueLength=${enqueueOfflineRes.queueLength}`
  );
  const offlineCatalogView = buildCloudLibraryCatalogView({
    localTopics: initialStateForCloud.topics,
    localTerms: initialStateForCloud.terms,
    localSentences: initialStateForCloud.sentences
  });
  assertCondition(
    offlineCatalogView.overallSyncStatus === 'pending' &&
      offlineCatalogView.pendingCount >= 1 &&
      offlineCatalogView.totalCloudTopicsCount === 0 &&
      offlineCatalogView.downloadedTopicsCount === 0,
    `Expected Sync Engine status 'pending' with 0 pre-loaded cloud topics offline and 0 downloaded topics on fresh install, got status=${offlineCatalogView.overallSyncStatus}, cloudTopics=${offlineCatalogView.totalCloudTopicsCount}, downloaded=${offlineCatalogView.downloadedTopicsCount}`
  );

  // Attempting to download from Cloud Library while offline MUST fail immediately
  const blockedOfflineDownloadRes = await downloadCloudLibraryTarget({
    targetType: 'block',
    targetId: 'block-hematology',
    currentTopics: [],
    currentTerms: initialStateForCloud.terms,
    currentSentences: initialStateForCloud.sentences
  });
  assertCondition(
    blockedOfflineDownloadRes.success === false &&
      blockedOfflineDownloadRes.downloadedTopicsCount === 0 &&
      loadMedicalBlocks().length === 0,
    'Cloud Library download MUST be blocked when offline (no internet connection)'
  );

  // Enqueue the exact same topic again -> must be skipped by SHA-256 hash comparison
  const duplicateEnqueueRes = await enqueueEntitiesForCloudSync({
    topics: [dedupedTopic]
  });
  assertCondition(
    duplicateEnqueueRes.enqueuedCount === 0 && duplicateEnqueueRes.skippedDuplicateCount === 1,
    `Expected identical SHA-256 topic to be skipped (skippedDuplicateCount=1), got enqueued=${duplicateEnqueueRes.enqueuedCount}, skipped=${duplicateEnqueueRes.skippedDuplicateCount}`
  );

  // 16.3 Error Handling & Exponential Backoff when Remote Endpoint Fails, then Auto-Recovery when Online
  setCloudSyncSimulatedOffline(false, { autoFlush: false });
  const failedFlushRes = await processCloudSyncQueue({
    forceRetryFailed: true,
    customFetch: async () => new Response('Simulated Cloud Outage', { status: 503 })
  });
  assertCondition(
    failedFlushRes.failedCount >= 1 && failedFlushRes.status === 'failed',
    `Expected SyncQueue to report 'failed' status when cloud endpoint returns 503, got ${failedFlushRes.status}`
  );

  const recoveredFlushRes = await processCloudSyncQueue({
    forceRetryFailed: true,
    customFetch: async () =>
      new Response(JSON.stringify({ ok: true, appliedCount: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
  });
  assertCondition(
    recoveredFlushRes.syncedCount >= 1 &&
      recoveredFlushRes.pendingCount === 0 &&
      recoveredFlushRes.status === 'synced' &&
      loadSyncQueue().filter((q) => q.status !== 'synced').length === 0,
    `Expected SyncQueue to recover to 'synced' status when connectivity returns, got ${recoveredFlushRes.status}`
  );

  // 16.3 Verify educational content remains device-local after dictionary catalog sync.
  const previousLocalBlocks = loadMedicalBlocks();
  const previousLocalSubjects = loadMedicalSubjects();
  const previousLocalTopics = loadAppState().topics;

  const localOnlyBlock = {
    id: 'blk-local-only-test',
    code: 'LOCAL-TEST',
    titleEn: 'Local Test Block',
    titleAr: 'بلوك محلي تجريبي',
    descriptionEn: 'Device-local educational content',
    descriptionAr: 'محتوى تعليمي محلي على الجهاز',
    colorAccent: 'emerald',
    order: 999,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const localOnlySubject = {
    id: 'sub-local-only-test',
    blockId: localOnlyBlock.id,
    code: 'LOCAL-TEST-01',
    titleEn: 'Local Test Subject',
    titleAr: 'مادة محلية تجريبية',
    descriptionEn: 'Imported locally',
    descriptionAr: 'مستوردة محلياً',
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const localOnlyTopic = {
    id: 'topic-local-only-test',
    blockId: localOnlyBlock.id,
    subjectId: localOnlySubject.id,
    title: 'Local Test Topic',
    titleEn: 'Local Test Topic',
    titleAr: 'موضوع محلي تجريبي',
    subtitle: 'Device-local import fixture',
    author: 'UMEDT test',
    publishedAt: '2026-11-21',
    category: 'General' as const,
    difficulty: 'Intermediate' as const,
    readingTimeMinutes: 3,
    favorite: false,
    sections: [
      {
        id: 'section-local-only-test',
        title: 'Local section',
        headingEn: 'Local section',
        headingAr: 'قسم محلي',
        paragraphs: ['This topic is stored on this device.']
      }
    ],
    images: [],
    links: [],
    attachments: [],
    updatedAt: new Date().toISOString()
  };

  saveMedicalBlocks([...previousLocalBlocks, localOnlyBlock]);
  saveMedicalSubjects([...previousLocalSubjects, localOnlySubject]);
  saveTopics([...previousLocalTopics, localOnlyTopic]);

  const localOnlySync = await syncWithRemoteCloudLibrary({
    localTopics: [...previousLocalTopics, localOnlyTopic],
    localTerms: initialStateForCloud.terms,
    localSentences: initialStateForCloud.sentences
  });
  assertCondition(
    localOnlySync.autoMergedTopics.some((topic) => topic.id === localOnlyTopic.id) &&
      loadMedicalBlocks().some((block) => block.id === localOnlyBlock.id) &&
      loadMedicalSubjects().some((subject) => subject.id === localOnlySubject.id),
    'Refreshing the terms-only GitHub dictionary must preserve locally imported blocks, subjects, and topics'
  );

  // Restore the pre-test device state; educational content is never published to UMEDT-DATA.
  saveMedicalBlocks(previousLocalBlocks);
  saveMedicalSubjects(previousLocalSubjects);
  saveTopics(previousLocalTopics);
  const postMigrationMirror = loadUnifiedCloudMirror();
  saveUnifiedCloudMirror({
    ...postMigrationMirror,
    blocks: postMigrationMirror.blocks.filter((block) => block.id !== localOnlyBlock.id),
    subjects: postMigrationMirror.subjects.filter((subject) => subject.id !== localOnlySubject.id),
    topics: postMigrationMirror.topics.filter((topic) => topic.id !== localOnlyTopic.id)
  });

  clearLocallyRemovedRegistry();
  console.log(
    '[PASS] 16. Terms-Only Cloud Source, Local Educational Content Preservation, Automatic Sync Queue & SHA-256 Deduplication Verified'
  );

  // ==========================================================================
  // 17. Verify UMEDT Update Directives (Telegram Auto-Sync, Single Backup Rotation,
  //     Media Separation, Media Management & Offline Cache, Standalone HTML/ZIP Export,
  //     and Bot Token Encryption & Protection)
  // ==========================================================================

  // 17.1 Bot Token Encryption at Rest & Redaction from Logs/Backups/Exports
  const sampleSecretToken = '8123456789:AAH_SecretTelegramBotToken_X987654321';
  const encryptedToken = encryptBotTokenForStorage(sampleSecretToken);
  assertCondition(
    (encryptedToken.startsWith('aks_v1:') || encryptedToken.startsWith('wks_v1:')) &&
      !encryptedToken.includes(sampleSecretToken),
    'Bot token must be encrypted before local storage and never contain raw token string'
  );
  const decryptedToken = decryptBotTokenFromStorage(encryptedToken);
  assertCondition(
    decryptedToken === sampleSecretToken,
    'Encrypted Bot Token must round-trip cleanly via decryptBotTokenFromStorage()'
  );

  saveTelegramBackupConfig({
    ...loadTelegramBackupConfig(),
    enabled: true,
    botToken: sampleSecretToken,
    chatId: '-1009988776655',
    schedule: 'on_change'
  });

  const rawStoredCfgJson = readRawTelegramConfigJsonForAudit();
  assertCondition(
    !rawStoredCfgJson.includes(sampleSecretToken) &&
      (rawStoredCfgJson.includes('aks_v1:') || rawStoredCfgJson.includes('wks_v1:')),
    'Plaintext botToken must NEVER be stored in localStorage (only encryptedBotToken)'
  );
  const reloadedCfg = loadTelegramBackupConfig();
  assertCondition(
    reloadedCfg.botToken === sampleSecretToken,
    'loadTelegramBackupConfig() must decrypt botToken in memory for authorized client calls'
  );
  assertCondition(
    !redactBotTokenFromText(`Error at https://api.telegram.org/bot${sampleSecretToken}/sendDocument`).includes(
      sampleSecretToken
    ),
    'redactBotTokenFromText() must scrub any bot token pattern from logs and export strings'
  );

  const mainActivityJavaSource = fs.readFileSync(
    path.join(
      ROOT_DIR,
      'android/app/src/main/java/org/umed2/dictengine/MainActivity.java'
    ),
    'utf-8'
  );
  assertCondition(
    mainActivityJavaSource.includes('AndroidKeyStore') &&
      mainActivityJavaSource.includes('AES/GCM/NoPadding') &&
      mainActivityJavaSource.includes('encryptSecretWithKeystore') &&
      mainActivityJavaSource.includes('decryptSecretWithKeystore') &&
      mainActivityJavaSource.includes('openExternalUrl'),
    'MainActivity.java must implement Android Keystore AES/GCM/NoPadding encryption and native openExternalUrl intent'
  );

  // 17.2 Media Separation from Backup Payloads (Strip Binary Media, Keep URLs & Metadata)
  const localImgKey = 'img-test-sep-1';
  const localVidKey = 'vid-test-sep-1';
  const localPdfKey = 'pdf-test-sep-1';
  const dummyPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const dummyMp4Base64 =
    'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==';
  const dummyPdfBase64 =
    'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoK';

  await saveLocalMediaRecord({
    id: localImgKey,
    topicId: 'topic-media-sep-1',
    mediaType: 'image',
    fileName: 'blood_smear.png',
    mimeType: 'image/png',
    sizeBytes: 128,
    dataUrl: dummyPngBase64,
    createdAt: new Date().toISOString()
  });
  await saveLocalMediaRecord({
    id: localVidKey,
    topicId: 'topic-media-sep-1',
    mediaType: 'video_file',
    fileName: 'bone_marrow_biopsy.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 256,
    dataUrl: dummyMp4Base64,
    createdAt: new Date().toISOString()
  });
  await saveLocalMediaRecord({
    id: localPdfKey,
    topicId: 'topic-media-sep-1',
    mediaType: 'pdf_document',
    fileName: 'hematology_guidelines.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 512,
    dataUrl: dummyPdfBase64,
    createdAt: new Date().toISOString()
  });

  const mediaRichTopic = {
    id: 'topic-media-sep-1',
    title: 'Anemia Media Separation Test — اختبار فصل الوسائط',
    titleEn: 'Anemia Media Separation Test',
    titleAr: 'اختبار فصل الوسائط',
    subtitle: 'فصل الصور والفيديو وملفات PDF عن النسخة الاحتياطية',
    category: 'Medical' as const,
    blockId: 'block-heme-test',
    subjectId: 'subj-heme-test',
    author: 'UMEDT Verification',
    publishedAt: '2026-11-16',
    readingTimeMinutes: 3,
    favorite: true,
    sections: [
      {
        id: 'sec-media-1',
        headingEn: 'Diagnostic Media & References',
        headingAr: 'الوسائط والمراجع التشخيصية',
        heading: 'Diagnostic Media & References',
        paragraphs: ['Peripheral blood smear and bone marrow biopsy findings.'],
        contentBlocks: [
          {
            id: 'cb-img-local',
            type: 'image' as const,
            order: 1,
            mediaUrl: dummyPngBase64,
            mediaIdbKey: localImgKey,
            mediaFileName: 'blood_smear.png',
            mediaMimeType: 'image/png',
            mediaSizeBytes: 128,
            captionEn: 'Local Blood Smear Image'
          },
          {
            id: 'cb-img-ext',
            type: 'image' as const,
            order: 2,
            externalUrl: 'https://example.org/media/external_diagram.png',
            mediaUrl: 'https://example.org/media/external_diagram.png',
            captionEn: 'External Diagram URL'
          },
          {
            id: 'cb-vid-local',
            type: 'video' as const,
            order: 3,
            mediaUrl: dummyMp4Base64,
            mediaIdbKey: localVidKey,
            mediaFileName: 'bone_marrow_biopsy.mp4',
            mediaMimeType: 'video/mp4',
            mediaSizeBytes: 256,
            titleEn: 'Bone Marrow Biopsy Video'
          },
          {
            id: 'cb-vid-ext',
            type: 'video_link' as const,
            order: 4,
            externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            titleEn: 'External Hematology Lecture'
          },
          {
            id: 'cb-pdf-local',
            type: 'attachment' as const,
            order: 5,
            mediaUrl: dummyPdfBase64,
            mediaIdbKey: localPdfKey,
            mediaFileName: 'hematology_guidelines.pdf',
            mediaMimeType: 'application/pdf',
            mediaSizeBytes: 512,
            titleEn: 'Hematology Guidelines PDF'
          }
        ]
      }
    ],
    images: [
      {
        id: 'img-item-1',
        url: dummyPngBase64,
        mediaIdbKey: localImgKey,
        caption: 'Local Blood Smear Image'
      },
      {
        id: 'img-item-2',
        url: 'https://example.org/media/external_diagram.png',
        externalUrl: 'https://example.org/media/external_diagram.png',
        caption: 'External Diagram URL'
      }
    ],
    links: [
      {
        id: 'lnk-item-1',
        title: 'External Hematology Lecture',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      }
    ],
    attachments: [
      {
        id: 'att-item-1',
        fileName: 'hematology_guidelines.pdf',
        fileSizeLabel: '1 KB',
        fileType: 'application/pdf',
        mediaIdbKey: localPdfKey,
        contentDataUrlOrText: dummyPdfBase64
      }
    ]
  };

  const strippedTopics = stripBinaryMediaFromTopicsForBackup([mediaRichTopic]);
  const strippedJson = JSON.stringify(strippedTopics);
  assertCondition(
    !strippedJson.includes('data:image/png;base64') &&
      !strippedJson.includes('data:video/mp4;base64') &&
      !strippedJson.includes('data:application/pdf;base64'),
    'stripBinaryMediaFromTopicsForBackup() must remove all inline base64 binary payloads from backup JSON'
  );
  assertCondition(
    strippedJson.includes('https://example.org/media/external_diagram.png') &&
      strippedJson.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ') &&
      strippedJson.includes(`idb://${localImgKey}`) &&
      strippedJson.includes(`idb://${localVidKey}`) &&
      strippedJson.includes(`idb://${localPdfKey}`),
    'stripBinaryMediaFromTopicsForBackup() must preserve external URLs and local idb:// media metadata references'
  );

  const backupPkg = createUnifiedBackupPackage(
    initialStateForCloud.terms,
    initialStateForCloud.sentences,
    [mediaRichTopic],
    'اختبار النسخ الموحد',
    initialStateForCloud.studyStats,
    initialStateForCloud.versionMetadata
  );
  const backupPkgJson = backupPkg.jsonString;
  assertCondition(
    !backupPkgJson.includes('data:image/png;base64') &&
      !backupPkgJson.includes(sampleSecretToken) &&
      backupPkg.payload.mediaStoragePolicy === 'metadata_and_urls_only',
    'Unified backup package must exclude binary media and Bot Token while keeping metadata_and_urls_only policy'
  );

  // 17.3 Telegram Backup Rotation & Safe Deletion After Verification + Debounced Auto-Sync
  const telegramApiCalls: Array<{
    endpoint: string;
    messageIdToDelete?: number;
  }> = [];
  let simulatedNextMessageId = 501;
  let simulateUploadFailure = false;

  const originalFetchForTg = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (urlStr.includes('api.telegram.org/bot')) {
      if (urlStr.endsWith('/sendDocument')) {
        telegramApiCalls.push({ endpoint: 'sendDocument' });
        if (simulateUploadFailure) {
          return new Response(
            JSON.stringify({ ok: false, description: 'Simulated network failure' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        const assignedId = simulatedNextMessageId++;
        return new Response(
          JSON.stringify({
            ok: true,
            result: { message_id: assignedId }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/deleteMessage')) {
        const bodyObj = init?.body ? JSON.parse(String(init.body)) : {};
        telegramApiCalls.push({
          endpoint: 'deleteMessage',
          messageIdToDelete: Number(bodyObj.message_id)
        });
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    if (urlStr === 'https://example.org/media/sample_lecture.pdf') {
      const pdfBytes = new TextEncoder().encode('%PDF-1.4 mock offline cached pdf');
      return new Response(pdfBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    }
    return originalFetchForTg(input, init);
  };

  try {
    // Upload #1 (creates backup message 501; no previous app backup exists, so no deleteMessage called)
    const cfgBeforeUpload1 = loadTelegramBackupConfig();
    const resUpload1 = await sendBackupToTelegram(
      cfgBeforeUpload1,
      initialStateForCloud.terms,
      initialStateForCloud.sentences,
      [mediaRichTopic],
      'نسخة احتياطية أولى'
    );
    assertCondition(
      resUpload1.ok && resUpload1.uploadedMessageId === 501,
      'First Telegram backup upload must succeed and record message_id 501'
    );
    assertCondition(
      telegramApiCalls.filter((c) => c.endpoint === 'deleteMessage').length === 0,
      'First backup must not delete any channel messages'
    );

    // Simulated Failed Upload #2 (must NOT delete previous backup 501!)
    simulateUploadFailure = true;
    const cfgBeforeFailedUpload = loadTelegramBackupConfig();
    const resFailedUpload = await sendBackupToTelegram(
      cfgBeforeFailedUpload,
      initialStateForCloud.terms,
      initialStateForCloud.sentences,
      [mediaRichTopic],
      'محاولة رفع فاشلة'
    );
    assertCondition(
      !resFailedUpload.ok,
      'Simulated failed upload must return ok: false'
    );
    assertCondition(
      telegramApiCalls.filter((c) => c.endpoint === 'deleteMessage').length === 0 &&
        loadTelegramBackupConfig().lastBackupMessageId === 501,
      'When new backup upload fails, previous backup message_id 501 must NOT be deleted'
    );

    // Successful Upload #3 (uploads message 502, verifies it, THEN deletes ONLY previous app backup 501)
    simulateUploadFailure = false;
    const cfgBeforeUpload2 = loadTelegramBackupConfig();
    const resUpload2 = await sendBackupToTelegram(
      cfgBeforeUpload2,
      initialStateForCloud.terms,
      initialStateForCloud.sentences,
      [mediaRichTopic],
      'نسخة احتياطية ثانية محدثة'
    );
    assertCondition(
      resUpload2.ok &&
        resUpload2.uploadedMessageId === 502 &&
        resUpload2.deletedPreviousMessageIds?.includes(501),
      'Second verified backup upload (502) must delete previous app backup message (501) after verification'
    );
    const afterUpload2Cfg = loadTelegramBackupConfig();
    assertCondition(
      afterUpload2Cfg.lastBackupMessageId === 502 &&
        afterUpload2Cfg.appBackupMessageIds?.length === 1 &&
        afterUpload2Cfg.appBackupMessageIds[0] === 502,
      'Only one recent app backup message ID (502) must be retained in state'
    );

    // Verify Debounced Auto-Sync batches rapid Topic/Subject/Block edits into a single Telegram upload
    const countBeforeDebounce = telegramApiCalls.filter(
      (c) => c.endpoint === 'sendDocument'
    ).length;
    scheduleDebouncedTelegramAutoSync({
      getTerms: () => initialStateForCloud.terms,
      getSentences: () => initialStateForCloud.sentences,
      getTopics: () => [mediaRichTopic],
      triggerReason: 'إضافة بلوك جديد',
      debounceMs: 5000
    });
    scheduleDebouncedTelegramAutoSync({
      getTerms: () => initialStateForCloud.terms,
      getSentences: () => initialStateForCloud.sentences,
      getTopics: () => [mediaRichTopic],
      triggerReason: 'إضافة مادة جديدة',
      debounceMs: 5000
    });
    scheduleDebouncedTelegramAutoSync({
      getTerms: () => initialStateForCloud.terms,
      getSentences: () => initialStateForCloud.sentences,
      getTopics: () => [mediaRichTopic],
      triggerReason: 'تعديل موضوع',
      debounceMs: 5000
    });
    const debouncedFlushRes = await flushPendingTelegramAutoSync();
    const countAfterDebounce = telegramApiCalls.filter(
      (c) => c.endpoint === 'sendDocument'
    ).length;
    assertCondition(
      Boolean(debouncedFlushRes?.ok) && countAfterDebounce === countBeforeDebounce + 1,
      'Multiple closely-spaced Block/Subject/Topic edits must be batched into a single Telegram backup upload'
    );

    // 17.4 Media Detection, Offline Caching & External App Opener
    const ytDetect = detectExternalMediaKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const mp4Detect = detectExternalMediaKind('https://cdn.example.org/surgery.mp4');
    const pdfDetect = detectExternalMediaKind('https://example.org/media/sample_lecture.pdf');
    assertCondition(
      ytDetect.kind === 'video_embed' &&
        Boolean(ytDetect.embedUrl?.includes('youtube.com/embed/dQw4w9WgXcQ')) &&
        mp4Detect.kind === 'video_direct' &&
        pdfDetect.kind === 'pdf',
      'detectExternalMediaKind() must accurately classify YouTube embeds, direct MP4 videos, and PDF links'
    );

    const offlineCacheRes = await downloadRemoteMediaToOfflineCache({
      remoteUrl: 'https://example.org/media/sample_lecture.pdf',
      topicId: mediaRichTopic.id,
      sectionId: 'sec-media-1',
      blockId: 'cb-pdf-ext',
      preferredFileName: 'sample_lecture.pdf',
      preferredMimeType: 'application/pdf'
    });
    assertCondition(
      offlineCacheRes.success &&
        Boolean(offlineCacheRes.mediaIdbKey) &&
        Boolean(offlineCacheRes.dataUrl?.startsWith('data:application/pdf;base64,')),
      'downloadRemoteMediaToOfflineCache() must download remote media and cache it in local offline storage'
    );
    const cachedRecord = await getLocalMediaRecord(offlineCacheRes.mediaIdbKey!);
    assertCondition(
      Boolean(cachedRecord && cachedRecord.sizeBytes > 0),
      'Offline cached media must be retrievable without internet from getLocalMediaRecord()'
    );

    const extOpenRes = await openMediaInExternalApp(
      'https://example.org/media/sample_lecture.pdf',
      'sample_lecture.pdf',
      'application/pdf'
    );
    assertCondition(
      typeof extOpenRes.messageAr === 'string' && extOpenRes.messageAr.length > 0,
      'openMediaInExternalApp() must provide a clean handler for external viewing'
    );
  } finally {
    globalThis.fetch = originalFetchForTg;
  }

  // 17.5 Standalone Topic & Block Export as HTML (.html) and ZIP (.zip)
  const testBlockObj = {
    id: 'block-heme-test',
    code: 'BLK-HEME',
    titleEn: 'Hematology Block',
    titleAr: 'بلوك أمراض الدم',
    descriptionEn: 'Hematology Block',
    descriptionAr: 'بلوك أمراض الدم',
    colorAccent: 'emerald',
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const testSubjectObj = {
    id: 'subj-heme-test',
    blockId: 'block-heme-test',
    code: 'HEME-101',
    titleEn: 'Clinical Hematology',
    titleAr: 'علم أمراض الدم السريري',
    descriptionEn: 'Clinical Hematology',
    descriptionAr: 'علم أمراض الدم السريري',
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Topic Standalone HTML (without local binary media, preserving external URLs)
  const topicHtmlNoLocal = await generateStandaloneHtmlDocument({
    scope: 'topic',
    titleEn: mediaRichTopic.titleEn,
    titleAr: mediaRichTopic.titleAr,
    block: testBlockObj,
    subjects: [testSubjectObj],
    topics: [mediaRichTopic],
    allTerms: initialStateForCloud.terms,
    allQuestions: [],
    includeLocalMedia: false
  });
  assertCondition(
    topicHtmlNoLocal.htmlText.startsWith('<!DOCTYPE html>') &&
      topicHtmlNoLocal.htmlText.includes('https://example.org/media/external_diagram.png') &&
      !topicHtmlNoLocal.htmlText.includes(dummyPngBase64),
    'Standalone HTML with includeLocalMedia=false must work standalone, keep external URLs, and omit local binary data URLs'
  );

  // Topic Standalone HTML (with local binary media embedded)
  const topicHtmlWithLocal = await generateStandaloneHtmlDocument({
    scope: 'topic',
    titleEn: mediaRichTopic.titleEn,
    titleAr: mediaRichTopic.titleAr,
    block: testBlockObj,
    subjects: [testSubjectObj],
    topics: [mediaRichTopic],
    allTerms: initialStateForCloud.terms,
    allQuestions: [],
    includeLocalMedia: true
  });
  assertCondition(
    topicHtmlWithLocal.htmlText.includes(dummyPngBase64) &&
      topicHtmlWithLocal.includedLocalMediaCount >= 3,
    'Standalone HTML with includeLocalMedia=true must embed local images, videos, and PDFs for 100% offline standalone viewing'
  );

  // Block Standalone ZIP (with local media bundled as files in media/ folder)
  const blockZipWithMedia = await generateStandaloneZipArchiveBytes({
    scope: 'block',
    titleEn: testBlockObj.titleEn,
    titleAr: testBlockObj.titleAr,
    block: testBlockObj,
    subjects: [testSubjectObj],
    topics: [mediaRichTopic],
    allTerms: initialStateForCloud.terms,
    allQuestions: [],
    includeLocalMedia: true
  });
  const zipEntryNames = inspectZipEntriesList(blockZipWithMedia.zipBytes);
  assertCondition(
    zipEntryNames.includes('index.html') &&
      zipEntryNames.includes('package-data.json') &&
      zipEntryNames.includes('README.txt') &&
      zipEntryNames.some((n) => n.startsWith('media/')),
    'Standalone Block ZIP archive with includeLocalMedia=true must contain index.html, package-data.json, README.txt, and media/* files'
  );

  console.log(
    '[PASS] 17. Telegram Auto-Sync & Debounce, Single Backup Rotation After Verification, Media Separation, Offline Media Caching & Playback, Standalone Topic/Block HTML & ZIP Export, and Bot Token Keystore Protection Verified'
  );

  // =========================================================================
  // 18. Verify Dual Data Sources (UMEDT-DATA Repo + Universal AI/Local Import),
  //     Offline Books/Media Prefetch, Interactive Standalone Export, & Backup
  // =========================================================================
  clearLocallyRemovedRegistry();
  setCloudSyncSimulatedOffline(false);

  const termsUrl = 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/terms.json';
  const umedtPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
  const mockBookPdfUrl = 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/cardio_atlas.pdf';
  const canonicalTermsFixture = [
    {
      id: 'term-cardiomyocyte',
      term: 'Cardiomyocyte',
      definitionEn: 'A specialized muscle cell that forms the contractile tissue of the heart.',
      definitionAr: 'خلية عضلية متخصصة تكوّن النسيج القابل للانقباض في القلب.',
      translation: 'خلية عضلة القلب',
      pronunciation: '/ˌkɑːr.di.oʊˈmaɪ.oʊ.saɪt/',
      exampleEn: 'A cardiomyocyte contracts in response to an electrical impulse.',
      exampleAr: 'تنقبض خلية عضلة القلب استجابةً لنبضة كهربائية.',
      createdAt: '2026-11-21T00:00:00.000Z',
      updatedAt: '2026-11-21T00:00:00.000Z'
    }
  ];
  const termsPayloadText = JSON.stringify(canonicalTermsFixture);
  const termsPayloadHash = await computeSha256Hex(new TextEncoder().encode(termsPayloadText));
  const mockUmedtFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr === UMEDT_DATA_CATALOG_URL) {
      return new Response(
        JSON.stringify({
          catalogVersion: '2026.11.21-test',
          schemaVersion: 1,
          capabilities: { termsOnly: true },
          contentTypesRegistry: [
            {
              contentType: 'term',
              rendererType: 'lexicon_entry',
              displayNameAr: 'مصطلح',
              displayNameEn: 'Dictionary Term'
            }
          ],
          collections: [
            {
              id: 'terms',
              contentType: 'term',
              rendererType: 'lexicon_entry',
              rawUrl: termsUrl,
              sha256: termsPayloadHash,
              recordCount: canonicalTermsFixture.length
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr === termsUrl) {
      return new Response(termsPayloadText, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (urlStr === mockBookPdfUrl) {
      return new Response(umedtPdfBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  // 18.1 Terms-only UMEDT-DATA sync + strict SHA-256 + incremental skip
  const umedtSyncFirst = await syncFromUmedtDataRepository({
    customFetch: mockUmedtFetch
  });
  assertCondition(
    umedtSyncFirst.fetched === true &&
      umedtSyncFirst.termsOnly === true &&
      umedtSyncFirst.updatedCollectionsCount === 1 &&
      umedtSyncFirst.skippedCollectionsCount === 0 &&
      umedtSyncFirst.incoming.terms?.length === 1 &&
      umedtSyncFirst.incoming.terms[0]?.term === 'Cardiomyocyte' &&
      umedtSyncFirst.incoming.terms[0]?.translation === 'خلية عضلة القلب' &&
      umedtSyncFirst.incoming.terms[0]?.examples?.[0]?.en.includes('electrical impulse'),
    'syncFromUmedtDataRepository must normalize the terms-only schema and reject no valid canonical fields'
  );

  const umedtSyncSecond = await syncFromUmedtDataRepository({
    currentCollectionHashes: umedtSyncFirst.collectionHashes,
    customFetch: mockUmedtFetch
  });
  assertCondition(
    umedtSyncSecond.fetched === true &&
      umedtSyncSecond.updatedCollectionsCount === 0 &&
      umedtSyncSecond.skippedCollectionsCount === 1,
    'terms-only catalog must skip unchanged terms collection when SHA-256 matches'
  );

  // 18.2 Terms-only cloud mirror reset + explicit dictionary download + local-state preservation
  const originalFetchForUmedt = globalThis.fetch;
  try {
    globalThis.fetch = mockUmedtFetch;
    const preSyncState = loadAppState();
    const fullSyncRes = await syncWithRemoteCloudLibrary({
      localTopics: preSyncState.topics,
      localTerms: preSyncState.terms,
      localSentences: preSyncState.sentences,
      customFetch: mockUmedtFetch
    });
    assertCondition(
      fullSyncRes.mirror.terms.some((term) => term.id === 'term-cardiomyocyte') &&
        !(fullSyncRes.mirror.books || []).length &&
        !(fullSyncRes.mirror.exams || []).length &&
        !(fullSyncRes.mirror.quizQuestions || []).length &&
        !fullSyncRes.mirror.topics.some((topic) => topic.id === 'topic-umedt-data-1'),
      'termsOnly catalog must expose the dictionary and clear legacy cloud-only academic collections'
    );

    const dictionarySummary = buildCloudLibraryCatalogView({
      localTopics: fullSyncRes.autoMergedTopics,
      localTerms: fullSyncRes.autoMergedTerms,
      localSentences: fullSyncRes.autoMergedSentences
    });
    assertCondition(
      (dictionarySummary.cloudDictionaryTotalCount || 0) >= 1,
      'Cloud Library must expose a standalone terms-only dictionary download target'
    );

    const dictionaryDownload = await downloadCloudLibraryTarget({
      targetType: 'dictionary',
      targetId: 'all',
      currentTopics: fullSyncRes.autoMergedTopics,
      currentTerms: fullSyncRes.autoMergedTerms,
      currentSentences: fullSyncRes.autoMergedSentences,
      customFetch: mockUmedtFetch
    });
    assertCondition(
      dictionaryDownload.success &&
        dictionaryDownload.updatedTerms.some((term) =>
          term.id === 'term-cardiomyocyte' &&
          term.translation === 'خلية عضلة القلب' &&
          term.phonetic === '/ˌkɑːr.di.oʊˈmaɪ.oʊ.saɪt/' &&
          term.examples[0]?.en.includes('electrical impulse')
        ),
      'Explicit dictionary download must install normalized terms with translation, pronunciation, bilingual definition, and example'
    );

    const prefetchedMediaKey = `idb-${computeDeterministicFastHashHex(mockBookPdfUrl).slice(0, 16)}`;
    const mediaPrefetch = await downloadRemoteMediaToOfflineCache({
      id: prefetchedMediaKey,
      remoteUrl: mockBookPdfUrl,
      fileName: 'cardio_atlas.pdf',
      mimeType: 'application/pdf',
      customFetch: mockUmedtFetch
    });
    assertCondition(
      mediaPrefetch.success && Boolean(await getLocalMediaRecord(prefetchedMediaKey)),
      'Independent local media cache must remain available for imported educational topics and standalone exports'
    );
  } finally {
    globalThis.fetch = originalFetchForUmedt;
  }

  // 18.3 Universal AI / Local Content Import (Markdown ```json``` from ChatGPT/Gemini + User-State Preservation)
  const existingFavoriteTermId = initialStateForCloud.terms[0]?.id;
  if (existingFavoriteTermId) {
    const seededTerms = initialStateForCloud.terms.map((t, idx) =>
      idx === 0
        ? {
            ...t,
            favorite: true,
            collections: ['custom-star-deck'],
            srsData: {
              interval: 14,
              repetitions: 3,
              easeFactor: 2.6,
              nextReviewAt: Date.now() + 86400000
            }
          }
        : t
    );
    saveTopics(initialStateForCloud.topics);
    const { saveTerms } = await import('../src/services/storageService');
    saveTerms(seededTerms);
  }

  // Simulate Blocks and Subjects already created by the user inside the app.
  // The AI importer must preserve these records and only attach generated topics to them.
  const aiLocalBlock = {
    id: 'blk-ai-neuro',
    code: 'BLK-NEURO',
    titleEn: 'Locally Created Neurology Block',
    titleAr: 'بلوك الأعصاب المحلي',
    descriptionEn: 'CNS & PNS',
    descriptionAr: 'الجهاز العصبي المركزي والطرفي',
    colorAccent: 'emerald',
    order: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const aiLocalSubject = {
    id: 'subj-ai-neuro',
    blockId: 'blk-ai-neuro',
    code: 'NEUR-301',
    titleEn: 'Locally Created Neuroanatomy',
    titleAr: 'التشريح العصبي المحلي',
    descriptionEn: 'Neuroanatomy',
    descriptionAr: 'التشريح العصبي',
    order: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveMedicalBlocks([...loadMedicalBlocks().filter((item) => item.id !== aiLocalBlock.id), aiLocalBlock]);
  saveMedicalSubjects([...loadMedicalSubjects().filter((item) => item.id !== aiLocalSubject.id), aiLocalSubject]);

  const aiMarkdownPayload = `إليك المحتوى المولّد بالتوافق مع UMEDT:
\`\`\`json
{
  "blocks": [
    {
      "id": "blk-ai-neuro",
      "code": "BLK-NEURO",
      "titleEn": "Neurology Block",
      "titleAr": "بلوك الأعصاب",
      "descriptionEn": "CNS & PNS",
      "descriptionAr": "الجهاز العصبي المركزي والطرفي",
      "order": 20
    }
  ],
  "subjects": [
    {
      "id": "subj-ai-neuro",
      "blockId": "blk-ai-neuro",
      "code": "NEUR-301",
      "titleEn": "Neuroanatomy",
      "titleAr": "التشريح العصبي",
      "order": 1
    }
  ],
  "topics": [
    {
      "id": "topic-ai-stroke",
      "blockId": "blk-ai-neuro",
      "subjectId": "subj-ai-neuro",
      "titleEn": "Ischemic Stroke",
      "titleAr": "السكتة الدماغية الإقفارية",
      "sections": [
        {
          "id": "sec-ai-1",
          "title": "Pathway",
          "body": "Acute stroke evaluation.",
          "contentBlocks": [
            {
              "id": "cb-ai-diag",
              "type": "diagram",
              "title": "Brain Perfusion Map",
              "diagramSvg": "<svg viewBox=\\"0 0 100 50\\"><script>alert('xss')</script><rect width=\\"100\\" height=\\"50\\" fill=\\"#eef\\"/><text x=\\"8\\" y=\\"30\\">Penumbra</text></svg>"
            },
            {
              "id": "cb-ai-pdf",
              "type": "pdf_viewer",
              "title": "Stroke Protocol PDF",
              "url": "${mockBookPdfUrl}"
            },
            {
              "id": "cb-ai-book",
              "type": "book_reference",
              "title": "Neuro Atlas",
              "bookId": "book-ai-neuro-1"
            },
            {
              "id": "cb-ai-exam",
              "type": "exam_link",
              "title": "Neuro Quiz",
              "examId": "exam-ai-neuro-1"
            }
          ]
        }
      ]
    }
  ],
  "books": [
    {
      "id": "book-ai-neuro-1",
      "titleEn": "Clinical Neuro Atlas",
      "titleAr": "أطلس الأعصاب السريري",
      "blockId": "blk-ai-neuro",
      "subjectId": "subj-ai-neuro",
      "pdfUrl": "${mockBookPdfUrl}"
    }
  ],
  "exams": [
    {
      "id": "exam-ai-neuro-1",
      "titleEn": "Stroke Quick Check",
      "titleAr": "اختبار السكتة السريع",
      "blockId": "blk-ai-neuro",
      "subjectId": "subj-ai-neuro",
      "topicIds": ["topic-ai-stroke"],
      "questionIds": ["q-ai-1", "q-ai-2", "q-ai-3", "q-ai-4", "q-ai-5", "q-ai-6", "q-ai-7"],
      "timeLimitMinutes": 10,
      "passingScorePercent": 70
    }
  ],
  "questions": [
    { "id": "q-ai-1", "type": "single_choice", "questionEn": "First imaging in acute stroke?", "options": [{ "key": "A", "textEn": "Non-contrast head CT" }, { "key": "B", "textEn": "DEXA" }], "correctOptionKeys": ["A"], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-2", "type": "multiple_select", "questionEn": "Select stroke risk factors", "options": [{ "key": "A", "textEn": "Atrial fibrillation" }, { "key": "B", "textEn": "Hypertension" }], "correctOptionKeys": ["A", "B"], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-3", "type": "true_false", "questionEn": "Alteplase is indicated after excluding hemorrhage.", "options": [{ "key": "T", "textEn": "True" }, { "key": "F", "textEn": "False" }], "correctOptionKeys": ["T"], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-4", "type": "matching", "questionEn": "Match stroke syndrome to artery", "matchingPairs": [{ "id": "mp1", "leftEn": "Broca aphasia", "rightEn": "Left MCA" }, { "id": "mp2", "leftEn": "Homonymous hemianopia", "rightEn": "PCA" }], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-5", "type": "image_based", "questionEn": "Identify the hyperdense MCA sign on non-contrast CT", "imageUrl": "https://example.org/stroke_ct.png", "options": [{ "key": "A", "textEn": "Acute MCA thrombus" }, { "key": "B", "textEn": "Normal calcified falx" }], "correctOptionKeys": ["A"], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-6", "type": "fill_blank", "questionEn": "Intravenous ____ dissolves acute thrombi.", "acceptableAnswers": ["alteplase"], "topicId": "topic-ai-stroke" },
    { "id": "q-ai-7", "type": "short_answer", "questionEn": "Standard CT door-to-imaging target in minutes?", "acceptableAnswers": ["25"], "topicId": "topic-ai-stroke" }
  ],
  "terms": [
    ${
      existingFavoriteTermId
        ? `{ "id": "${existingFavoriteTermId}", "term": "${initialStateForCloud.terms[0].term}", "arabicTranslation": "محدث", "favorite": false, "collections": [] },`
        : ''
    }
    { "id": "term-ai-penumbra", "term": "Penumbra", "arabicTranslation": "شبه الظل الإقفاري", "category": "Neurology", "definition": "Salvageable tissue surrounding core infarct." }
  ]
}
\`\`\`
`;

  const aiImportRes = importUniversalAiOrLocalContent({
    rawText: aiMarkdownPayload,
    conflictPolicy: 'merge',
    sourceLabel: 'ChatGPT Markdown Test'
  });
  const preservedFirstTerm = aiImportRes.updatedState.terms.find((t) => t.id === existingFavoriteTermId);
  assertCondition(
    aiImportRes.success &&
      aiImportRes.counts.blocks === 0 &&
      aiImportRes.counts.subjects === 0 &&
      aiImportRes.counts.topics === 1 &&
      aiImportRes.updatedState.blocks.some((block) => block.id === 'blk-ai-neuro' && block.titleEn === 'Locally Created Neurology Block') &&
      aiImportRes.updatedState.subjects.some((subject) => subject.id === 'subj-ai-neuro' && subject.titleEn === 'Locally Created Neuroanatomy') &&
      aiImportRes.counts.books === 1 &&
      aiImportRes.counts.exams === 1 &&
      aiImportRes.counts.questions === 7 &&
      (!existingFavoriteTermId ||
        (preservedFirstTerm?.favorite === true &&
          preservedFirstTerm?.collections?.includes('custom-star-deck') &&
          preservedFirstTerm?.srsData?.interval === 14)),
    'Universal AI importer must parse generated topics against existing local hierarchy, ignore incoming block/subject definitions, and preserve favorite, collections, and SRS progress'
  );

  // Deduplication re-import check
  const aiImportRepeatRes = importUniversalAiOrLocalContent({
    rawText: aiMarkdownPayload,
    conflictPolicy: 'ignore',
    sourceLabel: 'Duplicate Test'
  });
  assertCondition(
    aiImportRepeatRes.counts.skippedDuplicates > 0,
    'Repeated universal AI/local import with conflictPolicy=ignore must deduplicate without duplicating items'
  );

  // 18.4 Standalone Offline HTML & ZIP Export with Sanitized Diagram SVG, Books, Exams & Hashed Prefetched Media
  const aiTopic = aiImportRes.updatedState.topics.find((t) => t.id === 'topic-ai-stroke')!;
  const aiBlock = aiImportRes.updatedState.blocks.find((b) => b.id === 'blk-ai-neuro')!;
  const aiSubject = aiImportRes.updatedState.subjects.find((s) => s.id === 'subj-ai-neuro')!;
  const standaloneAiHtml = await generateStandaloneHtmlDocument({
    scope: 'complete_block',
    titleEn: aiBlock.titleEn,
    titleAr: aiBlock.titleAr,
    block: aiBlock,
    subjects: [aiSubject],
    topics: [aiTopic],
    allTerms: aiImportRes.updatedState.terms,
    allQuestions: aiImportRes.updatedState.questions.filter((q) => q.topicId === 'topic-ai-stroke'),
    books: aiImportRes.updatedState.books,
    exams: aiImportRes.updatedState.exams,
    includeLocalMedia: true
  });
  assertCondition(
    !standaloneAiHtml.htmlText.includes('<script>alert') &&
      standaloneAiHtml.htmlText.includes('Penumbra') &&
      standaloneAiHtml.htmlText.includes('standalone-books') &&
      standaloneAiHtml.htmlText.includes('Clinical Neuro Atlas') &&
      standaloneAiHtml.htmlText.includes('Stroke Quick Check') &&
      standaloneAiHtml.includedLocalMediaCount >= 1,
    'Standalone HTML export must sanitize SVG diagrams (strip <script>), include books/exams sections, and resolve hashed prefetched remote PDFs offline'
  );

  const standaloneAiZip = await generateStandaloneZipArchiveBytes({
    scope: 'complete_block',
    titleEn: aiBlock.titleEn,
    titleAr: aiBlock.titleAr,
    block: aiBlock,
    subjects: [aiSubject],
    topics: [aiTopic],
    allTerms: aiImportRes.updatedState.terms,
    allQuestions: aiImportRes.updatedState.questions.filter((q) => q.topicId === 'topic-ai-stroke'),
    books: aiImportRes.updatedState.books,
    exams: aiImportRes.updatedState.exams,
    includeLocalMedia: true
  });
  const aiZipEntries = inspectZipEntriesList(standaloneAiZip.zipBytes);
  assertCondition(
    aiZipEntries.includes('index.html') && aiZipEntries.includes('package-data.json'),
    'Standalone ZIP export with new block content must produce complete index.html and package-data.json'
  );

  // 18.5 Telegram Full Unified Backup Completeness Check (books, exams, mediaAssets metadata, no inline binary blobs)
  const fullUnifiedBackup = createUnifiedBackupPackage(
    aiImportRes.updatedState.terms,
    aiImportRes.updatedState.sentences,
    aiImportRes.updatedState.topics,
    'Post-AI Import Auto Backup'
  );
  assertCondition(
    Array.isArray(fullUnifiedBackup.payload.data.books) &&
      fullUnifiedBackup.payload.data.books.length >= 1 &&
      Array.isArray(fullUnifiedBackup.payload.data.exams) &&
      fullUnifiedBackup.payload.data.exams.length >= 1 &&
      Array.isArray(fullUnifiedBackup.payload.data.quizQuestions) &&
      fullUnifiedBackup.payload.data.quizQuestions.length >= 7 &&
      fullUnifiedBackup.payload.mediaStoragePolicy === 'metadata_and_urls_only' &&
      (fullUnifiedBackup.summary.booksCount || 0) >= 1 &&
      (fullUnifiedBackup.summary.examsCount || 0) >= 1,
    'createUnifiedBackupPackage must include books, exams, quizQuestions, mediaAssets metadata, and summary counts without inline binary blobs'
  );

  console.log(
    '[PASS] 18. UMEDT-DATA Repository Sync & Incremental Hash Skip, Offline Book/Media Prefetch, Universal AI/Local Markdown/JSON Importer with User-State Protection, Sanitized Interactive Standalone HTML/ZIP Export, and Complete Telegram Backup Package Verified'
  );

  // =========================================================================
  // 19. UMEDT-DATA v2 Auto-Discovery, Normalized Media/Books/Exams, Offline Notes,
  //     and SHA-256 Deduplicated Telegram Media Upload (Preserving Channel Media)
  // =========================================================================
  const v2MockSvgUrl = 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/ecg_lead_map.svg';
  const v2MockSvgBody = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#10b981"/></svg>';
  const v2MockPayloads = {
    topics: [
      {
        id: 'topic-v2-ecg',
        blockId: 'blk-ai-neuro',
        subjectId: 'subj-ai-neuro',
        title: 'ECG Essentials v2',
        titleEn: 'ECG Essentials v2',
        titleAr: 'أساسيات تخطيط القلب v2',
        subtitle: '12-Lead Interpretation',
        sections: [
          {
            id: 'sec-v2-1',
            headingEn: 'Lead Groups',
            headingAr: 'مجموعات المساري',
            paragraphs: ['Limb and precordial leads assess depolarization vectors.']
          }
        ]
      }
    ],
    books: [
      {
        id: 'book-v2-ecg',
        titleEn: 'ECG Pocket Atlas',
        titleAr: 'أطلس تخطيط القلب المختصر',
        blockId: 'blk-ai-neuro',
        downloadUrl: mockBookPdfUrl,
        format: 'pdf',
        resourceKind: 'reference_book',
        publicationYear: 2026
      }
    ],
    exams: [
      {
        id: 'exam-v2-ecg',
        titleEn: 'ECG Mastery Quiz',
        titleAr: 'اختبار قراءة التخطيط',
        topicIds: ['topic-v2-ecg'],
        questionIds: ['q-ai-1'],
        passingScorePercent: 80,
        durationMinutes: 15
      }
    ],
    media: [
      {
        id: 'media-v2-svg-1',
        titleEn: 'ECG Lead Diagram',
        titleAr: 'مخطط مساري القلب',
        kind: 'svg',
        format: 'svg',
        rawUrl: v2MockSvgUrl,
        linkedEntityType: 'topic',
        linkedEntityId: 'topic-v2-ecg'
      }
    ],
    flashcards: [
      {
        id: 'fc-v2-1',
        titleEn: 'Murmurs High-Yield Deck',
        titleAr: 'ملخص النفخات القلبية',
        descriptionAr: 'مجموعة مكتشفة تلقائياً عبر contentTypesRegistry'
      }
    ]
  };
  const v2MockCatalog = {
    schemaVersion: '2.0.0',
    catalogVersion: '2026.11.0-v2',
    updatedAt: new Date().toISOString(),
    contentTypesRegistry: [
      { contentType: 'block', displayNameEn: 'Blocks', displayNameAr: 'البلوكات', rendererType: 'block_card', supportsDownload: true },
      { contentType: 'flashcard_deck', displayNameEn: 'Flashcards', displayNameAr: 'بطاقات استذكار', rendererType: 'generic_card', supportsDownload: true }
    ],
    collections: [
      {
        id: 'topics',
        contentType: 'topic',
        rendererType: 'topic_article',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/topics.json',
        sha256: await computeSha256Hex(new TextEncoder().encode(JSON.stringify(v2MockPayloads.topics)))
      },
      {
        id: 'books',
        contentType: 'book',
        rendererType: 'book_pdf_reader',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/books.json',
        sha256: await computeSha256Hex(new TextEncoder().encode(JSON.stringify(v2MockPayloads.books)))
      },
      {
        id: 'exams',
        contentType: 'exam',
        rendererType: 'exam_blueprint',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/exams.json',
        sha256: await computeSha256Hex(new TextEncoder().encode(JSON.stringify(v2MockPayloads.exams)))
      },
      {
        id: 'media',
        contentType: 'media',
        rendererType: 'media_gallery',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/media-index.json',
        sha256: await computeSha256Hex(new TextEncoder().encode(JSON.stringify(v2MockPayloads.media)))
      },
      {
        id: 'flashcards',
        contentType: 'flashcard_deck',
        rendererType: 'generic_card',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/flashcards.json',
        sha256: await computeSha256Hex(new TextEncoder().encode(JSON.stringify(v2MockPayloads.flashcards)))
      }
    ]
  };

  const originalFetchForV2 = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('/catalog.json')) {
      return new Response(JSON.stringify(v2MockCatalog), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/topics.json')) {
      return new Response(JSON.stringify(v2MockPayloads.topics), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/books.json')) {
      return new Response(JSON.stringify(v2MockPayloads.books), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/exams.json')) {
      return new Response(JSON.stringify(v2MockPayloads.exams), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/media-index.json')) {
      return new Response(JSON.stringify(v2MockPayloads.media), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('/flashcards.json')) {
      return new Response(JSON.stringify(v2MockPayloads.flashcards), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr === v2MockSvgUrl) {
      return new Response(v2MockSvgBody, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    }
    if (urlStr === mockBookPdfUrl) {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const v2Sync = await syncFromUmedtDataRepository({
      currentCollectionHashes: {}
    });
    const mergedV2 = mergeRecordsIntoCloudSnapshot(loadUnifiedCloudMirror(), v2Sync.incoming);
    saveUnifiedCloudMirror(mergedV2.snapshot);

    assertCondition(
      v2Sync.fetched &&
        Boolean(mergedV2.snapshot.books?.some(
          (b) =>
            b.id === 'book-v2-ecg' &&
            b.downloadUrl === mockBookPdfUrl &&
            b.pdfUrl === mockBookPdfUrl &&
            b.format === 'pdf'
        )) &&
        Boolean(mergedV2.snapshot.exams?.some(
          (ex) =>
            ex.id === 'exam-v2-ecg' &&
            ex.passingScorePercent === 80 &&
            ex.passingPercent === 80
        )) &&
        Boolean(mergedV2.snapshot.mediaAssets?.some(
          (ma) =>
            ma.id === 'media-v2-svg-1' &&
            ma.rawUrl === v2MockSvgUrl &&
            ma.topicId === 'topic-v2-ecg'
        )) &&
        (mergedV2.snapshot.dynamicCollections || []).some(
          (col) => col.id === 'flashcards' && col.items.length === 1
        ),
      'UMEDT-DATA v2 parser must normalize downloadUrl books, passingScorePercent exams, rawUrl+linkedEntityId media-index, and auto-discover unknown collections'
    );

    const v2CatalogView = buildCloudLibraryCatalogView({
      localTopics: loadAppState().topics,
      localTerms: loadAppState().terms,
      localSentences: loadAppState().sentences
    });
    assertCondition(
      v2CatalogView.dynamicCollections.some((c) => c.id === 'flashcards' && c.rendererType === 'generic_card'),
      'buildCloudLibraryCatalogView must expose auto-discovered collections with generic_card renderer'
    );

    // Offline download of topic-v2-ecg must prefetch linked media-index SVG into IndexedDB
    const topicV2Download = await downloadCloudLibraryTarget({
      targetType: 'topic',
      targetId: 'topic-v2-ecg',
      currentTopics: loadAppState().topics,
      currentTerms: loadAppState().terms,
      currentSentences: loadAppState().sentences
    });
    const svgCacheKey = `idb-${computeDeterministicFastHashHex(v2MockSvgUrl).slice(0, 16)}`;
    const cachedSvgRec = await getLocalMediaRecord(svgCacheKey);
    assertCondition(
      topicV2Download.success &&
        Boolean(cachedSvgRec) &&
        loadMediaAssetsIndex().some((m) => m.id === 'media-v2-svg-1'),
      'Downloading a cloud topic must prefetch its linked media-index.json SVG asset into IndexedDB'
    );

    // Book user-state preservation across cloud/AI merge + UserStudyNote standalone export & Telegram backup
    await downloadCloudLibraryTarget({
      targetType: 'book',
      targetId: 'book-v2-ecg',
      currentTopics: topicV2Download.updatedTopics,
      currentTerms: topicV2Download.updatedTerms,
      currentSentences: topicV2Download.updatedSentences
    });
    toggleBookFavorite('book-v2-ecg');
    saveBookReadingProgress('book-v2-ecg', { lastReadPage: 42, readingProgressPercent: 68 });
    saveUserStudyNotes([
      {
        id: 'note-v2-1',
        entityType: 'topic',
        entityId: 'topic-v2-ecg',
        content: 'مراجعة مسار تفعيل الجلطة خلال 4.5 ساعات',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    // Trigger re-sync of v2 catalog and verify local book user progress wasn't clobbered when merged
    const mergedBookSnapshot = await downloadCloudLibraryTarget({
      targetType: 'book',
      targetId: 'book-v2-ecg',
      currentTopics: topicV2Download.updatedTopics,
      currentTerms: topicV2Download.updatedTerms,
      currentSentences: topicV2Download.updatedSentences
    });
    const localV2Book = loadAcademicBooks().find((b) => b.id === 'book-v2-ecg');
    assertCondition(
      mergedBookSnapshot.success &&
        localV2Book?.favorite === true &&
        localV2Book?.lastReadPage === 42 &&
        localV2Book?.readingProgressPercent === 68 &&
        loadUserStudyNotes().some((n) => n.id === 'note-v2-1'),
      'Cloud sync/download must strictly preserve book favorite, lastReadPage, readingProgressPercent, and userNotes'
    );

    const v2StandaloneHtml = await generateStandaloneHtmlDocument({
      scope: 'topic',
      topic: topicV2Download.updatedTopics.find((t) => t.id === 'topic-v2-ecg')!,
      allTopics: topicV2Download.updatedTopics,
      allTerms: topicV2Download.updatedTerms,
      allQuestions: [],
      books: loadAcademicBooks(),
      exams: loadAcademicExams(),
      mediaAssets: loadMediaAssetsIndex(),
      userNotes: loadUserStudyNotes(),
      includeLocalMedia: true
    });
    assertCondition(
      v2StandaloneHtml.htmlText.includes('ECG Lead Diagram') &&
        v2StandaloneHtml.htmlText.includes('مراجعة مسار تفعيل الجلطة'),
      'Standalone HTML export must embed linked media-index assets and userNotes for offline viewing'
    );

    // Telegram SHA-256 deduplicated media upload + backup rotation isolation
    const tgActions: Array<{ method: string; messageId?: number }> = [];
    let tgMsgCounter = 500;
    const mockTgFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/sendDocument')) {
        tgMsgCounter += 1;
        tgActions.push({ method: 'sendDocument', messageId: tgMsgCounter });
        return new Response(JSON.stringify({ ok: true, result: { message_id: tgMsgCounter } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/deleteMessage')) {
        const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
        tgActions.push({ method: 'deleteMessage', messageId: Number(parsedBody.message_id) });
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }) as typeof fetch;

    const tgCfgSaved = saveTelegramBackupConfig({
      enabled: true,
      botToken: '123456:TEST_TOKEN_SECRET_XYZ_999',
      chatId: '-100999888777',
      schedule: 'on_change',
      includeTopicsAndHierarchy: true,
      includeDictionaryAndTerms: true,
      includeQuizzesAndStats: true,
      includeMediaFilesOnSync: true,
      syncedMediaSha256Map: {},
      appBackupMessageIds: [111]
    });

    const sampleMediaMap = new Map([
      [
        svgCacheKey,
        {
          id: svgCacheKey,
          topicId: 'topic-ai-stroke',
          mediaType: 'image' as const,
          fileName: 'ecg_lead_map.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: v2MockSvgBody.length,
          dataUrl: `data:image/svg+xml;base64,${Buffer.from(v2MockSvgBody).toString('base64')}`,
          createdAt: new Date().toISOString()
        }
      ]
    ]);

    const firstMediaSync = await uploadPendingMediaToTelegramChannel(tgCfgSaved, {
      customFetch: mockTgFetch,
      mediaMapOverride: sampleMediaMap
    });
    const secondMediaSync = await uploadPendingMediaToTelegramChannel(loadTelegramBackupConfig(), {
      customFetch: mockTgFetch,
      mediaMapOverride: sampleMediaMap
    });
    const afterMediaCfg = loadTelegramBackupConfig();
    assertCondition(
      firstMediaSync.ok &&
        firstMediaSync.uploadedCount === 1 &&
        secondMediaSync.ok &&
        secondMediaSync.uploadedCount === 0 &&
        secondMediaSync.skippedDeduplicatedCount === 1 &&
        !afterMediaCfg.appBackupMessageIds?.includes(501),
      'Telegram media sync must deduplicate via SHA-256 and never add uploaded media message_id to appBackupMessageIds'
    );

    const backupSyncRes = await sendBackupToTelegram(
      afterMediaCfg,
      topicV2Download.updatedTerms,
      topicV2Download.updatedSentences,
      topicV2Download.updatedTopics,
      'اختبار الحفاظ على الوسائط',
      undefined,
      undefined,
      { customFetch: mockTgFetch }
    );
    assertCondition(
      backupSyncRes.ok &&
        Boolean(backupSyncRes.deletedPreviousMessageIds?.includes(111)) &&
        !tgActions.some((a) => a.method === 'deleteMessage' && a.messageId === 501),
      'Telegram JSON backup rotation must delete old JSON backup ID (111) while NEVER deleting channel media message ID (501)'
    );
  } finally {
    globalThis.fetch = originalFetchForV2;
  }

  console.log(
    '[PASS] 19. UMEDT-DATA v2 Auto-Discovery, Normalized Media/Books/Exams, Offline Note & Media Prefetch, User Progress Preservation, and SHA-256 Deduplicated Telegram Media Sync Verified'
  );

  // ==========================================================================
  // 20. UMEDT-DATA 13-File ZIP Assembly, Extended Atomic Import & User-Field
  //     Preservation, Media Kind Fallback, Canonical Hash Stability, Strict
  //     64-Hex SHA-256 Rejection & Affix/Abbreviation Cloud Propagation
  // ==========================================================================
  const umedt13ZipJsonMap: Record<string, unknown> = {
    'manifest.json': {
      dataVersion: '2026.12.9-umd',
      schemaVersion: DB_SCHEMA_VERSION,
      packageFormat: 'umedt-data-bundle-v2',
      createdAt: new Date().toISOString(),
      counts: { terms: 1, sentences: 1, topics: 1, customAffixes: 1, customAbbreviations: 1 }
    },
    'catalog.json': {
      catalogVersion: '2026.12.9-umd',
      collections: [{ id: 'blocks', name: 'Blocks', contentType: 'block', rawUrl: 'https://example.invalid/blocks.json' }]
    },
    'blocks.json': {
      items: [
        {
          id: 'blk-sec20',
          code: 'BLK-SEC20',
          titleEn: 'Cardiopulmonary Integration Block',
          titleAr: 'بلوك التكامل القلبي الرئوي',
          order: 10
        }
      ]
    },
    'subjects.json': {
      items: [
        {
          id: 'subj-sec20',
          blockId: 'blk-sec20',
          code: 'SUBJ-SEC20',
          titleEn: 'Pulmonary Physiology',
          titleAr: 'فسيولوجيا الرئة',
          order: 1
        }
      ]
    },
    'topics.json': {
      items: [
        {
          id: 'topic-sec20-v2',
          title: 'Ventilation-Perfusion Matching — مطابقة التهوية والتروية',
          titleEn: 'Ventilation-Perfusion Matching',
          titleAr: 'مطابقة التهوية والتروية',
          subtitle: 'اختبار التوافق الشامل',
          category: 'Medical',
          blockId: 'blk-sec20',
          subjectId: 'subj-sec20',
          author: 'UMEDT-DATA',
          publishedAt: '2026-12-01',
          readingTimeMinutes: 7,
          favorite: false,
          sections: [
            {
              id: 'sec-vq-1',
              heading: 'Zones of West',
              headingEn: 'Zones of West',
              headingAr: 'مناطق ويست الرئوية',
              paragraphs: ['Updated remote V/Q clinical explanation.'],
              contentBlocks: [
                {
                  id: 'cb-vq-1',
                  type: 'clinical_pearl',
                  order: 1,
                  titleEn: 'Zone 1 Dead Space',
                  titleAr: 'المنطقة الأولى الحيز الميت',
                  contentEn: 'PA > Pa > Pv in alveolar overdistension.'
                }
              ]
            }
          ]
        }
      ]
    },
    'terms.json': {
      items: [
        {
          id: 'term-sec20-1',
          term: 'Atelectasis',
          termNormalized: 'atelectasis',
          translation: 'انخماص الرئة',
          phonetic: '/ˌætɪˈlɛktəsɪs/',
          pos: 'Noun',
          category: 'Medical',
          specialty: 'Pulmonology',
          definitionAr: 'انهيار جزئي أو كلي للحويصلات الهوائية.',
          definitionEn: 'Complete or partial collapse of a lung or lobe.',
          keepEnglish: false,
          favorite: false,
          collections: ['Pulmonology'],
          ingestedAt: new Date().toISOString(),
          examples: [],
          relations: { synonyms: [], broader: [], related: [] }
        }
      ]
    },
    'sentences.json': {
      items: [
        {
          id: 'sent-sec20-1',
          termId: 'term-sec20-1',
          en: 'Postoperative atelectasis commonly causes early fever within 24 hours.',
          ar: 'يسبب انخماص الرئة بعد الجراحة حمى مبكرة خلال 24 ساعة.',
          specialty: 'Pulmonology'
        }
      ]
    },
    'affixes.json': {
      items: [
        {
          id: 'aff-sec20-ectasis',
          morpheme: '-ectasis',
          type: 'Suffix',
          origin: 'Greek',
          meaningAr: 'توسع أو تمدد',
          meaningEn: 'dilation or expansion',
          exampleTerm: 'Bronchiectasis',
          exampleTranslation: 'توسع القصبات',
          isCustom: true
        }
      ]
    },
    'abbreviations.json': {
      items: [
        {
          id: 'abbr-sec20-peep',
          abbr: 'PEEP',
          fullEn: 'Positive End-Expiratory Pressure',
          fullAr: 'الضغط الإيجابي في نهاية الزفير',
          specialty: 'Critical Care',
          notes: 'Recruits collapsed alveoli.',
          isCustom: true
        }
      ]
    },
    'books.json': {
      items: [
        {
          id: 'book-sec20-1',
          titleEn: 'Pulmonary Casebook',
          titleAr: 'مرجع أمراض الرئة السريري',
          blockId: 'blk-sec20',
          subjectId: 'subj-sec20',
          downloadUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/books/pulm.pdf',
          format: 'pdf'
        }
      ]
    },
    'questions.json': {
      items: [
        {
          id: 'q-sec20-1',
          stemEn: 'Which West zone exhibits PA > Pa > Pv?',
          questionAr: 'أي منطقة من مناطق ويست يكون فيها PA > Pa > Pv؟',
          options: [
            { key: 'A', textEn: 'Zone 1', textAr: 'المنطقة 1' },
            { key: 'B', textEn: 'Zone 3', textAr: 'المنطقة 3' }
          ],
          correctAnswer: 'A',
          explanationEn: 'Alveolar pressure exceeds arterial and venous pressures at the apex.'
        }
      ]
    },
    'exams.json': {
      items: [
        {
          id: 'exam-sec20-1',
          titleEn: 'Pulmonary V/Q Quiz',
          titleAr: 'اختبار تهوية الرئة',
          topicIds: ['topic-sec20-v2'],
          questionIds: ['q-sec20-1'],
          passingScorePercent: 75,
          durationMinutes: 10
        }
      ]
    },
    'media-index.json': {
      items: [
        {
          id: 'media-sec20-no-kind',
          titleEn: 'West Zones SVG',
          titleAr: 'مخطط مناطق ويست',
          mediaType: 'svg',
          url: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/diagrams/west-zones.svg',
          linkedEntityType: 'topic',
          linkedEntityId: 'topic-sec20-v2'
        }
      ]
    }
  };

  // 20.1 13-file ZIP assembly, serialization round-trip, & extended validation
  const assembled13 = assemblePackageFromZipJsonMap(umedt13ZipJsonMap);
  const validated13 = validateDataPackageObject(assembled13);
  assertCondition(
    validated13.valid &&
      validated13.payload !== undefined &&
      validated13.payload.blocks?.length === 1 &&
      validated13.payload.subjects?.length === 1 &&
      validated13.payload.books?.length === 1 &&
      validated13.payload.questions?.length === 1 &&
      validated13.payload.exams?.length === 1 &&
      validated13.payload.mediaAssets?.length === 1 &&
      validated13.payload.topics[0].blockId === 'blk-sec20' &&
      validated13.payload.topics[0].sections[0].contentBlocks?.length === 1,
    `Expected 13-file UMEDT-DATA ZIP assembly & validation to preserve all extended collections & topic contentBlocks`
  );

  const built13Zip = buildDataPackageZipBytes(validated13.payload!);
  assertCondition(
    built13Zip.byteLength > 500,
    'buildDataPackageZipBytes must serialize extended 13-file payloads'
  );

  // 20.2 normalizeMediaAssetRecord without .kind & canonicalizeForHash transient key filtering
  const normalizedNoKindMedia = normalizeMediaAssetRecord({
    id: 'media-sec20-no-kind',
    mediaType: 'svg',
    url: 'https://example.org/west.svg',
    linkedEntityType: 'topic',
    linkedEntityId: 'topic-sec20-v2'
  });
  assertCondition(
    normalizedNoKindMedia.kind === 'svg' &&
      normalizedNoKindMedia.topicId === 'topic-sec20-v2' &&
      normalizedNoKindMedia.titleEn.length > 0,
    `Expected normalizeMediaAssetRecord to backfill kind='svg' when .kind is omitted, got kind='${normalizedNoKindMedia.kind}'`
  );

  const hashCanonicalA = canonicalizeForHash('topic', {
    id: 't-hash-test',
    title: 'Sample',
    mediaIdbKey: 'idb-111',
    coverIdbKey: 'idb-cov-1',
    lastOpenedAt: '2026-01-01',
    srsData: { interval: 4 }
  });
  const hashCanonicalB = canonicalizeForHash('topic', {
    id: 't-hash-test',
    title: 'Sample',
    mediaIdbKey: 'idb-999',
    coverIdbKey: 'idb-cov-9',
    lastOpenedAt: '2026-12-31',
    srsData: { interval: 10 }
  });
  assertCondition(
    hashCanonicalA === hashCanonicalB,
    'canonicalizeForHash must strip mediaIdbKey, coverIdbKey, lastOpenedAt, and srsData so cached local offline keys never trigger false diffs'
  );

  // 20.3 Atomic import preserves user bookmarks, lastReadPage, readingProgressPercent, favorite, srsData
  saveAcademicBooks([
    {
      id: 'book-sec20-1',
      titleEn: 'Old Title',
      titleAr: 'عنوان قديم',
      favorite: true,
      bookmarks: [12, 44],
      lastReadPage: 44,
      readingProgressPercent: 88,
      notes: 'ملاحظتي المهمة',
      mediaIdbKey: 'idb-local-book-pdf',
      format: 'pdf'
    }
  ]);
  const atomic13Import = await executeAtomicPackageImport(built13Zip, {
    mode: 'merge',
    fileNameHint: 'umedt13-test.zip',
    skipAutoBackup: true
  });
  const bookAfterAtomic13 = loadAcademicBooks().find((b) => b.id === 'book-sec20-1');
  assertCondition(
    atomic13Import.result.success &&
      atomic13Import.result.summary.booksImported === 1 &&
      atomic13Import.result.summary.questionsImported === 1 &&
      atomic13Import.result.summary.examsImported === 1 &&
      atomic13Import.result.summary.mediaAssetsImported === 1 &&
      bookAfterAtomic13?.titleAr === 'مرجع أمراض الرئة السريري' &&
      bookAfterAtomic13?.favorite === true &&
      bookAfterAtomic13?.lastReadPage === 44 &&
      bookAfterAtomic13?.readingProgressPercent === 88 &&
      bookAfterAtomic13?.mediaIdbKey === 'idb-local-book-pdf' &&
      Boolean(bookAfterAtomic13?.bookmarks?.includes(12)),
    'executeAtomicPackageImport must import all extended collections while preserving existing user favorite, bookmarks, lastReadPage, readingProgressPercent, and mediaIdbKey'
  );

  // 20.4 Strict 64-hex SHA-256 rejection + affix/abbreviation propagation via syncWithRemoteCloudLibrary
  const validBlocksJsonStr = JSON.stringify(umedt13ZipJsonMap['blocks.json']);
  const validBlocksSha256 = await computeSha256Hex(new TextEncoder().encode(validBlocksJsonStr));
  const corruptExpectedSha256 = '0'.repeat(64);
  const sec20OrigFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = typeof input === 'string' ? input : input.toString();
    if (u.includes('catalog.json')) {
      return new Response(
        JSON.stringify({
          catalogVersion: '2026.12.10-sec20',
          collections: [
            {
              id: 'blocks',
              name: 'Blocks Corrupt Test',
              contentType: 'block',
              rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/blocks.json',
              sha256: corruptExpectedSha256
            },
            {
              id: 'affixes',
              name: 'Affixes',
              contentType: 'affix',
              rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/affixes.json',
              sha256: await computeSha256Hex(
                new TextEncoder().encode(JSON.stringify(umedt13ZipJsonMap['affixes.json']))
              )
            },
            {
              id: 'abbreviations',
              name: 'Abbreviations',
              contentType: 'abbreviation',
              rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/abbreviations.json',
              sha256: await computeSha256Hex(
                new TextEncoder().encode(JSON.stringify(umedt13ZipJsonMap['abbreviations.json']))
              )
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (u.endsWith('/blocks.json')) {
      assertCondition(validBlocksSha256.length === 64, 'Valid blocks hash computed');
      return new Response(validBlocksJsonStr, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.endsWith('/affixes.json')) {
      return new Response(JSON.stringify(umedt13ZipJsonMap['affixes.json']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.endsWith('/abbreviations.json')) {
      return new Response(JSON.stringify(umedt13ZipJsonMap['abbreviations.json']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    const corruptCheck = await syncFromUmedtDataRepository({ currentCollectionHashes: {} });
    assertCondition(
      corruptCheck.fetched &&
        corruptCheck.incoming.blocks === undefined &&
        corruptCheck.incoming.customAffixes?.length === 1 &&
        corruptCheck.incoming.customAbbreviations?.length === 1,
      'syncFromUmedtDataRepository must reject payload on 64-hex SHA-256 mismatch while accepting verified affixes & abbreviations'
    );

    saveCustomAffixes([]);
    saveCustomAbbreviations([]);
    const cloudSyncPropagated = await syncWithRemoteCloudLibrary({
      localTopics: loadAppState().topics,
      localTerms: loadAppState().terms,
      localSentences: loadAppState().sentences
    });
    assertCondition(
      cloudSyncPropagated.newUpdatesApplied === 0 &&
        Boolean(
          cloudSyncPropagated.mirror.customAffixes?.some((a) => a.id === 'aff-sec20-ectasis')
        ) &&
        Boolean(
          cloudSyncPropagated.mirror.customAbbreviations?.some(
            (ab) => ab.id === 'abbr-sec20-peep'
          )
        ) &&
        !cloudSyncPropagated.autoMergedAffixes?.some((a) => a.id === 'aff-sec20-ectasis') &&
        !cloudSyncPropagated.autoMergedAbbreviations?.some(
          (ab) => ab.id === 'abbr-sec20-peep'
        ),
      'syncWithRemoteCloudLibrary must index affixes/abbreviations into mirror WITHOUT auto-downloading them into local state'
    );

    const dictDownloadRes = await downloadCloudLibraryTarget({
      targetType: 'dictionary',
      targetId: 'all',
      currentTopics: loadAppState().topics,
      currentTerms: loadAppState().terms,
      currentSentences: loadAppState().sentences
    });
    assertCondition(
      dictDownloadRes.success &&
        Boolean(dictDownloadRes.updatedAffixes?.some((a) => a.id === 'aff-sec20-ectasis')) &&
        Boolean(
          dictDownloadRes.updatedAbbreviations?.some((ab) => ab.id === 'abbr-sec20-peep')
        ),
      'Explicit downloadCloudLibraryTarget(dictionary) must download cloud affixes and abbreviations on click'
    );
  } finally {
    globalThis.fetch = sec20OrigFetch;
  }

  console.log(
    '[PASS] 20. UMEDT-DATA 13-File ZIP Assembly, Extended Atomic Import, Media Kind Fallback, Canonical Hash Stability, Strict 64-Hex SHA-256 Rejection & Affix/Abbreviation Sync Verified'
  );

  // ============================================================================
  // 21. Media & External Link Integrity (topic-blood-pressure-2026-01 & Live Data)
  // ============================================================================
  // 21.1 MIME normalization for human-readable labels and extensions
  assertCondition(
    normalizeMediaMimeType('TEXT / STUDY SHEET', 'Blood_Pressure_Quick_Review.txt', 'BP...') ===
      'text/plain' &&
      normalizeMediaMimeType('', 'diagram.svg', '') === 'image/svg+xml' &&
      normalizeMediaMimeType(undefined, undefined, 'data:image/svg+xml;charset=utf-8,%3Csvg%3E') ===
        'image/svg+xml',
    'normalizeMediaMimeType must map display labels and SVG data URLs to canonical MIME types'
  );

  // 21.2 detectExternalMediaKind + isDownloadableMediaUrl accuracy
  const whoMeta = detectExternalMediaKind('https://www.who.int/news-room/fact-sheets/detail/hypertension');
  const ytMeta = detectExternalMediaKind('https://www.youtube.com/watch?v=TLiD3vh_X8o');
  const ahaAudioHtmlMeta = detectExternalMediaKind(
    'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home'
  );
  const cdcJpgMeta = detectExternalMediaKind('https://www.cdc.gov/dpdx/ascariasis/modules/Ascaris_LifeCycle.jpg');
  const githubSvgMeta = detectExternalMediaKind('https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/bp-diagram.svg');
  assertCondition(
    whoMeta.kind === 'link' &&
      whoMeta.mimeType === 'text/html' &&
      !isDownloadableMediaUrl('https://www.who.int/news-room/fact-sheets/detail/hypertension') &&
      ytMeta.kind === 'video_embed' &&
      Boolean(ytMeta.embedUrl?.includes('youtube.com/embed/TLiD3vh_X8o')) &&
      !isDownloadableMediaUrl('https://www.youtube.com/watch?v=TLiD3vh_X8o') &&
      ahaAudioHtmlMeta.kind === 'link' &&
      !isDownloadableMediaUrl('https://www.heart.org/en/health-topics/high-blood-pressure') &&
      cdcJpgMeta.kind === 'image' &&
      isDownloadableMediaUrl('https://www.cdc.gov/dpdx/ascariasis/modules/Ascaris_LifeCycle.jpg') &&
      githubSvgMeta.kind === 'image' &&
      isDownloadableMediaUrl('https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/bp-diagram.svg'),
    'Media kind & downloadability classifier must distinguish YouTube embeds & HTML pages from downloadable images/audio/PDFs'
  );

  // 21.3 downloadRemoteMediaToOfflineCache must reject HTML web pages and text/html HTTP responses
  const rejectedWebpageRes = await downloadRemoteMediaToOfflineCache({
    remoteUrl: 'https://www.who.int/news-room/fact-sheets/detail/hypertension',
    topicId: 'topic-blood-pressure-2026-01',
    blockId: 'bp-link-who'
  });
  assertCondition(
    !rejectedWebpageRes.success && rejectedWebpageRes.errorAr === 'NON_DOWNLOADABLE_WEBPAGE',
    'downloadRemoteMediaToOfflineCache must reject non-downloadable webpage URLs up front'
  );

  const rejectedHtmlHeaderRes = await downloadRemoteMediaToOfflineCache({
    remoteUrl: 'https://example.com/resource.mp4',
    customFetch: async () =>
      new Response('<!DOCTYPE html><html><body>Webpage</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
  });
  assertCondition(
    !rejectedHtmlHeaderRes.success && rejectedHtmlHeaderRes.errorAr === 'HTML_RESPONSE_REJECTED',
    'downloadRemoteMediaToOfflineCache must reject HTTP text/html responses'
  );

  // 21.4 buildContextualContentBlocksForTopic preserves externalUrl/mediaIdbKey & avoids video misclassification
  const bpBuiltSections = buildContextualContentBlocksForTopic({
    id: 'topic-blood-pressure-2026-01',
    title: 'Blood Pressure',
    subtitle: 'Hypertension',
    category: 'Medical',
    author: 'UMEDT',
    publishedAt: '2026-11-17',
    readingTimeMinutes: 10,
    favorite: false,
    sections: [
      {
        id: 'sec-bp-1',
        heading: 'BP Physiology — فيزيولوجيا ضغط الدم',
        paragraphs: ['Mean arterial pressure = DBP + 1/3 PP.']
      }
    ],
    images: [
      {
        id: 'img-bp-01',
        url: 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E',
        externalUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/bp-01.svg',
        mediaIdbKey: 'idb-bp-01',
        fileName: 'bp-01.svg',
        mimeType: 'image/svg+xml',
        caption: 'BP Classification'
      }
    ],
    links: [
      {
        id: 'lnk-who',
        title: 'WHO Fact Sheet',
        url: 'https://www.who.int/news-room/fact-sheets/detail/hypertension'
      },
      {
        id: 'lnk-mp3',
        title: 'Korotkoff Sounds Audio',
        url: 'https://cdn.example.org/korotkoff.mp3',
        mediaType: 'audio'
      }
    ],
    attachments: [
      {
        id: 'att-bp-txt',
        fileName: 'Blood_Pressure_Quick_Review.txt',
        fileType: 'TEXT / STUDY SHEET',
        fileSizeLabel: '~1 KB',
        contentDataUrlOrText: 'Normal BP <120/<80 mmHg'
      }
    ]
  });
  const bpBlocks = bpBuiltSections[0]?.contentBlocks || [];
  const bpImgBlk = bpBlocks.find((b) => b.id.includes('img-bp-01'));
  const bpWhoBlk = bpBlocks.find((b) => b.id.includes('lnk-who'));
  const bpAudioBlk = bpBlocks.find((b) => b.id.includes('lnk-mp3'));
  const bpAttBlk = bpBlocks.find((b) => b.id.includes('att-bp-txt'));
  assertCondition(
    bpImgBlk?.externalUrl === 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/bp-01.svg' &&
      bpImgBlk?.mediaIdbKey === 'idb-bp-01' &&
      bpWhoBlk?.mediaMimeType === 'text/html' &&
      bpAudioBlk?.type === 'audio' &&
      bpAttBlk?.mediaMimeType === 'text/plain' &&
      bpAttBlk?.titleAr === 'TEXT / STUDY SHEET',
    'buildContextualContentBlocksForTopic must preserve externalUrl/mediaIdbKey, detect audio links, and normalize attachment MIME types'
  );

  // 21.5 Structural guards on TopicContentBlockEditor.tsx, MainActivity.java, and remote-fetch allowlist
  const editorSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/TopicContentBlockEditor.tsx'),
    'utf8'
  );
  const mainActivitySrc = fs.readFileSync(
    path.join(process.cwd(), 'android/app/src/main/java/org/umed2/dictengine/MainActivity.java'),
    'utf8'
  );
  const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  assertCondition(
    !editorSrc.includes("target.style.display = 'none'") &&
      editorSrc.includes('failedBlockImages') &&
      editorSrc.includes('inlineTextModal') &&
      editorSrc.includes('isDownloadableMediaUrl') &&
      mainActivitySrc.includes('isWebUrl') &&
      mainActivitySrc.includes('MIXED_CONTENT_COMPATIBILITY_MODE') &&
      serverSrc.includes('www.cdc.gov'),
    'UI fallback, text preview modal, Android HTTP Intent guard, and CDC remote-fetch allowlist must be active'
  );

  console.log(
    '[PASS] 21. Blood Pressure & Parasitology Media Classification, HTML Polluted Cache Prevention, Inline Text Preview & Android Intent Guards Verified'
  );

  // ============================================================================
  // 22. Telegram Single-File Backup Modes, Instant Change Notes, Direct Restore/Merge (.json & .zip) & Interactive File Sharing
  // ============================================================================
  {
    const tgToken22 = '987654321:AAFakeTelegramBotTokenSection22Verify';
    const tgChat22 = '-100777888999';
    const testBlocks = loadMedicalBlocks();
    const testSubjects = loadMedicalSubjects();
    const existingTopics = loadAppState().topics || [];
    const existingTerms = loadAppState().terms || [];
    const existingSentences = loadAppState().sentences || [];

    // Ensure at least one local media record exists to verify single_complete_file skips separate uploads
    const mediaKey22 = `sec22-local-img-${Date.now()}`;
    await saveLocalMediaRecord({
      id: mediaKey22,
      mediaType: 'image',
      fileName: 'sec22-cardiac-diagram.png',
      mimeType: 'image/png',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      sizeBytes: 96,
      createdAt: new Date().toISOString()
    });

    const sec22NoteId = `note-sec22-${Date.now()}`;
    const sec22NowIso = new Date().toISOString();
    saveUserStudyNotes([
      ...loadUserStudyNotes(),
      {
        id: sec22NoteId,
        entityType: 'topic',
        entityId: 'topic-sec22-sync',
        title: 'My Preserved Study Note',
        content: 'Keep this personal note during Telegram restore merge',
        createdAt: sec22NowIso,
        updatedAt: sec22NowIso
      }
    ]);

    const sec22AttemptId = `attempt-sec22-${Date.now()}`;
    saveQuizAttempt({
      id: sec22AttemptId,
      title: 'Section 22 ACS Check',
      scopeType: 'topic',
      blockId: testBlocks[0]?.id || 'block-cardiology',
      subjectId: testSubjects[0]?.id || 'subj-cardiology',
      topicIds: ['topic-sec22-sync'],
      completedAt: sec22NowIso,
      mode: 'instant',
      totalQuestions: 2,
      correctCount: 2,
      wrongCount: 0,
      scorePercent: 100,
      durationSeconds: 35,
      questionIds: ['q-sec22-01'],
      answers: [
        {
          questionId: 'q-sec22-01',
          selectedKeys: ['B'],
          isCorrect: true
        }
      ]
    });

    const sec22Topic: TopicArticle = {
      id: 'topic-sec22-sync',
      title: 'Acute Coronary Syndrome Protocol',
      titleAr: 'بروتوكول المتلازمة التاجية الحادة',
      subtitle: 'Emergency Cardiology & Troponin Workflow',
      author: 'UMEDT Medical Editorial',
      publishedAt: '2026-11-17',
      readingTimeMinutes: 8,
      category: 'Medical',
      blockId: testBlocks[0]?.id || 'block-cardiology',
      subjectId: testSubjects[0]?.id || 'subj-cardiology',
      favorite: true,
      sections: [
        {
          id: 'sec-22-initial-assessment',
          heading: 'Initial Assessment',
          headingAr: 'التقييم الأولي',
          paragraphs: ['Obtain 12-lead ECG within 10 minutes and check serial troponin.']
        }
      ],
      images: [
        {
          id: 'img-sec22',
          url: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`,
          mediaIdbKey: mediaKey22,
          caption: '12-Lead ECG Diagram'
        }
      ],
      links: [
        {
          id: 'lnk-sec22',
          title: 'AHA ACS Guideline',
          url: 'https://www.heart.org/acs-guideline.pdf'
        }
      ],
      attachments: []
    };

    const topicsWithSec22 = [
      ...existingTopics.filter((t) => t.id !== sec22Topic.id),
      sec22Topic
    ];
    saveTopics(topicsWithSec22);

    const apiLog22: Array<{ endpoint: string; fileName?: string; text?: string }> = [];
    let nextMsgId22 = 8100;
    const uploadedPayloads22 = new Map<string, { fileName: string; bytes: Uint8Array }>();

    saveTelegramBackupConfig({
      enabled: true,
      botToken: tgToken22,
      chatId: tgChat22,
      schedule: '6h',
      backupMode: 'single_complete_file',
      backupFileFormat: 'json',
      sendInstantChangeNotes: true,
      includeTopicsAndHierarchy: true,
      includeDictionaryAndTerms: true,
      includeQuizzesAndStats: true,
      includeMediaFilesOnSync: false,
      appBackupMessageIds: []
    });

    const origFetch22 = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('api.telegram.org/file/bot')) {
        const match = urlStr.split('/').pop() || '';
        const stored = uploadedPayloads22.get(match);
        if (!stored) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response(
          stored.bytes.buffer.slice(
            stored.bytes.byteOffset,
            stored.bytes.byteOffset + stored.bytes.byteLength
          ) as ArrayBuffer,
          { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }
        );
      }
      if (urlStr.includes('api.telegram.org/bot')) {
        if (urlStr.endsWith('/sendDocument')) {
          let docName = 'unknown';
          let docBytes = new Uint8Array();
          if (init?.body instanceof FormData) {
            const docEntry = init.body.get('document');
            if (docEntry && typeof (docEntry as Blob).arrayBuffer === 'function') {
              docName = (docEntry as File).name || 'backup.json';
              docBytes = new Uint8Array(await (docEntry as Blob).arrayBuffer());
            }
          }
          const msgId = nextMsgId22++;
          const fileId = `fid-${msgId}`;
          uploadedPayloads22.set(fileId, { fileName: docName, bytes: docBytes });
          apiLog22.push({ endpoint: 'sendDocument', fileName: docName });
          return new Response(
            JSON.stringify({
              ok: true,
              result: {
                message_id: msgId,
                document: { file_id: fileId, file_name: docName }
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.endsWith('/sendMessage')) {
          const bodyObj = init?.body ? JSON.parse(String(init.body)) : {};
          apiLog22.push({ endpoint: 'sendMessage', text: String(bodyObj.text || '') });
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: nextMsgId22++ } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.endsWith('/deleteMessage')) {
          apiLog22.push({ endpoint: 'deleteMessage' });
          return new Response(JSON.stringify({ ok: true, result: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (urlStr.includes('/getUpdates')) {
          apiLog22.push({ endpoint: 'getUpdates' });
          const cfgNow = loadTelegramBackupConfig();
          const fid = cfgNow.lastBackupFileId || '';
          const fname = cfgNow.lastBackupFileName || '';
          return new Response(
            JSON.stringify({
              ok: true,
              result: fid
                ? [
                    {
                      update_id: 901,
                      channel_post: {
                        message_id: cfgNow.lastBackupMessageId || 8100,
                        chat: { id: tgChat22 },
                        document: { file_id: fid, file_name: fname }
                      }
                    }
                  ]
                : []
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/getFile')) {
          apiLog22.push({ endpoint: 'getFile' });
          const parsedUrl = new URL(urlStr);
          const fid = parsedUrl.searchParams.get('file_id') || '';
          return new Response(
            JSON.stringify({ ok: true, result: { file_id: fid, file_path: fid } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      return origFetch22(input, init);
    };

    try {
      // 22.1 single_complete_file mode sends strictly ONE comprehensive JSON document (no separate media uploads, no binary payloads)
      const cfgSingle = loadTelegramBackupConfig();
      const singleRes = await sendBackupToTelegram(
        cfgSingle,
        existingTerms,
        existingSentences,
        topicsWithSec22,
        'نسخة شاملة موحدة (ملف واحد)'
      );
      const sendDocsAfterSingle = apiLog22.filter((c) => c.endpoint === 'sendDocument');
      assertCondition(
        singleRes.ok &&
          sendDocsAfterSingle.length === 1 &&
          sendDocsAfterSingle[0].fileName?.endsWith('.json') === true &&
          singleRes.mediaSyncResult === undefined,
        'single_complete_file mode must upload strictly 1 JSON backup document without separate media uploads'
      );
      const uploadedJsonBytes = uploadedPayloads22.get(
        loadTelegramBackupConfig().lastBackupFileId || ''
      )?.bytes;
      const uploadedJsonText = uploadedJsonBytes
        ? new TextDecoder().decode(uploadedJsonBytes)
        : '';
      assertCondition(
        !uploadedJsonText.includes('data:image/png;base64') &&
          uploadedJsonText.includes('https://www.heart.org/acs-guideline.pdf') &&
          uploadedJsonText.includes(`idb://${mediaKey22}`) &&
          uploadedJsonText.includes(sec22NoteId) &&
          uploadedJsonText.includes(sec22AttemptId),
        'Single backup file must strip binary payloads while keeping media URLs/refs, userNotes, and quizAttempts'
      );

      // 22.2 Instant Change Notes batch add/update/delete into a single Telegram sendMessage without touching appBackupMessageIds
      const backupIdsBeforeNotes = [...(loadTelegramBackupConfig().appBackupMessageIds || [])];
      scheduleDebouncedTelegramChangeNote({
        action: 'add',
        label: 'إضافة موضوع: Acute Coronary Syndrome',
        terms: existingTerms,
        sentences: existingSentences,
        topics: topicsWithSec22,
        debounceMs: 5000
      });
      scheduleDebouncedTelegramChangeNote({
        action: 'update',
        label: 'تحديث مادة: Cardiology',
        terms: existingTerms,
        sentences: existingSentences,
        topics: topicsWithSec22,
        debounceMs: 5000
      });
      scheduleDebouncedTelegramChangeNote({
        action: 'delete',
        label: 'حذف سؤال قديم من بنك الأسئلة',
        terms: existingTerms,
        sentences: existingSentences,
        topics: topicsWithSec22,
        debounceMs: 5000
      });
      const noteFlush = await flushPendingTelegramChangeNotes();
      const sentMsgs = apiLog22.filter((c) => c.endpoint === 'sendMessage');
      const backupIdsAfterNotes = loadTelegramBackupConfig().appBackupMessageIds || [];
      assertCondition(
        noteFlush.ok &&
          noteFlush.sentCount === 3 &&
          sentMsgs.length === 1 &&
          Boolean(sentMsgs[0].text?.includes('إضافة')) &&
          Boolean(sentMsgs[0].text?.includes('تحديث')) &&
          Boolean(sentMsgs[0].text?.includes('حذف')) &&
          JSON.stringify(backupIdsBeforeNotes) === JSON.stringify(backupIdsAfterNotes),
        'Instant change notes must batch add/update/delete into one sendMessage and leave appBackupMessageIds untouched'
      );

      // 22.3 Direct In-App Restore/Merge from Telegram (.json backup) preserves user progress & notes
      const fetchedJsonBackup = await fetchLatestBackupPayloadFromTelegram(
        loadTelegramBackupConfig()
      );
      assertCondition(
        fetchedJsonBackup.ok &&
          fetchedJsonBackup.format === 'json' &&
          Boolean(fetchedJsonBackup.bytes && fetchedJsonBackup.bytes.byteLength > 20),
        'fetchLatestBackupPayloadFromTelegram must download the latest JSON backup from Telegram'
      );
      const mergeJsonRes = await executeAtomicPackageImport(fetchedJsonBackup.bytes!, {
        mode: 'merge'
      });
      const mergedTopicsAfterJson = loadAppState().topics || [];
      const restoredSec22Topic = mergedTopicsAfterJson.find((t) => t.id === sec22Topic.id);
      const restoredNotesAfterJson = loadUserStudyNotes();
      const restoredAttemptsAfterJson = loadQuizAttempts();
      assertCondition(
        mergeJsonRes.result.success &&
          Boolean(restoredSec22Topic) &&
          restoredSec22Topic?.favorite === true &&
          restoredNotesAfterJson.some((n) => n.id === sec22NoteId) &&
          restoredAttemptsAfterJson.some((a) => a.id === sec22AttemptId),
        'Two-way Telegram JSON restore/merge must restore topics, notes, and quizAttempts while preserving favorite state'
      );

      // 22.4 ZIP Scheduled Backup & Direct In-App Restore/Merge (.zip backup)
      saveTelegramBackupConfig({
        ...loadTelegramBackupConfig(),
        backupFileFormat: 'zip',
        backupMode: 'notes_and_scheduled_full'
      });
      const zipBackupRes = await sendBackupToTelegram(
        loadTelegramBackupConfig(),
        existingTerms,
        existingSentences,
        topicsWithSec22,
        'نسخة دورية مجدولة (ZIP)'
      );
      const zipFileName = loadTelegramBackupConfig().lastBackupFileName || '';
      assertCondition(
        zipBackupRes.ok && zipFileName.endsWith('.zip'),
        'Telegram backup with backupFileFormat=zip must upload a .zip backup archive'
      );
      const fetchedZipBackup = await fetchLatestBackupPayloadFromTelegram(
        loadTelegramBackupConfig()
      );
      assertCondition(
        fetchedZipBackup.ok &&
          fetchedZipBackup.format === 'zip' &&
          Boolean(fetchedZipBackup.bytes && fetchedZipBackup.bytes.byteLength > 50),
        'fetchLatestBackupPayloadFromTelegram must retrieve .zip periodic backups from Telegram'
      );
      const mergeZipRes = await executeAtomicPackageImport(fetchedZipBackup.bytes!, {
        mode: 'merge'
      });
      assertCondition(
        mergeZipRes.result.success &&
          (loadAppState().topics || []).some((t) => t.id === sec22Topic.id),
        'Importing/merging downloaded Telegram .zip backup must succeed atomically'
      );

      // 22.5 with_separate_media mode uploads BOTH backup and separate local media file
      const docsBeforeSeparateMedia = apiLog22.filter((c) => c.endpoint === 'sendDocument').length;
      saveTelegramBackupConfig({
        ...loadTelegramBackupConfig(),
        backupFileFormat: 'json',
        backupMode: 'with_separate_media'
      });
      const sepMediaRes = await sendBackupToTelegram(
        loadTelegramBackupConfig(),
        existingTerms,
        existingSentences,
        topicsWithSec22,
        'نسخة مع الوسائط المنفصلة'
      );
      const docsAfterSeparateMedia = apiLog22.filter((c) => c.endpoint === 'sendDocument').length;
      assertCondition(
        sepMediaRes.ok &&
          Boolean(sepMediaRes.mediaSyncResult) &&
          docsAfterSeparateMedia >= docsBeforeSeparateMedia + 1,
        'with_separate_media mode must trigger separate media sync alongside the main backup'
      );

      // 22.6 Direct Sharing of Standalone Interactive Exam HTML & ZIP to Telegram without affecting appBackupMessageIds
      const sampleQuestions22 = loadQuizQuestions(topicsWithSec22, existingTerms).slice(0, 3);
      const examHtml = generateStandaloneExamHtmlDocument({
        titleAr: 'اختبار القلبية التفاعلي',
        titleEn: 'Interactive Cardiology Exam',
        questions: sampleQuestions22,
        durationMinutes: 15,
        passingScorePercent: 60
      });
      const examZip = generateStandaloneExamZipArchiveBytes({
        titleAr: 'اختبار القلبية التفاعلي',
        titleEn: 'Interactive Cardiology Exam',
        questions: sampleQuestions22,
        durationMinutes: 15,
        passingScorePercent: 60
      });
      const examZipEntries = inspectZipEntriesList(examZip.zipBytes);
      assertCondition(
        examHtml.htmlString.includes('<!DOCTYPE html>') &&
          examHtml.htmlString.includes('gradeAllExam') &&
          examHtml.htmlString.includes('selectOpt') &&
          examZipEntries.includes('index.html') &&
          examZipEntries.includes('package-data.json'),
        'Standalone exam HTML and ZIP generator must produce self-contained interactive exam bundles'
      );

      const backupIdsBeforeShare = [...(loadTelegramBackupConfig().appBackupMessageIds || [])];
      const shareHtmlRes = await sendInteractiveFileToTelegram({
        config: loadTelegramBackupConfig(),
        fileName: 'UMEDT-Cardio-Exam.html',
        content: examHtml.htmlString,
        mimeType: 'text/html',
        titleAr: 'اختبار القلبية التفاعلي',
        scopeLabel: 'اختبار تفاعلي مستقل (HTML)',
        recordsCount: sampleQuestions22.length
      });
      const shareZipRes = await sendInteractiveFileToTelegram({
        config: loadTelegramBackupConfig(),
        fileName: 'UMEDT-Cardio-Exam.zip',
        content: examZip.zipBytes,
        mimeType: 'application/zip',
        titleAr: 'اختبار القلبية التفاعلي (ZIP)',
        scopeLabel: 'اختبار تفاعلي (ZIP)',
        recordsCount: sampleQuestions22.length
      });
      const backupIdsAfterShare = loadTelegramBackupConfig().appBackupMessageIds || [];
      assertCondition(
        shareHtmlRes.ok &&
          shareZipRes.ok &&
          JSON.stringify(backupIdsBeforeShare) === JSON.stringify(backupIdsAfterShare),
        'Sharing interactive HTML/ZIP files directly to Telegram must succeed without modifying appBackupMessageIds'
      );
    } finally {
      globalThis.fetch = origFetch22;
    }

    console.log(
      '[PASS] 22. Telegram Single-File Modes, Instant Change Notes, Direct Restore/Merge (.json & .zip) & Interactive File Sharing Verified'
    );
  }

  // =========================================================================
  // 23. Universal Data Reader (High-Density ||, Markdown Tables, Loose JSON,
  //     AI ZIP), Interactive Prompt Configurator & Permanent App+Cloud Deletion
  // =========================================================================
  {
    clearPermanentlyDeletedRegistry();

    // 23.1 High-Density Pipe Stream (BLOCK ||, SUBJECT ||, TOPIC ||, TERM ||, SENTENCE ||, QUESTION ||, AFFIX ||, ABBR ||)
    const hdStreamText = [
      'BLOCK || BLK-NEURO || Nervous System Block || بلوك الجهاز العصبي || دراسة التشريح والفسيولوجيا العصبية',
      'SUBJECT || BLK-NEURO || NEURO-101 || Clinical Neurology || طب الأعصاب السريري || الأمراض العصبية والوعائية الدماغية',
      'TOPIC || block-blk-neuro || subj-neuro-101 || Ischemic Stroke || السكتة الدماغية الإقفارية || Acute ischemic stroke requires rapid neuroimaging ;; IV thrombolysis with alteplase or tenecteplase within 4.5 hours',
      'TERM || Hemiparesis || خزل نصفي || noun || Medical || ضعف عضلي يصيب أحد نصفي الجسم نتيجة إصابة دماغية. || Unilateral motor weakness affecting one side of the body. || Right-sided hemiparesis is a classic sign of left MCA stroke. || يُعد الخزل النصفي الأيمن علامة كلاسيكية لاحتشاء الشريان الدماغي الأوسط الأيسر.',
      'SENTENCE || Non-contrast head CT is the initial imaging modality in suspected acute stroke. || التصوير المقطعي دون تباين هو الفحص الأولي عند الاشتباه بالسكتة الدماغية الحادة. || Medical',
      'QUESTION || single_choice || Which artery is most commonly occluded in classic embolic ischemic stroke? || ما هو الشريان الأكثر انسداداً في السكتة الإقفارية الصمية؟ || A) Middle Cerebral Artery (MCA); B) Basilar Artery; C) Anterior Spinal Artery || A || الشريان الدماغي الأوسط هو الأكثر إصابة. || The MCA is the largest branch of the internal carotid artery.',
      'AFFIX || neur || root || عصب || nerve || neuropathy; neuritis',
      'ABBR || TIA || Transient Ischemic Attack || نوبة إقفارية عابرة || Neurology'
    ].join('\n');

    const hdReport = importUniversalAiOrLocalContent({
      rawText: hdStreamText,
      allowHierarchyCreation: true,
      sourceLabel: 'اختبار النص عالي الكثافة'
    });
    assertCondition(
      hdReport.success &&
        hdReport.counts.blocks === 1 &&
        hdReport.counts.subjects === 1 &&
        hdReport.counts.topics === 1 &&
        hdReport.counts.terms === 1 &&
        hdReport.counts.sentences >= 1 &&
        hdReport.counts.questions === 1 &&
        hdReport.counts.affixes === 1 &&
        hdReport.counts.abbreviations === 1,
      `Expected High-Density stream to import 1 block, 1 subject, 1 topic, 1 term, >=1 sentence, 1 question, 1 affix, 1 abbr; got ${JSON.stringify(hdReport.counts)}`
    );

    // 23.2 Markdown Hierarchy (# Block: / ## Subject: / ### Topic:) + Markdown Table (| Term | Translation | ... |)
    const mdText = [
      '# Block: Respiratory Block | بلوك الجهاز التنفسي',
      '## Subject: Pulmonology | أمراض الرئة',
      '### Topic: Bronchial Asthma | الربو القصبي',
      'Bronchial asthma is characterized by reversible airway obstruction, bronchial hyperresponsiveness, and chronic eosinophilic inflammation.',
      '| Term | Translation | Definition Ar | Definition En | Example En | Example Ar |',
      '|---|---|---|---|---|---|',
      '| Bronchospasm | تشنج قصبي | انقباض حاد في العضلات الملساء للقصبات الهوائية. | Acute constriction of bronchial smooth muscle. | Inhaled salbutamol rapidly relieves acute bronchospasm. | يخفف السالبوتامول المستنشق التشنج القصبي الحاد بسرعة. |'
    ].join('\n');

    const mdReport = importUniversalAiOrLocalContent({
      rawText: mdText,
      allowHierarchyCreation: true,
      sourceLabel: 'اختبار Markdown'
    });
    assertCondition(
      mdReport.success &&
        mdReport.counts.blocks === 1 &&
        mdReport.counts.subjects === 1 &&
        mdReport.counts.topics === 1 &&
        mdReport.counts.terms === 1,
      `Expected Markdown hierarchy & table import to succeed, got ${JSON.stringify(mdReport.counts)}`
    );

    // 23.3 Loose AI JSON with trailing commas & nested hierarchy (Block -> Subjects -> Topics -> Terms)
    const looseNestedJson = `\`\`\`json
{
  "blocks": [
    {
      "id": "block-renal-nested",
      "code": "BLK-RENAL",
      "titleEn": "Renal & Urinary Block",
      "titleAr": "بلوك الكلى والمسالك",
      "subjects": [
        {
          "id": "subj-nephro-nested",
          "code": "REN-101",
          "titleEn": "Clinical Nephrology",
          "titleAr": "أمراض الكلى السريرية",
          "topics": [
            {
              "id": "tp-aki-nested",
              "titleEn": "Acute Kidney Injury",
              "titleAr": "القصور الكلوي الحاد",
              "content": "Prerenal, intrinsic, and postrenal causes of acute kidney injury.",
              "terms": [
                {
                  "id": "term-oliguria-nested",
                  "term": "Oliguria",
                  "translation": "قلة البول",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
\`\`\``;

    const nestedReport = importUniversalAiOrLocalContent({
      rawText: looseNestedJson,
      allowHierarchyCreation: true,
      sourceLabel: 'اختبار JSON المتداخل والفواصل الزائدة'
    });
    assertCondition(
      nestedReport.success &&
        nestedReport.counts.blocks === 1 &&
        nestedReport.counts.subjects === 1 &&
        nestedReport.counts.topics === 1 &&
        nestedReport.counts.terms === 1,
      `Expected loose nested JSON import to extract block, subject, topic, and term; got ${JSON.stringify(nestedReport.counts)}`
    );

    // 23.4 Universal AI ZIP Archive without manifest.json
    const rawAiZipBytes = buildSimpleStoreZipBytes({
      'terms.json': JSON.stringify([
        {
          id: 'term-azotemia-zip',
          term: 'Azotemia',
          translation: 'ارتفاع نيتروجين الدم',
          definitionAr: 'ارتفاع مركبات النيتروجين مثل اليوريا والكرياتينين في الدم.'
        }
      ]),
      'notes.txt':
        'SENTENCE || Prerenal azotemia responds to intravenous fluid resuscitation. || يستجيب ارتفاع نيتروجين الدم قبل الكلوي للإماهة الوريدية. || Medical'
    });
    const aiZipReport = importUniversalZipArchiveBytes(rawAiZipBytes, {
      sourceLabel: 'اختبار أرشيف ZIP الذكي'
    });
    assertCondition(
      aiZipReport.success &&
        aiZipReport.counts.terms === 1 &&
        aiZipReport.counts.sentences >= 1,
      `Expected importUniversalZipArchiveBytes to import terms.json + notes.txt from un-manifested ZIP, got ${JSON.stringify(aiZipReport.counts)}`
    );

    // 23.5 Permanent Deletion from both App and Cloud Library Mirror
    const currentStateBeforePermDelete = loadAppState();
    const catalogBeforePermDelete = buildCloudLibraryCatalogView({
      localTopics: currentStateBeforePermDelete.topics,
      localTerms: currentStateBeforePermDelete.terms,
      localSentences: currentStateBeforePermDelete.sentences
    });
    assertCondition(
      catalogBeforePermDelete.blocks.some((b) => b.id === 'block-renal-nested') &&
        loadMedicalBlocks().some((b) => b.id === 'block-renal-nested'),
      'block-renal-nested must exist in both local storage and cloud catalog before permanent deletion'
    );

    const permDelRes = await deleteCloudLibraryTargetPermanently({
      targetType: 'block',
      targetId: 'block-renal-nested',
      currentTopics: currentStateBeforePermDelete.topics,
      currentTerms: currentStateBeforePermDelete.terms,
      currentSentences: currentStateBeforePermDelete.sentences
    });

    const catalogAfterPermDelete = buildCloudLibraryCatalogView({
      localTopics: permDelRes.updatedTopics,
      localTerms: permDelRes.updatedTerms,
      localSentences: permDelRes.updatedSentences
    });
    assertCondition(
      permDelRes.success &&
        !loadMedicalBlocks().some((b) => b.id === 'block-renal-nested') &&
        !loadMedicalSubjects().some((s) => s.id === 'subj-nephro-nested') &&
        !permDelRes.updatedTopics.some((t) => t.id === 'tp-aki-nested') &&
        !catalogAfterPermDelete.blocks.some((b) => b.id === 'block-renal-nested'),
      'deleteCloudLibraryTargetPermanently must permanently remove the block and its subjects/topics from both local storage AND cloud catalog view'
    );

    // 23.6 Verify UI components contain the AI Prompt Configurator & Popup Modals
    const aiGuideSource = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'AiContentGuideModal.tsx'),
      'utf8'
    );
    const libraryViewSource = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'LibraryView.tsx'),
      'utf8'
    );
    assertCondition(
      aiGuideSource.includes('READY-TO-COPY ENGLISH PROMPT') &&
        aiGuideSource.includes('targetScope') &&
        aiGuideSource.includes('termsCount') &&
        aiGuideSource.includes('topicsCoverage') &&
        libraryViewSource.includes("activeIngestModal === 'manual_term'") &&
        libraryViewSource.includes("activeIngestModal === 'file_upload'") &&
        libraryViewSource.includes("activeIngestModal === 'paste_text'") &&
        libraryViewSource.includes("activeIngestModal === 'permanent_delete'"),
      'AiContentGuideModal.tsx and LibraryView.tsx must include the English Prompt Configurator and Popup Modals for data entry and permanent deletion'
    );

    console.log(
      '[PASS] 23. Universal Data Reader (High-Density ||, Markdown Tables, Loose JSON, AI ZIP), English Prompt Configurator & Permanent App+Cloud Deletion Verified'
    );
  }

  // ============================================================================
  // 24. Strict Manual-Only Download Policy (Zero Auto-Downloads)
  // ============================================================================
  {
    const appSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'App.tsx'), 'utf8');
    assertCondition(
      !appSource.includes('syncWithRemoteCloudLibrary('),
      'App.tsx must NEVER automatically call syncWithRemoteCloudLibrary on startup, online reconnect, or offline toggle'
    );

    const libraryViewSource = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'LibraryView.tsx'),
      'utf8'
    );
    assertCondition(
      libraryViewSource.includes("handleDownloadTarget('exam'") &&
        libraryViewSource.includes("handleDownloadTarget('dictionary'"),
      'LibraryView.tsx must provide explicit Download buttons for Cloud Exams and Cloud Dictionary Packs'
    );

    // Clear exams & verify catalog refresh leaves local topics/terms/exams untouched while selective exam download pulls on click
    saveAcademicExams([]);
    const beforeRefresh = loadAppState();
    const freshMirrorSeed = loadUnifiedCloudMirror();
    freshMirrorSeed.exams = [
      ...(freshMirrorSeed.exams || []),
      {
        id: 'exam-manual-only-24',
        blockId: 'block-manual-24',
        titleEn: 'Manual Exam 24',
        titleAr: 'اختبار يدوي 24',
        questionIds: ['q-manual-24'],
        questions: [
          {
            id: 'q-manual-24',
            type: 'single_choice',
            blockId: 'block-manual-24',
            questionEn: 'Sample manual question?',
            questionAr: 'سؤال اختبار يدوي؟',
            options: [
              { key: 'A', textEn: 'Correct', textAr: 'الإجابة الصحيحة' },
              { key: 'B', textEn: 'Wrong', textAr: 'خطأ' }
            ],
            correctOptionKeys: ['A'],
            explanationEn: 'Explanation',
            explanationAr: 'شرح',
            linkedTermIds: [],
            difficulty: 'easy',
            createdAt: '2026-11-17T00:00:00.000Z'
          }
        ]
      }
    ];
    saveUnifiedCloudMirror(freshMirrorSeed);

    const refreshRes = await syncWithRemoteCloudLibrary({
      localTopics: beforeRefresh.topics,
      localTerms: beforeRefresh.terms,
      localSentences: beforeRefresh.sentences,
      customFetch: async () => new Response('{}', { status: 404 })
    });
    assertCondition(
      refreshRes.newUpdatesApplied === 0 &&
        refreshRes.autoMergedTopics.length === beforeRefresh.topics.length &&
        refreshRes.autoMergedTerms.length === beforeRefresh.terms.length &&
        !loadAcademicExams().some((e) => e.id === 'exam-manual-only-24'),
      'syncWithRemoteCloudLibrary must NOT auto-download exams, topics, or terms into local app state/storage'
    );

    const examDownloadRes = await downloadCloudLibraryTarget({
      targetType: 'exam',
      targetId: 'exam-manual-only-24',
      currentTopics: beforeRefresh.topics,
      currentTerms: beforeRefresh.terms,
      currentSentences: beforeRefresh.sentences
    });
    assertCondition(
      examDownloadRes.success &&
        loadAcademicExams().some((e) => e.id === 'exam-manual-only-24'),
      'Explicit downloadCloudLibraryTarget(exam) must download the exam only when clicked by the user'
    );

    console.log(
      '[PASS] 24. Strict Manual-Only Download Policy (Zero Auto-Downloads & Explicit Click Downloads for All Content) Verified'
    );
  }

  // ============================================================================
  // 25. Hierarchy Preservation, Relative Repo Media Resolution, Markdown Import & UI Checks
  // ============================================================================
  {
    // 25.1 Preserve remote blockId even when not yet downloaded locally + heal wiped blockId via subjectId
    saveMedicalBlocks([]);
    saveMedicalSubjects([]);

    const remoteBlock25 = {
      id: 'block-cardio-25',
      code: 'BLK-CV25',
      titleEn: 'Cardiovascular System 25',
      titleAr: 'بلوك القلب 25',
      descriptionEn: 'Cardio anatomy & histology',
      descriptionAr: 'تشريح وأنسجة القلب',
      colorAccent: 'emerald',
      order: 1,
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z'
    };
    const remoteSubject25 = {
      id: 'subj-cv-hist-25',
      blockId: 'block-cardio-25',
      code: 'CV-HIST25',
      titleEn: 'Cardiovascular Histology 25',
      titleAr: 'أنسجة الجهاز القلبي 25',
      descriptionEn: 'Heart wall layers & vessels',
      descriptionAr: 'طبقات جدار القلب والأوعية',
      order: 1,
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z'
    };
    const remoteTopicIntact = {
      id: 'tp-cvh-01-25',
      blockId: 'block-cardio-25',
      subjectId: 'subj-cv-hist-25',
      title: 'Heart Wall Layers',
      titleEn: 'Heart Wall Layers',
      titleAr: 'طبقات جدار القلب',
      subtitle: 'Endocardium, myocardium, epicardium',
      category: 'Medical' as const,
      author: 'UMEDT-DATA',
      publishedAt: '2026-11-18T00:00:00.000Z',
      createdAt: '2026-11-18T00:00:00.000Z',
      favorite: false,
      readingTimeMinutes: 6,
      sections: [
        {
          id: 'sec-cvh-1',
          heading: 'Layers',
          paragraphs: ['Endocardium lines heart chambers.']
        }
      ],
      linkedTermIds: [],
      images: [],
      links: [],
      attachments: []
    };
    const wipedTopic25 = {
      ...remoteTopicIntact,
      id: 'tp-cvh-wiped-25',
      blockId: '',
      subjectId: 'subj-cv-hist-25'
    };

    const enriched25 = enrichAllTopicsWithHierarchy(
      [remoteTopicIntact, wipedTopic25],
      [remoteBlock25],
      [remoteSubject25]
    );
    assertCondition(
      enriched25[0].blockId === 'block-cardio-25' &&
        enriched25[0].subjectId === 'subj-cv-hist-25' &&
        enriched25[1].blockId === 'block-cardio-25' &&
        enriched25[1].subjectId === 'subj-cv-hist-25',
      `enrichAllTopicsWithHierarchy must preserve non-local blockId and auto-heal empty blockId from subjectId; got ${JSON.stringify(
        enriched25.map((t) => ({ id: t.id, blockId: t.blockId, subjectId: t.subjectId }))
      )}`
    );

    const resolved25 = resolveEffectiveTopicHierarchy(wipedTopic25, [remoteSubject25]);
    assertCondition(
      resolved25.blockId === 'block-cardio-25' && resolved25.subjectId === 'subj-cv-hist-25',
      'resolveEffectiveTopicHierarchy must resolve parent blockId from subject'
    );

    const mirror25 = loadUnifiedCloudMirror();
    mirror25.blocks = [...(mirror25.blocks || []), remoteBlock25];
    mirror25.subjects = [...(mirror25.subjects || []), remoteSubject25];
    mirror25.topics = [...(mirror25.topics || []), remoteTopicIntact];
    saveUnifiedCloudMirror(mirror25);

    const preState25 = loadAppState();
    const subjectDownload25 = await downloadCloudLibraryTarget({
      targetType: 'subject',
      targetId: 'subj-cv-hist-25',
      currentTopics: preState25.topics,
      currentTerms: preState25.terms,
      currentSentences: preState25.sentences
    });
    const downloadedTopic25 = subjectDownload25.updatedTopics.find(
      (t) => t.id === 'tp-cvh-01-25'
    );
    assertCondition(
      subjectDownload25.success &&
        Boolean(downloadedTopic25) &&
        downloadedTopic25!.blockId === 'block-cardio-25' &&
        downloadedTopic25!.subjectId === 'subj-cv-hist-25' &&
        loadMedicalBlocks().some((b) => b.id === 'block-cardio-25') &&
        loadMedicalSubjects().some((s) => s.id === 'subj-cv-hist-25'),
      'Downloading a subject must download parent block, subject, and topics with intact blockId and subjectId'
    );

    // 25.2 Resolve repo-relative URLs in UMEDT-DATA sync (media-index, books, questions, topics)
    const mockRepoFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/data/catalog.json')) {
        return new Response(
          JSON.stringify({
            version: '2.0.0',
            collections: [
              {
                id: 'topics',
                contentType: 'topics',
                name: 'CVH Topics',
                rawUrl: 'data/topics/cvh.json'
              },
              {
                id: 'media',
                contentType: 'media',
                name: 'Media Index',
                rawUrl: 'media/media-index.json'
              },
              {
                id: 'books',
                contentType: 'books',
                name: 'Books Index',
                rawUrl: 'books/books.json'
              },
              {
                id: 'questions',
                contentType: 'questions',
                name: 'Questions Index',
                rawUrl: 'questions/questions.json'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/data/topics/cvh.json')) {
        return new Response(JSON.stringify({ topics: [remoteTopicIntact] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/media/media-index.json')) {
        return new Response(
          JSON.stringify({
            mediaAssets: [
              {
                id: 'asset-rel-svg-25',
                mediaType: 'diagram',
                titleEn: 'Heart Wall SVG',
                titleAr: 'مخطط القلب',
                relativePath: 'media/diagrams/heart-wall.svg',
                rawUrl: 'media/diagrams/heart-wall.svg',
                linkedEntityType: 'topic',
                linkedEntityId: 'tp-cvh-01-25'
              },
              {
                id: 'asset-rel-video-25',
                mediaType: 'video',
                titleEn: 'Heart Histology Clip',
                fileUrl: 'media/videos/heart.mp4',
                linkedEntityType: 'topic',
                linkedEntityId: 'tp-cvh-01-25'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/books/books.json')) {
        return new Response(
          JSON.stringify({
            books: [
              {
                id: 'book-rel-25',
                titleEn: 'Junqueira Cardio Chapter',
                format: 'pdf',
                rawUrl: 'books/junqueira-cv.pdf',
                blockId: 'block-cardio-25',
                subjectId: 'subj-cv-hist-25',
                topicIds: ['tp-cvh-01-25']
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/questions/questions.json')) {
        return new Response(
          JSON.stringify({
            questions: [
              {
                id: 'q-rel-25',
                type: 'image_based',
                blockId: 'block-cardio-25',
                subjectId: 'subj-cv-hist-25',
                topicId: 'tp-cvh-01-25',
                questionEn: 'Identify structure X in the heart wall.',
                imageUrl: 'media/images/purkinje.png',
                options: [
                  { key: 'A', textEn: 'Purkinje fibers' },
                  { key: 'B', textEn: 'Mesothelium' }
                ],
                correctOptionKeys: ['A']
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const repoSyncRes25 = await syncFromUmedtDataRepository({
      catalogUrl:
        'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/catalog.json',
      customFetch: mockRepoFetch
    });
    const syncedAssetSvg = (repoSyncRes25.incoming.mediaAssets || []).find(
      (m) => m.id === 'asset-rel-svg-25'
    );
    const syncedAssetVideo = (repoSyncRes25.incoming.mediaAssets || []).find(
      (m) => m.id === 'asset-rel-video-25'
    );
    const syncedBook25 = (repoSyncRes25.incoming.books || []).find(
      (b) => b.id === 'book-rel-25'
    );
    const syncedQuestion25 = (repoSyncRes25.incoming.quizQuestions || []).find(
      (q) => q.id === 'q-rel-25'
    );
    assertCondition(
      syncedAssetSvg?.rawUrl ===
        'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/diagrams/heart-wall.svg' &&
        syncedAssetVideo?.rawUrl ===
          'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/videos/heart.mp4' &&
        syncedBook25?.downloadUrl ===
          'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/books/junqueira-cv.pdf' &&
        syncedQuestion25?.imageUrl ===
          'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/media/images/purkinje.png',
      `syncFromUmedtDataRepository must resolve repo-relative media, book, and question URLs against UMEDT-DATA root; got ${JSON.stringify(
        { syncedAssetSvg, syncedAssetVideo, syncedBook25, syncedQuestion25 }
      )}`
    );

    // 25.3 Universal Markdown (# Block / ## Subject / ### Topic) Import
    const markdownSample25 = `# Block: Neurosciences Block 25 | بلوك العلوم العصبية 25

## Subject: Neuroanatomy 25 | التشريح العصبي 25

### Topic: Circle of Willis | دائرة ويليس الشريانية

#### Clinical Overview
The Circle of Willis provides collateral arterial circulation at the base of the brain.

| Term | Translation | DefinitionAr | DefinitionEn | ExampleEn | ExampleAr |
| --- | --- | --- | --- | --- | --- |
| Basilar Artery | الشريان القاعدي | الشريان الناتج عن اتحاد الشريانين الفقريين. | Artery formed by union of the two vertebral arteries. | Basilar artery occlusion causes locked-in syndrome. | يؤدي انسداد الشريان القاعدي إلى متلازمة المنحبس. |

QUESTION || single_choice || Which vessels unite to form the basilar artery? || ما الوعاءان اللذان يتحدان لتكوين الشريان القاعدي؟ || A) Vertebral arteries; B) Internal carotid arteries; C) Middle cerebral arteries; D) Anterior spinal arteries || A || يتحد الشريانان الفقريان لتكوين الشريان القاعدي || The paired vertebral arteries join at the pontomedullary junction.`;

    const mdReport25 = importUniversalAiOrLocalContent({
      rawText: markdownSample25,
      allowHierarchyCreation: true,
      sourceLabel: 'اختبار Markdown 25'
    });
    assertCondition(
      mdReport25.success &&
        mdReport25.counts.blocks === 1 &&
        mdReport25.counts.subjects === 1 &&
        mdReport25.counts.topics === 1 &&
        mdReport25.counts.terms >= 1 &&
        mdReport25.counts.questions >= 1,
      `Expected Markdown import to create 1 block, 1 subject, 1 topic, >=1 term, >=1 question; got ${JSON.stringify(
        mdReport25.counts
      )}`
    );

    // 25.4 Verify UI cleanup: two-path local-hierarchy AI generator, collision-free LibraryView header, & Block->Subject->Topic drilldown in TopicsHub
    const aiGuideSrc25 = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'AiContentGuideModal.tsx'),
      'utf8'
    );
    const libViewSrc25 = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'LibraryView.tsx'),
      'utf8'
    );
    const topicsHubSrc25 = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'components', 'TopicsHub.tsx'),
      'utf8'
    );

    assertCondition(
      aiGuideSrc25.includes("type GeneratorMode = 'topic' | 'terms'") &&
        aiGuideSrc25.includes('termsPrompt') &&
        aiGuideSrc25.includes('selectedBlock.id') &&
        aiGuideSrc25.includes('selectedSubject.id') &&
        aiGuideSrc25.includes('Do not include "blocks" or "subjects" arrays') &&
        aiGuideSrc25.includes('linkedBlockIds, linkedSubjectIds, linkedTopicIds') &&
        !aiGuideSrc25.includes("type PromptTargetScope = 'block' | 'subject' | 'topic'"),
      'AiContentGuideModal.tsx must expose only topic/global-terms modes, select real local hierarchy IDs, and keep dictionary terms unlinked'
    );

    assertCondition(
      !libViewSrc25.includes('flex items-center justify-between gap-2">\n                <button\n                  type="button"\n                  onClick={() => setCloudCatalogModalOpen(false)}') &&
        !libViewSrc25.includes("setActiveIngestModal('permanent_delete');\n                    }}"),
      'LibraryView.tsx cloud catalog modal header must separate navigation from action buttons cleanly'
    );

    assertCondition(
      topicsHubSrc25.includes('enrichAllTopicsWithHierarchy(rawTopics, blocks, subjects)') &&
        topicsHubSrc25.includes('عرض كل مواضيع البلوك') &&
        topicsHubSrc25.includes('كل البلوكات') &&
        topicsHubSrc25.includes('showAllTopicsFlat'),
      'TopicsHub.tsx must self-heal topic hierarchy with blocks/subjects and provide Block -> Subject -> Topic drilldown navigation'
    );

    console.log(
      '[PASS] 25. Hierarchy Preservation/Self-Healing, UMEDT-DATA Relative Media Resolution, Markdown Import & UI Cleanup Verified'
    );
  }

  // 26. Mandatory 9 Acceptance Tests: Blood Pressure Package Import, Bundled Binary/SVG Media, IndexedDB Persistence Across Restart, Re-import Deduplication & User Data Preservation, Atomic Rollback on Media Failure, and Malicious ZIP Security
  {
    const idbStores = new Map<string, Map<string, unknown>>();
    const previousIndexedDB = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;

    // Install spec-compliant in-memory IndexedDB mock for Node verification of real IDB transactions
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      open: (dbName: string) => {
        const req: Record<string, unknown> = {
          result: null,
          error: null,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null
        };
        queueMicrotask(() => {
          const db = {
            objectStoreNames: {
              contains: (storeName: string) => idbStores.has(`${dbName}:${storeName}`)
            },
            createObjectStore: (storeName: string) => {
              const key = `${dbName}:${storeName}`;
              if (!idbStores.has(key)) idbStores.set(key, new Map());
              return {
                createIndex: () => ({})
              };
            },
            transaction: (storeName: string) => {
              const key = `${dbName}:${storeName}`;
              if (!idbStores.has(key)) idbStores.set(key, new Map());
              const storeMap = idbStores.get(key)!;
              const tx: Record<string, unknown> = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                error: null,
                objectStore: () => ({
                  put: (val: { id: string }) => {
                    storeMap.set(val.id, JSON.parse(JSON.stringify(val)));
                    const putReq: Record<string, unknown> = { onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      if (typeof putReq.onsuccess === 'function') (putReq.onsuccess as () => void)();
                      if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                    });
                    return putReq;
                  },
                  get: (id: string) => {
                    const getReq: Record<string, unknown> = {
                      result: storeMap.get(id),
                      onsuccess: null,
                      onerror: null
                    };
                    queueMicrotask(() => {
                      if (typeof getReq.onsuccess === 'function') (getReq.onsuccess as () => void)();
                    });
                    return getReq;
                  },
                  getAll: () => {
                    const allReq: Record<string, unknown> = {
                      result: Array.from(storeMap.values()),
                      onsuccess: null,
                      onerror: null
                    };
                    queueMicrotask(() => {
                      if (typeof allReq.onsuccess === 'function') (allReq.onsuccess as () => void)();
                    });
                    return allReq;
                  },
                  delete: (id: string) => {
                    storeMap.delete(id);
                    const delReq: Record<string, unknown> = { onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      if (typeof delReq.onsuccess === 'function') (delReq.onsuccess as () => void)();
                      if (typeof tx.oncomplete === 'function') (tx.oncomplete as () => void)();
                    });
                    return delReq;
                  }
                })
              };
              return tx;
            },
            close: () => {}
          };
          req.result = db;
          if (typeof req.onupgradeneeded === 'function') {
            (req.onupgradeneeded as () => void)();
          }
          if (typeof req.onsuccess === 'function') {
            (req.onsuccess as () => void)();
          }
        });
        return req;
      }
    };

    try {
      const encoder = new TextEncoder();
      const bpSvgMarkup =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 140"><rect width="360" height="140" fill="#ecfdf5"/><text x="20" y="75" fill="#065f46" font-size="16">Baroreceptor Reflex Arc (MAP = CO x SVR)</text></svg>';
      const bpSvgBytes = encoder.encode(bpSvgMarkup);
      const bpPngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89
      ]);
      const bpMp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21]);
      const bpMp4Bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32
      ]);
      const bpPdfBytes = encoder.encode('%PDF-1.4\n1 0 obj\n<< /Title (Blood Pressure Guideline) >>\nendobj\n%%EOF');

      const svgSha = await computeSha256Hex(bpSvgBytes);
      const pngSha = await computeSha256Hex(bpPngBytes);
      const mp3Sha = await computeSha256Hex(bpMp3Bytes);
      const mp4Sha = await computeSha256Hex(bpMp4Bytes);
      const pdfSha = await computeSha256Hex(bpPdfBytes);

      const bpPackagePayload: import('../src/types/lexicon').DataPackagePayload = {
        manifest: {
          packageId: 'umedt-bp-test-pack',
          dataVersion: '2026.11.0-bp-test',
          minAppVersion: '2.0.0',
          schemaVersion: 2,
          releasedAt: new Date().toISOString(),
          channel: 'stable',
          description: 'UMEDT-DATA Blood Pressure Topic Bundle',
          counts: {
            terms: 2,
            sentences: 1,
            topics: 1,
            affixes: 1,
            abbreviations: 1
          },
          extendedCounts: {
            blocks: 1,
            subjects: 1,
            books: 0,
            questions: 2,
            exams: 1,
            mediaAssets: 5
          }
        },
        blocks: [
          {
            id: 'blk-cv-bp',
            code: 'BLK-CV-BP',
            titleEn: 'Cardiovascular System Block',
            titleAr: 'بلوك القلب والأوعية الدموية',
            descriptionEn: 'Cardiovascular physiology and pathology',
            descriptionAr: 'دراسة ضغط الدم والدورة الدموية',
            colorAccent: '#10b981',
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        subjects: [
          {
            id: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            code: 'PHYS-CV-BP',
            titleEn: 'Cardiovascular Physiology',
            titleAr: 'فسيولوجيا القلب والأوعية الدموية',
            descriptionEn: 'Arterial blood pressure regulation',
            descriptionAr: 'تنظيم ضغط الدم الشرياني',
            order: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        topics: [
          {
            id: 'topic-cv-blood-pressure',
            blockId: 'blk-cv-bp',
            subjectId: 'subj-cv-physio-bp',
            title: 'Arterial Blood Pressure Regulation',
            titleEn: 'Arterial Blood Pressure Regulation',
            titleAr: 'تنظيم ضغط الدم الشرياني (Blood Pressure)',
            subtitle: 'Mean Arterial Pressure, Baroreceptors & Korotkoff Sounds',
            category: 'Medical',
            author: 'UMEDT Academic Board',
            publishedAt: '2026-11-18',
            readingTimeMinutes: 20,
            favorite: false,
            sections: [
              {
                id: 'sec-bp-hemodynamics',
                heading: 'Hemodynamic Determinants & Reflexes',
                headingEn: 'Hemodynamic Determinants & Reflexes',
                headingAr: 'المحددات الهيموديناميكية والمنعكسات العصبية',
                paragraphs: [
                  'Arterial blood pressure is regulated acutely by the autonomic baroreceptor reflex and chronically by the renal renin-angiotensin-aldosterone system.'
                ],
                contentBlocks: [
                  {
                    id: 'cb-bp-svg-diagram',
                    type: 'diagram',
                    order: 1,
                    titleEn: 'Baroreceptor Reflex SVG Diagram',
                    titleAr: 'مخطط منعكس مستقبلات الضغط (SVG)',
                    mediaUrl: 'media/diagrams/bp-baroreceptor-reflex.svg',
                    mediaMimeType: 'image/svg+xml',
                    mediaFileName: 'bp-baroreceptor-reflex.svg'
                  },
                  {
                    id: 'cb-bp-png-image',
                    type: 'image',
                    order: 2,
                    titleEn: 'Korotkoff Auscultatory Phases Chart',
                    titleAr: 'صورة مراحل أصوات كوروتكوف',
                    mediaUrl: 'media/images/korotkoff-phases.png',
                    mediaMimeType: 'image/png',
                    mediaFileName: 'korotkoff-phases.png'
                  },
                  {
                    id: 'cb-bp-audio',
                    type: 'audio',
                    order: 3,
                    titleEn: 'Korotkoff Sounds Auscultation Audio',
                    titleAr: 'تسجيل صوتي لأصوات كوروتكوف',
                    mediaUrl: 'media/audio/korotkoff-sounds.mp3',
                    mediaMimeType: 'audio/mpeg',
                    mediaFileName: 'korotkoff-sounds.mp3'
                  },
                  {
                    id: 'cb-bp-video',
                    type: 'video',
                    order: 4,
                    titleEn: 'Sphygmomanometer Blood Pressure Measurement Video',
                    titleAr: 'فيديو قياس ضغط الدم السريري',
                    mediaUrl: 'media/videos/bp-measurement.mp4',
                    mediaMimeType: 'video/mp4',
                    mediaFileName: 'bp-measurement.mp4'
                  },
                  {
                    id: 'cb-bp-pdf',
                    type: 'pdf_viewer',
                    order: 5,
                    titleEn: 'Hypertension Clinical Guideline PDF',
                    titleAr: 'ملف إرشادات فرط ضغط الدم PDF',
                    mediaUrl: 'media/pdfs/aha-hypertension-guideline.pdf',
                    mediaMimeType: 'application/pdf',
                    mediaFileName: 'aha-hypertension-guideline.pdf'
                  }
                ]
              }
            ],
            images: [
              {
                id: 'img-bp-korotkoff',
                caption: 'Korotkoff Phases Local Image',
                url: 'media/images/korotkoff-phases.png',
                fileName: 'korotkoff-phases.png',
                mimeType: 'image/png'
              }
            ],
            links: [],
            attachments: [
              {
                id: 'att-bp-guideline',
                fileName: 'aha-hypertension-guideline.pdf',
                fileType: 'pdf',
                mimeType: 'application/pdf',
                fileSizeLabel: '1 KB',
                contentDataUrlOrText: '',
                externalUrl: 'media/pdfs/aha-hypertension-guideline.pdf',
                addedAt: new Date().toISOString()
              }
            ]
          }
        ],
        terms: [
          {
            id: 'term-bp-baroreceptor',
            term: 'Baroreceptor',
            termNormalized: 'baroreceptor',
            translation: 'مستقبل الضغط الشرياني',
            phonetic: '/ˌbær.oʊ.rɪˈsɛp.tər/',
            pos: 'Noun',
            category: 'Medical',
            specialty: 'Physiology',
            keepEnglish: true,
            favorite: false,
            collections: [],
            ingestedAt: new Date().toISOString(),
            definitionEn: 'Mechanoreceptor sensory neuron located in the carotid sinus and aortic arch.',
            definitionAr: 'مستقبل ميكانيكي حسي في الجيب السباتي وقوس الأبهر يستجيب لتمدد جدار الوعاء.',
            examples: [
              {
                en: 'Carotid baroreceptors fire rapidly during acute hypertension.',
                ar: 'تطلق مستقبلات الضغط السباتية إشارات سريعة أثناء ارتفاع الضغط الحاد.'
              }
            ],
            relations: {
              synonyms: ['Pressoreceptor'],
              broader: ['Mechanoreceptor'],
              related: ['Korotkoff Sounds']
            },
            linkedTopicIds: ['topic-cv-blood-pressure'],
            linkedSubjectIds: ['subj-cv-physio-bp'],
            linkedBlockIds: ['blk-cv-bp']
          },
          {
            id: 'term-bp-korotkoff',
            term: 'Korotkoff Sounds',
            termNormalized: 'korotkoff sounds',
            translation: 'أصوات كوروتكوف',
            phonetic: '/kəˈrɒt.kɒf saʊndz/',
            pos: 'Noun',
            category: 'Medical',
            specialty: 'Physiology',
            keepEnglish: true,
            favorite: false,
            collections: [],
            ingestedAt: new Date().toISOString(),
            definitionEn: 'Arterial sounds heard through a stethoscope during cuff deflation.',
            definitionAr: 'الأصوات الشريانية المسموعة بالسماعة الطبية أثناء تفريغ كفة جهاز الضغط.',
            examples: [
              {
                en: 'Phase I Korotkoff sound marks systolic blood pressure.',
                ar: 'المرحلة الأولى من أصوات كوروتكوف تحدد ضغط الدم الانقباضي.'
              }
            ],
            relations: {
              synonyms: [],
              broader: ['Auscultation'],
              related: ['Baroreceptor']
            },
            linkedTopicIds: ['topic-cv-blood-pressure'],
            linkedSubjectIds: ['subj-cv-physio-bp'],
            linkedBlockIds: ['blk-cv-bp']
          }
        ],
        sentences: [
          {
            id: 'sent-bp-1',
            en: 'Mean arterial pressure equals cardiac output multiplied by systemic vascular resistance.',
            ar: 'متوسط الضغط الشرياني يساوي النتاج القلبي مضروباً في المقاومة الوعائية الجهازية.',
            category: 'Medical',
            specialty: 'Physiology',
            sourceType: 'seed',
            linkedTermIds: ['term-bp-baroreceptor'],
            tags: ['hemodynamics'],
            favorite: false,
            createdAt: new Date().toISOString()
          }
        ],
        customAffixes: [
          {
            id: 'aff-bp-baro',
            affix: 'baro-',
            cleanKey: 'baro',
            type: 'prefix',
            meaningAr: 'ضغط / ثقل',
            meaningEn: 'pressure / weight',
            combiningRule: 'Combines with Greek/Latin roots to denote pressure',
            examples: ['Baroreceptor', 'Barotrauma']
          }
        ],
        customAbbreviations: [
          {
            id: 'abbr-bp-map',
            abbr: 'MAP',
            isAmbiguous: false,
            defaultExpansionEn: 'Mean Arterial Pressure',
            defaultTranslationAr: 'متوسط ضغط الدم الشرياني',
            category: 'Cardiopulmonary',
            priority: 1,
            candidates: []
          }
        ],
        books: [],
        questions: [
          {
            id: 'q-bp-1',
            type: 'single_choice',
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            questionEn: 'Which Korotkoff phase corresponds to diastolic blood pressure in adults?',
            questionAr: 'أي مرحلة من أصوات كوروتكوف تمثل ضغط الدم الانبساطي لدى البالغين؟',
            options: [
              { key: 'A', textEn: 'Phase I' },
              { key: 'B', textEn: 'Phase II' },
              { key: 'C', textEn: 'Phase III' },
              { key: 'D', textEn: 'Phase V (disappearance of sounds)' }
            ],
            correctOptionKeys: ['D'],
            explanationEn: 'Phase V (complete disappearance of Korotkoff sounds) corresponds to resting diastolic blood pressure.',
            explanationAr: 'المرحلة الخامسة (اختفاء الأصوات تماماً) تمثل ضغط الدم الانبساطي.',
            difficulty: 'medium',
            linkedTermIds: ['term-bp-korotkoff'],
            imageUrl: 'media/images/korotkoff-phases.png',
            createdAt: new Date().toISOString()
          },
          {
            id: 'q-bp-2',
            type: 'single_choice',
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            questionEn: 'Where are the primary high-pressure arterial baroreceptors located?',
            questionAr: 'أين تقع مستقبلات الضغط الشرياني عالية الضغط الرئيسية؟',
            options: [
              { key: 'A', textEn: 'Carotid sinus and aortic arch' },
              { key: 'B', textEn: 'Right atrium only' },
              { key: 'C', textEn: 'Pulmonary veins' },
              { key: 'D', textEn: 'Hepatic portal vein' }
            ],
            correctOptionKeys: ['A'],
            explanationEn: 'High-pressure baroreceptors reside in the carotid sinus (glossopharyngeal nerve IX) and aortic arch (vagus nerve X).',
            explanationAr: 'تقع في الجيب السباتي وقوس الأبهر.',
            difficulty: 'easy',
            linkedTermIds: ['term-bp-baroreceptor'],
            createdAt: new Date().toISOString()
          }
        ],
        exams: [
          {
            id: 'exam-bp-physio-1',
            titleEn: 'Blood Pressure Regulation Assessment Exam',
            titleAr: 'اختبار تقييمي: تنظيم ضغط الدم الشرياني',
            descriptionAr: 'اختبار شامل لموضوع ضغط الدم ومنعكساته',
            blockId: 'blk-cv-bp',
            subjectId: 'subj-cv-physio-bp',
            topicIds: ['topic-cv-blood-pressure'],
            questionIds: ['q-bp-1', 'q-bp-2'],
            durationMinutes: 15,
            passingScorePercent: 70,
            createdAt: new Date().toISOString()
          }
        ],
        mediaAssets: [
          {
            id: 'ma-bp-svg',
            titleEn: 'Baroreceptor Reflex SVG Diagram',
            titleAr: 'مخطط منعكس مستقبلات الضغط',
            mediaType: 'diagram',
            mimeType: 'image/svg+xml',
            fileName: 'bp-baroreceptor-reflex.svg',
            url: 'media/diagrams/bp-baroreceptor-reflex.svg',
            rawUrl: 'media/diagrams/bp-baroreceptor-reflex.svg',
            sha256: svgSha,
            sizeBytes: bpSvgBytes.byteLength,
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            linkedEntityType: 'topic',
            linkedEntityId: 'topic-cv-blood-pressure'
          },
          {
            id: 'ma-bp-png',
            titleEn: 'Korotkoff Phases Chart',
            titleAr: 'صورة مراحل أصوات كوروتكوف',
            mediaType: 'image',
            mimeType: 'image/png',
            fileName: 'korotkoff-phases.png',
            url: 'media/images/korotkoff-phases.png',
            rawUrl: 'media/images/korotkoff-phases.png',
            sha256: pngSha,
            sizeBytes: bpPngBytes.byteLength,
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            linkedEntityType: 'topic',
            linkedEntityId: 'topic-cv-blood-pressure'
          },
          {
            id: 'ma-bp-mp3',
            titleEn: 'Korotkoff Sounds Audio',
            titleAr: 'صوت كوروتكوف',
            mediaType: 'audio',
            mimeType: 'audio/mpeg',
            fileName: 'korotkoff-sounds.mp3',
            url: 'media/audio/korotkoff-sounds.mp3',
            rawUrl: 'media/audio/korotkoff-sounds.mp3',
            sha256: mp3Sha,
            sizeBytes: bpMp3Bytes.byteLength,
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            linkedEntityType: 'topic',
            linkedEntityId: 'topic-cv-blood-pressure'
          },
          {
            id: 'ma-bp-mp4',
            titleEn: 'Blood Pressure Measurement Video',
            titleAr: 'فيديو قياس ضغط الدم',
            mediaType: 'video',
            mimeType: 'video/mp4',
            fileName: 'bp-measurement.mp4',
            url: 'media/videos/bp-measurement.mp4',
            rawUrl: 'media/videos/bp-measurement.mp4',
            sha256: mp4Sha,
            sizeBytes: bpMp4Bytes.byteLength,
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            linkedEntityType: 'topic',
            linkedEntityId: 'topic-cv-blood-pressure'
          },
          {
            id: 'ma-bp-pdf',
            titleEn: 'AHA Hypertension Guideline PDF',
            titleAr: 'ملف إرشادات فرط ضغط الدم',
            mediaType: 'pdf',
            mimeType: 'application/pdf',
            fileName: 'aha-hypertension-guideline.pdf',
            url: 'media/pdfs/aha-hypertension-guideline.pdf',
            rawUrl: 'media/pdfs/aha-hypertension-guideline.pdf',
            sha256: pdfSha,
            sizeBytes: bpPdfBytes.byteLength,
            topicId: 'topic-cv-blood-pressure',
            subjectId: 'subj-cv-physio-bp',
            blockId: 'blk-cv-bp',
            linkedEntityType: 'topic',
            linkedEntityId: 'topic-cv-blood-pressure'
          }
        ]
      };

      const bpZipBytes = buildDataPackageZipBytes(bpPackagePayload, {
        mediaEntries: [
          { path: 'media/diagrams/bp-baroreceptor-reflex.svg', bytes: bpSvgBytes },
          { path: 'media/images/korotkoff-phases.png', bytes: bpPngBytes },
          { path: 'media/audio/korotkoff-sounds.mp3', bytes: bpMp3Bytes },
          { path: 'media/videos/bp-measurement.mp4', bytes: bpMp4Bytes },
          { path: 'media/pdfs/aha-hypertension-guideline.pdf', bytes: bpPdfBytes }
        ]
      });

      // --- Acceptance Test 1: Import Blood Pressure Topic ZIP Bundle ---
      const { result: bpImportRes, state: bpState } = await executeAtomicPackageImport(bpZipBytes, {
        mode: 'merge',
        fileNameHint: 'blood-pressure-bundle.zip'
      });

      assertCondition(
        bpImportRes.success === true &&
          !bpImportRes.rolledBack &&
          bpImportRes.summary.mediaFilesImported === 5 &&
          (bpImportRes.summary.failedCount || 0) === 0,
        `Acceptance Test 1 failed: Expected successful Blood Pressure ZIP import with 5 media files, got ${JSON.stringify(bpImportRes)}`
      );

      const importedBpTopic = bpState.topics.find((t) => t.id === 'topic-cv-blood-pressure');
      assertCondition(
        Boolean(importedBpTopic) &&
          importedBpTopic!.blockId === 'blk-cv-bp' &&
          importedBpTopic!.subjectId === 'subj-cv-physio-bp',
        'Acceptance Test 1 failed: Blood Pressure topic must be imported with intact Block and Subject hierarchy'
      );

      const bpContentBlocks = importedBpTopic!.sections[0]?.contentBlocks || [];
      const svgBlock = bpContentBlocks.find((b) => b.id === 'cb-bp-svg-diagram');
      const pngBlock = bpContentBlocks.find((b) => b.id === 'cb-bp-png-image');
      const audioBlock = bpContentBlocks.find((b) => b.id === 'cb-bp-audio');
      const videoBlock = bpContentBlocks.find((b) => b.id === 'cb-bp-video');
      const pdfBlock = bpContentBlocks.find((b) => b.id === 'cb-bp-pdf');

      // --- Acceptance Test 2: SVG Diagram Rendering & Sanitization Inside Topic ---
      assertCondition(
        Boolean(svgBlock) &&
          Boolean(svgBlock!.mediaIdbKey) &&
          Boolean(svgBlock!.diagramSvg && svgBlock!.diagramSvg.includes('<svg')) &&
          sanitizeSvgMarkup(svgBlock!.diagramSvg || '').includes('Baroreceptor Reflex Arc'),
        'Acceptance Test 2 failed: SVG diagram inside Blood Pressure topic must have inline sanitized SVG markup and bound mediaIdbKey'
      );

      // --- Acceptance Test 3: Display Actual Local Image from Package (Not External Link) ---
      assertCondition(
        Boolean(pngBlock) &&
          Boolean(pngBlock!.mediaIdbKey) &&
          Boolean(pngBlock!.mediaUrl && pngBlock!.mediaUrl.startsWith('idb://')) &&
          !pngBlock!.externalUrl,
        'Acceptance Test 3 failed: Bundled PNG image must bind to local idb:// mediaIdbKey and never convert to an external URL'
      );
      const storedPngRecord = await getLocalMediaRecord(pngBlock!.mediaIdbKey!);
      assertCondition(
        Boolean(storedPngRecord) &&
          storedPngRecord!.mimeType === 'image/png' &&
          storedPngRecord!.dataUrl.startsWith('data:image/png;base64,'),
        'Acceptance Test 3 failed: Stored local PNG record in IndexedDB must contain valid image/png dataUrl'
      );

      // --- Acceptance Test 4: Play Actual Bundled Audio & Video Files ---
      assertCondition(
        Boolean(audioBlock?.mediaIdbKey) &&
          Boolean(videoBlock?.mediaIdbKey) &&
          Boolean(pdfBlock?.mediaIdbKey),
        'Acceptance Test 4 failed: Audio, Video, and PDF blocks must all have bound mediaIdbKey values'
      );
      const storedAudioRecord = await getLocalMediaRecord(audioBlock!.mediaIdbKey!);
      const storedVideoRecord = await getLocalMediaRecord(videoBlock!.mediaIdbKey!);
      assertCondition(
        Boolean(storedAudioRecord) &&
          storedAudioRecord!.mimeType === 'audio/mpeg' &&
          storedAudioRecord!.dataUrl.startsWith('data:audio/mpeg;base64,') &&
          Boolean(storedVideoRecord) &&
          storedVideoRecord!.mimeType === 'video/mp4' &&
          storedVideoRecord!.dataUrl.startsWith('data:video/mp4;base64,'),
        'Acceptance Test 4 failed: Bundled MP3 audio and MP4 video must be stored and playable from IndexedDB'
      );

      // --- Acceptance Test 5: Linked Questions & Exams Display for Blood Pressure Topic ---
      const bpQuestions = loadQuizQuestions(bpState.topics, bpState.terms).filter(
        (q) => q.topicId === 'topic-cv-blood-pressure'
      );
      const bpExams = loadAcademicExams().filter((e) =>
        (e.topicIds || []).includes('topic-cv-blood-pressure')
      );
      assertCondition(
        bpQuestions.length >= 2 &&
          bpQuestions.some((q) => q.id === 'q-bp-1' && q.imageUrl?.startsWith('idb://')) &&
          bpExams.some((e) => e.id === 'exam-bp-physio-1'),
        'Acceptance Test 5 failed: Questions and exams linked to Blood Pressure topic must be persisted with local question image resolution'
      );

      // --- Acceptance Test 6: Media Persistence Across App Close & Reopen ---
      clearMemoryMediaCacheForTesting();
      const reloadedStateAfterRestart = loadAppState();
      const reloadedBpTopic = reloadedStateAfterRestart.topics.find(
        (t) => t.id === 'topic-cv-blood-pressure'
      );
      const reloadedBlocks = reloadedBpTopic?.sections[0]?.contentBlocks || [];
      for (const blk of reloadedBlocks) {
        assertCondition(
          Boolean(blk.mediaIdbKey),
          `Acceptance Test 6 failed: Block ${blk.id} lost mediaIdbKey across app restart`
        );
        const idbRecAfterRestart = await getLocalMediaRecord(blk.mediaIdbKey!);
        assertCondition(
          Boolean(idbRecAfterRestart && idbRecAfterRestart.dataUrl.startsWith('data:')),
          `Acceptance Test 6 failed: Media ${blk.mediaIdbKey} not persisted in IndexedDB after clearing memory cache and reopening app`
        );
      }

      // --- Acceptance Test 7: Re-Import/Update Topic Without Duplicate Records or Losing User Data ---
      const userUpdatedTopics = reloadedStateAfterRestart.topics.map((t) =>
        t.id === 'topic-cv-blood-pressure'
          ? { ...t, favorite: true, lastOpenedAt: '2026-11-18T08:00:00.000Z' }
          : t
      );
      saveTopics(userUpdatedTopics);

      const userUpdatedTerms = reloadedStateAfterRestart.terms.map((tm) =>
        tm.id === 'term-bp-baroreceptor'
          ? {
              ...tm,
              favorite: true,
              collections: ['High-Yield CV'],
              srsData: {
                interval: 6,
                repetitions: 2,
                easeFactor: 2.6,
                nextReviewAt: 1795000000000
              }
            }
          : tm
      );
      saveTerms(userUpdatedTerms);

      const existingNotes = loadUserStudyNotes();
      saveUserStudyNotes([
        ...existingNotes.filter((n) => n.id !== 'note-bp-user-1'),
        {
          id: 'note-bp-user-1',
          entityType: 'topic',
          entityId: 'topic-cv-blood-pressure',
          title: 'ملاحظتي حول منعكس مستقبلات الضغط',
          content: 'يرسل الجيب السباتي إشارات عبر العصب التاسع (CN IX) إلى النواة المفردة.',
          createdAt: '2026-11-18T08:05:00.000Z',
          updatedAt: '2026-11-18T08:05:00.000Z'
        }
      ]);

      const { result: reimportRes, state: reimportedState } = await executeAtomicPackageImport(
        bpZipBytes,
        {
          mode: 'merge',
          fileNameHint: 'blood-pressure-bundle-reimport.zip'
        }
      );
      const bpTopicsAfterReimport = reimportedState.topics.filter(
        (t) => t.id === 'topic-cv-blood-pressure'
      );
      const bpTermsAfterReimport = reimportedState.terms.filter(
        (tm) => tm.id === 'term-bp-baroreceptor'
      );
      const notesAfterReimport = loadUserStudyNotes().filter((n) => n.id === 'note-bp-user-1');

      assertCondition(
        reimportRes.success === true &&
          bpTopicsAfterReimport.length === 1 &&
          bpTopicsAfterReimport[0].favorite === true &&
          bpTopicsAfterReimport[0].lastOpenedAt === '2026-11-18T08:00:00.000Z' &&
          bpTermsAfterReimport.length === 1 &&
          bpTermsAfterReimport[0].favorite === true &&
          bpTermsAfterReimport[0].srsData?.interval === 6 &&
          notesAfterReimport.length === 1 &&
          (reimportRes.summary.mediaFilesSkipped || 0) >= 5,
        'Acceptance Test 7 failed: Re-importing Blood Pressure topic must not duplicate records, must skip identical media, and must preserve user favorites, SRS progress, lastOpenedAt, and personal study notes'
      );

      // --- Acceptance Test 8: Failed Media Import Must Roll Back Atomically Without Updating dataVersion ---
      const versionBeforeFailTest = loadAppState().versionMetadata.dataVersion;

      // 8a. Missing bundled media file referenced by topic inside ZIP
      const brokenMissingMediaPayload: import('../src/types/lexicon').DataPackagePayload = {
        ...bpPackagePayload,
        manifest: {
          ...bpPackagePayload.manifest,
          dataVersion: '2026.99.1-missing-media'
        }
      };
      // Build ZIP without 'media/images/korotkoff-phases.png'
      const brokenMissingMediaZip = buildDataPackageZipBytes(brokenMissingMediaPayload, {
        mediaEntries: [{ path: 'media/diagrams/bp-baroreceptor-reflex.svg', bytes: bpSvgBytes }]
      });
      const { result: missingMediaRes } = await executeAtomicPackageImport(brokenMissingMediaZip, {
        mode: 'merge',
        fileNameHint: 'broken-missing-media.zip'
      });
      assertCondition(
        missingMediaRes.success === false &&
          missingMediaRes.rolledBack === true &&
          loadAppState().versionMetadata.dataVersion === versionBeforeFailTest,
        `Acceptance Test 8a failed: Missing bundled media file inside ZIP must fail import and preserve dataVersion (${versionBeforeFailTest})`
      );

      // 8b. Simulated IndexedDB media persistence failure midway through import
      const simulatedIdbFailPayload: import('../src/types/lexicon').DataPackagePayload = {
        ...bpPackagePayload,
        manifest: {
          ...bpPackagePayload.manifest,
          dataVersion: '2026.99.2-idb-fail'
        }
      };
      const simulatedIdbFailZip = buildDataPackageZipBytes(simulatedIdbFailPayload, {
        mediaEntries: [
          { path: 'media/diagrams/bp-baroreceptor-reflex.svg', bytes: bpSvgBytes },
          { path: 'media/images/korotkoff-phases.png', bytes: bpPngBytes },
          { path: 'media/audio/korotkoff-sounds.mp3', bytes: bpMp3Bytes },
          { path: 'media/videos/bp-measurement.mp4', bytes: bpMp4Bytes },
          { path: 'media/pdfs/aha-hypertension-guideline.pdf', bytes: bpPdfBytes }
        ]
      });
      const { result: idbFailRes } = await executeAtomicPackageImport(simulatedIdbFailZip, {
        mode: 'merge',
        fileNameHint: 'simulated-idb-failure.zip',
        simulateMediaPersistenceFailure: true
      });
      assertCondition(
        idbFailRes.success === false &&
          idbFailRes.rolledBack === true &&
          (idbFailRes.summary.mediaFilesFailed || 0) > 0 &&
          loadAppState().versionMetadata.dataVersion === versionBeforeFailTest,
        `Acceptance Test 8b failed: Media persistence failure must roll back atomically and keep dataVersion at ${versionBeforeFailTest}`
      );

      // --- Acceptance Test 9: Malicious ZIP Payloads (.exe, .js, .html, XSS .svg, Zip Slip) Must Be Blocked ---
      const maliciousExeZip = buildSimpleStoreZipBytes({
        'manifest.json': JSON.stringify(bpPackagePayload.manifest),
        'payload.exe': 'MZ-malicious-executable'
      });
      const maliciousJsZip = buildSimpleStoreZipBytes({
        'manifest.json': JSON.stringify(bpPackagePayload.manifest),
        'inject.js': 'window.location="https://evil.example";'
      });
      const maliciousHtmlZip = buildSimpleStoreZipBytes({
        'manifest.json': JSON.stringify(bpPackagePayload.manifest),
        'phish.html': '<html><script>alert(1)</script></html>'
      });
      const maliciousScriptSvgZip = buildSimpleStoreZipBytes({
        'manifest.json': JSON.stringify(bpPackagePayload.manifest),
        'media/diagrams/xss.svg':
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>'
      });
      const maliciousOnloadSvgZip = buildSimpleStoreZipBytes({
        'manifest.json': JSON.stringify(bpPackagePayload.manifest),
        'media/diagrams/onload.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="10"/></svg>'
      });
      const maliciousZipSlip = buildSimpleStoreZipBytes({
        '../../etc/passwd': 'root:x:0:0'
      });

      for (const [label, badZip] of [
        ['.exe executable', maliciousExeZip],
        ['.js script', maliciousJsZip],
        ['.html page', maliciousHtmlZip],
        ['XSS <script> inside .svg', maliciousScriptSvgZip],
        ['XSS onload= inside .svg', maliciousOnloadSvgZip],
        ['Zip Slip traversal', maliciousZipSlip]
      ] as const) {
        const inspectRes = await inspectAndExtractSafeZipPackage(badZip);
        assertCondition(
          inspectRes.inspection.safe === false,
          `Acceptance Test 9 failed: ZIP security inspector must block ${label}`
        );
        const atomicBadRes = await executeAtomicPackageImport(badZip, {
          mode: 'merge',
          fileNameHint: `malicious-${label}.zip`
        });
        assertCondition(
          atomicBadRes.result.success === false,
          `Acceptance Test 9 failed: executeAtomicPackageImport must reject ${label}`
        );
      }

      console.log(
        '[PASS] 26. Mandatory 9 Acceptance Tests Verified (Blood Pressure ZIP Import, Safe SVG, Local PNG/MP3/MP4/PDF IDB Persistence, Cold Restart Survival, Deduplicated Re-import, Atomic Media Rollback & ZIP Security)'
      );
    } finally {
      if (typeof previousIndexedDB === 'undefined') {
        delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
      } else {
        (globalThis as unknown as { indexedDB: unknown }).indexedDB = previousIndexedDB;
      }
    }
  }

  console.log('================================================================');
  console.log('ALL AUTOMATED RELEASE VERIFICATION CHECKS PASSED (26/26 — 100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
