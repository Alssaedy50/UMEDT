import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  ArrowRight,
  Star,
  Volume2,
  BookOpen,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Trash2,
  Edit3,
  X,
  Sparkles,
  Stethoscope,
  Cpu,
  Code2,
  Globe,
  Clock,
  Eye,
  Upload,
  Layers,
  FolderKanban,
  GraduationCap,
  History,
  BookmarkCheck,
  ListFilter,
  SlidersHorizontal,
  MoreHorizontal,
  ChevronDown,
  Check
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  TopicCategory,
  TopicSection,
  TopicImageItem,
  TopicLinkItem,
  TopicAttachmentItem,
  TermExample,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord,
  RecentLearningItem,
  StudiedTermLogEntry
} from '../types/lexicon';
import { TOPIC_CATEGORY_META } from '../data/topicsSeedData';
import {
  EXTRA_LINKABLE_ALIASES,
  CLINICAL_ABBREVIATIONS
} from '../data/medicalLexiconData';
import {
  extractDetailedTermMatchesFromText,
  extractAllTopicMatchesFromText,
  extractLinkedTermsFromText
} from '../engine/knowledgeLinker';
import {
  runHybridGcNmtPipeline,
  decomposeMedicalWord,
  translateWithGeminiAI,
  lookupQuickWordOrPhraseAr,
  extractInlineBilingualPairsFromText,
  buildEnglishInflectionCandidates
} from '../engine/hybridTranslator';
import {
  loadMedicalBlocks,
  saveMedicalBlocks,
  loadMedicalSubjects,
  saveMedicalSubjects,
  enrichAllTopicsWithHierarchy,
  syncContentBlocksToLegacyTopicFields,
  loadRecentLearningItems,
  recordRecentLearningItem,
  loadStudiedTermsLog,
  recordStudiedTermEvent
} from '../services/learningHierarchyService';
import {
  loadQuizQuestions,
  saveQuizQuestions,
  loadQuizAttempts,
  saveQuizAttempt
} from '../services/quizEngineService';
import {
  SectionContentBlocksRenderer,
  SectionContentBlocksEditor
} from './TopicContentBlockEditor';
import { QuizCenterModal } from './QuizCenterModal';
import { GranularExportModal } from './GranularExportModal';
import { enqueueEntitiesForCloudSync } from '../services/cloudLibrarySyncService';
import {
  prepareAndDownloadFile,
  base64ToUint8Array
} from '../utils/downloadHelper';

interface TopicsHubProps {
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  initialTopicId?: string | null;
  onInitialTopicConsumed?: () => void;
  onSaveTopic: (topic: TopicArticle, isEdit: boolean) => void;
  onDeleteTopic: (topicId: string) => void;
  onToggleFavoriteTopic: (topicId: string, e?: React.MouseEvent) => void;
  onToggleFavoriteTerm?: (termId: string, e?: React.MouseEvent) => void;
  onOpenTermDetail: (termId: string) => void;
  onSaveNewTermFromTopic: (
    newTerm: DictionaryTerm,
    newLinkedSentences: LinkedSentence[]
  ) => void;
  onAddSentenceToExistingTerm: (termId: string, example: TermExample) => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
  onHierarchyChanged?: (reason: string) => void;
  showToast: (message: string, type?: string) => void;
}

interface SelectionInspectionState {
  selectedText: string;
  quotedSentenceEn: string;
  quotedSentenceAr: string;
  matchedTerm: DictionaryTerm | null;
  suggestedTranslationAr: string;
  suggestedDefinitionAr: string;
  suggestedPhonetic: string;
  suggestedPos: string;
  morphologySummary?: string;
}

type HubPopupModal =
  | null
  | 'filter_hierarchy'
  | 'block_picker'
  | 'subject_picker'
  | 'tools_hub'
  | 'blocks_manager'
  | 'subjects_manager'
  | 'saved_terms'
  | 'recent_activity'
  | 'new_topic_setup';

const CATEGORY_ICON_MAP: Record<
  TopicCategory | 'All',
  React.ComponentType<{ className?: string }>
> = {
  All: Layers,
  Medical: Stethoscope,
  Technology: Code2,
  AI: Cpu,
  History: BookOpen,
  General: Globe
};

function mapTopicCategoryToDictionaryCategory(
  cat: TopicCategory
): DictionaryTerm['category'] {
  if (cat === 'Medical') return 'Medical';
  if (cat === 'AI') return 'AI';
  if (cat === 'Technology') return 'Programming';
  return 'General';
}

function extractContainingSentence(fullText: string, selectedText: string): string {
  const cleanSelected = selectedText.trim();
  if (!cleanSelected) return '';

  const paragraphs = fullText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    if (para.toLowerCase().includes(cleanSelected.toLowerCase())) {
      const rawSentences = para
        .split(/(?<=[.!?؟])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const sent of rawSentences) {
        if (sent.toLowerCase().includes(cleanSelected.toLowerCase())) {
          return sent;
        }
      }
      return para;
    }
  }

  return cleanSelected;
}

export const TopicsHub: React.FC<TopicsHubProps> = ({
  topics: rawTopics,
  terms,
  sentences,
  initialTopicId,
  onInitialTopicConsumed,
  onSaveTopic,
  onDeleteTopic,
  onToggleFavoriteTopic,
  onToggleFavoriteTerm,
  onOpenTermDetail,
  onSaveNewTermFromTopic,
  onAddSentenceToExistingTerm,
  onTriggerTTS,
  onHierarchyChanged,
  showToast
}) => {
  // 1. Hierarchical Platform State
  const [blocks, setBlocks] = useState<MedicalBlock[]>(() => loadMedicalBlocks());
  const [subjects, setSubjects] = useState<MedicalSubject[]>(() =>
    loadMedicalSubjects()
  );

  const topics = useMemo(
    () => enrichAllTopicsWithHierarchy(rawTopics),
    [rawTopics]
  );

  const [quizQuestions, setQuizQuestions] = useState<UnifiedQuizQuestion[]>(() =>
    loadQuizQuestions(rawTopics, terms)
  );
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRecord[]>(() =>
    loadQuizAttempts()
  );
  const [recentLearning, setRecentLearning] = useState<RecentLearningItem[]>(() =>
    loadRecentLearningItems()
  );
  const [studiedTermsLog, setStudiedTermsLog] = useState<StudiedTermLogEntry[]>(
    () => loadStudiedTermsLog()
  );

  useEffect(() => {
    setBlocks(loadMedicalBlocks());
    setSubjects(loadMedicalSubjects());
    setQuizQuestions(loadQuizQuestions(rawTopics, terms));
    setQuizAttempts(loadQuizAttempts());
  }, [rawTopics, terms]);

  // 2. Navigation & Clean Popup Card States
  const [viewMode, setViewMode] = useState<'list' | 'reader' | 'editor'>('list');
  const [activePopup, setActivePopup] = useState<HubPopupModal>(null);

  const [activeBlockFilter, setActiveBlockFilter] = useState<string>('ALL');
  const [activeSubjectFilter, setActiveSubjectFilter] = useState<string>('ALL');
  const [onlyFavoriteTopics, setOnlyFavoriteTopics] = useState<boolean>(false);
  const [savedTermsFilterScope, setSavedTermsFilterScope] = useState<string>('ALL');

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    topics[0]?.id || null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'All'>(
    'All'
  );

  // Popup Cards for Specific Topic (Terms Preview & Quick Actions Menu)
  const [termsPopupTopicId, setTermsPopupTopicId] = useState<string | null>(null);
  const [actionMenuTopicId, setActionMenuTopicId] = useState<string | null>(null);

  // Reader Popup Cards
  const [isTocSheetOpen, setIsTocSheetOpen] = useState<boolean>(false);
  const [isReaderTermsPopupOpen, setIsReaderTermsPopupOpen] = useState<boolean>(false);
  const [isReaderOptionsPopupOpen, setIsReaderOptionsPopupOpen] = useState<boolean>(false);

  // Modals (Quiz Center & Granular Export)
  const [isQuizModalOpen, setIsQuizModalOpen] = useState<boolean>(false);
  const [quizInitialBlockId, setQuizInitialBlockId] = useState<string | null>(null);
  const [quizInitialSubjectId, setQuizInitialSubjectId] = useState<string | null>(
    null
  );
  const [quizInitialTopicId, setQuizInitialTopicId] = useState<string | null>(null);
  const [quizInitialTab, setQuizInitialTab] = useState<
    'runner' | 'builder' | 'history'
  >('runner');

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [exportInitialBlockId, setExportInitialBlockId] = useState<string | null>(
    null
  );
  const [exportInitialSubjectId, setExportInitialSubjectId] = useState<
    string | null
  >(null);
  const [exportInitialTopicId, setExportInitialTopicId] = useState<string | null>(
    null
  );

  // Create/Edit Block or Subject Popup Card
  const [hierarchyModalMode, setHierarchyModalMode] = useState<
    null | 'block' | 'subject'
  >(null);
  const [editingHierarchyId, setEditingHierarchyId] = useState<string | null>(null);
  const [hTitleEn, setHTitleEn] = useState<string>('');
  const [hTitleAr, setHTitleAr] = useState<string>('');
  const [hDescAr, setHDescAr] = useState<string>('');
  const [hCode, setHCode] = useState<string>('');
  const [hParentBlockId, setHParentBlockId] = useState<string>('');

  // Quick Setup Modal State before opening New Topic Editor
  const [setupBlockId, setSetupBlockId] = useState<string>('block-hematology');
  const [setupSubjectId, setSetupSubjectId] = useState<string>('subj-hematology');
  const [setupPickerMode, setSetupPickerMode] = useState<null | 'block' | 'subject'>(null);

  // Block Deletion Safety System State
  const [blockDeleteTarget, setBlockDeleteTarget] = useState<MedicalBlock | null>(null);
  const [blockDeleteMode, setBlockDeleteMode] = useState<'unlink_keep' | 'cascade_all'>('unlink_keep');
  const [blockDeleteConfirmed, setBlockDeleteConfirmed] = useState<boolean>(false);

  // Double-Click / Selection Quick Translation Popup Card State
  const [selectionState, setSelectionState] =
    useState<SelectionInspectionState | null>(null);
  const [editableNewTerm, setEditableNewTerm] = useState<string>('');
  const [editableTranslationAr, setEditableTranslationAr] = useState<string>('');
  const [editableDefinitionAr, setEditableDefinitionAr] = useState<string>('');
  const [editableExampleEn, setEditableExampleEn] = useState<string>('');
  const [editableExampleAr, setEditableExampleAr] = useState<string>('');
  const [editableCategory, setEditableCategory] =
    useState<DictionaryTerm['category']>('Medical');
  const [isRefiningWithAI, setIsRefiningWithAI] = useState<boolean>(false);

  // Rich Publisher / Editor State
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [draftTitleEn, setDraftTitleEn] = useState<string>('');
  const [draftTitleAr, setDraftTitleAr] = useState<string>('');
  const [draftSubtitle, setDraftSubtitle] = useState<string>('');
  const [draftCategory, setDraftCategory] = useState<TopicCategory>('Medical');
  const [draftBlockId, setDraftBlockId] = useState<string>('block-hematology');
  const [draftSubjectId, setDraftSubjectId] = useState<string>('subj-hematology');
  const [draftRelatedTopicIds, setDraftRelatedTopicIds] = useState<string[]>([]);
  const [draftAuthor, setDraftAuthor] = useState<string>('محرر المنظومة المعرفية');
  const [draftSections, setDraftSections] = useState<TopicSection[]>([
    {
      id: 'sec-1',
      headingEn: 'Introduction & Clinical Overview',
      headingAr: 'مقدمة الموضوع والإطار العام',
      heading: 'Introduction & Clinical Overview — مقدمة الموضوع والإطار العام',
      paragraphs: [''],
      contentBlocks: [
        {
          id: 'cb-init-1',
          type: 'paragraph',
          order: 1,
          text: ''
        }
      ]
    }
  ]);
  const [draftImages, setDraftImages] = useState<TopicImageItem[]>([]);
  const [draftLinks, setDraftLinks] = useState<TopicLinkItem[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<TopicAttachmentItem[]>(
    []
  );

  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [newImageCaption, setNewImageCaption] = useState<string>('');
  const [newLinkTitle, setNewLinkTitle] = useState<string>('');
  const [newLinkUrl, setNewLinkUrl] = useState<string>('');
  const [newLinkDesc, setNewLinkDesc] = useState<string>('');
  const [showBulkPasteHelper, setShowBulkPasteHelper] = useState<boolean>(false);
  const [bulkRawArticleText, setBulkRawArticleText] = useState<string>('');

  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const articleProseRef = useRef<HTMLDivElement | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0
  });
  const [saveAlsoAsFavorite, setSaveAlsoAsFavorite] = useState<boolean>(true);

  useEffect(() => {
    if (initialTopicId) {
      setSelectedTopicId(initialTopicId);
      setSelectionState(null);
      setViewMode('reader');
      onInitialTopicConsumed?.();
    }
  }, [initialTopicId, onInitialTopicConsumed]);

  const activeTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || topics[0] || null,
    [topics, selectedTopicId]
  );

  const blockMap = useMemo(
    () => new Map<string, MedicalBlock>(blocks.map((b) => [b.id, b])),
    [blocks]
  );
  const subjectMap = useMemo(
    () => new Map<string, MedicalSubject>(subjects.map((s) => [s.id, s])),
    [subjects]
  );

  // Map each topic ID to its automatically detected dictionary terms (including tables, inflections, synonyms & abbreviations)
  const detectedTermsByTopicId = useMemo(() => {
    const map: Record<string, DictionaryTerm[]> = {};
    const termById = new Map<string, DictionaryTerm>(terms.map((t) => [t.id, t]));
    const termByLower = new Map<string, DictionaryTerm>(
      terms.map((t) => [t.term.trim().toLowerCase(), t])
    );

    for (const topic of topics) {
      const combinedText = [
        topic.titleEn || topic.title,
        topic.titleAr || '',
        topic.subtitle || '',
        ...topic.sections.map((s) => {
          const blocksText = (s.contentBlocks || [])
            .map((cb) => {
              const tableText = [
                ...(cb.tableHeaders || []),
                ...((cb.tableRows || []).flat())
              ].join(' ');
              return `${cb.titleEn || ''} ${cb.titleAr || ''} ${cb.text || ''} ${
                cb.textAr || ''
              } ${tableText}`;
            })
            .join('\n');
          return `${s.headingEn || ''} ${s.headingAr || ''} ${s.heading || ''}\n${(
            s.paragraphs || []
          ).join('\n\n')}\n${blocksText}`;
        }),
        ...topic.images.map((img) => img.caption),
        ...topic.links.map((l) => `${l.title} ${l.description || ''}`)
      ].join('\n\n');

      const matches = extractAllTopicMatchesFromText(combinedText, terms);
      const uniqueTerms: DictionaryTerm[] = [];
      const seenIds = new Set<string>();

      for (const t of terms) {
        if ((t.linkedTopicIds || []).includes(topic.id) && !seenIds.has(t.id)) {
          seenIds.add(t.id);
          uniqueTerms.push(t);
        }
      }

      for (const m of matches) {
        if (!seenIds.has(m.termId)) {
          const found = termById.get(m.termId);
          if (found) {
            seenIds.add(m.termId);
            uniqueTerms.push(found);
          }
        }
      }

      // Also detect clinical abbreviations in topic text whose expansion maps to a registered term
      const abbrTokens = combinedText.match(/\b[A-Za-z][A-Za-z0-9/-]{1,8}\b/g) || [];
      const abbrTokenSet = new Set(abbrTokens.map((tok) => tok.toLowerCase()));
      for (const abbrEntry of CLINICAL_ABBREVIATIONS) {
        const abbrLow = abbrEntry.abbr.toLowerCase();
        if (abbrTokenSet.has(abbrLow) || abbrTokenSet.has(`${abbrLow}s`)) {
          const expTerm = termByLower.get(abbrEntry.defaultExpansionEn.toLowerCase());
          if (expTerm && !seenIds.has(expTerm.id)) {
            seenIds.add(expTerm.id);
            uniqueTerms.push(expTerm);
          }
        }
      }

      map[topic.id] = uniqueTerms;
    }
    return map;
  }, [topics, terms]);

  // Category Counts
  const categoryCounts = useMemo(() => {
    const counts: Record<TopicCategory | 'All', number> = {
      All: topics.length,
      Medical: 0,
      Technology: 0,
      AI: 0,
      History: 0,
      General: 0
    };
    for (const t of topics) {
      if (counts[t.category] !== undefined) {
        counts[t.category] += 1;
      }
    }
    return counts;
  }, [topics]);

  // Filtered Topics
  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return topics.filter((topic) => {
      if (onlyFavoriteTopics && !topic.favorite) {
        return false;
      }
      if (selectedCategory !== 'All' && topic.category !== selectedCategory) {
        return false;
      }
      if (activeBlockFilter !== 'ALL' && topic.blockId !== activeBlockFilter) {
        return false;
      }
      if (
        activeSubjectFilter !== 'ALL' &&
        topic.subjectId !== activeSubjectFilter
      ) {
        return false;
      }
      if (!q) return true;
      const inTitle =
        topic.title.toLowerCase().includes(q) ||
        (topic.titleEn || '').toLowerCase().includes(q) ||
        (topic.titleAr || '').toLowerCase().includes(q);
      const inSubtitle = (topic.subtitle || '').toLowerCase().includes(q);
      const inAuthor = topic.author.toLowerCase().includes(q);
      const inSections = topic.sections.some(
        (s) =>
          (s.heading || '').toLowerCase().includes(q) ||
          (s.headingEn || '').toLowerCase().includes(q) ||
          (s.paragraphs || []).some((p) => p.toLowerCase().includes(q))
      );
      const inDetectedTerms = (detectedTermsByTopicId[topic.id] || []).some(
        (dt) =>
          dt.term.toLowerCase().includes(q) ||
          dt.translation.toLowerCase().includes(q)
      );
      return inTitle || inSubtitle || inAuthor || inSections || inDetectedTerms;
    });
  }, [
    topics,
    onlyFavoriteTopics,
    selectedCategory,
    activeBlockFilter,
    activeSubjectFilter,
    searchQuery,
    detectedTermsByTopicId
  ]);

  // Saved & Topic-Linked Terms
  const topicLinkedAndStudiedTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const list: Array<{
      term: DictionaryTerm;
      topicTitles: string[];
      subjectId?: string;
      blockId?: string;
    }> = [];

    const studiedIdSet = new Set(studiedTermsLog.map((e) => e.termId));

    for (const topic of topics) {
      const detected = detectedTermsByTopicId[topic.id] || [];
      for (const dt of detected) {
        const isSavedFromTopic =
          (dt.collections || []).includes('مستخرج من المواضيع') ||
          (dt.linkedTopicIds || []).includes(topic.id) ||
          dt.favorite ||
          studiedIdSet.has(dt.id);

        if (!isSavedFromTopic && savedTermsFilterScope === 'SAVED_ONLY') {
          continue;
        }

        if (
          savedTermsFilterScope !== 'ALL' &&
          savedTermsFilterScope !== 'SAVED_ONLY' &&
          topic.subjectId !== savedTermsFilterScope &&
          topic.blockId !== savedTermsFilterScope
        ) {
          continue;
        }

        if (
          q &&
          !dt.term.toLowerCase().includes(q) &&
          !dt.translation.toLowerCase().includes(q) &&
          !dt.definitionAr.toLowerCase().includes(q)
        ) {
          continue;
        }

        if (!seen.has(dt.id)) {
          seen.add(dt.id);
          list.push({
            term: dt,
            topicTitles: [topic.titleEn || topic.title],
            subjectId: topic.subjectId,
            blockId: topic.blockId
          });
        } else {
          const existing = list.find((item) => item.term.id === dt.id);
          const tTitle = topic.titleEn || topic.title;
          if (existing && !existing.topicTitles.includes(tTitle)) {
            existing.topicTitles.push(tTitle);
          }
        }
      }
    }

    return list;
  }, [
    topics,
    detectedTermsByTopicId,
    studiedTermsLog,
    savedTermsFilterScope,
    searchQuery
  ]);

  const activeFiltersCount =
    (activeBlockFilter !== 'ALL' ? 1 : 0) +
    (activeSubjectFilter !== 'ALL' ? 1 : 0) +
    (onlyFavoriteTopics ? 1 : 0) +
    (selectedCategory !== 'All' ? 1 : 0);

  const favoriteTopicsCount = useMemo(
    () => topics.filter((t) => t.favorite).length,
    [topics]
  );

  const visibleSubjects = useMemo(
    () =>
      activeBlockFilter === 'ALL'
        ? subjects
        : subjects.filter((s) => s.blockId === activeBlockFilter),
    [subjects, activeBlockFilter]
  );

  const cleanSectionHeading = (raw?: string): string =>
    String(raw || '')
      .replace(/^(?:\d+|[\u0660-\u0669]+)[.)\-:]\s*/, '')
      .trim();

  // Return complete, clean Arabic Block and Subject names without cutting words
  const getShortBlockNameAr = (block?: MedicalBlock): string => {
    if (!block) return '';
    const rawAr = String(block.titleAr || '')
      .replace(/^[.\-_,،؛:\s]+|[.\-_,،؛:\s]+$/g, '')
      .trim();
    const validAr = /[\p{L}\p{N}]/u.test(rawAr) ? rawAr : '';
    return validAr || String(block.titleEn || '').trim() || block.code;
  };

  const getShortSubjectNameAr = (subj?: MedicalSubject): string => {
    if (!subj) return '';
    const rawAr = String(subj.titleAr || '')
      .replace(/^[.\-_,،؛:\s]+|[.\-_,،؛:\s]+$/g, '')
      .trim();
    const validAr = /[\p{L}\p{N}]/u.test(rawAr) ? rawAr : '';
    return validAr || String(subj.titleEn || '').trim() || subj.code;
  };

  const lastReadTopic = useMemo(() => {
    const recentTopicItem = recentLearning.find((item) => item.entityType === 'topic');
    if (!recentTopicItem) return null;
    return topics.find((t) => t.id === recentTopicItem.entityId) || null;
  }, [recentLearning, topics]);

  const openNewTopicSetupModal = () => {
    const defaultBlock =
      activeBlockFilter !== 'ALL'
        ? activeBlockFilter
        : blocks[0]?.id || 'block-hematology';
    const matchingSubj =
      activeSubjectFilter !== 'ALL'
        ? activeSubjectFilter
        : subjects.find((s) => s.blockId === defaultBlock)?.id ||
          subjects[0]?.id ||
          '';
    setSetupBlockId(defaultBlock);
    setSetupSubjectId(matchingSubj);
    setSetupPickerMode(null);
    setActivePopup('new_topic_setup');
  };

  // Open a Topic in Reader and Record in Recent Learning
  const handleOpenTopicInReader = (topic: TopicArticle) => {
    setSelectedTopicId(topic.id);
    setSelectionState(null);
    setActionMenuTopicId(null);
    setTermsPopupTopicId(null);
    setActivePopup(null);
    setViewMode('reader');
    const updatedRecent = recordRecentLearningItem({
      entityType: 'topic',
      entityId: topic.id,
      titleEn: topic.titleEn || topic.title,
      titleAr: topic.titleAr || topic.subtitle || topic.title,
      subtitle: subjectMap.get(topic.subjectId || '')?.titleEn,
      blockId: topic.blockId,
      subjectId: topic.subjectId
    });
    setRecentLearning(updatedRecent);
  };

  // Open Term Detail and Record Studied Term Log
  const handleOpenTermWithStudyLog = (term: DictionaryTerm) => {
    const updatedLog = recordStudiedTermEvent({
      termId: term.id,
      term: term.term,
      translationAr: term.translation,
      topicId: activeTopic?.id,
      subjectId: activeTopic?.subjectId,
      blockId: activeTopic?.blockId,
      action: 'viewed'
    });
    setStudiedTermsLog(updatedLog);
    onOpenTermDetail(term.id);
  };

  // Launch Quiz Center for a specific scope
  const openQuizForScope = (opts?: {
    blockId?: string;
    subjectId?: string;
    topicId?: string;
    tab?: 'runner' | 'builder' | 'history';
  }) => {
    setActivePopup(null);
    setActionMenuTopicId(null);
    setIsReaderOptionsPopupOpen(false);
    setQuizInitialBlockId(opts?.blockId || null);
    setQuizInitialSubjectId(opts?.subjectId || null);
    setQuizInitialTopicId(opts?.topicId || null);
    setQuizInitialTab(opts?.tab || 'runner');
    setIsQuizModalOpen(true);
  };

  // Launch Granular Export Modal for a specific scope
  const openExportForScope = (opts?: {
    blockId?: string;
    subjectId?: string;
    topicId?: string;
  }) => {
    setActivePopup(null);
    setActionMenuTopicId(null);
    setIsReaderOptionsPopupOpen(false);
    setExportInitialBlockId(opts?.blockId || null);
    setExportInitialSubjectId(opts?.subjectId || null);
    setExportInitialTopicId(opts?.topicId || null);
    setIsExportModalOpen(true);
  };

  // Save/Create Medical Block or Subject
  const handleSaveHierarchyEntity = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEn = hTitleEn.trim();
    const cleanAr = hTitleAr.trim();
    if (!cleanEn || !cleanAr) {
      showToast('يرجى إدخال الاسم الإنجليزي والاسم العربي', 'info');
      return;
    }

    const nowIso = new Date().toISOString();

    if (hierarchyModalMode === 'block') {
      const nextBlock: MedicalBlock = {
        id: editingHierarchyId || `block-custom-${Date.now()}`,
        code: (hCode.trim() || 'BLK-MED').toUpperCase(),
        titleEn: cleanEn,
        titleAr: cleanAr,
        descriptionEn: cleanEn,
        descriptionAr: hDescAr.trim() || cleanAr,
        colorAccent: 'emerald',
        order: blocks.length + 1,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const nextBlocks = editingHierarchyId
        ? blocks.map((b) => (b.id === editingHierarchyId ? nextBlock : b))
        : [...blocks, nextBlock];
      setBlocks(nextBlocks);
      saveMedicalBlocks(nextBlocks);
      void enqueueEntitiesForCloudSync({ blocks: [nextBlock] });
      setSetupBlockId(nextBlock.id);
      setDraftBlockId(nextBlock.id);
      const firstSubjInBlock = subjects.find((s) => s.blockId === nextBlock.id);
      setSetupSubjectId(firstSubjInBlock ? firstSubjInBlock.id : '');
      if (firstSubjInBlock) {
        setDraftSubjectId(firstSubjInBlock.id);
      }
      showToast(
        editingHierarchyId
          ? `تم تحديث البلوك "${cleanAr}"`
          : `تم إنشاء البلوك "${cleanAr}"`
      );
      onHierarchyChanged?.(
        editingHierarchyId
          ? `تعديل بلوك: ${cleanAr}`
          : `إضافة بلوك: ${cleanAr}`
      );
    } else if (hierarchyModalMode === 'subject') {
      const nextSubj: MedicalSubject = {
        id: editingHierarchyId || `subj-custom-${Date.now()}`,
        blockId: hParentBlockId || undefined,
        isStandalone: !hParentBlockId,
        code: (hCode.trim() || 'SUBJ').toUpperCase(),
        titleEn: cleanEn,
        titleAr: cleanAr,
        descriptionEn: cleanEn,
        descriptionAr: hDescAr.trim() || cleanAr,
        order: subjects.length + 1,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const nextSubjects = editingHierarchyId
        ? subjects.map((s) => (s.id === editingHierarchyId ? nextSubj : s))
        : [...subjects, nextSubj];
      setSubjects(nextSubjects);
      saveMedicalSubjects(nextSubjects);
      void enqueueEntitiesForCloudSync({ subjects: [nextSubj] });
      if (nextSubj.blockId) {
        setSetupBlockId(nextSubj.blockId);
        setDraftBlockId(nextSubj.blockId);
      }
      setSetupSubjectId(nextSubj.id);
      setDraftSubjectId(nextSubj.id);
      showToast(
        editingHierarchyId
          ? `تم تحديث المادة "${cleanAr}"`
          : `تم إنشاء المادة "${cleanAr}"`
      );
      onHierarchyChanged?.(
        editingHierarchyId
          ? `تعديل مادة: ${cleanAr}`
          : `إضافة مادة: ${cleanAr}`
      );
    }

    setHierarchyModalMode(null);
    setEditingHierarchyId(null);
  };

  const openBlockDeleteSafetyModal = (block: MedicalBlock) => {
    setBlockDeleteTarget(block);
    setBlockDeleteMode('unlink_keep');
    setBlockDeleteConfirmed(false);
  };

  const handleExecuteSafeBlockDelete = () => {
    if (!blockDeleteTarget || !blockDeleteConfirmed) return;
    const targetId = blockDeleteTarget.id;
    const linkedSubjects = subjects.filter((s) => s.blockId === targetId);
    const linkedTopics = topics.filter((t) => t.blockId === targetId);

    // 1. Remove block from blocks list and persist
    const nextBlocks = blocks.filter((b) => b.id !== targetId);
    setBlocks(nextBlocks);
    saveMedicalBlocks(nextBlocks);

    if (blockDeleteMode === 'unlink_keep') {
      // Unlink subjects so they remain standalone
      const nextSubjects = subjects.map((s) =>
        s.blockId === targetId ? { ...s, blockId: undefined, isStandalone: true } : s
      );
      setSubjects(nextSubjects);
      saveMedicalSubjects(nextSubjects);

      // Unlink topics so they remain intact
      for (const tp of linkedTopics) {
        onSaveTopic({ ...tp, blockId: '' }, true);
      }

      showToast(
        `تم حذف البلوك "${blockDeleteTarget.titleAr}" بأمان مع الاحتفاظ بـ ${linkedSubjects.length} مادة و ${linkedTopics.length} موضوع.`
      );
    } else {
      // Cascade delete linked subjects and topics
      const nextSubjects = subjects.filter((s) => s.blockId !== targetId);
      setSubjects(nextSubjects);
      saveMedicalSubjects(nextSubjects);

      for (const tp of linkedTopics) {
        onDeleteTopic(tp.id);
      }

      showToast(
        `تم حذف البلوك "${blockDeleteTarget.titleAr}" مع ${linkedSubjects.length} مادة و ${linkedTopics.length} موضوع مرتبط.`
      );
    }

    if (activeBlockFilter === targetId) {
      setActiveBlockFilter('ALL');
      setActiveSubjectFilter('ALL');
    }
    setBlockDeleteTarget(null);
    setBlockDeleteConfirmed(false);
  };

  const handleDeleteSubjectSafely = (subj: MedicalSubject) => {
    const nextSubjects = subjects.filter((s) => s.id !== subj.id);
    setSubjects(nextSubjects);
    saveMedicalSubjects(nextSubjects);
    if (activeSubjectFilter === subj.id) {
      setActiveSubjectFilter('ALL');
    }
    showToast(`تم حذف المادة "${subj.titleAr}" مع الاحتفاظ بالمواضيع.`);
  };

  // Lookup helper for matching a selected word/phrase (including inflections & abbreviations) to an existing DictionaryTerm
  const findTermForSelectedString = (rawSelection: string): DictionaryTerm | null => {
    const cleaned = rawSelection
      .replace(/^[.,;:!?()[\]{}"'«»“”‘’—–-]+|[.,;:!?()[\]{}"'«»“”‘’—–-]+$/g, '')
      .trim();
    if (!cleaned || cleaned.length < 2) return null;

    const candidates = buildEnglishInflectionCandidates(cleaned);

    for (const cand of candidates) {
      const direct = terms.find(
        (t) =>
          t.term.toLowerCase() === cand ||
          t.translation.trim() === cleaned ||
          (t.relations.synonyms || []).some((syn) => syn.toLowerCase() === cand)
      );
      if (direct) return direct;

      const aliasTargetKey = Object.keys(EXTRA_LINKABLE_ALIASES).find(
        (k) => k.toLowerCase() === cand
      );
      if (aliasTargetKey) {
        const targetId = EXTRA_LINKABLE_ALIASES[aliasTargetKey];
        const aliasTerm = terms.find((t) => t.id === targetId);
        if (aliasTerm) return aliasTerm;
      }

      const abbrEntry = CLINICAL_ABBREVIATIONS.find(
        (a) => a.abbr.toLowerCase() === cand
      );
      if (abbrEntry) {
        const expMatch = terms.find(
          (t) => t.term.toLowerCase() === abbrEntry.defaultExpansionEn.toLowerCase()
        );
        if (expMatch) return expMatch;
      }
    }

    const detailed = extractAllTopicMatchesFromText(cleaned, terms);
    if (detailed.length > 0) {
      const found = terms.find((t) => t.id === detailed[0].termId);
      if (found) return found;
    }

    return null;
  };

  const extractWordAtPoint = (clientX: number, clientY: number): string => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return '';

    const sel = window.getSelection();
    const selStr = sel ? sel.toString().trim() : '';
    if (selStr && selStr.length >= 2) {
      return selStr;
    }

    let textNode: Node | null = null;
    let offset = 0;

    const docWithCaret = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null;
    };

    if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (range) {
        textNode = range.startContainer;
        offset = range.startOffset;
      }
    } else if (typeof docWithCaret.caretPositionFromPoint === 'function') {
      const pos = docWithCaret.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        textNode = pos.offsetNode;
        offset = pos.offset;
      }
    }

    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return '';
    const content = textNode.textContent || '';
    if (!content) return '';

    const wordCharRegex = /[a-zA-Z0-9\u0600-\u06FF'-]/;
    let start = Math.min(offset, content.length - 1);
    let end = start;

    if (
      !wordCharRegex.test(content[start] || '') &&
      start > 0 &&
      wordCharRegex.test(content[start - 1] || '')
    ) {
      start -= 1;
      end = start;
    }

    while (start > 0 && wordCharRegex.test(content[start - 1])) {
      start -= 1;
    }
    while (end < content.length && wordCharRegex.test(content[end])) {
      end += 1;
    }

    return content.slice(start, end).trim();
  };

  const inspectUserSelection = (rawText?: string) => {
    if (!activeTopic) return;

    let selectedStr = rawText ?? '';
    if (!selectedStr && typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      selectedStr = sel ? sel.toString() : '';
    }

    const cleaned = selectedStr
      .replace(/^[.,;:!?()[\]{}"'«»“”‘’—–-]+|[.,;:!?()[\]{}"'«»“”‘’—–-]+$/g, '')
      .trim();

    if (!cleaned || cleaned.length < 2 || cleaned.length > 1500) {
      return;
    }

    const fullArticleCorpus = [
      activeTopic.titleEn || activeTopic.title,
      ...activeTopic.sections.map((s) => {
        const blocksText = (s.contentBlocks || [])
          .map((cb) =>
            [
              cb.titleEn || '',
              cb.titleAr || '',
              cb.text || '',
              cb.textAr || '',
              ...(cb.tableHeaders || []),
              ...((cb.tableRows || []).flat())
            ].join(' ')
          )
          .join('\n');
        return `${s.headingEn || s.heading || ''}.\n${(s.paragraphs || []).join(
          '\n\n'
        )}\n${blocksText}`;
      })
    ].join('\n\n');

    // Collect pre-translated inline bilingual pairs inside the active topic
    const inlinePairs = extractInlineBilingualPairsFromText(fullArticleCorpus);
    if (activeTopic.titleEn && activeTopic.titleAr) {
      inlinePairs[activeTopic.titleEn.trim().toLowerCase()] = activeTopic.titleAr.trim();
    }
    for (const sec of activeTopic.sections) {
      if (sec.headingEn && sec.headingAr) {
        inlinePairs[sec.headingEn.trim().toLowerCase()] = sec.headingAr.trim();
      }
      for (const cb of sec.contentBlocks || []) {
        if (cb.titleEn && cb.titleAr) {
          inlinePairs[cb.titleEn.trim().toLowerCase()] = cb.titleAr.trim();
        }
      }
    }

    const containingSentence = extractContainingSentence(
      fullArticleCorpus,
      cleaned
    );

    const sentenceTranslationResult = runHybridGcNmtPipeline(
      containingSentence,
      terms,
      sentences
    );
    const quotedSentenceAr =
      sentenceTranslationResult.layer4FinalOutputAr || containingSentence;

    const existingTerm = findTermForSelectedString(cleaned);

    if (existingTerm) {
      const updatedLog = recordStudiedTermEvent({
        termId: existingTerm.id,
        term: existingTerm.term,
        translationAr: existingTerm.translation,
        topicId: activeTopic.id,
        subjectId: activeTopic.subjectId,
        blockId: activeTopic.blockId,
        action: 'viewed'
      });
      setStudiedTermsLog(updatedLog);

      setSelectionState({
        selectedText: cleaned,
        quotedSentenceEn: containingSentence,
        quotedSentenceAr,
        matchedTerm: existingTerm,
        suggestedTranslationAr: existingTerm.translation,
        suggestedDefinitionAr: existingTerm.definitionAr,
        suggestedPhonetic: existingTerm.phonetic,
        suggestedPos: existingTerm.pos
      });
      return;
    }

    const morphResult = decomposeMedicalWord(cleaned, terms);
    const hasRealMorphology = Boolean(
      morphResult.prefix ||
        (morphResult.roots && morphResult.roots.length > 0) ||
        morphResult.suffix
    );

    const quickLookup = lookupQuickWordOrPhraseAr(
      cleaned,
      terms,
      [],
      containingSentence,
      inlinePairs
    );

    const morphAr =
      hasRealMorphology &&
      morphResult.synthesizedAr &&
      morphResult.synthesizedAr !== 'مصطلح أحادي الجذر'
        ? morphResult.synthesizedAr
        : '';

    const suggestedTranslation =
      quickLookup?.translationAr || morphAr || '';

    const morphPartsSummary = [
      morphResult.prefix
        ? `سابقة ${morphResult.prefix.affix} (${morphResult.prefix.meaningAr})`
        : null,
      ...(morphResult.roots || []).map(
        (r) => `جذر ${r.affix} (${r.meaningAr})`
      ),
      morphResult.suffix
        ? `لاحقة ${morphResult.suffix.affix} (${morphResult.suffix.meaningAr})`
        : null
    ]
      .filter(Boolean)
      .join(' + ');

    const defaultDefAr = quickLookup?.definitionAr
      ? quickLookup.definitionAr
      : morphPartsSummary
        ? `مصطلح مستخرج من موضوع "${
            activeTopic.titleEn || activeTopic.title
          }" (${morphPartsSummary}).`
        : `مصطلح مستخرج من موضوع "${
            activeTopic.titleEn || activeTopic.title
          }".`;

    const mappedCat = mapTopicCategoryToDictionaryCategory(activeTopic.category);

    setEditableNewTerm(
      quickLookup?.expansionEn
        ? `${cleaned} (${quickLookup.expansionEn})`
        : cleaned
    );
    setEditableTranslationAr(suggestedTranslation);
    setEditableDefinitionAr(defaultDefAr);
    setEditableExampleEn(containingSentence);
    setEditableExampleAr(quotedSentenceAr);
    setEditableCategory(mappedCat);

    setSelectionState({
      selectedText: cleaned,
      quotedSentenceEn: containingSentence,
      quotedSentenceAr,
      matchedTerm: null,
      suggestedTranslationAr: suggestedTranslation,
      suggestedDefinitionAr: defaultDefAr,
      suggestedPhonetic: `/${cleaned.toLowerCase()}/`,
      suggestedPos: cleaned.includes(' ') ? 'phrase' : 'noun',
      morphologySummary: morphPartsSummary || undefined
    });
  };

  const handleRefineUnknownWordWithGemini = async () => {
    if (!selectionState || isRefiningWithAI) return;
    setIsRefiningWithAI(true);
    try {
      const wordRes = await translateWithGeminiAI(
        editableNewTerm,
        [],
        editableTranslationAr || editableNewTerm
      );
      const sentRes = await translateWithGeminiAI(
        editableExampleEn,
        [],
        editableExampleAr || editableExampleEn
      );
      if (wordRes.layer4FinalOutputAr) {
        setEditableTranslationAr(wordRes.layer4FinalOutputAr);
      }
      if (sentRes.layer4FinalOutputAr) {
        setEditableExampleAr(sentRes.layer4FinalOutputAr);
      }
      showToast('تم تحسين الترجمة السياقية للكلمة وجملتها عبر الذكاء الاصطناعي');
    } catch {
      showToast('تعذر الاتصال بالخادم، تم الاعتماد على المحرك الهجين المحلي', 'info');
    } finally {
      setIsRefiningWithAI(false);
    }
  };

  const handleInstantSaveUnknownTerm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = editableNewTerm.trim();
    const cleanTrans = editableTranslationAr.trim();
    if (!cleanTerm || !cleanTrans) {
      showToast('يرجى إدخال المصطلح وترجمته العربية قبل الحفظ', 'info');
      return;
    }

    const newTermId = `topic-term-${Date.now()}`;
    const cleanExEn = editableExampleEn.trim();
    const cleanExAr = editableExampleAr.trim();

    const examples: TermExample[] = cleanExEn
      ? [{ en: cleanExEn, ar: cleanExAr || cleanTrans }]
      : [];

    const relatedIds = extractLinkedTermsFromText(
      `${cleanTerm} ${cleanExEn} ${editableDefinitionAr}`,
      terms
    );
    const relatedNames = relatedIds
      .map((id) => terms.find((t) => t.id === id)?.term)
      .filter((name): name is string => Boolean(name));

    const subjTitle = activeTopic?.subjectId
      ? subjectMap.get(activeTopic.subjectId)?.titleAr
      : undefined;

    const newTermObj: DictionaryTerm = {
      id: newTermId,
      term: cleanTerm,
      termNormalized: cleanTerm.toLowerCase(),
      translation: cleanTrans,
      phonetic: selectionState?.suggestedPhonetic || `/${cleanTerm.toLowerCase()}/`,
      pos: selectionState?.suggestedPos || 'noun',
      category: editableCategory,
      specialty:
        subjTitle ||
        (activeTopic
          ? TOPIC_CATEGORY_META[activeTopic.category].labelAr
          : 'مواضيع ومقالات'),
      keepEnglish: true,
      favorite: saveAlsoAsFavorite,
      collections: [
        'مستخرج من المواضيع',
        ...(subjTitle ? [subjTitle] : [])
      ],
      linkedTopicIds: activeTopic ? [activeTopic.id] : [],
      linkedSubjectIds: activeTopic?.subjectId ? [activeTopic.subjectId] : [],
      linkedBlockIds: activeTopic?.blockId ? [activeTopic.blockId] : [],
      lastStudiedAt: new Date().toISOString(),
      studyCount: 1,
      ingestedAt: `الآن · من موضوع: ${
        activeTopic?.titleEn || activeTopic?.title || 'موضوع'
      }`,
      definitionAr:
        editableDefinitionAr.trim() ||
        `مصطلح معرفي (${cleanTrans}) مضاف من تبويب المواضيع.`,
      definitionEn: cleanExEn || `Contextual term extracted from topic article.`,
      examples,
      relations: {
        synonyms: [],
        broader: [],
        related: relatedNames
      }
    };

    const newLinkedSentences: LinkedSentence[] = cleanExEn
      ? [
          {
            id: `sent-topic-${Date.now()}`,
            en: cleanExEn,
            ar: cleanExAr || cleanTrans,
            category: editableCategory,
            specialty: activeTopic?.titleEn || activeTopic?.title || 'مواضيع',
            sourceType: 'long_text',
            linkedTermIds: [newTermId, ...relatedIds],
            tags: [cleanTerm],
            favorite: false,
            createdAt: 'الآن · مقتبس من موضوع'
          }
        ]
      : [];

    onSaveNewTermFromTopic(newTermObj, newLinkedSentences);

    const updatedLog = recordStudiedTermEvent({
      termId: newTermId,
      term: cleanTerm,
      translationAr: cleanTrans,
      topicId: activeTopic?.id,
      subjectId: activeTopic?.subjectId,
      blockId: activeTopic?.blockId,
      action: 'saved_from_topic'
    });
    setStudiedTermsLog(updatedLog);

    setSelectionState({
      selectedText: cleanTerm,
      quotedSentenceEn: cleanExEn,
      quotedSentenceAr: cleanExAr,
      matchedTerm: newTermObj,
      suggestedTranslationAr: cleanTrans,
      suggestedDefinitionAr: newTermObj.definitionAr,
      suggestedPhonetic: newTermObj.phonetic,
      suggestedPos: newTermObj.pos
    });
  };

  // Start Creating a New Topic
  const openCreateTopicEditor = (opts?: {
    blockId?: string;
    subjectId?: string;
  }) => {
    setActivePopup(null);
    setActionMenuTopicId(null);
    setEditingTopicId(null);
    setDraftTitleEn('');
    setDraftTitleAr('');
    setDraftSubtitle('');
    setDraftCategory(selectedCategory === 'All' ? 'Medical' : selectedCategory);
    const defaultBlock =
      opts?.blockId ||
      (activeBlockFilter !== 'ALL' ? activeBlockFilter : 'block-hematology');
    const defaultSubj =
      opts?.subjectId ||
      (activeSubjectFilter !== 'ALL'
        ? activeSubjectFilter
        : subjects.find((s) => s.blockId === defaultBlock)?.id ||
          'subj-hematology');
    setDraftBlockId(defaultBlock);
    setDraftSubjectId(defaultSubj);
    setDraftRelatedTopicIds([]);
    setDraftAuthor('محرر المنظومة المعرفية');
    setDraftSections([
      {
        id: `sec-${Date.now()}-1`,
        headingEn: 'Introduction & Clinical Overview',
        headingAr: 'مقدمة الموضوع والإطار العام',
        heading: 'Introduction & Clinical Overview — مقدمة الموضوع والإطار العام',
        paragraphs: [''],
        contentBlocks: [
          {
            id: `cb-${Date.now()}-1`,
            type: 'paragraph',
            order: 1,
            text: ''
          }
        ]
      }
    ]);
    setDraftImages([]);
    setDraftLinks([]);
    setDraftAttachments([]);
    setShowBulkPasteHelper(false);
    setBulkRawArticleText('');
    setViewMode('editor');
  };

  // Start Editing an Existing Topic
  const openEditTopicEditor = (topic: TopicArticle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActivePopup(null);
    setActionMenuTopicId(null);
    setIsReaderOptionsPopupOpen(false);
    setEditingTopicId(topic.id);
    setDraftTitleEn(topic.titleEn || topic.title);
    setDraftTitleAr(topic.titleAr || topic.subtitle || '');
    setDraftSubtitle(topic.subtitle || '');
    setDraftCategory(topic.category);
    setDraftBlockId(topic.blockId || 'block-hematology');
    setDraftSubjectId(topic.subjectId || 'subj-hematology');
    setDraftRelatedTopicIds(topic.relatedTopicIds || []);
    setDraftAuthor(topic.author);
    setDraftSections(
      topic.sections.length > 0
        ? topic.sections.map((s) => ({
            id: s.id,
            headingEn: s.headingEn || s.heading || '',
            headingAr: s.headingAr || '',
            heading: s.heading || '',
            paragraphs: [...(s.paragraphs || [])],
            contentBlocks: s.contentBlocks ? [...s.contentBlocks] : undefined
          }))
        : [
            {
              id: `sec-${Date.now()}`,
              headingEn: 'Main Section',
              headingAr: 'المحتوى الرئيسي',
              heading: 'Main Section — المحتوى الرئيسي',
              paragraphs: [''],
              contentBlocks: [
                {
                  id: `cb-${Date.now()}-1`,
                  type: 'paragraph',
                  order: 1,
                  text: ''
                }
              ]
            }
          ]
    );
    setDraftImages([...topic.images]);
    setDraftLinks([...topic.links]);
    setDraftAttachments([...topic.attachments]);
    setShowBulkPasteHelper(false);
    setBulkRawArticleText('');
    setViewMode('editor');
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (dataUrl) {
        setDraftImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}`,
            url: dataUrl,
            caption: file.name.replace(/\.[^/.]+$/, '')
          }
        ]);
        showToast(`تم إرفاق الصورة "${file.name}" في الموضوع`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddImageByUrl = () => {
    const cleanUrl = newImageUrl.trim();
    if (!cleanUrl) return;
    setDraftImages((prev) => [
      ...prev,
      {
        id: `img-${Date.now()}`,
        url: cleanUrl,
        caption: newImageCaption.trim() || 'صورة توضيحية مرفقة بالموضوع'
      }
    ]);
    setNewImageUrl('');
    setNewImageCaption('');
    showToast('تمت إضافة الصورة إلى الموضوع');
  };

  const handleAddReferenceLink = () => {
    const cleanTitle = newLinkTitle.trim();
    const cleanUrl = newLinkUrl.trim();
    if (!cleanTitle || !cleanUrl) return;
    const normalizedUrl =
      cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
        ? cleanUrl
        : `https://${cleanUrl}`;

    setDraftLinks((prev) => [
      ...prev,
      {
        id: `lnk-${Date.now()}`,
        title: cleanTitle,
        url: normalizedUrl,
        description: newLinkDesc.trim() || undefined
      }
    ]);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkDesc('');
    showToast('تمت إضافة الرابط المرجعي إلى الموضوع');
  };

  const handleAttachmentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeLabel =
      file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    const isTextLike =
      file.type.startsWith('text/') ||
      /\.(txt|md|json|csv|sql|xml|html|js|ts|py)$/i.test(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = typeof reader.result === 'string' ? reader.result : '';
      setDraftAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}`,
          fileName: file.name,
          fileSizeLabel: sizeLabel,
          fileType: file.type || 'application/octet-stream',
          contentDataUrlOrText: resultStr
        }
      ]);
      showToast(`تم رفع الملف "${file.name}" (${sizeLabel}) وإرفاقه بالموضوع`);
    };

    if (isTextLike) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSplitBulkTextIntoSections = () => {
    const raw = bulkRawArticleText.trim();
    if (!raw) return;

    const rawBlocks = raw
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (rawBlocks.length === 0) return;

    const generatedSections: TopicSection[] = [];
    let currentHeading = 'Section 1 — القسم الأول';
    let currentParagraphs: string[] = [];

    for (const block of rawBlocks) {
      const isHeadingLine =
        block.startsWith('#') ||
        (block.length < 95 && !block.endsWith('.') && !block.includes('\n'));

      if (isHeadingLine) {
        if (currentParagraphs.length > 0) {
          generatedSections.push({
            id: `sec-${Date.now()}-${generatedSections.length + 1}`,
            headingEn: currentHeading,
            heading: currentHeading,
            paragraphs: [...currentParagraphs],
            contentBlocks: currentParagraphs.map((p, idx) => ({
              id: `cb-${Date.now()}-${generatedSections.length}-${idx}`,
              type: 'paragraph',
              order: idx + 1,
              text: p
            }))
          });
          currentParagraphs = [];
        }
        currentHeading = block.replace(/^#+\s*/, '').trim();
      } else {
        currentParagraphs.push(block);
      }
    }

    if (currentParagraphs.length > 0) {
      generatedSections.push({
        id: `sec-${Date.now()}-${generatedSections.length + 1}`,
        headingEn: currentHeading,
        heading: currentHeading,
        paragraphs: [...currentParagraphs],
        contentBlocks: currentParagraphs.map((p, idx) => ({
          id: `cb-${Date.now()}-${generatedSections.length}-${idx}`,
          type: 'paragraph',
          order: idx + 1,
          text: p
        }))
      });
    }

    if (generatedSections.length > 0) {
      setDraftSections(generatedSections);
      setShowBulkPasteHelper(false);
      setBulkRawArticleText('');
      showToast(
        `تم تقسيم النص الطويل تلقائياً إلى ${generatedSections.length} أقسام منظمة`
      );
    }
  };

  const handlePublishTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitleEn = draftTitleEn.trim();
    const cleanTitleAr = draftTitleAr.trim();

    if (!cleanTitleEn) {
      showToast('يرجى كتابة العنوان الأكاديمي الإنجليزي للموضوع قبل النشر', 'info');
      return;
    }

    const combinedTitle = cleanTitleAr
      ? `${cleanTitleEn} — ${cleanTitleAr}`
      : cleanTitleEn;

    const syncedFields = syncContentBlocksToLegacyTopicFields(
      draftSections,
      draftImages,
      draftLinks,
      draftAttachments
    );

    const totalWords = syncedFields.sections.reduce(
      (acc, s) =>
        acc + (s.paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length,
      0
    );
    const readingTimeMinutes = Math.max(1, Math.ceil(totalWords / 160));

    const finalTopic: TopicArticle = {
      id: editingTopicId || `topic-${Date.now()}`,
      title: combinedTitle,
      titleEn: cleanTitleEn,
      titleAr: cleanTitleAr || draftSubtitle.trim() || cleanTitleEn,
      subtitle: draftSubtitle.trim() || cleanTitleAr || cleanTitleEn,
      category: draftCategory,
      blockId: draftBlockId || undefined,
      subjectId: draftSubjectId || undefined,
      relatedTopicIds: draftRelatedTopicIds,
      author: draftAuthor.trim() || 'محرر المنظومة المعرفية',
      publishedAt: editingTopicId ? 'محدّث الآن' : 'الآن',
      readingTimeMinutes,
      favorite: editingTopicId
        ? Boolean(topics.find((t) => t.id === editingTopicId)?.favorite)
        : false,
      sections: syncedFields.sections,
      images: syncedFields.images,
      links: syncedFields.links,
      attachments: syncedFields.attachments
    };

    onSaveTopic(finalTopic, Boolean(editingTopicId));
    setSelectedTopicId(finalTopic.id);
    setSelectionState(null);
    setViewMode('reader');
  };

  const handleDownloadAttachment = async (att: TopicAttachmentItem) => {
    try {
      let payload: string | Uint8Array = att.contentDataUrlOrText;
      let mime = att.fileType || 'text/plain;charset=utf-8';
      if (att.contentDataUrlOrText.startsWith('data:')) {
        const commaIdx = att.contentDataUrlOrText.indexOf(',');
        const header =
          commaIdx !== -1 ? att.contentDataUrlOrText.slice(5, commaIdx) : '';
        const dataPart =
          commaIdx !== -1 ? att.contentDataUrlOrText.slice(commaIdx + 1) : '';
        mime = header.split(';')[0] || mime;
        payload = header.includes('base64')
          ? base64ToUint8Array(dataPart)
          : decodeURIComponent(dataPart);
      }
      const res = await prepareAndDownloadFile({
        filename: att.fileName,
        content: payload,
        mime
      });
      if (res.initiated) {
        showToast(res.messageAr);
      } else {
        showToast(res.error || 'تعذر حفظ الملف المرفق', 'info');
      }
    } catch {
      showToast('تعذر تنزيل الملف المرفق', 'info');
    }
  };

  // ============================================================================
  // SHARED POPUP CARDS & MODALS (Clean Centered Popup Cards — Zero Overlap)
  // ============================================================================
  const popupTargetTopic = useMemo(
    () =>
      topics.find((t) => t.id === (termsPopupTopicId || actionMenuTopicId)) ||
      null,
    [topics, termsPopupTopicId, actionMenuTopicId]
  );

  const renderSharedModals = () => (
    <>
      <QuizCenterModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        questions={quizQuestions}
        onSaveQuestions={(next) => {
          setQuizQuestions(next);
          saveQuizQuestions(next);
        }}
        onDeleteQuestion={(qId) => {
          const next = quizQuestions.filter((q) => q.id !== qId);
          setQuizQuestions(next);
          saveQuizQuestions(next);
        }}
        attempts={quizAttempts}
        onSaveAttempt={(attempt) => {
          const next = saveQuizAttempt(attempt);
          setQuizAttempts(next);
          recordRecentLearningItem({
            entityType: 'quiz',
            entityId: attempt.id,
            titleEn: attempt.title,
            titleAr: `نتيجة الاختبار: ${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalQuestions})`,
            blockId: attempt.blockId,
            subjectId: attempt.subjectId,
            progressPercent: attempt.scorePercent
          });
          setRecentLearning(loadRecentLearningItems());
        }}
        blocks={blocks}
        subjects={subjects}
        topics={topics}
        terms={terms}
        initialBlockId={quizInitialBlockId}
        initialSubjectId={quizInitialSubjectId}
        initialTopicId={quizInitialTopicId}
        initialTab={quizInitialTab}
        onOpenTermDetail={(termId) => {
          const found = terms.find((t) => t.id === termId);
          if (found) {
            handleOpenTermWithStudyLog(found);
          } else {
            onOpenTermDetail(termId);
          }
        }}
        showToast={showToast}
      />

      <GranularExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        terms={terms}
        topics={topics}
        blocks={blocks}
        subjects={subjects}
        questions={quizQuestions}
        attempts={quizAttempts}
        defaultBlockId={exportInitialBlockId}
        defaultSubjectId={exportInitialSubjectId}
        defaultTopicId={exportInitialTopicId}
        showToast={showToast}
      />

      {/* POPUP CARD: Create / Edit Medical Block or Subject (z-[70] always above other modals) */}
      {hierarchyModalMode && (
        <div
          onClick={() => setHierarchyModalMode(null)}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {hierarchyModalMode === 'block'
                  ? editingHierarchyId
                    ? 'تعديل البلوك'
                    : 'بلوك جديد'
                  : editingHierarchyId
                  ? 'تعديل المادة'
                  : 'مادة جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setHierarchyModalMode(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHierarchyEntity} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    الاسم الإنجليزي *
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={hTitleEn}
                    onChange={(e) => setHTitleEn(e.target.value)}
                    placeholder={
                      hierarchyModalMode === 'block'
                        ? 'Hematology'
                        : 'Parasitology'
                    }
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-left"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    الاختصار (Code)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={hCode}
                    onChange={(e) => setHCode(e.target.value)}
                    placeholder={
                      hierarchyModalMode === 'block' ? 'BLK-HEME' : 'HEME-101'
                    }
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-left"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  الاسم العربي *
                </label>
                <input
                  type="text"
                  required
                  value={hTitleAr}
                  onChange={(e) => setHTitleAr(e.target.value)}
                  placeholder={
                    hierarchyModalMode === 'block'
                      ? 'أمراض الدم'
                      : 'الطفيليات الطبية'
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
              </div>

              {hierarchyModalMode === 'subject' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    البلوك التابع له
                  </label>
                  <select
                    dir="auto"
                    value={hParentBlockId}
                    onChange={(e) => setHParentBlockId(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  >
                    <option value="">مادة مستقلة</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {getShortBlockNameAr(b)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHierarchyModalMode(null)}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[38px] px-5 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP CARD: Quick Setup Before Creating a New Topic (Compact Pop-up Options) */}
      {activePopup === 'new_topic_setup' && (() => {
        const selectedSetupBlock = blocks.find((b) => b.id === setupBlockId);
        const filteredSetupSubjects = subjects.filter(
          (s) => !setupBlockId || s.blockId === setupBlockId || s.isStandalone
        );
        const selectedSetupSubject = filteredSetupSubjects.find(
          (s) => s.id === setupSubjectId
        );

        return (
          <div
            onClick={() => {
              setSetupPickerMode(null);
              setActivePopup(null);
            }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  إضافة موضوع جديد
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSetupPickerMode(null);
                    setActivePopup(null);
                  }}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Step 1: Compact Pop-up Trigger for Medical Block */}
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  1. البلوك الطبي
                </span>
                <button
                  type="button"
                  onClick={() => setSetupPickerMode('block')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 flex items-center justify-between gap-2 text-right transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectedSetupBlock ? (
                      <>
                        <span
                          dir="ltr"
                          className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                        >
                          {selectedSetupBlock.code}
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug break-words min-w-0">
                          {getShortBlockNameAr(selectedSetupBlock)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        اختر البلوك الطبي...
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-emerald-500 shrink-0" />
                </button>
              </div>

              {/* Step 2: Compact Pop-up Trigger for Medical Subject */}
              <div className="space-y-1.5">
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300 block">
                  2. المادة العلمية
                </span>
                <button
                  type="button"
                  onClick={() => setSetupPickerMode('subject')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 flex items-center justify-between gap-2 text-right transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectedSetupSubject ? (
                      <>
                        <span
                          dir="ltr"
                          className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                        >
                          {selectedSetupSubject.code}
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug break-words min-w-0">
                          {getShortSubjectNameAr(selectedSetupSubject)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        اختر المادة أو أنشئ مادة جديدة...
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-emerald-500 shrink-0" />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setSetupPickerMode(null);
                    setActivePopup(null);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupPickerMode(null);
                    openCreateTopicEditor({
                      blockId: setupBlockId,
                      subjectId: setupSubjectId
                    });
                  }}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                >
                  <span>متابعة لكتابة الموضوع</span>
                  <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* POPUP CARD: Compact Block / Subject Selector Inside New Topic Setup (z-[65] above setup modal, below hierarchyModal z-[70]) */}
      {activePopup === 'new_topic_setup' && setupPickerMode && (
        <div
          onClick={() => setSetupPickerMode(null)}
          className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {setupPickerMode === 'block' ? 'اختيار البلوك الطبي' : 'اختيار المادة العلمية'}
              </h4>
              <button
                type="button"
                onClick={() => setSetupPickerMode(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[52dvh] overflow-y-auto pr-0.5">
              {setupPickerMode === 'block'
                ? blocks.map((b) => {
                    const isSelected = setupBlockId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSetupBlockId(b.id);
                          const firstSub = subjects.find((s) => s.blockId === b.id);
                          setSetupSubjectId(firstSub ? firstSub.id : '');
                          setSetupPickerMode(null);
                        }}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            dir="ltr"
                            className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                          >
                            {b.code}
                          </span>
                          <span className="text-xs font-extrabold leading-snug break-words min-w-0">
                            {getShortBlockNameAr(b)}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })
                : subjects
                    .filter((s) => !setupBlockId || s.blockId === setupBlockId || s.isStandalone)
                    .map((s) => {
                      const isSelected = setupSubjectId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSetupSubjectId(s.id);
                            setSetupPickerMode(null);
                          }}
                          className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                            isSelected
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              dir="ltr"
                              className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                            >
                              {s.code}
                            </span>
                            <span className="text-xs font-extrabold leading-snug break-words min-w-0">
                              {getShortSubjectNameAr(s)}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
            </div>

            <button
              type="button"
              onClick={() => {
                const targetMode = setupPickerMode;
                setSetupPickerMode(null);
                setEditingHierarchyId(null);
                setHTitleEn('');
                setHTitleAr('');
                setHCode('');
                setHDescAr('');
                if (targetMode === 'subject') {
                  setHParentBlockId(setupBlockId);
                  setHierarchyModalMode('subject');
                } else {
                  setHierarchyModalMode('block');
                }
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-extrabold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{setupPickerMode === 'block' ? 'بلوك جديد' : 'مادة جديدة'}</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP CARD: Medical Block Filter Picker (Compact Pop-up Options) */}
      {activePopup === 'block_picker' && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                اختيار البلوك الطبي
              </h3>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[55dvh] overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveBlockFilter('ALL');
                  setActiveSubjectFilter('ALL');
                  setSelectedCategory('All');
                  setActivePopup(null);
                }}
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                  activeBlockFilter === 'ALL'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0">
                    ALL ({topics.length})
                  </span>
                  <span className="text-xs font-extrabold">
                    كل البلوكات ({blocks.length})
                  </span>
                </div>
                {activeBlockFilter === 'ALL' && (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </button>

              {blocks.map((block) => {
                const bCount = topics.filter((t) => t.blockId === block.id).length;
                const isSelected = activeBlockFilter === block.id;
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => {
                      setActiveBlockFilter(block.id);
                      setActiveSubjectFilter('ALL');
                      setActivePopup(null);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        dir="ltr"
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                      >
                        {block.code} ({bCount})
                      </span>
                      <span className="text-xs font-extrabold leading-snug break-words min-w-0">
                        {getShortBlockNameAr(block)}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingHierarchyId(null);
                setHTitleEn('');
                setHTitleAr('');
                setHCode('');
                setHDescAr('');
                setHierarchyModalMode('block');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-extrabold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>بلوك جديد</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP CARD: Medical Subject Filter Picker (Compact Pop-up Options) */}
      {activePopup === 'subject_picker' && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                اختيار المادة العلمية
              </h3>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[55dvh] overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveSubjectFilter('ALL');
                  setActivePopup(null);
                }}
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                  activeSubjectFilter === 'ALL'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0">
                    ALL ({visibleSubjects.length})
                  </span>
                  <span className="text-xs font-extrabold">
                    كل المواد
                  </span>
                </div>
                {activeSubjectFilter === 'ALL' && (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </button>

              {visibleSubjects.map((sub) => {
                const sCount = topics.filter((t) => t.subjectId === sub.id).length;
                const isSelected = activeSubjectFilter === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setActiveSubjectFilter(sub.id);
                      setActivePopup(null);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        dir="ltr"
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-extrabold shrink-0"
                      >
                        {sub.code} ({sCount})
                      </span>
                      <span className="text-xs font-extrabold leading-snug break-words min-w-0">
                        {getShortSubjectNameAr(sub)}
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingHierarchyId(null);
                setHTitleEn('');
                setHTitleAr('');
                setHCode('');
                setHDescAr('');
                setHParentBlockId(
                  activeBlockFilter !== 'ALL'
                    ? activeBlockFilter
                    : blocks[0]?.id || ''
                );
                setHierarchyModalMode('subject');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-extrabold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>مادة جديدة</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP CARD: Compact Academic Structure & Tools */}
      {activePopup === 'tools_hub' && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                الهيكل والأدوات
              </h3>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setActivePopup('blocks_manager')}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <FolderKanban className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    البلوكات والمواد
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {blocks.length} بلوك · {subjects.length} مادة
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePopup('saved_terms')}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <BookmarkCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    مصطلحات المواضيع
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {topicLinkedAndStudiedTerms.length} مصطلح
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePopup('recent_activity')}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <History className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    سجل التعلم
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {recentLearning.length} نشاط
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openExportForScope({
                    blockId: activeBlockFilter !== 'ALL' ? activeBlockFilter : undefined,
                    subjectId:
                      activeSubjectFilter !== 'ALL' ? activeSubjectFilter : undefined
                  })
                }
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    تصدير المواضيع والبلوكات
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-400">ZIP / JSON</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CARD 3: Blocks & Subjects Manager */}
      {(activePopup === 'blocks_manager' || activePopup === 'subjects_manager') && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[86dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActivePopup('blocks_manager')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors ${
                    activePopup === 'blocks_manager'
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  البلوكات ({blocks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActivePopup('subjects_manager')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors ${
                    activePopup === 'subjects_manager'
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  المواد ({subjects.length})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingHierarchyId(null);
                    setHTitleEn('');
                    setHTitleAr('');
                    setHCode('');
                    setHDescAr('');
                    setHParentBlockId(blocks[0]?.id || '');
                    setHierarchyModalMode(
                      activePopup === 'blocks_manager' ? 'block' : 'subject'
                    );
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {activePopup === 'blocks_manager' ? 'بلوك جديد' : 'مادة جديدة'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePopup(null)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {activePopup === 'blocks_manager' ? (
              <div className="space-y-3 max-h-[60dvh] overflow-y-auto pr-1">
                {blocks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    لا توجد بلوكات حالياً. يمكنك إضافة بلوك جديد من الزر أعلاه.
                  </div>
                ) : (
                  blocks.map((block) => {
                    const blockTopics = topics.filter((t) => t.blockId === block.id);
                    const blockSubjects = subjects.filter((s) => s.blockId === block.id);
                    return (
                      <div
                        key={block.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-3"
                      >
                        <div className="w-full space-y-1">
                          <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            <span dir="ltr">{block.code}</span> · {blockSubjects.length} مادة ·{' '}
                            {blockTopics.length} موضوع
                          </div>
                          <div
                            dir="ltr"
                            className="text-sm font-extrabold text-slate-900 dark:text-white text-left break-words"
                          >
                            {block.titleEn}
                          </div>
                          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                            {block.titleAr}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => openBlockDeleteSafetyModal(block)}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                            title="حذف البلوك مع نظام أمان"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>حذف</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingHierarchyId(block.id);
                              setHTitleEn(block.titleEn);
                              setHTitleAr(block.titleAr);
                              setHCode(block.code);
                              setHDescAr(block.descriptionAr);
                              setHierarchyModalMode('block');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold whitespace-nowrap"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveBlockFilter(block.id);
                              setActiveSubjectFilter('ALL');
                              setActivePopup(null);
                            }}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold whitespace-nowrap"
                          >
                            عرض
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3 max-h-[60dvh] overflow-y-auto pr-1">
                {subjects.map((subj) => {
                  const subjTopics = topics.filter((t) => t.subjectId === subj.id);
                  return (
                    <div
                      key={subj.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col gap-3"
                    >
                      <div className="w-full space-y-1">
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <span dir="ltr" className="font-mono">
                            {subj.code}
                          </span>{' '}
                          · {subjTopics.length} موضوع
                        </div>
                        <div
                          dir="ltr"
                          className="text-sm font-extrabold text-slate-900 dark:text-white text-left break-words"
                        >
                          {subj.titleEn}
                        </div>
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                          {subj.titleAr}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleDeleteSubjectSafely(subj)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>حذف</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingHierarchyId(subj.id);
                            setHTitleEn(subj.titleEn);
                            setHTitleAr(subj.titleAr);
                            setHCode(subj.code);
                            setHDescAr(subj.descriptionAr);
                            setHParentBlockId(subj.blockId || '');
                            setHierarchyModalMode('subject');
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold whitespace-nowrap"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveBlockFilter(subj.blockId || 'ALL');
                            setActiveSubjectFilter(subj.id);
                            setActivePopup(null);
                          }}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold whitespace-nowrap"
                        >
                          عرض
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BLOCK DELETION SAFETY SYSTEM POPUP CARD (نظام أمان حذف البلوك) */}
      {blockDeleteTarget && (
        <div
          onClick={() => setBlockDeleteTarget(null)}
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border-2 border-rose-500/50 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 block">
                  نظام الأمان لحذف البلوك الطبي
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {blockDeleteTarget.titleAr}
                </h3>
                <p dir="ltr" className="text-xs font-mono text-slate-500 text-left">
                  {blockDeleteTarget.titleEn} ({blockDeleteTarget.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBlockDeleteTarget(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>البيانات المرتبطة بهذا البلوك:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                {subjects.filter((s) => s.blockId === blockDeleteTarget.id).length} مادة ·{' '}
                {topics.filter((t) => t.blockId === blockDeleteTarget.id).length} موضوع
              </span>
            </div>

            <div className="space-y-2">
              <label
                onClick={() => setBlockDeleteMode('unlink_keep')}
                className={`block p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  blockDeleteMode === 'unlink_keep'
                    ? 'bg-emerald-500/10 border-emerald-500 text-slate-900 dark:text-white'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <input
                    type="radio"
                    name="blockDeleteMode"
                    checked={blockDeleteMode === 'unlink_keep'}
                    onChange={() => setBlockDeleteMode('unlink_keep')}
                    className="text-emerald-600"
                  />
                  <span>حذف البلوك فقط والاحتفاظ بالمواد والمواضيع (آمن)</span>
                </div>
              </label>

              <label
                onClick={() => setBlockDeleteMode('cascade_all')}
                className={`block p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  blockDeleteMode === 'cascade_all'
                    ? 'bg-rose-500/10 border-rose-500 text-rose-900 dark:text-rose-200'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <input
                    type="radio"
                    name="blockDeleteMode"
                    checked={blockDeleteMode === 'cascade_all'}
                    onChange={() => setBlockDeleteMode('cascade_all')}
                    className="text-rose-600"
                  />
                  <span>حذف البلوك مع جميع مواده ومواضيعه نهائياً</span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockDeleteConfirmed}
                  onChange={(e) => setBlockDeleteConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600"
                />
                <span>تأكيد الأمان للمتابعة بالحذف</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  const bId = blockDeleteTarget.id;
                  setBlockDeleteTarget(null);
                  openExportForScope({ blockId: bId });
                }}
                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                نسخ احتياطي للبلوك أولاً
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBlockDeleteTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!blockDeleteConfirmed}
                onClick={handleExecuteSafeBlockDelete}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد حذف البلوك</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CARD 4: Topic-Linked & Studied Terms */}
      {activePopup === 'saved_terms' && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[86dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  المصطلحات المرتبطة بالمواضيع ({topicLinkedAndStudiedTerms.length})
                </h3>
                <p className="text-xs text-slate-500">
                  انقر على أي مصطلح لفتح بطاقته الكاملة أو الاستماع لنطقه
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSavedTermsFilterScope('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  savedTermsFilterScope === 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                كل مصطلحات المواضيع
              </button>
              <button
                type="button"
                onClick={() => setSavedTermsFilterScope('SAVED_ONLY')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  savedTermsFilterScope === 'SAVED_ONLY'
                    ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                المحفوظة والمدروسة فقط
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[56dvh] overflow-y-auto pr-1">
              {topicLinkedAndStudiedTerms.slice(0, 100).map((item) => (
                <div
                  key={item.term.id}
                  onClick={() => {
                    setActivePopup(null);
                    handleOpenTermWithStudyLog(item.term);
                  }}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 break-words">
                      {item.term.translation}
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {item.term.definitionAr}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div
                      dir="ltr"
                      className="text-xs font-mono font-extrabold text-slate-900 dark:text-white"
                    >
                      {item.term.term}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerTTS(item.term.term, `saved-tts-${item.term.id}`);
                      }}
                      className="mt-1 p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* POPUP CARD 5: Recent Learning Activity */}
      {activePopup === 'recent_activity' && (
        <div
          onClick={() => setActivePopup(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[84dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                سجل التعلم الأخير ({recentLearning.length})
              </h3>
              <button
                type="button"
                onClick={() => setActivePopup(null)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {recentLearning.length > 0 ? (
              <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
                {recentLearning.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                        {item.entityType === 'topic'
                          ? 'موضوع أكاديمي'
                          : item.entityType === 'quiz'
                          ? 'محاولة اختبار'
                          : 'مادة علمية'}{' '}
                        · {new Date(item.accessedAt).toLocaleString('ar-EG')}
                      </div>
                      <div
                        dir="ltr"
                        className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white text-left truncate"
                      >
                        {item.titleEn}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                        {item.titleAr}
                      </div>
                    </div>

                    {item.entityType === 'topic' && (
                      <button
                        type="button"
                        onClick={() => {
                          const found = topics.find((t) => t.id === item.entityId);
                          if (found) handleOpenTopicInReader(found);
                        }}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold shrink-0"
                      >
                        قراءة
                      </button>
                    )}
                    {item.entityType === 'quiz' && (
                      <button
                        type="button"
                        onClick={() =>
                          openQuizForScope({
                            blockId: item.blockId,
                            subjectId: item.subjectId,
                            tab: 'history'
                          })
                        }
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold shrink-0"
                      >
                        النتيجة
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                افتح أي موضوع أو قم بإجراء اختبار ليظهر سجل نشاطك التعليمي هنا تلقائياً.
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPUP CARD 6: Topic Terms Quick Preview Popup (From Topic Card) */}
      {termsPopupTopicId && popupTargetTopic && (
        <div
          onClick={() => setTermsPopupTopicId(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[84dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  بطاقة مصطلحات الموضوع المنبثقة
                </span>
                <h3
                  dir="ltr"
                  className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-left break-words mt-0.5"
                >
                  {popupTargetTopic.titleEn || popupTargetTopic.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {popupTargetTopic.titleAr || popupTargetTopic.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTermsPopupTopicId(null)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(detectedTermsByTopicId[popupTargetTopic.id] || []).length > 0 ? (
              <div className="space-y-2 max-h-[55dvh] overflow-y-auto pr-1">
                {(detectedTermsByTopicId[popupTargetTopic.id] || []).map((dt) => (
                  <div
                    key={dt.id}
                    onClick={() => {
                      setTermsPopupTopicId(null);
                      handleOpenTermWithStudyLog(dt);
                    }}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 break-words">
                        {dt.translation}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">
                        {dt.definitionAr}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        dir="ltr"
                        className="text-xs font-mono font-extrabold text-slate-900 dark:text-white"
                      >
                        {dt.term}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTriggerTTS(dt.term, `popup-term-tts-${dt.id}`);
                        }}
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                افتح الموضوع وانقر مرتين على أي كلمة لترجمتها وإضافتها فوراً.
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTermsPopupTopicId(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => handleOpenTopicInReader(popupTargetTopic)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
              >
                <span>قراءة الموضوع كاملاً</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CARD 7: Topic Options / Actions Card (From Topic Card '•••' button — No Duplicate Open/Quiz Buttons) */}
      {actionMenuTopicId && popupTargetTopic && (
        <div
          onClick={() => setActionMenuTopicId(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                  إدارة الموضوع
                </span>
                <h3
                  dir="ltr"
                  className="text-sm font-extrabold text-slate-900 dark:text-white text-left break-words mt-0.5"
                >
                  {popupTargetTopic.titleEn || popupTargetTopic.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActionMenuTopicId(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => openEditTopicEditor(popupTargetTopic)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between"
              >
                <span>تعديل الموضوع وإضافة محتوى</span>
                <Edit3 className="w-4 h-4 text-emerald-500" />
              </button>

              <button
                type="button"
                onClick={() =>
                  openExportForScope({
                    blockId: popupTargetTopic.blockId,
                    subjectId: popupTargetTopic.subjectId,
                    topicId: popupTargetTopic.id
                  })
                }
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between"
              >
                <span>تنزيل وتصدير الموضوع مستقلاً</span>
                <Download className="w-4 h-4 text-emerald-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const idToDelete = popupTargetTopic.id;
                  setActionMenuTopicId(null);
                  onDeleteTopic(idToDelete);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between"
              >
                <span>حذف الموضوع</span>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ============================================================================
  // VIEW 3: RICH TOPIC PUBLISHER & STRUCTURED CONTENT BLOCKS EDITOR
  // ============================================================================
  if (viewMode === 'editor') {
    return (
      <div className="space-y-6 pb-12">
        {renderSharedModals()}

        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode(selectedTopicId ? 'reader' : 'list')}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة للمواضيع</span>
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {editingTopicId
                  ? 'تعديل الموضوع الأكاديمي'
                  : 'إنشاء موضوع طبي وتعليمي جديد'}
              </h1>
              <p className="text-xs text-slate-500">
                أضف الأقسام والفقرات والجداول والصور والأسئلة المدمجة بسهولة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBulkPasteHelper((v) => !v)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>لصق محاضرة طويلة وتقسيمها تلقائياً</span>
          </button>
        </div>

        {/* Bulk Paste Helper */}
        {showBulkPasteHelper && (
          <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                أداة التقسيم التلقائي للمحاضرات والمقالات الطبية الطويلة
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkPasteHelper(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={7}
              value={bulkRawArticleText}
              onChange={(e) => setBulkRawArticleText(e.target.value)}
              placeholder="الصق النص الكامل للمحاضرة أو الورقة العلمية هنا..."
              className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 text-xs leading-relaxed focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSplitBulkTextIntoSections}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
              >
                تقسيم النص إلى أقسام ووحدات محتوى الآن
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handlePublishTopic} className="space-y-6">
          {/* 1. Academic Hierarchy & Bilingual Titles Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              1. العنوان الأكاديمي والتصنيف الهيكلي (البلوك والمادة)
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  العنوان الأكاديمي الإنجليزي (English Title) *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={draftTitleEn}
                  onChange={(e) => setDraftTitleEn(e.target.value)}
                  placeholder="e.g., Iron Deficiency Anemia & Microcytic Differential"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-extrabold text-left focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  الترجمة العربية للعنوان (Arabic Title)
                </label>
                <input
                  type="text"
                  value={draftTitleAr}
                  onChange={(e) => setDraftTitleAr(e.target.value)}
                  placeholder="مثال: فقر الدم بعوز الحديد والتشخيص التفريقي"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    البلوك الطبي
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingHierarchyId(null);
                      setHTitleEn('');
                      setHTitleAr('');
                      setHCode('');
                      setHDescAr('');
                      setHierarchyModalMode('block');
                    }}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    + بلوك جديد
                  </button>
                </div>
                <select
                  dir="auto"
                  value={draftBlockId}
                  onChange={(e) => setDraftBlockId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleAr} — {b.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    المادة العلمية
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingHierarchyId(null);
                      setHTitleEn('');
                      setHTitleAr('');
                      setHCode('');
                      setHDescAr('');
                      setHParentBlockId(draftBlockId);
                      setHierarchyModalMode('subject');
                    }}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    + مادة جديدة
                  </button>
                </div>
                <select
                  dir="auto"
                  value={draftSubjectId}
                  onChange={(e) => setDraftSubjectId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.titleAr} — {s.titleEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Interactive Sections & Content Blocks Builder */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  2. أقسام الموضوع ووحدات المحتوى المتكاملة
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  أضف فقرات، جداول، صوراً، ملاحظات سريرية، تسجيلات صوتية، روابط، وأسئلة تفاعلية داخل كل قسم مباشرة
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftSections((prev) => [
                    ...prev,
                    {
                      id: `sec-${Date.now()}-${prev.length + 1}`,
                      headingEn: `Section ${prev.length + 1}`,
                      headingAr: `القسم ${prev.length + 1}`,
                      heading: `Section ${prev.length + 1} — القسم ${
                        prev.length + 1
                      }`,
                      paragraphs: [''],
                      contentBlocks: [
                        {
                          id: `cb-${Date.now()}-1`,
                          type: 'paragraph',
                          order: 1,
                          text: ''
                        }
                      ]
                    }
                  ])
                }
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة قسم جديد</span>
              </button>
            </div>

            <div className="space-y-4">
              {draftSections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        dir="ltr"
                        value={sec.headingEn || sec.heading || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftSections((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, headingEn: val, heading: val }
                                : item
                            )
                          );
                        }}
                        placeholder={`Section ${idx + 1} English Heading...`}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-left"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={sec.headingAr || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftSections((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, headingAr: val } : item
                            )
                          );
                        }}
                        placeholder={`الترجمة العربية لعنوان القسم ${idx + 1}...`}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      {draftSections.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSections((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10"
                          title="حذف القسم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <SectionContentBlocksEditor
                    topicId={editingTopicId || 'draft-topic'}
                    sectionId={sec.id}
                    blocks={
                      sec.contentBlocks ||
                      (sec.paragraphs || ['']).map((p, pIdx) => ({
                        id: `cb-${sec.id}-${pIdx}`,
                        type: 'paragraph',
                        order: pIdx + 1,
                        text: p
                      }))
                    }
                    onChangeBlocks={(nextBlocks) => {
                      setDraftSections((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                contentBlocks: nextBlocks,
                                paragraphs: nextBlocks
                                  .map((b) => b.text || b.titleEn || '')
                                  .filter(Boolean)
                              }
                            : item
                        )
                      );
                    }}
                    showToast={showToast}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Publish Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setViewMode(selectedTopicId ? 'reader' : 'list')}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold shadow-lg shadow-emerald-600/20"
            >
              {editingTopicId ? 'حفظ التعديلات ونشر الموضوع' : 'نشر الموضوع الآن'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: FOCUSED ARTICLE READER + POPUP CARDS (ZERO SIDEBAR CLUTTER)
  // ============================================================================
  if (viewMode === 'reader' && activeTopic) {
    const detectedTerms = detectedTermsByTopicId[activeTopic.id] || [];
    const activeBlock = activeTopic.blockId
      ? blockMap.get(activeTopic.blockId)
      : undefined;
    const activeSubject = activeTopic.subjectId
      ? subjectMap.get(activeTopic.subjectId)
      : undefined;
    const topicQuizQuestions = quizQuestions.filter(
      (q) =>
        q.topicId === activeTopic.id ||
        (activeTopic.subjectId && q.subjectId === activeTopic.subjectId)
    );
    const relatedTopicsList = topics.filter(
      (t) =>
        t.id !== activeTopic.id &&
        ((activeTopic.relatedTopicIds || []).includes(t.id) ||
          (activeTopic.subjectId && t.subjectId === activeTopic.subjectId))
    );

    const navPool =
      filteredTopics.some((t) => t.id === activeTopic.id) &&
      filteredTopics.length > 1
        ? filteredTopics
        : topics;
    const currentTopicIdx = navPool.findIndex((t) => t.id === activeTopic.id);
    const prevTopic =
      currentTopicIdx > 0 ? navPool[currentTopicIdx - 1] : null;
    const nextTopic =
      currentTopicIdx >= 0 && currentTopicIdx < navPool.length - 1
        ? navPool[currentTopicIdx + 1]
        : null;

    const primaryTitle = (activeTopic.titleEn || activeTopic.title || '').trim();
    const secondaryTitle = (
      activeTopic.titleAr ||
      activeTopic.subtitle ||
      ''
    ).trim();

    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-16">
        {renderSharedModals()}

        {/* Clean Wrapped Reader Toolbar (Zero Horizontal Scrolling, Zero Duplicate Buttons) */}
        <div className="p-3 sm:p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectionState(null);
              setViewMode('list');
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>المواضيع</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsTocSheetOpen(true)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1"
            >
              <ListFilter className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>الأقسام ({activeTopic.sections.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsReaderTermsPopupOpen(true)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>المصطلحات ({detectedTerms.length})</span>
            </button>

            <button
              type="button"
              onClick={() =>
                openQuizForScope({
                  blockId: activeTopic.blockId,
                  subjectId: activeTopic.subjectId,
                  topicId: activeTopic.id,
                  tab: 'runner'
                })
              }
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1"
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>اختبار ({topicQuizQuestions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsReaderOptionsPopupOpen(true)}
              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0"
              title="خيارات الموضوع"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Focused Reading Canvas (Full Width, Zero Clutter) */}
        <article
          ref={articleProseRef}
          onDoubleClick={(e) => {
            const word = extractWordAtPoint(e.clientX, e.clientY);
            inspectUserSelection(word || undefined);
          }}
          onMouseUp={() => {
            setTimeout(() => inspectUserSelection(), 30);
          }}
          onTouchEnd={(e) => {
            const touch = e.changedTouches?.[0];
            const now = Date.now();
            if (touch) {
              const dt = now - lastTapRef.current.time;
              const dx = Math.abs(touch.clientX - lastTapRef.current.x);
              const dy = Math.abs(touch.clientY - lastTapRef.current.y);
              if (dt > 0 && dt < 360 && dx < 36 && dy < 36) {
                const tappedWord = extractWordAtPoint(touch.clientX, touch.clientY);
                if (tappedWord) {
                  inspectUserSelection(tappedWord);
                  lastTapRef.current = { time: 0, x: 0, y: 0 };
                  return;
                }
              }
              lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
            }
            setTimeout(() => inspectUserSelection(), 120);
          }}
          onCopy={() => {
            setTimeout(() => inspectUserSelection(), 60);
          }}
          className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-8 space-y-7 shadow-xs"
        >
          {/* Clean Article Header */}
          <header className="space-y-2.5 border-b border-slate-200/80 dark:border-slate-800 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="leading-relaxed break-words">
                {activeBlock ? (
                  <strong className="text-slate-700 dark:text-slate-300">
                    <span dir="ltr" className="font-mono">
                      {activeBlock.code}
                    </span>{' '}
                    ({getShortBlockNameAr(activeBlock)}) ·{' '}
                  </strong>
                ) : null}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {activeSubject
                    ? `${activeSubject.code} · ${getShortSubjectNameAr(activeSubject)}`
                    : TOPIC_CATEGORY_META[activeTopic.category].labelAr}
                </strong>
                {' · '}
                {activeTopic.sections.length} أقسام ·{' '}
                {activeTopic.readingTimeMinutes} د قراءة
              </span>

              <button
                type="button"
                onClick={(e) => onToggleFavoriteTopic(activeTopic.id, e)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="حفظ في المفضلة"
              >
                <Star
                  className={`w-4 h-4 ${
                    activeTopic.favorite
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-400'
                  }`}
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  {activeTopic.favorite ? 'في المفضلة' : 'مفضلة'}
                </span>
              </button>
            </div>

            <h1
              dir="auto"
              className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight break-words"
            >
              {primaryTitle}
            </h1>

            {secondaryTitle && secondaryTitle !== primaryTitle && (
              <div className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                {secondaryTitle}
              </div>
            )}
          </header>

          {/* Structured Sections */}
          <div className="space-y-8">
            {activeTopic.sections.map((section, idx) => {
              const cleanedEn = cleanSectionHeading(
                section.headingEn || section.heading
              );
              const cleanedAr = cleanSectionHeading(section.headingAr);
              const sectionSpeakText = [
                cleanedEn,
                ...(section.paragraphs || [])
              ]
                .filter(Boolean)
                .join('. ');

              return (
                <section
                  key={section.id}
                  id={`topic-sec-${section.id}`}
                  className="space-y-3.5 scroll-mt-24"
                >
                  {cleanedEn && (
                    <div className="pb-2 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <h2
                          dir="auto"
                          className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug"
                        >
                          {idx + 1}. {cleanedEn}
                        </h2>
                        {cleanedAr && cleanedAr !== cleanedEn && (
                          <div className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">
                            {cleanedAr}
                          </div>
                        )}
                      </div>

                      {sectionSpeakText && (
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerTTS(
                              sectionSpeakText,
                              `sec-tts-${activeTopic.id}-${section.id}`
                            )
                          }
                          className="min-h-[34px] min-w-[34px] p-1.5 rounded-xl bg-slate-50 hover:bg-emerald-500/10 dark:bg-slate-950 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200/70 dark:border-slate-800 flex items-center justify-center shrink-0 transition-colors"
                          title="الاستماع لنص هذا القسم"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  <SectionContentBlocksRenderer
                    topicId={activeTopic.id}
                    sectionId={section.id}
                    blocks={
                      section.contentBlocks ||
                      (section.paragraphs || []).map((p, pIdx) => ({
                        id: `cb-fallback-${section.id}-${pIdx}`,
                        type: 'paragraph',
                        order: pIdx + 1,
                        text: p
                      }))
                    }
                    onOpenExamOrQuiz={(_examId, tId) =>
                      openQuizForScope({
                        blockId: activeTopic.blockId,
                        subjectId: activeTopic.subjectId,
                        topicId: tId || activeTopic.id,
                        tab: 'runner'
                      })
                    }
                    showToast={showToast}
                  />
                </section>
              );
            })}
          </div>

          {/* Sequential Topic Navigation Footer (Previous / Next Lecture) */}
          {(prevTopic || nextTopic) && (
            <footer className="pt-6 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {prevTopic ? (
                <button
                  type="button"
                  onClick={() => handleOpenTopicInReader(prevTopic)}
                  className="p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 text-right transition-colors space-y-1"
                >
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>الموضوع السابق</span>
                  </span>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1">
                    {prevTopic.titleAr || prevTopic.titleEn || prevTopic.title}
                  </div>
                </button>
              ) : (
                <div className="hidden sm:block" />
              )}

              {nextTopic ? (
                <button
                  type="button"
                  onClick={() => handleOpenTopicInReader(nextTopic)}
                  className="p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 text-left transition-colors space-y-1"
                >
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                    <span>الموضوع التالي</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </span>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-1 text-right">
                    {nextTopic.titleAr || nextTopic.titleEn || nextTopic.title}
                  </div>
                </button>
              ) : null}
            </footer>
          )}
        </article>

        {/* READER POPUP CARD 1: Table of Contents & Related Topics */}
        {isTocSheetOpen && (
          <div
            onClick={() => setIsTocSheetOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[84dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  فهرس أقسام الموضوع ({activeTopic.sections.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTocSheetOpen(false)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {activeTopic.sections.map((sec, i) => {
                  const cleanedEn = cleanSectionHeading(
                    sec.headingEn || sec.heading
                  );
                  const cleanedAr = cleanSectionHeading(sec.headingAr);
                  return (
                    <a
                      key={sec.id}
                      href={`#topic-sec-${sec.id}`}
                      onClick={() => setIsTocSheetOpen(false)}
                      className="block p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 text-xs font-bold transition-colors"
                    >
                      <div dir="auto" className="text-slate-900 dark:text-white">
                        {i + 1}. {cleanedEn}
                      </div>
                      {cleanedAr && cleanedAr !== cleanedEn && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {cleanedAr}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>

              {relatedTopicsList.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-500">
                    مواضيع أخرى في نفس المادة ({relatedTopicsList.length}):
                  </div>
                  {relatedTopicsList.map((tp) => (
                    <button
                      key={tp.id}
                      type="button"
                      onClick={() => {
                        setIsTocSheetOpen(false);
                        handleOpenTopicInReader(tp);
                      }}
                      className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 text-right space-y-0.5 transition-colors"
                    >
                      <div
                        dir="auto"
                        className="text-xs font-extrabold text-slate-900 dark:text-white"
                      >
                        {tp.titleEn || tp.title}
                      </div>
                      {tp.titleAr && tp.titleAr !== tp.titleEn && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                          {tp.titleAr}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* READER POPUP CARD 2: Detected Dictionary Terms in Topic */}
        {isReaderTermsPopupOpen && (
          <div
            onClick={() => setIsReaderTermsPopupOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl max-h-[84dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    المصطلحات المرتبطة بهذا الموضوع ({detectedTerms.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    انقر على أي مصطلح لمعاينة ترجمته السياقية أو فتح بطاقته
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReaderTermsPopupOpen(false)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {detectedTerms.length > 0 ? (
                <div className="space-y-2 max-h-[58dvh] overflow-y-auto pr-1">
                  {detectedTerms.map((dt) => (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() => {
                        setIsReaderTermsPopupOpen(false);
                        const updatedLog = recordStudiedTermEvent({
                          termId: dt.id,
                          term: dt.term,
                          translationAr: dt.translation,
                          topicId: activeTopic.id,
                          subjectId: activeTopic.subjectId,
                          blockId: activeTopic.blockId,
                          action: 'viewed'
                        });
                        setStudiedTermsLog(updatedLog);

                        const fullCorpus = activeTopic.sections
                          .map((s) => (s.paragraphs || []).join('\n\n'))
                          .join('\n\n');
                        const sentEn = extractContainingSentence(fullCorpus, dt.term);
                        const sentAr =
                          runHybridGcNmtPipeline(sentEn, terms, sentences)
                            .layer4FinalOutputAr || sentEn;

                        setSelectionState({
                          selectedText: dt.term,
                          quotedSentenceEn: sentEn,
                          quotedSentenceAr: sentAr,
                          matchedTerm: dt,
                          suggestedTranslationAr: dt.translation,
                          suggestedDefinitionAr: dt.definitionAr,
                          suggestedPhonetic: dt.phonetic,
                          suggestedPos: dt.pos
                        });
                      }}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:border-emerald-500 border border-slate-200/80 dark:border-slate-800 text-right transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 break-words">
                          {dt.translation}
                        </div>
                        <div className="text-[11px] text-slate-500 break-words line-clamp-1">
                          {dt.definitionAr}
                        </div>
                      </div>
                      <span
                        dir="ltr"
                        className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0"
                      >
                        {dt.term}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  انقر مرتين على أي كلمة في نص الموضوع لترجمتها وإضافتها للقاموس.
                </div>
              )}
            </div>
          </div>
        )}

        {/* READER POPUP CARD 3: Export, Attachments & Delete (Zero Duplicate Actions) */}
        {isReaderOptionsPopupOpen && (
          <div
            onClick={() => setIsReaderOptionsPopupOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[84dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  خيارات الموضوع والمرفقات
                </h3>
                <button
                  type="button"
                  onClick={() => setIsReaderOptionsPopupOpen(false)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => openEditTopicEditor(activeTopic)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between"
                >
                  <span>تعديل الموضوع وإضافة محتوى</span>
                  <Edit3 className="w-4 h-4 text-emerald-500" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openExportForScope({
                      blockId: activeTopic.blockId,
                      subjectId: activeTopic.subjectId,
                      topicId: activeTopic.id
                    })
                  }
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between"
                >
                  <span>تنزيل وتصدير الموضوع مستقلاً</span>
                  <Download className="w-4 h-4 text-emerald-500" />
                </button>

                {onDeleteTopic && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsReaderOptionsPopupOpen(false);
                      onDeleteTopic(activeTopic.id);
                      setViewMode('list');
                    }}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between"
                  >
                    <span>حذف هذا الموضوع</span>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {activeTopic.attachments.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-500">
                    المرفقات القابلة للتنزيل ({activeTopic.attachments.length}):
                  </div>
                  {activeTopic.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          dir="ltr"
                          className="text-xs font-bold truncate text-left"
                        >
                          {att.fileName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {att.fileSizeLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0"
                      >
                        تنزيل
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* READER POPUP CARD 4: QUICK WORD TRANSLATION MODAL ON DOUBLE-CLICK / DOUBLE-TAP */}
        {selectionState && (
          <div
            onClick={() => setSelectionState(null)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[86dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-500/60 shadow-2xl p-5 sm:p-6 space-y-4"
            >
              {selectionState.matchedTerm ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                        بطاقة الترجمة الفورية · مصطلح مسجل ({selectionState.matchedTerm.category})
                      </span>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <h4
                          dir="ltr"
                          className="text-lg sm:text-xl font-mono font-extrabold text-slate-900 dark:text-white break-words"
                        >
                          {selectionState.matchedTerm.term}
                        </h4>
                        <span
                          dir="ltr"
                          className="text-xs font-mono text-slate-400"
                        >
                          {selectionState.matchedTerm.phonetic}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerTTS(
                              selectionState.matchedTerm!.term,
                              `topic-sel-tts-${selectionState.matchedTerm!.id}`
                            )
                          }
                          className="min-h-[36px] px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>نطق</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectionState(null)}
                      className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      الترجمة الطبية:
                    </span>
                    <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                      {selectionState.matchedTerm.translation}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      الشرح والتعريف العلمي:
                    </span>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectionState.matchedTerm.definitionAr}
                    </p>
                  </div>

                  {selectionState.quotedSentenceEn && (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">
                          الجملة السياقية في الموضوع:
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerTTS(
                              selectionState.quotedSentenceEn,
                              `topic-sent-tts-${selectionState.matchedTerm!.id}`
                            )
                          }
                          className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>نطق الجملة</span>
                        </button>
                      </div>
                      <p
                        dir="ltr"
                        className="text-xs text-slate-800 dark:text-slate-200 text-left leading-relaxed"
                      >
                        {selectionState.quotedSentenceEn}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        {selectionState.quotedSentenceAr}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {onToggleFavoriteTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = selectionState.matchedTerm!.id;
                          onToggleFavoriteTerm(targetId);
                          setSelectionState((prev) =>
                            prev && prev.matchedTerm
                              ? {
                                  ...prev,
                                  matchedTerm: {
                                    ...prev.matchedTerm,
                                    favorite: !prev.matchedTerm.favorite
                                  }
                                }
                              : prev
                          );
                        }}
                        className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                          selectionState.matchedTerm.favorite
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            selectionState.matchedTerm.favorite
                              ? 'fill-amber-400 text-amber-400'
                              : ''
                          }`}
                        />
                        <span>
                          {selectionState.matchedTerm.favorite
                            ? 'محفوظ في المفضلة'
                            : 'حفظ في المفضلة'}
                        </span>
                      </button>
                    )}

                    {selectionState.quotedSentenceEn &&
                      !selectionState.matchedTerm.examples.some(
                        (e) =>
                          e.en.trim().toLowerCase() ===
                          selectionState.quotedSentenceEn.trim().toLowerCase()
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddSentenceToExistingTerm(
                              selectionState.matchedTerm!.id,
                              {
                                en: selectionState.quotedSentenceEn,
                                ar: selectionState.quotedSentenceAr
                              }
                            );
                            setSelectionState((prev) =>
                              prev && prev.matchedTerm
                                ? {
                                    ...prev,
                                    matchedTerm: {
                                      ...prev.matchedTerm,
                                      examples: [
                                        {
                                          en: prev.quotedSentenceEn,
                                          ar: prev.quotedSentenceAr
                                        },
                                        ...prev.matchedTerm.examples
                                      ]
                                    }
                                  }
                                : prev
                            );
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-500" />
                          <span>ربط الجملة</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        handleOpenTermWithStudyLog(selectionState.matchedTerm!)
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5 mr-auto"
                    >
                      <span>فتح بطاقة المصطلح</span>
                      <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInstantSaveUnknownTerm} className="space-y-3.5">
                  <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        بطاقة الترجمة الفورية · تحليل وحفظ فوري
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectionState(null)}
                        className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                        aria-label="إغلاق"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4
                        dir="ltr"
                        className="text-lg sm:text-xl font-mono font-extrabold text-slate-900 dark:text-white break-words"
                      >
                        {selectionState.selectedText}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerTTS(
                              selectionState.selectedText,
                              `topic-unknown-tts-${selectionState.selectedText}`
                            )
                          }
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>نطق</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRefineUnknownWordWithGemini}
                          disabled={isRefiningWithAI}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {isRefiningWithAI ? 'جاري التحسين...' : 'تحسين الترجمة'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {selectionState.morphologySummary && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">
                        تحليل الجذور التلقائي: {selectionState.morphologySummary}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">
                        المصطلح الطبي (English Term):
                      </label>
                      <input
                        type="text"
                        dir="auto"
                        required
                        value={editableNewTerm}
                        onChange={(e) => setEditableNewTerm(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">
                        الترجمة العربية للمصطلح:
                      </label>
                      <input
                        type="text"
                        required
                        value={editableTranslationAr}
                        onChange={(e) => setEditableTranslationAr(e.target.value)}
                        placeholder="اكتب أو عدّل الترجمة العربية..."
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/50 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      الشرح والتعريف المختصر:
                    </label>
                    <input
                      type="text"
                      value={editableDefinitionAr}
                      onChange={(e) => setEditableDefinitionAr(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAlsoAsFavorite}
                        onChange={(e) => setSaveAlsoAsFavorite(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>إضافة إلى المفضلة أيضاً</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectionState(null)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                      >
                        إغلاق
                      </button>
                      <button
                        type="submit"
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>
                          {saveAlsoAsFavorite
                            ? 'حفظ في القاموس والمفضلة'
                            : 'حفظ في القاموس'}
                        </span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 1: COMPACT HIERARCHICAL TOPICS HUB (SHORT CODES, ZERO LONG SENTENCES)
  // ============================================================================
  return (
    <div className="space-y-3.5 pb-24 relative w-full max-w-full overflow-x-clip">
      {renderSharedModals()}

      {/* Floating Action Button (+) Safely Above Mobile Bottom Nav Bar */}
      <button
        type="button"
        onClick={openNewTopicSetupModal}
        aria-label="إضافة موضوع جديد"
        title="إضافة موضوع جديد"
        className="fixed bottom-24 md:bottom-8 left-4 z-40 w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-xl shadow-emerald-600/30 flex items-center justify-center transition-transform active:scale-95"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* Compact Control Surface: Title + Search + Popup Card Filters (Zero Side-Scrolling, Zero Overlap) */}
      <div className="p-3.5 sm:p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
              المواضيع
            </h1>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-extrabold">
              {filteredTopics.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                openQuizForScope({
                  blockId:
                    activeBlockFilter !== 'ALL' ? activeBlockFilter : undefined,
                  subjectId:
                    activeSubjectFilter !== 'ALL'
                      ? activeSubjectFilter
                      : undefined,
                  tab: 'runner'
                })
              }
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:border-emerald-500/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>الاختبارات ({quizQuestions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePopup('tools_hub')}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:border-emerald-500/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="الهيكل والأدوات"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>الهيكل</span>
            </button>
          </div>
        </div>

        {/* Search Input + Compact Favorites Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في المواضيع أو المصطلحات..."
              className="w-full min-h-[40px] pr-9 pl-9 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavoriteTopics((prev) => !prev)}
            className={`min-h-[40px] px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-1 shrink-0 transition-colors ${
              onlyFavoriteTopics
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
            title="المفضلة"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                onlyFavoriteTopics ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
              }`}
            />
            <span>{favoriteTopicsCount}</span>
          </button>
        </div>

        {/* Popup Card Filter Triggers (Full Arabic Names Without Truncation) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setActivePopup('block_picker')}
            className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-2 text-right transition-colors ${
              activeBlockFilter !== 'ALL'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-800 dark:text-emerald-200'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <span className="leading-snug break-words">
              {activeBlockFilter === 'ALL'
                ? `البلوك: الكل (${blocks.length})`
                : (() => {
                    const blk = blockMap.get(activeBlockFilter);
                    return blk
                      ? `${blk.code} · ${getShortBlockNameAr(blk)}`
                      : 'البلوك المحدد';
                  })()}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setActivePopup('subject_picker')}
            className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-2 text-right transition-colors ${
              activeSubjectFilter !== 'ALL'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-800 dark:text-emerald-200'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <span className="leading-snug break-words">
              {activeSubjectFilter === 'ALL'
                ? `المادة: الكل (${visibleSubjects.length})`
                : (() => {
                    const sub = subjectMap.get(activeSubjectFilter);
                    return sub
                      ? `${sub.code} · ${getShortSubjectNameAr(sub)}`
                      : 'المادة المحددة';
                  })()}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          </button>
        </div>
      </div>

      {/* Compact 1-Line Recent Topic Resume Bar */}
      {lastReadTopic && !searchQuery && activeBlockFilter === 'ALL' && !onlyFavoriteTopics && (
        <button
          type="button"
          onClick={() => handleOpenTopicInReader(lastReadTopic)}
          className="w-full px-3.5 py-2 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-between gap-2 text-xs transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
              متابعة:
            </span>
            <span className="font-extrabold text-slate-900 dark:text-white leading-snug break-words text-right">
              {lastReadTopic.titleAr || lastReadTopic.titleEn || lastReadTopic.title}
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 rotate-180 shrink-0" />
        </button>
      )}

      {/* Hierarchical Topics Cards Grid (Full Block & Subject Arabic Names) */}
      {filteredTopics.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTopics.map((topic) => {
            const detected = detectedTermsByTopicId[topic.id] || [];
            const tBlock = topic.blockId
              ? blockMap.get(topic.blockId)
              : undefined;
            const tSubject = topic.subjectId
              ? subjectMap.get(topic.subjectId)
              : undefined;
            const tQuestions = quizQuestions.filter(
              (q) => q.topicId === topic.id
            );

            const primaryTitle = (topic.titleEn || topic.title || '').trim();
            const secondaryTitle = (
              topic.titleAr ||
              topic.subtitle ||
              ''
            ).trim();

            return (
              <article
                key={topic.id}
                onClick={() => handleOpenTopicInReader(topic)}
                className="group w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 hover:border-emerald-500/70 transition-all p-4 flex flex-col justify-between gap-3 cursor-pointer shadow-xs"
              >
                <div className="space-y-1.5">
                  {/* Top Row: Full Block Name + Full Subject Name + Favorite & Menu */}
                  <div className="flex items-start justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      {tBlock && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-extrabold text-[10px] text-slate-700 dark:text-slate-300 leading-snug break-words">
                          <span dir="ltr" className="font-mono">
                            {tBlock.code}
                          </span>{' '}
                          · {getShortBlockNameAr(tBlock)}
                        </span>
                      )}
                      {tSubject && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-extrabold text-[10px] leading-snug break-words">
                          <span dir="ltr" className="font-mono">
                            {tSubject.code}
                          </span>{' '}
                          · {getShortSubjectNameAr(tSubject)}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 shrink-0">
                        · {topic.readingTimeMinutes} د
                      </span>
                    </div>

                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTopic(topic.id, e)}
                        className="min-h-[32px] min-w-[32px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-400 flex items-center justify-center"
                        title="المفضلة"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            topic.favorite
                              ? 'fill-amber-400 text-amber-400'
                              : ''
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionMenuTopicId(topic.id)}
                        className="min-h-[32px] min-w-[32px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center"
                        title="خيارات"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Topic Titles (Concise, 1-line each, no paragraph wall) */}
                  <h2
                    dir="auto"
                    className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug line-clamp-1"
                  >
                    {primaryTitle}
                  </h2>

                  {secondaryTitle && secondaryTitle !== primaryTitle && (
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 line-clamp-1">
                      {secondaryTitle}
                    </div>
                  )}
                </div>

                {/* Compact Bottom Row */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setTermsPopupTopicId(topic.id)}
                      className="min-h-[30px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold whitespace-nowrap"
                    >
                      المصطلحات ({detected.length})
                    </button>

                    {tQuestions.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          openQuizForScope({
                            blockId: topic.blockId,
                            subjectId: topic.subjectId,
                            topicId: topic.id,
                            tab: 'runner'
                          })
                        }
                        className="min-h-[30px] px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold whitespace-nowrap"
                      >
                        اختبار ({tQuestions.length})
                      </button>
                    )}
                  </div>

                  <span className="text-slate-400 dark:text-slate-500 font-bold text-[11px] inline-flex items-center gap-1">
                    <span>{topic.sections.length} أقسام</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180 text-emerald-500" />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
          <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
            لا توجد مواضيع مطابقة
          </h3>
          <button
            type="button"
            onClick={() => {
              setActiveBlockFilter('ALL');
              setActiveSubjectFilter('ALL');
              setSelectedCategory('All');
              setOnlyFavoriteTopics(false);
              setSearchQuery('');
            }}
            className="min-h-[36px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold"
          >
            إظهار الكل
          </button>
        </div>
      )}
    </div>
  );
};

