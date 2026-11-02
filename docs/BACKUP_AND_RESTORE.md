# UMED-2 Local Backup & Restore Architecture

## 1. Backup Formats & Portability
UMED-2 provides two offline, client-side backup formats:
1. **ZIP Archive (`.zip`)**: Contains separate JSON files for each domain (`terms.json`, `questions.json`, `sentences.json`, `topics.json`, `affixes.json`, `abbreviations.json`, and `manifest.json`).
2. **Unified JSON Backup (`.json`)**: Contains a single serialized payload with checksums and schema metadata.

## 2. Automated & Manual Snapshots
- **Auto Pre-Import (`auto-pre-import`)**: Automatically recorded prior to executing any batch import.
- **Auto Pre-Update (`auto-pre-update`)**: Automatically recorded prior to applying remote OTA data updates.
- **Manual Snapshot (`manual`)**: Created on-demand by the user from the Medical Data Center or Library view.

## 3. Atomic Restoration & Rollback
- Restoring a backup overwrites modified domain data while preserving the user's personal favorites and spaced repetition review history (SM-2 intervals).
- Restoring verifies the SHA-256 hash before replacing the database. If verification fails, the current state is preserved intact.
