import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bookmark,
  Layers,
  RotateCcw,
  Check,
  X,
  Volume2,
  Folder,
  Sparkles,
  BookOpen,
  FileText,
  PlusCircle,
  Upload,
  ArrowRight,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ChevronLeft,
  Wand2
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  SpacedRepetitionData,
  StudyStats,
  LexiconCategory,
  TermExample,
  MorphologicalAffix,
  ClinicalAbbreviation
} from '../types/lexicon';
import {
  decomposeMedicalWord,
  runHybridGcNmtPipeline,
  lookupQuickWordOrPhraseAr
} from '../engine/hybridTranslator';
import { parseUploadedFile } from '../services/fileParserService';
import {
  ConciseDataSummary,
  buildConciseDataSummary
} from '../services/telegramBackupService';

export interface StagedTermItem {
  id: string;
  term: string;
  translation: string;
  phonetic: string;
  pos: string;
  category: LexiconCategory;
  umdCode?: string;
  definitionAr: string;
  definitionEn: string;
  examples: TermExample[];
  relations: {
    synonyms: string[];
    broader: string[];
    related: string[];
  };
  selected?: boolean;
  isDuplicate?: boolean;
}

export type LibrarySubMode = 'hub' | 'favorites' | 'add_offline' | 'flashcards';

interface LibraryViewProps {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics?: TopicArticle[];
  studyStats: StudyStats;
  activeCollection: string;
  initialMode?: LibrarySubMode;
  initialDraftTerm?: string;
  onInitialModeConsumed?: () => void;
  onOpenCollectionsMenu: () => void;
  onRecordSm2Review: (
    kind: 'term' | 'sentence',
    id: string,
    updatedSrs: SpacedRepetitionData,
    knewIt: boolean
  ) => void;
  onOpenTermDetail: (termId: string) => void;
  onToggleFavoriteTerm: (termId: string, e?: React.MouseEvent) => void;
  onToggleFavoriteSentence: (sentenceId: string, e?: React.MouseEvent) => void;
  onToggleFavoriteTopic?: (topicId: string, e?: React.MouseEvent) => void;
  onOpenTopicFromLibrary?: (topicId: string) => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
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
  onImportPackageFile: (file: File) => Promise<void>;
  onImportTopicsBatch?: (incomingTopics: TopicArticle[]) => number;
}

const CATEGORY_OPTIONS: { value: LexiconCategory; label: string }[] = [
  { value: 'Medical', label: 'طبي سريري (Medical)' },
  { value: 'AI', label: 'ذكاء اصطناعي طبي (AI)' },
  { value: 'Programming', label: 'معلوماتية صحية (Informatics)' },
  { value: 'General', label: 'مصطلح أكاديمي عام (General)' }
];

const POS_OPTIONS = [
  { value: 'noun', label: 'اسم / مفهوم (Noun)' },
  { value: 'adjective', label: 'صفة سريرية (Adjective)' },
  { value: 'verb', label: 'فعل / إجراء (Verb)' },
  { value: 'phrase', label: 'مصطلح مركب / متلازمة (Phrase)' },
  { value: 'abbreviation', label: 'اختصار طبي (Abbreviation)' }
];

function computeNextSm2(
  current: SpacedRepetitionData | undefined,
  knewIt: boolean
): SpacedRepetitionData {
  const prevInterval = current?.interval ?? 1;
  const prevEase = current?.easeFactor ?? 2.5;
  const prevReps = current?.repetitions ?? 0;

  if (!knewIt) {
    return {
      interval: 1,
      easeFactor: Math.max(1.3, prevEase - 0.2),
      repetitions: 0,
      nextReviewAt: Date.now() + 10 * 60 * 1000
    };
  }

  const nextReps = prevReps + 1;
  const nextInterval =
    nextReps === 1 ? 1 : nextReps === 2 ? 3 : Math.round(prevInterval * prevEase);
  const nextEase = Math.min(3.0, prevEase + 0.1);

  return {
    interval: nextInterval,
    easeFactor: Number(nextEase.toFixed(2)),
    repetitions: nextReps,
    nextReviewAt: Date.now() + nextInterval * 24 * 60 * 60 * 1000
  };
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  terms,
  sentences,
  topics = [],
  studyStats,
  activeCollection,
  initialMode,
  initialDraftTerm,
  onInitialModeConsumed,
  onOpenCollectionsMenu,
  onRecordSm2Review,
  onOpenTermDetail,
  onToggleFavoriteTerm,
  onToggleFavoriteSentence,
  onToggleFavoriteTopic,
  onOpenTopicFromLibrary,
  onTriggerTTS,
  onSaveManualTerm,
  onCommitBatch,
  onImportFullBackupJson,
  onImportPackageFile,
  onImportTopicsBatch
}) => {
  const [libraryMode, setLibraryMode] = useState<LibrarySubMode>(initialMode || 'hub');
  const [favoritesTab, setFavoritesTab] = useState<'terms' | 'sentences' | 'topics' | 'custom'>('terms');
  const [favSearchQuery, setFavSearchQuery] = useState('');

  // Flashcards state
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Offline Add & Import state
  const [offlineAddTab, setOfflineAddTab] = useState<'manual' | 'file_batch'>('manual');
  const [manualTerm, setManualTerm] = useState('');
  const [manualTranslation, setManualTranslation] = useState('');
  const [manualPhonetic, setManualPhonetic] = useState('');
  const [manualCategory, setManualCategory] = useState<LexiconCategory>('Medical');
  const [manualPos, setManualPos] = useState('noun');
  const [manualCollection, setManualCollection] = useState('مضاف يدوياً');
  const [manualDefAr, setManualDefAr] = useState('');
  const [manualDefEn, setManualDefEn] = useState('');
  const [manualSentenceEn, setManualSentenceEn] = useState('');
  const [manualSentenceAr, setManualSentenceAr] = useState('');
  const [addAlsoToFavorites, setAddAlsoToFavorites] = useState(true);
  const [offlineFeedback, setOfflineFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [lastDataSummary, setLastDataSummary] = useState<ConciseDataSummary | null>(null);

  // File & Batch Import state
  const [rawBatchInput, setRawBatchInput] = useState('');
  const [stagedItems, setStagedItems] = useState<StagedTermItem[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialMode) {
      setLibraryMode(initialMode);
      if (initialDraftTerm && initialDraftTerm.trim()) {
        setManualTerm(initialDraftTerm.trim());
        setOfflineAddTab('manual');
      }
      onInitialModeConsumed?.();
    }
  }, [initialMode, initialDraftTerm, onInitialModeConsumed]);

  const existingTermSet = useMemo(
    () => new Set(terms.map((t) => t.term.toLowerCase().trim())),
    [terms]
  );

  const favoriteTerms = useMemo(() => {
    let base = terms.filter((t) => t.favorite);
    if (activeCollection && activeCollection !== 'الكل') {
      base = base.filter((t) => (t.collections || []).includes(activeCollection));
    }
    if (favSearchQuery.trim()) {
      const q = favSearchQuery.toLowerCase().trim();
      base = base.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.translation.toLowerCase().includes(q) ||
          t.definitionAr.toLowerCase().includes(q)
      );
    }
    return base;
  }, [terms, activeCollection, favSearchQuery]);

  const favoriteSentences = useMemo(() => {
    let base = sentences.filter((s) => s.favorite);
    if (favSearchQuery.trim()) {
      const q = favSearchQuery.toLowerCase().trim();
      base = base.filter(
        (s) =>
          s.en.toLowerCase().includes(q) ||
          s.ar.toLowerCase().includes(q)
      );
    }
    return base;
  }, [sentences, favSearchQuery]);

  const favoriteTopics = useMemo(() => {
    let base = topics.filter((t) => t.favorite);
    if (favSearchQuery.trim()) {
      const q = favSearchQuery.toLowerCase().trim();
      base = base.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.titleEn && t.titleEn.toLowerCase().includes(q)) ||
          (t.titleAr && t.titleAr.toLowerCase().includes(q)) ||
          t.subtitle.toLowerCase().includes(q)
      );
    }
    return base;
  }, [topics, favSearchQuery]);

  const customAddedTerms = useMemo(
    () =>
      terms.filter(
        (t) =>
          t.id.startsWith('u-') ||
          t.id.startsWith('custom-') ||
          t.id.startsWith('topic-term-')
      ),
    [terms]
  );

  const totalFavoritesCount =
    terms.filter((t) => t.favorite).length +
    sentences.filter((s) => s.favorite).length +
    topics.filter((t) => t.favorite).length;

  // Flashcards pool
  const flashcardPool = useMemo(() => {
    const favPool = terms.filter((t) => t.favorite);
    const base = favPool.length > 0 ? [...favPool] : terms.slice(0, 35);
    const now = Date.now();
    return base.sort((a, b) => {
      const dueA = a.srsData?.nextReviewAt ?? 0;
      const dueB = b.srsData?.nextReviewAt ?? 0;
      const isDueA = dueA <= now ? 0 : 1;
      const isDueB = dueB <= now ? 0 : 1;
      if (isDueA !== isDueB) return isDueA - isDueB;
      return dueA - dueB;
    });
  }, [terms]);

  const currentFlashcard =
    flashcardPool.length > 0 ? flashcardPool[currentCardIdx % flashcardPool.length] : null;

  const handleFlashcardDecision = (knewIt: boolean) => {
    if (!currentFlashcard) return;
    const nextSrs = computeNextSm2(currentFlashcard.srsData, knewIt);
    onRecordSm2Review('term', currentFlashcard.id, nextSrs, knewIt);
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCardIdx((prev) => (prev + 1) % Math.max(1, flashcardPool.length));
    }, 140);
  };

  // Offline auto-assist using local morphology + GC-NMT engine
  const handleAutoAssistOffline = () => {
    const clean = manualTerm.trim();
    if (!clean) {
      setOfflineFeedback({
        type: 'error',
        message: 'أدخل المصطلح بالإنجليزية أولاً.'
      });
      return;
    }

    const morph = decomposeMedicalWord(clean, terms);
    const quick = lookupQuickWordOrPhraseAr(clean, terms);
    const gcNmt = runHybridGcNmtPipeline(clean, terms, sentences);

    const hasMorph = Boolean(
      morph.prefix || (morph.roots && morph.roots.length > 0) || morph.suffix
    );
    const bestTranslation =
      quick?.translationAr ||
      (hasMorph && morph.synthesizedAr && morph.synthesizedAr !== 'مصطلح أحادي الجذر'
        ? morph.synthesizedAr
        : gcNmt.layer4FinalOutputAr && gcNmt.layer4FinalOutputAr !== clean
        ? gcNmt.layer4FinalOutputAr
        : '');

    if (!manualTranslation.trim() && bestTranslation) {
      setManualTranslation(bestTranslation);
    }

    if (!manualPhonetic.trim()) {
      setManualPhonetic(`/${clean.toLowerCase()}/`);
    }

    const morphSummary = [
      morph.prefix ? `بادئة ${morph.prefix.affix} (${morph.prefix.meaningAr})` : null,
      ...(morph.roots || []).map((r) => `جذر ${r.affix} (${r.meaningAr})`),
      morph.suffix ? `لاحقة ${morph.suffix.affix} (${morph.suffix.meaningAr})` : null
    ]
      .filter(Boolean)
      .join(' + ');

    if (!manualDefAr.trim()) {
      if (morphSummary) {
        setManualDefAr(
          `مصطلح طبي سريري يعني "${bestTranslation || manualTranslation || clean}". التحليل الصرفي: ${morphSummary}.`
        );
      } else {
        setManualDefAr(
          `مفهوم طبي سريري يشير إلى ${bestTranslation || manualTranslation || clean}.`
        );
      }
    }

    if (!manualDefEn.trim()) {
      setManualDefEn(`Clinical medical term referring to ${clean}.`);
    }
  };

  const handleSaveManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEn = manualTerm.trim();
    const cleanAr = manualTranslation.trim();
    if (!cleanEn || !cleanAr) {
      setOfflineFeedback({
        type: 'error',
        message: 'يرجى إدخال المصطلح بالإنجليزية وترجمته العربية.'
      });
      return;
    }

    const newId = `u-manual-${Date.now()}`;
    const examples: TermExample[] = [];
    const linkedSentences: LinkedSentence[] = [];

    if (manualSentenceEn.trim()) {
      const sEn = manualSentenceEn.trim();
      const sAr =
        manualSentenceAr.trim() ||
        runHybridGcNmtPipeline(sEn, terms, sentences).layer4FinalOutputAr ||
        cleanAr;
      examples.push({ en: sEn, ar: sAr });
      linkedSentences.push({
        id: `sen-manual-${Date.now()}`,
        en: sEn,
        ar: sAr,
        category: manualCategory,
        sourceType: 'manual',
        linkedTermIds: [newId],
        tags: [cleanEn],
        favorite: addAlsoToFavorites,
        createdAt: 'الآن · مكتبتي أوفلاين'
      });
    }

    const newTermObj: DictionaryTerm = {
      id: newId,
      term: cleanEn,
      termNormalized: cleanEn.toLowerCase(),
      translation: cleanAr,
      phonetic: manualPhonetic.trim() || `/${cleanEn.toLowerCase()}/`,
      pos: manualPos,
      category: manualCategory,
      keepEnglish: true,
      favorite: addAlsoToFavorites,
      collections: [manualCollection.trim() || 'مضاف يدوياً'],
      ingestedAt: 'الآن · مكتبتي أوفلاين',
      definitionAr:
        manualDefAr.trim() || `مصطلح طبي سريري يشير إلى ${cleanAr} (${cleanEn}).`,
      definitionEn:
        manualDefEn.trim() || `Clinical medical term referring to ${cleanEn}.`,
      examples,
      relations: {
        synonyms: [],
        broader: [],
        related: []
      }
    };

    onSaveManualTerm(newTermObj, linkedSentences);

    setLastDataSummary(
      buildConciseDataSummary({
        terms: [newTermObj],
        sentences: linkedSentences,
        topics: [],
        blocks: [],
        subjects: [],
        questions: [],
        sourceLabel: 'إضافة يدوية أوفلاين'
      })
    );

    setOfflineFeedback({
      type: 'success',
      message: `تم حفظ "${cleanEn}" (${cleanAr}) بنجاح.`
    });

    setManualTerm('');
    setManualTranslation('');
    setManualPhonetic('');
    setManualDefAr('');
    setManualDefEn('');
    setManualSentenceEn('');
    setManualSentenceAr('');
  };

  const parseRawTextToStaged = (text: string, sourceFileName = 'استيراد أوفلاين') => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 1. Check if JSON (Full Backup, Unified Backup, Granular Export, Topics array, or Terms array)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);

        // Case A: Full Backup, Unified Backup, or Granular Export object
        if (
          parsed &&
          !Array.isArray(parsed) &&
          (parsed.format === 'umed-unified-backup-v2.3' ||
            parsed.format === 'umed-granular-export-v1' ||
            parsed.manifest ||
            parsed.payload ||
            parsed.data ||
            parsed.terms ||
            parsed.topics)
        ) {
          const ok = onImportFullBackupJson(trimmed);
          if (ok) {
            const inner = parsed.data || parsed.payload || parsed;
            const summary = buildConciseDataSummary({
              terms: Array.isArray(inner.terms) ? inner.terms : [],
              sentences: Array.isArray(inner.sentences) ? inner.sentences : [],
              topics: Array.isArray(inner.topics) ? inner.topics : [],
              blocks: Array.isArray(inner.blocks) ? inner.blocks : [],
              subjects: Array.isArray(inner.subjects) ? inner.subjects : [],
              questions: Array.isArray(inner.quizQuestions || inner.questions)
                ? inner.quizQuestions || inner.questions
                : [],
              sourceLabel: sourceFileName,
              rawSizeBytes: new Blob([trimmed]).size
            });
            setLastDataSummary(summary);
            setOfflineFeedback({
              type: 'success',
              message: `تم استيراد البيانات أوفلاين بنجاح (${summary.shortText}).`
            });
            setRawBatchInput('');
            return;
          }
        }

        // Case B: Standalone Topic object or Array of Topics
        const rawArr = Array.isArray(parsed) ? parsed : [parsed];
        const looksLikeTopics =
          rawArr.length > 0 &&
          rawArr.every(
            (it: Record<string, unknown>) =>
              it &&
              typeof it === 'object' &&
              (Array.isArray(it.sections) ||
                Boolean(it.titleEn && it.titleAr) ||
                Boolean(it.title && it.sections))
          );

        if (looksLikeTopics && onImportTopicsBatch) {
          const importedTopics: TopicArticle[] = rawArr.map(
            (it: Record<string, unknown>, idx: number) => ({
              id: String(it.id || `topic-imp-${Date.now()}-${idx}`),
              title: String(it.title || it.titleAr || it.titleEn || 'موضوع طبي مستورد'),
              titleEn: String(it.titleEn || it.title || 'Imported Medical Topic'),
              titleAr: String(it.titleAr || it.subtitle || it.title || 'موضوع طبي مستورد'),
              subtitle: String(it.subtitle || it.titleAr || ''),
              category: (it.category as TopicArticle['category']) || 'Medical',
              blockId: typeof it.blockId === 'string' ? it.blockId : undefined,
              subjectId: typeof it.subjectId === 'string' ? it.subjectId : undefined,
              author: String(it.author || 'استيراد أوفلاين'),
              publishedAt: String(it.publishedAt || 'الآن'),
              readingTimeMinutes: Number(it.readingTimeMinutes) || 5,
              favorite: Boolean(it.favorite),
              sections: Array.isArray(it.sections)
                ? (it.sections as TopicArticle['sections'])
                : [
                    {
                      id: `sec-imp-${Date.now()}`,
                      heading: 'المحتوى الرئيسي',
                      paragraphs: [String(it.content || it.body || '')]
                    }
                  ],
              images: Array.isArray(it.images) ? (it.images as TopicArticle['images']) : [],
              links: Array.isArray(it.links) ? (it.links as TopicArticle['links']) : [],
              attachments: Array.isArray(it.attachments)
                ? (it.attachments as TopicArticle['attachments'])
                : []
            })
          );

          const count = onImportTopicsBatch(importedTopics);
          const summary = buildConciseDataSummary({
            terms: [],
            sentences: [],
            topics: importedTopics,
            blocks: [],
            subjects: [],
            questions: [],
            sourceLabel: sourceFileName,
            rawSizeBytes: new Blob([trimmed]).size
          });
          setLastDataSummary(summary);
          setOfflineFeedback({
            type: 'success',
            message: `تم استيراد ${count} موضوع طبي أوفلاين بنجاح.`
          });
          setRawBatchInput('');
          return;
        }

        // Case C: Array of Terms
        const arr = Array.isArray(parsed) ? parsed : parsed.terms || [];
        if (Array.isArray(arr) && arr.length > 0) {
          const staged: StagedTermItem[] = arr
            .map((item: Record<string, unknown>, idx: number) => {
              const tEn = String(item.term || item.en || item.word || '').trim();
              if (!tEn) return null;
              const quickAr = lookupQuickWordOrPhraseAr(tEn, terms)?.translationAr;
              const morphAr = decomposeMedicalWord(tEn, terms).synthesizedAr;
              const tAr =
                String(item.translation || item.ar || item.meaning || '').trim() ||
                quickAr ||
                (morphAr && morphAr !== 'مصطلح أحادي الجذر' ? morphAr : '') ||
                'مصطلح طبي';
              const defAr =
                String(item.definitionAr || item.definition || '').trim() ||
                `مصطلح طبي سريري يشير إلى ${tAr}.`;
              const defEn =
                String(item.definitionEn || '').trim() ||
                `Medical concept referring to ${tEn}.`;

              return {
                id: `stg-json-${Date.now()}-${idx}`,
                term: tEn,
                translation: tAr,
                phonetic: String(item.phonetic || `/${tEn.toLowerCase()}/`),
                pos: String(item.pos || 'noun'),
                category: (item.category as LexiconCategory) || 'Medical',
                definitionAr: defAr,
                definitionEn: defEn,
                examples: Array.isArray(item.examples) ? (item.examples as TermExample[]) : [],
                relations: {
                  synonyms: [],
                  broader: [],
                  related: []
                },
                selected: true,
                isDuplicate: existingTermSet.has(tEn.toLowerCase())
              };
            })
            .filter(Boolean) as StagedTermItem[];

          setStagedItems(staged);
          setOfflineFeedback({
            type: 'success',
            message: `تم استخراج ${staged.length} مصطلح جاهز للحفظ.`
          });
          return;
        }
      } catch {
        // Fallback to text parsing
      }
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 1);

    const nextStaged: StagedTermItem[] = [];
    lines.forEach((line, idx) => {
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.includes(' - ')
        ? line.split(' - ')
        : line.includes(' : ')
        ? line.split(' : ')
        : line.split(',');

      const tEn = (parts[0] || '').trim().replace(/^["']|["']$/g, '');
      if (!tEn || tEn.toLowerCase() === 'term') return;

      const quick = lookupQuickWordOrPhraseAr(tEn, terms);
      const morph = decomposeMedicalWord(tEn, terms);
      const autoAr =
        quick?.translationAr ||
        (morph.synthesizedAr && morph.synthesizedAr !== 'مصطلح أحادي الجذر'
          ? morph.synthesizedAr
          : '') ||
        'مصطلح طبي';

      const tAr = (parts[1] || '').trim().replace(/^["']|["']$/g, '') || autoAr;
      const defAr =
        (parts[2] || '').trim().replace(/^["']|["']$/g, '') ||
        `مصطلح طبي سريري يعني ${tAr}.`;
      const defEn =
        (parts[3] || '').trim().replace(/^["']|["']$/g, '') ||
        `Clinical medical term: ${tEn}.`;

      nextStaged.push({
        id: `stg-line-${Date.now()}-${idx}`,
        term: tEn,
        translation: tAr,
        phonetic: `/${tEn.toLowerCase()}/`,
        pos: tEn.includes(' ') ? 'phrase' : 'noun',
        category: 'Medical',
        definitionAr: defAr,
        definitionEn: defEn,
        examples: [],
        relations: {
          synonyms: [],
          broader: [],
          related: []
        },
        selected: true,
        isDuplicate: existingTermSet.has(tEn.toLowerCase())
      });
    });

    setStagedItems(nextStaged);
    if (nextStaged.length === 0) {
      setOfflineFeedback({
        type: 'error',
        message: 'لم يتم العثور على سجلات صالحة في الملف أو النص.'
      });
    } else {
      setOfflineFeedback({
        type: 'success',
        message: `تم تحليل ${nextStaged.length} مصطلح أوفلاين جاهز للحفظ.`
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.umedpack')) {
      setIsParsingFile(true);
      try {
        await onImportPackageFile(file);
        const summary = buildConciseDataSummary({
          terms,
          sentences,
          topics,
          sourceLabel: file.name,
          rawSizeBytes: file.size
        });
        setLastDataSummary(summary);
        setOfflineFeedback({
          type: 'success',
          message: `تم استيراد حزمة البيانات (${file.name}) بنجاح.`
        });
      } catch (err) {
        setOfflineFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'تعذر استيراد الحزمة المضغوطة.'
        });
      } finally {
        setIsParsingFile(false);
      }
      return;
    }

    setIsParsingFile(true);
    try {
      const parsed = await parseUploadedFile(file);
      setRawBatchInput(parsed.extractedText);
      parseRawTextToStaged(parsed.extractedText, file.name);
    } catch (err) {
      setOfflineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'تعذر قراءة الملف المرفوع.'
      });
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleCommitStagedBatch = () => {
    const selected = stagedItems.filter((i) => i.selected !== false);
    if (selected.length === 0) return;

    onCommitBatch({
      stagedTerms: selected,
      stagedSentences: [],
      stayOnCurrentTab: true
    });

    setLastDataSummary(
      buildConciseDataSummary({
        terms: selected as unknown as DictionaryTerm[],
        sentences: [],
        topics: [],
        blocks: [],
        subjects: [],
        questions: [],
        sourceLabel: 'دفعة مصطلحات مستوردة أوفلاين'
      })
    );

    setStagedItems([]);
    setRawBatchInput('');
    setOfflineFeedback({
      type: 'success',
      message: `تم حفظ ${selected.length} مصطلح في القاموس أوفلاين بنجاح.`
    });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* ====================================================================
          MODE 1: LIBRARY MAIN HUB (COMPACT CARDS - NO FILLER BANNER CARD)
         ==================================================================== */}
      {libraryMode === 'hub' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* CARD 1: FAVORITES PAGE LAUNCHER */}
          <button
            type="button"
            onClick={() => setLibraryMode('favorites')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Bookmark className="w-5 h-5 fill-current" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                    صفحة الكلمات والمفضلة
                  </h3>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    المجلد: {activeCollection}
                  </span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-extrabold font-mono tabular-nums shrink-0">
                {totalFavoritesCount} محفوظ
              </span>
            </div>

            <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>
                {terms.filter((t) => t.favorite).length} كلمة ·{' '}
                {sentences.filter((s) => s.favorite).length} جملة ·{' '}
                {topics.filter((t) => t.favorite).length} موضوع
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold">
                <span>فتح</span>
                <ChevronLeft className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* CARD 2: OFFLINE ADD & IMPORT TERMS/TOPICS/BACKUPS */}
          <button
            type="button"
            onClick={() => setLibraryMode('add_offline')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                    إضافة واستيراد أوفلاين
                  </h3>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    مصطلحات · مواضيع طبية
                  </span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold font-mono tabular-nums shrink-0">
                {customAddedTerms.length} محلي
              </span>
            </div>

            <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>JSON · CSV · TXT</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold">
                <span>فتح</span>
                <ChevronLeft className="w-4 h-4" />
              </span>
            </div>
          </button>

          {/* CARD 3: SM-2 SPACED REPETITION FLASHCARDS */}
          <button
            type="button"
            onClick={() => setLibraryMode('flashcards')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
          >
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                    بطاقات الاستذكار (SM-2)
                  </h3>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    التكرار المتباعد للمصطلحات
                  </span>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-extrabold font-mono tabular-nums shrink-0">
                {flashcardPool.length} بطاقة
              </span>
            </div>

            <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>
                إتقان: {studyStats.gotIt} · مراجعة: {studyStats.needsReview}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold">
                <span>مراجعة</span>
                <ChevronLeft className="w-4 h-4" />
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ====================================================================
          MODE 2: DEDICATED FAVORITES PAGE (OPENED ONLY AFTER CLICKING CARD)
         ==================================================================== */}
      {libraryMode === 'favorites' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setLibraryMode('hub')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>رجوع</span>
                </button>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  الكلمات والمفضلة ({totalFavoritesCount})
                </h2>
              </div>

              <button
                type="button"
                onClick={onOpenCollectionsMenu}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5"
              >
                <Folder className="w-4 h-4" />
                <span>المجلد: {activeCollection}</span>
              </button>
            </div>

            {/* Search inside favorites */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={favSearchQuery}
                onChange={(e) => setFavSearchQuery(e.target.value)}
                placeholder="ابحث في المفضلة..."
                className="w-full min-h-[42px] pr-10 pl-4 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-medium focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Sub-tabs inside Favorites Page */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setFavoritesTab('terms')}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  favoritesTab === 'terms'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>الكلمات ({favoriteTerms.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFavoritesTab('sentences')}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  favoritesTab === 'sentences'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>الجمل ({favoriteSentences.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFavoritesTab('topics')}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  favoritesTab === 'topics'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>المواضيع ({favoriteTopics.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFavoritesTab('custom')}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  favoritesTab === 'custom'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span>مضاف محلياً ({customAddedTerms.length})</span>
              </button>
            </div>
          </div>

          {/* Favorites Tab 1: Favorite Terms */}
          {favoritesTab === 'terms' && (
            <div className="space-y-2.5">
              {favoriteTerms.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500">
                    لا توجد كلمات مفضلة حالياً.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {favoriteTerms.map((term) => (
                    <div
                      key={term.id}
                      onClick={() => onOpenTermDetail(term.id)}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all cursor-pointer flex items-start justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            dir="ltr"
                            className="font-mono font-extrabold text-sm sm:text-base text-slate-900 dark:text-white break-words"
                          >
                            {term.term}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {term.phonetic}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTriggerTTS(term.term, `fav-tts-${term.id}`);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                            title="نطق المصطلح"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {term.translation}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {term.definitionAr}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTerm(term.id, e)}
                        className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 hover:bg-rose-50 hover:text-rose-500 transition-colors shrink-0"
                        title="إزالة من المفضلة"
                      >
                        <Bookmark className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Favorites Tab 2: Favorite Sentences */}
          {favoritesTab === 'sentences' && (
            <div className="space-y-2.5">
              {favoriteSentences.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500">
                    لا توجد جمل سريرية محفوظة في المفضلة حالياً.
                  </p>
                </div>
              ) : (
                favoriteSentences.map((sen) => (
                  <div
                    key={sen.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                          {sen.category}
                        </span>
                        <button
                          type="button"
                          onClick={() => onTriggerTTS(sen.en, `fav-sen-${sen.id}`)}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-600"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p
                        dir="ltr"
                        className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 text-left leading-relaxed"
                      >
                        {sen.en}
                      </p>
                      <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        {sen.ar}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => onToggleFavoriteSentence(sen.id, e)}
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 shrink-0"
                    >
                      <Bookmark className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Favorites Tab 3: Favorite Topics */}
          {favoritesTab === 'topics' && (
            <div className="space-y-2.5">
              {favoriteTopics.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500">
                    لا توجد مواضيع محفوظة في المفضلة بعد.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {favoriteTopics.map((topic) => (
                    <div
                      key={topic.id}
                      onClick={() => onOpenTopicFromLibrary?.(topic.id)}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          {topic.category}
                        </span>
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {topic.titleAr || topic.title}
                        </h4>
                        {topic.titleEn && (
                          <p dir="ltr" className="text-xs font-mono text-slate-500 text-left">
                            {topic.titleEn}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteTopic?.(topic.id, e);
                        }}
                        className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 shrink-0"
                      >
                        <Bookmark className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Favorites Tab 4: Custom Locally Added Terms */}
          {favoritesTab === 'custom' && (
            <div className="space-y-2.5">
              {customAddedTerms.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <p className="text-xs font-bold text-slate-500">
                    لم تقم بإضافة مصطلحات مخصصة يدوياً بعد.
                  </p>
                  <button
                    type="button"
                    onClick={() => setLibraryMode('add_offline')}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>إضافة مصطلح أوفلاين</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customAddedTerms.map((term) => (
                    <div
                      key={term.id}
                      onClick={() => onOpenTermDetail(term.id)}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <span
                          dir="ltr"
                          className="font-mono font-extrabold text-sm text-slate-900 dark:text-white block"
                        >
                          {term.term}
                        </span>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {term.translation}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-2">{term.definitionAr}</p>
                      </div>
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold shrink-0">
                        محلي
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODE 3: OFFLINE ADD & FILE IMPORT (TERMS, TOPICS & BACKUPS)
         ==================================================================== */}
      {libraryMode === 'add_offline' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setLibraryMode('hub')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>رجوع</span>
                </button>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  إضافة واستيراد البيانات أوفلاين
                </h2>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOfflineAddTab('manual')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    offlineAddTab === 'manual'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>إضافة مصطلح</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOfflineAddTab('file_batch')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    offlineAddTab === 'file_batch'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد ملفات أوفلاين</span>
                </button>
              </div>
            </div>

            {offlineFeedback && (
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
                  offlineFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {offlineFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{offlineFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOfflineFeedback(null)}
                  className="p-1 rounded-lg hover:bg-black/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* CONCISE DATA SUMMARY CARD (تعريف مختصر بالبيانات المنسوخة أو المستوردة) */}
            {lastDataSummary && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                    تعريف البيانات ({lastDataSummary.sourceLabel})
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {lastDataSummary.sizeKB} KB ·{' '}
                    {new Date(lastDataSummary.timestamp).toLocaleTimeString('ar-SA', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.termsCount}
                    </div>
                    <div className="text-[10px] text-slate-500">مصطلح</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.topicsCount}
                    </div>
                    <div className="text-[10px] text-slate-500">موضوع</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.blocksCount}
                    </div>
                    <div className="text-[10px] text-slate-500">بلوك</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.subjectsCount}
                    </div>
                    <div className="text-[10px] text-slate-500">مادة</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.sentencesCount}
                    </div>
                    <div className="text-[10px] text-slate-500">جملة</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                    <div className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                      {lastDataSummary.favoritesCount}
                    </div>
                    <div className="text-[10px] text-slate-500">مفضلة</div>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB 1: MANUAL OFFLINE ENTRY */}
            {offlineAddTab === 'manual' && (
              <form onSubmit={handleSaveManualEntry} className="space-y-3.5 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                        المصطلح بالإنجليزية *
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoAssistOffline}
                        className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>ترجمة تلقائية</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={manualTerm}
                      onChange={(e) => setManualTerm(e.target.value)}
                      placeholder="e.g., Cardiomyopathy"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-mono font-bold text-left focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block">
                      الترجمة بالعربية *
                    </label>
                    <input
                      type="text"
                      required
                      value={manualTranslation}
                      onChange={(e) => setManualTranslation(e.target.value)}
                      placeholder="اعتلال عضلة القلب"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                      التخصص
                    </label>
                    <select
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value as LexiconCategory)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                      النوع اللغوي
                    </label>
                    <select
                      value={manualPos}
                      onChange={(e) => setManualPos(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {POS_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                      المجلد
                    </label>
                    <input
                      type="text"
                      value={manualCollection}
                      onChange={(e) => setManualCollection(e.target.value)}
                      placeholder="طوارئ القلب"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                    التعريف العلمي بالعربية
                  </label>
                  <textarea
                    rows={2}
                    value={manualDefAr}
                    onChange={(e) => setManualDefAr(e.target.value)}
                    placeholder="تعريف مختصر للمفهوم الطبي..."
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    dir="ltr"
                    value={manualSentenceEn}
                    onChange={(e) => setManualSentenceEn(e.target.value)}
                    placeholder="Example sentence (optional)..."
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-left"
                  />
                  <input
                    type="text"
                    value={manualSentenceAr}
                    onChange={(e) => setManualSentenceAr(e.target.value)}
                    placeholder="ترجمة الجملة (اختياري)..."
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addAlsoToFavorites}
                      onChange={(e) => setAddAlsoToFavorites(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>إضافة للمفضلة</span>
                  </label>

                  <button
                    type="submit"
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ المصطلح أوفلاين</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-TAB 2: OFFLINE FILE & BATCH IMPORT (TERMS & TOPICS) */}
            {offlineAddTab === 'file_batch' && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,.txt,.md,.zip,.umedpack"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={isParsingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-3.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-right flex items-center gap-3 transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                        {isParsingFile
                          ? 'جاري قراءة وتحليل الملف...'
                          : 'استيراد ملف مصطلحات أو مواضيع أوفلاين (JSON / CSV / TXT)'}
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                        إضافة جماعية للمصطلحات والمواضيع والبلوكات بدون إنترنت
                      </p>
                    </div>
                  </button>
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={4}
                    dir="auto"
                    value={rawBatchInput}
                    onChange={(e) => setRawBatchInput(e.target.value)}
                    placeholder={`الصق قائمة مصطلحات (Term - الترجمة - التعريف) أو كود JSON لمصطلحات أو مواضيع أو نسخة احتياطية...`}
                    className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono leading-relaxed"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => parseRawTextToStaged(rawBatchInput, 'نص ملصق أوفلاين')}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-extrabold flex items-center gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>تحليل واستيراد أوفلاين</span>
                    </button>
                  </div>
                </div>

                {stagedItems.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                        المصطلحات الجاهزة للحفظ ({stagedItems.filter((i) => i.selected !== false).length}):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStagedItems([])}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>مسح</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCommitStagedBatch}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>
                            حفظ الكل ({stagedItems.filter((i) => i.selected !== false).length})
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {stagedItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                        >
                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.selected !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setStagedItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, selected: checked } : it
                                  )
                                );
                              }}
                              className="w-4 h-4 rounded text-emerald-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  dir="ltr"
                                  className="font-mono font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white"
                                >
                                  {item.term}
                                </span>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  {item.translation}
                                </span>
                                {item.isDuplicate && (
                                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[10px] font-bold">
                                    تحديث موجود
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {item.definitionAr}
                              </p>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODE 4: SM-2 SPACED REPETITION FLASHCARDS
         ==================================================================== */}
      {libraryMode === 'flashcards' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setLibraryMode('hub')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>رجوع</span>
            </button>
            <div className="text-left">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                بطاقات الاستذكار (SM-2)
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {(currentCardIdx % Math.max(1, flashcardPool.length)) + 1} / {flashcardPool.length}
              </span>
            </div>
          </div>

          {currentFlashcard ? (
            <>
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="bg-white dark:bg-slate-900 rounded-3xl p-7 sm:p-10 border-2 border-slate-200/90 dark:border-slate-800 shadow-lg min-h-[260px] flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all hover:border-emerald-500/40 relative overflow-hidden"
              >
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">{currentFlashcard.category}</span>
                  <span>{isFlipped ? 'الإجابة' : 'انقر للقلب'}</span>
                </div>

                {!isFlipped ? (
                  <div className="space-y-3 my-4">
                    <h3
                      dir="ltr"
                      className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 dark:text-white tracking-tight break-words"
                    >
                      {currentFlashcard.term}
                    </h3>
                    <p className="text-sm font-mono text-slate-400">
                      {currentFlashcard.phonetic}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerTTS(currentFlashcard.term, `fc-tts-${currentFlashcard.id}`);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:text-emerald-600"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>نطق</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 my-4 max-w-md">
                    <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-lg font-extrabold">
                      {currentFlashcard.translation}
                    </span>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {currentFlashcard.definitionAr}
                    </p>
                  </div>
                )}

                <div className="absolute bottom-4 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>قلب البطاقة</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFlashcardDecision(false)}
                  className="min-h-[46px] py-2.5 px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>أحتاج لمراجعتها</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFlashcardDecision(true)}
                  className="min-h-[46px] py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>أتقنتها</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
