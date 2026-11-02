# UMED-2 Universal Import Engine

## 1. Supported Formats & Adapter Architecture
The import engine is designed with modular, independent File Adapters avoiding monolithic parser bottlenecks:

| Format | Adapter Type | Extraction Capability | Offline Support |
| :--- | :--- | :--- | :--- |
| **PDF** | `parsePdfFile` | Text streams, page boundaries, tables, ASCII chunk recovery | 100% Offline |
| **DOCX** | `parseDocxFile` | Reads `word/document.xml`, paragraphs, headings, tables | 100% Offline |
| **XLSX** | `parseXlsxFile` | Reads `xl/worksheets/sheet1.xml` & `sharedStrings.xml` | 100% Offline |
| **CSV** | `parseCsvFile` | RFC-4180 delimiter auto-detection (comma, tab, semicolon) | 100% Offline |
| **TXT** | `parseTxtFile` | Plaintext paragraphs & structured bullet points | 100% Offline |
| **Markdown** | `parseMarkdownFile` | Headings, lists, Markdown tables (`| header |`) | 100% Offline |
| **JSON** | `parseJsonFile` | Structural inspection of terms, questions, sentences | 100% Offline |
| **ZIP** | `parseZipOrUmedpackFile`| Multi-file archive inspection, manifest reading | 100% Offline |
| **UMEDPACK**| `inspectAndReadUmedPackage` | Official UMED package verification & atomic extraction | 100% Offline |
| **SQLite** | `parseSqliteFile` | Header inspection, schema compatibility check, SQL injection guard | 100% Offline |
| **JPG / PNG**| `parseImageFile` | Resolution metadata, dataURL generation for Multimodal AI | 100% Offline |

## 2. Security Guardrails
- **Zip Slip Defense**: Path traversal characters (`../`, `..\\`, absolute root slashes) are stripped during extraction.
- **Decompression Bombs**: Archives expanding over 80:1 ratio or 50MB uncompressed are rejected.
- **SQLite Injection Prevention**: Raw SQL statements are never executed against arbitrary uploaded files.
- **Preservation of Original Files**: Uploaded files are never modified or deleted from the user's device.
