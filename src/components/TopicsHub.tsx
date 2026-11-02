import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  ArrowRight,
  Star,
  Volume2,
  BookOpen,
  ExternalLink,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Trash2,
  Edit3,
  Check,
  X,
  Sparkles,
  Stethoscope,
  Cpu,
  Code2,
  Globe,
  Clock,
  Eye,
  Upload,
  Layers
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
  TermExample
} from '../types/lexicon';
import { TOPIC_CATEGORY_META } from '../data/topicsSeedData';
import { EXTRA_LINKABLE_ALIASES } from '../data/medicalLexiconData';
import {
  extractDetailedTermMatchesFromText,
  extractLinkedTermsFromText
} from '../engine/knowledgeLinker';
import {
  runHybridGcNmtPipeline,
  decomposeMedicalWord,
  translateWithGeminiAI
} from '../engine/hybridTranslator';

interface TopicsHubProps {
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  onSaveTopic: (topic: TopicArticle, isEdit: boolean) => void;
  onDeleteTopic: (topicId: string) => void;
  onToggleFavoriteTopic: (topicId: string, e?: React.MouseEvent) => void;
  onOpenTermDetail: (termId: string) => void;
  onSaveNewTermFromTopic: (
    newTerm: DictionaryTerm,
    newLinkedSentences: LinkedSentence[]
  ) => void;
  onAddSentenceToExistingTerm: (termId: string, example: TermExample) => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
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

/**
 * Extracts the surrounding sentence from a block of text containing `selectedText`.
 */
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
  topics,
  terms,
  sentences,
  onSaveTopic,
  onDeleteTopic,
  onToggleFavoriteTopic,
  onOpenTermDetail,
  onSaveNewTermFromTopic,
  onAddSentenceToExistingTerm,
  onTriggerTTS,
  showToast
}) => {
  // Navigation State: 'list' | 'reader' | 'editor'
  const [viewMode, setViewMode] = useState<'list' | 'reader' | 'editor'>('list');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    topics[0]?.id || null
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory | 'All'>('All');

  // Smart Selection / Long-Press / Copy Popover State inside the Reader
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
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftSubtitle, setDraftSubtitle] = useState<string>('');
  const [draftCategory, setDraftCategory] = useState<TopicCategory>('Medical');
  const [draftAuthor, setDraftAuthor] = useState<string>('محرر المنظومة المعرفية');
  const [draftSections, setDraftSections] = useState<TopicSection[]>([
    {
      id: 'sec-1',
      heading: 'مقدمة الموضوع والإطار العام',
      paragraphs: ['']
    }
  ]);
  const [draftImages, setDraftImages] = useState<TopicImageItem[]>([]);
  const [draftLinks, setDraftLinks] = useState<TopicLinkItem[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<TopicAttachmentItem[]>([]);

  // Inline sub-forms inside the Editor for adding Image URL, Link, or Bulk Text
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

  const activeTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || topics[0] || null,
    [topics, selectedTopicId]
  );

  // Map each topic ID to its automatically detected dictionary terms
  const detectedTermsByTopicId = useMemo(() => {
    const map: Record<string, DictionaryTerm[]> = {};
    const termById = new Map<string, DictionaryTerm>(terms.map((t) => [t.id, t]));

    for (const topic of topics) {
      const combinedText = [
        topic.title,
        topic.subtitle || '',
        ...topic.sections.map(
          (s) => `${s.heading || ''}\n${(s.paragraphs || []).join('\n\n')}`
        ),
        ...topic.images.map((img) => img.caption),
        ...topic.links.map((l) => `${l.title} ${l.description || ''}`)
      ].join('\n\n');

      const matches = extractDetailedTermMatchesFromText(combinedText, terms);
      const uniqueTerms: DictionaryTerm[] = [];
      const seenIds = new Set<string>();

      for (const m of matches) {
        if (!seenIds.has(m.termId)) {
          const found = termById.get(m.termId);
          if (found) {
            seenIds.add(m.termId);
            uniqueTerms.push(found);
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

  // Filtered Topics for the Browse Hub
  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return topics.filter((topic) => {
      if (selectedCategory !== 'All' && topic.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const inTitle = topic.title.toLowerCase().includes(q);
      const inSubtitle = (topic.subtitle || '').toLowerCase().includes(q);
      const inAuthor = topic.author.toLowerCase().includes(q);
      const inSections = topic.sections.some(
        (s) =>
          (s.heading || '').toLowerCase().includes(q) ||
          (s.paragraphs || []).some((p) => p.toLowerCase().includes(q))
      );
      const inDetectedTerms = (detectedTermsByTopicId[topic.id] || []).some(
        (dt) =>
          dt.term.toLowerCase().includes(q) ||
          dt.translation.toLowerCase().includes(q)
      );
      return inTitle || inSubtitle || inAuthor || inSections || inDetectedTerms;
    });
  }, [topics, selectedCategory, searchQuery, detectedTermsByTopicId]);

  // Lookup helper for matching a selected word/phrase to an existing DictionaryTerm
  const findTermForSelectedString = (rawSelection: string): DictionaryTerm | null => {
    const cleaned = rawSelection
      .replace(/^[.,;:!?()[\]{}"'«»“”‘’—–-]+|[.,;:!?()[\]{}"'«»“”‘’—–-]+$/g, '')
      .trim();
    if (!cleaned || cleaned.length < 2) return null;

    const lower = cleaned.toLowerCase();

    // 1. Direct English or Arabic match
    const direct = terms.find(
      (t) =>
        t.term.toLowerCase() === lower ||
        t.translation.trim() === cleaned ||
        (t.relations.synonyms || []).some((syn) => syn.toLowerCase() === lower)
    );
    if (direct) return direct;

    // 2. Alias match
    const aliasTargetKey = Object.keys(EXTRA_LINKABLE_ALIASES).find(
      (k) => k.toLowerCase() === lower
    );
    if (aliasTargetKey) {
      const targetId = EXTRA_LINKABLE_ALIASES[aliasTargetKey];
      const aliasTerm = terms.find((t) => t.id === targetId);
      if (aliasTerm) return aliasTerm;
    }

    // 3. Singular/stem fallback (e.g., "embolisms" -> "embolism", "arrhythmias" -> "arrhythmia")
    if (lower.endsWith('s') && lower.length > 4) {
      const singular = lower.slice(0, -1);
      const singularMatch = terms.find((t) => t.term.toLowerCase() === singular);
      if (singularMatch) return singularMatch;
    }

    // 4. Check if extractDetailedTermMatchesFromText finds an exact match inside the selection
    const detailed = extractDetailedTermMatchesFromText(cleaned, terms);
    if (detailed.length > 0) {
      const found = terms.find((t) => t.id === detailed[0].termId);
      if (found) return found;
    }

    return null;
  };

  /**
   * Triggered when the reader selects text (mouse-up / touch-end / keyboard) or copies text (Ctrl+C / copy)
   * inside the clean article reader.
   */
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

    // Ignore empty or single-character selections
    if (!cleaned || cleaned.length < 2 || cleaned.length > 1500) {
      return;
    }

    const fullArticleCorpus = activeTopic.sections
      .map((s) => `${s.heading || ''}.\n${(s.paragraphs || []).join('\n\n')}`)
      .join('\n\n');

    const containingSentence = extractContainingSentence(
      fullArticleCorpus,
      cleaned
    );

    // Translate the containing sentence using the hybrid pipeline
    const sentenceTranslationResult = runHybridGcNmtPipeline(
      containingSentence,
      terms,
      sentences
    );
    const quotedSentenceAr =
      sentenceTranslationResult.layer4FinalOutputAr || containingSentence;

    const existingTerm = findTermForSelectedString(cleaned);

    if (existingTerm) {
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

    // Word is NOT in the dictionary -> Run instant morphological + hybrid translation analysis
    const morphResult = decomposeMedicalWord(cleaned, terms);
    const wordHybridResult = runHybridGcNmtPipeline(cleaned, terms, sentences);

    const hasMorphology =
      Boolean(morphResult.prefix) ||
      Boolean(morphResult.root) ||
      Boolean(morphResult.suffix);

    const suggestedTranslation = hasMorphology
      ? morphResult.synthesizedAr
      : wordHybridResult.layer4FinalOutputAr !== cleaned
        ? wordHybridResult.layer4FinalOutputAr
        : '';

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

    const defaultDefAr = morphPartsSummary
      ? `مصطلح مستخرج من مقال "${activeTopic.title}" (${morphPartsSummary}).`
      : `مصطلح معرفي مستخرج من مقال "${activeTopic.title}" ضمن تصنيف ${TOPIC_CATEGORY_META[activeTopic.category].labelAr}.`;

    const mappedCat = mapTopicCategoryToDictionaryCategory(activeTopic.category);

    setEditableNewTerm(cleaned);
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

    const newTermObj: DictionaryTerm = {
      id: newTermId,
      term: cleanTerm,
      termNormalized: cleanTerm.toLowerCase(),
      translation: cleanTrans,
      phonetic: selectionState?.suggestedPhonetic || `/${cleanTerm.toLowerCase()}/`,
      pos: selectionState?.suggestedPos || 'noun',
      category: editableCategory,
      specialty: activeTopic
        ? TOPIC_CATEGORY_META[activeTopic.category].labelAr
        : 'مواضيع ومقالات',
      keepEnglish: true,
      favorite: false,
      collections: ['مستخرج من المواضيع'],
      ingestedAt: `الآن · من مقال: ${activeTopic?.title || 'موضوع'}`,
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
            specialty: activeTopic?.title || 'مواضيع',
            sourceType: 'long_text',
            linkedTermIds: [newTermId, ...relatedIds],
            tags: [cleanTerm],
            favorite: false,
            createdAt: 'الآن · مقتبس من مقال'
          }
        ]
      : [];

    onSaveNewTermFromTopic(newTermObj, newLinkedSentences);

    // Transition the popover immediately to show the newly saved term!
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
  const openCreateTopicEditor = () => {
    setEditingTopicId(null);
    setDraftTitle('');
    setDraftSubtitle('');
    setDraftCategory(selectedCategory === 'All' ? 'Medical' : selectedCategory);
    setDraftAuthor('محرر المنظومة المعرفية');
    setDraftSections([
      {
        id: `sec-${Date.now()}-1`,
        heading: 'مقدمة الموضوع والإطار العام',
        paragraphs: ['']
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
    setEditingTopicId(topic.id);
    setDraftTitle(topic.title);
    setDraftSubtitle(topic.subtitle || '');
    setDraftCategory(topic.category);
    setDraftAuthor(topic.author);
    setDraftSections(
      topic.sections.length > 0
        ? topic.sections.map((s) => ({
            id: s.id,
            heading: s.heading || '',
            paragraphs: [...(s.paragraphs || [])]
          }))
        : [
            {
              id: `sec-${Date.now()}`,
              heading: 'المحتوى الرئيسي',
              paragraphs: ['']
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

  // Handle uploading an image from user device
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

  // Handle uploading any file attachment from user device
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
      showToast(`تم رفع الملف "${file.name}" (${sizeLabel}) وإرفاقه بالمنشور`);
    };

    if (isTextLike) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Split ultra-long pasted text into structured sections automatically
  const handleSplitBulkTextIntoSections = () => {
    const raw = bulkRawArticleText.trim();
    if (!raw) return;

    const blocks = raw
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (blocks.length === 0) return;

    const generatedSections: TopicSection[] = [];
    let currentHeading = 'القسم الأول';
    let currentParagraphs: string[] = [];

    for (const block of blocks) {
      const isHeadingLine =
        block.startsWith('#') ||
        (block.length < 95 && !block.endsWith('.') && !block.includes('\n'));

      if (isHeadingLine) {
        if (currentParagraphs.length > 0) {
          generatedSections.push({
            id: `sec-${Date.now()}-${generatedSections.length + 1}`,
            heading: currentHeading,
            paragraphs: [...currentParagraphs]
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
        heading: currentHeading,
        paragraphs: [...currentParagraphs]
      });
    }

    if (generatedSections.length > 0) {
      setDraftSections(generatedSections);
      setShowBulkPasteHelper(false);
      setBulkRawArticleText('');
      showToast(`تم تقسيم النص الطويل تلقائياً إلى ${generatedSections.length} أقسام منظمة`);
    }
  };

  const handlePublishTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = draftTitle.trim();
    const nonEmptySections: TopicSection[] = draftSections
      .map((s) => ({
        id: s.id,
        heading: (s.heading || '').trim() || 'قسم فرعي',
        paragraphs: (s.paragraphs || [])
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      }))
      .filter((s) => s.paragraphs.length > 0);

    if (!cleanTitle) {
      showToast('يرجى كتابة عنوان للموضوع قبل النشر', 'info');
      return;
    }
    if (nonEmptySections.length === 0) {
      showToast('يرجى كتابة محتوى نصي في قسم واحد على الأقل', 'info');
      return;
    }

    const totalWords = nonEmptySections.reduce(
      (acc, s) =>
        acc + s.paragraphs.join(' ').split(/\s+/).filter(Boolean).length,
      0
    );
    const readingMinutes = Math.max(1, Math.ceil(totalWords / 160));

    const newOrUpdatedTopic: TopicArticle = {
      id: editingTopicId || `topic-${Date.now()}`,
      title: cleanTitle,
      subtitle: draftSubtitle.trim() || cleanTitle,
      category: draftCategory,
      author: draftAuthor.trim() || 'محرر المنظومة المعرفية',
      publishedAt: editingTopicId ? 'محدّث الآن' : 'الآن',
      readingTimeMinutes: readingMinutes,
      favorite: editingTopicId
        ? Boolean(topics.find((t) => t.id === editingTopicId)?.favorite)
        : false,
      sections: nonEmptySections,
      images: draftImages,
      links: draftLinks,
      attachments: draftAttachments
    };

    onSaveTopic(newOrUpdatedTopic, Boolean(editingTopicId));
    setSelectedTopicId(newOrUpdatedTopic.id);
    setSelectionState(null);
    setViewMode('reader');
  };

  // Trigger real file download for an attachment inside a topic post
  const handleDownloadAttachment = (att: TopicAttachmentItem) => {
    try {
      if (att.contentDataUrlOrText.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = att.contentDataUrlOrText;
        a.download = att.fileName;
        a.click();
      } else {
        const blob = new Blob([att.contentDataUrlOrText], {
          type: att.fileType || 'text/plain;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      showToast(`جاري تنزيل الملف المرفق: ${att.fileName}`);
    } catch {
      showToast('تعذر تنزيل الملف المرفق', 'info');
    }
  };

  // ============================================================================
  // VIEW 3: RICH TOPIC PUBLISHER & EDITOR
  // ============================================================================
  if (viewMode === 'editor') {
    return (
      <div className="space-y-6 pb-12">
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
              <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {editingTopicId ? 'تعديل الموضوع المنشور' : 'كتابة ونشر موضوع جديد'}
              </h1>
              <p className="text-xs text-slate-500">
                انشر صفحة ويب معرفية متكاملة تدعم النصوص الطويلة والصور والروابط والملفات مع اكتشاف تلقائي للمصطلحات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBulkPasteHelper((v) => !v)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>لصق مقال طويل وتقسيمه تلقائياً</span>
          </button>
        </div>

        {/* Optional Bulk Paste Helper for Very Long Articles */}
        {showBulkPasteHelper && (
          <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                أداة التقسيم التلقائي للمقالات والنصوص الطويلة جداً
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkPasteHelper(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              الصق المقال الكامل هنا (مهما كان طوله)، وسيقوم المحرر بتحويل العناوين والفقرات تلقائياً إلى أقسام مفهرسة قابلة للقراءة والتعديل.
            </p>
            <textarea
              rows={7}
              value={bulkRawArticleText}
              onChange={(e) => setBulkRawArticleText(e.target.value)}
              placeholder="الصق النص الكامل للمقال أو الورقة العلمية هنا..."
              className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 text-xs leading-relaxed focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSplitBulkTextIntoSections}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
              >
                تقسيم النص إلى أقسام وفصول الآن
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handlePublishTopic} className="space-y-6">
          {/* 1. Core Metadata Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              1. بيانات الصفحة والموضوع الأساسية
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  عنوان الموضوع الرئيسي
                </label>
                <input
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="مثال: البروتوكول السريري لتشخيص الانصمام الرئوي الحاد (Pulmonary Embolism)..."
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  تصنيف الموضوع
                </label>
                <select
                  value={draftCategory}
                  onChange={(e) =>
                    setDraftCategory(e.target.value as TopicCategory)
                  }
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold focus:outline-none focus:border-emerald-500"
                >
                  {(
                    ['Medical', 'Technology', 'AI', 'History', 'General'] as const
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {TOPIC_CATEGORY_META[cat].labelAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  العنوان الفرعي أو الملخص التمهيدي (اختياري)
                </label>
                <input
                  type="text"
                  value={draftSubtitle}
                  onChange={(e) => setDraftSubtitle(e.target.value)}
                  placeholder="ملخص تمهيدي يظهر أسفل العنوان الرئيسي للمنشور..."
                  className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  الكاتب / المصدر العلمي
                </label>
                <input
                  type="text"
                  value={draftAuthor}
                  onChange={(e) => setDraftAuthor(e.target.value)}
                  placeholder="اسم الكاتب أو المصدر"
                  className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* 2. Long-Form Sections Builder */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  2. الأقسام والفقرات النصية (يدعم النصوص الطويلة جداً بالعربية والإنجليزية)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  كل قسم يظهر كفصل مستقل في فهرس الصفحة، وسيكتشف البرنامج المصطلحات بداخله تلقائياً دون تشويه النص
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftSections((prev) => [
                    ...prev,
                    {
                      id: `sec-${Date.now()}-${prev.length + 1}`,
                      heading: `القسم ${prev.length + 1}`,
                      paragraphs: ['']
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={sec.heading || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftSections((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, heading: val } : item
                            )
                          );
                        }}
                        placeholder={`عنوان القسم ${idx + 1}...`}
                        className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    {draftSections.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftSections((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="min-h-[36px] min-w-[36px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                        title="حذف هذا القسم"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={7}
                    dir="auto"
                    value={(sec.paragraphs || []).join('\n\n')}
                    onChange={(e) => {
                      const val = e.target.value;
                      const splitParas = val
                        .split(/\n{2,}/)
                        .map((p) => p);
                      setDraftSections((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                paragraphs: splitParas.length > 0 ? splitParas : ['']
                              }
                            : item
                        )
                      );
                    }}
                    placeholder="اكتب أو الصق المحتوى التفصيلي لهذا القسم (عربي، إنجليزي، أو مزدوج اللغة)..."
                    className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 text-sm leading-relaxed focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 3. Rich Media: Images, Reference Links, and Uploadable Files */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Images Panel */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-extrabold">الصور والأشكال التوضيحية</h3>
                </div>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع صورة من الجهاز</span>
                </button>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  dir="ltr"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="أو الصق رابط صورة مباشر (https://...)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newImageCaption}
                    onChange={(e) => setNewImageCaption(e.target.value)}
                    placeholder="وصف الشكل أو الصورة..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageByUrl}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold shrink-0"
                  >
                    إضافة
                  </button>
                </div>
              </div>

              {draftImages.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {draftImages.map((img) => (
                    <div
                      key={img.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={img.url}
                          alt={img.caption}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-900 shrink-0"
                        />
                        <span className="text-xs font-medium truncate">
                          {img.caption}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftImages((prev) =>
                            prev.filter((i) => i.id !== img.id)
                          )
                        }
                        className="text-rose-500 p-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Links Panel */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-extrabold">الروابط والمراجع الخارجية</h3>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="عنوان الرابط أو المرجع..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://example.org/reference"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLinkDesc}
                    onChange={(e) => setNewLinkDesc(e.target.value)}
                    placeholder="توضيح مختصر للرابط (اختياري)..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddReferenceLink}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold shrink-0"
                  >
                    إضافة
                  </button>
                </div>
              </div>

              {draftLinks.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {draftLinks.map((lnk) => (
                    <div
                      key={lnk.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{lnk.title}</div>
                        <div
                          dir="ltr"
                          className="text-[11px] text-slate-400 truncate text-left"
                        >
                          {lnk.url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftLinks((prev) =>
                            prev.filter((l) => l.id !== lnk.id)
                          )
                        }
                        className="text-rose-500 p-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* File Attachments Panel */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-extrabold">الملفات المرفقة بالمنشور</h3>
                </div>
                <input
                  ref={attachmentFileInputRef}
                  type="file"
                  onChange={handleAttachmentFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => attachmentFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع ملف من الجهاز</span>
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                يمكنك إرفاق ملفات نصية أو جداول بيانات أو مستندات مرجعية ليتمكن القارئ من تنزيلها مباشرة من صفحة الموضوع.
              </p>

              {draftAttachments.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {draftAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <div
                          dir="ltr"
                          className="text-xs font-bold truncate text-left"
                        >
                          {att.fileName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {att.fileSizeLabel} · {att.fileType}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftAttachments((prev) =>
                            prev.filter((a) => a.id !== att.id)
                          )
                        }
                        className="text-rose-500 p-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  لم يتم إرفاق ملفات بعد
                </div>
              )}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="min-h-[46px] px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              <span>{editingTopicId ? 'حفظ التعديلات وعرض الصفحة' : 'نشر الموضوع وفتحه كصفحة ويب'}</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: STANDALONE WEB-PAGE ARTICLE READER (WITH CLEAN SELECTION POPOVER)
  // ============================================================================
  if (viewMode === 'reader' && activeTopic) {
    const detectedTerms = detectedTermsByTopicId[activeTopic.id] || [];

    return (
      <div className="space-y-6 pb-20">
        {/* Top Article Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectionState(null);
                setViewMode('list');
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>جميع المواضيع</span>
            </button>

            <span className="text-xs text-slate-500 dark:text-slate-400">
              {TOPIC_CATEGORY_META[activeTopic.category].labelAr} · {activeTopic.publishedAt} ·{' '}
              {activeTopic.readingTimeMinutes} دقائق قراءة · {detectedTerms.length} مصطلح مكتشف تلقائياً
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => onToggleFavoriteTopic(activeTopic.id, e)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                activeTopic.favorite
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Star
                className={`w-4 h-4 ${
                  activeTopic.favorite ? 'fill-amber-400 text-amber-400' : ''
                }`}
              />
              <span>{activeTopic.favorite ? 'في المفضلة' : 'حفظ المقال'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => openEditTopicEditor(activeTopic, e)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>تعديل الصفحة</span>
            </button>

            <button
              type="button"
              onClick={openCreateTopicEditor}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>موضوع جديد</span>
            </button>
          </div>
        </div>

        {/* Two-Column Web Page Layout: 8 Cols Clean Editorial Prose + 4 Cols Margin Index */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* MAIN WEB-PAGE ARTICLE COLUMN (8 COLS) */}
          <article
            ref={articleProseRef}
            onMouseUp={() => inspectUserSelection()}
            onTouchEnd={() => {
              setTimeout(() => inspectUserSelection(), 120);
            }}
            onKeyUp={() => inspectUserSelection()}
            onCopy={() => {
              setTimeout(() => inspectUserSelection(), 60);
            }}
            className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 p-6 sm:p-10 space-y-8 shadow-xs"
          >
            {/* Web Page Masthead */}
            <header className="space-y-4 border-b border-slate-200/80 dark:border-slate-800 pb-7">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {TOPIC_CATEGORY_META[activeTopic.category].labelAr} · {activeTopic.author}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-snug tracking-tight">
                {activeTopic.title}
              </h1>

              {activeTopic.subtitle && (
                <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeTopic.subtitle}
                </p>
              )}

              <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  نُشر: {activeTopic.publishedAt} · وقت القراءة المقدر: {activeTopic.readingTimeMinutes} دقائق
                </span>
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  💡 حدد أي كلمة أو انقر عليها مطولاً أو انسخها لعرض ترجمتها أو إضافتها للقاموس
                </span>
              </div>
            </header>

            {/* Primary Embedded Hero/Diagram Image if available */}
            {activeTopic.images.length > 0 && (
              <figure className="space-y-2.5">
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950">
                  <img
                    src={activeTopic.images[0].url}
                    alt={activeTopic.images[0].caption}
                    className="w-full max-h-[380px] object-contain mx-auto"
                  />
                </div>
                <figcaption className="text-xs text-slate-500 dark:text-slate-400 text-center">
                  {activeTopic.images[0].caption}
                </figcaption>
              </figure>
            )}

            {/* Clean Long-Form Sections (Zero ugly inline highlights or visual clutter) */}
            <div className="space-y-8">
              {activeTopic.sections.map((section, idx) => {
                const paragraphs = (section.paragraphs || [])
                  .map((p) => p.trim())
                  .filter(Boolean);

                return (
                  <section
                    key={section.id}
                    id={`topic-sec-${section.id}`}
                    className="space-y-4 scroll-mt-24"
                  >
                    {section.heading && (
                      <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white border-r-4 border-emerald-500 pr-3.5">
                        {idx + 1}. {section.heading}
                      </h2>
                    )}

                    <div className="space-y-4">
                      {paragraphs.map((para, pIdx) => (
                        <p
                          key={pIdx}
                          dir="auto"
                          className="text-base text-slate-800 dark:text-slate-200 leading-[1.95] selection:bg-emerald-500/25 selection:text-emerald-950 dark:selection:text-emerald-100"
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Additional Embedded Images (if more than 1) */}
            {activeTopic.images.length > 1 && (
              <section
                id="topic-gallery"
                className="pt-6 border-t border-slate-200/80 dark:border-slate-800 space-y-4"
              >
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  <span>الصور والأشكال التوضيحية المرفقة ({activeTopic.images.length - 1})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeTopic.images.slice(1).map((img) => (
                    <figure
                      key={img.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950"
                    >
                      <img
                        src={img.url}
                        alt={img.caption}
                        className="w-full h-48 object-cover"
                      />
                      <figcaption className="p-3 text-xs text-slate-600 dark:text-slate-400">
                        {img.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* Reference Links Section */}
            {activeTopic.links.length > 0 && (
              <section
                id="topic-links"
                className="pt-6 border-t border-slate-200/80 dark:border-slate-800 space-y-3"
              >
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-emerald-500" />
                  <span>الروابط والمراجع العلمية ({activeTopic.links.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeTopic.links.map((lnk) => (
                    <a
                      key={lnk.id}
                      href={lnk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500 transition-colors flex items-start justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {lnk.title}
                        </div>
                        {lnk.description && (
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {lnk.description}
                          </p>
                        )}
                        <div
                          dir="ltr"
                          className="text-[11px] font-mono text-slate-400 truncate text-left"
                        >
                          {lnk.url}
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Downloadable Attachments Section */}
            {activeTopic.attachments.length > 0 && (
              <section
                id="topic-attachments"
                className="pt-6 border-t border-slate-200/80 dark:border-slate-800 space-y-3"
              >
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-emerald-500" />
                  <span>الملفات والمستندات المرفقة للتحميل ({activeTopic.attachments.length})</span>
                </h3>
                <div className="space-y-2.5">
                  {activeTopic.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div
                            dir="ltr"
                            className="text-xs font-extrabold text-slate-900 dark:text-white truncate text-left"
                          >
                            {att.fileName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            الحجم: {att.fileSizeLabel} · النوع: {att.fileType}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تنزيل الملف</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>

          {/* QUIET MARGIN SIDEBAR (4 COLS): Table of Contents + Background Detected Lexicon */}
          <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-20">
            {/* 1. Table of Contents */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                فهرس أقسام الصفحة ({activeTopic.sections.length})
              </h3>
              <div className="space-y-1.5">
                {activeTopic.sections.map((sec, idx) => (
                  <a
                    key={sec.id}
                    href={`#topic-sec-${sec.id}`}
                    className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    {idx + 1}. {sec.heading || `القسم ${idx + 1}`}
                  </a>
                ))}
                {activeTopic.links.length > 0 && (
                  <a
                    href="#topic-links"
                    className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    • الروابط والمراجع ({activeTopic.links.length})
                  </a>
                )}
                {activeTopic.attachments.length > 0 && (
                  <a
                    href="#topic-attachments"
                    className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    • الملفات المرفقة ({activeTopic.attachments.length})
                  </a>
                )}
              </div>
            </div>

            {/* 2. Quietly Detected Dictionary Terms in this Post */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
                  المصطلحات المكتشفة تلقائياً ({detectedTerms.length})
                </h3>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  فهرس هادئ
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                اكتشف المحرك هذه المصطلحات داخل المقال دون تلوين النص للحفاظ على راحة القراءة. انقر على أي مصطلح لعرض ترجمته وشرحه وجمله السياقية:
              </p>

              {detectedTerms.length > 0 ? (
                <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                  {detectedTerms.map((dt) => (
                    <button
                      key={dt.id}
                      type="button"
                      onClick={() => {
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
                      className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 hover:border-emerald-500 border border-slate-200/80 dark:border-slate-800 text-right transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 break-words">
                          {dt.translation}
                        </div>
                        <div className="text-[11px] text-slate-500 break-words">
                          {dt.examples.length} جمل سياقية · {dt.definitionAr}
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
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 text-center">
                  حدد أي كلمة في النص لإضافتها فوراً إلى القاموس.
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ====================================================================
            SMART SELECTION / LONG-PRESS / COPY POPOVER CARD
            Appears cleanly when any word is selected or copied in the article
           ==================================================================== */}
        {selectionState && (
          <div className="fixed bottom-20 lg:bottom-6 inset-x-4 max-w-2xl mx-auto z-40 rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-500/60 shadow-2xl p-5 space-y-4">
            {selectionState.matchedTerm ? (
              /* CASE A: WORD ALREADY EXISTS IN DICTIONARY -> Show Translation, Explanation, and Contextual Sentences */
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                      مصطلح مسجل في القاموس · {selectionState.matchedTerm.category}
                      {selectionState.matchedTerm.umdCode
                        ? ` · ${selectionState.matchedTerm.umdCode}`
                        : ''}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h4
                        dir="ltr"
                        className="text-lg font-extrabold text-slate-900 dark:text-white"
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
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
                        title="نطق المصطلح"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectionState(null)}
                    className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 1. Approved Translation */}
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    الترجمة المعتمدة:
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                    {selectionState.matchedTerm.translation}
                  </span>
                </div>

                {/* 2. Explanation & Definition */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    الشرح والتعريف العلمي:
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectionState.matchedTerm.definitionAr}
                  </p>
                </div>

                {/* 3. Contextual Sentences of the Term */}
                {selectionState.matchedTerm.examples.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      الجمل السياقية الخاصة بالمصطلح ({selectionState.matchedTerm.examples.length}):
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1.5">
                      {selectionState.matchedTerm.examples.map((ex, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 space-y-0.5"
                        >
                          <p
                            dir="ltr"
                            className="text-xs font-medium text-slate-800 dark:text-slate-200 text-left"
                          >
                            {ex.en}
                          </p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">
                            {ex.ar}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-500" />
                        <span>إضافة جملة المقال إلى أمثلة هذا المصطلح</span>
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => onOpenTermDetail(selectionState.matchedTerm!.id)}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 mr-auto"
                  >
                    <span>فتح بطاقة المصطلح الكاملة</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            ) : (
              /* CASE B: SELECTED WORD IS NOT IN DICTIONARY -> Instant Translation + Quoted Sentence + Add to Dictionary */
              <form onSubmit={handleInstantSaveUnknownTerm} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block">
                      كلمة جديدة غير مسجلة في القاموس · إضافة فورية مع جملتها السياقية
                    </span>
                    <h4
                      dir="ltr"
                      className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5"
                    >
                      {selectionState.selectedText}
                    </h4>
                    {selectionState.morphologySummary && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                        تحليل الجذور التلقائي: {selectionState.morphologySummary}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleRefineUnknownWordWithGemini}
                      disabled={isRefiningWithAI}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {isRefiningWithAI ? 'جاري التحسين...' : 'ترجمة ذكية للسياق'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionState(null)}
                      className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      الكلمة / المصطلح:
                    </label>
                    <input
                      type="text"
                      dir="auto"
                      required
                      value={editableNewTerm}
                      onChange={(e) => setEditableNewTerm(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
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
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/50 text-xs font-bold text-emerald-700 dark:text-emerald-300"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>

                {/* Quoted Sentence from the Article */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    الجملة المقتبسة تلقائياً من المقال كمثال سياقي للمصطلح:
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    value={editableExampleEn}
                    onChange={(e) => setEditableExampleEn(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-left"
                  />
                  <input
                    type="text"
                    value={editableExampleAr}
                    onChange={(e) => setEditableExampleAr(e.target.value)}
                    placeholder="ترجمة الجملة السياقية..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-emerald-700 dark:text-emerald-300"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectionState(null)}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    إغلاق
                  </button>
                  <button
                    type="submit"
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة المصطلح وجملته إلى القاموس</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 1: TOPICS BROWSE & FILTER HUB (DEFAULT VIEW)
  // ============================================================================
  return (
    <div className="space-y-6 pb-12">
      {/* Header & Search + Publish CTA */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
        <div className="flex justify-between items-center gap-2">
          <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
            المقالات المعرفية
          </h1>

          <button
            type="button"
            onClick={openCreateTopicEditor}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 shrink-0"
          >
            <span>+ موضوع جديد</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في عناوين المواضيع، المحتوى النصي، أو المصطلحات المكتشفة داخل المقالات..."
            className="w-full pr-9 pl-8 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Interactive Category Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap no-scrollbar pb-0.5 w-full max-w-full">
          {(
            ['All', 'Medical', 'Technology', 'AI', 'History', 'General'] as const
          ).map((catKey) => {
            const IconComp = CATEGORY_ICON_MAP[catKey];
            const isActive = selectedCategory === catKey;
            const label = TOPIC_CATEGORY_META[catKey].labelAr;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500/50'
                }`}
              >
                <IconComp className="w-3 h-3 shrink-0" />
                <span>{label}</span>
                <span className="font-mono text-[10px] opacity-80">
                  ({categoryCounts[catKey]})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Topics Grid */}
      {filteredTopics.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full max-w-full">
          {filteredTopics.map((topic) => {
            const detected = detectedTermsByTopicId[topic.id] || [];
            const firstExcerpt =
              (topic.sections[0]?.paragraphs || []).join(' ').slice(0, 210) || '';

            return (
              <article
                key={topic.id}
                onClick={() => {
                  setSelectedTopicId(topic.id);
                  setSelectionState(null);
                  setViewMode('reader');
                }}
                className="group w-full max-w-full overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 hover:border-emerald-500/70 transition-all p-5 sm:p-6 flex flex-col justify-between gap-4 cursor-pointer shadow-xs"
              >
                <div className="space-y-3">
                  {/* Unboxed Static Metadata Row */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {TOPIC_CATEGORY_META[topic.category].labelAr}
                      </strong>{' '}
                      · {topic.publishedAt} ·{' '}
                      <Clock className="w-3 h-3 inline mb-0.5" />{' '}
                      {topic.readingTimeMinutes} دقائق قراءة
                    </span>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTopic(topic.id, e)}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-400"
                        title="حفظ في المفضلة"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            topic.favorite ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openEditTopicEditor(topic, e)}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500"
                        title="تعديل الموضوع"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTopic(topic.id)}
                        className="p-1.5 rounded-xl hover:bg-rose-500/10 text-slate-400 hover:text-rose-500"
                        title="حذف الموضوع"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Topic Title & Subtitle — No fixed height or clipping */}
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-relaxed break-words">
                    {topic.title}
                  </h2>

                  {topic.subtitle && (
                    <p
                      dir="auto"
                      className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed break-words"
                    >
                      {topic.subtitle}
                    </p>
                  )}

                  {/* Excerpt */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-words">
                    {firstExcerpt}...
                  </p>
                </div>

                {/* Footer: Media Summary + Detected Terms Count + Read CTA */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-slate-500 dark:text-slate-400">
                    {topic.sections.length} أقسام · {detected.length} مصطلح مكتشف
                    {topic.images.length > 0 ? ` · ${topic.images.length} صور` : ''}
                    {topic.links.length > 0 ? ` · ${topic.links.length} روابط` : ''}
                    {topic.attachments.length > 0
                      ? ` · ${topic.attachments.length} ملفات`
                      : ''}
                  </div>

                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>فتح الصفحة الكاملة</span>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-extrabold">
            لا توجد مواضيع مطابقة لبحثك الحالي
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            جرب تغيير التصنيف المختار أو انقر على زر كتابة ونشر موضوع جديد لإضافة مقالك الخاص.
          </p>
        </div>
      )}
    </div>
  );
};
