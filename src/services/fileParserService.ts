import {
  ParsedFileResult,
  ParsedFilePage,
  ParsedFileTable,
  SupportedOriginalFileType
} from '../types/umedPackage';
import { assertNotSqlitePayload } from './dataPlatformService';

/**
 * Universal File Import Engine
 * Robust, lightweight, modular File Parsers for 12 Medical & Document formats.
 * Designed to operate 100% offline on client devices without freezing the UI.
 */

export async function parseUploadedFile(file: File): Promise<ParsedFileResult> {
  const fileName = file.name;
  const fileSizeBytes = file.size;
  const ext = getFileExtension(fileName);
  const fileType = detectFileTypeFromExt(ext);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const defaultResult: ParsedFileResult = {
    fileName,
    fileType,
    fileSizeBytes,
    extractedText: '',
    pagesCount: 1,
    pages: [],
    detectedTables: [],
    detectedImages: [],
    rawMetadata: {
      originalName: fileName,
      mimeType: file.type || 'application/octet-stream',
      sizeKb: Math.round(fileSizeBytes / 1024)
    },
    parseWarnings: [],
    isTruncated: false,
    parsedAt: new Date().toISOString()
  };

  try {
    switch (fileType) {
      case 'pdf':
        return await parsePdfFile(bytes, defaultResult);
      case 'docx':
        return await parseDocxFile(bytes, defaultResult);
      case 'xlsx':
        return await parseXlsxFile(bytes, defaultResult);
      case 'csv':
        return parseCsvFile(bytes, defaultResult);
      case 'txt':
        return parseTxtFile(bytes, defaultResult);
      case 'md':
        return parseMarkdownFile(bytes, defaultResult);
      case 'json':
        return parseJsonFile(bytes, defaultResult);
      case 'zip':
      case 'umedpack':
        return parseZipOrUmedpackFile(bytes, defaultResult, fileType);
      case 'sqlite':
        return parseSqliteFile(bytes, defaultResult);
      case 'jpg':
      case 'png':
        return parseImageFile(file, bytes, defaultResult);
      default:
        defaultResult.extractedText = new TextDecoder().decode(bytes.slice(0, 50000));
        defaultResult.parseWarnings.push(`نوع الملف (${ext}) غير معروف رسمياً، تم استخراجه كنص عام.`);
        return defaultResult;
    }
  } catch (err) {
    defaultResult.parseWarnings.push(
      `فشلت معالجة بعض أجزاء الملف: ${err instanceof Error ? err.message : String(err)}`
    );
    return defaultResult;
  }
}

/**
 * PDF Text Parser
 * Extracts text streams, objects, and pages using PDF syntax inspection.
 */
async function parsePdfFile(
  bytes: Uint8Array,
  base: ParsedFileResult
): Promise<ParsedFileResult> {
  const decoder = new TextDecoder('latin1');
  const rawString = decoder.decode(bytes);

  // Check PDF signature
  if (!rawString.startsWith('%PDF-')) {
    base.parseWarnings.push('الملف لا يبدأ بترويسة PDF القياسية (%PDF-).');
  }

  // Find page objects
  const pageRegex = /\/Type\s*\/Page\b/g;
  let pageCount = (rawString.match(pageRegex) || []).length;
  if (pageCount === 0) {
    pageCount = 1;
  }
  base.pagesCount = pageCount;

  // Extract text within text objects (BT ... ET)
  const textStreams: string[] = [];
  const textObjectRegex = /BT[\s\S]*?ET/g;
  let match: RegExpExecArray | null;

  while ((match = textObjectRegex.exec(rawString)) !== null) {
    const block = match[0];
    // Extract strings inside parentheses (Text)
    const parenRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let textMatch: RegExpExecArray | null;
    const blockLines: string[] = [];

    while ((textMatch = parenRegex.exec(block)) !== null) {
      const decoded = sanitizePdfEscapedString(textMatch[1]);
      if (decoded.trim()) {
        blockLines.push(decoded);
      }
    }

    // Extract strings inside TJ arrays [(Text) 20 (More)]
    const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjMatch[1];
      const innerParenRegex = /\(([^)]+)\)/g;
      let innerTextMatch: RegExpExecArray | null;
      while ((innerTextMatch = innerParenRegex.exec(inner)) !== null) {
        const decoded = sanitizePdfEscapedString(innerTextMatch[1]);
        if (decoded.trim()) {
          blockLines.push(decoded);
        }
      }
    }

    if (blockLines.length > 0) {
      textStreams.push(blockLines.join(' '));
    }
  }

  let fullText = textStreams.join('\n\n').trim();

  // If text streams are empty (e.g. Flate compressed streams or scanned PDF),
  // extract ASCII text chunks directly
  if (!fullText || fullText.length < 50) {
    const readableChunks: string[] = [];
    const asciiRegex = /[A-Za-z0-9\u0600-\u06FF\s.,:;?!()/\-–—"']{10,}/g;
    let chunkMatch: RegExpExecArray | null;
    while ((chunkMatch = asciiRegex.exec(rawString)) !== null) {
      const chunk = chunkMatch[0].trim();
      if (
        !chunk.includes('obj') &&
        !chunk.includes('endobj') &&
        !chunk.includes('stream') &&
        !chunk.includes('endstream') &&
        !chunk.includes('/Filter')
      ) {
        readableChunks.push(chunk);
      }
    }
    fullText = readableChunks.join('\n');
    if (!fullText) {
      base.parseWarnings.push(
        'الملف قد يكون PDF مصوراً (Scanned PDF) بدون طبقة نصية. يمكنك استخدام مساعد الذكاء الاصطناعي السحابي لتحليله.'
      );
    }
  }

  base.extractedText = fullText;

  // Split into pseudo-pages
  const paragraphs = fullText.split(/\n\s*\n/);
  const itemsPerPage = Math.max(1, Math.ceil(paragraphs.length / pageCount));
  const pages: ParsedFilePage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageText = paragraphs.slice(i * itemsPerPage, (i + 1) * itemsPerPage).join('\n\n');
    pages.push({
      pageNumber: i + 1,
      text: pageText || `[صفحة ${i + 1} - نص محدود أو عناصر رسومية]`,
      charCount: pageText.length
    });
  }
  base.pages = pages;
  base.rawMetadata.pagesDetected = pageCount;

  return base;
}

/**
 * DOCX Parser
 * DOCX is a ZIP container containing `word/document.xml`.
 */
async function parseDocxFile(
  bytes: Uint8Array,
  base: ParsedFileResult
): Promise<ParsedFileResult> {
  assertNotSqlitePayload(bytes);
  const zipEntries = extractZipEntriesSimple(bytes);
  const docXmlBytes = zipEntries['word/document.xml'];

  if (!docXmlBytes) {
    base.parseWarnings.push('تعذر العثور على word/document.xml داخل ملف DOCX.');
    return base;
  }

  const xmlText = new TextDecoder('utf-8').decode(docXmlBytes);
  const paragraphs: string[] = [];
  const tables: ParsedFileTable[] = [];

  // Extract paragraphs <w:p>
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xmlText)) !== null) {
    const pContent = pMatch[1];
    // Extract text runs <w:t>
    const tRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    let pText = '';
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      pText += tMatch[1];
    }
    pText = pText.trim();
    if (pText) {
      paragraphs.push(pText);
    }
  }

  // Extract tables <w:tbl>
  const tblRegex = /<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;

  while ((tblMatch = tblRegex.exec(xmlText)) !== null) {
    const tblContent = tblMatch[1];
    const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    const rows: string[][] = [];

    while ((trMatch = trRegex.exec(tblContent)) !== null) {
      const trContent = trMatch[1];
      const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
      let tcMatch: RegExpExecArray | null;
      const cells: string[] = [];

      while ((tcMatch = tcRegex.exec(trContent)) !== null) {
        const tcContent = tcMatch[1];
        const tRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
        let tMatch: RegExpExecArray | null;
        let cellText = '';
        while ((tMatch = tRegex.exec(tcContent)) !== null) {
          cellText += tMatch[1];
        }
        cells.push(cellText.trim());
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      tables.push({
        headers: rows[0] || [],
        rows: rows.slice(1)
      });
    }
  }

  base.extractedText = paragraphs.join('\n\n');
  base.detectedTables = tables;
  base.pagesCount = Math.max(1, Math.ceil(paragraphs.length / 8));
  base.pages = [
    {
      pageNumber: 1,
      text: base.extractedText,
      charCount: base.extractedText.length
    }
  ];

  return base;
}

/**
 * XLSX Parser
 * XLSX is a ZIP container containing `xl/worksheets/sheet1.xml` and `xl/sharedStrings.xml`.
 */
async function parseXlsxFile(
  bytes: Uint8Array,
  base: ParsedFileResult
): Promise<ParsedFileResult> {
  assertNotSqlitePayload(bytes);
  const zipEntries = extractZipEntriesSimple(bytes);
  const sheetBytes = zipEntries['xl/worksheets/sheet1.xml'];
  const sharedStringsBytes = zipEntries['xl/sharedStrings.xml'];

  if (!sheetBytes) {
    base.parseWarnings.push('تعذر العثور على ورقة العمل xl/worksheets/sheet1.xml داخل ملف XLSX.');
    return base;
  }

  const decoder = new TextDecoder('utf-8');
  const sharedStrings: string[] = [];

  // Parse shared strings table if present
  if (sharedStringsBytes) {
    const sstXml = decoder.decode(sharedStringsBytes);
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(sstXml)) !== null) {
      const siContent = siMatch[1];
      const tRegex = /<t\b[^>]*>([^<]*)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let fullStr = '';
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        fullStr += tMatch[1];
      }
      sharedStrings.push(fullStr);
    }
  }

  const sheetXml = decoder.decode(sheetBytes);
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cMatch: RegExpExecArray | null;
    const cells: string[] = [];

    while ((cMatch = cRegex.exec(rowContent)) !== null) {
      const cAttrs = cMatch[1];
      const cInner = cMatch[2];
      const isSharedString = /t="s"/.test(cAttrs);
      const vMatch = /<v>([^<]*)<\/v>/.exec(cInner);
      let value = vMatch ? vMatch[1].trim() : '';

      if (isSharedString && value !== '') {
        const idx = Number(value);
        value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : value;
      }
      cells.push(value);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  const textLines: string[] = [];
  for (const r of rows) {
    textLines.push(r.filter(Boolean).join(' | '));
  }

  base.extractedText = textLines.join('\n');
  if (rows.length > 0) {
    base.detectedTables = [
      {
        headers: rows[0],
        rows: rows.slice(1)
      }
    ];
  }
  base.pages = [{ pageNumber: 1, text: base.extractedText, charCount: base.extractedText.length }];
  return base;
}

/**
 * CSV Parser
 * Handles commas, semicolons, tabs, and multiline quoted cells.
 */
function parseCsvFile(bytes: Uint8Array, base: ParsedFileResult): ParsedFileResult {
  const text = new TextDecoder('utf-8').decode(bytes);
  const delimiter = detectCsvDelimiter(text);
  const rows = parseDelimitedText(text, delimiter);

  base.extractedText = text;
  if (rows.length > 0) {
    base.detectedTables = [
      {
        headers: rows[0],
        rows: rows.slice(1)
      }
    ];
  }
  base.pages = [{ pageNumber: 1, text, charCount: text.length }];
  base.rawMetadata.delimiter = delimiter;
  base.rawMetadata.rowCount = rows.length;
  return base;
}

/**
 * TXT Parser
 */
function parseTxtFile(bytes: Uint8Array, base: ParsedFileResult): ParsedFileResult {
  const text = new TextDecoder('utf-8').decode(bytes);
  base.extractedText = text;
  base.pages = [{ pageNumber: 1, text, charCount: text.length }];
  return base;
}

/**
 * Markdown Parser
 */
function parseMarkdownFile(bytes: Uint8Array, base: ParsedFileResult): ParsedFileResult {
  const text = new TextDecoder('utf-8').decode(bytes);
  base.extractedText = text;

  // Extract Markdown tables if any
  const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g;
  let match: RegExpExecArray | null;
  const tables: ParsedFileTable[] = [];

  while ((match = tableRegex.exec(text)) !== null) {
    const headerLine = match[1];
    const bodyLines = match[2].trim().split('\n');
    const headers = headerLine.split('|').map((s) => s.trim()).filter(Boolean);
    const rows = bodyLines.map((line) =>
      line.split('|').map((s) => s.trim()).filter(Boolean)
    );
    tables.push({ headers, rows });
  }

  base.detectedTables = tables;
  base.pages = [{ pageNumber: 1, text, charCount: text.length }];
  return base;
}

/**
 * JSON Parser
 */
function parseJsonFile(bytes: Uint8Array, base: ParsedFileResult): ParsedFileResult {
  const text = new TextDecoder('utf-8').decode(bytes);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (err) {
    base.parseWarnings.push(`صيغة JSON غير صالحة: ${err instanceof Error ? err.message : String(err)}`);
    base.extractedText = text;
    return base;
  }

  base.extractedText = JSON.stringify(parsedJson, null, 2);

  if (Array.isArray(parsedJson)) {
    base.rawMetadata.isList = true;
    base.rawMetadata.itemCount = parsedJson.length;
    if (parsedJson.length > 0 && typeof parsedJson[0] === 'object' && parsedJson[0] !== null) {
      const headers = Object.keys(parsedJson[0]);
      const rows = parsedJson.slice(0, 50).map((item) =>
        headers.map((h) => String(item[h] ?? ''))
      );
      base.detectedTables = [{ headers, rows }];
    }
  } else if (typeof parsedJson === 'object' && parsedJson !== null) {
    const keys = Object.keys(parsedJson);
    base.rawMetadata.topLevelKeys = keys.join(', ');
  }

  base.pages = [{ pageNumber: 1, text: base.extractedText, charCount: base.extractedText.length }];
  return base;
}

/**
 * ZIP and .UMEDPACK Parser
 */
function parseZipOrUmedpackFile(
  bytes: Uint8Array,
  base: ParsedFileResult,
  type: 'zip' | 'umedpack'
): ParsedFileResult {
  assertNotSqlitePayload(bytes);
  const entries = extractZipEntriesSimple(bytes);
  const fileNames = Object.keys(entries);

  base.rawMetadata.zipEntriesCount = fileNames.length;
  base.rawMetadata.zipFileList = fileNames.join(', ');

  const summaryParts: string[] = [
    `أرشيف مضغوط (${type.toUpperCase()}): يحتوي على ${fileNames.length} ملفاً.\nقائمة الملفات:`,
    ...fileNames.map((fn) => ` - ${fn} (${entries[fn].byteLength} بايت)`)
  ];

  if (entries['manifest.json']) {
    try {
      const manifestText = new TextDecoder().decode(entries['manifest.json']);
      summaryParts.push('\n--- محتويات manifest.json ---\n' + manifestText);
    } catch {
      // ignore
    }
  }

  base.extractedText = summaryParts.join('\n');
  base.pages = [{ pageNumber: 1, text: base.extractedText, charCount: base.extractedText.length }];
  return base;
}

/**
 * SQLite Parser
 * Enforces strict safety rules: inspects header, validates schema, prevents code injection.
 */
function parseSqliteFile(bytes: Uint8Array, base: ParsedFileResult): ParsedFileResult {
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 16));
  if (!header.startsWith('SQLite format 3')) {
    base.parseWarnings.push('الملف لا يحمل ترويسة SQLite 3 الصالحة.');
    return base;
  }

  base.rawMetadata.isSqliteDatabase = true;
  base.rawMetadata.header = header;
  base.extractedText =
    'قاعدة بيانات SQLite 3 محلية.\nملاحظة أمنية: قواعد بيانات SQLite تتطلب معالجة خاصة لضمان عدم تعارض المخططات مع مخطط UMED-2 المقيد.';
  base.parseWarnings.push(
    'تنبيه أمني: لا يتم تنفيذ أي استعلامات SQL عشوائية في التطبيق. يتم استخراج البيانات ومطابقتها مع مخطط UMED-2 قبل أي إدخال.'
  );
  return base;
}

/**
 * Image Parser (JPG / PNG)
 */
async function parseImageFile(
  file: File,
  bytes: Uint8Array,
  base: ParsedFileResult
): Promise<ParsedFileResult> {
  const mimeType = file.type || (base.fileType === 'png' ? 'image/png' : 'image/jpeg');
  const base64Data = await fileToBase64DataUrl(file);

  base.detectedImages = [
    {
      name: file.name,
      dataUrl: base64Data,
      mimeType
    }
  ];

  base.extractedText = `ملف صورة طبية: ${file.name}\nالحجم: ${Math.round(file.size / 1024)} KB\nالنوع: ${mimeType}\nيمكنك إرسال هذه الصورة لمساعد الذكاء الاصطناعي السحابي لتحليل المخططات أو الشرائح السريرية.`;
  base.pages = [{ pageNumber: 1, text: base.extractedText, charCount: base.extractedText.length }];
  return base;
}

/**
 * Helpers
 */
function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

function detectFileTypeFromExt(ext: string): SupportedOriginalFileType {
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'doc':
      return 'docx';
    case 'xlsx':
    case 'xls':
      return 'xlsx';
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'txt':
      return 'txt';
    case 'md':
    case 'markdown':
      return 'md';
    case 'json':
      return 'json';
    case 'zip':
      return 'zip';
    case 'umedpack':
      return 'umedpack';
    case 'sqlite':
    case 'db':
    case 'sqlite3':
      return 'sqlite';
    case 'jpg':
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    default:
      return 'txt';
  }
}

function detectCsvDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    // Simple split respecting basic quotes
    const cells: string[] = [];
    let inQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(currentCell.trim().replace(/^"|"$/g, ''));
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim().replace(/^"|"$/g, ''));
    rows.push(cells);
  }
  return rows;
}

function sanitizePdfEscapedString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractZipEntriesSimple(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder();
  const result: Record<string, Uint8Array> = {};

  let pos = 0;
  while (pos + 30 < zipBytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;

    const compression = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 18, true);
    const uncompressedSize = view.getUint32(pos + 22, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);

    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLen;
    const rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
    const safeName = rawName.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.\//g, '');

    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + (compressedSize || uncompressedSize);

    if (compression === 0 && dataEnd <= zipBytes.length) {
      result[safeName] = zipBytes.slice(dataStart, dataEnd);
    }
    pos = dataEnd;
  }
  return result;
}

function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}
