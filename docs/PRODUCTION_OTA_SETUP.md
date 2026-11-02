# Production OTA Architecture & Application Setup Guide

This guide details the **Over-The-Air (OTA) Medical Data Update Architecture** in UMED-2, covering the client engine, security rules, environment configurations, and the separation between Production, Development, and Automated Test environments.

---

## 1. System Overview & The Three Environments

UMED-2 maintains a strict boundary between three execution environments:

| Environment | Primary Purpose | Manifest Endpoint | Storage Engine | Signature Verification |
|---|---|---|---|---|
| **Production OTA** | Deployed Web, PWA & Standalone APK | `https://data.umed2.org/stable/manifest.json` *(Cloudflare R2)* | Cloudflare R2 Global CDN | Mandatory (`VITE_UMED_PUBLIC_KEY_PEM`) |
| **Local Development OTA** | Local developer testing during feature development | `http://localhost:3000/api/ota-test/manifest.json` | Express `server.ts` memory store | Ephemeral ECDSA test key |
| **Automated Test OTA** | CI/CD test suites (`npm test`) | Ephemeral OS-assigned port `127.0.0.1:0` | Node.js mock HTTP server | Verified test keypair (`keyGenA`/`keyGenB`) |

> **CRITICAL RULE:** Production APK and PWA builds NEVER depend on a local Node.js Express server. Production clients download manifests and packages directly from the public HTTPS R2 endpoint.

---

## 2. Security & Integrity Guarantees

### 2.1 Authoritative Build-Embedded Public Key Lock
When `VITE_UMED_PUBLIC_KEY_PEM` is embedded in the build (via GitHub Variables or `.env` during `npm run build`), the function `isTrustedPublicKeyLockedByBuild()` returns `true`:
- The client application enforces this key as the authoritative signing authority.
- Neither user settings nor malicious tampering with `localStorage` can override or disable signature verification.
- Any downloaded package not signed by the corresponding private key is rejected immediately.

### 2.2 Default Update Policy: `notify-only`
By default, UMED-2 operates under the **`notify-only`** policy:
- When a new update is detected on R2, the app informs the user with an in-app banner.
- The app **does not silently download data** over metered cellular networks without user consent.
- The user can tap **«تنزيل وتثبيت التحديث»** to download and apply the package.
- Users who prefer hands-free updates can switch to **`auto-install`** in the Library View settings.

### 2.3 Atomic Installation & Automatic Pre-Update Snapshot
Before applying any package:
1. The app takes an automatic backup snapshot (`trigger: 'auto-pre-update'`) and computes its SHA-256.
2. The package is inspected for Zip Bombs, Zip Slip path traversal, and prohibited file extensions (such as SQLite binaries).
3. The records are validated against the schema.
4. If validation succeeds, all domains (terms, sentences, topics, affixes, abbreviations) are committed atomically.
5. If anything fails, the entire transaction rolls back to the pre-update snapshot with zero data loss.

### 2.4 Offline-First Resilience
If the device has no internet access:
- The app shell, local dictionary, knowledge graph, and morphological translator remain 100% operational.
- The update checker transitions gracefully to the `'offline'` phase without throwing unhandled exceptions or disrupting user workflow.

---

## 3. Configuring the Production Client Build

To build the standalone Android APK or Web PWA with production Cloudflare R2 update capabilities:

### In GitHub Actions (Automated)
Ensure the following variables are configured in **Repository Variables**:
```bash
VITE_UMED_MANIFEST_URL="https://data.umed2.org/stable/manifest.json"
VITE_UMED_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----"
```

### In Local Builds (Manual)
Create a `.env` file containing:
```env
VITE_UMED_MANIFEST_URL=https://data.umed2.org/stable/manifest.json
VITE_UMED_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Then compile and sync:
```bash
npm run build
npx cap sync android
```

The resulting APK in `android/app/build/outputs/apk/release/` and Web PWA in `dist/` will automatically check the Cloudflare R2 repository and enforce cryptographic signature verification on every update.
