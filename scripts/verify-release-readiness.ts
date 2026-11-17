import fs from 'fs';
import http from 'http';
import path from 'path';
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
  saveTopics,
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
  loadAcademicBooks,
  loadAcademicExams,
  loadMediaAssetsIndex,
  loadUserStudyNotes,
  saveUserStudyNotes,
  saveBookReadingProgress,
  toggleBookFavorite,
  normalizeMediaAssetRecord,
  saveAcademicBooks
} from '../src/services/learningHierarchyService';
import {
  saveLocalMediaRecord,
  getLocalMediaRecord,
  detectExternalMediaKind,
  downloadRemoteMediaToOfflineCache,
  openMediaInExternalApp
} from '../src/services/mediaStorageService';
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
  clearLocallyRemovedRegistry,
  canonicalizeForHash
} from '../src/services/cloudLibrarySyncService';
import { importUniversalAiOrLocalContent } from '../src/services/aiUniversalImportService';
import {
  encryptBotTokenForStorage,
  decryptBotTokenFromStorage,
  redactBotTokenFromText,
  stripBinaryMediaFromTopicsForBackup,
  loadTelegramBackupConfig,
  saveTelegramBackupConfig,
  readRawTelegramConfigJsonForAudit,
  createUnifiedBackupPackage,
  sendBackupToTelegram,
  scheduleDebouncedTelegramAutoSync,
  flushPendingTelegramAutoSync,
  uploadPendingMediaToTelegramChannel
} from '../src/services/telegramBackupService';
import {
  generateStandaloneHtmlDocument,
  generateStandaloneZipArchiveBytes,
  inspectZipEntriesList
} from '../src/services/standaloneExportService';

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

  // 1. Verify Architecture & Versioning Separation (Stage 6 APK v2.4.0)
  assertCondition(APP_VERSION === '2.4.0', `Expected APP_VERSION 2.4.0, got ${APP_VERSION}`);
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

  // 2. Verify Cloudflare Pages Configuration, package-lock.json & Production Build Assets
  const packageLockPath = path.join(ROOT_DIR, 'package-lock.json');
  const redirectsPath = path.join(ROOT_DIR, 'public', '_redirects');
  const headersPath = path.join(ROOT_DIR, 'public', '_headers');
  const wranglerPath = path.join(ROOT_DIR, 'wrangler.toml');
  const cfWorkflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'cloudflare-pages.yml');
  const distIndexPath = path.join(ROOT_DIR, 'dist', 'index.html');
  const distSwPath = path.join(ROOT_DIR, 'dist', 'sw.js');
  const distManifestPath = path.join(ROOT_DIR, 'dist', 'manifest.webmanifest');

  assertCondition(fs.existsSync(packageLockPath), 'package-lock.json must exist for npm ci');
  const lockfileJson = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  assertCondition(
    typeof lockfileJson.lockfileVersion === 'number' && lockfileJson.lockfileVersion >= 2,
    'package-lock.json must have a valid lockfileVersion >= 2'
  );
  assertCondition(fs.existsSync(redirectsPath), 'public/_redirects must exist');
  assertCondition(
    fs.readFileSync(redirectsPath, 'utf8').includes('/* /index.html 200'),
    'public/_redirects must configure SPA fallback /* /index.html 200'
  );
  assertCondition(fs.existsSync(headersPath), 'public/_headers must exist');
  assertCondition(fs.existsSync(wranglerPath), 'wrangler.toml must exist');
  assertCondition(fs.existsSync(cfWorkflowPath), 'cloudflare-pages.yml workflow must exist');
  const cfWorkflowContent = fs.readFileSync(cfWorkflowPath, 'utf8');
  const cfBuildIndex = cfWorkflowContent.indexOf('run: npm run build');
  const cfTestIndex = cfWorkflowContent.indexOf('run: npm test');
  assertCondition(
    cfBuildIndex !== -1 && cfTestIndex !== -1 && cfBuildIndex < cfTestIndex,
    'cloudflare-pages.yml must execute npm run build before npm test'
  );
  assertCondition(fs.existsSync(distIndexPath), 'dist/index.html must exist');
  assertCondition(fs.existsSync(distSwPath), 'dist/sw.js PWA service worker must exist');
  assertCondition(fs.existsSync(distManifestPath), 'dist/manifest.webmanifest must exist');
  console.log('[PASS] 2. Cloudflare Pages Config (_redirects, _headers, wrangler.toml), package-lock.json & PWA Build Assets');

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
      apkWorkflowContent.includes('UMED-2-v2.4.0-debug-apk') &&
      apkWorkflowContent.includes('UMED-2-v2.4.0-release-apk') &&
      apkWorkflowContent.includes('VITE_UMED_MANIFEST_URL') &&
      apkWorkflowContent.includes('VITE_UMED_PUBLIC_KEY_PEM'),
    'android-apk-release.yml must build v2.4.0 Debug/Release APKs with Cloud OTA env vars'
  );

  const gradleContent = fs.readFileSync(androidBuildGradlePath, 'utf8');
  assertCondition(
    gradleContent.includes('org.umed2.dictengine') &&
      gradleContent.includes('versionCode 20400') &&
      gradleContent.includes('versionName "2.4.0"'),
    'android/app/build.gradle must use applicationId "org.umed2.dictengine", versionCode 20400, and versionName "2.4.0"'
  );
  console.log('[PASS] 3. Capacitor Native Android Project (v2.4.0 / 20400) & Bundled Local Web Assets Synced');

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

  const exportedJson = exportFullDatabaseJson({
    terms: initialState.terms,
    sentences: initialState.sentences,
    topics: initialState.topics,
    customAffixes: initialState.customAffixes,
    customAbbreviations: initialState.customAbbreviations,
    studyStats: { gotIt: 42, needsReview: 7 },
    versionMetadata: initialState.versionMetadata
  });
  const exportedZipBytes = exportFullDatabaseZipBytes({
    terms: initialState.terms,
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
    'Both JSON and ZIP cross-environment data transfer packages must import cleanly'
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

  // Verify publisher succeeds when valid matching permanent keys are provided (in-memory without writing artifacts)
  const publishedTest = await executeProductionDataReleasePublish({
    privateKeyPem: keyGenA.privateKeyPem,
    publicKeyPem: keyGenA.publicKeyPem,
    writeArtifacts: false
  });
  assertCondition(
    publishedTest.bundle.signatureAlgorithm === 'ECDSA-P256-SHA256' &&
      publishedTest.bundle.keyFingerprintSha256 === keyGenA.fingerprintSha256 &&
      Boolean(publishedTest.bundle.signature),
    'Publisher must build and sign release bundle with matching permanent keys'
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
    initialStateForCloud.terms.length >= 40 &&
      initialStateForCloud.topics.length === 0 &&
      loadMedicalBlocks().length === 0,
    `Expected post-install state to contain only dictionary terms (terms=${initialStateForCloud.terms.length}) with local topics=0 and blocks=0, got topics=${initialStateForCloud.topics.length}, blocks=${loadMedicalBlocks().length}`
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
      settingsTsxContent.includes('max={125}') &&
      settingsTsxContent.includes("id: 'almarai'") &&
      settingsTsxContent.includes("id: 'readex'") &&
      settingsTsxContent.includes("id: 'kufi'") &&
      indexCssContent.includes('--color-slate-950'),
    'App.tsx, SettingsView.tsx, and index.css must enforce no Updates modal in Settings, 75-125 font scale, multiple fonts, and full-system themes'
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

  // Sync catalog online and verify >= 25 cloud topics are now fetched over the internet
  await syncWithRemoteCloudLibrary({
    localTopics: [],
    localTerms: initialStateForCloud.terms,
    localSentences: initialStateForCloud.sentences
  });
  const onlineCatalogView = buildCloudLibraryCatalogView({
    localTopics: [],
    localTerms: initialStateForCloud.terms,
    localSentences: initialStateForCloud.sentences
  });
  assertCondition(
    onlineCatalogView.totalCloudTopicsCount >= 25 && onlineCatalogView.blocks.length >= 4,
    `Expected online synced catalog to have >= 25 topics and >= 4 blocks, got topics=${onlineCatalogView.totalCloudTopicsCount}, blocks=${onlineCatalogView.blocks.length}`
  );

  // 16.4 Selective Download of Individual Topic from Cloud Library (Online) + SHA-256 Deduplication Check
  const firstCloudTopicId = onlineCatalogView.blocks[0].subjects[0].topics[0].id;
  const downloadSingleTopicRes = await downloadCloudLibraryTarget({
    targetType: 'topic',
    targetId: firstCloudTopicId,
    currentTopics: [],
    currentTerms: initialStateForCloud.terms,
    currentSentences: initialStateForCloud.sentences
  });
  saveTopics(downloadSingleTopicRes.updatedTopics);
  assertCondition(
    downloadSingleTopicRes.success &&
      downloadSingleTopicRes.downloadedTopicsCount === 1 &&
      downloadSingleTopicRes.updatedTopics.some((t) => t.id === firstCloudTopicId),
    'Selective download of a single Topic from Cloud Library must store it in local storage'
  );

  const downloadedTopicObj = downloadSingleTopicRes.updatedTopics[0];
  const downloadedTopicHash = await computeEntitySha256('topic', downloadedTopicObj);
  assertCondition(downloadedTopicHash.length === 64, 'Expected 64-char SHA-256 hex digest');

  // Downloading the same already-downloaded topic again must skip identical SHA-256 content
  const redundantDownloadRes = await downloadCloudLibraryTarget({
    targetType: 'topic',
    targetId: firstCloudTopicId,
    currentTopics: downloadSingleTopicRes.updatedTopics,
    currentTerms: downloadSingleTopicRes.updatedTerms,
    currentSentences: downloadSingleTopicRes.updatedSentences
  });
  assertCondition(
    redundantDownloadRes.success &&
      redundantDownloadRes.downloadedTopicsCount === 0 &&
      redundantDownloadRes.skippedIdenticalCount >= 1,
    'Downloading an already-downloaded topic with matching SHA-256 hash must skip re-downloading identical records'
  );

  // 16.5 Local-Only Deletion of Topic & Re-Appearance in Cloud Catalog
  const afterTopicDelete = await deleteCloudLibraryTargetLocally({
    targetType: 'topic',
    targetId: firstCloudTopicId,
    currentTopics: downloadSingleTopicRes.updatedTopics,
    currentTerms: downloadSingleTopicRes.updatedTerms,
    currentSentences: initialStateForCloud.sentences
  });
  saveTopics(afterTopicDelete.updatedTopics);
  assertCondition(
    afterTopicDelete.success &&
      afterTopicDelete.removedTopicsCount === 1 &&
      !afterTopicDelete.updatedTopics.some((t) => t.id === firstCloudTopicId),
    'Local deletion of a Topic must remove it completely from local topics list'
  );

  const catalogAfterTopicDelete = buildCloudLibraryCatalogView({
    localTopics: afterTopicDelete.updatedTopics,
    localTerms: afterTopicDelete.updatedTerms,
    localSentences: initialStateForCloud.sentences
  });
  const deletedTopicCatalogEntry = catalogAfterTopicDelete.blocks
    .flatMap((b) => b.subjects)
    .flatMap((s) => s.topics)
    .find((t) => t.id === firstCloudTopicId);
  assertCondition(
    Boolean(deletedTopicCatalogEntry && deletedTopicCatalogEntry.isDownloaded === false),
    'Locally deleted topic must remain visible in the Cloud Library catalog with isDownloaded === false'
  );

  // 16.6 Selective Download & Local Deletion of an Entire Block (with its Subjects & Topics)
  const targetBlockId = onlineCatalogView.blocks[0].id;
  const downloadBlockRes = await downloadCloudLibraryTarget({
    targetType: 'block',
    targetId: targetBlockId,
    currentTopics: afterTopicDelete.updatedTopics,
    currentTerms: afterTopicDelete.updatedTerms,
    currentSentences: initialStateForCloud.sentences
  });
  saveTopics(downloadBlockRes.updatedTopics);
  assertCondition(
    downloadBlockRes.success &&
      loadMedicalBlocks().some((b) => b.id === targetBlockId) &&
      loadMedicalSubjects().length > 0 &&
      downloadBlockRes.updatedTopics.length > 0,
    'Selective download of a Block must download the Block, its Subjects, and its Topics to local storage'
  );

  const afterBlockDelete = await deleteCloudLibraryTargetLocally({
    targetType: 'block',
    targetId: targetBlockId,
    currentTopics: downloadBlockRes.updatedTopics,
    currentTerms: downloadBlockRes.updatedTerms,
    currentSentences: downloadBlockRes.updatedSentences
  });
  saveTopics(afterBlockDelete.updatedTopics);
  assertCondition(
    afterBlockDelete.success && !loadMedicalBlocks().some((b) => b.id === targetBlockId),
    'Deleting a Block locally must remove it from local loadMedicalBlocks()'
  );

  clearLocallyRemovedRegistry();
  console.log(
    '[PASS] 16. Post-Install Dictionary-Only State, Unified Cloud Library, Automatic Sync Queue, SHA-256 Deduplication, Selective Download & Local Deletion Verified'
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

  const umedtPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4\n
  const mockBookPdfUrl = 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/media/cardio_atlas.pdf';

  const masterPayloads: Record<string, unknown> = {
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/blocks.json': {
      blocks: [
        {
          id: 'blk-umedt-data-1',
          code: 'BLK-UD1',
          titleEn: 'Cardiopulmonary Block',
          titleAr: 'بلوك القلب والتنفس',
          descriptionEn: 'Cardiopulmonary sciences',
          descriptionAr: 'علوم القلب والجهاز التنفسي',
          colorAccent: 'emerald',
          order: 10,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/subjects.json': {
      subjects: [
        {
          id: 'subj-umedt-data-1',
          blockId: 'blk-umedt-data-1',
          code: 'CARD-201',
          titleEn: 'Clinical Cardiology',
          titleAr: 'أمراض القلب السريرية',
          descriptionEn: 'Clinical cardiology topics',
          descriptionAr: 'مواضيع القلب السريرية',
          order: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/topics.json': {
      topics: [
        {
          id: 'topic-umedt-data-1',
          blockId: 'blk-umedt-data-1',
          subjectId: 'subj-umedt-data-1',
          title: 'Acute Coronary Syndrome',
          titleEn: 'Acute Coronary Syndrome',
          titleAr: 'المتلازمة التاجية الحادة',
          subtitle: 'ECG & Troponin Pathway',
          category: 'Cardiology',
          system: 'Cardiovascular',
          difficulty: 'Intermediate',
          summary: 'Diagnostic pathway for STEMI and NSTEMI.',
          keyTakeaways: ['Obtain 12-lead ECG within 10 minutes'],
          sections: [
            {
              id: 'sec-ud-1',
              title: 'Algorithm',
              body: 'Follow reperfusion pathway.',
              contentBlocks: [
                {
                  id: 'cb-ud-diag',
                  type: 'diagram',
                  title: 'ACS ECG Flowchart',
                  diagramSvg: '<svg viewBox="0 0 120 40"><rect width="120" height="40" fill="#ecfdf5"/><text x="10" y="25">ECG &lt; 10m</text></svg>'
                },
                {
                  id: 'cb-ud-pdf',
                  type: 'pdf_viewer',
                  title: 'Guidelines PDF',
                  url: mockBookPdfUrl
                },
                {
                  id: 'cb-ud-book',
                  type: 'book_reference',
                  title: 'Cardio Atlas Reference',
                  bookId: 'book-umedt-data-1'
                },
                {
                  id: 'cb-ud-exam',
                  type: 'exam_link',
                  title: 'ACS Mastery Exam',
                  examId: 'exam-umedt-data-1'
                }
              ]
            }
          ],
          linkedTermIds: ['term-umedt-data-1'],
          linkedTerms: ['Ischemia'],
          tags: ['ACS'],
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/terms.json': {
      terms: [
        {
          id: 'term-umedt-data-1',
          term: 'Ischemia',
          arabicTranslation: 'نقص التروية',
          category: 'Cardiology',
          definition: 'Restricted blood supply to tissues.',
          arabicSummary: 'انخفاض تدفق الدم والأكسجين إلى الأنسجة',
          exampleSentence: 'Myocardial ischemia causes angina.',
          exampleTranslation: 'يسبب نقص تروية عضلة القلب ذبحة صدرية.',
          pronunciation: '/ɪˈskiːmiə/',
          tags: ['Cardio'],
          rootBreakdown: { root: 'isch- (hold back) + -emia (blood)' },
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/sentences.json': {
      sentences: [
        {
          id: 'sent-umedt-data-1',
          english: 'ST-segment elevation indicates transmural myocardial injury.',
          arabic: 'يشير ارتفاع قطعة ST إلى إصابة عابرة لجدار عضلة القلب.',
          termIds: ['term-umedt-data-1'],
          sourceTopicId: 'topic-umedt-data-1'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/custom_affixes.json': {
      affixes: [
        {
          id: 'affix-umedt-1',
          affix: 'isch-',
          type: 'prefix',
          meaning: 'Hold back / deficient',
          meaningAr: 'احتباس / نقص',
          examples: ['Ischemia'],
          notes: 'Greek root'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/custom_abbreviations.json': {
      abbreviations: [
        {
          id: 'abbr-umedt-1',
          abbr: 'STEMI',
          expansion: 'ST-Elevation Myocardial Infarction',
          arabicMeaning: 'احتشاء عضلة القلب المصحوب بارتفاع ST',
          clinicalContext: 'Emergency cardiology'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/books.json': {
      books: [
        {
          id: 'book-umedt-data-1',
          title: 'Cardio Atlas',
          titleEn: 'Cardio Atlas',
          titleAr: 'أطلس أمراض القلب',
          authors: 'UMEDT Editorial',
          blockId: 'blk-umedt-data-1',
          subjectId: 'subj-umedt-data-1',
          pdfUrl: mockBookPdfUrl,
          sizeBytes: 9,
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/questions.json': {
      questions: [
        {
          id: 'q-umedt-data-1',
          type: 'single_choice',
          prompt: 'Which ECG finding confirms STEMI?',
          promptAr: 'أي علامة في تخطيط القلب تؤكد STEMI؟',
          options: [
            { id: 'a', text: 'ST-segment elevation', textAr: 'ارتفاع قطعة ST', isCorrect: true },
            { id: 'b', text: 'Isolated U wave', textAr: 'موجة U معزولة', isCorrect: false }
          ],
          correctOptionIds: ['a'],
          explanation: 'Persistent ST elevation in contiguous leads defines STEMI.',
          explanationAr: 'ارتفاع قطعة ST المستمر في اتجاهات متجاورة يحدد STEMI.',
          difficulty: 'medium',
          topicId: 'topic-umedt-data-1',
          blockId: 'blk-umedt-data-1',
          subjectId: 'subj-umedt-data-1',
          termId: 'term-umedt-data-1'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/exams.json': {
      exams: [
        {
          id: 'exam-umedt-data-1',
          title: 'Cardiology Midterm',
          titleEn: 'Cardiology Midterm',
          titleAr: 'اختبار منتصف بلوك القلب',
          blockId: 'blk-umedt-data-1',
          subjectId: 'subj-umedt-data-1',
          topicIds: ['topic-umedt-data-1'],
          questionIds: ['q-umedt-data-1'],
          timeLimitMinutes: 15,
          passingScorePercent: 70,
          updatedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    },
    'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/media_assets.json': {
      mediaAssets: [
        {
          id: 'asset-umedt-1',
          title: 'Cardio Atlas PDF',
          kind: 'pdf',
          url: mockBookPdfUrl,
          sizeBytes: 9,
          mimeType: 'application/pdf'
        }
      ]
    }
  };

  const catalogCollections: Array<{ id: string; contentType: string; rendererType: string; rawUrl: string; sha256: string }> = [
    { id: 'blocks', contentType: 'blocks', rendererType: 'block_hub', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/blocks.json', sha256: 'hash-blocks-v1' },
    { id: 'subjects', contentType: 'subjects', rendererType: 'subject_list', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/subjects.json', sha256: 'hash-subjects-v1' },
    { id: 'topics', contentType: 'topics', rendererType: 'topic_article', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/topics.json', sha256: 'hash-topics-v1' },
    { id: 'terms', contentType: 'terms', rendererType: 'lexicon_term', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/terms.json', sha256: 'hash-terms-v1' },
    { id: 'sentences', contentType: 'sentences', rendererType: 'bilingual_sentence', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/sentences.json', sha256: 'hash-sentences-v1' },
    { id: 'customAffixes', contentType: 'affixes', rendererType: 'morphology_rule', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/custom_affixes.json', sha256: 'hash-affixes-v1' },
    { id: 'customAbbreviations', contentType: 'abbreviations', rendererType: 'clinical_abbr', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/custom_abbreviations.json', sha256: 'hash-abbr-v1' },
    { id: 'books', contentType: 'books', rendererType: 'academic_book', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/books.json', sha256: 'hash-books-v1' },
    { id: 'questions', contentType: 'questions', rendererType: 'quiz_question', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/questions.json', sha256: 'hash-questions-v1' },
    { id: 'exams', contentType: 'exams', rendererType: 'academic_exam', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/exams.json', sha256: 'hash-exams-v1' },
    { id: 'mediaAssets', contentType: 'mediaAssets', rendererType: 'media_asset', rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/media_assets.json', sha256: 'hash-media-v1' }
  ];

  const mockUmedtFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr === UMEDT_DATA_CATALOG_URL) {
      return new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          version: '2026.11.0-umedt-data',
          collections: catalogCollections
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr === mockBookPdfUrl) {
      return new Response(umedtPdfBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' }
      });
    }
    if (masterPayloads[urlStr]) {
      return new Response(JSON.stringify(masterPayloads[urlStr]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  // 18.1 UMEDT-DATA Repository Sync + Incremental SHA-256 Collection Skip
  const umedtSyncFirst = await syncFromUmedtDataRepository({
    customFetch: mockUmedtFetch
  });
  assertCondition(
    umedtSyncFirst.fetched === true &&
      umedtSyncFirst.updatedCollectionsCount === 11 &&
      umedtSyncFirst.skippedCollectionsCount === 0 &&
      (umedtSyncFirst.incoming.books?.length || 0) === 1 &&
      (umedtSyncFirst.incoming.exams?.length || 0) === 1 &&
      (umedtSyncFirst.incoming.quizQuestions?.length || 0) === 1 &&
      (umedtSyncFirst.incoming.topics?.[0]?.sections?.[0]?.contentBlocks?.length || 0) === 4,
    'syncFromUmedtDataRepository must fetch and parse all 11 UMEDT-DATA master collections including books, exams, questions, and new ContentBlockTypes'
  );

  const umedtSyncSecond = await syncFromUmedtDataRepository({
    currentCollectionHashes: umedtSyncFirst.collectionHashes,
    customFetch: mockUmedtFetch
  });
  assertCondition(
    umedtSyncSecond.fetched === true &&
      umedtSyncSecond.updatedCollectionsCount === 0 &&
      umedtSyncSecond.skippedCollectionsCount === 11,
    'syncFromUmedtDataRepository must skip unchanged collections on subsequent syncs when SHA-256 matches'
  );

  // 18.2 Full syncWithRemoteCloudLibrary integration with UMEDT-DATA + Offline Book PDF Prefetch
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
      (fullSyncRes.mirror.books?.length || 0) >= 1 &&
        (fullSyncRes.mirror.exams?.length || 0) >= 1 &&
        (fullSyncRes.mirror.quizQuestions?.length || 0) >= 1,
      'syncWithRemoteCloudLibrary must index UMEDT-DATA books, exams, and questions into the cloud mirror catalog'
    );

    const catalogBeforeBookDownload = buildCloudLibraryCatalogView({
      localTopics: fullSyncRes.autoMergedTopics,
      localTerms: fullSyncRes.autoMergedTerms,
      localSentences: fullSyncRes.autoMergedSentences
    });
    assertCondition(
      catalogBeforeBookDownload.books.some((b) => b.id === 'book-umedt-data-1' && !b.isDownloaded) &&
        catalogBeforeBookDownload.totalCloudExamsCount >= 1,
      'Cloud catalog must display UMEDT-DATA book as cloud-available before selective download'
    );

    const bookDownloadRes = await downloadCloudLibraryTarget({
      targetType: 'book',
      targetId: 'book-umedt-data-1',
      currentTopics: fullSyncRes.autoMergedTopics,
      currentTerms: fullSyncRes.autoMergedTerms,
      currentSentences: fullSyncRes.autoMergedSentences,
      customFetch: mockUmedtFetch
    });
    const prefetchedKey = `idb-${computeDeterministicFastHashHex(mockBookPdfUrl).slice(0, 16)}`;
    const prefetchedPdfRecord = await getLocalMediaRecord(prefetchedKey);
    assertCondition(
      bookDownloadRes.success &&
        loadAcademicBooks().some((b) => b.id === 'book-umedt-data-1') &&
        bookDownloadRes.downloadedMediaCount >= 1 &&
        Boolean(prefetchedPdfRecord) &&
        prefetchedPdfRecord?.mimeType === 'application/pdf',
      'Downloading a cloud book must persist it locally and prefetch its remote PDF into IndexedDB under its deterministic hashed key'
    );

    const topicDownloadRes = await downloadCloudLibraryTarget({
      targetType: 'topic',
      targetId: 'topic-umedt-data-1',
      currentTopics: bookDownloadRes.updatedTopics,
      currentTerms: bookDownloadRes.updatedTerms,
      currentSentences: bookDownloadRes.updatedSentences,
      customFetch: mockUmedtFetch
    });
    assertCondition(
      topicDownloadRes.success &&
        loadAcademicExams().some((e) => e.id === 'exam-umedt-data-1'),
      'Downloading a cloud topic must also pull its linked UMEDT-DATA exam blueprint locally'
    );

    const bookDeleteRes = await deleteCloudLibraryTargetLocally({
      targetType: 'book',
      targetId: 'book-umedt-data-1',
      currentTopics: topicDownloadRes.updatedTopics,
      currentTerms: topicDownloadRes.updatedTerms,
      currentSentences: topicDownloadRes.updatedSentences
    });
    assertCondition(
      bookDeleteRes.success && !loadAcademicBooks().some((b) => b.id === 'book-umedt-data-1'),
      'Deleting a downloaded book locally must remove it from local device storage while preserving cloud availability'
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
      aiImportRes.counts.blocks === 1 &&
      aiImportRes.counts.subjects === 1 &&
      aiImportRes.counts.topics === 1 &&
      aiImportRes.counts.books === 1 &&
      aiImportRes.counts.exams === 1 &&
      aiImportRes.counts.questions === 7 &&
      (!existingFavoriteTermId ||
        (preservedFirstTerm?.favorite === true &&
          preservedFirstTerm?.collections?.includes('custom-star-deck') &&
          preservedFirstTerm?.srsData?.interval === 14)),
    'Universal AI importer must parse Markdown JSON from ChatGPT/Gemini across all entity types while preserving favorite, collections, and SRS progress'
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
        sha256: 'h-topics-v2'
      },
      {
        id: 'books',
        contentType: 'book',
        rendererType: 'book_pdf_reader',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/books.json',
        sha256: 'h-books-v2'
      },
      {
        id: 'exams',
        contentType: 'exam',
        rendererType: 'exam_blueprint',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/exams.json',
        sha256: 'h-exams-v2'
      },
      {
        id: 'media',
        contentType: 'media',
        rendererType: 'media_gallery',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/media-index.json',
        sha256: 'h-media-v2'
      },
      {
        id: 'flashcards',
        contentType: 'flashcard_deck',
        rendererType: 'generic_card',
        rawUrl: 'https://raw.githubusercontent.com/Alssaedy50/UMEDT-DATA/main/data/master/flashcards.json',
        sha256: 'h-flashcards-v2'
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
      return new Response(
        JSON.stringify([
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
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/books.json')) {
      return new Response(
        JSON.stringify([
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
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/exams.json')) {
      return new Response(
        JSON.stringify([
          {
            id: 'exam-v2-ecg',
            titleEn: 'ECG Mastery Quiz',
            titleAr: 'اختبار قراءة التخطيط',
            topicIds: ['topic-v2-ecg'],
            questionIds: ['q-ai-1'],
            passingScorePercent: 80,
            durationMinutes: 15
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/media-index.json')) {
      return new Response(
        JSON.stringify([
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
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/flashcards.json')) {
      return new Response(
        JSON.stringify([
          {
            id: 'fc-v2-1',
            titleEn: 'Murmurs High-Yield Deck',
            titleAr: 'ملخص النفخات القلبية',
            descriptionAr: 'مجموعة مكتشفة تلقائياً عبر contentTypesRegistry'
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
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

    const cloudSyncPropagated = await syncWithRemoteCloudLibrary({
      localTopics: loadAppState().topics,
      localTerms: loadAppState().terms,
      localSentences: loadAppState().sentences
    });
    assertCondition(
      Boolean(cloudSyncPropagated.autoMergedAffixes?.some((a) => a.id === 'aff-sec20-ectasis')) &&
        Boolean(
          cloudSyncPropagated.autoMergedAbbreviations?.some((ab) => ab.id === 'abbr-sec20-peep')
        ),
      'syncWithRemoteCloudLibrary must return autoMergedAffixes and autoMergedAbbreviations for React state propagation'
    );
  } finally {
    globalThis.fetch = sec20OrigFetch;
  }

  console.log(
    '[PASS] 20. UMEDT-DATA 13-File ZIP Assembly, Extended Atomic Import, Media Kind Fallback, Canonical Hash Stability, Strict 64-Hex SHA-256 Rejection & Affix/Abbreviation Sync Verified'
  );
  console.log('================================================================');
  console.log('ALL AUTOMATED RELEASE VERIFICATION CHECKS PASSED (20/20 — 100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
