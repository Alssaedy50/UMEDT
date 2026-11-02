# Cloudflare R2 Production Repository Setup Guide

This guide describes how to provision, configure, and secure the **Cloudflare R2 Object Storage Repository** for distributing UMED-2 medical data updates.

---

## 1. Overview & Logical Directory Structure

UMED-2 uses Cloudflare R2 as an immutable, globally distributed CDN storage for clinical knowledge packs. The repository enforces strict separation between **`stable`** and **`beta`** release channels:

```text
umed2-medical-data/
├── stable/
│   ├── manifest.json                                # Channel pointer to latest stable release
│   ├── packages/
│   │   └── umed2-data-2026.10.0-umd.zip            # Immutable release package (.zip)
│   └── releases/
│       └── 2026.10.0-umd/
│           └── release.json                         # Permanent release audit metadata
│
└── beta/
    ├── manifest.json                                # Channel pointer to latest beta release
    ├── packages/
    │   └── umed2-data-2026.11.0-beta.1.zip
    └── releases/
        └── 2026.11.0-beta.1/
            └── release.json
```

### Core Architecture Guarantees
1. **Immutable Packages:** Once `umed2-data-{version}.zip` is uploaded, it is permanent and cannot be replaced or modified.
2. **Deterministic Upload Sequence:** The `.zip` package is uploaded and verified *first*, followed by the release audit record. `manifest.json` is published *last*, guaranteeing that client devices never encounter a 404 for a newly announced update.
3. **No Browser Write Privileges:** Browsers and unauthorized clients can only perform `GET` and `HEAD` requests. Writing to R2 requires an authenticated Cloudflare API token scoped to CI automation.

---

## 2. Step-by-Step Cloudflare R2 Bucket Provisioning

### Step 2.1: Create the R2 Bucket
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, select **R2** > **Overview**.
3. Click **Create bucket**.
4. Set the **Bucket name** to:
   ```text
   umed2-medical-data
   ```
   *(Or your custom bucket name, e.g. `umed-data-releases`)*.
5. Choose **Default** or your preferred jurisdiction (e.g., Automatic / Western Europe).
6. Click **Create bucket**.

---

### Step 2.2: Enable Public HTTPS Access

Clients (PWA and Android APK) need public HTTPS access to read `manifest.json` and download `.zip` packages without needing authentication tokens:

#### Option A: Custom Domain (Recommended for Production)
1. Inside your bucket overview, navigate to the **Settings** tab.
2. Scroll to **Public Access** > **Custom Domains**.
3. Click **Connect Domain**.
4. Enter your custom domain (e.g. `data.umed2.org` or `cdn.umed2.org`).
5. Cloudflare will automatically provision a managed SSL certificate and route requests to your R2 bucket.
6. Your public base URL will be:
   ```text
   https://data.umed2.org
   ```

#### Option B: R2 Managed Public Bucket URL (R2.dev)
1. In bucket **Settings** > **Public Access**, locate **R2.dev subdomain**.
2. Click **Allow Access** and type `allow` to confirm.
3. Copy the generated public URL (e.g. `https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev`).

---

### Step 2.3: Apply CORS Policy

To allow web browsers, Android WebViews, and service workers to fetch manifests and download packages with range request and byte counter support, apply the CORS policy in `r2/cors-policy.json`:

1. In your bucket **Settings**, scroll to **CORS Policy**.
2. Click **Add CORS policy** (or Edit).
3. Paste the contents of `r2/cors-policy.json`:

```json
[
  {
    "AllowedOrigins": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Range",
      "If-Modified-Since",
      "If-None-Match",
      "Accept",
      "Origin",
      "Content-Type"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Content-Range",
      "ETag",
      "Last-Modified"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

> **Security Note:** `AllowedMethods` strictly permits `GET` and `HEAD` only. Browsers are barred from `PUT`, `POST`, or `DELETE` operations.

---

## 3. Least-Privilege Cloudflare API Token Setup

To allow GitHub Actions to publish releases, create an API token with **the minimum required privileges**:

1. In the Cloudflare Dashboard, click your user avatar (top right) > **My Profile** > **API Tokens**.
2. Click **Create Token**.
3. Under **Create Custom Token**, click **Get started**.
4. Set **Token name**: `UMED-2 R2 Release Publisher`.
5. Under **Permissions**, select:
   - **Account** — **Workers R2 Storage** — **Edit**
6. Under **Account Resources**:
   - Include — **Specific account** — Select your Cloudflare Account.
7. Under **Bucket Resources** (if available):
   - Include — Select `umed2-medical-data`.
8. Click **Continue to summary** > **Create Token**.
9. **Copy the generated API Token immediately.** Cloudflare will not show it again.
10. Note your **Account ID** from the Cloudflare Dashboard sidebar (under Account ID).

---

## 4. GitHub Repository Configuration

Configure your GitHub repository (`Alssaedy50/UMED-2`) with the following settings:

### Repository Secrets (`Settings` > `Secrets and variables` > `Actions` > `Secrets`)
| Secret Name | Description | Example / Format |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with R2 Edit permissions | `v1.0-xxxxxxxxxxxxxxxxxxxx` |
| `CLOUDFLARE_ACCOUNT_ID` | 32-character Cloudflare account identifier | `9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d` |
| `UMED_PUBLISHER_PRIVATE_KEY_PEM` | Permanent ECDSA-P256 private key (PKCS#8 PEM) | `-----BEGIN PRIVATE KEY-----\n...` |

### Repository Variables (`Settings` > `Secrets and variables` > `Actions` > `Variables`)
| Variable Name | Description | Example / Format |
|---|---|---|
| `UMED_R2_BUCKET` | Name of your R2 bucket | `umed2-medical-data` |
| `UMED_R2_PUBLIC_BASE_URL` | Public HTTPS base URL for R2 downloads | `https://data.umed2.org` |
| `VITE_UMED_PUBLIC_KEY_PEM` | Trusted ECDSA-P256 public key (SPKI PEM) | `-----BEGIN PUBLIC KEY-----\n...` |

---

## 5. Local Dry-Run Testing

You can test the R2 upload sequence locally without writing to Cloudflare by using the `--dry-run` flag:

```bash
# Test dry run using existing release artifacts
npx tsx scripts/upload-release-to-r2.ts --channel stable --dry-run
```

Output confirms the execution order, key resolution, and SHA-256 verification before making any network modifications.
