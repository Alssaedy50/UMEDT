import React, { useMemo, useState } from 'react';
import {
  Star,
  Brain,
  Volume2,
  ChevronDown,
  BookOpen,
  FileText,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  SpacedRepetitionData,
  TopicArticle
} from '../types/lexicon';

interface LibraryViewProps {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  studyStats: { gotIt: number; needsReview: number };
  activeCollection: string;
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
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  terms,
  sentences,
  studyStats,
  activeCollection,
  onOpenCollectionsMenu,
  onRecordSm2Review,
  onOpenTermDetail,
  onToggleFavoriteTerm,
  onToggleFavoriteSentence,
  onTriggerTTS
}) => {
  const [favoritesTab, setFavoritesTab] = useState<'terms' | 'sentences'>('terms');
  const [flashcardIdx, setFlashcardIdx] = useState<number>(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState<boolean>(false);

  const favoriteTerms = useMemo(() => {
    const allFavs = terms.filter((t) => t.favorite);
    if (activeCollection === 'الكل') return allFavs;
    return allFavs.filter((t) => (t.collections || []).includes(activeCollection));
  }, [terms, activeCollection]);

  const favoriteSentences = useMemo(
    () => sentences.filter((s) => s.favorite),
    [sentences]
  );

  const currentFlashcard = useMemo(() => {
    if (favoriteTerms.length === 0) return undefined;
    return favoriteTerms[flashcardIdx % favoriteTerms.length];
  }, [favoriteTerms, flashcardIdx]);

  const handleGradeFlashcard = (quality: number) => {
    if (!currentFlashcard) return;
    const prevSrs = currentFlashcard.srsData || {
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewAt: Date.now()
    };

    const knewIt = quality >= 3;
    const nextReps = knewIt ? prevSrs.repetitions + 1 : 0;
    const nextInterval = !knewIt
      ? 1
      : nextReps === 1
        ? 1
        : nextReps === 2
          ? 4
          : Math.max(1, Math.round(prevSrs.interval * prevSrs.easeFactor));
    const nextEase = Math.max(
      1.3,
      Number(
        (
          prevSrs.easeFactor +
          (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        ).toFixed(2)
      )
    );

    const updatedSrs: SpacedRepetitionData = {
      interval: nextInterval,
      easeFactor: nextEase,
      repetitions: nextReps,
      nextReviewAt: Date.now() + nextInterval * 24 * 60 * 60 * 1000
    };

    onRecordSm2Review('term', currentFlashcard.id, updatedSrs, knewIt);
    setFlashcardFlipped(false);
    setFlashcardIdx((prev) => prev + 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full overflow-x-clip box-border pb-8">
      {/* ====================================================================
          1. LIBRARY & STUDY SUMMARY METRICS
         ==================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              المصطلحات المحفوظة
            </span>
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {favoriteTerms.length.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              الجمل المحفوظة
            </span>
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {favoriteSentences.length.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              مراجعات متقنة
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {studyStats.gotIt.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              تحتاج مراجعة
            </span>
            <RotateCcw className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {studyStats.needsReview.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ====================================================================
          2. SPACED REPETITION (SM-2) FLASHCARDS
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              بطاقات المراجعة والاستذكار المتباعد (SM-2)
            </h2>
          </div>

          <button
            type="button"
            onClick={onOpenCollectionsMenu}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-200"
          >
            <span>المجموعة: {activeCollection}</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {currentFlashcard ? (
          <div className="max-w-xl mx-auto space-y-4">
            <div
              onClick={() => setFlashcardFlipped((f) => !f)}
              className="min-h-[210px] p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-3 select-none"
            >
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {flashcardFlipped
                  ? 'الوجه الخلفي · الترجمة والشرح السريري'
                  : 'الوجه الأمامي · انقر لقلب البطاقة'}
              </span>

              {!flashcardFlipped ? (
                <>
                  <h3
                    dir="ltr"
                    className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white break-words"
                  >
                    {currentFlashcard.term}
                  </h3>
                  <span dir="ltr" className="text-xs font-mono text-slate-500">
                    {currentFlashcard.phonetic}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerTTS(currentFlashcard.term, 'flash-tts');
                    }}
                    className="mt-1 min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>نطق المصطلح</span>
                  </button>
                </>
              ) : (
                <div className="space-y-2.5 max-w-md">
                  <div className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {currentFlashcard.translation}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {currentFlashcard.definitionAr}
                  </p>
                  {currentFlashcard.examples?.[0] && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1 text-right">
                      <p dir="ltr" className="text-slate-700 dark:text-slate-300 text-left">
                        {currentFlashcard.examples[0].en}
                      </p>
                      <p className="text-emerald-700 dark:text-emerald-300">
                        {currentFlashcard.examples[0].ar}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleGradeFlashcard(1)}
                className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 text-xs font-bold"
              >
                صعب · قريباً
              </button>
              <button
                type="button"
                onClick={() => handleGradeFlashcard(3)}
                className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold"
              >
                جيد · مراجعة قياسية
              </button>
              <button
                type="button"
                onClick={() => handleGradeFlashcard(5)}
                className="min-h-[44px] py-2.5 px-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold"
              >
                سهل · إتقان طويل
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-6">
            لا توجد مصطلحات مفضلة في هذه المجموعة حالياً. اضغط على نجمة المفضلة بجانب أي مصطلح لإضافته إلى بطاقات المراجعة.
          </p>
        )}
      </div>

      {/* ====================================================================
          3. SAVED FAVORITES LIST (Readable English + Arabic Cards)
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              قائمة المصطلحات والجمل المحفوظة في المفضلة
            </h3>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFavoritesTab('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                favoritesTab === 'terms'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              المصطلحات ({favoriteTerms.length})
            </button>
            <button
              type="button"
              onClick={() => setFavoritesTab('sentences')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                favoritesTab === 'sentences'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              الجمل السياقية ({favoriteSentences.length})
            </button>
          </div>
        </div>

        {favoritesTab === 'terms' ? (
          favoriteTerms.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoriteTerms.map((fav) => (
                <div
                  key={fav.id}
                  onClick={() => onOpenTermDetail(fav.id)}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/60 transition-all cursor-pointer flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div
                        dir="ltr"
                        className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-left break-words"
                      >
                        {fav.term}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        {fav.translation}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onTriggerTTS(fav.term, `fav-tts-${fav.id}`)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
                        title="نطق المصطلح"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTerm(fav.id, e)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-amber-500"
                        title="إزالة من المفضلة"
                      >
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-words">
                    {fav.definitionAr}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center">
              لا توجد مصطلحات محفوظة في المفضلة ضمن هذه المجموعة.
            </p>
          )
        ) : favoriteSentences.length > 0 ? (
          <div className="space-y-2.5">
            {favoriteSentences.map((sent) => (
              <div
                key={sent.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {sent.specialty}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTriggerTTS(sent.en, `fav-sent-${sent.id}`)}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onToggleFavoriteSentence(sent.id, e)}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-amber-400"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </button>
                  </div>
                </div>
                <p
                  dir="ltr"
                  className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 text-left leading-relaxed"
                >
                  {sent.en}
                </p>
                <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  {sent.ar}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-6 text-center">
            لا توجد جمل سريرية محفوظة في المفضلة حالياً.
          </p>
        )}
      </div>
    </div>
  );
};
