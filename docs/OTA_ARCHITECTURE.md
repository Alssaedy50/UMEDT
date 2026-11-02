# UMED-2 Dual-Track Over-The-Air (OTA) & Local Update Architecture

## 1. Dual-Track Operation
UMED-2 maintains strict independence between two update channels:
- **Track A: Local Medical Data Import (Offline-First)**:
  - Users import packages (`.umedpack`, `.zip`, `.json`) directly from device storage without an internet connection.
  - Zero cloud dependency, zero external account requirements.
- **Track B: Remote Cloud OTA Updates (Optional Online)**:
  - When connected to the internet, checks for remote releases via HTTPS (Cloudflare R2 or GitHub Releases).
  - Verifies ECDSA-P256-SHA256 digital signature against build-locked public key (`VITE_UMED_PUBLIC_KEY_PEM`).
  - Default policy is `notify-only`, giving users full agency over when to download updates.

## 2. Decoupling from Cloudflare R2
Cloudflare R2 is an optional distribution CDN for automated institutional releases, NOT a mandatory runtime requirement. If R2 is inaccessible or unconfigured, the application runs with 100% functionality using local data import and offline storage.
