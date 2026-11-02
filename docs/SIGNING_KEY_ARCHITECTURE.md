# UMED-2 — Permanent Signing-Key Architecture (`ECDSA-P256-SHA256`)

This document specifies the permanent cryptographic signing-key architecture for **UMED-2** Over-The-Air (OTA) medical-data releases.

---

## 1. Architectural Distinction: Android APK Signing vs. Medical-Data Signing

UMED-2 uses **two completely separate cryptographic signing systems** that serve distinct purposes and must never be confused:

| Attribute | 1. Android APK Signing Key | 2. Medical-Data OTA Signing Key |
| :--- | :--- | :--- |
| **Purpose** | Authenticates the compiled Android application binary (`.apk`) to the Android OS package installer so updates install cleanly over existing installations without data loss. | Authenticates remote medical-data packages (`umed2-data-*.zip`) and `manifest.json` downloaded from Cloudflare R2 / GitHub Releases before importing into the local database. |
| **Format & Standard** | Java Keystore (`.jks` / PKCS#12) used by Gradle `signingConfigs.release`. | Asymmetric key pair: **PKCS#8 PEM** Private Key + **SPKI PEM** Public Key using **`ECDSA-P256-SHA256`** (Web Crypto API standard). |
| **Where Private Key Lives** | GitHub Actions Secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) & offline backup. | GitHub Actions Secret (`UMED_PUBLISHER_PRIVATE_KEY_PEM`) & administrator offline encrypted vault. **Never in frontend, APK, or Git.** |
| **Where Public Verification Happens** | Verified by the Android Operating System at APK install/upgrade time. | Verified inside the UMED-2 app (`verifyPackageSignature` in `src/services/dataPlatformService.ts`) using the embedded `VITE_UMED_PUBLIC_KEY_PEM`. |
| **Rotation Impact** | Changing the APK keystore breaks in-place Android app upgrades (requires uninstall). | Rotating the medical-data key requires shipping one app/PWA build with the new `VITE_UMED_PUBLIC_KEY_PEM`. |

---

## 2. Generating the Permanent Medical-Data Signing Key Pair

Generate the permanent `ECDSA-P256-SHA256` key pair on a **trusted, offline-capable administrator workstation** (never inside CI):

```bash
npx tsx scripts/generate-signing-keys.ts
```

### What `scripts/generate-signing-keys.ts` Does
1. Generates a permanent **ECDSA P-256 (`prime256v1`)** key pair via the standard Web Crypto API.
2. Exports the **Private Key** in **PKCS#8 PEM** format (`-----BEGIN PRIVATE KEY-----`).
3. Exports the **Public Key** in **SPKI PEM** format (`-----BEGIN PUBLIC KEY-----`).
4. Computes and displays the **SHA-256 Public-Key Fingerprint**:
   - **Short Key Fingerprint (16 hex chars):** e.g., `a1b2c3d4e5f60718` (`keyId`: `umed-key-a1b2c3d4`)
   - **Full SHA-256 Digest (64 hex chars):** SHA-256 over the raw SPKI DER bytes.
5. Executes an immediate cryptographic self-test:
   - Signs a deterministic test payload with the generated private key (`ECDSA-P256-SHA256`).
   - Verifies the signature against the generated SPKI public key.
   - Flips 1 byte in the payload and confirms tampered signatures are rejected.
6. Writes the generated artifacts to the local `.keys/` directory (which is strictly ignored by `.gitignore` and never tracked by Git):
   - `.keys/umed2-publisher-private.pkcs8.pem` (permissions restricted to `0600`)
   - `.keys/umed2-publisher-public.spki.pem`
   - `.keys/umed2-key-metadata.json` (contains only the public key, key ID, and SHA-256 fingerprints)
7. Blocks execution if invoked inside a CI environment (`CI=true` or `GITHUB_ACTIONS=true`) so private keys can never be printed in CI build logs.

---

## 3. Private-Key Protection and Offline Backup

1. **Zero Repository Exposure:**
   - `.gitignore` explicitly blocks `.keys/`, `keys/`, `*.pem`, `*.key`, `*.p8`, and `*.pkcs8`.
   - Never commit `umed2-publisher-private.pkcs8.pem` or paste it into source code, `.env` files tracked by Git, pull requests, or issue comments.
2. **Primary Offline Backup:**
   - Immediately store the contents of `.keys/umed2-publisher-private.pkcs8.pem` and `.keys/umed2-key-metadata.json` in an encrypted vault (e.g., 1Password, Bitwarden, KeePassXC, or an encrypted hardware USB token).
3. **Local Cleanup:**
   - After storing the private key in your encrypted offline vault and in GitHub Actions Secrets, securely delete `.keys/umed2-publisher-private.pkcs8.pem` from the local workstation disk:
     ```bash
     rm -f .keys/umed2-publisher-private.pkcs8.pem
     ```

---

## 4. GitHub Secrets and Variables Configuration

Configure the following in the GitHub repository (`Alssaedy50/UMED-2` → **Settings** → **Secrets and variables** → **Actions**):

### A. Repository Secret (Private Key — Publisher Only)
- **Tab:** **Secrets** → **New repository secret**
- **Name:** `UMED_PUBLISHER_PRIVATE_KEY_PEM`
- **Value:** Paste the complete multi-line PKCS#8 PEM private key:
  ```text
  -----BEGIN PRIVATE KEY-----
  MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...
  -----END PRIVATE KEY-----
  ```
- **Security Guarantee:** GitHub Actions masks repository secrets in logs and only exposes `UMED_PUBLISHER_PRIVATE_KEY_PEM` to authorized release workflows running `scripts/publish-data-release.ts`. Because it does **not** start with `VITE_`, Vite never bundles it into the web, PWA, or Android APK client code.

### B. Repository Variable (Trusted Public Key — Embedded in App Builds & Used by Publisher)
- **Tab:** **Variables** → **New repository variable**
- **Name:** `VITE_UMED_PUBLIC_KEY_PEM`
- **Value:** Paste the complete multi-line SPKI PEM public key:
  ```text
  -----BEGIN PUBLIC KEY-----
  MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
  -----END PUBLIC KEY-----
  ```

---

## 5. Public-Key Fingerprint Verification & Authoritative Client Enforcement

### Verifying the Fingerprint
Every published `manifest.json` and `CHANGELOG.md` records `keyFingerprint` / `keyFingerprintSha256` (the first 16 hex characters of the SHA-256 hash of the SPKI public key DER bytes).

Before or after publishing a release, verify that:
1. The `Key Fingerprint` logged by `scripts/publish-data-release.ts` matches the `Fingerprint (Short)` recorded in `.keys/umed2-key-metadata.json`.
2. The `VITE_UMED_PUBLIC_KEY_PEM` embedded in the application build produces the exact same 16-character SHA-256 fingerprint.

### Authoritative Embedded Key Enforcement in the Client
In `src/services/storageService.ts`:
- When `VITE_UMED_PUBLIC_KEY_PEM` is embedded at build time, `getEmbeddedTrustedPublicKeyPem()` returns that key as the **single authoritative trusted public key**.
- `loadOnlineUpdateConfig()`, `saveOnlineUpdateConfig()`, `loadPublisherReleaseConfig()`, and `downloadAndInstallRemoteUpdate()` strictly enforce:
  - `publicKeyPem = getEmbeddedTrustedPublicKeyPem()`
  - `requireSignature = true`
  - `signatureAlgorithm = 'ECDSA-P256-SHA256'`
- **Tamper Resistance:** Even if a script or stale state writes a different or empty `publicKeyPem` or sets `requireSignature: false` inside `localStorage`, UMED-2 ignores the `localStorage` override and enforces the build-embedded key.
- **Seamless Upgrade for Existing Installations:** Devices upgrading from an older APK/PWA version that had an empty `publicKeyPem: ""` or outdated key in `localStorage` automatically adopt the embedded production public key on first startup without losing any user data, favorites, or study progress, while preserving `"notify-only"` as the default `autoUpdatePolicy`.

---

## 6. Release Publisher Hardening (`scripts/publish-data-release.ts`)

`scripts/publish-data-release.ts` enforces strict production gates:
1. **No Ephemeral Keys:** Silent ephemeral key generation is completely removed.
2. **Immediate Failure on Missing Keys:** If either `UMED_PUBLISHER_PRIVATE_KEY_PEM` or `VITE_UMED_PUBLIC_KEY_PEM` is missing or empty, the publisher aborts immediately with a non-zero exit code.
3. **Cryptographic Pair Matching (`verifyPublisherKeyPairMatch`):** Before building or signing the release package, the publisher validates the PKCS#8 and SPKI PEM headers, enforces `ECDSA-P256-SHA256`, and signs/verifies a challenge payload to confirm the private key and public key mathematically belong to the same P-256 key pair.
4. **No Unsigned Fallback:** If signature generation or verification fails for any reason, publishing is aborted and no unsigned artifact is emitted.

---

## 7. Key Rotation and Recovery Procedures

### Scenario A: Routine Key Rotation or Suspected Private-Key Compromise
If `UMED_PUBLISHER_PRIVATE_KEY_PEM` must be rotated:
1. Run `npx tsx scripts/generate-signing-keys.ts` on a trusted local machine to generate a new `ECDSA-P256-SHA256` key pair.
2. Back up the new private key offline and update the GitHub Secret `UMED_PUBLISHER_PRIVATE_KEY_PEM`.
3. Update the GitHub Variable `VITE_UMED_PUBLIC_KEY_PEM` with the new SPKI Public Key PEM.
4. Re-sign the latest medical-data release package so `manifest.json` carries a signature valid under the new key.
5. Trigger a new Web/PWA deployment and Android APK build (using the **existing** Android APK keystore so users can install the APK update in-place without uninstalling).
6. Once updated, all clients automatically adopt the new embedded `VITE_UMED_PUBLIC_KEY_PEM` on launch.

### Scenario B: Lost GitHub Secret with Intact Offline Vault
If the GitHub Secret is accidentally deleted or moved to a new repository:
1. Retrieve `umed2-publisher-private.pkcs8.pem` from the offline encrypted vault.
2. Re-create the `UMED_PUBLISHER_PRIVATE_KEY_PEM` GitHub Secret.
3. Confirm the public key fingerprint matches the deployed `VITE_UMED_PUBLIC_KEY_PEM`—no APK or PWA rebuild is needed.
