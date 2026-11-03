/**
 * UMED-2 — Hardened Medical Data Release Publisher CLI
 *
 * Stage 2 Permanent Signing-Key Architecture:
 * - Never generates silent ephemeral signing keys.
 * - Fails immediately with a clear error if either permanent key is missing:
 *   `UMED_PUBLISHER_PRIVATE_KEY_PEM` and `VITE_UMED_PUBLIC_KEY_PEM` (or `UMED_PUBLISHER_PUBLIC_KEY_PEM`).
 * - Verifies that the private and public keys cryptographically match before publishing.
 * - Rejects invalid PEM key formats and unsupported signature algorithms.
 * - Uses `ECDSA-P256-SHA256` consistently.
 * - Ensures production publishing can never fall back to an unsigned release.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APP_VERSION,
  DB_SCHEMA_VERSION,
  BUNDLED_DATA_VERSION,
  DEFAULT_CDN_RELEASE_BASE_URL,
  PRODUCTION_SIGNATURE_ALGORITHM,
  assertValidSignatureAlgorithm,
  normalizePemString,
  verifyPublisherKeyPairMatch,
  suggestNextDataVersion,
  buildAndSignReleaseBundle
} from '../src/services/dataPlatformService';
import { autoEnrichAllTermsRelations } from '../src/engine/knowledgeLinker';
import { loadMasterMedicalRepository } from './validate-master-data';
import type { DataPackagePayload, PublishedReleaseBundle } from '../src/types/lexicon';
import {
  uploadReleaseBundleToR2,
  type R2UploadConfig,
  type R2UploadResult
} from './upload-release-to-r2';

export interface PublishDataReleaseOptions {
  env?: NodeJS.ProcessEnv;
  targetVersion?: string;
  channel?: 'stable' | 'beta';
  cdnBaseUrl?: string;
  packageDownloadUrl?: string;
  manifestUrl?: string;
  summary?: string;
  author?: string;
  signatureAlgorithm?: string;
  privateKeyPem?: string;
  publicKeyPem?: string;
  outputDir?: string;
  writeArtifacts?: boolean;
  uploadToR2?: boolean;
  r2Config?: R2UploadConfig;
}

export async function executeProductionDataReleasePublish(
  options: PublishDataReleaseOptions = {}
): Promise<{
  bundle: PublishedReleaseBundle;
  outputDir: string;
  packageOutPath: string;
  manifestOutPath: string;
  changelogOutPath: string;
  publicKeyOutPath: string;
  r2Result?: R2UploadResult;
}> {
  const env = options.env || process.env;

  const targetVersion =
    (options.targetVersion || env.UMED_RELEASE_VERSION || '').trim() ||
    suggestNextDataVersion(BUNDLED_DATA_VERSION, 'patch', 'stable', [BUNDLED_DATA_VERSION]);

  const channel: 'stable' | 'beta' =
    (options.channel || env.UMED_RELEASE_CHANNEL) === 'beta' ? 'beta' : 'stable';

  const cdnBaseUrl = (options.cdnBaseUrl || DEFAULT_CDN_RELEASE_BASE_URL).trim();

  const summary =
    (options.summary || env.UMED_RELEASE_SUMMARY || '').trim() ||
    `إصدار البيانات الطبية الموحد ${targetVersion} (UMEDT verified data release)`;

  const requestedAlgo = (
    options.signatureAlgorithm ||
    env.UMED_SIGNATURE_ALGORITHM ||
    PRODUCTION_SIGNATURE_ALGORITHM
  ).trim();

  // 1. Strictly enforce ECDSA-P256-SHA256 for production publishing
  const validatedAlgorithm = assertValidSignatureAlgorithm(requestedAlgo, {
    requireProductionEcdsa: true
  });

  // 2. Require permanent Private Key and Public Key (NO ephemeral key fallback allowed)
  const privateKeyPem = normalizePemString(
    options.privateKeyPem ?? env.UMED_PUBLISHER_PRIVATE_KEY_PEM ?? '',
    'PRIVATE KEY'
  );
  const publicKeyPem = normalizePemString(
    options.publicKeyPem ??
      env.VITE_UMED_PUBLIC_KEY_PEM ??
      env.UMED_PUBLISHER_PUBLIC_KEY_PEM ??
      '',
    'PUBLIC KEY'
  );

  if (!privateKeyPem) {
    throw new Error(
      '[UMED-2 Publisher] CRITICAL SECURITY ERROR: Missing permanent private signing key (UMED_PUBLISHER_PRIVATE_KEY_PEM). ' +
        'Ephemeral key generation is disabled in production. Configure UMED_PUBLISHER_PRIVATE_KEY_PEM in GitHub Actions Secrets before publishing.'
    );
  }

  if (!publicKeyPem) {
    throw new Error(
      '[UMED-2 Publisher] CRITICAL SECURITY ERROR: Missing permanent trusted public key (VITE_UMED_PUBLIC_KEY_PEM). ' +
        'Ephemeral key generation is disabled in production. Configure VITE_UMED_PUBLIC_KEY_PEM in GitHub Actions Variables before publishing.'
    );
  }

  // 3. Verify key formats and cryptographic pair matching before building the bundle
  const keyMatch = await verifyPublisherKeyPairMatch({
    privateKeyPem,
    publicKeyPem,
    algorithm: validatedAlgorithm,
    requireProductionEcdsa: true,
    strictPemHeaders: false
  });

  if (!keyMatch.valid) {
    throw new Error(
      `[UMED-2 Publisher] CRITICAL KEY VERIFICATION ERROR: Permanent signing keys failed validation or do not cryptographically match: ${
        keyMatch.reason || 'Key mismatch'
      }`
    );
  }

  const masterRepo = loadMasterMedicalRepository(process.cwd());
  const enrichedTerms = autoEnrichAllTermsRelations([...masterRepo.terms]);
  const syncedSentences = [...masterRepo.sentences];
  const topics = [...masterRepo.topics];
  const customAffixes = [...masterRepo.customAffixes];
  const customAbbreviations = [...masterRepo.customAbbreviations];

  const payload: DataPackagePayload = {
    manifest: {
      packageId: `umed2-pkg-${targetVersion}`,
      dataVersion: targetVersion,
      minAppVersion: APP_VERSION,
      schemaVersion: DB_SCHEMA_VERSION,
      releasedAt: new Date().toISOString(),
      channel,
      counts: {
        terms: enrichedTerms.length,
        sentences: syncedSentences.length,
        topics: topics.length,
        affixes: customAffixes.length,
        abbreviations: customAbbreviations.length
      }
    },
    terms: enrichedTerms,
    sentences: syncedSentences,
    topics,
    customAffixes,
    customAbbreviations
  };

  const rawR2PublicBase = (env.UMED_R2_PUBLIC_BASE_URL || '').trim();
  const r2PublicBase = rawR2PublicBase ? rawR2PublicBase.replace(/\/+$/, '') : '';
  const channelPrefix = channel === 'beta' ? 'beta' : 'stable';
  const defaultPackageFileName = `umed2-data-${targetVersion}.zip`;

  const defaultGithubDownloadUrl = `https://github.com/Alssaedy50/UMEDT/releases/download/data-v${targetVersion}/${defaultPackageFileName}`;
  const defaultGithubManifestUrl = `https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/${channelPrefix}/manifest.json`;

  const packageDownloadUrl =
    options.packageDownloadUrl ||
    (options.cdnBaseUrl
      ? `${options.cdnBaseUrl.replace(/\/+$/, '')}/${defaultPackageFileName}`
      : defaultGithubDownloadUrl);
  const manifestUrl =
    options.manifestUrl ||
    (options.cdnBaseUrl
      ? `${options.cdnBaseUrl.replace(/\/+$/, '')}/manifest.json`
      : defaultGithubManifestUrl);

  const bundle = await buildAndSignReleaseBundle({
    payload,
    targetVersion,
    installedDataVersion: BUNDLED_DATA_VERSION,
    channel,
    minAppVersion: APP_VERSION,
    schemaVersion: DB_SCHEMA_VERSION,
    cdnBaseUrl,
    packageDownloadUrl,
    manifestUrl,
    packageFormat: 'zip',
    summary,
    author: options.author || 'UMED-2 Release Automation',
    privateKeyPem,
    publicKeyPem,
    signatureAlgorithm: validatedAlgorithm
  });

  if (!bundle.signature || !bundle.sha256) {
    throw new Error(
      '[UMED-2 Publisher] CRITICAL ERROR: Release bundle is missing a cryptographic signature or SHA-256 digest. Unsigned releases are strictly prohibited.'
    );
  }

  const outDir = path.resolve(process.cwd(), options.outputDir || 'releases');
  const packageOutPath = path.join(outDir, bundle.packageFileName);
  const manifestOutPath = path.join(outDir, 'manifest.json');
  const changelogOutPath = path.join(outDir, 'CHANGELOG.md');
  const publicKeyOutPath = path.join(outDir, 'public-key.pem');

  if (options.writeArtifacts !== false) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(packageOutPath, bundle.packageBytes);
    fs.writeFileSync(manifestOutPath, bundle.manifestJsonText, 'utf-8');
    fs.writeFileSync(changelogOutPath, bundle.changelogMarkdown, 'utf-8');
    fs.writeFileSync(publicKeyOutPath, `${bundle.publicKeyPem}\n`, 'utf-8');
  }

  let r2Result: R2UploadResult | undefined;
  const shouldUploadToR2 =
    options.uploadToR2 ||
    env.UPLOAD_TO_R2 === 'true' ||
    process.argv.includes('--upload-r2');

  if (shouldUploadToR2) {
    r2Result = await uploadReleaseBundleToR2(bundle, {
      channel,
      publicBaseUrl: r2PublicBase,
      dryRun: Boolean(options.r2Config?.dryRun || process.argv.includes('--dry-run')),
      ...options.r2Config
    });
  }

  return {
    bundle,
    outputDir: outDir,
    packageOutPath,
    manifestOutPath,
    changelogOutPath,
    publicKeyOutPath,
    r2Result
  };
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  let channel: 'stable' | 'beta' = 'stable';
  let targetVersion: string | undefined;
  let summary: string | undefined;
  let uploadToR2 = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      channel = args[i + 1] === 'beta' ? 'beta' : 'stable';
      i++;
    } else if (args[i] === '--version' && args[i + 1]) {
      targetVersion = args[i + 1];
      i++;
    } else if (args[i] === '--summary' && args[i + 1]) {
      summary = args[i + 1];
      i++;
    } else if (args[i] === '--upload-r2') {
      uploadToR2 = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  const result = await executeProductionDataReleasePublish({
    channel,
    targetVersion,
    summary,
    writeArtifacts: true,
    uploadToR2,
    r2Config: { dryRun }
  });

  const { bundle, packageOutPath, manifestOutPath, changelogOutPath, publicKeyOutPath, r2Result } =
    result;

  console.log('==============================================================');
  console.log('[UMED-2 Publisher] Release Bundle Built & Verified Successfully');
  console.log(`  Version        : ${bundle.manifest.dataVersion}`);
  console.log(`  Package File   : ${packageOutPath} (${bundle.packageSizeKb} KB)`);
  console.log(`  Manifest File  : ${manifestOutPath}`);
  console.log(`  Changelog File : ${changelogOutPath}`);
  console.log(`  Public Key     : ${publicKeyOutPath}`);
  console.log(`  SHA-256        : ${bundle.sha256}`);
  console.log(`  Algorithm      : ${bundle.signatureAlgorithm}`);
  console.log(`  Key Fingerprint: ${bundle.keyFingerprintSha256}`);
  console.log(`  Signature      : ${bundle.signature.slice(0, 32)}...`);
  if (r2Result) {
    console.log('--------------------------------------------------------------');
    console.log(`[Cloudflare R2] ${r2Result.dryRun ? 'Simulated (Dry Run)' : 'Uploaded'}:`);
    console.log(`  Package Key  : ${r2Result.packageKey}`);
    console.log(`  Manifest Key : ${r2Result.manifestKey}`);
    console.log(`  Manifest URL : ${r2Result.manifestUrl}`);
  }
  console.log('==============================================================');
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
