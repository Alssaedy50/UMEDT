# Automated Medical Data Publishing Guide

This document describes how to build, cryptographically sign, verify, and publish UMED-2 clinical knowledge packages to Cloudflare R2 using the automated release workflow.

---

## 1. Release Lifecycle & Architecture

UMED-2 decouples medical data releases from application releases:
- **Application Engine (`APP_VERSION` = `2.2.0`):** Shipped via APK and Web PWA.
- **Database Schema (`DB_SCHEMA_VERSION` = `2`):** Defines the storage contract.
- **Medical Data (`BUNDLED_DATA_VERSION` = `2026.10.0-umd` / OTA updates):** Shipped via signed `.zip` packages.

Once APK v2.2.0 is installed, medical data releases are published and distributed over the air without recompiling or reinstalling the Android APK.

---

## 2. Publishing a Release via GitHub Actions (Recommended)

1. Open the repository on GitHub: `Alssaedy50/UMED-2`.
2. Navigate to the **Actions** tab.
3. In the left workflow list, select **UMED-2 Medical Data Release & Cloudflare R2 Publishing**.
4. Click the **Run workflow** dropdown on the right.
5. Configure the inputs:
   - **Target Release Channel:** Select `stable` (for production) or `beta` (for pre-release testing).
   - **Target data version:** Enter a CalVer/SemVer string (e.g., `2026.11.0-umd`) or leave blank to automatically calculate the next version.
   - **Release summary:** Briefly describe the clinical updates (e.g., `تحديث مصطلحات طب القلب التداخلي ومضاعفات الشرايين التاجية`).
   - **Dry Run mode:** Check this box if you want to simulate checks without uploading to R2.
6. Click **Run workflow**.

### Workflow Execution Stages
The GitHub Actions workflow executes the following steps in sequence:
1. **Pre-Publish Gatekeeper:** Runs TypeScript linting (`npm run lint`) and the full cryptographic readiness suite (`npm test`). If any check fails, the release halts immediately.
2. **Keypair Validation:** Confirms `UMED_PUBLISHER_PRIVATE_KEY_PEM` matches `VITE_UMED_PUBLIC_KEY_PEM` using `verifyPublisherKeyPairMatch`.
3. **Build & Sign:** Packages the dictionary terms, sentences, affixes, and abbreviations into a deterministic `.zip` bundle and signs it with `ECDSA-P256-SHA256`.
4. **Immutable Package Upload:** Checks R2 to ensure no existing package with the same name exists with different content. Uploads `umed2-data-{version}.zip` to `{channel}/packages/`.
5. **Package Verification:** Verifies the package on R2 and validates its size.
6. **Release Record Upload:** Uploads `{channel}/releases/{version}/release.json`.
7. **Manifest Upload (LAST):** Uploads `{channel}/manifest.json` pointing to the uploaded package.
8. **Artifact Archive:** Saves all release files as GitHub Actions artifacts for audit records.

---

## 3. Publishing Locally via CLI

You can also run the publisher locally if your development machine has the required environment variables:

```bash
# 1. Generate keys if not already done
npx tsx scripts/generate-signing-keys.ts

# 2. Export environment variables
export UMED_PUBLISHER_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n..."
export VITE_UMED_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n..."
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export UMED_R2_BUCKET="umed2-medical-data"
export UMED_R2_PUBLIC_BASE_URL="https://data.umed2.org"

# 3. Publish a stable release with R2 upload
npx tsx scripts/publish-data-release.ts \
  --channel stable \
  --version 2026.11.0-umd \
  --summary "تحديث شامل لمصطلحات المعجم الطبي الموحد" \
  --upload-r2
```

---

## 4. How Clients Receive the Update

1. **Automatic Detection:** The UMED-2 app checks `{VITE_UMED_MANIFEST_URL}` on startup or when the user clicks **«فحص التحديثات الآن»** in Library View.
2. **Compatibility Verification:** The app checks that `manifest.schemaVersion === 2` and `manifest.minAppVersion <= 2.2.0`.
3. **Download with Range Resumption:** The client downloads the `.zip` package.
4. **SHA-256 Checksum Verification:** The app computes the SHA-256 digest of the downloaded bytes and compares it against `manifest.sha256`.
5. **ECDSA Signature Verification:** The client cryptographically verifies `manifest.signature` against the build-embedded `VITE_UMED_PUBLIC_KEY_PEM`.
6. **Pre-Update Snapshot:** Before applying any change, the app creates an automatic restore snapshot in local storage.
7. **Atomic Installation:** The data is committed all-at-once (All-or-Nothing).

---

## 5. Rollback Procedures

### Method 1: In-App User Rollback
If a user experiences an issue with a newly downloaded release, they can click **«التراجع للإصدار السابق»** in the Library View. This immediately restores the pre-update state from local storage.

### Method 2: Publisher Channel Rollback
If a published release needs to be rolled back for all users:
1. Re-run the publishing workflow specifying the previous known good version, OR:
2. Update `{channel}/manifest.json` in Cloudflare R2 to point back to the previous release package.
3. Because all past release packages remain preserved in `{channel}/packages/`, client applications will detect the manifest version change and roll back safely.

---

## 6. Key Rotation & Security Compromise Procedure

If the publisher private key is ever exposed or compromised:
1. Immediately run:
   ```bash
   npx tsx scripts/generate-signing-keys.ts
   ```
2. Update `UMED_PUBLISHER_PRIVATE_KEY_PEM` in GitHub Secrets.
3. Update `VITE_UMED_PUBLIC_KEY_PEM` in GitHub Variables.
4. Build and release a new Android APK (`v2.2.1` or higher) with the new embedded public key.
5. Older client installations will reject any package signed with an unauthorized key.
