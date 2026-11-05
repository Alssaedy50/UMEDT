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

  // 1. Verify Architecture & Versioning Separation (Stage 6 APK v2.2.1)
  assertCondition(APP_VERSION === '2.2.1', `Expected APP_VERSION 2.2.1, got ${APP_VERSION}`);
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
      apkWorkflowContent.includes('UMED-2-v2.2.1-debug-apk') &&
      apkWorkflowContent.includes('UMED-2-v2.2.1-release-apk') &&
      apkWorkflowContent.includes('VITE_UMED_MANIFEST_URL') &&
      apkWorkflowContent.includes('VITE_UMED_PUBLIC_KEY_PEM'),
    'android-apk-release.yml must build v2.2.1 Debug/Release APKs with Cloud OTA env vars'
  );

  const gradleContent = fs.readFileSync(androidBuildGradlePath, 'utf8');
  assertCondition(
    gradleContent.includes('org.umed2.dictengine') &&
      gradleContent.includes('versionCode 20201') &&
      gradleContent.includes('versionName "2.2.1"'),
    'android/app/build.gradle must use applicationId "org.umed2.dictengine", versionCode 20201, and versionName "2.2.1"'
  );
  console.log('[PASS] 3. Capacitor Native Android Project (v2.2.1 / 20201) & Bundled Local Web Assets Synced');

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
        !/CLOUDFLARE_API_TOKEN\s*=\s*[a-zA-Z0-9_-]{10,}/.test(content),
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
  console.log('================================================================');
  console.log('ALL AUTOMATED RELEASE VERIFICATION CHECKS PASSED (13/13 — 100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
