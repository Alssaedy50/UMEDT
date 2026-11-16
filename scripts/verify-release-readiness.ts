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
  verifyPackageSignature
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
  loadMedicalSubjects
} from '../src/services/learningHierarchyService';
import { saveLocalMediaRecord } from '../src/services/mediaStorageService';
import {
  computeEntitySha256,
  deduplicateTopicMediaAndAttachments,
  enqueueEntitiesForCloudSync,
  processCloudSyncQueue,
  loadSyncQueue,
  setCloudSyncSimulatedOffline,
  buildCloudLibraryCatalogView,
  downloadCloudLibraryTarget,
  deleteCloudLibraryTargetLocally,
  clearLocallyRemovedRegistry
} from '../src/services/cloudLibrarySyncService';

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
    DEFAULT_ONLINE_UPDATE_CONFIG.manifestUrl === '',
    'Optional CDN medical-data publishing must NOT be activated by default'
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

  // 16. [Unified Cloud Library, Offline Sync Queue, SHA-256 Deduplication, Selective Download & Local-Only Deletion]
  clearLocallyRemovedRegistry();
  setCloudSyncSimulatedOffline(true);

  const initialStateForCloud = loadAppState();
  const testCloudTopic = {
    ...initialStateForCloud.topics[0],
    id: 'topic-cloud-test-sync-1',
    title: 'موضوع اختبار المكتبة السحابية الموحدة',
    titleEn: 'Unified Cloud Library Test Topic',
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
    offlineCatalogView.overallSyncStatus === 'pending' && offlineCatalogView.pendingCount >= 1,
    `Expected Sync Engine status 'pending' while offline with queued items, got ${offlineCatalogView.overallSyncStatus}`
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

  // 16.4 Local-Only Deletion (Topic, Subject, Block) & Re-Appearance in Cloud Catalog
  const seedTopicToDelete = initialStateForCloud.topics[0];
  const seedTopicHash = await computeEntitySha256('topic', seedTopicToDelete);
  assertCondition(seedTopicHash.length === 64, 'Expected 64-char SHA-256 hex digest');

  const afterTopicDelete = await deleteCloudLibraryTargetLocally({
    targetType: 'topic',
    targetId: seedTopicToDelete.id,
    currentTopics: initialStateForCloud.topics,
    currentTerms: initialStateForCloud.terms,
    currentSentences: initialStateForCloud.sentences
  });
  saveTopics(afterTopicDelete.updatedTopics);
  assertCondition(
    afterTopicDelete.success &&
      afterTopicDelete.removedTopicsCount === 1 &&
      !afterTopicDelete.updatedTopics.some((t) => t.id === seedTopicToDelete.id),
    'Local deletion of a Topic must remove it completely from local topics list'
  );

  // Verify loadAppState() also respects local deletion of built-in seed topic
  const reloadedAfterTopicDelete = loadAppState();
  assertCondition(
    !reloadedAfterTopicDelete.topics.some((t) => t.id === seedTopicToDelete.id),
    'loadAppState() must not re-inject a locally deleted seed topic until re-downloaded'
  );

  // Verify the deleted topic still appears in Cloud Catalog as Not Downloaded (المكتبة السحابية)
  const catalogAfterTopicDelete = buildCloudLibraryCatalogView({
    localTopics: afterTopicDelete.updatedTopics,
    localTerms: afterTopicDelete.updatedTerms,
    localSentences: initialStateForCloud.sentences
  });
  const deletedTopicCatalogEntry = catalogAfterTopicDelete.blocks
    .flatMap((b) => b.subjects)
    .flatMap((s) => s.topics)
    .find((t) => t.id === seedTopicToDelete.id);
  assertCondition(
    Boolean(deletedTopicCatalogEntry && deletedTopicCatalogEntry.isDownloaded === false),
    'Locally deleted topic must remain visible in the Cloud Library catalog with isDownloaded === false'
  );

  // 16.5 Selective Re-Download of Individual Topic + SHA-256 Deduplication Check
  const redownloadTopicRes = await downloadCloudLibraryTarget({
    targetType: 'topic',
    targetId: seedTopicToDelete.id,
    currentTopics: afterTopicDelete.updatedTopics,
    currentTerms: afterTopicDelete.updatedTerms,
    currentSentences: initialStateForCloud.sentences
  });
  saveTopics(redownloadTopicRes.updatedTopics);
  assertCondition(
    redownloadTopicRes.success &&
      redownloadTopicRes.downloadedTopicsCount === 1 &&
      redownloadTopicRes.updatedTopics.some((t) => t.id === seedTopicToDelete.id),
    'Selective download of a single Topic must restore it to local storage'
  );

  // Downloading the same already-downloaded topic again must skip identical SHA-256 content
  const redundantDownloadRes = await downloadCloudLibraryTarget({
    targetType: 'topic',
    targetId: seedTopicToDelete.id,
    currentTopics: redownloadTopicRes.updatedTopics,
    currentTerms: redownloadTopicRes.updatedTerms,
    currentSentences: redownloadTopicRes.updatedSentences
  });
  assertCondition(
    redundantDownloadRes.success &&
      redundantDownloadRes.downloadedTopicsCount === 0 &&
      redundantDownloadRes.skippedIdenticalCount >= 1,
    'Downloading an already-downloaded topic with matching SHA-256 hash must skip re-downloading identical records'
  );

  // 16.6 Local Deletion & Selective Re-Download of an Entire Block (with its Subjects & Topics)
  const allBlocksBefore = loadMedicalBlocks();
  const targetBlockToTest = allBlocksBefore[0];
  const afterBlockDelete = await deleteCloudLibraryTargetLocally({
    targetType: 'block',
    targetId: targetBlockToTest.id,
    currentTopics: redownloadTopicRes.updatedTopics,
    currentTerms: redownloadTopicRes.updatedTerms,
    currentSentences: redownloadTopicRes.updatedSentences
  });
  saveTopics(afterBlockDelete.updatedTopics);
  assertCondition(
    afterBlockDelete.success && !loadMedicalBlocks().some((b) => b.id === targetBlockToTest.id),
    'Deleting a Block locally must remove it from local loadMedicalBlocks()'
  );

  const catalogAfterBlockDelete = buildCloudLibraryCatalogView({
    localTopics: afterBlockDelete.updatedTopics,
    localTerms: afterBlockDelete.updatedTerms,
    localSentences: redownloadTopicRes.updatedSentences
  });
  const blockCatalogEntry = catalogAfterBlockDelete.blocks.find(
    (b) => b.id === targetBlockToTest.id
  );
  assertCondition(
    Boolean(blockCatalogEntry && blockCatalogEntry.downloadedTopicsCount === 0),
    'Locally deleted Block must still appear in Cloud Catalog with 0 downloaded topics'
  );

  const redownloadBlockRes = await downloadCloudLibraryTarget({
    targetType: 'block',
    targetId: targetBlockToTest.id,
    currentTopics: afterBlockDelete.updatedTopics,
    currentTerms: afterBlockDelete.updatedTerms,
    currentSentences: redownloadTopicRes.updatedSentences
  });
  saveTopics(redownloadBlockRes.updatedTopics);
  assertCondition(
    redownloadBlockRes.success &&
      loadMedicalBlocks().some((b) => b.id === targetBlockToTest.id) &&
      loadMedicalSubjects().length > 0,
    'Selective download of a Block must restore the Block, its Subjects, and its Topics to local storage'
  );

  clearLocallyRemovedRegistry();
  console.log(
    '[PASS] 16. Unified Cloud Library, Automatic Sync Queue, SHA-256 Deduplication, Selective Download & Local Deletion Verified'
  );
  console.log('================================================================');
  console.log('ALL AUTOMATED RELEASE VERIFICATION CHECKS PASSED (16/16 — 100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
