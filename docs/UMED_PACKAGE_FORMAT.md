# UMED Medical Package Specification (.umedpack)

## 1. Package Specification Overview
A `.umedpack` file is a standard, uncompressed/deflate ZIP archive containing medical data, metadata, media assets, and cryptographic integrity checksums for UMED-2.

### File Extension
- `.umedpack` (or `.zip`)

### Directory Layout
```text
UMED_Package_Name.umedpack
├── manifest.json
├── data/
│   ├── terms.json
│   ├── questions.json
│   ├── sentences.json
│   ├── topics.json
│   ├── affixes.json
│   ├── abbreviations.json
│   └── clinical_cases.json
├── media/
│   ├── images/
│   ├── diagrams/
│   └── tables/
└── integrity/
    ├── checksums.json
    └── signature.sig (optional)
```

## 2. Manifest Schema (`manifest.json`)
```json
{
  "package_id": "umed-cardiology-2026",
  "package_name": "UMED Cardiology & ECG Core Pack",
  "description": "Comprehensive clinical cardiology dictionary, MCQs, and ECG diagnostic cases.",
  "category": "Cardiovascular Medicine",
  "subject": "Cardiology",
  "language": "bilingual",
  "package_version": "1.0.0",
  "schema_version": 2,
  "minimum_app_version": "2.2.0",
  "created_at": "2026-10-31T12:00:00.000Z",
  "updated_at": "2026-10-31T12:00:00.000Z",
  "author": "Dr. Alssaedy / UMED Editorial Board",
  "source": "Alssaedy Medical Education Library",
  "license": "Creative Commons BY-NC-SA 4.0",
  "records_count": {
    "terms": 120,
    "questions": 45,
    "sentences": 80,
    "topics": 12,
    "affixes": 35,
    "abbreviations": 50,
    "clinicalCases": 20
  },
  "files": [
    "manifest.json",
    "data/terms.json",
    "data/questions.json",
    "data/sentences.json",
    "data/topics.json",
    "data/affixes.json",
    "data/abbreviations.json",
    "data/clinical_cases.json",
    "integrity/checksums.json"
  ],
  "checksums": {
    "data/terms.json": "a3f5...",
    "data/questions.json": "89c2..."
  },
  "signature": "MEQC...",
  "signature_algorithm": "ECDSA-P256-SHA256"
}
```

## 3. Authoring Packages Externally (with ChatGPT, Claude, Gemini, etc.)
Users can ask any LLM to format medical notes into UMED JSON files.
Example prompt to ChatGPT:
```text
Please format the following cardiology lecture into a UMED questions.json array conforming to:
[
  {
    "id": "mcq-cardio-1",
    "questionEn": "...",
    "questionAr": "...",
    "options": [
      { "key": "A", "textEn": "...", "textAr": "..." },
      { "key": "B", "textEn": "...", "textAr": "..." }
    ],
    "correctAnswerKey": "A",
    "explanationEn": "...",
    "specialty": "Cardiology"
  }
]
```
Zip the files into `YourPackage.umedpack` and import via the UMED-2 **Package Manager**.
