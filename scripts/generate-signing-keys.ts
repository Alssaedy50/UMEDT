/**
 * UMED-2 Stage 2 — Permanent ECDSA-P256-SHA256 Signing-Key Generation Utility
 *
 * Generates a permanent ECDSA P-256 key pair for UMED-2 medical-data OTA releases:
 *  - Exports the private key as PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`)
 *  - Exports the public key as SPKI PEM (`-----BEGIN PUBLIC KEY-----`)
 *  - Computes and displays the SHA-256 public-key fingerprint (full 64-char hex + 16-char short ID)
 *  - Verifies the generated pair by signing and verifying a test payload with `ECDSA-P256-SHA256`
 *  - Never commits or automatically uploads the private key
 *  - Never prints the private key in CI logs (`CI` / `GITHUB_ACTIONS`)
 *
 * Usage:
 *   npx tsx scripts/generate-signing-keys.ts [--out-dir .keys]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PRODUCTION_SIGNATURE_ALGORITHM,
  generatePublisherSigningKeyPair,
  verifyPublisherKeyPairMatch,
  signPackageBytesWithPrivateKey,
  verifyPackageSignature
} from '../src/services/dataPlatformService';

export interface GeneratedPermanentSigningKeyBundle {
  keyId: string;
  algorithm: 'ECDSA-P256-SHA256';
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintSha256: string;
  fullFingerprintSha256: string;
  createdAt: string;
  selfTestVerified: boolean;
  savedPaths?: {
    privateKeyPath: string;
    publicKeyPath: string;
    metadataPath: string;
  };
}

export function isRunningInCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.CI === 'true' ||
      env.CI === '1' ||
      env.GITHUB_ACTIONS === 'true' ||
      env.GITLAB_CI === 'true' ||
      env.BUILDKITE === 'true' ||
      env.TF_BUILD === 'True'
  );
}

/**
 * Generates and cryptographically verifies a permanent ECDSA-P256-SHA256 key pair.
 * Optionally writes the keys to a gitignored local directory with `0o600` permissions on the private key.
 */
export async function generateAndVerifyPermanentSigningKeys(options?: {
  outputDir?: string;
  writeFiles?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<GeneratedPermanentSigningKeyBundle> {
  const keyPair = await generatePublisherSigningKeyPair(PRODUCTION_SIGNATURE_ALGORITHM);

  if (
    !keyPair.privateKeyPem.includes('-----BEGIN PRIVATE KEY-----') ||
    !keyPair.privateKeyPem.includes('-----END PRIVATE KEY-----')
  ) {
    throw new Error('Exported private key is not in standard PKCS#8 PEM format.');
  }

  if (
    !keyPair.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----') ||
    !keyPair.publicKeyPem.includes('-----END PUBLIC KEY-----')
  ) {
    throw new Error('Exported public key is not in standard SPKI PEM format.');
  }

  // 1. Verify keypair matching & compute full + short SHA-256 fingerprint
  const pairMatch = await verifyPublisherKeyPairMatch({
    privateKeyPem: keyPair.privateKeyPem,
    publicKeyPem: keyPair.publicKeyPem,
    algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
    requireProductionEcdsa: true,
    strictPemHeaders: true
  });

  if (!pairMatch.valid) {
    throw new Error(
      `Generated key pair failed cryptographic match verification: ${pairMatch.reason || 'Unknown error'}`
    );
  }

  // 2. Sign and verify an explicit test payload + verify tampered payload rejection
  const testPayloadBytes = new TextEncoder().encode(
    JSON.stringify({
      probe: 'UMED-2-STAGE-2-SIGNING-SELF-TEST',
      algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
      keyId: pairMatch.keyId,
      fingerprintSha256: pairMatch.fingerprintSha256,
      timestamp: keyPair.createdAt
    })
  );

  const signedTest = await signPackageBytesWithPrivateKey({
    bytes: testPayloadBytes,
    privateKeyPem: keyPair.privateKeyPem,
    publicKeyPem: keyPair.publicKeyPem,
    algorithm: PRODUCTION_SIGNATURE_ALGORITHM
  });

  const validVerify = await verifyPackageSignature({
    bytes: testPayloadBytes,
    signature: signedTest.signature,
    publicKeyPem: keyPair.publicKeyPem,
    requireSignature: true,
    algorithm: PRODUCTION_SIGNATURE_ALGORITHM
  });

  if (!validVerify.verified) {
    throw new Error('Self-test signature verification failed on valid test payload.');
  }

  const tamperedPayloadBytes = new Uint8Array(testPayloadBytes);
  tamperedPayloadBytes[0] = tamperedPayloadBytes[0] ^ 0xff;
  const tamperedVerify = await verifyPackageSignature({
    bytes: tamperedPayloadBytes,
    signature: signedTest.signature,
    publicKeyPem: keyPair.publicKeyPem,
    requireSignature: true,
    algorithm: PRODUCTION_SIGNATURE_ALGORITHM
  });

  if (tamperedVerify.verified) {
    throw new Error('Security self-test failed: tampered test payload was not rejected.');
  }

  let savedPaths: GeneratedPermanentSigningKeyBundle['savedPaths'];

  if (options?.writeFiles) {
    const targetDir = path.resolve(process.cwd(), options.outputDir || '.keys');
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });

    const privateKeyPath = path.join(targetDir, 'umed2-publisher-private.pkcs8.pem');
    const publicKeyPath = path.join(targetDir, 'umed2-publisher-public.spki.pem');
    const metadataPath = path.join(targetDir, 'umed2-key-metadata.json');

    fs.writeFileSync(privateKeyPath, `${keyPair.privateKeyPem}\n`, {
      encoding: 'utf-8',
      mode: 0o600
    });
    try {
      fs.chmodSync(privateKeyPath, 0o600);
    } catch {
      // Ignore chmod on filesystems that do not support POSIX permissions
    }

    fs.writeFileSync(publicKeyPath, `${keyPair.publicKeyPem}\n`, {
      encoding: 'utf-8',
      mode: 0o644
    });

    const publicMetadata = {
      keyId: pairMatch.keyId,
      algorithm: PRODUCTION_SIGNATURE_ALGORITHM,
      fingerprintSha256: pairMatch.fingerprintSha256,
      fullFingerprintSha256: pairMatch.fullFingerprintSha256,
      createdAt: keyPair.createdAt,
      selfTestVerified: true,
      publicKeyPem: keyPair.publicKeyPem,
      securityNotice:
        'NEVER commit umed2-publisher-private.pkcs8.pem to Git. Store it only in offline encrypted vault and GitHub Actions Secret UMED_PUBLISHER_PRIVATE_KEY_PEM.'
    };

    fs.writeFileSync(metadataPath, `${JSON.stringify(publicMetadata, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o644
    });

    savedPaths = {
      privateKeyPath,
      publicKeyPath,
      metadataPath
    };
  }

  return {
    keyId: pairMatch.keyId,
    algorithm: 'ECDSA-P256-SHA256',
    publicKeyPem: keyPair.publicKeyPem,
    privateKeyPem: keyPair.privateKeyPem,
    fingerprintSha256: pairMatch.fingerprintSha256,
    fullFingerprintSha256: pairMatch.fullFingerprintSha256,
    createdAt: keyPair.createdAt,
    selfTestVerified: true,
    savedPaths
  };
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const inCi = isRunningInCiEnvironment(process.env);

  if (inCi) {
    console.error(
      '[UMED-2 Key Generator] ERROR: Refusing to generate or display permanent private signing keys inside a CI environment.'
    );
    console.error(
      'Run "npx tsx scripts/generate-signing-keys.ts" on a trusted local administrator workstation instead.'
    );
    process.exit(1);
  }

  let outDir = '.keys';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir' && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    }
  }

  const bundle = await generateAndVerifyPermanentSigningKeys({
    outputDir: outDir,
    writeFiles: true
  });

  console.log('========================================================================');
  console.log('UMED-2 Permanent Medical-Data Signing Key Pair Generated & Verified');
  console.log('========================================================================');
  console.log(`Algorithm              : ${bundle.algorithm}`);
  console.log(`Key ID                 : ${bundle.keyId}`);
  console.log(`Fingerprint (Short)    : ${bundle.fingerprintSha256}`);
  console.log(`Fingerprint (SHA-256)  : ${bundle.fullFingerprintSha256}`);
  console.log(`Created At             : ${bundle.createdAt}`);
  console.log(`Cryptographic Self-Test: PASSED (Valid signature verified & tamper rejected)`);
  console.log('------------------------------------------------------------------------');
  console.log('Public Key (SPKI PEM) — Safe to embed in VITE_UMED_PUBLIC_KEY_PEM:');
  console.log('');
  console.log(bundle.publicKeyPem);
  console.log('');
  console.log('------------------------------------------------------------------------');
  if (bundle.savedPaths) {
    console.log('Local Files Written (Git-Ignored via .gitignore):');
    console.log(`  - Private Key (PKCS#8, chmod 600): ${bundle.savedPaths.privateKeyPath}`);
    console.log(`  - Public Key  (SPKI PEM)         : ${bundle.savedPaths.publicKeyPath}`);
    console.log(`  - Key Metadata (JSON)            : ${bundle.savedPaths.metadataPath}`);
  }
  console.log('------------------------------------------------------------------------');
  console.log('MANDATORY SECURITY & GITHUB CONFIGURATION INSTRUCTIONS:');
  console.log('1. NEVER commit the private key file or share it in chat, issues, or logs.');
  console.log('2. Back up the private key file immediately to an encrypted offline password');
  console.log('   manager (e.g., 1Password, Bitwarden, KeePassXC) or hardware security vault.');
  console.log('3. Configure the GitHub Actions Repository Secret (Private Key):');
  console.log('   - Navigate to: GitHub Repo -> Settings -> Secrets and variables -> Actions -> Secrets');
  console.log('   - Click "New repository secret"');
  console.log('   - Name : UMED_PUBLISHER_PRIVATE_KEY_PEM');
  console.log(`   - Value: Paste the exact contents of ${bundle.savedPaths?.privateKeyPath || 'the PKCS#8 private key PEM'}`);
  console.log('4. Configure the GitHub Actions Repository Variable (Trusted Public Key):');
  console.log('   - Navigate to: GitHub Repo -> Settings -> Secrets and variables -> Actions -> Variables');
  console.log('   - Click "New repository variable"');
  console.log('   - Name : VITE_UMED_PUBLIC_KEY_PEM');
  console.log('   - Value: Paste the SPKI Public Key PEM printed above.');
  console.log('5. Delete the local private key file from disk once backed up and stored in GitHub Secrets.');
  console.log('========================================================================');
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error('[UMED-2 Key Generator] Failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
