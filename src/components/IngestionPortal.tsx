import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  ClipboardPaste,
  X,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Sparkles,
  Copy,
  Check,
  Download,
  PenLine
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  LexiconCategory,
  MorphologicalAffix,
  ClinicalAbbreviation,
  AbbreviationCategory
} from '../types/lexicon';
import { extractLinkedTermsFromText } from '../engine/knowledgeLinker';
import { parseUploadedFile } from '../services/fileParserService';
import { inspectAndReadUmedPackage } from '../services/umedPackageService';
import { extractMedicalTermsFromContent } from '../services/aiProviderService';

export interface StagedTermItem {
  stagingId: string;
  term: string;
  translation: string;
  phonetic: string;
  pos: string;
  category: LexiconCategory;
  umdCode?: string;
  definitionAr: string;
  definitionEn: string;
  examples: { en: string; ar: string }[];
  relations: { synonyms: string[]; broader: string[]; related: string[] };
  isDuplicate: boolean;
  existingId: string | null;
}

interface IngestionPortalProps {
  terms: DictionaryTerm[];
  copiedId: string | null;
  onCopyToClipboard: (text: string, key: string, label?: string) => void;
  onSaveManualTerm: (
    newTerm: DictionaryTerm,
    newLinkedSentences: LinkedSentence[]
  ) => void;
  onCommitBatch: (payload: {
    stagedTerms: StagedTermItem[];
    stagedSentences: LinkedSentence[];
    termExampleEnhancements?: Array<{
      termId: string;
      example: { en: string; ar: string };
    }>;
    incomingAffixes?: MorphologicalAffix[];
    incomingAbbreviations?: ClinicalAbbreviation[];
    stayOnCurrentTab?: boolean;
  }) => void;
  onImportFullBackupJson: (rawJson: string) => boolean;
  onImportPackageFile: (file: File) => void;
  onOpenTermDetail: (termId: string) => void;
  showToast: (message: string, type?: string) => void;
}

/**
 * RFC-4180 compliant single-line CSV/TSV parser that respects quotes `"..."`
 */
export function parseCsvOrTsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function isHeaderRow(columns: string[]): boolean {
  if (columns.length === 0) return false;
  const firstCol = columns[0].toLowerCase().replace(/^["']|["']$/g, '').trim();
  const secondCol = (columns[1] || '')
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .trim();

  const headerKeywords = new Set([
    'term',
    'term_en',
    'english',
    'word',
    'source',
    'en',
    'sentence_en',
    'المصطلح',
    'الكلمة',
    'النص الإنجليزي',
    'الجملة'
  ]);
  const secondHeaderKeywords = new Set([
    'translation',
    'term_ar',
    'translation_ar_umd',
    'arabic',
    'target',
    'ar',
    'meaning',
    'sentence_ar',
    'الترجمة',
    'المعنى',
    'الترجمة العربية'
  ]);

  return headerKeywords.has(firstCol) || secondHeaderKeywords.has(secondCol);
}

function findExistingTermMatch(
  termName: string,
  terms: DictionaryTerm[]
): DictionaryTerm | undefined {
  const norm = termName.trim().toLowerCase();
  if (!norm) return undefined;
  return terms.find((t) => t.term.toLowerCase() === norm);
}

function extractCleanJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  if (firstBrace !== -1 || firstBracket !== -1) {
    const startIdx =
      firstBrace !== -1 && firstBracket !== -1
        ? Math.min(firstBrace, firstBracket)
        : Math.max(firstBrace, firstBracket);
    const endChar = trimmed[startIdx] === '{' ? '}' : ']';
    const lastEndIdx = trimmed.lastIndexOf(endChar);
    if (lastEndIdx > startIdx) {
      return trimmed.slice(startIdx, lastEndIdx + 1);
    }
  }
  return trimmed;
}

/**
 * Universal parser for JSON, CSV, TSV, Excel/Word table lines, or TXT batches of any length.
 */
export function parseBatchContentToStaged(
  sourceText: string,
  terms: DictionaryTerm[]
): {
  isFullBackup: boolean;
  stagedTerms: StagedTermItem[];
  stagedSentences: LinkedSentence[];
  extractedAffixes: MorphologicalAffix[];
  extractedAbbreviations: ClinicalAbbreviation[];
} {
  const rawTermEntries: Array<Record<string, unknown>> = [];
  const rawSentenceEntries: LinkedSentence[] = [];
  const extractedAffixes: MorphologicalAffix[] = [];
  const extractedAbbreviations: ClinicalAbbreviation[] = [];

  try {
    const cleanJsonCandidate = extractCleanJsonCandidate(sourceText);
    const parsed = JSON.parse(cleanJsonCandidate);

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (Array.isArray((parsed as Record<string, unknown>).terms) ||
        Array.isArray((parsed as Record<string, unknown>).sentences) ||
        Array.isArray((parsed as Record<string, unknown>).morphologicalAffixes) ||
        Array.isArray((parsed as Record<string, unknown>).clinicalAbbreviations))
    ) {
      const obj = parsed as {
        terms?: Array<Record<string, unknown>>;
        sentences?: Array<Record<string, unknown>>;
        morphologicalAffixes?: Array<Record<string, unknown>>;
        clinicalAbbreviations?: Array<Record<string, unknown>>;
        version?: number;
      };
      if (obj.version && Array.isArray(obj.terms)) {
        return {
          isFullBackup: true,
          stagedTerms: [],
          stagedSentences: [],
          extractedAffixes: [],
          extractedAbbreviations: []
        };
      }
      if (Array.isArray(obj.terms)) {
        rawTermEntries.push(...obj.terms);
      }
      if (Array.isArray(obj.sentences)) {
        obj.sentences.forEach((s, idx) => {
          const enStr = String(s.en || s.sentence_en || '').trim();
          const arStr = String(s.ar || s.sentence_ar || '').trim();
          if (enStr) {
            rawSentenceEntries.push({
              id: String(s.id || `sent-file-${Date.now()}-${idx}`),
              en: enStr,
              ar: arStr || 'ترجمة سياقية مستوردة',
              category: (s.category as LexiconCategory) || 'Medical',
              specialty: String(s.specialty || 'Imported Context'),
              sourceType: 'termux',
              linkedTermIds: extractLinkedTermsFromText(
                `${enStr} || ${arStr}`,
                terms
              ),
              tags: Array.isArray(s.tags) ? (s.tags as string[]) : ['استيراد ذكي'],
              favorite: Boolean(s.favorite),
              createdAt: 'الآن · استيراد ملف'
            });
          }
        });
      }
      if (Array.isArray(obj.morphologicalAffixes)) {
        obj.morphologicalAffixes.forEach((a, idx) => {
          if (!a || !a.affix || !a.meaningAr) return;
          const rawClean = String(a.cleanKey || a.affix || '')
            .toLowerCase()
            .replace(/[^a-z]/g, '');
          const validType: 'prefix' | 'root' | 'suffix' =
            a.type === 'prefix' || a.type === 'suffix' || a.type === 'root'
              ? a.type
              : String(a.affix).startsWith('-')
                ? 'suffix'
                : 'root';
          extractedAffixes.push({
            id: `ext-aff-${Date.now()}-${idx}`,
            affix: String(a.affix).trim(),
            cleanKey: rawClean || 'medroot',
            type: validType,
            meaningAr: String(a.meaningAr).trim(),
            meaningEn: String(a.meaningEn || a.affix).trim(),
            combiningRule: 'دمج قياسي للمركبات الطبية (WHO UMD)',
            examples: Array.isArray(a.examples) ? a.examples.map(String) : []
          });
        });
      }
      if (Array.isArray(obj.clinicalAbbreviations)) {
        obj.clinicalAbbreviations.forEach((ab, idx) => {
          if (!ab || !ab.abbr || !ab.defaultExpansionEn || !ab.defaultTranslationAr) return;
          const cat = (
            ['Cardiology', 'Vital Signs', 'Lab & Rx', 'Ward & Hx', 'Procedures', 'Diagnosis'].includes(
              String(ab.category)
            )
              ? ab.category
              : 'Diagnosis'
          ) as AbbreviationCategory;
          const triggers = Array.isArray(ab.triggerWords)
            ? ab.triggerWords.map((tw) => ({
                token: String(tw).toLowerCase().trim(),
                weight: 8
              }))
            : [];
          extractedAbbreviations.push({
            id: `ext-abbr-${Date.now()}-${idx}`,
            abbr: String(ab.abbr).trim().toUpperCase(),
            defaultExpansionEn: String(ab.defaultExpansionEn).trim(),
            defaultTranslationAr: String(ab.defaultTranslationAr).trim(),
            category: cat,
            priority: 92,
            isAmbiguous: Boolean(ab.isAmbiguous),
            candidates: [
              {
                expansionEn: String(ab.defaultExpansionEn).trim(),
                translationAr: String(ab.defaultTranslationAr).trim(),
                specialty: cat,
                triggers
              }
            ]
          });
        });
      }
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      !(parsed as Record<string, unknown>).term &&
      !(parsed as Record<string, unknown>).term_en
    ) {
      // Support key-value map JSON like { "Bradycardia": "بطء القلب", "Tachycardia": "تسرع القلب" }
      Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
        if (typeof v === 'string' && k.trim()) {
          rawTermEntries.push({
            term: k.trim(),
            translation: v.trim()
          });
        } else if (v && typeof v === 'object') {
          rawTermEntries.push({
            term: k.trim(),
            ...(v as Record<string, unknown>)
          });
        }
      });
    } else {
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      arr.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object') return;
        const rec = entry as Record<string, unknown>;
        if (
          !rec.term &&
          !rec.term_en &&
          (typeof rec.en === 'string' || typeof rec.sentence_en === 'string')
        ) {
          const enStr = String(rec.en || rec.sentence_en || '').trim();
          const arStr = String(rec.ar || rec.sentence_ar || '').trim();
          if (enStr) {
            rawSentenceEntries.push({
              id: `sent-json-${Date.now()}-${idx}`,
              en: enStr,
              ar: arStr,
              category: (rec.category as LexiconCategory) || 'Medical',
              specialty: String(rec.specialty || 'Imported Sentence'),
              sourceType: 'termux',
              linkedTermIds: extractLinkedTermsFromText(
                `${enStr} || ${arStr}`,
                terms
              ),
              tags: ['مستورد'],
              favorite: false,
              createdAt: 'الآن · دفعة JSON'
            });
          }
        } else {
          rawTermEntries.push(rec);
        }
      });
    }
  } catch {
    const allLines = sourceText
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\d+[\.\)]\s*/, '').replace(/^[-*•]\s*/, ''))
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

    for (let idx = 0; idx < allLines.length; idx++) {
      const line = allLines[idx];
      let cols: string[] = [];

      if (line.includes('\t')) {
        cols = parseCsvOrTsvLine(line, '\t');
      } else if (line.includes('|')) {
        cols = parseCsvOrTsvLine(line, '|');
      } else if (line.includes(';')) {
        cols = parseCsvOrTsvLine(line, ';');
      } else if (line.includes(',')) {
        cols = parseCsvOrTsvLine(line, ',');
      } else if (/\s+(?:[:=–—]|-)\s+/.test(line)) {
        cols = line.split(/\s+(?:[:=–—]|-)\s+/).map((c) => c.trim());
      } else if (line.includes(':')) {
        const firstColon = line.indexOf(':');
        cols = [
          line.slice(0, firstColon).trim(),
          line.slice(firstColon + 1).trim()
        ];
      } else if (line.includes('=')) {
        const firstEq = line.indexOf('=');
        cols = [
          line.slice(0, firstEq).trim(),
          line.slice(firstEq + 1).trim()
        ];
      } else {
        // Check if line starts with English term followed directly by Arabic translation on the same line
        const enArSameLine = /^([A-Za-z][A-Za-z0-9\s\-()/]{1,60}?)\s+([\u0600-\u06FF].*)$/.exec(
          line
        );
        if (enArSameLine) {
          cols = [enArSameLine[1].trim(), enArSameLine[2].trim()];
        } else if (
          // Check if current line is English term and next line is Arabic translation
          /^[A-Za-z][A-Za-z0-9\s\-()/]{1,60}$/.test(line) &&
          idx + 1 < allLines.length &&
          /^[\u0600-\u06FF]/.test(allLines[idx + 1])
        ) {
          cols = [line, allLines[idx + 1]];
          idx += 1;
        } else {
          cols = [line];
        }
      }

      if (idx === 0 && isHeaderRow(cols)) {
        continue;
      }

      const col0 = (cols[0] || '').replace(/^["']|["']$/g, '').trim();
      const col1 = (cols[1] || '').replace(/^["']|["']$/g, '').trim();
      const col2 = (cols[2] || '').replace(/^["']|["']$/g, '').trim();
      const col3 = (cols[3] || '').replace(/^["']|["']$/g, '').trim();

      if (!col0) continue;

      const wordCount = col0.split(/\s+/).length;
      const looksLikeSentence =
        wordCount >= 7 || (/[.!?]$/.test(col0) && wordCount >= 4);

      if (looksLikeSentence) {
        rawSentenceEntries.push({
          id: `sent-csv-${Date.now()}-${idx}`,
          en: col0,
          ar: col1 || 'جملة سياقية مستوردة',
          category: (['Medical', 'AI', 'Programming', 'General'].includes(col2)
            ? col2
            : 'Medical') as LexiconCategory,
          specialty: col3 || 'مستورد',
          sourceType: 'termux',
          linkedTermIds: extractLinkedTermsFromText(
            `${col0} || ${col1}`,
            terms
          ),
          tags: ['مستورد'],
          favorite: false,
          createdAt: 'الآن · استيراد ملف'
        });
      } else {
        const validCat = ['Medical', 'AI', 'Programming', 'General'].includes(
          col2
        )
          ? col2
          : 'Medical';
        const defText =
          (
            ['Medical', 'AI', 'Programming', 'General'].includes(col2)
              ? cols.slice(3).join(' · ')
              : cols.slice(2).join(' · ')
          ).trim() ||
          `تعريف للمصطلح ${col0} (${col1 || 'مصطلح طبي'}) ضمن المعجم الطبي الموحد.`;

        rawTermEntries.push({
          term: col0,
          translation: col1 || 'مصطلح طبي',
          phonetic: `/${col0.toLowerCase().replace(/[^a-z]/g, '')}/`,
          pos: 'Noun · مصطلح',
          category: validCat,
          definitionAr: defText,
          definitionEn: `Clinical and technical entry for ${col0}.`,
          examples: [
            {
              en: `Clinical evaluation of ${col0} in practice.`,
              ar: `تم تقييم ${col1 || col0} في الممارسة السريرية.`
            }
          ],
          relations: {
            synonyms: [],
            broader: [],
            related: extractLinkedTermsFromText(defText, terms)
              .map((id) => terms.find((t) => t.id === id)?.term)
              .filter(Boolean)
          }
        });
      }
    }
  }

  const stagedTerms: StagedTermItem[] = rawTermEntries.map((entry, idx) => {
    const termStr = String(
      entry.term || entry.term_en || entry.english || entry.word || `Term ${idx + 1}`
    ).trim();
    const existing = findExistingTermMatch(termStr, terms);
    const catStr = String(entry.category || 'Medical');
    const validCat: LexiconCategory = (
      ['Medical', 'AI', 'Programming', 'General'].includes(catStr)
        ? catStr
        : 'Medical'
    ) as LexiconCategory;

    const defArStr = String(
      entry.definitionAr ||
        entry.definition_ar ||
        entry.definition ||
        entry.clinical_note ||
        'شرح تفصيلي للمصطلح مع ربط تلقائي بالمفاهيم ذات الصلة في القاموس.'
    );
    const defEnStr = String(
      entry.definitionEn ||
        entry.definition_en ||
        'Detailed clinical & technical explanation.'
    );

    const examplesArr = Array.isArray(entry.examples)
      ? (entry.examples as { en: string; ar: string }[])
      : [
          {
            en: `Contextual usage of ${termStr} in clinical practice.`,
            ar: `سياق استخدام ${String(
              entry.translation || entry.term_ar || entry.arabic || termStr
            )} في الممارسة السريرية.`
          }
        ];

    const autoLinkedIds = extractLinkedTermsFromText(
      `${defArStr} || ${defEnStr} || ${examplesArr
        .map((e) => `${e.en} ${e.ar}`)
        .join(' ')}`,
      terms
    );
    const autoRelatedNames = autoLinkedIds
      .map((id) => terms.find((t) => t.id === id)?.term)
      .filter(
        (name): name is string =>
          Boolean(name) && name.toLowerCase() !== termStr.toLowerCase()
      );

    const explicitRelations = (entry.relations as {
      synonyms?: string[];
      broader?: string[];
      related?: string[];
    }) || { synonyms: [], broader: [], related: [] };

    return {
      stagingId: `stg-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      term: termStr,
      translation: String(
        entry.translation || entry.term_ar || entry.arabic || entry.meaning || 'ترجمة طبية'
      ),
      phonetic: String(entry.phonetic || '/fəˈnɛtɪk/'),
      pos: String(entry.pos || 'Noun · مصطلح'),
      category: validCat,
      umdCode: entry.umdCode ? String(entry.umdCode) : undefined,
      definitionAr: defArStr,
      definitionEn: defEnStr,
      examples: examplesArr,
      relations: {
        synonyms: explicitRelations.synonyms || [],
        broader: explicitRelations.broader || [],
        related: Array.from(
          new Set([...(explicitRelations.related || []), ...autoRelatedNames])
        )
      },
      isDuplicate: Boolean(existing),
      existingId: existing?.id || null
    };
  });

  return {
    isFullBackup: false,
    stagedTerms,
    stagedSentences: rawSentenceEntries,
    extractedAffixes,
    extractedAbbreviations
  };
}

export const IngestionPortal: React.FC<IngestionPortalProps> = ({
  terms,
  copiedId,
  onCopyToClipboard,
  onSaveManualTerm,
  onCommitBatch,
  onImportFullBackupJson,
  onImportPackageFile,
  onOpenTermDetail,
  showToast
}) => {
  const [rawInputText, setRawInputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastAddedBatch, setLastAddedBatch] = useState<{
    sourceLabel: string;
    addedTerms: StagedTermItem[];
    sentencesCount: number;
  } | null>(null);

  // Popup 1: Manual Term / Quick Upload Modal
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualTermEn, setManualTermEn] = useState<string>('');
  const [manualTermAr, setManualTermAr] = useState<string>('');
  const [manualPhonetic, setManualPhonetic] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<LexiconCategory>('Medical');
  const [manualDefAr, setManualDefAr] = useState<string>('');
  const [manualDefEn, setManualDefEn] = useState<string>('');
  const [manualExampleEn, setManualExampleEn] = useState<string>('');
  const [manualExampleAr, setManualExampleAr] = useState<string>('');
  const [manualSynonyms, setManualSynonyms] = useState<string>('');

  // Popup 2: AI Prompt & System Recognition Guide Modal
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [promptTopic, setPromptTopic] = useState<string>('أمراض القلب والأوعية الدموية');
  const [promptCount, setPromptCount] = useState<number>(20);
  const [promptFormat, setPromptFormat] = useState<'json' | 'lines' | 'csv'>('json');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Builds the AI instruction prompt that instructs any AI to generate a downloadable file
   * (.json, .csv, or .txt) structured for automatic system recognition without chat truncation.
   */
  const generatedAiPrompt = useMemo(() => {
    const topicText = promptTopic.trim() || 'المصطلحات الطبية والسريرية الشائعة';
    const countNum = Math.max(1, Math.min(2000, Number(promptCount) || 100));

    if (promptFormat === 'json') {
      return `أنت خبير في المعاجم الطبية (وفق المعجم الطبي الموحد WHO UMD).
المطلوب: إنشاء ملف قابل للتنزيل بصيغة JSON باسم (medical_terms.json) بترميز UTF-8 يحتوي على (${countNum}) مصطلحاً طبياً متخصصاً في مجال: "${topicText}".

تعليمة هامة جداً (توليد ملف وليس نصاً في المحادثة):
- نظراً لأن المطلوب عدد كبير من المصطلحات (${countNum} مصطلح)، لا تطبع القائمة كنص طويل داخل المحادثة حتى لا ينقطع التوليد أو يتجاوز حد الرسالة.
- استخدم أداة إنشاء الملفات / بيئة التنفيذ البرمجية لديك (Python / Code Interpreter / Artifact File) لتوليد وحفظ الملف فعلياً بصيغة (.json) وتقديم رابط تنزيل الملف الجاهز لي مباشرة.

طريقة تعرف النظام التلقائي على ملف الـ JSON عند رفعه:
النظام يقرأ ملف (.json) ويتعرف تلقائياً على المصفوفة "terms" ويدخل كل حقل مباشرة في مكانه داخل القاموس (المصطلح، الترجمة، النطق الصوتي، التصنيف، التعريف العربي، التعريف الإنجليزي، الأمثلة السياقية، والمصطلحات المرتبطة).

يجب أن يُحفظ داخل ملف (medical_terms.json) هيكل JSON صالح 100% وفق النموذج الدقيق التالي:
{
  "terms": [
    {
      "term": "English Medical Term",
      "translation": "الترجمة العربية الدقيقة",
      "phonetic": "/fəˈnɛtɪk/",
      "pos": "Noun · مصطلح",
      "category": "Medical",
      "umdCode": "UMD-XXXX",
      "definitionAr": "شرح طبي وعلمي مفصل باللغة العربية يوضح المعنى والأهمية السريرية.",
      "definitionEn": "Detailed clinical and scientific definition in English.",
      "examples": [
        {
          "en": "Clinical sentence using the term in context.",
          "ar": "الترجمة العربية الدقيقة للجملة السياقية."
        }
      ],
      "relations": {
        "synonyms": ["Synonym 1"],
        "broader": ["Parent Category"],
        "related": ["Related Term 1", "Related Term 2"]
      }
    }
  ]
}`;
    }

    if (promptFormat === 'csv') {
      return `أنت خبير في المعاجم الطبية (وفق المعجم الطبي الموحد WHO UMD).
المطلوب: إنشاء ملف جدولي قابل للتنزيل بصيغة CSV باسم (medical_terms.csv) بترميز (UTF-8) يحتوي على (${countNum}) مصطلحاً طبياً في مجال: "${topicText}".

تعليمة هامة جداً (توليد ملف وليس نصاً في المحادثة):
- نظراً لأن المطلوب عدد كبير من المصطلحات (${countNum} مصطلح)، لا تطبع الجدول كنص طويل داخل نافذة المحادثة حتى لا ينقطع التوليد.
- استخدم أداة إنشاء الملفات / بيئة التنفيذ البرمجية لديك (Python / Code Interpreter) لإنشاء ملف (medical_terms.csv) فعلياً وتقديم رابط تنزيله مباشرة لرفعه إلى النظام.

طريقة تعرف النظام التلقائي على ملف الـ CSV / Excel عند رفعه:
يتعرف النظام تلقائياً على الأعمدة الـ 4 بالترتيب التالي في كل صف ويدخل القيم في حقول القاموس:
1. Term (المصطلح الإنجليزي)
2. Translation (الترجمة العربية الدقيقة)
3. Category (التصنيف: Medical أو AI أو Programming أو General)
4. Definition (التعريف والشرح العربي المفصل)

يجب أن تكون بنية الصفوف داخل ملف (medical_terms.csv) كالتالي تماماً:
Term,Translation,Category,Definition
"Bradycardia","بطء القلب","Medical","انخفاض معدل ضربات القلب عن 60 نبضة في الدقيقة عند البالغين."
"Myocarditis","التهاب عضلة القلب","Medical","التهاب يصيب النسيج العضلي للقلب غالباً بسبب عدوى فيروسية."`;
    }

    return `أنت خبير في المعاجم الطبية (وفق المعجم الطبي الموحد WHO UMD).
المطلوب: إنشاء ملف نصي قابل للتنزيل بصيغة TXT باسم (medical_terms.txt) بترميز UTF-8 يحتوي على (${countNum}) مصطلحاً طبياً في مجال: "${topicText}".

تعليمة هامة جداً (توليد ملف وليس نصاً في المحادثة):
- لتجنب انقطاع النص في الأعداد الكبيرة (${countNum} مصطلح)، لا تطبع القائمة داخل المحادثة، بل قم بإنشاء وتوليد ملف نصي قابل للتنزيل باسم (medical_terms.txt) عبر أداة إنشاء الملفات لديك وقدم لي رابط تنزيله مباشرة.

طريقة تعرف النظام التلقائي على الملف النصي (.txt) عند رفعه:
يقرأ النظام الملف سطراً بسطر، ويتعرف تلقائياً على الفاصل (:) في كل سطر ليوزع القيم في حقول القاموس على النحو التالي:
المصطلح الإنجليزي : الترجمة العربية : الشرح والتعريف العربي المفصل

يجب أن يُكتب كل مصطلح في سطر مستقل داخل ملف (medical_terms.txt) بدون ترقيم أو مقدمات كالتالي:
Bradycardia : بطء القلب : انخفاض معدل ضربات القلب عن 60 نبضة في الدقيقة عند البالغين.
Tachycardia : تسرع القلب : ارتفاع معدل نبضات القلب فوق 100 نبضة في الدقيقة أثناء الراحة.`;
  }, [promptTopic, promptCount, promptFormat]);

  const handleDownloadPromptFile = () => {
    const blob = new Blob([generatedAiPrompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `توجيه-إنشاء-ملف-مصطلحات-${promptFormat}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تنزيل ملف التوجيه (البرومبت) بنجاح');
  };

  /**
   * Saves a single manual term from the popup modal directly into the dictionary.
   */
  const handleManualTermSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEn = manualTermEn.trim();
    const cleanAr = manualTermAr.trim();

    if (!cleanEn || !cleanAr) {
      showToast('يرجى إدخال المصطلح الإنجليزي والترجمة العربية', 'info');
      return;
    }

    const existing = findExistingTermMatch(cleanEn, terms);
    const termId = existing?.id || `term-man-${Date.now()}`;
    const defArFinal =
      manualDefAr.trim() ||
      `تعريف للمصطلح ${cleanEn} (${cleanAr}) ضمن المعجم الطبي الموحد.`;
    const defEnFinal =
      manualDefEn.trim() || `Clinical and technical entry for ${cleanEn}.`;

    const exEnFinal =
      manualExampleEn.trim() || `Clinical evaluation of ${cleanEn} in practice.`;
    const exArFinal =
      manualExampleAr.trim() || `تم تقييم ${cleanAr} في الممارسة السريرية.`;

    const synList = manualSynonyms
      .split(/[,،|]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const autoLinkedIds = extractLinkedTermsFromText(
      `${defArFinal} || ${defEnFinal} || ${exEnFinal}`,
      terms
    );
    const autoRelatedNames = autoLinkedIds
      .map((id) => terms.find((t) => t.id === id)?.term)
      .filter(
        (name): name is string =>
          Boolean(name) && name.toLowerCase() !== cleanEn.toLowerCase()
      );

    const newTermObj: DictionaryTerm = {
      id: termId,
      term: cleanEn,
      termNormalized: cleanEn.toLowerCase(),
      translation: cleanAr,
      phonetic:
        manualPhonetic.trim() ||
        `/${cleanEn.toLowerCase().replace(/[^a-z]/g, '')}/`,
      pos: 'Noun · مصطلح',
      category: manualCategory,
      keepEnglish: existing?.keepEnglish || false,
      favorite: existing?.favorite || false,
      collections: existing?.collections || ['المصطلحات اليدوية'],
      ingestedAt: 'الآن · إضافة يدوية',
      definitionAr: defArFinal,
      definitionEn: defEnFinal,
      examples: [{ en: exEnFinal, ar: exArFinal }],
      relations: {
        synonyms: synList,
        broader: [],
        related: autoRelatedNames
      }
    };

    const newSentences: LinkedSentence[] = [];
    if (manualExampleEn.trim()) {
      newSentences.push({
        id: `sent-man-${Date.now()}`,
        en: exEnFinal,
        ar: exArFinal,
        category: manualCategory,
        specialty: 'إضافة يدوية',
        sourceType: 'manual',
        linkedTermIds: Array.from(new Set([termId, ...autoLinkedIds])),
        tags: ['يدوي'],
        favorite: false,
        createdAt: 'الآن'
      });
    }

    onSaveManualTerm(newTermObj, newSentences);

    setLastAddedBatch({
      sourceLabel: 'إضافة يدوية',
      addedTerms: [
        {
          stagingId: `man-stg-${Date.now()}`,
          term: newTermObj.term,
          translation: newTermObj.translation,
          phonetic: newTermObj.phonetic,
          pos: newTermObj.pos,
          category: newTermObj.category,
          definitionAr: newTermObj.definitionAr,
          definitionEn: newTermObj.definitionEn,
          examples: newTermObj.examples,
          relations: newTermObj.relations,
          isDuplicate: Boolean(existing),
          existingId: existing?.id || null
        }
      ],
      sentencesCount: newSentences.length
    });

    setManualTermEn('');
    setManualTermAr('');
    setManualPhonetic('');
    setManualDefAr('');
    setManualDefEn('');
    setManualExampleEn('');
    setManualExampleAr('');
    setManualSynonyms('');
    setShowManualModal(false);
  };

  /**
   * Recognizes terms from any text or extracted file content and commits them immediately to the dictionary.
   */
  const recognizeAndAddContent = async (
    content: string,
    sourceLabel: string
  ) => {
    const cleanText = content.trim();
    if (!cleanText) {
      showToast('يرجى إدخال مصطلحات أو اختيار ملف أولاً', 'info');
      return;
    }

    setIsProcessing(true);
    try {
      const parsed = parseBatchContentToStaged(cleanText, terms);

      if (parsed.isFullBackup) {
        const imported = onImportFullBackupJson(cleanText);
        if (imported) {
          setRawInputText('');
          return;
        }
      }

      let finalStagedTerms = parsed.stagedTerms;
      const finalStagedSentences = parsed.stagedSentences;

      // If no structured pairs were found (e.g. unstructured medical text or paragraph), use smart term extraction
      const hasMeaningfulPairs = finalStagedTerms.some(
        (t) => t.translation && t.translation !== 'مصطلح طبي'
      );

      if (!hasMeaningfulPairs && cleanText.length > 20) {
        try {
          const aiExtracted = await extractMedicalTermsFromContent({
            task: 'extract_terms',
            sourceFileName: sourceLabel,
            sourceText: cleanText
          });
          if (aiExtracted.terms && aiExtracted.terms.length > 0) {
            finalStagedTerms = aiExtracted.terms.map((item, idx) => {
              const existing = findExistingTermMatch(item.data.term, terms);
              return {
                stagingId: `ai-stg-${Date.now()}-${idx}`,
                term: item.data.term,
                translation: item.data.translation || 'مصطلح طبي',
                phonetic: item.data.phonetic || `/${item.data.term.toLowerCase().replace(/[^a-z]/g, '')}/`,
                pos: item.data.pos || 'Noun · مصطلح',
                category: item.data.category || 'Medical',
                umdCode: item.data.umdCode,
                definitionAr:
                  item.data.definitionAr ||
                  `تعريف للمصطلح ${item.data.term} ضمن المعجم الطبي الموحد.`,
                definitionEn:
                  item.data.definitionEn ||
                  `Clinical entry for ${item.data.term}.`,
                examples:
                  item.data.examples && item.data.examples.length > 0
                    ? item.data.examples
                    : [
                        {
                          en: `Clinical evaluation of ${item.data.term}.`,
                          ar: `التقييم السريري لـ ${item.data.translation || item.data.term}.`
                        }
                      ],
                relations: item.data.relations || {
                  synonyms: [],
                  broader: [],
                  related: []
                },
                isDuplicate: Boolean(existing),
                existingId: existing?.id || null
              };
            });
          }
        } catch {
          // Keep standard parsed terms if extraction service is unreachable
        }
      }

      if (
        finalStagedTerms.length === 0 &&
        finalStagedSentences.length === 0 &&
        parsed.extractedAffixes.length === 0 &&
        parsed.extractedAbbreviations.length === 0
      ) {
        showToast('لم يتم العثور على مصطلحات صالحة في البيانات المدخلة', 'info');
        return;
      }

      onCommitBatch({
        stagedTerms: finalStagedTerms,
        stagedSentences: finalStagedSentences,
        incomingAffixes: parsed.extractedAffixes,
        incomingAbbreviations: parsed.extractedAbbreviations,
        stayOnCurrentTab: true
      });

      setLastAddedBatch({
        sourceLabel,
        addedTerms: finalStagedTerms,
        sentencesCount: finalStagedSentences.length
      });
      setRawInputText('');
      setShowManualModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handles uploading any supported file (JSON, CSV, TSV, TXT, XLSX, DOCX, PDF, MD, ZIP, UMEDPACK),
   * automatically recognizes its terms, and adds them to the dictionary.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();

    if (
      lowerName.endsWith('.sqlite') ||
      lowerName.endsWith('.sqlite3') ||
      lowerName.endsWith('.db') ||
      lowerName.endsWith('.db3')
    ) {
      showToast(
        'ملفات SQLite غير مدعومة. يرجى رفع ملفات JSON أو CSV أو Excel أو TXT أو ZIP.',
        'info'
      );
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Handle .umedpack medical packages directly
      if (lowerName.endsWith('.umedpack')) {
        const buffer = await file.arrayBuffer();
        const pkgResult = await inspectAndReadUmedPackage(new Uint8Array(buffer));
        if (pkgResult.valid && pkgResult.payload.terms.length > 0) {
          const mappedTerms: StagedTermItem[] = pkgResult.payload.terms.map(
            (t, idx) => {
              const existing = findExistingTermMatch(t.term, terms);
              return {
                stagingId: `pkg-${Date.now()}-${idx}`,
                term: t.term,
                translation: t.translation,
                phonetic: t.phonetic || '',
                pos: t.pos || 'Noun',
                category: t.category || 'Medical',
                umdCode: t.umdCode,
                definitionAr: t.definitionAr,
                definitionEn: t.definitionEn,
                examples: t.examples || [],
                relations: t.relations || { synonyms: [], broader: [], related: [] },
                isDuplicate: Boolean(existing),
                existingId: existing?.id || null
              };
            }
          );
          onCommitBatch({
            stagedTerms: mappedTerms,
            stagedSentences: pkgResult.payload.sentences || [],
            incomingAffixes: pkgResult.payload.customAffixes || [],
            incomingAbbreviations: pkgResult.payload.customAbbreviations || [],
            stayOnCurrentTab: true
          });
          setLastAddedBatch({
            sourceLabel: file.name,
            addedTerms: mappedTerms,
            sentencesCount: (pkgResult.payload.sentences || []).length
          });
          setShowManualModal(false);
          return;
        }
      }

      // 2. Handle standard .zip packages
      if (lowerName.endsWith('.zip')) {
        onImportPackageFile(file);
        setShowManualModal(false);
        return;
      }

      // 3. Parse all other files (JSON, CSV, TSV, TXT, XLSX, DOCX, PDF, MD)
      const parsedFile = await parseUploadedFile(file);
      let combinedText = parsedFile.extractedText || '';

      // Include any detected spreadsheet/Word tables as TSV lines so every row is recognized
      if (parsedFile.detectedTables && parsedFile.detectedTables.length > 0) {
        const tableLines: string[] = [];
        parsedFile.detectedTables.forEach((tbl) => {
          if (tbl.headers && tbl.headers.length > 0) {
            tableLines.push(tbl.headers.join('\t'));
          }
          tbl.rows.forEach((row) => {
            if (row.some((cell) => cell.trim().length > 0)) {
              tableLines.push(row.join('\t'));
            }
          });
        });
        if (tableLines.length > 0) {
          combinedText = tableLines.join('\n');
        }
      }

      await recognizeAndAddContent(combinedText, file.name);
    } catch (err) {
      showToast(
        `تعذر قراءة الملف: ${err instanceof Error ? err.message : String(err)}`,
        'info'
      );
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (modalFileInputRef.current) modalFileInputRef.current.value = '';
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setRawInputText(text);
        showToast('تم لصق البيانات بنجاح');
      } else {
        showToast('الحافظة فارغة', 'info');
      }
    } catch {
      showToast('استخدم اللصق المباشر داخل المربع', 'info');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* COMPACT QUICK OPTIONS BAR (Opens Popup Modals) */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-1">
        <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
          محرك إدخال والتعرف التلقائي على المصطلحات
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <PenLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>+ مصطلح يدوي / رفع</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPromptModal(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>إنشاء برومبت للذكاء الاصطناعي</span>
          </button>
        </div>
      </div>

      {/* 1. FILE UPLOAD CARD */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              رفع ملف بيانات مصطلحات
            </h2>
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            يتعرف النظام على المصطلحات ويضيفها تلقائياً
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.docx,.pdf,.md,.zip,.umedpack"
          onChange={handleFileUpload}
          className="hidden"
          id="smart-term-file-upload"
        />
        <label
          htmlFor="smart-term-file-upload"
          className="cursor-pointer flex flex-col items-center justify-center gap-2.5 p-6 rounded-2xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 flex items-center justify-center shadow-sm">
            {isProcessing ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {isProcessing
                ? 'جاري التعرف على المصطلحات وإضافتها للقاموس...'
                : 'اضغط لاختيار ملف مصطلحات من جهازك'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              يدعم ملفات: JSON · CSV · Excel (XLSX) · TXT · Word (DOCX) · PDF · ZIP
            </p>
          </div>
        </label>
      </div>

      {/* 2. DIRECT TEXT / PASTE INPUT CARD */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              أو إدخال / لصق بيانات المصطلحات مباشرة
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>لصق</span>
            </button>
            {rawInputText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setRawInputText('')}
                className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-500/15 text-slate-500 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-400 text-xs font-bold flex items-center gap-1 transition-colors"
                title="مسح النص"
              >
                <X className="w-3.5 h-3.5" />
                <span>مسح</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          rows={5}
          dir="auto"
          value={rawInputText}
          onChange={(e) => setRawInputText(e.target.value)}
          placeholder={`أدخل أو الصق المصطلحات بأي صيغة (كل مصطلح في سطر، أو جدول، أو JSON):\nBradycardia : بطء القلب : انخفاض معدل ضربات القلب عن 60 نبضة في الدقيقة\nMyocarditis - التهاب عضلة القلب`}
          className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm leading-relaxed text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 transition-colors resize-y"
        />

        <button
          type="button"
          disabled={isProcessing || !rawInputText.trim()}
          onClick={() => recognizeAndAddContent(rawInputText, 'إدخال نصي مباشر')}
          className="w-full min-h-[46px] py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>جاري التعرف على المصطلحات وإضافتها...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>التعرف على المصطلحات وإضافتها للقاموس</span>
            </>
          )}
        </button>
      </div>

      {/* 3. RECOGNIZED & ADDED TERMS RESULT LIST */}
      {lastAddedBatch && lastAddedBatch.addedTerms.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-emerald-500/40 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                تم التعرف على {lastAddedBatch.addedTerms.length} مصطلح وإضافتها للقاموس
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setLastAddedBatch(null)}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              title="إخفاء القائمة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {lastAddedBatch.addedTerms.map((item) => {
              const matchedInDict = findExistingTermMatch(item.term, terms);
              return (
                <div
                  key={item.stagingId}
                  onClick={() => {
                    if (matchedInDict) {
                      onOpenTermDetail(matchedInDict.id);
                    }
                  }}
                  className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        dir="ltr"
                        className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white font-mono"
                      >
                        {item.term}
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {item.translation}
                      </span>
                    </div>
                    {item.definitionAr && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {item.definitionAr}
                      </p>
                    )}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* POPUP MODAL 1: MANUAL TERM ENTRY OR QUICK FILE UPLOAD */}
      {showManualModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowManualModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <PenLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  إضافة مصطلح يدوي أو رفع ملف سريع
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick File Upload Option inside Modal */}
            <div className="p-3 rounded-2xl bg-emerald-500/5 border border-dashed border-emerald-500/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs">
                <p className="font-extrabold text-slate-800 dark:text-slate-100">
                  رفع ملف مصطلحات مباشرة
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  JSON · CSV · Excel · Word · TXT
                </p>
              </div>
              <input
                ref={modalFileInputRef}
                type="file"
                accept=".json,.csv,.tsv,.txt,.xlsx,.xls,.docx,.pdf,.md,.zip,.umedpack"
                onChange={handleFileUpload}
                className="hidden"
                id="modal-quick-file-upload"
              />
              <label
                htmlFor="modal-quick-file-upload"
                className="cursor-pointer px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>اختيار ملف</span>
              </label>
            </div>

            {/* Manual Term Form */}
            <form onSubmit={handleManualTermSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    المصطلح الإنجليزي (Term) *
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={manualTermEn}
                    onChange={(e) => setManualTermEn(e.target.value)}
                    placeholder="e.g. Cardiomyopathy"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    الترجمة العربية *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualTermAr}
                    onChange={(e) => setManualTermAr(e.target.value)}
                    placeholder="مثال: اعتلال عضلة القلب"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    التصنيف
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) =>
                      setManualCategory(e.target.value as LexiconCategory)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  >
                    <option value="Medical">طبي وسريري (Medical)</option>
                    <option value="AI">ذكاء اصطناعي (AI)</option>
                    <option value="Programming">برمجة وتقنية (Programming)</option>
                    <option value="General">عام (General)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    النطق الصوتي (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={manualPhonetic}
                    onChange={(e) => setManualPhonetic(e.target.value)}
                    placeholder="/ˌkɑːrdi.oʊ.maɪˈɑːpəθi/"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  التعريف والشرح بالعربية
                </label>
                <textarea
                  rows={2}
                  value={manualDefAr}
                  onChange={(e) => setManualDefAr(e.target.value)}
                  placeholder="شرح طبي للمصطلح (سيتم ربط المصطلحات المذكورة فيه تلقائياً)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    مثال سياقي بالإنجليزية (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={manualExampleEn}
                    onChange={(e) => setManualExampleEn(e.target.value)}
                    placeholder="Hypertrophic cardiomyopathy was..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    ترجمة المثال بالعربية (اختياري)
                  </label>
                  <input
                    type="text"
                    value={manualExampleAr}
                    onChange={(e) => setManualExampleAr(e.target.value)}
                    placeholder="تم تشخيص اعتلال عضلة القلب..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  مرادفات أو مصطلحات ذات صلة (مفصولة بفاصلة)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={manualSynonyms}
                  onChange={(e) => setManualSynonyms(e.target.value)}
                  placeholder="Heart muscle disease, Myocardiopathy"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>حفظ وإضافة للقاموس</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL 2: AI PROMPT GENERATOR & AUTO-RECOGNITION GUIDE */}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowPromptModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  توجيه (برومبت) للذكاء الاصطناعي لإنشاء ملف مصطلحات جاهز للرفع
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* How the system recognizes files and avoids chat truncation */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-extrabold text-slate-800 dark:text-slate-100">
                لماذا يطلب البرومبت من الذكاء الاصطناعي إنشاء ملف قابل للتنزيل؟
              </p>
              <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 list-disc list-inside">
                <li>
                  عند طلب عدد كبير من المصطلحات (مثل 100 أو 200 أو 1000 مصطلح)، فإن طباعتها كنص في المحادثة تؤدي لانقطاع الرد، لذلك يوجّه هذا البرومبت الذكاء الاصطناعي إلى <strong className="text-emerald-700 dark:text-emerald-400">توليد ملف فعلي قابل للتنزيل</strong> بصيغة محددة لترفع الملف مباشرة هنا دون أي نقص.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">ملف (.json):</strong>{' '}
                  يحتوي على كافة تفاصيل المصطلح (النطق، التعريف، الأمثلة، المرادفات) ويتعرف عليه النظام تلقائياً.
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">ملف (.csv) أو (.txt):</strong>{' '}
                  خفيف جداً ومثالي للأعداد الضخمة (المئات أو الآلاف من المصطلحات في ملف واحد).
                </li>
              </ul>
            </div>

            {/* Prompt Customization Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  التخصص أو الموضوع المطلوب من الذكاء الاصطناعي
                </label>
                <input
                  type="text"
                  value={promptTopic}
                  onChange={(e) => setPromptTopic(e.target.value)}
                  placeholder="مثال: أمراض القلب، الأعصاب، الأدوية السريرية..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  عدد المصطلحات داخل الملف
                </label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={promptCount}
                  onChange={(e) => setPromptCount(Number(e.target.value) || 100)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Format selector pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-1">
                صيغة الملف المطلوب إنشاؤه:
              </span>
              {(
                [
                  { id: 'json', label: 'ملف JSON شامل (.json)' },
                  { id: 'csv', label: 'ملف جدولي للأعداد الضخمة (.csv)' },
                  { id: 'lines', label: 'ملف نصي سطري (.txt)' }
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setPromptFormat(fmt.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-colors ${
                    promptFormat === fmt.id
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>

            {/* Generated Prompt Preview */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                البرومبت الجاهز (انسخه وأرسله إلى الذكاء الاصطناعي ليُنشئ لك الملف ثم ارفعه في النظام):
              </label>
              <textarea
                readOnly
                rows={9}
                dir="auto"
                value={generatedAiPrompt}
                className="w-full p-3 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] leading-relaxed border border-slate-800 outline-none resize-y"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={handleDownloadPromptFile}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل التوجيه كملف (.txt)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromptModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onCopyToClipboard(
                      generatedAiPrompt,
                      'ai-ingest-prompt',
                      'تم نسخ برومبت الذكاء الاصطناعي'
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  {copiedId === 'ai-ingest-prompt' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>تم النسخ بنجاح</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ البرومبت</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

