import React, { useState, useMemo, useEffect } from 'react';
import {
  Copy,
  Check,
  Plus,
  X,
  GitBranch,
  Volume2,
  Star,
  ArrowRight,
  ClipboardPaste
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  ClinicalAbbreviation,
  MorphologicalAffix
} from '../types/lexicon';
import { CLINICAL_ABBREVIATIONS } from '../data/medicalLexiconData';
import {
  HybridTranslationResult,
  MaskedEntityRecord,
  MorphologicalDecompositionResult,
  decomposeMedicalWord,
  resolveAbbreviationInContext,
  runHybridGcNmtPipeline,
  splitClinicalClausesSafely,
  formatClinicalNumbersAndUnits
} from '../engine/hybridTranslator';

interface ClinicalTranslatorViewProps {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  customAffixes?: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  clinicalInput: string;
  onClinicalInputChange: (val: string) => void;
  hybridTranslationOutput: HybridTranslationResult;
  copiedId: string | null;
  onCopyToClipboard: (text: string, key: string, label?: string) => void;
  onOpenTermDetail: (termId: string) => void;
  onSaveDecomposedTermToDictionary: (newTerm: DictionaryTerm) => void;
  onTriggerTTS?: (text: string, key: string, lang?: string) => void;
  onToggleFavoriteTerm?: (termId: string, e?: React.MouseEvent) => void;
  showToast: (message: string, type?: string) => void;
}

interface PopupWordDetailState {
  originalText: string;
  resolvedEn: string;
  translationAr: string;
  sourceLayer:
    | 'Layer 1: Aho-Corasick Lexicon'
    | 'Layer 1: Context Disambiguator'
    | 'Layer 2: Morphological Decomposer'
    | 'Instant Word Inspector';
  termId?: string;
  disambiguationNote?: string;
  morphologyNote?: string;
  contextSentenceEn: string;
  contextSentenceAr: string;
  decomposition: MorphologicalDecompositionResult;
}

export const ClinicalTranslatorView: React.FC<ClinicalTranslatorViewProps> = ({
  terms,
  sentences,
  customAffixes = [],
  customAbbreviations,
  clinicalInput,
  onClinicalInputChange,
  hybridTranslationOutput,
  copiedId,
  onCopyToClipboard,
  onOpenTermDetail,
  onSaveDecomposedTermToDictionary,
  onTriggerTTS,
  onToggleFavoriteTerm,
  showToast
}) => {
  const [popupDetail, setPopupDetail] = useState<PopupWordDetailState | null>(null);

  // Close popup on Escape key
  useEffect(() => {
    if (!popupDetail) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopupDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [popupDetail]);

  const allAbbreviations = useMemo(() => {
    const merged = [...customAbbreviations, ...CLINICAL_ABBREVIATIONS];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = item.abbr.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customAbbreviations]);

  const entityByPlaceholder = useMemo(() => {
    const map = new Map<string, MaskedEntityRecord>();
    for (const ent of hybridTranslationOutput.maskedEntities) {
      map.set(ent.placeholder, ent);
    }
    return map;
  }, [hybridTranslationOutput.maskedEntities]);

  // Find the active DictionaryTerm for the currently opened popup
  const popupMatchedTerm = useMemo(() => {
    if (!popupDetail) return null;
    if (popupDetail.termId) {
      const byId = terms.find((t) => t.id === popupDetail.termId);
      if (byId) return byId;
    }
    const cleanTarget = popupDetail.originalText.trim().toLowerCase();
    const cleanResolved = popupDetail.resolvedEn.trim().toLowerCase();
    return (
      terms.find(
        (t) =>
          t.term.toLowerCase() === cleanTarget ||
          t.term.toLowerCase() === cleanResolved ||
          (t.relations?.synonyms || []).some(
            (s) => s.toLowerCase() === cleanTarget
          )
      ) || null
    );
  }, [popupDetail, terms]);

  // Find the surrounding sentence in clinicalInput containing a given word/phrase
  const findSurroundingSentence = (targetText: string) => {
    const cleanTarget = targetText.trim().toLowerCase();
    const paragraphs = clinicalInput
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    let matchedClause = '';
    for (const para of paragraphs) {
      const clauses = splitClinicalClausesSafely(para);
      for (const cl of clauses) {
        if (cl.toLowerCase().includes(cleanTarget)) {
          matchedClause = cl.trim();
          break;
        }
      }
      if (matchedClause) break;
    }

    if (!matchedClause) {
      matchedClause = paragraphs[0] || clinicalInput.trim();
    }

    const clauseTranslation = matchedClause
      ? runHybridGcNmtPipeline(
          matchedClause,
          terms,
          sentences,
          customAffixes,
          customAbbreviations
        ).layer4FinalOutputAr
      : '';

    return {
      en: matchedClause,
      ar: clauseTranslation
    };
  };

  // Open popup for a detected MaskedEntityRecord
  const handleOpenEntityPopup = (entity: MaskedEntityRecord) => {
    const context = findSurroundingSentence(entity.originalText);
    const cleanWordForMorph = entity.originalText.includes('—')
      ? entity.originalText.split('—')[0].trim()
      : entity.originalText.trim();
    const decomp = decomposeMedicalWord(cleanWordForMorph, terms, customAffixes);

    setPopupDetail({
      originalText: entity.originalText,
      resolvedEn: entity.resolvedEn,
      translationAr: entity.translationAr,
      sourceLayer: entity.sourceLayer,
      termId: entity.termId,
      disambiguationNote: entity.disambiguationNote,
      morphologyNote: entity.morphologyNote,
      contextSentenceEn: context.en,
      contextSentenceAr: context.ar,
      decomposition: decomp
    });
  };

  // Open popup for any non-highlighted word clicked in the text
  const handleOpenPlainWordPopup = (rawWord: string) => {
    const cleanWord = rawWord.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    const matchedTerm = terms.find(
      (t) =>
        t.term.toLowerCase() === cleanWord.toLowerCase() ||
        (t.relations?.synonyms || []).some(
          (s) => s.toLowerCase() === cleanWord.toLowerCase()
        )
    );
    const context = findSurroundingSentence(cleanWord);
    const decomp = decomposeMedicalWord(cleanWord, terms, customAffixes);
    const abbrEntry =
      allAbbreviations.find(
        (a) => a.abbr.toLowerCase() === cleanWord.toLowerCase()
      ) || null;
    const abbrResolved = abbrEntry
      ? resolveAbbreviationInContext(cleanWord, context.en, customAbbreviations)
      : null;

    const translationAr = matchedTerm
      ? matchedTerm.translation
      : abbrResolved
      ? abbrResolved.translationAr
      : decomp.synthesizedAr;

    const resolvedEn = matchedTerm
      ? matchedTerm.term
      : abbrResolved
      ? `${cleanWord} — ${abbrResolved.expansionEn}`
      : cleanWord;

    setPopupDetail({
      originalText: cleanWord,
      resolvedEn,
      translationAr,
      sourceLayer: matchedTerm
        ? 'Layer 1: Aho-Corasick Lexicon'
        : abbrResolved
        ? 'Layer 1: Context Disambiguator'
        : decomp.confidence === 'High (Rule-Matched)'
        ? 'Layer 2: Morphological Decomposer'
        : 'Instant Word Inspector',
      termId: matchedTerm?.id,
      disambiguationNote: abbrResolved
        ? `السياق (${abbrResolved.specialty}): ${abbrResolved.matchedTriggers.join('، ')}`
        : undefined,
      morphologyNote:
        decomp.prefix || decomp.suffix || (decomp.roots && decomp.roots.length > 0)
          ? `${decomp.prefix ? decomp.prefix.affix + ' + ' : ''}${
              decomp.roots && decomp.roots.length > 0
                ? decomp.roots.map((r) => r.affix).join(' + ')
                : decomp.root?.affix || ''
            }${decomp.suffix ? ' + ' + decomp.suffix.affix : ''}`
          : undefined,
      contextSentenceEn: context.en,
      contextSentenceAr: context.ar,
      decomposition: decomp
    });
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          onClinicalInputChange(text);
          showToast('تم لصق النص وتلوين المصطلحات المكتشفة');
          return;
        }
      }
      showToast('انسخ النص أولاً ثم الصقه داخل المربع', 'info');
    } catch {
      showToast('اضغط مطولاً داخل المربع واختر "لصق"', 'info');
    }
  };

  const handleQuickSavePopupWord = () => {
    if (!popupDetail) return;
    const cleanTermName = popupDetail.originalText.trim();
    const cleanAr = popupDetail.translationAr.trim();
    if (!cleanTermName || !cleanAr) return;

    const decomp = popupDetail.decomposition;
    const newTerm: DictionaryTerm = {
      id: `tr-popup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      term: cleanTermName,
      termNormalized: cleanTermName.toLowerCase(),
      translation: cleanAr,
      phonetic: `/${cleanTermName.toLowerCase()}/`,
      pos:
        popupDetail.sourceLayer === 'Layer 1: Context Disambiguator'
          ? 'Abbreviation · اختصار سريري'
          : 'Noun · مصطلح طبي',
      category: 'Medical',
      specialty: 'بوابة المترجم',
      keepEnglish: true,
      favorite: false,
      collections: ['مستخرج من المترجم'],
      ingestedAt: 'الآن · بوابة المترجم',
      definitionAr: `${cleanAr} (${popupDetail.resolvedEn}): مصطلح طبي تم استخراجه وحفظه من بوابة المترجم.`,
      definitionEn: `Clinical term (${popupDetail.resolvedEn}) extracted from clinical text.`,
      morphology: decomp.root
        ? {
            prefix: decomp.prefix,
            root: decomp.root,
            suffix: decomp.suffix,
            literalSynthesisAr: decomp.synthesizedAr
          }
        : undefined,
      examples: popupDetail.contextSentenceEn
        ? [
            {
              en: popupDetail.contextSentenceEn,
              ar: popupDetail.contextSentenceAr
            }
          ]
        : [],
      relations: {
        synonyms:
          popupDetail.resolvedEn !== cleanTermName
            ? [popupDetail.resolvedEn.replace(/^[^—]+—\s*/, '').trim()]
            : [],
        broader: ['Clinical Translation'],
        related: []
      }
    };

    onSaveDecomposedTermToDictionary(newTerm);
    setPopupDetail((prev) => (prev ? { ...prev, termId: newTerm.id } : null));
  };

  const getEntityColorClasses = (
    sourceLayer: MaskedEntityRecord['sourceLayer'] | 'Instant Word Inspector'
  ) => {
    if (sourceLayer === 'Layer 1: Aho-Corasick Lexicon') {
      return 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/40';
    }
    if (sourceLayer === 'Layer 1: Context Disambiguator') {
      return 'bg-sky-500/15 hover:bg-sky-500/30 text-sky-800 dark:text-sky-300 border-sky-500/40';
    }
    return 'bg-amber-500/15 hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 border-amber-500/40';
  };

  const renderInteractiveHighlightedEnglish = () => {
    if (!clinicalInput.trim()) return null;

    const segments = hybridTranslationOutput.layer2MorphologyText.split(
      /(\[(?:MED|MORPH)_\d+\])/g
    );

    return segments.map((seg, idx) => {
      const entity = entityByPlaceholder.get(seg);
      if (entity) {
        const colorCls = getEntityColorClasses(entity.sourceLayer);
        return (
          <button
            key={`${seg}-${idx}`}
            type="button"
            onClick={() => handleOpenEntityPopup(entity)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 my-0.5 rounded-lg border font-extrabold text-[13px] transition-all cursor-pointer active:scale-95 ${colorCls}`}
          >
            <span>{entity.originalText}</span>
          </button>
        );
      }

      const subTokens = seg.split(/([A-Za-z][A-Za-z-]{2,})/g);
      return (
        <React.Fragment key={idx}>
          {subTokens.map((tok, subIdx) => {
            if (/^[A-Za-z][A-Za-z-]{2,}$/.test(tok)) {
              return (
                <span
                  key={subIdx}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenPlainWordPopup(tok)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenPlainWordPopup(tok);
                    }
                  }}
                  className="hover:bg-slate-200/70 dark:hover:bg-slate-800/80 hover:text-emerald-600 dark:hover:text-emerald-400 rounded px-0.5 transition-colors cursor-pointer"
                >
                  {tok}
                </span>
              );
            }
            return <span key={subIdx}>{tok}</span>;
          })}
        </React.Fragment>
      );
    });
  };

  const renderInteractiveHighlightedArabic = () => {
    const rawL3 = formatClinicalNumbersAndUnits(
      hybridTranslationOutput.layer3NmtStructuralAr
    );
    const segments = rawL3.split(/(\[(?:MED|MORPH)_\d+\])/g);

    return segments.map((seg, idx) => {
      const entity = entityByPlaceholder.get(seg);
      if (entity) {
        const colorCls = getEntityColorClasses(entity.sourceLayer);
        return (
          <button
            key={`ar-${seg}-${idx}`}
            type="button"
            onClick={() => handleOpenEntityPopup(entity)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 my-0.5 rounded-lg border font-bold text-xs sm:text-[13px] transition-all cursor-pointer active:scale-95 ${colorCls}`}
          >
            <span>{entity.translationAr}</span>
          </button>
        );
      }
      return <span key={`ar-txt-${idx}`}>{seg}</span>;
    });
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
        {/* 1. Pasting Input Area */}
        <div className="border-b border-slate-200/80 dark:border-slate-800">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              النص الطبي (الصق النص الطويل هنا)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-[11px] font-bold flex items-center gap-1 transition-colors"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>لصق</span>
              </button>

              {clinicalInput && (
                <button
                  type="button"
                  onClick={() => onClinicalInputChange('')}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="مسح النص"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={4}
            dir="ltr"
            value={clinicalInput}
            onChange={(e) => onClinicalInputChange(e.target.value)}
            placeholder="Paste or type clinical text here..."
            className="w-full p-3.5 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none resize-y leading-relaxed"
          />
        </div>

        {/* 2. Interactive Highlighted Text & Translation */}
        {clinicalInput.trim() ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200/80 dark:divide-slate-800">
            {/* Highlighted English Text */}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  الكلمات المكتشفة (انقر على أي كلمة ملونة للتفاصيل)
                </span>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {hybridTranslationOutput.maskedEntities.length} مصطلح مكتشف
                </span>
              </div>

              <div
                dir="ltr"
                className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200/70 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-100 leading-8 whitespace-pre-wrap text-left"
              >
                {renderInteractiveHighlightedEnglish()}
              </div>
            </div>

            {/* Highlighted Arabic Translation */}
            <div className="p-4 space-y-2 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.03]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  الترجمة العربية
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCopyToClipboard(
                      hybridTranslationOutput.layer4FinalOutputAr,
                      'copy-gcnmt',
                      'تم نسخ الترجمة'
                    )
                  }
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="نسخ الترجمة"
                >
                  {copiedId === 'copy-gcnmt' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 text-sm sm:text-[15px] font-medium text-slate-900 dark:text-slate-100 leading-8 whitespace-pre-wrap">
                {renderInteractiveHighlightedArabic()}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            الصق النص الطبي بالأعلى ليتم تلوين المصطلحات المكتشفة وعرض تفاصيلها عند النقر عليها.
          </div>
        )}
      </div>

      {/* ====================================================================
          3. DETECTED WORD DETAILS POPUP MENU (قائمة منبثقة لتفاصيل الكلمة)
         ==================================================================== */}
      {popupDetail && (
        <div
          onClick={() => setPopupDetail(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-700 p-5 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] sm:pb-5 space-y-3.5 shadow-2xl"
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto sm:hidden" />

            {/* Popup Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  dir="ltr"
                  className="text-lg font-extrabold text-slate-900 dark:text-white text-left"
                >
                  {popupDetail.resolvedEn}
                </h3>
                {popupMatchedTerm && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {popupMatchedTerm.pos} · {popupMatchedTerm.specialty || popupMatchedTerm.category}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onTriggerTTS && (
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerTTS(
                        popupMatchedTerm ? popupMatchedTerm.term : popupDetail.originalText,
                        `popup-tts-${popupDetail.originalText}`
                      )
                    }
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
                    title="نطق المصطلح"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}

                {popupMatchedTerm && onToggleFavoriteTerm && (
                  <button
                    type="button"
                    onClick={(e) => onToggleFavoriteTerm(popupMatchedTerm.id, e)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-amber-400"
                    title="المفضلة"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        popupMatchedTerm.favorite ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onCopyToClipboard(
                      `${popupDetail.resolvedEn} — ${
                        popupMatchedTerm ? popupMatchedTerm.translation : popupDetail.translationAr
                      }`,
                      `popup-copy-${popupDetail.originalText}`,
                      'تم النسخ'
                    )
                  }
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500"
                  title="نسخ"
                >
                  <Copy className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setPopupDetail(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Arabic Translation */}
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
              <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                {popupMatchedTerm ? popupMatchedTerm.translation : popupDetail.translationAr}
              </span>
              {popupMatchedTerm?.phonetic && (
                <span dir="ltr" className="text-xs font-mono text-slate-500">
                  {popupMatchedTerm.phonetic}
                </span>
              )}
            </div>

            {/* Definition */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                التعريف والشرح:
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {popupMatchedTerm
                  ? popupMatchedTerm.definitionAr
                  : popupDetail.disambiguationNote
                  ? `${popupDetail.translationAr} (${popupDetail.resolvedEn}) — ${popupDetail.disambiguationNote}`
                  : `${popupDetail.translationAr} — مصطلح طبي مركب تم تفكيكه من السياق.`}
              </p>
            </div>

            {/* Morphological Breakdown (only when present) */}
            {(popupDetail.decomposition.prefix ||
              popupDetail.decomposition.suffix ||
              (popupDetail.decomposition.roots &&
                popupDetail.decomposition.roots.length > 0)) && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>التحليل الصرفي:</span>
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">السابقة</span>
                    <span dir="ltr" className="font-mono font-bold block">
                      {popupDetail.decomposition.prefix?.affix || '—'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {popupDetail.decomposition.prefix?.meaningAr || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">الجذر</span>
                    <span dir="ltr" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                      {popupDetail.decomposition.root?.affix || '—'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {popupDetail.decomposition.root?.meaningAr || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">اللاحقة</span>
                    <span dir="ltr" className="font-mono font-bold block">
                      {popupDetail.decomposition.suffix?.affix || '—'}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {popupDetail.decomposition.suffix?.meaningAr || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Contextual Sentence */}
            {popupDetail.contextSentenceEn && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  الجملة في النص:
                </span>
                <p
                  dir="ltr"
                  className="text-xs text-slate-800 dark:text-slate-200 text-left leading-relaxed"
                >
                  {popupDetail.contextSentenceEn}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  {popupDetail.contextSentenceAr}
                </p>
              </div>
            )}

            {/* Action Button */}
            <div className="flex items-center justify-end gap-2 pt-1">
              {popupMatchedTerm ? (
                <button
                  type="button"
                  onClick={() => {
                    const id = popupMatchedTerm.id;
                    setPopupDetail(null);
                    onOpenTermDetail(id);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <span>فتح بطاقة المصطلح الكاملة</span>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickSavePopupWord}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>حفظ المصطلح في القاموس</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
