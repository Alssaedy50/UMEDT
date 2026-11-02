# UMED-2 Medical Data Architecture & Management System

## 1. Overview
UMED-2 DictEngine implements an autonomous, privacy-preserving clinical data management architecture. Medical professionals, students, and institutions can author medical content externally (e.g., via ChatGPT, Claude, Gemini, or medical authoring platforms), bundle the content into standardized `.umedpack` packages, or import original documents directly into UMED-2 on mobile and desktop devices.

## 2. Fundamental Architectural Mandates
1. **Zero On-Device LLMs**:
   - Running local LLMs (GGUF, ONNX, Wasm, or local weight tensors) on mobile phones is strictly forbidden due to severe thermal, battery, and RAM constraints.
   - All AI-assisted extraction and multimodal analysis is **Cloud-Only** via Google Gemini API (`@google/genai` model `gemini-3.8-flash`).
2. **100% Offline Autonomy**:
   - When offline or when no API key is configured, all manual file imports (PDF, DOCX, XLSX, CSV, TXT, MD, JSON, ZIP, UMEDPACK), lexicon searches, study reviews, and backup operations function completely offline.
3. **No Secret Key Leakage**:
   - The user supplies their personal Gemini API key within the app settings. Keys are persisted strictly in client `localStorage` (`dictengine_gemini_api_key_v1`) and are never committed to repositories or bundled into APK binaries.
4. **Three-Tier Version Separation**:
   - `APP_VERSION = '2.2.0'` (Android APK binary & UI version).
   - `DB_SCHEMA_VERSION = 2` (Storage contract version).
   - `BUNDLED_DATA_VERSION = '2026.10.0-umd'` (Built-in offline seed lexicon).

## 3. Storage & Domain Model
The application database manages 7 primary clinical domains:
- **Dictionary Terms (`DictionaryTerm`)**: Anatomical, pathological, and clinical terms with normalized keys, definitions, phonetic transcriptions, grammatical POS, and relational links.
- **Clinical Questions (`UmedMcqQuestion`)**: USMLE/board-style multiple choice questions with options, verified answer keys, clinical rationales, and source attribution.
- **Clinical Cases (`UmedClinicalCase`)**: Patient presentations, chief complaints, investigations, and verified differential diagnoses.
- **Linked Sentences (`LinkedSentence`)**: Contextual bilingual clinical usage sentences with bidirectional term linking.
- **Topic Articles (`TopicArticle`)**: Clinical summaries, anatomical monographs, and structured medical references.
- **Morphological Affixes (`MorphologicalAffix`)**: Medical Latin/Greek prefixes, roots, and suffixes with combining rules.
- **Clinical Abbreviations (`ClinicalAbbreviation`)**: Ward, prescription (Rx), cardiopulmonary, and laboratory acronyms.

## 4. Atomic Import & 1-Click Rollback
- Every import operation automatically creates a pre-import snapshot (`auto-pre-import`).
- Operations are executed atomically: if any fatal schema or data error occurs during parsing or merging, the state rolls back to the pre-import snapshot automatically.
- Users can revert any previous import at any time from the **Import History** tab.
