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
  ChevronDown,
  Wand2,
  Cloud,
  Download,
  RefreshCw,
  HardDrive,
  GraduationCap,
  Star,
  ExternalLink
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
  ClinicalAbbreviation,
  AcademicExamPackage
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
import {
  buildCloudLibraryCatalogView,
  downloadCloudLibraryTarget,
  deleteCloudLibraryTargetLocally,
  deleteCloudLibraryTargetPermanently,
  processCloudSyncQueue,
  syncWithRemoteCloudLibrary,
  subscribeToCloudLibraryChanges,
  isCloudSyncOnline,
  computeDeterministicFastHashHex,
  CloudLibraryStateSummary,
  CloudCatalogBookEntry
} from '../services/cloudLibrarySyncService';
import {
  loadAcademicBooks,
  loadMedicalBlocks,
  loadMedicalSubjects,
  toggleBookFavorite,
  saveBookReadingProgress
} from '../services/learningHierarchyService';
import {
  loadQuizQuestions,
  saveQuizQuestions,
  loadQuizAttempts,
  saveQuizAttempt
} from '../services/quizEngineService';
import {
  getLocalMediaRecord,
  downloadRemoteMediaToOfflineCache
} from '../services/mediaStorageService';
import { base64ToUint8Array } from '../utils/downloadHelper';
import {
  importUniversalAiOrLocalContent,
  UniversalImportReport
} from '../services/aiUniversalImportService';
import { AiContentGuideModal } from './AiContentGuideModal';
import { QuizCenterModal } from './QuizCenterModal';

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

export type LibrarySubMode =
  | 'hub'
  | 'favorites'
  | 'add_offline'
  | 'flashcards'
  | 'cloud_library';

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
  onSyncStateUpdated?: (payload: {
    topics: TopicArticle[];
    terms: DictionaryTerm[];
    sentences: LinkedSentence[];
    customAffixes?: MorphologicalAffix[];
    customAbbreviations?: ClinicalAbbreviation[];
  }) => void;
  onUniversalImportComplete?: (report: UniversalImportReport) => void;
  onBackupNowTriggered?: (reason: string) => void;
  showToast?: (message: string, type?: string) => void;
}

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
  onImportTopicsBatch,
  onSyncStateUpdated,
  onUniversalImportComplete,
  onBackupNowTriggered,
  showToast
}) => {
  const [libraryMode, setLibraryMode] = useState<LibrarySubMode>(initialMode || 'hub');
  const [favoritesTab, setFavoritesTab] = useState<'terms' | 'sentences' | 'topics' | 'custom'>('terms');
  const [favSearchQuery, setFavSearchQuery] = useState('');

  // Flashcards state
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Unified Cloud Library & Selective Download state
  const [cloudFilterTab, setCloudFilterTab] = useState<'all' | 'local' | 'cloud'>('all');
  const [cloudSearchQuery, setCloudSearchQuery] = useState('');
  const [expandedBlockIds, setExpandedBlockIds] = useState<Record<string, boolean>>({
    'block-hematology': true
  });
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Record<string, boolean>>({
    'subj-hematology': true
  });
  const [busyTargetKey, setBusyTargetKey] = useState<string | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const [isAiGuideOpen, setIsAiGuideOpen] = useState(false);
  const [activeExamModal, setActiveExamModal] = useState<AcademicExamPackage | null>(null);
  const [bookPdfPreview, setBookPdfPreview] = useState<{
    title: string;
    url: string;
    bookId?: string;
    isObjectUrl?: boolean;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (bookPdfPreview?.isObjectUrl && bookPdfPreview.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(bookPdfPreview.url);
        } catch {
          // ignore
        }
      }
    };
  }, [bookPdfPreview]);

  useEffect(() => {
    const unsub = subscribeToCloudLibraryChanges(() => {
      setSyncRevision((prev) => prev + 1);
    });
    return unsub;
  }, []);

  const cloudSummary: CloudLibraryStateSummary = useMemo(
    () =>
      buildCloudLibraryCatalogView({
        localTopics: topics,
        localTerms: terms,
        localSentences: sentences
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topics, terms, sentences, syncRevision]
  );

  // Offline Add & Import state (Popup / Secondary Modals)
  const [activeIngestModal, setActiveIngestModal] = useState<
    'manual_term' | 'file_upload' | 'paste_text' | 'permanent_delete' | null
  >(null);
  const [showImportCapabilities, setShowImportCapabilities] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<{
    targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam' | 'all_data';
    targetId: string;
    titleLabel: string;
    isDownloaded: boolean;
  } | null>(null);
  const [manualTerm, setManualTerm] = useState('');
  const [manualTranslation, setManualTranslation] = useState('');
  const [manualPhonetic, setManualPhonetic] = useState('');
  const [manualCollection, setManualCollection] = useState('');
  const [manualDefAr, setManualDefAr] = useState('');
  const [manualDefEn, setManualDefEn] = useState('');
  const [manualSentenceEn, setManualSentenceEn] = useState('');
  const [manualSentenceAr, setManualSentenceAr] = useState('');
  const [addAlsoToFavorites, setAddAlsoToFavorites] = useState(true);
  const [showOptionalManualFields, setShowOptionalManualFields] = useState(false);
  const manualTermInputRef = useRef<HTMLInputElement | null>(null);
  const manualTranslationInputRef = useRef<HTMLInputElement | null>(null);
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
        setActiveIngestModal('manual_term');
      }
      onInitialModeConsumed?.();
    }
  }, [initialMode, initialDraftTerm, onInitialModeConsumed]);

  const existingTermSet = useMemo(
    () => new Set(terms.map((t) => t.term.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/[^a-z0-9'-]+/g, ' ').replace(/\s+/g, ' ').trim())),
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

  // Offline auto-assist using local morphology + GC-NMT engine + common vocabulary fallback
  const handleAutoAssistOffline = () => {
    const clean = (manualTermInputRef.current?.value ?? manualTerm).trim();
    if (!clean) {
      setOfflineFeedback({
        type: 'error',
        message: 'أدخل المصطلح بالإنجليزية أولاً.'
      });
      return;
    }
    if (clean !== manualTerm) {
      setManualTerm(clean);
    }

    const commonFallbackMap: Record<string, string> = {
      world: 'عالم',
      heart: 'قلب',
      blood: 'دم',
      pressure: 'ضغط',
      'blood pressure': 'ضغط الدم',
      hypertension: 'ارتفاع ضغط الدم',
      hypotension: 'انخفاض ضغط الدم',
      cell: 'خلية',
      pain: 'ألم',
      disease: 'مرض',
      patient: 'مريض',
      treatment: 'علاج',
      therapy: 'معالجة',
      brain: 'دماغ',
      liver: 'كبد',
      kidney: 'كلية',
      lung: 'رئة',
      bone: 'عظم',
      muscle: 'عضلة',
      nerve: 'عصب',
      artery: 'شريان',
      vein: 'وريد',
      fever: 'حمى',
      infection: 'عدوى',
      inflammation: 'التهاب',
      surgery: 'جراحة',
      medicine: 'طب / دواء',
      symptom: 'عرض',
      diagnosis: 'تشخيص',
      syndrome: 'متلازمة',
      acute: 'حاد',
      chronic: 'مزمن',
      normal: 'طبيعي',
      high: 'مرتفع',
      low: 'منخفض',
      health: 'صحة',
      system: 'جهاز / نظام',
      science: 'علم',
      study: 'دراسة',
      test: 'اختبار / فحص'
    };

    const morph = decomposeMedicalWord(clean, terms);
    const quick = lookupQuickWordOrPhraseAr(clean, terms);
    const gcNmt = runHybridGcNmtPipeline(clean, terms, sentences);

    const hasMorph = Boolean(
      morph.prefix || (morph.roots && morph.roots.length > 0) || morph.suffix
    );
    const bestTranslation =
      quick?.translationAr ||
      commonFallbackMap[clean.toLowerCase()] ||
      (hasMorph && morph.synthesizedAr && morph.synthesizedAr !== 'مصطلح أحادي الجذر'
        ? morph.synthesizedAr
        : gcNmt.layer4FinalOutputAr && gcNmt.layer4FinalOutputAr.toLowerCase() !== clean.toLowerCase()
        ? gcNmt.layer4FinalOutputAr
        : '');

    const currentAr = (manualTranslationInputRef.current?.value ?? manualTranslation).trim();
    if (!currentAr && bestTranslation) {
      setManualTranslation(bestTranslation);
      if (manualTranslationInputRef.current) {
        manualTranslationInputRef.current.value = bestTranslation;
      }
      setOfflineFeedback(null);
    }

    const morphSummary = [
      morph.prefix ? `بادئة ${morph.prefix.affix} (${morph.prefix.meaningAr})` : null,
      ...(morph.roots || []).map((r) => `جذر ${r.affix} (${r.meaningAr})`),
      morph.suffix ? `لاحقة ${morph.suffix.affix} (${morph.suffix.meaningAr})` : null
    ]
      .filter(Boolean)
      .join(' + ');

    if (!manualDefAr.trim() && morphSummary) {
      setManualDefAr(`التحليل الصرفي: ${morphSummary}.`);
    }
  };

  const handleSaveManualEntry = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const domEn = manualTermInputRef.current?.value ?? '';
    const domAr = manualTranslationInputRef.current?.value ?? '';
    const cleanEn = (domEn || manualTerm).trim();
    const cleanAr = (domAr || manualTranslation).trim();

    const termWords = cleanEn ? cleanEn.replace(/\s+/g, ' ').split(' ') : [];
    const validTermWord = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$/;
    if (!cleanEn || !cleanAr || termWords.length < 1 || termWords.length > 2 || termWords.some((word) => !validTermWord.test(word))) {
      setOfflineFeedback({
        type: 'error',
        message: 'أدخل مصطلحاً من كلمة إنجليزية واحدة أو كلمتين فقط، مع ترجمته العربية. لا تُدخل جملة.'
      });
      if (!cleanEn) {
        manualTermInputRef.current?.focus();
      } else {
        manualTranslationInputRef.current?.focus();
      }
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
        category: 'General',
        sourceType: 'manual',
        linkedTermIds: [newId],
        tags: [cleanEn],
        favorite: addAlsoToFavorites,
        createdAt: 'الآن'
      });
    }

    const cleanCollection = manualCollection.trim();
    const newTermObj: DictionaryTerm = {
      id: newId,
      term: cleanEn,
      termNormalized: cleanEn.toLowerCase(),
      translation: cleanAr,
      phonetic: manualPhonetic.trim(),
      pos: 'term',
      category: 'General',
      keepEnglish: true,
      favorite: addAlsoToFavorites,
      collections: cleanCollection ? [cleanCollection] : ['مضاف يدوياً'],
      ingestedAt: 'الآن',
      definitionAr: manualDefAr.trim(),
      definitionEn: manualDefEn.trim(),
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
        sourceLabel: 'إضافة يدوية'
      })
    );

    setOfflineFeedback({
      type: 'success',
      message: `تم حفظ "${cleanEn}" (${cleanAr}) بنجاح.`
    });

    setManualTerm('');
    setManualTranslation('');
    if (manualTermInputRef.current) manualTermInputRef.current.value = '';
    if (manualTranslationInputRef.current) manualTranslationInputRef.current.value = '';
    setManualPhonetic('');
    setManualDefAr('');
    setManualDefEn('');
    setManualSentenceEn('');
    setManualSentenceAr('');
  };

  const parseRawTextToStaged = (text: string, sourceFileName = 'استيراد أوفلاين') => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // 1. Universal JSON / Markdown ```json ... ``` / High-density || lines / Markdown Hierarchy & Tables / Backups
    const looksStructuredOrRich =
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      /```(?:json|jsonl|js|ts)?/i.test(trimmed) ||
      trimmed.includes('||') ||
      /^#{1,4}\s*(?:block|subject|topic)\s*:/im.test(trimmed) ||
      /^\|.+\|.+\|$/m.test(trimmed);

    if (looksStructuredOrRich) {
      const report = importUniversalAiOrLocalContent({
        rawText: text,
        sourceLabel: sourceFileName,
        syncToCloud: false
      });
      if (report.success) {
        onUniversalImportComplete?.(report);
        setSyncRevision((prev) => prev + 1);
        const summary = buildConciseDataSummary({
          terms: report.updatedTerms,
          sentences: report.updatedSentences,
          topics: report.updatedTopics,
          sourceLabel: sourceFileName,
          rawSizeBytes: new Blob([trimmed]).size
        });
        setLastDataSummary(summary);
        setOfflineFeedback({
          type: 'success',
          message: `تم الاستيراد بنجاح (${report.summaryText}).`
        });
        setRawBatchInput('');
        return;
      }

      // Fallback to legacy unified backup handler if needed
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const ok = onImportFullBackupJson(trimmed);
          if (ok) {
            setOfflineFeedback({
              type: 'success',
              message: 'تم استيراد النسخة الاحتياطية بنجاح.'
            });
            setRawBatchInput('');
            return;
          }
        } catch {
          // Fallback to text line parsing below
        }
      }
    }

    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 1);

    const nextStaged: StagedTermItem[] = [];
    let rejectedInvalidTerms = 0;
    lines.forEach((line, idx) => {
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.includes(' - ')
        ? line.split(' - ')
        : line.includes(' : ')
        ? line.split(' : ')
        : line.split(',');

      const tEn = (parts[0] || '').trim().replace(/^["']|["']$/g, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/\s+/g, ' ');
      if (!tEn || tEn.toLowerCase() === 'term') return;
      const termWords = tEn.split(' ');
      const validTermWord = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$/;
      if (termWords.length < 1 || termWords.length > 2 || termWords.some((word) => !validTermWord.test(word))) {
        rejectedInvalidTerms += 1;
        return;
      }

      const quick = lookupQuickWordOrPhraseAr(tEn, terms);
      const tAr = (parts[1] || '').trim().replace(/^["']|["']$/g, '') || quick?.translationAr || '';
      if (!tAr || !/[\u0600-\u06FF]/.test(tAr) || /^(مصطلح طبي|ترجمة عربية|غير معروف)$/i.test(tAr)) {
        rejectedInvalidTerms += 1;
        return;
      }
      const defAr = (parts[2] || '').trim().replace(/^["']|["']$/g, '');
      const defEn = (parts[3] || '').trim().replace(/^["']|["']$/g, '');

      nextStaged.push({
        id: `stg-line-${Date.now()}-${idx}`,
        term: tEn,
        translation: tAr,
        phonetic: '',
        pos: 'term',
        category: 'General',
        definitionAr: defAr,
        definitionEn: defEn,
        examples: [],
        relations: {
          synonyms: [],
          broader: [],
          related: []
        },
        selected: true,
        isDuplicate: existingTermSet.has(tEn.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/[^a-z0-9'-]+/g, ' ').replace(/\s+/g, ' ').trim())
      });
    });

    setStagedItems(nextStaged);
    if (nextStaged.length === 0) {
      setOfflineFeedback({
        type: 'error',
        message: `لم يتم العثور على مصطلحات صالحة. تم استبعاد ${rejectedInvalidTerms} سجل غير مطابق لشرط كلمة أو كلمتين أو دون ترجمة عربية.`
      });
    } else {
      setOfflineFeedback({
        type: 'success',
        message: `تم تحليل ${nextStaged.length} مصطلح أوفلاين. تم استبعاد ${rejectedInvalidTerms} سجل غير مطابق.`
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

  const handleDownloadTarget = async (
    targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam' | 'dictionary',
    targetId: string
  ) => {
    if (!isCloudSyncOnline()) {
      showToast?.('يلزم الاتصال بالإنترنت للتنزيل من المكتبة السحابية', 'info');
      return;
    }
    const key = `${targetType}:${targetId}`;
    setBusyTargetKey(key);
    try {
      const res = await downloadCloudLibraryTarget({
        targetType,
        targetId,
        currentTopics: topics,
        currentTerms: terms,
        currentSentences: sentences
      });
      if (res.success) {
        onSyncStateUpdated?.({
          topics: res.updatedTopics,
          terms: res.updatedTerms,
          sentences: res.updatedSentences,
          ...(res.updatedAffixes ? { customAffixes: res.updatedAffixes } : {}),
          ...(res.updatedAbbreviations
            ? { customAbbreviations: res.updatedAbbreviations }
            : {})
        });
        setSyncRevision((prev) => prev + 1);
        onBackupNowTriggered?.(`تنزيل سحابي (${targetType})`);
      }
      showToast?.(res.messageAr, res.success ? 'success' : 'info');
    } finally {
      setBusyTargetKey(null);
    }
  };

  const handleDeleteTargetLocally = async (
    targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam',
    targetId: string
  ) => {
    const key = `${targetType}:${targetId}`;
    setBusyTargetKey(key);
    try {
      const res = await deleteCloudLibraryTargetLocally({
        targetType,
        targetId,
        currentTopics: topics,
        currentTerms: terms,
        currentSentences: sentences
      });
      onSyncStateUpdated?.({
        topics: res.updatedTopics,
        terms: res.updatedTerms,
        sentences
      });
      setSyncRevision((prev) => prev + 1);
      onBackupNowTriggered?.(`حذف محلي (${targetType})`);
      showToast?.(res.messageAr, 'info');
    } finally {
      setBusyTargetKey(null);
      setPendingDeleteTarget(null);
    }
  };

  const handleDeleteTargetPermanently = async (
    targetType: 'block' | 'subject' | 'topic' | 'book' | 'exam' | 'all_data',
    targetId: string
  ) => {
    const key = `perm:${targetType}:${targetId}`;
    setBusyTargetKey(key);
    try {
      const res = await deleteCloudLibraryTargetPermanently({
        targetType,
        targetId,
        currentTopics: topics,
        currentTerms: terms,
        currentSentences: sentences
      });
      onSyncStateUpdated?.({
        topics: res.updatedTopics,
        terms: res.updatedTerms,
        sentences: res.updatedSentences
      });
      setSyncRevision((prev) => prev + 1);
      onBackupNowTriggered?.(`حذف نهائي (${targetType})`);
      setOfflineFeedback({
        type: 'success',
        message: res.messageAr
      });
      showToast?.(res.messageAr, 'info');
    } finally {
      setBusyTargetKey(null);
      setPendingDeleteTarget(null);
    }
  };

  const closeBookPdfPreview = () => {
    setBookPdfPreview((prev) => {
      if (prev?.isObjectUrl && prev.url.startsWith('blob:') && typeof URL !== 'undefined') {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }
      return null;
    });
  };

  const handleOpenCloudBook = async (bk: CloudCatalogBookEntry) => {
    const localBook = loadAcademicBooks().find((item) => item.id === bk.id);
    const pdfHref = (
      localBook?.downloadUrl ||
      localBook?.pdfUrl ||
      bk.downloadUrl ||
      bk.pdfUrl ||
      ''
    ).trim();
    const idbKey =
      localBook?.mediaIdbKey ||
      (pdfHref.startsWith('http://') || pdfHref.startsWith('https://')
        ? `idb-${computeDeterministicFastHashHex(pdfHref).slice(0, 16)}`
        : '');

    if (localBook) {
      saveBookReadingProgress(bk.id, {
        lastReadPage: Math.max(1, localBook.lastReadPage || 1),
        readingProgressPercent: Math.max(5, localBook.readingProgressPercent || 0)
      });
      setSyncRevision((prev) => prev + 1);
    }

    if (idbKey) {
      const cached = await getLocalMediaRecord(idbKey);
      if (cached?.dataUrl) {
        let previewUrl = cached.dataUrl;
        let isObjectUrl = false;
        if (cached.dataUrl.startsWith('data:') && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          try {
            const commaIdx = cached.dataUrl.indexOf(',');
            const header = commaIdx !== -1 ? cached.dataUrl.slice(5, commaIdx) : '';
            const mime = header.split(';')[0] || 'application/pdf';
            const body = commaIdx !== -1 ? cached.dataUrl.slice(commaIdx + 1) : '';
            if (header.includes('base64') && body) {
              const bytes = base64ToUint8Array(body);
              previewUrl = URL.createObjectURL(
                new Blob(
                  [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
                  { type: mime }
                )
              );
              isObjectUrl = true;
            }
          } catch {
            previewUrl = cached.dataUrl;
          }
        }
        setBookPdfPreview({
          title: bk.titleAr || bk.titleEn,
          url: previewUrl,
          bookId: bk.id,
          isObjectUrl
        });
        return;
      }
    }
    if (pdfHref) {
      setBookPdfPreview({
        title: bk.titleAr || bk.titleEn,
        url: pdfHref,
        bookId: bk.id,
        isObjectUrl: false
      });
      return;
    }
    showToast?.('لا يتوفر ملف PDF مرتبط بهذا الكتاب حالياً', 'info');
  };

  const handleRefreshCloudCatalog = async () => {
    if (!isCloudSyncOnline()) {
      showToast?.('يلزم الاتصال بالإنترنت لتحديث قائمة المكتبة السحابية', 'info');
      return;
    }
    setBusyTargetKey('catalog:refresh');
    try {
      await processCloudSyncQueue({ forceRetryFailed: true });
      await syncWithRemoteCloudLibrary({
        localTerms: terms,
        localSentences: sentences,
        localTopics: topics
      });
      setSyncRevision((prev) => prev + 1);
      showToast?.('تم تحديث فهرس المكتبة السحابية؛ اضغط تنزيل على أي عنصر لتحميله');
    } finally {
      setBusyTargetKey(null);
    }
  };

  const syncStatusLabelAr: Record<string, string> = {
    synced: 'متزامن',
    pending: 'قيد الرفع',
    syncing: 'مزامنة...',
    failed: 'فشل'
  };

  const filteredCloudBooks = useMemo(() => {
    const q = cloudSearchQuery.trim().toLowerCase();
    return (cloudSummary.books || []).filter((bk) => {
      if (cloudFilterTab === 'local' && !bk.isDownloaded) return false;
      if (cloudFilterTab === 'cloud' && bk.isDownloaded) return false;
      if (!q) return true;
      return (
        bk.titleAr.toLowerCase().includes(q) ||
        bk.titleEn.toLowerCase().includes(q) ||
        bk.authorsLabel.toLowerCase().includes(q)
      );
    });
  }, [cloudSummary.books, cloudFilterTab, cloudSearchQuery]);

  const filteredCloudExams = useMemo(() => {
    const q = cloudSearchQuery.trim().toLowerCase();
    const downloadedIds = new Set(cloudSummary.downloadedExamIds || []);
    return (cloudSummary.exams || []).filter((ex) => {
      const isDl = downloadedIds.has(ex.id);
      if (cloudFilterTab === 'local' && !isDl) return false;
      if (cloudFilterTab === 'cloud' && isDl) return false;
      if (!q) return true;
      return (
        (ex.titleAr || '').toLowerCase().includes(q) ||
        (ex.titleEn || '').toLowerCase().includes(q) ||
        (ex.descriptionAr || '').toLowerCase().includes(q)
      );
    });
  }, [cloudSummary.exams, cloudSummary.downloadedExamIds, cloudFilterTab, cloudSearchQuery]);

  const filteredDynamicCollections = useMemo(() => {
    const q = cloudSearchQuery.trim().toLowerCase();
    return (cloudSummary.dynamicCollections || []).map((col) => {
      const matchedItems = (col.items || []).filter((it) => {
        if (!q) return true;
        return (
          (it.titleAr || '').toLowerCase().includes(q) ||
          (it.titleEn || '').toLowerCase().includes(q) ||
          (it.summaryAr || '').toLowerCase().includes(q) ||
          (it.summaryEn || '').toLowerCase().includes(q)
        );
      });
      return { ...col, items: matchedItems };
    }).filter((col) => col.items.length > 0);
  }, [cloudSummary.dynamicCollections, cloudSearchQuery]);

  const filteredCloudBlocks = useMemo(() => {
    const q = cloudSearchQuery.trim().toLowerCase();
    return cloudSummary.blocks
      .map((blk) => {
        const subjects = blk.subjects
          .map((subj) => {
            const matchedTopics = subj.topics.filter((tp) => {
              if (cloudFilterTab === 'local' && !tp.isDownloaded) return false;
              if (cloudFilterTab === 'cloud' && tp.isDownloaded) return false;
              if (!q) return true;
              return (
                tp.titleAr.toLowerCase().includes(q) ||
                tp.titleEn.toLowerCase().includes(q) ||
                subj.titleAr.toLowerCase().includes(q) ||
                subj.titleEn.toLowerCase().includes(q) ||
                blk.titleAr.toLowerCase().includes(q) ||
                blk.titleEn.toLowerCase().includes(q)
              );
            });
            return {
              ...subj,
              topics: matchedTopics
            };
          })
          .filter((subj) => {
            if (subj.topics.length > 0) return true;
            if (q) {
              const matchesSubj =
                subj.titleAr.toLowerCase().includes(q) ||
                subj.titleEn.toLowerCase().includes(q) ||
                subj.code.toLowerCase().includes(q);
              if (!matchesSubj) return false;
            }
            if (cloudFilterTab === 'local') return subj.isDownloaded;
            if (cloudFilterTab === 'cloud') return !subj.isDownloaded;
            return true;
          });

        return {
          ...blk,
          subjects
        };
      })
      .filter((blk) => {
        if (blk.subjects.length > 0) return true;
        if (q) {
          const matchesBlk =
            blk.titleAr.toLowerCase().includes(q) ||
            blk.titleEn.toLowerCase().includes(q) ||
            blk.code.toLowerCase().includes(q);
          if (!matchesBlk) return false;
        }
        if (cloudFilterTab === 'local') return blk.isDownloaded;
        if (cloudFilterTab === 'cloud') return !blk.isDownloaded;
        return true;
      });
  }, [cloudSummary.blocks, cloudFilterTab, cloudSearchQuery]);

  return (
    <div className="space-y-4 pb-8">
      {/* ====================================================================
          MODE 1: LIBRARY MAIN HUB (COMPACT CARDS - 1 TO 2 WORDS)
         ==================================================================== */}
      {libraryMode === 'hub' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* CARD 1: UNIFIED CLOUD LIBRARY */}
          <button
            type="button"
            onClick={() => setLibraryMode('cloud_library')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold font-mono tabular-nums">
                {cloudSummary.downloadedTopicsCount}/{cloudSummary.totalCloudTopicsCount}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                المكتبة السحابية
              </h3>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>{syncStatusLabelAr[cloudSummary.overallSyncStatus]}</span>
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </button>

          {/* CARD 2: FAVORITES */}
          <button
            type="button"
            onClick={() => setLibraryMode('favorites')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Bookmark className="w-5 h-5 fill-current" />
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-extrabold font-mono tabular-nums">
                {totalFavoritesCount}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                المفضلة
              </h3>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span className="truncate">{activeCollection}</span>
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </button>

          {/* CARD 3: ADD & IMPORT */}
          <button
            type="button"
            onClick={() => setLibraryMode('add_offline')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold font-mono tabular-nums">
                {customAddedTerms.length}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                استيراد وإضافة
              </h3>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>ملفات · يدوي</span>
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </button>

          {/* CARD 4: FLASHCARDS */}
          <button
            type="button"
            onClick={() => setLibraryMode('flashcards')}
            className="group text-right bg-white dark:bg-slate-900 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 rounded-3xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[11px] font-extrabold font-mono tabular-nums">
                {flashcardPool.length}
              </span>
            </div>

            <div className="space-y-0.5 min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                المراجعة
              </h3>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span>بطاقات ذكية</span>
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ====================================================================
          MODE 1B: UNIFIED CLOUD LIBRARY & SELECTIVE DOWNLOAD MANAGER
         ==================================================================== */}
      {libraryMode === 'cloud_library' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-3.5 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
            {/* Top Bar: Clean 2-Row Mobile-Safe Header (Zero Overlap) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setLibraryMode('hub')}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors shrink-0"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>رجوع</span>
                  </button>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    المكتبة السحابية
                  </h2>
                </div>

                <span className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  {cloudSummary.overallSyncStatus === 'synced' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  {cloudSummary.overallSyncStatus === 'failed' && (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  )}
                  {(cloudSummary.overallSyncStatus === 'pending' ||
                    cloudSummary.overallSyncStatus === 'syncing') && (
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-amber-500 shrink-0 ${
                        cloudSummary.overallSyncStatus === 'syncing' ? 'animate-spin' : ''
                      }`}
                    />
                  )}
                  <span>{syncStatusLabelAr[cloudSummary.overallSyncStatus]}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyTargetKey === 'catalog:refresh'}
                  onClick={() => void handleRefreshCloudCatalog()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      busyTargetKey === 'catalog:refresh' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>تحديث</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAiGuideOpen(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>برومبت AI</span>
                </button>
              </div>
            </div>

            {/* Compact Storage Strip */}
            <div className="px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  المحلية: <strong className="font-mono tabular-nums">{cloudSummary.localTotalLabel}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  السحابية: <strong className="font-mono tabular-nums">{cloudSummary.cloudTotalLabel}</strong>
                </span>
              </div>

              {(cloudSummary.pendingCount > 0 || cloudSummary.failedCount > 0) && (
                <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  قيد الرفع: {cloudSummary.pendingCount}
                </span>
              )}
            </div>

            {/* Responsive 3-Column Filter Tabs (No Overlap on Narrow Screens) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/90 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCloudFilterTab('all')}
                  className={`min-h-[40px] px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition-colors flex items-center justify-center gap-1 leading-tight text-center ${
                    cloudFilterTab === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="truncate">الكل</span>
                  <span className="font-mono text-[10px] opacity-80">
                    ({cloudSummary.totalCloudTopicsCount})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCloudFilterTab('local')}
                  className={`min-h-[40px] px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition-colors flex items-center justify-center gap-1 leading-tight text-center ${
                    cloudFilterTab === 'local'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="truncate">المكتبة المحلية</span>
                  <span className="font-mono text-[10px] opacity-85">
                    ({cloudSummary.downloadedTopicsCount})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCloudFilterTab('cloud')}
                  className={`min-h-[40px] px-1.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition-colors flex items-center justify-center gap-1 leading-tight text-center ${
                    cloudFilterTab === 'cloud'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="truncate">المكتبة السحابية</span>
                  <span className="font-mono text-[10px] opacity-85">
                    ({Math.max(0, cloudSummary.totalCloudTopicsCount - cloudSummary.downloadedTopicsCount)})
                  </span>
                </button>
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={cloudSearchQuery}
                  onChange={(e) => setCloudSearchQuery(e.target.value)}
                  placeholder="بحث..."
                  className="w-full min-h-[38px] pr-9 pl-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Hierarchical Tree: Blocks -> Subjects -> Topics */}
            <div className="space-y-2.5">
              {filteredCloudBlocks.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs font-bold text-slate-500">
                  {!isCloudSyncOnline()
                    ? 'يلزم الاتصال بالإنترنت لتحميل المكتبة السحابية'
                    : cloudFilterTab === 'local'
                    ? 'المكتبة المحلية فارغة — نزّل من المكتبة السحابية'
                    : 'اضغط "تحديث" لجلب المكتبة السحابية'}
                </div>
              ) : (
                filteredCloudBlocks.map((blk) => {
                  const isBlockExpanded = Boolean(expandedBlockIds[blk.id]);
                  const blockBusy = busyTargetKey === `block:${blk.id}`;

                  return (
                    <div
                      key={blk.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 overflow-hidden"
                    >
                      {/* Block Row Header */}
                      <div className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 bg-white dark:bg-slate-900">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBlockIds((prev) => ({
                              ...prev,
                              [blk.id]: !prev[blk.id]
                            }))
                          }
                          className="flex items-start gap-2 text-right min-w-0 flex-1"
                        >
                          <ChevronDown
                            className={`w-4 h-4 mt-1 text-slate-400 shrink-0 transition-transform ${
                              isBlockExpanded ? 'rotate-180 text-emerald-500' : ''
                            }`}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                              {blk.titleAr}
                            </h3>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                              <span>
                                {blk.downloadedTopicsCount}/{blk.totalTopicsCount} موضوع
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{blk.sizeLabel}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  blk.isDownloaded
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }
                              >
                                {blk.isDownloaded
                                  ? 'محلي'
                                  : blk.isPartiallyDownloaded
                                  ? 'جزئي'
                                  : 'سحابي'}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Block Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!blk.isDownloaded && (
                            <button
                              type="button"
                              disabled={blockBusy}
                              onClick={() => void handleDownloadTarget('block', blk.id)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1 disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>تنزيل</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={blockBusy}
                            aria-label="حذف البلوك"
                            title="حذف البلوك"
                            onClick={() =>
                              setPendingDeleteTarget({
                                targetType: 'block',
                                targetId: blk.id,
                                titleLabel: blk.titleAr || blk.titleEn,
                                isDownloaded: Boolean(blk.isDownloaded || blk.isPartiallyDownloaded)
                              })
                            }
                            className="min-h-[36px] min-w-[36px] p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Subjects inside Block */}
                      {isBlockExpanded && (
                        <div className="p-2.5 space-y-2 border-t border-slate-100 dark:border-slate-800">
                          {blk.subjects.map((subj) => {
                            const isSubjExpanded = Boolean(expandedSubjectIds[subj.id]);
                            const subjBusy = busyTargetKey === `subject:${subj.id}`;

                            return (
                              <div
                                key={subj.id}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                              >
                                <div className="p-2.5 sm:p-3 flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedSubjectIds((prev) => ({
                                        ...prev,
                                        [subj.id]: !prev[subj.id]
                                      }))
                                    }
                                    className="flex items-start gap-2 text-right min-w-0 flex-1"
                                  >
                                    <ChevronDown
                                      className={`w-4 h-4 mt-0.5 text-slate-400 shrink-0 transition-transform ${
                                        isSubjExpanded ? 'rotate-180 text-emerald-500' : ''
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                                        {subj.titleAr}
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                        {subj.downloadedTopicsCount}/{subj.totalTopicsCount} موضوع ·{' '}
                                        {subj.sizeLabel} ·{' '}
                                        {subj.isDownloaded ? 'محلي' : 'سحابي'}
                                      </div>
                                    </div>
                                  </button>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {!subj.isDownloaded && (
                                      <button
                                        type="button"
                                        disabled={subjBusy}
                                        onClick={() =>
                                          void handleDownloadTarget('subject', subj.id)
                                        }
                                        className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 disabled:opacity-50"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>تنزيل</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      disabled={subjBusy}
                                      aria-label="حذف المادة"
                                      title="حذف المادة"
                                      onClick={() =>
                                        setPendingDeleteTarget({
                                          targetType: 'subject',
                                          targetId: subj.id,
                                          titleLabel: subj.titleAr || subj.titleEn,
                                          isDownloaded: Boolean(
                                            subj.isDownloaded || subj.isPartiallyDownloaded
                                          )
                                        })
                                      }
                                      className="min-h-[34px] min-w-[34px] p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center disabled:opacity-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Topics inside Subject */}
                                {isSubjExpanded && subj.topics.length > 0 && (
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                                    {subj.topics.map((tp) => {
                                      const tpBusy = busyTargetKey === `topic:${tp.id}`;
                                      return (
                                        <div
                                          key={tp.id}
                                          className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                                        >
                                          <div className="min-w-0 flex-1 space-y-0.5">
                                            <div className="font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                                              {tp.titleAr}
                                            </div>
                                            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                              <span>{tp.sizeLabel}</span>
                                              <span aria-hidden="true">·</span>
                                              <span
                                                className={
                                                  tp.isDownloaded
                                                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                                    : 'text-amber-600 dark:text-amber-400 font-bold'
                                                }
                                              >
                                                {tp.isDownloaded ? 'محلي' : 'سحابي'}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {tp.isDownloaded ? (
                                              <>
                                                {onOpenTopicFromLibrary && (
                                                  <button
                                                    type="button"
                                                    onClick={() => onOpenTopicFromLibrary(tp.id)}
                                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]"
                                                  >
                                                    فتح
                                                  </button>
                                                )}
                                              </>
                                            ) : (
                                              <button
                                                type="button"
                                                disabled={tpBusy}
                                                onClick={() =>
                                                  void handleDownloadTarget('topic', tp.id)
                                                }
                                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] flex items-center gap-1 disabled:opacity-50"
                                              >
                                                <Download className="w-3 h-3" />
                                                <span>تنزيل</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              disabled={tpBusy}
                                              aria-label="حذف الموضوع"
                                              title="حذف الموضوع"
                                              onClick={() =>
                                                setPendingDeleteTarget({
                                                  targetType: 'topic',
                                                  targetId: tp.id,
                                                  titleLabel: tp.titleAr || tp.titleEn,
                                                  isDownloaded: tp.isDownloaded
                                                })
                                              }
                                              className="min-h-[34px] min-w-[34px] p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center disabled:opacity-50"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Academic Books & PDF References Section */}
            {filteredCloudBooks.length > 0 && (
              <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    <span>الكتب والمراجع ({filteredCloudBooks.length})</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {filteredCloudBooks.map((bk) => {
                    const bkBusy = busyTargetKey === `book:${bk.id}`;
                    return (
                      <div
                        key={bk.id}
                        className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                            {bk.titleAr || bk.titleEn}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                            {bk.authorsLabel} · {bk.fileFormat.toUpperCase()} · {bk.sizeLabel}
                            {bk.readingProgressPercent ? ` · ${bk.readingProgressPercent}%` : ''} ·{' '}
                            <span
                              className={
                                bk.isDownloaded
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {bk.isDownloaded ? 'محلي' : 'سحابي'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {bk.isDownloaded && (
                            <button
                              type="button"
                              onClick={() => {
                                toggleBookFavorite(bk.id);
                                setSyncRevision((prev) => prev + 1);
                                onBackupNowTriggered?.('تحديث مفضلة الكتاب');
                              }}
                              aria-label="مفضلة الكتاب"
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  bk.favorite
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-400'
                                }`}
                              />
                            </button>
                          )}
                          {bk.isDownloaded ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenCloudBook(bk)}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs whitespace-nowrap shrink-0"
                            >
                              فتح
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={bkBusy}
                              onClick={() => void handleDownloadTarget('book', bk.id)}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>تنزيل</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={bkBusy}
                            aria-label="حذف الكتاب"
                            title="حذف الكتاب"
                            onClick={() =>
                              setPendingDeleteTarget({
                                targetType: 'book',
                                targetId: bk.id,
                                titleLabel: bk.titleAr || bk.titleEn,
                                isDownloaded: bk.isDownloaded
                              })
                            }
                            className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-center disabled:opacity-50 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cloud Dictionary & Lexicon Pack (Manual Download Only) */}
            {(cloudSummary.cloudDictionaryTotalCount || 0) > 0 && (
              <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-between gap-2.5 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-extrabold text-slate-900 dark:text-white leading-snug">
                      قاموس المصطلحات السحابي
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {cloudSummary.cloudDictionaryDownloadedCount || 0}/
                      {cloudSummary.cloudDictionaryTotalCount || 0} عنصر ·{' '}
                      <span
                        className={
                          (cloudSummary.cloudDictionaryDownloadedCount || 0) >=
                          (cloudSummary.cloudDictionaryTotalCount || 0)
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {(cloudSummary.cloudDictionaryDownloadedCount || 0) >=
                        (cloudSummary.cloudDictionaryTotalCount || 0)
                          ? 'محلي'
                          : 'سحابي'}
                      </span>
                    </div>
                  </div>
                  {(cloudSummary.cloudDictionaryDownloadedCount || 0) <
                    (cloudSummary.cloudDictionaryTotalCount || 0) && (
                    <button
                      type="button"
                      disabled={busyTargetKey === 'dictionary:all'}
                      onClick={() => void handleDownloadTarget('dictionary', 'all')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Academic Exam Packages Section */}
            {filteredCloudExams.length > 0 && (
              <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-emerald-500" />
                    <span>الاختبارات التقييمية ({filteredCloudExams.length})</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredCloudExams.map((ex) => {
                    const qCount = ex.questions?.length || ex.questionIds?.length || 0;
                    const passPct = ex.passingScorePercent ?? ex.passingPercent;
                    const isExDownloaded = Boolean(
                      cloudSummary.downloadedExamIds?.includes(ex.id)
                    );
                    const exBusy = busyTargetKey === `exam:${ex.id}`;
                    return (
                      <div
                        key={ex.id}
                        className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="font-extrabold text-slate-900 dark:text-white leading-snug break-words">
                            {ex.titleAr || ex.titleEn}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                            {qCount > 0 ? `${qCount} سؤال` : 'اختبار مقرر'}
                            {ex.durationMinutes ? ` · ${ex.durationMinutes} د` : ''}
                            {typeof passPct === 'number' ? ` · نجاح ${passPct}%` : ''} ·{' '}
                            <span
                              className={
                                isExDownloaded
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {isExDownloaded ? 'محلي' : 'سحابي'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isExDownloaded ? (
                            <button
                              type="button"
                              onClick={() => setActiveExamModal(ex)}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs whitespace-nowrap shrink-0"
                            >
                              بدء الاختبار
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={exBusy}
                              onClick={() => void handleDownloadTarget('exam', ex.id)}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>تنزيل</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={exBusy}
                            onClick={() =>
                              setPendingDeleteTarget({
                                targetType: 'exam',
                                targetId: ex.id,
                                titleLabel: ex.titleAr || ex.titleEn,
                                isDownloaded: isExDownloaded
                              })
                            }
                            className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 font-extrabold text-xs flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auto-Discovered Extensible Catalog Collections (generic_card fallback) */}
            {filteredDynamicCollections.length > 0 && (
              <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-500" />
                    <span>مجموعات مكتشفة تلقائياً ({filteredDynamicCollections.length})</span>
                  </span>
                </div>

                <div className="space-y-2.5">
                  {filteredDynamicCollections.map((col) => (
                    <div
                      key={col.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {col.displayNameAr || col.displayNameEn || col.name || col.id}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {col.items.length} عنصر · {col.contentType}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {col.items.map((item) => {
                          const extHref = item.downloadUrl || item.rawUrl || item.url || '';
                          const cacheKey = extHref
                            ? `idb-${computeDeterministicFastHashHex(extHref).slice(0, 16)}`
                            : '';
                          const cacheBusy = busyTargetKey === `dyn:${col.id}:${item.id}`;
                          return (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5 text-xs"
                            >
                              <div className="font-extrabold text-slate-900 dark:text-white break-words">
                                {item.titleAr || item.titleEn || item.id}
                              </div>
                              {(item.summaryAr || item.summaryEn || item.descriptionAr || item.descriptionEn) && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                  {item.summaryAr || item.summaryEn || item.descriptionAr || item.descriptionEn}
                                </p>
                              )}
                              <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-400">
                                <span className="truncate">
                                  {(item.tags || []).slice(0, 3).join(' · ') || col.id}
                                </span>
                                {extHref && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={cacheBusy}
                                      onClick={async () => {
                                        if (!cacheKey) return;
                                        setBusyTargetKey(`dyn:${col.id}:${item.id}`);
                                        try {
                                          const cached = await downloadRemoteMediaToOfflineCache({
                                            url: extHref,
                                            id: cacheKey,
                                            fileName: `${item.id}`,
                                            mimeType: item.mimeType
                                          });
                                          showToast?.(
                                            cached.success
                                              ? 'تم حفظ العنصر للعمل دون إنترنت'
                                              : cached.errorAr || cached.messageAr || 'تعذر حفظ العنصر',
                                            cached.success ? undefined : 'info'
                                          );
                                        } finally {
                                          setBusyTargetKey(null);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold whitespace-nowrap"
                                      title="تنزيل أوفلاين"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>أوفلاين</span>
                                    </button>
                                    <a
                                      href={extHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap shrink-0"
                                    >
                                      <span>فتح</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
          MODE 3: ORGANIZED DATA ENTRY & LOCAL UPLOAD HUB (POPUP LAUNCHERS)
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
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    إدخال ورفع وإدارة البيانات
                  </h2>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    اختر العملية المطلوبة لفتح نافذتها المخصصة
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.jsonl,.csv,.tsv,.txt,.md,.zip,.umedpack"
                onChange={handleFileUpload}
                className="hidden"
              />
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

            {lastDataSummary && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                <span className="text-emerald-700 dark:text-emerald-400">
                  {lastDataSummary.sourceLabel}: {lastDataSummary.shortText}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {lastDataSummary.sizeKB} KB
                </span>
              </div>
            )}

            {/* 5 Dedicated Popup Launcher Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Popup Option 1: AI Prompt Configurator & Generator */}
              <button
                type="button"
                onClick={() => setIsAiGuideOpen(true)}
                className="group p-4 rounded-2xl border-2 border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 text-right transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold">
                    ChatGPT & Gemini
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    إعداد وتوليد برومبت الذكاء الاصطناعي
                  </h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                    اختر بلوكاً ومادة محليين لتوليد موضوع، أو أنشئ دفعة مصطلحات مستقلة للقاموس العام
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
              </button>

              {/* Popup Option 2: Upload Local File / ZIP / Backup */}
              <button
                type="button"
                onClick={() => setActiveIngestModal('file_upload')}
                className="group p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50/70 dark:bg-slate-950/60 text-right transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold font-mono">
                    JSON · ZIP · MD · CSV · TXT
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    رفع واستيراد ملف محلي أو نسخة سابقة
                  </h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                    قراءة جميع أنواع ملفات البيانات والأرشيفات المضغوطة والنسخ الاحتياطية السابقة
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
              </button>

              {/* Popup Option 3: Paste AI Text / Code / High-Density Stream */}
              <button
                type="button"
                onClick={() => setActiveIngestModal('paste_text')}
                className="group p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50/70 dark:bg-slate-950/60 text-right transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold">
                    نصوص وأكواد AI
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    لصق وتحليل نصوص أو أكواد الذكاء الاصطناعي
                  </h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                    لصق أكواد JSON أو نصوص عالية الكثافة (||) أو جداول Markdown لآلاف المصطلحات والمواضيع
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Wand2 className="w-5 h-5" />
                </div>
              </button>

              {/* Popup Option 4: Quick Manual Term Entry */}
              <button
                type="button"
                onClick={() => setActiveIngestModal('manual_term')}
                className="group p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 bg-slate-50/70 dark:bg-slate-950/60 text-right transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold">
                    إدخال يدوي سريع
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    إضافة مصطلح يدوياً للقاموس
                  </h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                    إضافة سريعة للمصطلح بالإنجليزية وترجمته العربية مع ترجمة تلقائية وحقول اختيارية
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
              </button>

              {/* Popup Option 5: Permanent Data Deletion Manager */}
              <button
                type="button"
                onClick={() => setActiveIngestModal('permanent_delete')}
                className="sm:col-span-2 group p-4 rounded-2xl border border-rose-500/30 hover:border-rose-500 bg-rose-500/5 hover:bg-rose-500/10 text-right transition-all flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-sm font-extrabold text-rose-800 dark:text-rose-300">
                    الحذف النهائي للبيانات (من التطبيق والسحابة)
                  </h3>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    حذف أي بلوك أو مادة أو موضوع أو كتاب أو اختبار نهائياً من الجهاز ومن المكتبة السحابية
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
              </button>
            </div>
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

      {/* ====================================================================
          POPUP MODALS FOR DATA ENTRY, UPLOAD, PASTE & PERMANENT DELETION
         ==================================================================== */}

      {/* 1. Popup Modal: Manual Term Entry */}
      {activeIngestModal === 'manual_term' && (
        <div
          onClick={() => setActiveIngestModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    إضافة مصطلح يدوياً
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    جميع الحقول اختيارية ما عدا المصطلح بالإنجليزية والعربية
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveIngestModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {offlineFeedback && (
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
                  offlineFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <span>{offlineFeedback.message}</span>
                <button type="button" onClick={() => setOfflineFeedback(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleSaveManualEntry} noValidate className="space-y-3.5">
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
                    ref={manualTermInputRef}
                    type="text"
                    dir="ltr"
                    value={manualTerm}
                    onChange={(e) => {
                      setManualTerm(e.target.value);
                      if (offlineFeedback) setOfflineFeedback(null);
                    }}
                    onInput={(e) => {
                      setManualTerm((e.target as HTMLInputElement).value);
                      if (offlineFeedback) setOfflineFeedback(null);
                    }}
                    placeholder="e.g., Cardiomyopathy"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-mono font-bold text-left focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block">
                    الترجمة بالعربية *
                  </label>
                  <input
                    ref={manualTranslationInputRef}
                    type="text"
                    value={manualTranslation}
                    onChange={(e) => {
                      setManualTranslation(e.target.value);
                      if (offlineFeedback) setOfflineFeedback(null);
                    }}
                    onInput={(e) => {
                      setManualTranslation((e.target as HTMLInputElement).value);
                      if (offlineFeedback) setOfflineFeedback(null);
                    }}
                    placeholder="اكتب الترجمة بالعربية..."
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addAlsoToFavorites}
                      onChange={(e) => setAddAlsoToFavorites(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>إضافة للمفضلة</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowOptionalManualFields((prev) => !prev)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        showOptionalManualFields ? 'rotate-180' : ''
                      }`}
                    />
                    <span>
                      {showOptionalManualFields
                        ? 'إخفاء الحقول الاختيارية'
                        : 'حقول إضافية (اختياري)'}
                    </span>
                  </button>
                </div>

                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ المصطلح</span>
                </button>
              </div>

              {showOptionalManualFields && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                        المجلد (اختياري)
                      </label>
                      <input
                        type="text"
                        value={manualCollection}
                        onChange={(e) => setManualCollection(e.target.value)}
                        placeholder="مضاف يدوياً"
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                      التعريف (اختياري)
                    </label>
                    <textarea
                      rows={2}
                      value={manualDefAr}
                      onChange={(e) => setManualDefAr(e.target.value)}
                      placeholder="تعريف مختصر (اختياري)..."
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
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
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 2. Popup Modal: Local File & Previous Backup Upload */}
      {activeIngestModal === 'file_upload' && (
        <div
          onClick={() => setActiveIngestModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    رفع واستيراد ملف محلي أو نسخة سابقة
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    يدعم ملفات JSON و JSONL و ZIP و UMEDPACK و Markdown و CSV و TXT
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportCapabilities(true)}
                className="min-h-[40px] px-3 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[11px] font-extrabold inline-flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                <span>دليل ما يمكن استيراده</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveIngestModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {offlineFeedback && (
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
                  offlineFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <span>{offlineFeedback.message}</span>
                <button type="button" onClick={() => setOfflineFeedback(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isParsingFile}
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-6 rounded-2xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 text-center flex flex-col items-center justify-center gap-2.5 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {isParsingFile ? 'جاري قراءة وتحليل الملف...' : 'اضغط لاختيار ملف من جهازك'}
                </h4>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  ملفات الذكاء الاصطناعي (.json / .md / .csv / .txt) أو أرشيفات (.zip / .umedpack) أو النسخ الاحتياطية السابقة
                </p>
              </div>
            </button>

            {stagedItems.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                    المصطلحات الجاهزة للحفظ ({stagedItems.filter((i) => i.selected !== false).length}):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      handleCommitStagedBatch();
                      setActiveIngestModal(null);
                    }}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ الكل</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Popup Modal: Paste AI Text / Code / High-Density Stream */}
      {activeIngestModal === 'paste_text' && (
        <div
          onClick={() => setActiveIngestModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[88dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    لصق وتحليل نصوص وأكواد الذكاء الاصطناعي
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    يقرأ تلقائياً كود JSON أو الأسطر عالية الكثافة (||) أو جداول Markdown أو النسخ السابقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportCapabilities(true)}
                className="min-h-[40px] px-3 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[11px] font-extrabold inline-flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                <span>دليل ما يمكن استيراده</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveIngestModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {offlineFeedback && (
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold ${
                  offlineFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <span>{offlineFeedback.message}</span>
                <button type="button" onClick={() => setOfflineFeedback(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="space-y-3">
              <textarea
                rows={8}
                dir="auto"
                value={rawBatchInput}
                onChange={(e) => setRawBatchInput(e.target.value)}
                placeholder={`الصق هنا مخرجات ChatGPT أو Gemini:\n- كائن أو مصفوفة JSON لبلوكات ومواد ومواضيع ومصطلحات\n- أو أسطر عالية الكثافة: TERM || ... / TOPIC || ... / BLOCK || ...\n- أو جداول Markdown: | Term | Translation | Definition |`}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono leading-relaxed"
              />

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setActiveIngestModal(null);
                    setIsAiGuideOpen(true);
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>فتح مولّد البرومبت</span>
                </button>

                <button
                  type="button"
                  onClick={() => parseRawTextToStaged(rawBatchInput, 'نص ملصق من الذكاء الاصطناعي')}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>تحليل واستيراد البيانات الآن</span>
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
                      onClick={() => {
                        handleCommitStagedBatch();
                        setActiveIngestModal(null);
                      }}
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        حفظ الكل ({stagedItems.filter((i) => i.selected !== false).length})
                      </span>
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {stagedItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
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
                              className="font-mono font-extrabold text-xs text-slate-900 dark:text-white"
                            >
                              {item.term}
                            </span>
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {item.translation}
                            </span>
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Popup Modal: Permanent Deletion Manager (Blocks, Subjects, Topics, Books, Exams, All Data) */}
      {activeIngestModal === 'permanent_delete' && (
        <div
          onClick={() => setActiveIngestModal(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[88dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    الحذف النهائي للبيانات (من التطبيق والسحابة)
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    يحذف البلوك أو المادة أو الموضوع نهائياً من التخزين المحلي ومن المكتبة السحابية
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveIngestModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Blocks List for Permanent Deletion */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                البلوكات الأكاديمية وما يتبعها ({cloudSummary.blocks.length})
              </h4>
              {cloudSummary.blocks.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 text-center">
                  لا توجد بلوكات مسجلة حالياً.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {cloudSummary.blocks.map((blk) => (
                    <div
                      key={blk.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {blk.titleAr || blk.titleEn}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                          {blk.code} · {blk.subjects.length} مادة · {blk.totalTopicsCount} موضوع
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteTarget({
                            targetType: 'block',
                            targetId: blk.id,
                            titleLabel: blk.titleAr || blk.titleEn,
                            isDownloaded: Boolean(blk.isDownloaded || blk.isPartiallyDownloaded)
                          })
                        }
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف نهائي</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Wipe All Data Permanently Option */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-rose-700 dark:text-rose-400">
                  تصفير وحذف جميع البيانات نهائياً
                </div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  حذف جميع البلوكات والمواد والمواضيع والمصطلحات والكتب والاختبارات من التطبيق والسحابة
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPendingDeleteTarget({
                    targetType: 'all_data',
                    targetId: 'all',
                    titleLabel: 'جميع بيانات التطبيق والمكتبة السحابية بالكامل',
                    isDownloaded: true
                  })
                }
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف كل البيانات نهائياً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Popup Modal: Delete Confirmation (Local Only vs Permanent App + Cloud) */}
      {pendingDeleteTarget && (
        <div
          onClick={() => setPendingDeleteTarget(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    تأكيد حذف البيانات
                  </h3>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5 break-words">
                    {pendingDeleteTarget.titleLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteTarget(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
              {pendingDeleteTarget.targetType === 'block'
                ? 'اختر نوع الحذف المطلوب لهذا البلوك وما يتبعه من مواد ومواضيع وكتب واختبارات:'
                : 'اختر نوع الحذف المطلوب:'}
            </p>

            <div className="space-y-2.5">
              {pendingDeleteTarget.isDownloaded &&
                pendingDeleteTarget.targetType !== 'all_data' && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteTargetLocally(
                        pendingDeleteTarget.targetType as
                          | 'block'
                          | 'subject'
                          | 'topic'
                          | 'book'
                          | 'exam',
                        pendingDeleteTarget.targetId
                      )
                    }
                    className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-amber-500 bg-slate-50 dark:bg-slate-950 text-right space-y-0.5 transition-colors"
                  >
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                      1. حذف النسخة المحلية فقط (توفير المساحة)
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      يزيل الملفات من جهازك مع بقاء العنصر متاحاً في المكتبة السحابية لإعادة تنزيله لاحقاً
                    </div>
                  </button>
                )}

              <button
                type="button"
                onClick={() =>
                  void handleDeleteTargetPermanently(
                    pendingDeleteTarget.targetType,
                    pendingDeleteTarget.targetId
                  )
                }
                className="w-full p-3.5 rounded-2xl border border-rose-500/40 hover:border-rose-500 bg-rose-600 hover:bg-rose-500 text-white text-right space-y-0.5 transition-colors shadow-sm"
              >
                <div className="text-xs font-extrabold flex items-center justify-between">
                  <span>حذف نهائي من التطبيق والسحابة</span>
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="text-[11px] font-bold text-rose-100">
                  يحذف العنصر وجميع متعلقاته نهائياً من التطبيق ومن فهرس المكتبة السحابية
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportCapabilities && (
        <div onClick={() => setShowImportCapabilities(false)} className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="umedt-import-capabilities-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 id="umedt-import-capabilities-title" className="text-base font-extrabold text-slate-900 dark:text-white">دليل إمكانات القراءة والاستيراد في UMEDT</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">يوضح الدليل أنواع الملفات والبيانات التي يستطيع التطبيق قراءتها، مع بيان حدود الاستخراج الفعلية.</p>
              </div>
              <button type="button" onClick={() => setShowImportCapabilities(false)} className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0" aria-label="إغلاق"><X className="w-4 h-4" /></button>
            </div>
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">1. صيغ الملفات المقروءة</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ['PDF','استخراج النص والصفحات والجداول النصية الممكنة. PDF المصور قد يحتاج OCR أو تحليلاً بصرياً خارجياً.'],
                  ['DOCX','قراءة نص مستند Word والفقرات والجداول.'],
                  ['XLSX','قراءة أوراق العمل والخلايا والجداول من Excel.'],
                  ['CSV / TSV','قراءة الصفوف والأعمدة والبيانات المفصولة.'],
                  ['TXT / MD','قراءة النصوص والعناوين والقوائم وجداول Markdown والبنية الهرمية.'],
                  ['JSON / JSONL','قراءة كائنات ومصفوفات JSON وسجلات JSONL وقوالب UMEDT.'],
                  ['ZIP / UMEDPACK','فحص الأرشيف واستخراج ملفات البيانات والوسائط المسموح بها ضمن حدود الأمان.'],
                  ['JPG / PNG','قراءة ملف الصورة وحفظ بياناته؛ لا يعني ذلك إجراء OCR محلي تلقائياً.']
                ].map(([format,description]) => <div key={format} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 space-y-1"><div className="text-xs font-extrabold text-sky-700 dark:text-sky-300">{format}</div><p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{description}</p></div>)}
              </div>
              <p className="text-[11px] font-bold rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 p-3">SQLite (.db / .sqlite) غير مدعوم كصيغة استيراد للمستخدم. كما تُرفض الملفات التنفيذية أو النشطة داخل الأرشيفات لأسباب أمنية.</p>
            </section>
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">2. سجلات البيانات التي يتعرف عليها المستورد</h4>
              <div className="flex flex-wrap gap-2">
                {['Medical Blocks — البلوكات','Medical Subjects — المواد','Topics — المواضيع','Topic Sections — أقسام الموضوع','Content Blocks — مكونات المحتوى','Terms — المصطلحات','Sentences — الجمل والأمثلة','Morphological Affixes — البادئات والجذور واللواحق','Clinical Abbreviations — الاختصارات','Quiz Questions — أسئلة الاختبارات','Exam Packages — حزم الاختبارات','Academic Books — الكتب والمراجع','Media Assets — الوسائط','User Study Notes — الملاحظات','Quiz Attempts — محاولات الاختبار','Study Statistics — إحصاءات الدراسة','Dynamic Catalogs — القوائم المخصصة'].map((item) => <span key={item} className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200">{item}</span>)}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">يمكن ربط المواضيع بالبلوكات والمواد، مع الاحتفاظ بالمعرّفات والروابط عند وجودها في الحزمة المتوافقة.</p>
            </section>
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">3. مكونات الموضوع والوسائط</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  ['النصوص والعناوين','عناوين عربية وإنجليزية، عناوين فرعية، فقرات وقوائم.'],
                  ['الجداول والبيانات','جداول منظمة وصفوف وأعمدة وبيانات مقارنة.'],
                  ['الصور والرسوم','صور وروابط صور ووسائط مرفقة بالحزمة.'],
                  ['الصوت والفيديو','روابط وملفات صوت وفيديو بحسب صيغة الوسيط ومصدره.'],
                  ['PDF والمرفقات','ملفات PDF ومستندات ومرفقات مرتبطة بالموضوع.'],
                  ['الروابط الخارجية','روابط المراجع والمصادر والمواقع التعليمية.'],
                  ['الأسئلة والاختبارات','MCQ والخيارات والإجابات والتفسيرات عند تمثيلها في البيانات.'],
                  ['العناصر السريرية','مصطلحات واختصارات وأمثلة وجمل وملاحظات سريرية منظمة.']
                ].map(([heading,description]) => <div key={heading} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3"><div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{heading}</div><p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p></div>)}
              </div>
              <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300 rounded-xl bg-amber-500/10 p-3">قراءة الملف لا تعني تحويل كل محتوياته تلقائياً إلى عناصر مستقلة. الصور المضمنة في PDF أو مستندات Office، والوسائط غير القابلة للاستخراج، قد تتطلب ملفات أو روابط منفصلة أو معالجة إضافية. يعرض التطبيق تحذيرات عند تعذر استخراج جزء من المحتوى.</p>
            </section>
            <div className="flex justify-end"><button type="button" onClick={() => setShowImportCapabilities(false)} className="min-h-[42px] px-5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold">فهمت</button></div>
          </section>
        </div>
      )}

      <AiContentGuideModal
        isOpen={isAiGuideOpen}
        onClose={() => setIsAiGuideOpen(false)}
        onOpenPasteModal={() => setActiveIngestModal('paste_text')}
        onOpenUploadModal={() => setActiveIngestModal('file_upload')}
        showToast={showToast}
      />

      {activeExamModal && (
        <QuizCenterModal
          isOpen={true}
          onClose={() => setActiveExamModal(null)}
          blocks={loadMedicalBlocks()}
          subjects={loadMedicalSubjects()}
          topics={topics}
          terms={terms}
          questions={loadQuizQuestions(topics, terms)}
          attempts={loadQuizAttempts()}
          initialBlockId={activeExamModal.blockId || null}
          initialSubjectId={activeExamModal.subjectId || null}
          initialTopicId={activeExamModal.topicIds?.[0] || null}
          initialExam={activeExamModal}
          onSaveQuestions={(nextQ) => saveQuizQuestions(nextQ)}
          onDeleteQuestion={(qId) => {
            const current = loadQuizQuestions(topics, terms);
            saveQuizQuestions(current.filter((item) => item.id !== qId));
          }}
          onSaveAttempt={(attempt) => saveQuizAttempt(attempt)}
          onOpenTermDetail={(termId) => {
            setActiveExamModal(null);
            onOpenTermDetail(termId);
          }}
          showToast={(msg, tp) => showToast?.(msg, tp)}
        />
      )}

      {bookPdfPreview && (
        <div
          onClick={closeBookPdfPreview}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[86dvh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                {bookPdfPreview.title}
              </h3>
              <button
                type="button"
                onClick={closeBookPdfPreview}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              src={bookPdfPreview.url}
              title={bookPdfPreview.title}
              className="flex-1 w-full bg-slate-100 dark:bg-slate-950 border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};
