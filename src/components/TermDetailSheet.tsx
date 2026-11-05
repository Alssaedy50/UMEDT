import React, { useState, useMemo } from 'react';
import {
  Star,
  Volume2,
  Copy,
  Check,
  Edit3,
  ArrowRight,
  BookOpen,
  Network,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Plus,
  Sparkles,
  FileText,
  AlertTriangle
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  LexiconCategory,
  TermExample
} from '../types/lexicon';
import { runHybridGcNmtPipeline } from '../engine/hybridTranslator';

interface ConcordanceMatch {
  sourceTermId: string;
  sourceTerm: string;
  sourceTranslation: string;
  en: string;
  ar: string;
}

interface SuggestedRelation {
  relatedTermId: string;
  relatedTerm: string;
  relatedTranslation: string;
  sharedSentenceCount: number;
}

interface TermDetailSheetProps {
  activeDetailTerm: DictionaryTerm;
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  detailHistory: string[];
  categoryMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }> }
  >;
  speakingKey: string | null;
  copiedId: string | null;
  concordanceMatches: ConcordanceMatch[];
  suggestedRelations: SuggestedRelation[];
  onBack: () => void;
  onClose: () => void;
  onOpenTermDetail: (termId: string) => void;
  onToggleFavorite: (termId: string, e?: React.MouseEvent) => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
  onCopyToClipboard: (text: string, key: string, label?: string) => void;
  renderAutoLinkedText: (text: string, currentTermId?: string) => React.ReactNode;
  onGraphChipClick: (label: string) => void;
  onUpdateTerm: (updatedTerm: DictionaryTerm) => void;
  onDeleteTerm: (termId: string) => void;
  onAddSentenceToTerm: (termId: string, example: TermExample) => void;
  showToast: (message: string, type?: string) => void;
}

export const TermDetailSheet: React.FC<TermDetailSheetProps> = ({
  activeDetailTerm,
  terms,
  sentences,
  detailHistory,
  categoryMeta,
  speakingKey,
  copiedId,
  concordanceMatches,
  suggestedRelations,
  onBack,
  onClose,
  onOpenTermDetail,
  onToggleFavorite,
  onTriggerTTS,
  onCopyToClipboard,
  renderAutoLinkedText,
  onGraphChipClick,
  onUpdateTerm,
  onDeleteTerm,
  onAddSentenceToTerm,
  showToast
}) => {
  const [concordanceOpen, setConcordanceOpen] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);

  // Inline Quick Add Sentence for this Term
  const [isAddingSentence, setIsAddingSentence] = useState<boolean>(false);
  const [newSentEn, setNewSentEn] = useState<string>('');
  const [newSentAr, setNewSentAr] = useState<string>('');

  // Comprehensive Quick Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editDraft, setEditDraft] = useState<{
    term: string;
    translation: string;
    phonetic: string;
    pos: string;
    category: LexiconCategory;
    specialty: string;
    umdCode: string;
    definitionAr: string;
    definitionEn: string;
    clinicalNote: string;
    examples: TermExample[];
    synonymsText: string;
    broaderText: string;
    relatedText: string;
  } | null>(null);

  // Independent linked sentences from `sentences` that link to this term (excluding exact duplicates of internal examples)
  const linkedStandaloneSentences = useMemo(() => {
    const directExampleSet = new Set(
      (activeDetailTerm.examples || []).map((e) => e.en.trim().toLowerCase())
    );
    return sentences.filter(
      (s) =>
        (s.linkedTermIds || []).includes(activeDetailTerm.id) &&
        !directExampleSet.has(s.en.trim().toLowerCase())
    );
  }, [sentences, activeDetailTerm]);

  const openFullEditModal = () => {
    setEditDraft({
      term: activeDetailTerm.term,
      translation: activeDetailTerm.translation,
      phonetic: activeDetailTerm.phonetic || '',
      pos: activeDetailTerm.pos || 'Noun · اسم',
      category: activeDetailTerm.category,
      specialty: activeDetailTerm.specialty || '',
      umdCode: activeDetailTerm.umdCode || '',
      definitionAr: activeDetailTerm.definitionAr || '',
      definitionEn: activeDetailTerm.definitionEn || '',
      clinicalNote: activeDetailTerm.clinicalNote || '',
      examples:
        activeDetailTerm.examples.length > 0
          ? activeDetailTerm.examples.map((ex) => ({ ...ex }))
          : [{ en: '', ar: '' }],
      synonymsText: (activeDetailTerm.relations.synonyms || []).join(', '),
      broaderText: (activeDetailTerm.relations.broader || []).join(', '),
      relatedText: (activeDetailTerm.relations.related || []).join(', ')
    });
    setIsEditModalOpen(true);
  };

  const handleSaveFullEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;

    const cleanExamples = editDraft.examples
      .map((ex) => ({ en: ex.en.trim(), ar: ex.ar.trim() }))
      .filter((ex) => ex.en || ex.ar);

    const parseCsvList = (raw: string) =>
      Array.from(
        new Set(
          raw
            .split(/[,،]/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      );

    const updated: DictionaryTerm = {
      ...activeDetailTerm,
      term: editDraft.term.trim(),
      termNormalized: editDraft.term.trim().toLowerCase(),
      translation: editDraft.translation.trim(),
      phonetic: editDraft.phonetic.trim() || `/${editDraft.term.trim().toLowerCase()}/`,
      pos: editDraft.pos.trim() || 'Noun · اسم',
      category: editDraft.category,
      specialty: editDraft.specialty.trim() || undefined,
      umdCode: editDraft.umdCode.trim() || undefined,
      definitionAr: editDraft.definitionAr.trim(),
      definitionEn: editDraft.definitionEn.trim(),
      clinicalNote: editDraft.clinicalNote.trim() || undefined,
      examples: cleanExamples,
      relations: {
        synonyms: parseCsvList(editDraft.synonymsText),
        broader: parseCsvList(editDraft.broaderText),
        related: parseCsvList(editDraft.relatedText)
      }
    };

    onUpdateTerm(updated);
    setIsEditModalOpen(false);
    showToast(`تم حفظ كافة التعديلات على "${updated.term}" بنجاح`);
  };

  const handleAutoTranslateNewSentence = () => {
    if (!newSentEn.trim()) {
      showToast('اكتب الجملة الإنجليزية أولاً لتوليد ترجمتها السياقية', 'info');
      return;
    }
    const res = runHybridGcNmtPipeline(newSentEn, terms, sentences);
    setNewSentAr(res.layer4FinalOutputAr);
    showToast('تمت الترجمة السياقية للجملة عبر محرك GC-NMT');
  };

  const handleConfirmAddSentence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSentEn.trim() || !newSentAr.trim()) {
      showToast('يرجى إدخال الجملة الإنجليزية وترجمتها العربية', 'info');
      return;
    }
    onAddSentenceToTerm(activeDetailTerm.id, {
      en: newSentEn.trim(),
      ar: newSentAr.trim()
    });
    setNewSentEn('');
    setNewSentAr('');
    setIsAddingSentence(false);
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-2 shadow-2xl flex flex-col"
        >
          {/* Compact Top Action Bar */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {detailHistory.length > 1 && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>رجوع</span>
                </button>
              )}
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 break-words">
                {categoryMeta[activeDetailTerm.category]?.label}
                {activeDetailTerm.specialty ? ` · ${activeDetailTerm.specialty}` : ''}
                {activeDetailTerm.umdCode ? ` · ${activeDetailTerm.umdCode}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => onToggleFavorite(activeDetailTerm.id, e)}
                className={`p-2 rounded-lg transition-colors ${
                  activeDetailTerm.favorite
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="المفضلة"
              >
                <Star
                  className={`w-4 h-4 ${
                    activeDetailTerm.favorite ? 'fill-amber-400' : ''
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={openFullEditModal}
                className="px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
                title="تحرير"
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>تحرير</span>
              </button>

              <button
                type="button"
                onClick={() => setIsConfirmingDelete((prev) => !prev)}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="حذف المصطلح"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline Delete Confirmation */}
          {isConfirmingDelete && (
            <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>حذف &ldquo;{activeDetailTerm.term}&rdquo; نهائياً؟</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTerm(activeDetailTerm.id);
                    setIsConfirmingDelete(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                >
                  حذف
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-xs"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* Unified Sheet Content — Single Surface with Clean Dividers (Zero Nested Cards) */}
          <div className="px-5 py-4 divide-y divide-slate-200/75 dark:divide-slate-800/80">
            {/* 1. Term Header, Phonetic & Arabic Translation */}
            <div className="pb-4 space-y-2">
              <div
                dir="ltr"
                className="flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {activeDetailTerm.term}
                  </h1>
                  {activeDetailTerm.phonetic && (
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                      {activeDetailTerm.phonetic}
                    </span>
                  )}
                  {activeDetailTerm.pos && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      ({activeDetailTerm.pos})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerTTS(activeDetailTerm.term, `main-tts-${activeDetailTerm.id}`)
                    }
                    className={`p-1.5 rounded-lg transition-colors ${
                      speakingKey === `main-tts-${activeDetailTerm.id}`
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title="نطق المصطلح"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onCopyToClipboard(
                        `${activeDetailTerm.term} — ${activeDetailTerm.translation}`,
                        `trans-${activeDetailTerm.id}`,
                        'تم نسخ المصطلح وترجمته'
                      )
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="نسخ"
                  >
                    {copiedId === `trans-${activeDetailTerm.id}` ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {activeDetailTerm.translation}
              </div>
            </div>

            {/* 2. Explanation & Definition */}
            <div className="py-3.5 space-y-2">
              <p className="text-[13px] sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {renderAutoLinkedText(
                  activeDetailTerm.definitionAr,
                  activeDetailTerm.id
                )}
              </p>

              {activeDetailTerm.definitionEn && (
                <p
                  dir="ltr"
                  className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-left"
                >
                  {renderAutoLinkedText(
                    activeDetailTerm.definitionEn,
                    activeDetailTerm.id
                  )}
                </p>
              )}

              {activeDetailTerm.clinicalNote && (
                <p className="text-xs text-amber-700 dark:text-amber-300/90 border-r-2 border-amber-500 pr-2.5 leading-relaxed">
                  <strong className="font-semibold">ملاحظة: </strong>
                  {activeDetailTerm.clinicalNote}
                </p>
              )}

              {activeDetailTerm.morphology && (
                <div className="pt-1 flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    الجذور:
                  </span>
                  {activeDetailTerm.morphology.prefix && (
                    <span dir="ltr" className="font-mono">
                      {activeDetailTerm.morphology.prefix.affix} (
                      {activeDetailTerm.morphology.prefix.meaningAr}) +
                    </span>
                  )}
                  <span dir="ltr" className="font-mono text-emerald-600 dark:text-emerald-400">
                    {activeDetailTerm.morphology.root.affix} (
                    {activeDetailTerm.morphology.root.meaningAr})
                  </span>
                  {activeDetailTerm.morphology.suffix && (
                    <span dir="ltr" className="font-mono">
                      + {activeDetailTerm.morphology.suffix.affix} (
                      {activeDetailTerm.morphology.suffix.meaningAr})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 3. Contextual Sentences (Clean Divided Rows — No Boxes) */}
            <div className="py-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    الأمثلة والجمل السياقية (
                    {activeDetailTerm.examples.length +
                      linkedStandaloneSentences.length}
                    )
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setIsAddingSentence((v) => !v)}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة جملة</span>
                </button>
              </div>

              {isAddingSentence && (
                <form
                  onSubmit={handleConfirmAddSentence}
                  className="py-2.5 space-y-2 border-b border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">
                      جملة جديدة لـ {activeDetailTerm.term}
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoTranslateNewSentence}
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>ترجمة تلقائية</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    dir="ltr"
                    value={newSentEn}
                    onChange={(e) => setNewSentEn(e.target.value)}
                    placeholder={`Sentence with ${activeDetailTerm.term}...`}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs outline-none focus:border-emerald-500"
                    required
                  />
                  <input
                    type="text"
                    value={newSentAr}
                    onChange={(e) => setNewSentAr(e.target.value)}
                    placeholder="الترجمة العربية..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs outline-none focus:border-emerald-500"
                    required
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-bold"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSentence(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-500"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {activeDetailTerm.examples.map((ex, idx) => (
                  <div key={`direct-${idx}`} className="py-2.5 first:pt-0.5 last:pb-0.5 space-y-1">
                    <div
                      dir="ltr"
                      className="flex items-start justify-between gap-2 text-left"
                    >
                      <p className="text-[13px] text-slate-800 dark:text-slate-100 font-medium leading-relaxed flex-1">
                        {renderAutoLinkedText(ex.en, activeDetailTerm.id)}
                      </p>
                      <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerTTS(
                              ex.en,
                              `sheet-ex-${activeDetailTerm.id}-${idx}`
                            )
                          }
                          className="p-1 rounded text-slate-400 hover:text-emerald-500"
                          title="نطق"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onCopyToClipboard(
                              `${ex.en}\n${ex.ar}`,
                              `copy-ex-${activeDetailTerm.id}-${idx}`,
                              'تم نسخ الجملة'
                            )
                          }
                          className="p-1 rounded text-slate-400 hover:text-slate-200"
                          title="نسخ"
                        >
                          {copiedId === `copy-ex-${activeDetailTerm.id}-${idx}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300/95 leading-relaxed">
                      {ex.ar}
                    </p>
                  </div>
                ))}

                {linkedStandaloneSentences.map((sent, idx) => (
                  <div key={`sent-${sent.id}-${idx}`} className="py-2.5 space-y-1">
                    <div
                      dir="ltr"
                      className="flex items-start justify-between gap-2 text-left"
                    >
                      <p className="text-[13px] text-slate-800 dark:text-slate-100 font-medium leading-relaxed flex-1">
                        {renderAutoLinkedText(sent.en, activeDetailTerm.id)}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onTriggerTTS(sent.en, `sheet-sent-${sent.id}`)
                        }
                        className="p-1 rounded text-slate-400 hover:text-emerald-500 shrink-0 pt-0.5"
                        title="نطق"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300/95 leading-relaxed">
                      {sent.ar}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Related Terms & Concordance (Compact Inline Footer) */}
            <div className="pt-3.5 space-y-2.5">
              {(activeDetailTerm.relations.synonyms.length > 0 ||
                activeDetailTerm.relations.broader.length > 0 ||
                activeDetailTerm.relations.related.length > 0 ||
                suggestedRelations.length > 0) && (
                <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-xs">
                  <span className="text-slate-400 font-semibold flex items-center gap-1">
                    <Network className="w-3.5 h-3.5 text-emerald-500" />
                    <span>مرتبط بـ:</span>
                  </span>
                  {Array.from(
                    new Set([
                      ...activeDetailTerm.relations.synonyms,
                      ...activeDetailTerm.relations.broader,
                      ...activeDetailTerm.relations.related
                    ])
                  ).map((rel, idx) => (
                    <button
                      key={`rel-${rel}-${idx}`}
                      type="button"
                      onClick={() => onGraphChipClick(rel)}
                      dir="ltr"
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                    >
                      {rel}
                    </button>
                  ))}
                  {suggestedRelations.map((sug, idx) => (
                    <button
                      key={`sug-${sug.relatedTermId}-${idx}`}
                      type="button"
                      onClick={() => onOpenTermDetail(sug.relatedTermId)}
                      dir="ltr"
                      className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
                    >
                      {sug.relatedTerm}
                    </button>
                  ))}
                </div>
              )}

              {concordanceMatches.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setConcordanceOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <span>
                      مواضع الورود في مصطلحات أخرى ({concordanceMatches.length})
                    </span>
                    {concordanceOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {concordanceOpen && (
                    <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                      {concordanceMatches.map((m, idx) => (
                        <div
                          key={idx}
                          onClick={() => onOpenTermDetail(m.sourceTermId)}
                          className="py-2 cursor-pointer text-xs space-y-0.5"
                        >
                          <div
                            dir="ltr"
                            className="font-semibold text-emerald-600 dark:text-emerald-400 text-left"
                          >
                            {m.sourceTerm} ↗
                          </div>
                          <div dir="ltr" className="text-slate-600 dark:text-slate-300 text-left">
                            {m.en}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          COMPREHENSIVE EDIT MODAL (All DictionaryTerm Fields)
         ==================================================================== */}
      {isEditModalOpen && editDraft && (
        <div
          onClick={() => setIsEditModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveFullEdit}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold">
                تحرير شامل لبطاقة المصطلح ({editDraft.term})
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Row 1: Term & Translation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  المصطلح الإنجليزي:
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.term}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, term: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  الترجمة العربية المعتمدة (UMD):
                </label>
                <input
                  type="text"
                  value={editDraft.translation}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, translation: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                  required
                />
              </div>
            </div>

            {/* Row 2: Phonetic, POS, Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  النطق الصوتي (IPA):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.phonetic}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, phonetic: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  التصنيف النحوي (POS):
                </label>
                <input
                  type="text"
                  value={editDraft.pos}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, pos: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  الفئة المعجمية:
                </label>
                <select
                  value={editDraft.category}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      category: e.target.value as LexiconCategory
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="Medical">الطب السريري (Medical)</option>
                  <option value="AI">الذكاء الاصطناعي (AI)</option>
                  <option value="Programming">هندسة البرمجيات (Programming)</option>
                  <option value="General">معرفي وعام (General)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Specialty & UMD Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  التخصص الدقيق (Specialty):
                </label>
                <input
                  type="text"
                  value={editDraft.specialty}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, specialty: e.target.value })
                  }
                  placeholder="مثال: أمراض القلب والأوعية الدموية"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  كود المعجم الطبي الموحد (UMD Code):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.umdCode}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, umdCode: e.target.value })
                  }
                  placeholder="UMD-XXXX"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            {/* Row 4: Arabic & English Definitions + Clinical Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  التعريف العربي:
                </label>
                <textarea
                  rows={3}
                  value={editDraft.definitionAr}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, definitionAr: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  التعريف الإنجليزي:
                </label>
                <textarea
                  rows={3}
                  dir="ltr"
                  value={editDraft.definitionEn}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, definitionEn: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">
                الملاحظة السريرية (Clinical Note):
              </label>
              <input
                type="text"
                value={editDraft.clinicalNote}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, clinicalNote: e.target.value })
                }
                placeholder="ملاحظة تشخيصية أو دوائية إضافية..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            {/* Row 5: Contextual Examples Editor */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  الأمثلة السياقية ({editDraft.examples.length}):
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEditDraft({
                      ...editDraft,
                      examples: [...editDraft.examples, { en: '', ar: '' }]
                    })
                  }
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مثال</span>
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {editDraft.examples.map((ex, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-slate-400">
                        مثال #{i + 1}
                      </span>
                      {editDraft.examples.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditDraft({
                              ...editDraft,
                              examples: editDraft.examples.filter(
                                (_, idx) => idx !== i
                              )
                            })
                          }
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={ex.en}
                      onChange={(e) => {
                        const next = [...editDraft.examples];
                        next[i] = { ...next[i], en: e.target.value };
                        setEditDraft({ ...editDraft, examples: next });
                      }}
                      placeholder="English clinical example..."
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={ex.ar}
                      onChange={(e) => {
                        const next = [...editDraft.examples];
                        next[i] = { ...next[i], ar: e.target.value };
                        setEditDraft({ ...editDraft, examples: next });
                      }}
                      placeholder="الترجمة العربية للمثال..."
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Row 6: Knowledge Graph Relations */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  المرادفات (مفصولة بفاصلة):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.synonymsText}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, synonymsText: e.target.value })
                  }
                  placeholder="Synonym 1, Synonym 2"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  المفاهيم الأعم (Broader):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.broaderText}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, broaderText: e.target.value })
                  }
                  placeholder="Cardiology, Pathology"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 block mb-1">
                  المصطلحات المرتبطة (Related):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editDraft.relatedText}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, relatedText: e.target.value })
                  }
                  placeholder="Ischemia, Hypoxia"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold text-xs"
              >
                حفظ كافة التغييرات
              </button>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
