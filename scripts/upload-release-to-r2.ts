/**
 * UMED-2 — Cloudflare R2 Medical Data Release Uploader
 *
 * Stage 3 Production Architecture:
 * - Logical layout:
 *     {channel}/manifest.json
 *     {channel}/packages/{immutable-package-filename}.zip
 *     {channel}/releases/{data-version}/release.json
 * - Immutable package guarantee: never overwrites an existing release package with different content.
 * - Uploads the immutable .zip package FIRST.
 * - Verifies package existence and size on R2.
 * - Uploads the release record ({channel}/releases/{data-version}/release.json).
 * - Uploads manifest.json LAST so clients never fetch a manifest pointing to a missing package.
 * - Preserves older versions without deletion.
 * - Verifies public HTTPS accessibility when publicBaseUrl is configured.
 * - Sanitizes all logs (never prints Cloudflare tokens or private keys).
 * - Includes Dry Run mode (--dry-run) for zero-risk local and CI testing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  computeSha256Hex,
  verifyPackageChecksum
} from '../src/services/dataPlatformService';
import type { DataPackageManifest, PublishedReleaseBundle } from '../src/types/lexicon';

export interface R2UploadConfig {
  accountId?: string;
  apiToken?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  channel?: 'stable' | 'beta';
  dryRun?: boolean;
  bundleDir?: string;
  customFetch?: typeof fetch;
}

export interface R2UploadResult {
  success: boolean;
  dryRun: boolean;
  channel: 'stable' | 'beta';
  bucket: string;
  packageKey: string;
  manifestKey: string;
  releaseKey: string;
  packageUrl: string;
  manifestUrl: string;
  releaseUrl: string;
  packageSize: number;
  packageSha256: string;
  dataVersion: string;
  uploadedAt: string;
  stepsExecuted: string[];
}

export interface PreparedReleasePayload {
  dataVersion: string;
  packageFileName: string;
  packageBytes: Uint8Array;
  manifestJsonText: string;
  manifest: DataPackageManifest;
  changelogMarkdown?: string;
  publicKeyPem?: string;
}

function sanitizeLog(text: string, secrets: string[] = []): string {
  let cleaned = text;
  for (const secret of secrets) {
    if (secret && secret.length > 4) {
      cleaned = cleaned.split(secret).join('***REDACTED***');
    }
  }
  return cleaned.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer ***REDACTED***');
}

/**
 * Loads release artifacts from disk or from an existing in-memory bundle.
 */
export function loadReleasePayload(
  source: PublishedReleaseBundle | string
): PreparedReleasePayload {
  if (typeof source !== 'string') {
    return {
      dataVersion: source.manifest.dataVersion,
      packageFileName: source.packageFileName,
      packageBytes: source.packageBytes,
      manifestJsonText: source.manifestJsonText,
      manifest: source.manifest,
      changelogMarkdown: source.changelogMarkdown,
      publicKeyPem: source.publicKeyPem
    };
  }

  const dir = path.resolve(process.cwd(), source);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[R2 Upload] Manifest not found at: ${manifestPath}`);
  }

  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText) as DataPackageManifest;
  const packageFileName = `umed2-data-${manifest.dataVersion}.zip`;
  const packagePath = path.join(dir, packageFileName);

  if (!fs.existsSync(packagePath)) {
    throw new Error(`[R2 Upload] Package file not found at: ${packagePath}`);
  }

  const packageBytes = new Uint8Array(fs.readFileSync(packagePath));
  const changelogPath = path.join(dir, 'CHANGELOG.md');
  const changelogMarkdown = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : undefined;

  return {
    dataVersion: manifest.dataVersion,
    packageFileName,
    packageBytes,
    manifestJsonText: manifestText,
    manifest,
    changelogMarkdown
  };
}

/**
 * Uploads a signed release package, release record, and manifest to Cloudflare R2.
 */
export async function uploadReleaseBundleToR2(
  source: PublishedReleaseBundle | string,
  config: R2UploadConfig = {}
): Promise<R2UploadResult> {
  const steps: string[] = [];
  const env = process.env;

  const accountId = (config.accountId || env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (config.apiToken || env.CLOUDFLARE_API_TOKEN || '').trim();
  const bucketName = (config.bucketName || env.UMED_R2_BUCKET || 'umed2-medical-data').trim();
  const rawPublicBase = (config.publicBaseUrl || env.UMED_R2_PUBLIC_BASE_URL || '').trim();
  const publicBaseUrl = rawPublicBase ? rawPublicBase.replace(/\/+$/, '') : '';
  const channel: 'stable' | 'beta' =
    (config.channel || env.UMED_RELEASE_CHANNEL) === 'beta' ? 'beta' : 'stable';
  const dryRun = Boolean(
    config.dryRun ?? (env.DRY_RUN === 'true' || process.argv.includes('--dry-run'))
  );

  const secretsToRedact = [apiToken, accountId].filter(Boolean);
  const fetchFn = config.customFetch || fetch;

  // 1. Validate credentials
  if (!dryRun) {
    if (!accountId) {
      throw new Error(
        '[R2 Upload] Missing CLOUDFLARE_ACCOUNT_ID. Please configure it in your environment or GitHub Secrets.'
      );
    }
    if (!apiToken) {
      throw new Error(
        '[R2 Upload] Missing CLOUDFLARE_API_TOKEN. Please configure it in your environment or GitHub Secrets.'
      );
    }
    if (!bucketName) {
      throw new Error(
        '[R2 Upload] Missing UMED_R2_BUCKET name. Please configure it in your environment or GitHub Variables.'
      );
    }
  }

  // 2. Load release payload and verify integrity
  const payload = loadReleasePayload(source);
  const actualSha256 = await computeSha256Hex(payload.packageBytes);
  const expectedSha256 = payload.manifest.sha256 || payload.manifest.checksum;

  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(
      `[R2 Upload] CRITICAL INTEGRITY ERROR: Package SHA-256 mismatch before upload! Expected: ${expectedSha256}, Actual: ${actualSha256}`
    );
  }

  const checksumVerification = await verifyPackageChecksum(payload.packageBytes, expectedSha256);
  if (!checksumVerification.valid) {
    throw new Error(
      `[R2 Upload] Checksum verification failed: ${checksumVerification.reason}`
    );
  }
  steps.push(`Verified pre-upload package SHA-256 integrity: ${actualSha256}`);

  // 3. Define logical R2 keys
  const channelPrefix = channel === 'beta' ? 'beta' : 'stable';
  const packageKey = `${channelPrefix}/packages/${payload.packageFileName}`;
  const releaseKey = `${channelPrefix}/releases/${payload.dataVersion}/release.json`;
  const manifestKey = `${channelPrefix}/manifest.json`;

  const baseUrlForUrls = publicBaseUrl || `https://${bucketName}.r2.cloudflarestorage.com`;
  const packageUrl = `${baseUrlForUrls}/${packageKey}`;
  const releaseUrl = `${baseUrlForUrls}/${releaseKey}`;
  const manifestUrl = `${baseUrlForUrls}/${manifestKey}`;

  const r2ApiBase = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    accountId
  )}/r2/buckets/${encodeURIComponent(bucketName)}/objects`;

  const authHeaders = {
    Authorization: `Bearer ${apiToken}`
  };

  // Helper for R2 API requests with redaction
  const r2Request = async (
    key: string,
    method: 'GET' | 'HEAD' | 'PUT',
    body?: Uint8Array | string,
    contentType?: string,
    extraHeaders?: Record<string, string>
  ) => {
    const url = `${r2ApiBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const headers: Record<string, string> = {
      ...authHeaders,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(extraHeaders || {})
    };

    try {
      const res = await fetchFn(url, {
        method,
        headers,
        body: body ? (body as BodyInit) : undefined
      });
      return res;
    } catch (networkErr) {
      const safeMsg = sanitizeLog(
        networkErr instanceof Error ? networkErr.message : String(networkErr),
        secretsToRedact
      );
      throw new Error(`[R2 Upload Network Failure] ${safeMsg}`);
    }
  };

  // 4. Immutable Package Protection: Check if package key already exists
  steps.push(`Checking immutable package key existence: ${packageKey}`);
  if (!dryRun) {
    const existingCheckRes = await r2Request(packageKey, 'GET');
    if (existingCheckRes.status === 200) {
      const existingBytes = new Uint8Array(await existingCheckRes.arrayBuffer());
      const existingSha256 = await computeSha256Hex(existingBytes);

      if (existingSha256 !== actualSha256) {
        throw new Error(
          `[R2 Immutable Package Protection] Object '${packageKey}' already exists in R2 with different content (Remote SHA: ${existingSha256}, Local SHA: ${actualSha256}). Overwriting immutable releases is strictly prohibited. Bump the dataVersion to publish a new release.`
        );
      }
      steps.push(`Immutable package already exists on R2 with identical SHA-256; upload step is idempotent`);
    } else if (existingCheckRes.status !== 404 && existingCheckRes.status !== 403) {
      const errText = sanitizeLog(await existingCheckRes.text(), secretsToRedact);
      throw new Error(
        `[R2 Upload] Unexpected response checking existing package (${existingCheckRes.status}): ${errText}`
      );
    }
  } else {
    steps.push(`[Dry Run] Simulated immutable package existence check for: ${packageKey}`);
  }

  // 5. Upload Package FIRST
  steps.push(`Uploading immutable release package: ${packageKey} (${(payload.packageBytes.length / 1024).toFixed(1)} KB)`);
  if (!dryRun) {
    const putPkgRes = await r2Request(
      packageKey,
      'PUT',
      payload.packageBytes,
      'application/zip',
      {
        'Content-Disposition': `attachment; filename="${payload.packageFileName}"`
      }
    );
    if (!putPkgRes.ok) {
      const errText = sanitizeLog(await putPkgRes.text(), secretsToRedact);
      throw new Error(
        `[R2 Upload] Failed to upload package ${packageKey} (${putPkgRes.status}): ${errText}`
      );
    }
    steps.push(`Successfully uploaded package to R2: ${packageKey}`);

    // Verify package presence and size
    const verifyPkgRes = await r2Request(packageKey, 'GET');
    if (!verifyPkgRes.ok) {
      throw new Error(
        `[R2 Upload] Post-upload verification failed for package: ${packageKey} (${verifyPkgRes.status})`
      );
    }
    const uploadedBuf = await verifyPkgRes.arrayBuffer();
    if (uploadedBuf.byteLength !== payload.packageBytes.byteLength) {
      throw new Error(
        `[R2 Upload] Post-upload size mismatch for ${packageKey}. Expected ${payload.packageBytes.byteLength} bytes, got ${uploadedBuf.byteLength} bytes.`
      );
    }
    steps.push(`Verified package existence and exact size on R2 (${uploadedBuf.byteLength} bytes)`);
  } else {
    steps.push(`[Dry Run] Simulated package upload & size verification for: ${packageKey}`);
  }

  // 6. Upload Release Record (Historical Record)
  const releaseRecord = {
    packageId: payload.manifest.packageId,
    dataVersion: payload.dataVersion,
    channel,
    minAppVersion: payload.manifest.minAppVersion,
    schemaVersion: payload.manifest.schemaVersion,
    packageFileName: payload.packageFileName,
    packageSizeKb: payload.manifest.packageSizeKb,
    sha256: actualSha256,
    signatureAlgorithm: payload.manifest.signatureAlgorithm,
    keyFingerprint: payload.manifest.keyFingerprint,
    downloadUrl: packageUrl,
    counts: payload.manifest.counts,
    releasedAt: payload.manifest.releasedAt || new Date().toISOString(),
    uploadedAt: new Date().toISOString()
  };

  steps.push(`Uploading release audit record: ${releaseKey}`);
  if (!dryRun) {
    const putRelRes = await r2Request(
      releaseKey,
      'PUT',
      JSON.stringify(releaseRecord, null, 2),
      'application/json; charset=utf-8'
    );
    if (!putRelRes.ok) {
      const errText = sanitizeLog(await putRelRes.text(), secretsToRedact);
      throw new Error(
        `[R2 Upload] Failed to upload release record ${releaseKey} (${putRelRes.status}): ${errText}`
      );
    }
    steps.push(`Successfully uploaded release audit record: ${releaseKey}`);
  } else {
    steps.push(`[Dry Run] Simulated release audit record upload for: ${releaseKey}`);
  }

  // 7. Upload Manifest LAST
  // Ensures clients never fetch a manifest before the package is completely verified on R2.
  const publishedManifest: DataPackageManifest = {
    ...payload.manifest,
    downloadUrl: packageUrl,
    sha256: actualSha256,
    checksum: actualSha256
  };
  const finalManifestText = JSON.stringify(publishedManifest, null, 2);

  steps.push(`Uploading channel manifest LAST: ${manifestKey}`);
  if (!dryRun) {
    const putManRes = await r2Request(
      manifestKey,
      'PUT',
      finalManifestText,
      'application/json; charset=utf-8',
      {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    );
    if (!putManRes.ok) {
      const errText = sanitizeLog(await putManRes.text(), secretsToRedact);
      throw new Error(
        `[R2 Upload] Failed to upload manifest ${manifestKey} (${putManRes.status}): ${errText}`
      );
    }
    steps.push(`Successfully uploaded channel manifest: ${manifestKey}`);

    // Verify manifest presence and parseability
    const verifyManRes = await r2Request(manifestKey, 'GET');
    if (!verifyManRes.ok) {
      throw new Error(
        `[R2 Upload] Post-upload verification failed for manifest: ${manifestKey} (${verifyManRes.status})`
      );
    }
    const retrievedText = await verifyManRes.text();
    const parsedRetrieved = JSON.parse(retrievedText) as DataPackageManifest;
    if (parsedRetrieved.dataVersion !== payload.dataVersion) {
      throw new Error(
        `[R2 Upload] Manifest verification mismatch: expected dataVersion ${payload.dataVersion}, got ${parsedRetrieved.dataVersion}`
      );
    }
    steps.push(`Verified manifest integrity on R2 (dataVersion: ${parsedRetrieved.dataVersion})`);
  } else {
    steps.push(`[Dry Run] Simulated manifest upload LAST & verification for: ${manifestKey}`);
  }

  // 8. Public HTTPS Reachability Verification (Optional if publicBaseUrl configured)
  if (publicBaseUrl && !dryRun) {
    steps.push(`Verifying public HTTPS accessibility: ${manifestUrl}`);
    try {
      const publicRes = await fetchFn(manifestUrl, { cache: 'no-store' });
      if (publicRes.ok) {
        steps.push(`Public HTTPS reachability confirmed for manifest (HTTP ${publicRes.status})`);
      } else {
        steps.push(
          `Warning: Public HTTPS check returned HTTP ${publicRes.status}. DNS propagation or custom domain configuration may be pending.`
        );
      }
    } catch (pubErr) {
      steps.push(
        `Warning: Public HTTPS check encountered an error: ${
          pubErr instanceof Error ? pubErr.message : String(pubErr)
        }. Ensure Public Access or Custom Domain is enabled on the R2 bucket.`
      );
    }
  }

  return {
    success: true,
    dryRun,
    channel,
    bucket: bucketName,
    packageKey,
    manifestKey,
    releaseKey,
    packageUrl,
    manifestUrl,
    releaseUrl,
    packageSize: payload.packageBytes.length,
    packageSha256: actualSha256,
    dataVersion: payload.dataVersion,
    uploadedAt: new Date().toISOString(),
    stepsExecuted: steps
  };
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  let channel: 'stable' | 'beta' = 'stable';
  let dryRun = false;
  let dir = 'releases';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      channel = args[i + 1] === 'beta' ? 'beta' : 'stable';
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    }
  }

  console.log('==============================================================');
  console.log(`[UMED-2 R2 Uploader] Channel: ${channel} | Mode: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log('==============================================================');

  const result = await uploadReleaseBundleToR2(dir, {
    channel,
    dryRun
  });

  console.log(`[SUCCESS] Cloudflare R2 Upload Completed (${result.dryRun ? 'DRY RUN' : 'LIVE'}):`);
  console.log(`  Data Version: ${result.dataVersion}`);
  console.log(`  Bucket      : ${result.bucket}`);
  console.log(`  Package Key : ${result.packageKey}`);
  console.log(`  Manifest Key: ${result.manifestKey}`);
  console.log(`  Release Key : ${result.releaseKey}`);
  console.log(`  SHA-256     : ${result.packageSha256}`);
  console.log(`  Package Size: ${(result.packageSize / 1024).toFixed(1)} KB`);
  console.log(`  Package URL : ${result.packageUrl}`);
  console.log(`  Manifest URL: ${result.manifestUrl}`);
  console.log('--------------------------------------------------------------');
  console.log('Execution Trace:');
  result.stepsExecuted.forEach((s) => console.log(`  ✓ ${s}`));
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
